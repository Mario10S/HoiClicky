"""Checks the wake word matcher and the speech segmenter (no microphone, no model needed).
Run: speech\\.venv\\Scripts\\python.exe -m unittest discover -s tests/Speech
"""
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'speech'))
from wake import match_wake, Segmenter, amplify, wake_words, wake_pattern, wake_prompt, record_question, pause_from_env


class WakeWordTests(unittest.TestCase):
    def test_recognizes_common_transcriptions(self):
        for heard in ['Hey Clicky.', 'Hoi Clicky!', 'hey, klicki', 'Hi Clicky', 'Hey Klicky', 'Hey Glicky', 'Hoi, Klicki?', 'Hallo Clicky', 'heyclicky', 'oy Clicky', 'Oi, Clicky', 'Ahoi Clicky']:
            self.assertTrue(match_wake(heard)[0], heard)

    def test_returns_the_question_after_the_wake_word(self):
        self.assertEqual(match_wake('Hey Clicky, was ist auf meinem Bildschirm?'), (True, 'was ist auf meinem bildschirm'))
        self.assertEqual(match_wake('Hoi Clicky')[1], '')

    def test_name_alone_counts_at_the_start(self):
        for heard in ['Clicky, wie spät ist es?', 'Klicki', 'Clicky!', 'Oh Clicky']:
            self.assertTrue(match_wake(heard)[0], heard)
        self.assertEqual(match_wake('Clicky wie spät ist es')[1], 'wie spät ist es')
        for heard in ['Klicke hier', 'Click the button', 'Ich mag Clicky nicht']:
            self.assertFalse(match_wake(heard)[0], heard)

    def test_ignores_ordinary_speech(self):
        for heard in ['Ich klicke hier drauf', 'hey wie geht es dir', 'click the button', 'Das ist ein Klick', 'Thanks for watching']:
            self.assertFalse(match_wake(heard)[0], heard)


class WakeWordChoiceTests(unittest.TestCase):
    def test_parses_presets_and_own_words(self):
        self.assertEqual(wake_words(''), ['clicky'])
        self.assertEqual(wake_words('Jarvis, clicky,friday,jarvis,no way!,x'), ['jarvis', 'clicky', 'friday'])
        self.assertEqual(wake_prompt(['clicky', 'jarvis', 'friday']), 'Names: Clicky, Jarvis, Friday.')

    def test_jarvis_and_its_misspellings(self):
        jarvis = wake_pattern(['jarvis'])
        for heard in ['Hey Jarvis', 'Hey Jarwis!', 'hey, Javis', 'Jarvis, wie spät ist es?', 'Hoi Dschawis', 'Hey Jervis', 'H. Arvis.', 'Hey Arvis']:
            self.assertTrue(match_wake(heard, jarvis)[0], heard)
        self.assertEqual(match_wake('Jarvis wie spät ist es', jarvis)[1], 'wie spät ist es')
        for heard in ['Ende des Jahres', 'hey Travis', 'Hey Clicky', 'Ich habe es vergessen', 'Arvis kommt', 'Er hat Hervis gekauft']:
            self.assertFalse(match_wake(heard, jarvis)[0], heard)

    def test_own_word_and_several_words(self):
        both = wake_pattern(['clicky', 'friday'])
        self.assertTrue(match_wake('Hey Friday, mach Musik an', both)[0])
        self.assertTrue(match_wake('Hoi Clicky', both)[0])
        self.assertFalse(match_wake('Am Friday gehe ich', both)[0])


class QuestionRecordingTests(unittest.TestCase):
    """10 blocks = 1 second of audio."""
    def blocks(self, *pattern):
        import numpy as np
        out = []
        for kind, count in pattern:
            out += [np.full(1600, 0.1 if kind == 'talk' else 0.001, dtype=np.float32)] * count
        return out

    def test_a_short_hesitation_does_not_end_the_question(self):
        stream = iter(self.blocks(('talk', 10), ('quiet', 10), ('talk', 10), ('quiet', 18)))
        recorded = record_question(stream, pause_blocks=18, noise=0.002)
        self.assertIsNotNone(recorded)
        self.assertEqual(sum(1 for b in recorded if b[0] > 0.05), 20, 'both parts of the question were kept')

    def test_continues_after_the_wake_word_segment(self):
        initial = self.blocks(('talk', 8), ('quiet', 6))
        stream = iter(self.blocks(('talk', 12), ('quiet', 18)))
        recorded = record_question(stream, pause_blocks=18, noise=0.002, initial=initial)
        self.assertEqual(sum(1 for b in recorded if b[0] > 0.05), 20)

    def test_ends_when_the_user_stays_quiet_after_a_one_breath_question(self):
        initial = self.blocks(('talk', 8), ('quiet', 6))
        stream = iter(self.blocks(('quiet', 30)))
        recorded = record_question(stream, pause_blocks=18, noise=0.002, initial=initial)
        self.assertEqual(len(recorded), 8 + 18, 'stopped after the pause, counting the silence already heard')

    def test_nothing_said_after_the_wake_word(self):
        self.assertIsNone(record_question(iter(self.blocks(('quiet', 80))), pause_blocks=18, noise=0.002, wait_blocks=60))

    def test_pause_setting_is_clamped(self):
        import os
        os.environ['HOICLICKY_SPEECH_PAUSE'] = '9'
        self.assertEqual(pause_from_env(), 5.0)
        os.environ['HOICLICKY_SPEECH_PAUSE'] = 'abc'
        self.assertEqual(pause_from_env(), 1.8)
        del os.environ['HOICLICKY_SPEECH_PAUSE']


class GainTests(unittest.TestCase):
    def test_amplifies_and_clips(self):
        import numpy as np
        block = np.array([0.1, -0.2, 0.6], dtype=np.float32)
        self.assertTrue(np.allclose(amplify(block, 2.0), [0.2, -0.4, 1.0]))
        self.assertIs(amplify(block, 1.0), block)


class SegmenterTests(unittest.TestCase):
    def test_cuts_a_segment_after_silence(self):
        seg = Segmenter(end_silence_blocks=3, max_blocks=50)
        for _ in range(5):
            self.assertIsNone(seg.feed('quiet', 0.002))
        for _ in range(4):
            self.assertIsNone(seg.feed('speech', 0.1))
        result = None
        for _ in range(3):
            result = seg.feed('quiet', 0.002)
        self.assertIsNotNone(result)
        self.assertEqual(result.count('speech'), 4)

    def test_caps_long_segments(self):
        seg = Segmenter(end_silence_blocks=3, max_blocks=5, preroll_blocks=0)
        results = [seg.feed('speech', 0.2) for _ in range(5)]
        self.assertIsNotNone(results[-1])


if __name__ == '__main__':
    unittest.main()
