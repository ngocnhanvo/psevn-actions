#!/usr/bin/env python3
"""PSE one-shot bounded FTPS throughput comparison; NO BUILD, NO DEPLOY.

Tests two encrypted clients with the same synthetic 2 MiB payload.
No production ZIP mutation, no credentials/host printed; verify cleanup.
"""
import ftplib
import io
import os
import re
import ssl
import subprocess
import tempfile
import time
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile

def get_origin(env_file, name):
    found = []
    for line in env_file.splitlines():
        match = re.fullmatch(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*", line)
        if match and match.group(1) == name:
            found.append(match.group(2).strip('"\''))
    if len(found) != 1:
        raise ValueError("Missing unique validated " + name)
    origin = urlsplit(found[0])
    if (origin.scheme != "https" or not origin.hostname or origin.port not in (None, 443)
            or origin.username or origin.password or origin.path not in ("", "/")
            or origin.query or origin.fragment or not re.fullmatch(r"[a-z0-9][a-z0-9.\-]+", origin.hostname)):
        raise ValueError("Invalid frontend origin")
    return origin.hostname

def main():
    host = get_origin(os.environ["ENV_FILE"], "WC_URL_CLIENT")
    remote_dir = "/domains/" + host + "/public_html/"
    uri = os.environ["FTP_SERVER"]
    if "://" not in uri:
        uri = "ftps://" + uri
    parsed = urlsplit(uri)
    if (parsed.scheme not in ("ftp", "ftps") or not parsed.hostname or parsed.port not in (None, 21)
            or parsed.path not in ("", "/") or parsed.username or parsed.password):
        raise ValueError("Invalid FTPS host")
    server = parsed.hostname
    username = os.environ["FTP_USERNAME"]
    password = os.environ["FTP_PASSWORD"]
    if not username or not password:
        raise ValueError("Missing FTPS credentials")
    run_id = os.environ["GITHUB_RUN_ID"]
    if not run_id.isdecimal():
        raise ValueError("Missing numeric run id")
    # A workflow or actor must explicitly authorize this temporary write probe.
    # Other runs only permit the read-only cache inventory.
    if os.environ.get("PSE_BENCHMARK_ENABLED") != "1":
        raise ValueError("One-shot FTPS benchmark authorization missing")
    names = [".pse-ftps-profile-" + run_id + "-python.tmp",
             ".pse-ftps-profile-" + run_id + "-lftp.tmp"]
    ftp = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=35)
    try:
        begin = time.monotonic()
        ftp.connect(server, parsed.port or 21)
        ftp.auth()
        ftp.login(username, password)
        ftp.prot_p()
        ftp.set_pasv(True)
        ftp.cwd(remote_dir)
        if ftp.pwd().rstrip("/") != remote_dir.rstrip("/"):
            raise RuntimeError("FTPS root mismatch")
        ftp.voidcmd("TYPE I")
        print("FTPS_SECURE_CONNECTION_SECONDS=%.2f" % (time.monotonic() - begin), flush=True)

        # Existing immutable deployment ZIP is READ ONLY; inspect aggregate sizes only.
        try:
            remote_size = ftp.size("pse-astro.zip")
            if not remote_size or remote_size > 64 * 1024 * 1024:
                raise ValueError("Unexpected archive size")
            with tempfile.TemporaryFile() as archive:
                t0 = time.monotonic()
                ftp.retrbinary("RETR pse-astro.zip", archive.write, blocksize=256 * 1024)
                print("FTPS_READ_EXISTING_ZIP_BYTES=%d SECONDS=%.2f" %
                      (remote_size, time.monotonic() - t0), flush=True)
                archive.seek(0)
                with ZipFile(archive) as z:
                    totals = defaultdict(lambda: [0, 0, 0])
                    for entry in z.infolist():
                        if entry.is_dir():
                            continue
                        name = entry.filename
                        if name.startswith("client/images/"):
                            bucket = "client-images"
                        elif name.startswith("client/_astro/"):
                            bucket = "client-js-css"
                        elif name.startswith("server/"):
                            bucket = "server"
                        elif name.startswith("client/data/"):
                            bucket = "client-data"
                        elif name.startswith("client/"):
                            bucket = "client-other"
                        else:
                            bucket = "root-other"
                        totals[bucket][0] += entry.compress_size
                        totals[bucket][1] += entry.file_size
                        totals[bucket][2] += 1
                    for bucket, (compressed, raw, count) in sorted(totals.items()):
                        print("ZIP_GROUP %s compressed=%d raw=%d count=%d" %
                              (bucket, compressed, raw, count), flush=True)
        except ftplib.error_perm as exc:
            if not str(exc).startswith("550"):
                raise
            print("ZIP_READ_STATUS=not-present", flush=True)

        with tempfile.TemporaryDirectory() as folder:
            payload = Path(folder) / "synthetic.bin"
            # Compare actual signed production ZIP scale (~2 MiB), not a
            # 6 MiB transfer that can monopolize the hosting FTPS connection.
            amount = 2 * 1024 * 1024
            with payload.open("wb") as stream:
                for _ in range(2):
                    stream.write(os.urandom(1024 * 1024))
            try:
                t0 = time.monotonic()
                with payload.open("rb") as stream:
                    ftp.storbinary("STOR " + names[0], stream, blocksize=256 * 1024)
                secs = time.monotonic() - t0
                if ftp.size(names[0]) != amount:
                    raise RuntimeError("Python FTPS size mismatch")
                print("BENCH_PYTHON_FTPS bytes=%d seconds=%.2f mibps=%.2f" %
                      (amount, secs, amount / 1048576 / secs), flush=True)
            finally:
                try:
                    ftp.delete(names[0])
                except ftplib.error_perm:
                    pass
            cmds = """
set cmd:fail-exit yes
set net:timeout 35
set net:max-retries 1
set net:socket-buffer 4194304
set ftp:passive-mode yes
set ftp:ssl-force yes
set ftp:ssl-protect-data yes
set ssl:verify-certificate yes
cd {remote}
put {local} -o {name}
bye
""".format(remote=remote_dir, local=str(payload), name=names[1])
            try:
                start = time.monotonic()
                p = subprocess.run(["lftp", "-u", username + "," + password, "ftp://" + server],
                                   input=cmds, text=True, capture_output=True, timeout=110)
                secs = time.monotonic() - start
                if p.returncode != 0:
                    # Do NOT print lftp output in case the host echoes auth/config.
                    raise RuntimeError("LFTP upload failed, exit code " + str(p.returncode))
                if ftp.size(names[1]) != amount:
                    raise RuntimeError("LFTP FTPS size mismatch")
                print("BENCH_LFTP_BUFFER4M bytes=%d seconds=%.2f mibps=%.2f" %
                      (amount, secs, amount / 1048576 / secs), flush=True)
            finally:
                try:
                    ftp.delete(names[1])
                except ftplib.error_perm:
                    pass
    finally:
        # A process interrupted by a resumable transport failure must not
        # silently claim cleanup. Restrict removal to the unique run-ID probes.
        not_removed = []
        for name in names:
            try:
                ftp.delete(name)
            except ftplib.error_perm as exc:
                if not str(exc).startswith("550"):
                    not_removed.append(name)
            except ftplib.all_errors:
                not_removed.append(name)
            try:
                ftp.size(name)
                not_removed.append(name)
            except ftplib.error_perm as exc:
                if not str(exc).startswith("550"):
                    not_removed.append(name)
            except ftplib.all_errors:
                not_removed.append(name)
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()
        if not_removed:
            raise RuntimeError("FTPS probe cleanup could not be verified")
        print("PSE_FTPS_PROBES_REMOVED=PASS count=2", flush=True)

if __name__ == "__main__":
    main()
