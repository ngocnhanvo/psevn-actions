#!/usr/bin/env python3
"""Offline static delta packager contract; no FTP, WordPress or Astro build."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest

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
                (client / "index.html").write_bytes(b"new-required-index")
                (client / "about/index.html").write_bytes(b"unchanged-html")
                (client / "_astro/a.js").write_bytes(b"unchanged-js")
                (client / "_astro/b.css").write_bytes(b"NEW-CSS")
                (client / "data/retained.json").write_bytes(b'{"v":1}')
                (client / "data/changed.json").write_bytes(b'{"v":2}')
                remote = {"static": {
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

    def test_scope_and_unsafe_names(self):
        self.assertFalse(MOD["eligible"]("../escape.js"))
        self.assertFalse(MOD["eligible"]("../config.json"))
        self.assertFalse(MOD["eligible"]("server/entry.mjs"))
        self.assertFalse(MOD["eligible"]("index.html"))
        self.assertFalse(MOD["eligible"]("foo//bar.css"))
        self.assertFalse(MOD["eligible"]("secret.env"))
        self.assertTrue(MOD["eligible"]("_astro/entry.a9Z-1.js"))
        self.assertTrue(MOD["eligible"]("about/index.html"))
        self.assertTrue(MOD["eligible"]("data/payload.json"))


if __name__ == "__main__":
    unittest.main()
