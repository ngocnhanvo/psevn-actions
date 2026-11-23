#!/usr/bin/env python3
"""Offline FTP-TLS protocol contracts; no network, credentials or production writes."""
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "pse-ftps-upload.py"
spec = importlib.util.spec_from_file_location("pse_ftps_upload", MODULE)
uploader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uploader)


class FakeFTP:
    def __init__(self, state=None, refuse_rest=False):
        self.files = state if state is not None else {}
        self.refuse_rest = refuse_rest
        self.commands = []
        self.block_sizes = []
    def size(self, name):
        if name not in self.files:
            raise uploader.ftplib.error_perm("550 Missing file")
        return len(self.files[name])
    def storbinary(self, command, fileobj, blocksize=8192, rest=None):
        self.commands.append(("STOR", command, rest))
        self.block_sizes.append(blocksize)
        if self.refuse_rest and rest is not None:
            raise uploader.ftplib.error_perm("502 REST unsupported")
        key = command.removeprefix("STOR ")
        data = fileobj.read()
        self.files[key] = self.files.get(key, b"")[:rest] + data if rest else data
    def rename(self, src, dest):
        self.commands.append(("RNFR", src, dest))
        if dest in self.files:
            raise uploader.ftplib.error_perm("550 Destination exists")
        self.files[dest] = self.files.pop(src)
    def delete(self, name):
        self.commands.append(("DELE", name))
        self.files.pop(name)
    def quit(self):
        pass
    def close(self):
        pass


class PythonFTPSTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.zip = Path(self.tempdir.name) / "archive.zip"
        self.zip.write_bytes(b"pse-zip-content" * 500)
        self.sha = uploader.digest(self.zip)
        self.stage = f".pse-astro.{self.sha}.zip.uploading"
        self.config = {"FTP_SERVER": "ftp.example.com", "FTP_USERNAME": "user",
                       "FTP_PASSWORD": "secret", "ASTRO_FTP_TARGET": "/domains/pse.webnvn.com/public_html/",
                       "PSE_CLIENT_HOST": "pse.webnvn.com"}

    def test_upload_new_archive(self):
        f = FakeFTP()
        with patch.object(uploader, "connect", return_value=f):
            uploader.transfer(self.config, self.zip, self.stage, self.zip.stat().st_size)
        self.assertEqual(f.files["pse-astro.zip"], self.zip.read_bytes())
        self.assertEqual(f.block_sizes, [262144])  # measured signed release default
        self.assertNotIn(self.stage, f.files)

    def test_resume_sha_specific_partial_file(self):
        part = self.zip.read_bytes()[:124]
        f = FakeFTP({self.stage: part})
        with patch.object(uploader, "connect", return_value=f):
            uploader.transfer(self.config, self.zip, self.stage, self.zip.stat().st_size)
        self.assertEqual(f.files["pse-astro.zip"], self.zip.read_bytes())
        self.assertIn(("STOR", "STOR " + self.stage, len(part)), f.commands)

    def test_complete_stage_replaces_old_final(self):
        previous = b"older-version"
        f = FakeFTP({self.stage: self.zip.read_bytes(), "pse-astro.zip": previous})
        with patch.object(uploader, "connect", return_value=f):
            uploader.transfer(self.config, self.zip, self.stage, self.zip.stat().st_size)
        self.assertEqual(f.files["pse-astro.zip"], self.zip.read_bytes())

    def test_failure_keeps_old_release(self):
        class BrokenFTP(FakeFTP):
            def storbinary(self, *args, **kwargs):
                raise uploader.ftplib.error_temp("421 Network interrupted")
        state = {"pse-astro.zip": b"old-good-zip"}
        with patch.object(uploader, "connect", side_effect=lambda _: BrokenFTP(state)), patch.object(uploader.time, "sleep"):
            with self.assertRaises(uploader.UploadError):
                uploader.transfer(self.config, self.zip, self.stage, self.zip.stat().st_size)
        self.assertEqual(state["pse-astro.zip"], b"old-good-zip")

    def test_explicit_ftps_rejects_unauthenticated_data(self):
        class SecureFake:
            def __init__(self):
                self.actions = []
            def connect(self, host, port, timeout):
                self.actions.append("connect")
            def login(self, username, password):
                self.actions.append("login")
            def prot_p(self):
                self.actions.append("protect-data")
            def set_pasv(self, value):
                self.actions.append("passive")
            def cwd(self, target):
                self.actions.append("cwd")
            def voidcmd(self, command):
                self.actions.append("binary")
        fake = SecureFake()
        with patch.object(uploader.ftplib, "FTP_TLS", return_value=fake) as tls, patch.object(uploader.ssl, "create_default_context") as context:
            uploader.connect(self.config)
        self.assertEqual(fake.actions, ["connect", "login", "protect-data", "passive", "cwd", "binary"])
        self.assertEqual(context.return_value.minimum_version, uploader.ssl.TLSVersion.TLSv1_2)
        self.assertTrue(tls.called)

    def test_invalid_ftp_destination_rejected(self):
        env = dict(self.config, ZIP_PATH=str(self.zip))
        env["ASTRO_FTP_TARGET"] = "/domains/other-site.com/public_html/"
        with patch.dict(os.environ, env):
            with self.assertRaises(uploader.UploadError):
                uploader.config()


if __name__ == "__main__":
    unittest.main()
