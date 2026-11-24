"""Which languages HoiClicky listens for, and transcription limited to them.

The user picks their languages in Settings (default German and English). Whisper may still guess
another language for a short or accented sentence; then the audio is transcribed again in the most
likely allowed language. Single foreign words inside a German or English sentence still come through.
"""
import os

# Languages offered in Settings (Whisper codes).
SUPPORTED = ['de', 'en', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'tr', 'sq', 'hr', 'sr', 'bs', 'ru', 'uk', 'ar']
DEFAULT = ['de', 'en']


def allowed_languages(value=None):
    """Parse HOICLICKY_SPEECH_LANGUAGES ("de,en"); unknown codes are dropped, empty means the default."""
    raw = os.environ.get('HOICLICKY_SPEECH_LANGUAGES', '') if value is None else value
    picked = [code.strip().lower() for code in raw.split(',') if code.strip().lower() in SUPPORTED]
    return list(dict.fromkeys(picked)) or list(DEFAULT)


def join_text(segments):
    return ' '.join(segment.text.strip() for segment in segments).strip()


def transcribe_allowed(model, audio, allowed, **options):
    """Transcribe audio in one of the allowed languages. Returns (text, language)."""
    if len(allowed) == 1:
        segments, _ = model.transcribe(audio, language=allowed[0], **options)
        return join_text(segments), allowed[0]
    segments, info = model.transcribe(audio, language=None, **options)
    if info.language in allowed:
        return join_text(segments), info.language
    # Whisper guessed a language the user does not speak: redo it in the most likely allowed one.
    probabilities = dict(info.all_language_probs or [])
    best = max(allowed, key=lambda code: probabilities.get(code, 0.0))
    segments, _ = model.transcribe(audio, language=best, **options)
    return join_text(segments), best
