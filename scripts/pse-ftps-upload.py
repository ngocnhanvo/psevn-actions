#!/usr/bin/env python3
"""Upload the signed Astro release ZIP using Python's verified explicit FTPS.

No external packages or apt dependencies. Uploads to the same SHA-specific
temporary name as the previous lftp transport, preserving restart/resume.
The signed PHP unzip step remains responsible for SHA-256 verification.
"""
from __future__ import annotations

import ftplib
import hashlib
import os
from pathlib import Path
import re
import socket
import ssl
import sys
import time


class UploadError(RuntimeError):
    pass


def config():
    required = ("ZIP_PATH", "FTP_SERVER", "FTP_USERNAME", "FTP_PASSWORD",
                "ASTRO_FTP_TARGET", "PSE_CLIENT_HOST")
    values = {key: os.environ.get(key, "") for key in required}
    if any(not val for val in values.values()):
        raise UploadError("Missing required FTP or release configuration")
    host = values["PSE_CLIENT_HOST"]
    path = values["ASTRO_FTP_TARGET"]
    if (not re.fullmatch(r"[a-z0-9][a-z0-9.-]*[a-z0-9]", host)
            or not re.fullmatch(r"/[A-Za-z0-9._/-]+/", path)
            or ".." in path or "//" in path
            or path != f"/domains/{host}/public_html/"):
        raise UploadError("Release destination does not match validated frontend host")
    server = values["FTP_SERVER"]
    if (not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9.-]*", server)
            or "/" in server or ":" in server):
        raise UploadError("FTP_SERVER must be a hostname, not a URL")
    archive = Path(values["ZIP_PATH"])
    if not archive.is_file() or archive.stat().st_size == 0:
        raise UploadError("Release archive is absent or empty")
    return values, archive


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fp:
        for block in iter(lambda: fp.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def remote_size(ftp: ftplib.FTP_TLS, name: str) -> int:
    try:
        size = ftp.size(name)
    except ftplib.error_perm as exc:
        # Only 550 indicates a missing path; auth or permission errors are fatal.
        if not str(exc).startswith("550"):
            raise
        return 0
    if size is None:
        raise UploadError("FTPS server did not return file size")
    return int(size)


def connect(values: dict[str, str]) -> ftplib.FTP_TLS:
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    ftp = ftplib.FTP_TLS(context=context, timeout=25)
    ftp.connect(values["FTP_SERVER"], 21, timeout=25)
    ftp.login(values["FTP_USERNAME"], values["FTP_PASSWORD"])
    ftp.prot_p()  # Encrypt data socket as well as authenticated control channel.
    ftp.set_pasv(True)
    ftp.cwd(values["ASTRO_FTP_TARGET"])
    ftp.voidcmd("TYPE I")
    return ftp


def transfer(values: dict[str, str], archive: Path, remote_temp: str, size: int) -> None:
    last_error: Exception | None = None
    for attempt in range(1, 4):
        ftp: ftplib.FTP_TLS | None = None
        try:
            ftp = connect(values)
            existing = remote_size(ftp, remote_temp)
            if existing > size:
                ftp.delete(remote_temp)
                existing = 0
            if existing < size:
                print(f"FTPS_UPLOAD attempt={attempt} offset={existing} total={size}", flush=True)
                with archive.open("rb") as fp:
                    fp.seek(existing)
                    # FTP REST+STOR is required for resumable uploads. An
                    # unsupported REST raises an error rather than overwriting.
                    ftp.storbinary(f"STOR {remote_temp}", fp, blocksize=262144,
                                   rest=existing if existing else None)
            else:
                print("FTPS_UPLOAD remote SHA-specific staging already complete", flush=True)
            actual = remote_size(ftp, remote_temp)
            if actual != size:
                raise UploadError(f"Uploaded size mismatch ({actual} != {size})")
            final_name = "pse-astro.zip"
            try:
                ftp.rename(remote_temp, final_name)
            except ftplib.error_perm:
                # Only replace an existing archive; never delete it on other
                # permission failures. Signed PHP still validates the ZIP SHA.
                try:
                    prior = remote_size(ftp, final_name)
                except ftplib.error_perm:
                    raise
                if prior <= 0:
                    raise
                ftp.delete(final_name)
                ftp.rename(remote_temp, final_name)
            if remote_size(ftp, final_name) != size:
                raise UploadError("Final remote archive size mismatch")
            print(f"FTPS_UPLOAD=PASS bytes={size} sha_prefix={remote_temp.split(".")[2][:12]}", flush=True)
            return
        except (OSError, EOFError, UploadError, *ftplib.all_errors) as exc:
            last_error = exc
            print(f"FTPS_UPLOAD_RETRY attempt={attempt} reason={type(exc).__name__}", flush=True)
            if attempt < 3:
                time.sleep(3 * attempt)
        finally:
            if ftp is not None:
                try:
                    ftp.quit()
                except (OSError, EOFError, *ftplib.all_errors):
                    ftp.close()
    raise UploadError(f"Encrypted transfer failed after three attempts ({type(last_error).__name__})")


def main():
    values, archive = config()
    size = archive.stat().st_size
    checksum = digest(archive)
    temp = f".pse-astro.{checksum}.zip.uploading"
    print(f"FTPS_TRANSFER_START bytes={size} sha_prefix={checksum[:12]}", flush=True)
    transfer(values, archive, temp, size)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fp:
            fp.write(f"- Python FTPS (TLS verified): {size} bytes, SHA prefix {checksum[:12]}; server checksum checked by signed PHP activation.\n")


if __name__ == "__main__":
    try:
        main()
    except (UploadError, OSError, EOFError, *ftplib.all_errors) as exc:
        print(f"::error::Python FTPS upload failed ({type(exc).__name__})", file=sys.stderr)
        sys.exit(1)
