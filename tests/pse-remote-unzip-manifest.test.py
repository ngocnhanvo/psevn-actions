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


def check_manifest(static, scope=None):
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
            if scope is not None:
                response["static_scope"] = scope
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


    def test_new_php_scope_passes_only_when_image_metadata_is_excluded(self):
        inventory = check_manifest({"_astro/main.js": META}, "exclude-images-v1")
        self.assertEqual(inventory["static_scope"], "exclude-images-v1")
        with self.assertRaisesRegex(RuntimeError, "unexpectedly includes images"):
            check_manifest({"images/metadata.json": META}, "exclude-images-v1")
        with self.assertRaisesRegex(RuntimeError, "Unsupported signed static inventory scope"):
            check_manifest({"_astro/main.js": META}, "unknown-scope")

    def test_signed_media_v2_allows_only_safe_public_media(self):
        files = {
            "_astro/main.js": META,
            "fonts/site.woff2": META,
            "home-first/banner.webp": META,
            "logo-first/logo.svg": META,
            "tool/favicon.ico": META,
        }
        inventory = check_manifest(files, "exclude-images-v2-media")
        self.assertEqual(inventory["static"], files)
        self.assertEqual(inventory["static_scope"], "exclude-images-v2-media")

        for unsafe in (
            "images/metadata.json",
            "../secret.webp",
            "malware.php",
            "robots.txt",
            "sitemap.xml",
            "foo//icon.svg",
        ):
            with self.subTest(unsafe=unsafe):
                with self.assertRaisesRegex(RuntimeError, "unexpectedly includes images|Invalid signed static asset"):
                    check_manifest({unsafe: META}, "exclude-images-v2-media")

        # Legacy v1 intentionally refuses v2 files, never silently widens scope.
        with self.assertRaisesRegex(RuntimeError, "Invalid signed static asset"):
            check_manifest({"fonts/site.woff2": META}, "exclude-images-v1")

    def test_old_php_has_no_scope_and_remains_backward_compatible(self):
        inventory = check_manifest({"_astro/main.js": META})
        self.assertNotIn("static_scope", inventory)

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


class PseSignedUnzipRetryTests(unittest.TestCase):
    def test_retries_only_transport_timeouts_then_returns(self):
        call = mock.Mock(side_effect=[
            RuntimeError("Cannot reach unzip endpoint: timed out"),
            RuntimeError("Cannot reach unzip endpoint: handshake operation timed out"),
            "PASS",
        ])
        with mock.patch.object(unzip.time, "sleep") as sleep:
            self.assertEqual(unzip.retry_transient_timeout(call), "PASS")
        self.assertEqual(call.call_count, 3)
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [3, 6])

    def test_does_not_retry_protocol_or_auth_failures(self):
        call = mock.Mock(side_effect=RuntimeError("Unpack server returned HTTP 403: denied"))
        with mock.patch.object(unzip.time, "sleep") as sleep:
            with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
                unzip.retry_transient_timeout(call)
        self.assertEqual(call.call_count, 1)
        sleep.assert_not_called()

    def test_stops_after_bounded_timeout_attempts(self):
        call = mock.Mock(side_effect=RuntimeError("Cannot reach unzip endpoint: timed out"))
        with mock.patch.object(unzip.time, "sleep") as sleep:
            with self.assertRaisesRegex(RuntimeError, "timed out"):
                unzip.retry_transient_timeout(call, attempts=3)
        self.assertEqual(call.call_count, 3)
        self.assertEqual(sleep.call_count, 2)


if __name__ == "__main__":
    unittest.main()
