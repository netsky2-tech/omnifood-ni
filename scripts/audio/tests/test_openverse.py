import argparse
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.audio import source_openverse as ov


class OpenverseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_safe_slug(self):
        self.assertEqual(ov._safe_slug("Deep Whoosh #1"), "deep-whoosh-1")
        self.assertEqual(ov._safe_slug("  "), "asset")

    def test_license_parser_rejects_non_free_licenses(self):
        self.assertEqual(ov._licenses("cc0,Pdm"), ("cc0", "pdm"))
        with self.assertRaises(argparse.ArgumentTypeError):
            ov._licenses("by")

    def test_manifest_defaults_and_upsert(self):
        path = self.root / "licenses.json"
        manifest = ov._load_manifest(path)
        self.assertEqual(manifest["assets"], [])
        assets = manifest["assets"]
        ov._upsert(assets, {"id": "1", "path": "a.mp3", "license": "cc0"})
        ov._upsert(assets, {"id": "1", "path": "b.mp3"})
        self.assertEqual(len(assets), 1)
        self.assertEqual(assets[0]["path"], "b.mp3")
        self.assertEqual(assets[0]["license"], "cc0")

    def test_search_filters_non_allowed_licenses(self):
        payload = json.dumps({
            "result_count": 2,
            "results": [
                {"id": "1", "license": "cc0", "url": "https://example.test/a.mp3"},
                {"id": "2", "license": "by", "url": "https://example.test/b.mp3"},
            ],
        }).encode()
        with mock.patch.object(ov, "_request", return_value=payload):
            data = ov.search("whoosh")
        self.assertEqual(len(data["results"]), 1)
        self.assertEqual(data["results"][0]["id"], "1")

    def test_fetch_dry_run_does_not_write(self):
        result = {
            "id": "asset-1",
            "title": "Deep Whoosh",
            "license": "cc0",
            "url": "https://example.test/a.mp3",
            "filetype": "mp3",
            "duration": 1200,
            "creator": "Tester",
            "foreign_landing_url": "https://example.test/source",
            "provider": "freesound",
        }
        with mock.patch.object(ov, "search", return_value={"count": 1, "results": [result]}):
            report = ov.fetch(
                "whoosh", "transition", 1, self.root / "sfx",
                self.root / "sfx/licenses.json", dry_run=True, delay=0,
            )
        self.assertEqual(report["downloaded"], 1)
        self.assertFalse((self.root / "sfx/licenses.json").exists())
        self.assertFalse((self.root / "sfx/transition").exists())

    def test_download_rejects_non_audio_payload(self):
        with mock.patch.object(ov, "_request", return_value=b"<html>not audio</html>"):
            with self.assertRaises(ov.OpenverseError):
                ov._download("https://example.test/a.mp3", self.root / "a.mp3")
        self.assertFalse((self.root / "a.mp3").exists())

    def test_index_adds_local_assets_once(self):
        library = self.root / "sfx"
        (library / "whoosh").mkdir(parents=True)
        (library / "whoosh" / "air.mp3").write_bytes(b"sound")
        manifest = library / "licenses.json"
        first = ov.index(library, manifest)
        second = ov.index(library, manifest)
        self.assertEqual(first["added"], 1)
        self.assertEqual(second["added"], 0)
        data = json.loads(manifest.read_text(encoding="utf-8"))
        self.assertEqual(data["assets"][0]["license"], "unknown")
        self.assertEqual(data["assets"][0]["path"], "whoosh/air.mp3")


if __name__ == "__main__":
    unittest.main()
