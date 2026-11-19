import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.audio import spec as audio_spec


def fake_uisfx(root: Path) -> None:
    manifest = {
        "packs": [{"name": "studio"}, {"name": "cinematic"}],
        "cues": [{"name": "press"}, {"name": "typing"}, {"name": "success"},
                 {"name": "purchase"}, {"name": "swipe"}, {"name": "drop"}],
        "assets": [
            {"pack": "studio", "cue": "press", "duration": 0.2, "defaultVolume": 0.2,
             "files": {"mp3": {"path": "sounds/studio/press.mp3"}}},
            {"pack": "studio", "cue": "swipe", "duration": 0.14, "defaultVolume": 0.14,
             "files": {"mp3": {"path": "sounds/studio/swipe.mp3"}}},
            {"pack": "cinematic", "cue": "drop", "duration": 0.5, "defaultVolume": 0.22,
             "files": {"mp3": {"path": "sounds/cinematic/drop.mp3"}}},
        ],
    }
    (root / "sounds/studio").mkdir(parents=True)
    (root / "sounds/cinematic").mkdir(parents=True)
    (root / "sounds/studio/press.mp3").write_bytes(b"")
    (root / "sounds/studio/swipe.mp3").write_bytes(b"")
    (root / "sounds/cinematic/drop.mp3").write_bytes(b"")
    (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


def base_spec(**overrides):
    spec = {
        "version": 1,
        "fps": 30,
        "sfx_cues": [
            {"cue_id": "click", "frame": 0, "kind": "click",
             "source": {"type": "uisfx", "cue": "press"}, "gain_db": -6},
            {"cue_id": "tone", "frame": 15, "kind": "tone",
             "source": {"type": "synth", "preset": "tone", "freq_hz": 880}},
        ],
    }
    spec.update(overrides)
    return spec


class SpecTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        fake_uisfx(self.root / "uisfx")
        self.env = mock.patch.dict(os.environ, {
            "NHILOS_UISFX_DIR": str(self.root / "uisfx"),
        })
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def write_spec(self, data):
        path = self.root / "spec.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def test_validates_and_emits_real_sfx_cues(self):
        spec = audio_spec.load_spec(self.write_spec(base_spec()), self.root)
        cues = audio_spec.to_real_sfx_cues(spec)["cues"]
        self.assertEqual(cues[0]["t"], 0.0)
        self.assertEqual(cues[0]["type"], "click")
        self.assertEqual(cues[0]["g"], 0.5012)
        self.assertEqual(cues[1]["t"], 0.5)
        self.assertEqual(cues[1]["type"], "chime")

    def test_resolves_uisfx_and_synth_sources(self):
        spec = audio_spec.load_spec(self.write_spec(base_spec()), self.root)
        click = audio_spec.resolve_cue_source(spec, spec["sfx_cues"][0])
        tone = audio_spec.resolve_cue_source(spec, spec["sfx_cues"][1])
        self.assertEqual(click["pack"], "studio")
        self.assertTrue(click["path"].endswith("press.mp3"))
        self.assertEqual(tone["preset"], "tone")
        self.assertEqual(tone["freq_hz"], 880)

    def test_rejects_duplicate_cue_ids(self):
        data = base_spec()
        data["sfx_cues"][1]["cue_id"] = "click"
        with self.assertRaises(audio_spec.AudioSpecError):
            audio_spec.load_spec(self.write_spec(data), self.root)

    def test_rejects_cue_without_time(self):
        data = base_spec()
        del data["sfx_cues"][0]["frame"]
        with self.assertRaises(audio_spec.AudioSpecError):
            audio_spec.load_spec(self.write_spec(data), self.root)

    def test_rejects_unknown_uisfx_cue(self):
        data = base_spec()
        data["sfx_cues"][0]["source"]["cue"] = "missing"
        spec = audio_spec.load_spec(self.write_spec(data), self.root)
        with self.assertRaises(audio_spec.AudioSpecError):
            audio_spec.resolve_cue_source(spec, spec["sfx_cues"][0])

    def test_resolves_openverse_manifest_entry(self):
        manifest = self.root / "assets/sfx/licenses.json"
        manifest.parent.mkdir(parents=True)
        asset = manifest.parent / "whoosh" / "air.mp3"
        asset.parent.mkdir()
        asset.write_bytes(b"")
        manifest.write_text(json.dumps({
            "schema_version": 1,
            "assets": [{
                "id": "ov-1",
                "query": "whoosh",
                "role": "transition",
                "path": "whoosh/air.mp3",
                "license": "cc0",
            }],
        }), encoding="utf-8")
        data = base_spec(sfx_cues=[{
            "cue_id": "whoosh",
            "time_s": 1.0,
            "kind": "whoosh",
            "source": {"type": "openverse", "query": "whoosh", "role": "transition"},
        }])
        spec = audio_spec.load_spec(self.write_spec(data), self.root)
        resolved = audio_spec.resolve_cue_source(spec, spec["sfx_cues"][0])
        self.assertEqual(resolved["path"], str(asset.resolve()))


if __name__ == "__main__":
    unittest.main()
