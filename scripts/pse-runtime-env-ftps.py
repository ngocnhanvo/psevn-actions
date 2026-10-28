#!/usr/bin/env python3
"""Deploy PSE Astro runtime env via FTPS outside the public document root.

The source is the existing protected Actions ENV_FILE secret. This program
never prints, checks in, or stages env contents in a web-accessible archive.
No public_html file is read, uploaded, removed or overwritten.
"""
from __future__ import annotations

import ftplib
import hashlib
import io
import os
import re
import secrets
import ssl
import sys
from urllib.parse import urlsplit

NAME = ".pse-astro-runtime.env"
MAX_BYTES = 65536


def origin(value: str) -> str:
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname
            or parsed.port not in (None, 443) or parsed.username or parsed.password
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise ValueError("Invalid PSE environment origin")
    return parsed.hostname


def env_values(raw: str) -> dict[str, str]:
    values = {}
    for line in raw.splitlines():
        match = re.fullmatch(
            r"\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*", line
        )
        if match:
            values[match.group(1)] = match.group(2).strip().strip("\\\"'")
    return values


def ftp_digest(ftp: ftplib.FTP_TLS, name: str) -> str:
    sha = hashlib.sha256()
    ftp.retrbinary("RETR " + name, sha.update)
    return sha.hexdigest()


def file_present(ftp: ftplib.FTP_TLS, name: str) -> bool:
    try:
        ftp.voidcmd("TYPE I")
        return ftp.size(name) is not None
    except ftplib.error_perm as exc:
        if str(exc).startswith("550"):
            return False
        raise


def main() -> int:
    ftp = None
    temp = None
    backup = None
    original_moved = False
    installed = False
    try:
        raw = os.environ["ENV_FILE"]
        payload = (raw.rstrip("\r\n") + "\n").encode("utf-8")
        if not (0 < len(payload) <= MAX_BYTES) or b"\x00" in payload:
            raise ValueError("Invalid environment length")
        values = env_values(raw)
        if not all(values.get(name) for name in ("WC_URL", "WC_URL_CLIENT", "WOO_KEY", "WOO_SECRET")):
            raise ValueError("Required PSE environment variables missing")
        frontend = origin(values["WC_URL_CLIENT"])
        backend = origin(values["WC_URL"])
        if (frontend != os.environ["PSE_CLIENT_HOST"]
                or backend != urlsplit(os.environ["PSE_WP_ORIGIN"]).hostname
                or frontend == backend):
            raise ValueError("PSE runtime environment target mismatch")

        raw_server = os.environ["FTP_SERVER"].strip()
        uri = urlsplit(raw_server if "://" in raw_server else "ftp://" + raw_server)
        if (uri.scheme not in ("ftp", "ftps") or not uri.hostname
                or uri.port not in (None, 21) or uri.username or uri.password
                or uri.path.strip("/") or uri.query or uri.fragment):
            raise ValueError("Invalid encrypted FTP destination")
        ftp = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=40)
        ftp.connect(uri.hostname, uri.port or 21)
        ftp.auth()
        ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
        ftp.prot_p()

        # Same validated PSE frontend domain as the official signed ZIP target.
        domain_root = "/domains/" + frontend
        ftp.cwd(domain_root)
        if ftp.pwd().rstrip("/") != domain_root:
            raise ValueError("Domain root mismatch")
        ftp.cwd("public_html")
        if ftp.pwd().rstrip("/") != domain_root + "/public_html":
            raise ValueError("Frontend root mismatch")
        ftp.cwd(domain_root)

        expected = hashlib.sha256(payload).hexdigest()
        if file_present(ftp, NAME) and ftp_digest(ftp, NAME) == expected:
            ftp.sendcmd("SITE CHMOD 600 " + NAME)
            print("PSE_RUNTIME_ENV_FTPS=PASS state=unchanged private=PASS")
            return 0

        suffix = secrets.token_hex(8)
        temp = NAME + "." + suffix + ".tmp"
        backup = NAME + "." + suffix + ".rollback"
        if file_present(ftp, temp) or file_present(ftp, backup):
            raise ValueError("Unexpected staging file collision")
        ftp.storbinary("STOR " + temp, io.BytesIO(payload))
        ftp.sendcmd("SITE CHMOD 600 " + temp)
        if ftp_digest(ftp, temp) != expected:
            raise ValueError("Env staging verification failed")
        if file_present(ftp, NAME):
            ftp.rename(NAME, backup)
            original_moved = True
            ftp.sendcmd("SITE CHMOD 600 " + backup)
        ftp.rename(temp, NAME)
        temp = None
        installed = True
        if ftp_digest(ftp, NAME) != expected:
            raise ValueError("Env activation verification failed")
        print("PSE_RUNTIME_ENV_FTPS=PASS state=updated private=PASS rollback_kept=" + str(original_moved).lower())
        return 0
    except (ftplib.all_errors, OSError, ValueError, KeyError) as exc:
        # Restore the original private runtime config if staging/activation failed.
        if ftp is not None:
            try:
                if original_moved and backup:
                    if installed and file_present(ftp, NAME):
                        ftp.delete(NAME)
                    ftp.rename(backup, NAME)
                elif installed and file_present(ftp, NAME):
                    ftp.delete(NAME)
                if temp and file_present(ftp, temp):
                    ftp.delete(temp)
            except (ftplib.all_errors, OSError):
                print("PSE_RUNTIME_ENV_ROLLBACK=MANUAL_REVIEW_REQUIRED")
        print("PSE_RUNTIME_ENV_FTPS=FAIL error_class=" + type(exc).__name__)
        return 1
    finally:
        if ftp is not None:
            try:
                ftp.quit()
            except (ftplib.all_errors, OSError):
                ftp.close()


if __name__ == "__main__":
    sys.exit(main())
