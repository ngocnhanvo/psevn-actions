#!/usr/bin/env python3
"""Read-only FTPS inspection of NCKH private storage placement. Never uploads/downloads files."""
import ftplib
import os
from urllib.parse import urlparse

STAGING_DOMAIN = "api-nghiencuukhoahoc.webnvn.com"
STAGING_BASE = "/domains/" + STAGING_DOMAIN
PRIVATE_DIR = STAGING_BASE + "/nckh-private-files"

def main():
    required = ("FTP_SERVER", "FTP_USERNAME", "FTP_PASSWORD")
    if any(not os.environ.get(key) for key in required):
        raise RuntimeError("BLOCKED: staging FTPS connection secrets are missing")
    raw = os.environ["FTP_SERVER"]
    endpoint = urlparse(raw if "://" in raw else "ftps://" + raw)
    if endpoint.scheme not in ("ftp", "ftps") or not endpoint.hostname:
        raise RuntimeError("STOP: Invalid staging FTPS endpoint")
    ftp = ftplib.FTP_TLS()
    ftp.connect(endpoint.hostname, endpoint.port or 21, timeout=30)
    try:
        ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
        ftp.prot_p()
        ftp.cwd(STAGING_BASE)
        if ftp.pwd().rstrip("/") != STAGING_BASE:
            raise RuntimeError("STOP: FTPS is not in the approved NCKH staging domain")
        try:
            ftp.cwd(PRIVATE_DIR)
        except ftplib.error_perm as e:
            if not str(e).startswith("550"):
                raise
            print("BLOCKED D2: Required private files directory outside public_html is absent or not FTP-accessible.")
            print("BLOCKED D2: File backup, restore and PHP filesystem permissions still require verification.")
        else:
            if ftp.pwd().rstrip("/") != PRIVATE_DIR:
                raise RuntimeError("STOP: private storage directory resolves outside approved staging path")
            print("PASS D2 PRECHECK: private directory exists outside public_html on the staging domain.")
            print("UNVERIFIED D2: FTP directory access cannot prove PHP writable, non-symlink root or any file backup.")
        ftp.cwd(STAGING_BASE)
        print("INFO: Existing DB backups do not cover private attachments; no file backup policy has been verified.")
        print("PASS: FTPS D2 read-only audit; no files listed, read, created or modified, and no runtime flags enabled.")
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            pass

if __name__ == "__main__":
    main()
