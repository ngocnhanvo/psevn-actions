#!/usr/bin/env python3
"""Offline PSE signed ZIP compression/round-trip smoke; no Astro build or FTP.

The synthetic fixture is a format/integrity check, NOT a promised production
size/time improvement. Real benefit is measured on genuine signed releases.
"""
from __future__ import annotations

from pathlib import Path
import subprocess
import tempfile
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_WORKFLOW = ROOT / ".github" / "workflows" / "pse-production-deploy.yml"


class PseReleaseZipTest(unittest.TestCase):
    def test_measured_default_deflate_preserves_signed_release_integrity(self):
        workflow = PRODUCTION_WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("zip -q -6 -r ../upload/pse-astro.zip .", workflow)
        self.assertIn("PSE_RELEASE_ZIP_DEFLATE_LEVEL=6", workflow)
        self.assertIn("python3 ../actions-hub/scripts/pse-image-delta-package.py", workflow)
        self.assertIn("python3 ../actions-hub/scripts/pse-static-delta-package.py", workflow)
        self.assertIn("python3 actions-hub/scripts/pse-remote-unzip.py unpack", workflow)
        self.assertIn("z.read('sitemap.xml')!=z.read('client/sitemap.xml')", workflow)

        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            payloads = {
                "server/entry.mjs": (b"import { fn } from './module.mjs';\n"
                                     b"export const route = '/api/user/info';\n") * 4500,
                "client/index.html": b"<!doctype html><html><body>pse</body></html>",
                "client/_astro/app.js": (b"function fn(x){return x*2;}\n") * 4000,
                "pse-staging-build.json": b'{"branch":"master","commit":"example"}',
                "client/pse-image-delta.json": b'{"format":1,"reuse":[],"files":{}}',
            }
            dist = root / "release"
            dist.mkdir()
            for name, content in payloads.items():
                file = dist / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(content)
            sizes = {}
            for level in (6, 9):
                output = root / ("release-%s.zip" % level)
                subprocess.run(
                    ["zip", "-q", "-%s" % level, "-r", str(output), "."],
                    cwd=dist,
                    check=True,
                    timeout=20,
                )
                sizes[level] = output.stat().st_size
                with ZipFile(output) as archive:
                    names = {entry.filename for entry in archive.infolist() if not entry.is_dir()}
                    self.assertEqual(names, set(payloads))
                    self.assertNotIn(".env", names)
                    for name, content in payloads.items():
                        self.assertEqual(archive.read(name), content)
            self.assertLessEqual(sizes[9], sizes[6])
            print(
                "PSE_ZIP_COMPRESSION_OFFLINE=PASS level6_bytes=%d level9_bytes=%d "
                "no_build=true no_ftp=true" % (sizes[6], sizes[9])
            )


if __name__ == "__main__":
    unittest.main()
