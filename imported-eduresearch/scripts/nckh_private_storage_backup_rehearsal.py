#!/usr/bin/env python3
"""One-time controlled synthetic FTPS backup/restore rehearsal for NCKH staging.
Never lists, opens, copies or deletes any real project attachment or database content.
"""
import ftplib
import hashlib
import io
import os
import secrets
from urllib.parse import urlparse

BASE = "/domains/api-nghiencuukhoahoc.webnvn.com"
ROOT = BASE + "/nckh-private-files"
BACKUP = BASE + "/nckh-private-file-backups"

def main():
    if any(not os.environ.get(k) for k in ("FTP_SERVER", "FTP_USERNAME", "FTP_PASSWORD")):
        raise RuntimeError("BLOCKED: Missing existing staging FTPS credentials")
    raw = os.environ["FTP_SERVER"]
    url = urlparse(raw if "://" in raw else "ftps://" + raw)
    if url.scheme not in ("ftp", "ftps") or not url.hostname:
        raise RuntimeError("Invalid FTPS endpoint")
    ftp = ftplib.FTP_TLS()
    ftp.connect(url.hostname, url.port or 21, timeout=35)
    created = []
    clean_error = []
    test_bytes = b"NCKH-SYNTHETIC-BACKUP-REHEARSAL:" + secrets.token_bytes(64)
    digest = hashlib.sha256(test_bytes).hexdigest()
    token = secrets.token_hex(12)
    source = ROOT + "/nckh-qa-" + token + ".bin"
    archive = BACKUP + "/nckh-qa-" + token + ".bin"
    restored = ROOT + "/nckh-qa-restore-" + token + ".bin"
    try:
        ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
        ftp.prot_p()
        ftp.cwd(BASE)
        if ftp.pwd().rstrip("/") != BASE:
            raise RuntimeError("STOP: FTP is outside the permitted staging domain")
        ftp.cwd(ROOT)
        if ftp.pwd().rstrip("/") != ROOT:
            raise RuntimeError("STOP: unexpected private root")
        try:
            ftp.cwd(BACKUP)
        except ftplib.error_perm as e:
            if not str(e).startswith("550"):
                raise
            ftp.cwd(BASE)
            ftp.mkd("nckh-private-file-backups")
            ftp.cwd(BACKUP)
        if ftp.pwd().rstrip("/") != BACKUP:
            raise RuntimeError("STOP: backup path escaped private staging directory")
        # Empty directory is safe, but no backups should be copied without restricted mode.
        ftp.sendcmd("SITE CHMOD 700 " + BACKUP)
        ftp.cwd(BASE)
        def put(path, content):
            created.append(path)  # even a partial upload must be cleaned up
            ftp.storbinary("STOR " + path, io.BytesIO(content))
        def verify(path):
            chunks = bytearray()
            ftp.retrbinary("RETR " + path, chunks.extend, blocksize=16384)
            if hashlib.sha256(chunks).hexdigest() != digest or bytes(chunks) != test_bytes:
                raise RuntimeError("Synthetic backup/restore byte checksum mismatch")
        put(source, test_bytes)
        verify(source)
        put(archive, test_bytes)
        verify(archive)
        put(restored, test_bytes)
        verify(restored)
        print("PASS D2 REHEARSAL: synthetic staging file stored, backed up, restored and SHA-256 verified")
    finally:
        for path in reversed(created):
            try:
                ftp.delete(path)
            except ftplib.all_errors:
                clean_error.append(path)
        try:
            ftp.quit()
        except ftplib.all_errors:
            pass
        if clean_error:
            raise RuntimeError("FAIL D2 REHEARSAL: synthetic fixture cleanup incomplete; do not enable files")
    print("PASS D2 CLEANUP: all rehearsal files removed; no real research file was accessed")
    print("UNVERIFIED D2: No live file-backup cadence, retention/delete-from-backups policy or DB/file consistency proof")
    print("SAFE: NCKH_PRIVATE_FILES_ENABLED remains OFF; no student attachment was created through WordPress")

if __name__ == "__main__":
    main()
