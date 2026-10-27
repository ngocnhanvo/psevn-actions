#!/usr/bin/env python3
"""Read-only FTPS fingerprint of PSE's exact Updraft DB snapshot for isolated QA.

Requires an Updraft archive whose remote modification time falls within the
known backup action's observation window. No archive, SQL, filenames or
credentials are logged or written to public artifacts.
"""
import datetime
import ftplib
import hashlib
import os
import posixpath
import re
import ssl
from urllib.parse import urlsplit

BACKUP_RUN_UTC = datetime.datetime(2026,10,27,0,28,40,tzinfo=datetime.timezone.utc)
MAX_SKEW = datetime.timedelta(minutes=12)
REGEX = re.compile(r"^backup_[0-9-]{15,25}_[A-Za-z0-9_.-]+-db[.]gz$")

def fail(msg):
    raise RuntimeError(msg)

def main():
    urls=[]
    for raw in os.environ.get("ENV_FILE","").splitlines():
        s=raw.strip().removeprefix("export ").strip()
        if s.startswith("WC_URL="):
            urls.append(s.split("=",1)[1].strip().strip("'\""))
    if len(urls)!=1: fail("Ambiguous PSE WordPress origin")
    origin=urlsplit(urls[0])
    if not (origin.scheme=="https" and origin.hostname and
            origin.port in (None,443) and origin.path in ("","/") and
            not origin.username and not origin.password and
            not origin.query and not origin.fragment):
        fail("Invalid WordPress HTTPS origin")
    server=os.environ.get("FTP_SERVER","").strip()
    ftp_url=urlsplit(server if "://" in server else "ftp://"+server)
    if not (ftp_url.scheme in ("ftp","ftps") and ftp_url.hostname and
            ftp_url.port in (None,21) and ftp_url.path in ("","/") and
            not ftp_url.username and not ftp_url.password and
            not ftp_url.query and not ftp_url.fragment):
        fail("Invalid FTPS config")
    if not os.environ.get("FTP_USERNAME") or not os.environ.get("FTP_PASSWORD"):
        fail("FTPS credentials missing")

    path="/domains/"+origin.hostname+"/public_html/wp-content/updraft"
    ftp=ftplib.FTP_TLS(context=ssl.create_default_context(),timeout=35)
    try:
        ftp.connect(ftp_url.hostname,ftp_url.port or 21)
        ftp.auth()
        ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
        ftp.prot_p()
        ftp.cwd(path)
        if ftp.pwd().rstrip("/")!=path:fail("Not the expected protected Updraft directory")
        names=[posixpath.basename(s) for s in ftp.nlst()]
        candidates=[s for s in names if REGEX.fullmatch(s)]
        if not candidates:fail("No protected DB snapshot")
        # Use the same latest-archive selection as the tested disposable-DB
        # script; this exact choice must also match the known snapshot time.
        selected=max(candidates)
        stamp=ftp.sendcmd("MDTM "+selected)
        if not re.fullmatch(r"213 [0-9]{14}",stamp):fail("Cannot verify snapshot modification time")
        modified=datetime.datetime.strptime(stamp[4:],"%Y%m%d%H%M%S").replace(tzinfo=datetime.timezone.utc)
        if abs(modified-BACKUP_RUN_UTC)>MAX_SKEW:
            fail("Latest Updraft archive does not match known backup window")
        digest=hashlib.sha256()
        total=0
        def add(data):
            nonlocal total
            total+=len(data)
            if total>300_000_000:fail("Protected backup too large")
            digest.update(data)
        ftp.retrbinary("RETR "+selected,add,blocksize=65536)
        sha16=digest.hexdigest()[:16]
        out=os.environ.get("GITHUB_OUTPUT","")
        if not out:fail("Missing protected workflow output")
        with open(out,"a",encoding="utf8") as f:
            f.write("sha16="+sha16+"\n")
        print("PSE_G0_SNAPSHOT_TIME_MATCH=PASS")
        print("PSE_G0_SNAPSHOT_READONLY_TLS_SHA=PASS")
        print("PSE_G0_NO_SQL_LOG=PASS")
    finally:
        try:ftp.quit()
        except Exception:ftp.close()

if __name__=="__main__":
    try:main()
    except Exception:
        print("PSE_G0_SNAPSHOT_PIN=FAILED_CLOSED")
        raise SystemExit(1)
