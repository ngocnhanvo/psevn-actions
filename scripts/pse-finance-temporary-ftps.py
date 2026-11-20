#!/usr/bin/env python3
"""Deploy/retire ONE temporary PSE finance source-PDF sideload PHP file via FTPS.
Explicit TLS, byte-for-byte SHA256 verification, never deploy unrelated paths.
"""
from __future__ import annotations
import ftplib
import hashlib
import io
import os
import re
import sys
from urllib.parse import urlsplit

ROOT = "/domains/admin-pse.webnvn.com/public_html"
REL = "wp-content/mu-plugins/pse-finance-temporary-sideload.php"
REMOTE = ROOT + "/" + REL
SOURCE = "source-php/" + REL

def preflight() -> tuple[str, str, str]:
    env = os.environ.get("ENV_FILE", "")
    vals = []
    for line in env.splitlines():
        line = line.strip()
        if line.startswith("export "):
            line = line[7:].strip()
        if line.startswith("WC_URL="):
            vals.append(line.split("=", 1)[1].strip().strip("\"'"))
    if len(vals) != 1 or vals[0].rstrip("/") != "https://admin-pse.webnvn.com":
        raise RuntimeError("PSE PHP origin identity mismatch")
    host_raw = os.environ.get("FTP_SERVER", "")
    host_raw = host_raw.replace("ftp://", "").replace("ftps://", "")
    host, sep, port = host_raw.partition(":")
    if not re.fullmatch(r"[A-Za-z0-9.-]+", host) or (sep and port != "21"):
        raise RuntimeError("Unsafe PSE FTP host/port")
    user, password = os.environ.get("FTP_USERNAME", ""), os.environ.get("FTP_PASSWORD", "")
    if not user or not password:
        raise RuntimeError("PSE FTPS credentials missing")
    return host, user, password

def get_bytes(ftp: ftplib.FTP_TLS, path: str) -> bytes | None:
    buffer = io.BytesIO()
    try:
        ftp.retrbinary("RETR " + path, buffer.write, blocksize=65536)
    except ftplib.error_perm as exc:
        if str(exc).startswith("550"):
            return None
        raise
    return buffer.getvalue()

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in ("deploy", "retire"):
        raise SystemExit("Usage: pse-finance-temporary-ftps.py deploy|retire")
    mode = sys.argv[1]
    source = open(SOURCE, "rb").read()
    if b"Plugin Name: PSE Finance Temporary Document Sideload" not in source or len(source) < 5000:
        raise RuntimeError("Unexpected reviewed PHP source")
    host, user, password = preflight()
    with ftplib.FTP_TLS(timeout=35) as ftp:
        ftp.connect(host, 21, timeout=35)
        ftp.login(user, password)
        ftp.prot_p()
        # Existing verified WordPress PHP file: reject unrelated FTP accounts.
        core = get_bytes(ftp, ROOT + "/wp-load.php")
        if core is None or not core.lstrip().startswith(b"<?php"):
            raise RuntimeError("PSE FTPS WordPress root identity failed")
        existing = get_bytes(ftp, REMOTE)
        if mode == "deploy":
            if existing is not None and sha(existing) != sha(source):
                raise RuntimeError("PSE temporary PHP path occupied by different content")
            if existing is None:
                ftp.storbinary("STOR " + REMOTE, io.BytesIO(source), blocksize=65536)
            check = get_bytes(ftp, REMOTE)
            if check is None or sha(check) != sha(source):
                raise RuntimeError("PSE uploaded temporary PHP binary differs")
            print(f"PSE_FINANCE_TEMPORARY_FTPS=DEPLOY_VERIFIED; bytes={len(source)}; sha256={sha(source)}")
        else:
            if existing is None:
                print("PSE_FINANCE_TEMPORARY_FTPS=ALREADY_RETIRED")
            else:
                if sha(existing) != sha(source):
                    raise RuntimeError("PSE remote temporary PHP changed; refusing deletion")
                ftp.delete(REMOTE)
                if get_bytes(ftp, REMOTE) is not None:
                    raise RuntimeError("PSE temporary PHP still present after delete")
                print("PSE_FINANCE_TEMPORARY_FTPS=RETIRED_VERIFIED")
        ftp.quit()

if __name__ == "__main__":
    main()
