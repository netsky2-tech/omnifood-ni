import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.audio import mixer, qa
from scripts.audio import spec as audio_spec


class MixerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.ffmpeg = audio_spec.resolve_ffmpeg()
        except audio_spec.AudioSpecError as exc:
            raise unittest.SkipTest(str(exc))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.uisfx = self.root / "uisfx"
        self._make_uisfx()
        self.env = mock.patch.dict(os.environ, {"NHILOS_UISFX_DIR": str(self.uisfx)})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def _ffmpeg(self, *args):
        subprocess.run([str(self.ffmpeg), "-y", *args], check=True,
                       capture_output=True, text=True)

    def _make_uisfx(self):
        (self.uisfx / "sounds/studio").mkdir(parents=True)
        press = self.uisfx / "sounds/studio/press.mp3"
        self._ffmpeg("-f", "lavfi", "-i", "sine=frequency=1000:duration=0.12",
                     "-c:a", "libmp3lame", "-b:a", "128k", str(press))
        manifest = {
            "packs": [{"name": "studio"}],
            "cues": [{"name": "press"}],
            "assets": [{
                "pack": "studio", "cue": "press", "duration": 0.12,
                "defaultVolume": 0.2,
                "files": {"mp3": {"path": "sounds/studio/press.mp3"}},
            }],
        }
        (self.uisfx / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    def test_music_bed_loops_and_ducks_under_voice(self):
        voice = self.root / "voice.wav"
        music = self.root / "music.wav"
        self._ffmpeg("-f", "lavfi", "-i", "sine=frequency=220:duration=3",
                     "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(voice))
        self._ffmpeg("-f", "lavfi", "-i", "sine=frequency=330:duration=0.5",
                     "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(music))
        spec_data = {
            "fps": 30,
            "voice_track": "voice.wav",
            "output": "out.wav",
            "loudness": {"target_lufs": -14, "true_peak_db": -1, "lra": 6},
            "music_bed": {
                "path": "music.wav",
                "gain_db": -18,
                "loop": True,
                "ducking": {"threshold_db": -30, "ratio": 4,
                            "attack_ms": 20, "release_ms": 250},
            },
            "sfx_cues": [],
        }
        spec_path = self.root / "spec.json"
        spec_path.write_text(json.dumps(spec_data), encoding="utf-8")
        spec = audio_spec.load_spec(spec_path, self.root)

        out = self.root / "out.wav"
        result = mixer.build_mix(spec, out_path=str(out),
                                 work_dir=str(self.root / "work"), keep_work=True)

        self.assertTrue(out.is_file())
        self.assertEqual(result["cues"], 0)
        self.assertIsNotNone(result["music"])
        self.assertEqual(Path(result["music"]).name, "music_ducked.wav")
        self.assertAlmostEqual(result["duration_s"], 3.0, places=1)
        loudness = result["loudness_after"]
        self.assertLessEqual(abs(loudness["integrated_lufs"] + 14), 2.0)

    def test_rejects_looping_music_without_any_duration(self):
        music = self.root / "music.wav"
        self._ffmpeg("-f", "lavfi", "-i", "sine=frequency=330:duration=0.5",
                     "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(music))
        spec_data = {
            "fps": 30,
            "output": "out.wav",
            "loudness": {"target_lufs": -14, "true_peak_db": -1, "lra": 6},
            "music_bed": {"path": "music.wav", "loop": True},
            "sfx_cues": [],
        }
        spec_path = self.root / "spec.json"
        spec_path.write_text(json.dumps(spec_data), encoding="utf-8")
        spec = audio_spec.load_spec(spec_path, self.root)

        with self.assertRaises(audio_spec.AudioSpecError):
            mixer.build_mix(spec, out_path=str(self.root / "out.wav"))

    def test_lossy_output_leaves_true_peak_headroom(self):
        video = self.root / "video.mp4"
        voice = self.root / "voice.wav"
        self._ffmpeg("-f", "lavfi", "-i", "color=c=black:s=160x120:d=4:r=30",
                     "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video))
        self._ffmpeg("-f", "lavfi", "-i", "sine=frequency=220:duration=4",
                     "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(voice))
        spec_data = {
            "fps": 30,
            "video": "video.mp4",
            "voice_track": "voice.wav",
            "output": "out.mp4",
            "loudness": {"target_lufs": -14, "true_peak_db": -1, "lra": 6},
            "sfx_cues": [],
        }
        spec_path = self.root / "spec.json"
        spec_path.write_text(json.dumps(spec_data), encoding="utf-8")
        spec = audio_spec.load_spec(spec_path, self.root)

        out = self.root / "out.mp4"
        result = mixer.build_mix(spec, out_path=str(out),
                                 work_dir=str(self.root / "work"), keep_work=True)

        self.assertTrue(out.is_file())
        self.assertEqual(result["normalize_target"]["true_peak_db"], -1.5)
        measured = qa.measure_loudness(out)
        self.assertLessEqual(measured["true_peak_dbfs"], -1.0)
        self.assertLessEqual(abs(measured["integrated_lufs"] + 14), 1.5)

    def test_mixes_and_normalizes_to_target_loudness(self):
        voice = self.root / "voice.wav"
        self._ffmpeg("-f", "lavfi", "-i", "sine=frequency=220:duration=3",
                     "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(voice))
        spec_data = {
            "fps": 30,
            "voice_track": "voice.wav",
            "output": "out.wav",
            "loudness": {"target_lufs": -14, "true_peak_db": -1, "lra": 6},
            "sfx_cues": [
                {"cue_id": "click", "time_s": 0.5, "kind": "click",
                 "source": {"type": "uisfx", "cue": "press"}, "gain_db": -6},
                {"cue_id": "tone", "time_s": 1.5, "kind": "tone",
                 "source": {"type": "synth", "preset": "tone",
                            "freq_hz": 880, "duration_s": 0.2},
                 "gain_db": -12},
            ],
        }
        spec_path = self.root / "spec.json"
        spec_path.write_text(json.dumps(spec_data), encoding="utf-8")
        spec = audio_spec.load_spec(spec_path, self.root)

        out = self.root / "out.wav"
        result = mixer.build_mix(spec, out_path=str(out),
                                 work_dir=str(self.root / "work"), keep_work=True)

        self.assertTrue(out.is_file())
        self.assertEqual(result["cues"], 2)
        loudness = result["loudness_after"]
        self.assertIsNotNone(loudness["integrated_lufs"])
        self.assertLessEqual(abs(loudness["integrated_lufs"] + 14), 2.0)

        measured = qa.measure_loudness(out)
        self.assertIsNotNone(measured["integrated_lufs"])
        self.assertIsNotNone(measured["true_peak_dbfs"])
        self.assertLessEqual(measured["true_peak_dbfs"], 0.0)
        self.assertIsInstance(qa.detect_silence(out, noise_db=-35, min_duration=0.2), list)


if __name__ == "__main__":
    unittest.main()
