#!/usr/bin/env python3
"""Offline PSE delta package checks; never connects to hosting."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/pse-image-delta-package.py'
MODULE = runpy.run_path(str(SOURCE))
def sha(value):
    return hashlib.sha256(value).hexdigest()

class DeltaTest(unittest.TestCase):
    def test_exact_reuse_and_fallback(self):
        cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as place:
            os.chdir(place)
            try:
                root = Path('deploy/client/images')
                root.mkdir(parents=True)
                unchanged=b'real-original-image'
                modified=b'new-image'
                (root/'one.webp').write_bytes(unchanged)
                (root/'two.webp').write_bytes(modified)
                remote={'images':{
                    'one.webp':{'size':len(unchanged),'sha256':sha(unchanged)},
                    'two.webp':{'size':len(modified),'sha256':sha(b'different')}}}
                Path('.pse-remote-image-manifest.json').write_text(json.dumps(remote))
                MODULE['main']()
                result=json.loads(Path('deploy/pse-image-delta.json').read_text())
                self.assertEqual(result['reuse'],['one.webp'])
                self.assertFalse((root/'one.webp').exists())
                self.assertEqual((root/'two.webp').read_bytes(),modified)
                Path('deploy/pse-image-delta.json').unlink()
                Path('.pse-remote-image-manifest.json').unlink()
                MODULE['main']()
                self.assertFalse(Path('deploy/pse-image-delta.json').exists())
            finally:
                os.chdir(cwd)

    def test_oversized_marker_keeps_images_in_full_zip(self):
        cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as place:
            os.chdir(place)
            try:
                root = Path('deploy/client/images')
                root.mkdir(parents=True)
                original = b'retain-image-on-full-zip-fallback'
                (root / 'keep.webp').write_bytes(original)
                local = {
                    f'{i:04d}-' + 'x' * 205 + '.webp': {'size': 1, 'sha256': 'a' * 64}
                    for i in range(4300)
                }
                local['keep.webp'] = {'size': len(original), 'sha256': sha(original)}
                payload = json.dumps({'format': 1, 'files': local, 'reuse': list(local)},
                                     sort_keys=True, separators=(',', ':'))
                self.assertGreater(len(payload.encode('utf-8')), 1048576)
                Path('.pse-remote-image-manifest.json').write_text(
                    json.dumps({'images': local}), encoding='utf-8')
                with patch.dict(MODULE['main'].__globals__, {'collect_local': lambda _: local}):
                    MODULE['main']()
                self.assertEqual((root / 'keep.webp').read_bytes(), original)
                self.assertFalse(Path('deploy/pse-image-delta.json').exists())
            finally:
                os.chdir(cwd)

if __name__ == '__main__':
    unittest.main()
