"""Hands-free wake word for HoiClicky ("Hey Clicky" / "Hoi Clicky").

Runs only while the user has turned the wake word on. Audio stays in RAM: short speech
segments are checked locally with a tiny Whisper model, and only after the wake word is the
following question recorded and transcribed. Nothing is written to disk or sent anywhere.

stdout: base64 event stream like recognize.py (ready, wake, level, loading, text, nothing, error).
stdin: "pause", "resume", "gain <factor>" or "quit".
"""
import base64, os, re, sys, threading, time
from pathlib import Path

ROOT = Path(__file__).parent
MAIN_MODEL = ROOT / 'model'
WAKE_MODEL = ROOT / 'model-wake'
RATE = 16000
BLOCK = 1600  # 100 ms
# Biases Whisper towards the spelling 'Clicky'. Do not put the whole phrase here: Whisper tends to drop prompt words from its output.
PROMPT = 'Clicky'

GREETING = r'(?:hey|hei|hej|he|hi|hai|hay|hoi|hoy|ahoi|oy|oi|heu|ey|eh|hallo|hello|ok(?:ay)?)'
NAME = r'(?:[ckg]l?[iyeu]+c?k+[iyeu]*|[ckg]l[iy]k+[iy]?|[ckg]li[ck]+(?:ie|ey|i|y|e)?|clicky|klicky|klicki)'
# The name on its own also counts when it opens the sentence, in case the greeting gets lost.
# It must end in an "ee" sound so ordinary words like "click" or "klicke" never match.
NAME_ALONE = r'(?:[ckg]l[iy]+c?k+(?:y|i|ie|ey)|cliquey|klicky|klicki|clicky)'
WAKE = re.compile(r'\b' + GREETING + r'\s*' + NAME + r'\b|\bhoi\s*clicky\b|\bheyclicky\b|\bhoiclicky\b|^(?:a |the |oh )?' + NAME_ALONE + r'\b', re.IGNORECASE)


def emit(kind, value=''):
    print(kind + ':' + base64.b64encode(str(value).encode('utf-8')).decode('ascii'), flush=True)


def gain_from_env():
    try:
        return min(8.0, max(0.5, float(os.environ.get('HOICLICKY_MIC_GAIN', '1'))))
    except ValueError:
        return 1.0


def amplify(block, gain):
    """Software microphone gain, clipped so loud speech does not wrap around."""
    return block if gain == 1.0 else (block * gain).clip(-1.0, 1.0)


def normalize(text):
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', ' ', text.lower())).strip()


def match_wake(text):
    """Return (found, remainder): remainder is what was said after the wake word."""
    clean = normalize(text)
    found = WAKE.search(clean)
    if not found:
        return False, ''
    return True, clean[found.end():].strip()


class Segmenter:
    """Energy based speech detector with an adaptive noise floor."""
    def __init__(self, end_silence_blocks, max_blocks, preroll_blocks=3):
        self.noise = 0.004
        self.end_silence = end_silence_blocks
        self.max_blocks = max_blocks
        self.preroll = []
        self.preroll_blocks = preroll_blocks
        self.reset()

    def reset(self):
        self.blocks, self.quiet, self.active = [], 0, False

    def threshold(self):
        return max(0.008, self.noise * 3.0)

    def feed(self, block, rms):
        """Feed one block; returns the finished segment (list of blocks) or None."""
        if not self.active:
            if rms > self.threshold():
                self.active, self.blocks, self.quiet = True, self.preroll + [block], 0
            else:
                self.noise = self.noise * 0.95 + rms * 0.05
                self.preroll = (self.preroll + [block])[-self.preroll_blocks:]
            return None
        self.blocks.append(block)
        self.quiet = self.quiet + 1 if rms <= self.threshold() else 0
        if self.quiet >= self.end_silence or len(self.blocks) >= self.max_blocks:
            done = self.blocks
            self.reset()
            self.preroll = []
            return done
        return None


def main():
    import numpy as np
    import sounddevice as sd
    from faster_whisper import WhisperModel
    language = os.environ.get('HOICLICKY_SPEECH_LANGUAGE', 'auto')
    language = None if language == 'auto' else language
    if not MAIN_MODEL.exists():
        raise RuntimeError('Local speech is not set up. Run speech/setup.ps1 first.')
    if not WAKE_MODEL.exists():
        emit('loading', 'Downloading the small wake word model (about 75 MB, once)')
        from faster_whisper.utils import download_model
        download_model('tiny', output_dir=str(WAKE_MODEL))
    wake_model = WhisperModel(str(WAKE_MODEL), device='cpu', compute_type='int8', local_files_only=True)
    main_model = None

    paused = threading.Event()
    quit_now = threading.Event()
    gain = [gain_from_env()]

    def commands():
        for line in sys.stdin:
            word = line.strip().lower()
            if word == 'pause':
                paused.set()
            elif word == 'resume':
                paused.clear()
            elif word.startswith('gain '):
                try:
                    gain[0] = min(8.0, max(0.5, float(word.split()[1])))
                except ValueError:
                    pass
            elif word == 'quit':
                quit_now.set()
                return
        quit_now.set()
    threading.Thread(target=commands, daemon=True).start()

    queue, lock = [], threading.Lock()

    def callback(data, frames, time_info, status):
        with lock:
            queue.append(amplify(data[:, 0].copy(), gain[0]))

    def blocks():
        while not quit_now.is_set():
            with lock:
                pending = queue[:]
                queue.clear()
            if not pending:
                time.sleep(0.03)
            for block in pending:
                yield block

    def transcribe(model, audio, **extra):
        segments, _ = model.transcribe(audio, language=language, beam_size=extra.pop('beam_size', 1),
            condition_on_previous_text=False, without_timestamps=True, **extra)
        return ' '.join(s.text.strip() for s in segments).strip()

    listener = Segmenter(end_silence_blocks=6, max_blocks=60)
    with sd.InputStream(samplerate=RATE, channels=1, dtype='float32', blocksize=BLOCK, callback=callback):
        emit('ready', 'Say "Hey Clicky"')
        stream = blocks()
        for block in stream:
            if paused.is_set():
                listener.reset()
                continue
            rms = float(np.sqrt(np.mean(block * block)))
            segment = listener.feed(block, rms)
            if segment is None:
                continue
            audio = np.concatenate(segment)
            if len(audio) < RATE * 0.4:
                continue
            heard = transcribe(wake_model, audio, initial_prompt=PROMPT)
            found, remainder = match_wake(heard)
            if not found:
                continue
            emit('wake', heard)
            if main_model is None:
                main_model = WhisperModel(str(MAIN_MODEL), device='cpu', compute_type='int8', local_files_only=True)
            if len(remainder.split()) >= 2:
                # The question came in the same breath: re-read the whole segment with the better model.
                emit('loading', 'Transcribing locally')
                full = transcribe(main_model, audio, beam_size=5, initial_prompt=PROMPT)
                _, question = match_wake(full)
                question = question or remainder
                emit('text', question)
                continue
            # Record the question that follows the wake word, until the user pauses.
            emit('listening', 'Listening')
            command = Segmenter(end_silence_blocks=12, max_blocks=250, preroll_blocks=2)
            command.noise = listener.noise
            started, waited, recorded = False, 0, None
            for next_block in stream:
                rms = float(np.sqrt(np.mean(next_block * next_block)))
                emit('level', min(100, int(rms * 700)))
                if not started:
                    started = rms > command.threshold()
                    waited += 1
                    if not started and waited > 50:
                        break  # nothing said within 5 seconds
                recorded = command.feed(next_block, rms)
                if recorded is not None:
                    break
            if not recorded:
                emit('nothing', 'No question heard')
                continue
            emit('loading', 'Transcribing locally')
            text = transcribe(main_model, np.concatenate(recorded), beam_size=5, vad_filter=True)
            emit('text' if text else 'nothing', text or 'No question heard')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit('error', error)
        sys.exit(1)
