#!/usr/bin/env python3
"""Offline safety and latency contracts for PSE guarded runtime .env over FTPS.

No network access, secrets, CMS writes, public staging or production build.
"""
from __future__ import annotations

import ftplib
import importlib.util
import io
import os
from pathlib import Path
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "pse-runtime-env-ftps.py"
spec = importlib.util.spec_from_file_location("pse_runtime_env_ftps", MODULE)
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class FakeFTPS:
    def __init__(self, files=None):
        self.files = dict(files or {})
        self.cwd_path = "/"
        self.size_names = []
        self.commands = []
        self.closed = False

    def _path(self, name):
        return name if name.startswith("/") else self.cwd_path.rstrip("/") + "/" + name

    def connect(self, *args, **kwargs):
        self.commands.append("connect")

    def auth(self):
        self.commands.append("auth")

    def login(self, *args):
        self.commands.append("login")

    def prot_p(self):
        self.commands.append("prot_p")

    def cwd(self, name):
        self.cwd_path = self._path(name).rstrip("/")
        self.commands.append(("cwd", self.cwd_path))

    def pwd(self):
        return self.cwd_path

    def voidcmd(self, command):
        self.commands.append(("voidcmd", command))
        return "200 OK"

    def size(self, name):
        self.size_names.append(name)
        dest = self._path(name)
        if dest not in self.files:
            raise ftplib.error_perm("550 missing")
        return len(self.files[dest])

    def retrbinary(self, command, callback):
        name = command.removeprefix("RETR ")
        callback(self.files[self._path(name)])

    def storbinary(self, command, fp):
        name = command.removeprefix("STOR ")
        self.commands.append(("STOR", self._path(name)))
        self.files[self._path(name)] = fp.read()

    def sendcmd(self, command):
        self.commands.append(("sendcmd", command))
        return "200 OK"

    def rename(self, name, to):
        self.files[self._path(to)] = self.files.pop(self._path(name))

    def delete(self, name):
        self.commands.append(("DELE", self._path(name)))
        self.files.pop(self._path(name))

    def quit(self):
        self.closed = True

    def close(self):
        self.closed = True


class GuardedEnvTest(unittest.TestCase):
    def setUp(self):
        self.frontend = "pse.webnvn.com"
        self.root = "/domains/" + self.frontend + "/public_html"
        self.raw = "\n".join([
            "WC_URL=https://admin-pse.webnvn.com",
            "WC_URL_CLIENT=https://pse.webnvn.com",
            "WOO_KEY=fixture-key",
            "WOO_SECRET=fixture-secret",
        ])
        self.expected_bytes = (self.raw + "\n").encode("utf-8")

    def test_existing_file_guard_requires_http_denial_and_is_read_only(self):
        ftp = FakeFTPS({self.root + "/.env": self.expected_bytes})
        ftp.cwd(self.root)
        with patch.object(runtime, "http_denies_env", return_value=True):
            self.assertTrue(runtime.ensure_http_guard(ftp, self.frontend))
        self.assertEqual(ftp.size_names, [".env"])
        self.assertFalse(any(isinstance(x, tuple) and x[0] in ("STOR", "DELE")
                             for x in ftp.commands))
        self.assertEqual(ftp.files[self.root + "/.env"], self.expected_bytes)

    def test_existing_exposed_env_rejected_without_touching_its_bytes(self):
        ftp = FakeFTPS({self.root + "/.env": self.expected_bytes})
        ftp.cwd(self.root)
        with patch.object(runtime, "http_denies_env", return_value=False):
            with self.assertRaises(ValueError):
                runtime.ensure_http_guard(ftp, self.frontend)
        self.assertEqual(ftp.files[self.root + "/.env"], self.expected_bytes)

    def test_missing_env_requires_safe_marker_and_removes_it(self):
        ftp = FakeFTPS()
        ftp.cwd(self.root)
        with patch.object(runtime, "http_denies_env", return_value=True):
            self.assertFalse(runtime.ensure_http_guard(ftp, self.frontend))
        self.assertNotIn(self.root + "/.env", ftp.files)
        self.assertIn(("STOR", self.root + "/.env"), ftp.commands)
        self.assertIn(("DELE", self.root + "/.env"), ftp.commands)
        self.assertTrue(any(x == ("sendcmd", "SITE CHMOD 600 .env")
                            for x in ftp.commands))

    def test_missing_env_cleanup_even_if_publicly_exposed(self):
        ftp = FakeFTPS()
        ftp.cwd(self.root)
        with patch.object(runtime, "http_denies_env", return_value=False):
            with self.assertRaises(ValueError):
                runtime.ensure_http_guard(ftp, self.frontend)
        self.assertEqual(ftp.files, {})
        self.assertIn(("DELE", self.root + "/.env"), ftp.commands)

    def test_unchanged_env_retains_digest_permission_and_one_size_lookup(self):
        ftp = FakeFTPS({self.root + "/.env": self.expected_bytes})
        environ = {
            "ENV_FILE": self.raw,
            "FTP_SERVER": "ftp.example.com",
            "FTP_USERNAME": "fixture-user",
            "FTP_PASSWORD": "fixture-pass",
            "PSE_CLIENT_HOST": self.frontend,
            "PSE_WP_ORIGIN": "https://admin-pse.webnvn.com",
        }
        with patch.dict(os.environ, environ), \
             patch.object(runtime.ftplib, "FTP_TLS", return_value=ftp), \
             patch.object(runtime, "http_denies_env", return_value=True):
            self.assertEqual(runtime.main(), 0)
        # Reuse the exact, previously HTTP-guarded PWD-relative .env SIZE.
        # A second FTP SIZE on the absolute path costs one network round trip.
        self.assertEqual(ftp.size_names, [".env"])
        self.assertIn(("sendcmd", "SITE CHMOD 600 " + self.root + "/.env"), ftp.commands)
        self.assertTrue(ftp.closed)
        self.assertEqual(ftp.files[self.root + "/.env"], self.expected_bytes)


if __name__ == "__main__":
    unittest.main()
