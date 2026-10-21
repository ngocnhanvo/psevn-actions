#!/usr/bin/env python3
"""Deploy only the guarded NCKH staging signed unzip helper.

The helper is updated because Astro's client/ tree is replaced on each
deployment; it must preserve the existing XML locally when the archive omits
it (no new WordPress Save event). No other domain, secrets or app files touched.
"""
import ftplib
import hashlib
import io
import os
import time
from pathlib import Path
from urllib.parse import urlparse

DOMAIN = "api-nghiencuukhoahoc.webnvn.com"
ROOT = "/domains/" + DOMAIN
TARGET = "public_html/nckh-unzip.php"
SOURCE = Path("source/nckh-unzip.php")
BACKUP = "nckh-config-backups"


def digest(content):
    return hashlib.sha256(content).hexdigest()


def remote_read(ftp, path):
    out = io.BytesIO()
    try:
        ftp.retrbinary("RETR " + path, out.write)
    except ftplib.error_perm as error:
        if str(error).startswith("550"):
            return None
        raise
    return out.getvalue()


def main():
    payload = SOURCE.read_bytes()
    if b"VCS_GH_ACTIONS_TOKEN" not in payload or b"esc_unzip_response" not in payload \
            or b"Unchanged sitemap revision cannot be preserved safely" not in payload:
        raise RuntimeError("Not the reviewed NCKH signed unzip PHP source")
    for key in ("FTP_SERVER", "FTP_USERNAME", "FTP_PASSWORD"):
        if not os.environ.get(key):
            raise RuntimeError("Missing staging FTPS secret: " + key)
    raw = os.environ["FTP_SERVER"]
    endpoint = urlparse(raw if "://" in raw else "ftps://" + raw)
    if not endpoint.hostname:
        raise RuntimeError("Invalid FTPS hostname")
    ftp = ftplib.FTP_TLS()
    try:
        ftp.connect(endpoint.hostname, endpoint.port or 21, timeout=25)
        ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
        ftp.prot_p()
        ftp.cwd(ROOT)
        if ftp.pwd().rstrip("/") != ROOT:
            raise RuntimeError("Unexpected target domain directory")
        existing = remote_read(ftp, TARGET)
        if existing is None or b"VCS_GH_ACTIONS_TOKEN" not in existing:
            raise RuntimeError("Refusing to install over an unknown/absent signed helper")
        if digest(existing) == digest(payload):
            print("PASS: NCKH signed unpack helper already matches staging source")
            return
        try:
            ftp.mkd(BACKUP)
        except ftplib.error_perm as error:
            if not str(error).startswith("550"):
                raise
        suffix = str(int(time.time()))
        staged = BACKUP + "/unzip-revision-stage-" + suffix + ".txt"
        previous = BACKUP + "/unzip-revision-prev-" + suffix + ".txt"
        ftp.storbinary("STOR " + staged, io.BytesIO(payload))
        candidate = remote_read(ftp, staged)
        if candidate is None or digest(candidate) != digest(payload):
            raise RuntimeError("Staged PHP checksum failed")
        activated = False
        archived = False
        try:
            ftp.rename(TARGET, previous)
            archived = True
            ftp.rename(staged, TARGET)
            activated = True
            live = remote_read(ftp, TARGET)
            if live is None or digest(live) != digest(payload):
                raise RuntimeError("Live signed helper does not match reviewed PHP")
            print("PASS: staging NCKH signed unpack helper replaced with verified backup")
        except Exception:
            if activated:
                ftp.delete(TARGET)
            if archived:
                ftp.rename(previous, TARGET)
            raise
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            pass


if __name__ == "__main__":
    main()
