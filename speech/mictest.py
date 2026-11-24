"""Microphone test for HoiClicky: live level, optional live monitoring and live transcription.

Started only from Settings while the user runs the test. Audio stays in RAM and is never saved.
stdout: base64 events: ready, level (0-100), threshold (0-100), partial, text, wake, error.
stdin: "gain <factor>", "monitor on|off" or "quit".
"""
import base64, os, sys, threading, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from wake import Segmenter, match_wake, amplify, gain_from_env, emit, RATE, BLOCK, PROMPT, WAKE_MODEL


def level(rms):
    return min(100, int(rms * 700))


def main():
    import numpy as np
    import sounddevice as sd
    from faster_whisper import WhisperModel
    language = os.environ.get('HOICLICKY_SPEECH_LANGUAGE', 'auto')
    language = None if language == 'auto' else language
    if not WAKE_MODEL.exists():
        emit('loading', 'Downloading the small speech model (about 75 MB, once)')
        from faster_whisper.utils import download_model
        download_model('tiny', output_dir=str(WAKE_MODEL))
    model = WhisperModel(str(WAKE_MODEL), device='cpu', compute_type='int8', local_files_only=True)

    gain = [gain_from_env()]
    monitor = [os.environ.get('HOICLICKY_MIC_MONITOR') == '1']
    quit_now = threading.Event()

    def commands():
        for line in sys.stdin:
            word = line.strip().lower()
            if word.startswith('gain '):
                try:
                    gain[0] = min(8.0, max(0.5, float(word.split()[1])))
                except ValueError:
                    pass
            elif word == 'monitor on':
                monitor[0] = True
            elif word == 'monitor off':
                monitor[0] = False
            elif word == 'quit':
                break
        quit_now.set()
    threading.Thread(target=commands, daemon=True).start()

    queue, lock = [], threading.Lock()

    def callback(indata, outdata, frames, time_info, status):
        block = amplify(indata[:, 0].copy(), gain[0])
        # Hear yourself: the amplified microphone goes straight back out (headphones recommended).
        outdata[:, 0] = block if monitor[0] else 0
        with lock:
            queue.append(block)

    def transcribe(audio):
        segments, _ = model.transcribe(audio, language=language, beam_size=1, condition_on_previous_text=False,
            without_timestamps=True, initial_prompt=PROMPT)
        return ' '.join(s.text.strip() for s in segments).strip()

    segmenter = Segmenter(end_silence_blocks=6, max_blocks=80)
    last_partial, last_threshold = 0.0, -1
    with sd.Stream(samplerate=RATE, channels=1, dtype='float32', blocksize=BLOCK, callback=callback):
        emit('ready', 'Speak into your microphone')
        while not quit_now.is_set():
            with lock:
                pending = queue[:]
                queue.clear()
            if not pending:
                time.sleep(0.03)
                continue
            for block in pending:
                rms = float(np.sqrt(np.mean(block * block)))
                emit('level', level(rms))
                threshold = level(segmenter.threshold())
                if threshold != last_threshold:
                    emit('threshold', threshold)
                    last_threshold = threshold
                done = segmenter.feed(block, rms)
                if done is not None:
                    audio = np.concatenate(done)
                    if len(audio) >= RATE * 0.3:
                        text = transcribe(audio)
                        if text:
                            emit('text', text)
                            if match_wake(text)[0]:
                                emit('wake', text)
                    last_partial = time.time()
            # While someone is still talking, show what has been understood so far.
            if segmenter.active and len(segmenter.blocks) >= 8 and time.time() - last_partial > 0.9:
                last_partial = time.time()
                text = transcribe(np.concatenate(segmenter.blocks))
                if text:
                    emit('partial', text)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit('error', error)
        sys.exit(1)
