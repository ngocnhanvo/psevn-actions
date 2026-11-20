#!/usr/bin/env python3
"""Offline static delta packager contract; no FTP, WordPress or Astro build."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/pse-static-delta-package.py"
MOD = runpy.run_path(str(SCRIPT))


def meta(data):
    return {"size": len(data), "sha256": hashlib.sha256(data).hexdigest()}


class StaticDeltaContract(unittest.TestCase):
    def test_reuse_changed_equal_size_and_fallback(self):
        previous = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            try:
                client = Path("deploy/client")
                (client / "_astro").mkdir(parents=True)
                (client / "about").mkdir()
                (client / "data").mkdir()
                (client / "images").mkdir()
                (client / "index.html").write_bytes(b"new-required-index")
                (client / "about/index.html").write_bytes(b"unchanged-html")
                (client / "_astro/a.js").write_bytes(b"unchanged-js")
                (client / "_astro/b.css").write_bytes(b"NEW-CSS")
                (client / "data/retained.json").write_bytes(b'{"v":1}')
                (client / "data/changed.json").write_bytes(b'{"v":2}')
                (client / "images/metadata.json").write_bytes(b'{"keep":true}')
                remote = {"static_scope": "exclude-images-v1", "static": {
                    "about/index.html": meta(b"unchanged-html"),
                    "_astro/a.js": meta(b"unchanged-js"),
                    "_astro/b.css": meta(b"OLD-CSS"),  # same size, different content
                    "data/retained.json": meta(b'{"v":1}'),
                    "data/changed.json": meta(b'{"v":1}'),  # JSON also same size, different content
                }}
                Path(".pse-remote-image-manifest.json").write_text(json.dumps(remote))
                MOD["main"]()
                marker = json.loads(Path("deploy/pse-static-delta.json").read_text())
                self.assertEqual(sorted(marker["reuse"]), ["_astro/a.js", "about/index.html", "data/retained.json"])
                self.assertEqual(len(marker["files"]), 5)
                self.assertNotIn("images/metadata.json", marker["files"])
                self.assertEqual((client / "images/metadata.json").read_bytes(), b'{"keep":true}')
                self.assertTrue((client / "index.html").exists())
                self.assertFalse((client / "about/index.html").exists())
                self.assertFalse((client / "_astro/a.js").exists())
                self.assertEqual((client / "_astro/b.css").read_bytes(), b"NEW-CSS")
                self.assertFalse((client / "data/retained.json").exists())
                self.assertEqual((client / "data/changed.json").read_bytes(), b'{"v":2}')

                Path("deploy/pse-static-delta.json").unlink()
                Path(".pse-remote-image-manifest.json").unlink()
                MOD["main"]()  # Full ZIP fallback without PHP inventory.
                self.assertFalse(Path("deploy/pse-static-delta.json").exists())
            finally:
                os.chdir(previous)


    def test_oversized_marker_keeps_static_files_in_full_zip(self):
        previous = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            try:
                client = Path("deploy/client")
                (client / "_astro").mkdir(parents=True)
                (client / "_astro/keep.js").write_bytes(b"full-zip-fallback")
                local = {
                    "_astro/" + f"{i:04d}-" + "x" * 205 + ".js": {
                        "size": 1, "sha256": "a" * 64
                    }
                    for i in range(4300)
                }
                local["_astro/keep.js"] = meta(b"full-zip-fallback")
                payload = json.dumps({"format": 1, "files": local, "reuse": list(local)},
                                     sort_keys=True, separators=(",", ":"))
                self.assertGreater(len(payload.encode("utf-8")), 1048576)
                Path(".pse-remote-image-manifest.json").write_text(
                    json.dumps({"static_scope": "exclude-images-v1", "static": local}), encoding="utf-8")
                with patch.dict(MOD["main"].__globals__, {"collect_local": lambda _: local}):
                    MOD["main"]()
                self.assertEqual((client / "_astro/keep.js").read_bytes(), b"full-zip-fallback")
                self.assertFalse(Path("deploy/pse-static-delta.json").exists())
            finally:
                os.chdir(previous)


    def test_legacy_php_static_inventory_uses_full_zip(self):
        previous = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            try:
                root = Path("deploy/client")
                (root / "_astro").mkdir(parents=True)
                (root / "_astro/old.js").write_bytes(b"unchanged")
                Path(".pse-remote-image-manifest.json").write_text(
                    json.dumps({"static": {"_astro/old.js": meta(b"unchanged")}}))
                MOD["main"]()
                self.assertTrue((root / "_astro/old.js").exists())
                self.assertFalse(Path("deploy/pse-static-delta.json").exists())
            finally:
                os.chdir(previous)

    def test_scope_and_unsafe_names(self):
        self.assertFalse(MOD["eligible"]("../escape.js"))
        self.assertFalse(MOD["eligible"]("../config.json"))
        self.assertFalse(MOD["eligible"]("server/entry.mjs"))
        self.assertFalse(MOD["eligible"]("index.html"))
        self.assertFalse(MOD["eligible"]("images/metadata.json"))
        self.assertFalse(MOD["eligible"]("images/subfolder/data.js"))
        self.assertFalse(MOD["eligible"]("foo//bar.css"))
        self.assertFalse(MOD["eligible"]("secret.env"))
        self.assertTrue(MOD["eligible"]("_astro/entry.a9Z-1.js"))
        self.assertTrue(MOD["eligible"]("about/index.html"))
        self.assertTrue(MOD["eligible"]("data/payload.json"))


if __name__ == "__main__":
    unittest.main()
