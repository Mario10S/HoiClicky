"""Local microphone transcription. Audio stays in RAM; stdout is a base64 event stream."""
import base64, os, sys, threading
from pathlib import Path

def emit(kind, value):
    print(kind + ':' + base64.b64encode(str(value).encode('utf-8')).decode('ascii'), flush=True)

def main():
    import numpy as np
    import sounddevice as sd
    model_dir = Path(__file__).parent / 'model'
    if not model_dir.exists():
        raise RuntimeError('Whisper is not set up. Run speech/setup.ps1 from the project folder.')
    stop = threading.Event()
    threading.Thread(target=lambda: (sys.stdin.readline(), stop.set()), daemon=True).start()
    chunks = []
    def callback(data, frames, time, status):
        chunks.append(data[:, 0].copy())
        emit('level', min(100, int(np.sqrt(np.mean(data * data)) * 700)))
    if stop.is_set():
        return
    with sd.InputStream(samplerate=16000, channels=1, dtype='float32', blocksize=1600, callback=callback):
        emit('ready', 'Listening with local Whisper')
        stop.wait(60)
    emit('loading', 'Transcribing locally')
    if not chunks:
        return
    audio = np.concatenate(chunks)
    if len(audio) < 4000 or float(np.sqrt(np.mean(audio * audio))) < .001:
        emit('error', 'No clear speech detected. Check the selected Windows microphone.')
        return
    language = os.environ.get('HOICLICKY_SPEECH_LANGUAGE', 'en')
    from faster_whisper import WhisperModel
    model = WhisperModel(str(model_dir), device='cpu', compute_type='int8', local_files_only=True)
    segments, _ = model.transcribe(audio, language=None if language == 'auto' else language,
        beam_size=5, vad_filter=True, condition_on_previous_text=False)
    text = ' '.join(segment.text.strip() for segment in segments).strip()
    emit('text' if text else 'error', text or 'No speech detected. Try speaking closer to the microphone.')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit('error', error)
        sys.exit(1)
