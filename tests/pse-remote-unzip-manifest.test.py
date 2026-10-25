#!/usr/bin/env python3
"""Offline contract for PHP-signed public static inventory; never contacts WordPress."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "pse-remote-unzip.py"
spec = importlib.util.spec_from_file_location("pse_remote_unzip", SCRIPT)
unzip = importlib.util.module_from_spec(spec)
spec.loader.exec_module(unzip)

HASH = "a" * 64
META = {"size": 13, "sha256": HASH}
ENV = {
    "ENV_FILE": "WC_URL_CLIENT=https://example.test\nWC_URL=https://admin.example.test",
    "ASTRO_FTP_TARGET": "/domains/example.test/public_html/",
    "SOURCE_REPO_PAT": "x" * 40,
}


def check_manifest(static):
    """Exercise the real manifest path with a mocked, correctly signed response."""
    with tempfile.TemporaryDirectory() as tmp:
        original = os.getcwd()
        try:
            os.chdir(tmp)
            Path("source").mkdir()
            response = {
                "ok": True,
                "protocol": 2,
                "host": "example.test",
                "target": "/domains/example.test/public_html/",
                "images": {},
                "static": static,
            }
            with mock.patch.dict(os.environ, ENV, clear=True), \
                    mock.patch.object(sys, "argv", [str(SCRIPT), "manifest"]), \
                    mock.patch.object(unzip, "signed_post", return_value=response), \
                    contextlib.redirect_stdout(io.StringIO()):
                unzip.main()
            return json.loads(Path("source/.pse-remote-image-manifest.json").read_text())
        finally:
            os.chdir(original)


class PseSignedStaticJsonManifestTests(unittest.TestCase):
    def test_signed_public_json_retained_alongside_existing_types(self):
        remote = {
            "data/catalog.json": META,
            "index.json": META,
            "_astro/main.js": META,
            "assets/site.css": META,
            "catalog/page.html": META,
        }
        inventory = check_manifest(remote)
        self.assertEqual(inventory["static"], remote)
        self.assertEqual(inventory["images"], {})

    def test_unsafe_and_unsupported_names_still_rejected(self):
        for name in (
            "index.html", "../escape.json", "/absolute.json",
            "data//broken.json", "data/../escape.json",
            "bad.exe", "data/private.env", "data/unsafe?.json",
        ):
            with self.subTest(name=name):
                with self.assertRaisesRegex(RuntimeError, "Invalid signed static asset name|Invalid signed static asset digest"):
                    check_manifest({name: META})

    def test_invalid_json_digest_still_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "Invalid signed static asset digest"):
            check_manifest({"data/catalog.json": {"size": 13, "sha256": "wrong"}})


if __name__ == "__main__":
    unittest.main()
