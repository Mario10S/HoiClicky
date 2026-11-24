"""Language limiting for speech recognition (fake Whisper model, no audio needed)."""
import sys, unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'speech'))
from langs import allowed_languages, transcribe_allowed


class FakeModel:
    """Guesses `guess` when no language is given; records every call."""
    def __init__(self, guess, probabilities):
        self.guess, self.probabilities, self.calls = guess, probabilities, []

    def transcribe(self, audio, language=None, **options):
        self.calls.append(language)
        info = SimpleNamespace(language=language or self.guess, all_language_probs=None if language else self.probabilities)
        return [SimpleNamespace(text=f' text in {language or self.guess} ')], info


class AllowedLanguagesTests(unittest.TestCase):
    def test_defaults_to_german_and_english(self):
        self.assertEqual(allowed_languages(''), ['de', 'en'])
        self.assertEqual(allowed_languages('xx,zz'), ['de', 'en'])

    def test_keeps_known_codes_in_order(self):
        self.assertEqual(allowed_languages('en, FR,de,en'), ['en', 'fr', 'de'])


class TranscribeAllowedTests(unittest.TestCase):
    def test_keeps_an_allowed_guess(self):
        model = FakeModel('de', [('de', 0.9), ('en', 0.05)])
        self.assertEqual(transcribe_allowed(model, b'', ['de', 'en']), ('text in de', 'de'))
        self.assertEqual(model.calls, [None])

    def test_redoes_a_foreign_guess_in_the_best_allowed_language(self):
        model = FakeModel('nl', [('nl', 0.55), ('de', 0.3), ('en', 0.1)])
        self.assertEqual(transcribe_allowed(model, b'', ['de', 'en']), ('text in de', 'de'))
        self.assertEqual(model.calls, [None, 'de'])

    def test_single_language_skips_detection(self):
        model = FakeModel('fr', [('fr', 0.9)])
        self.assertEqual(transcribe_allowed(model, b'', ['en']), ('text in en', 'en'))
        self.assertEqual(model.calls, ['en'])


if __name__ == '__main__':
    unittest.main()
