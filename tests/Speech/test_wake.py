"""Checks the wake word matcher and the speech segmenter (no microphone, no model needed).
Run: speech\\.venv\\Scripts\\python.exe -m unittest discover -s tests/Speech
"""
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'speech'))
from wake import match_wake, Segmenter, amplify


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
