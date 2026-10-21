#!/usr/bin/env python3
"""One-time import of missing cloned WordPress media into isolated PSE WP FTP.

Never overwrite an existing PSE file. Only one predefined legacy media filename
that the PSE Astro production build reported as HTTP 404. Verify TLS, JPEG bytes,
size, remote SHA, then validate public PSE URL. Never touch Astro frontend dir.
"""
from __future__ import annotations
import ftplib, hashlib, io, os, secrets, ssl
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

FILE="Banner-Page-PC.jpg"
SOURCE_URL="https://api-nghiencuukhoahoc.webnvn.com/wp-content/uploads/2026/09/"+FILE
PSE_URL="https://admin-pse.webnvn.com/wp-content/uploads/2026/09/"+FILE
FTP_HOST="vt108159.server.idn.vn"
DOCROOT="/domains/admin-pse.webnvn.com/public_html/wp-content/uploads"
url=os.environ.get("FTP_SERVER","").strip()
if "://" not in url:url="ftp://"+url
parsed=urlsplit(url)
assert parsed.hostname==FTP_HOST and parsed.scheme in ("ftp","ftps")
assert not parsed.username and not parsed.password and not parsed.path.strip("/")
assert os.environ.get("FTP_USERNAME") and os.environ.get("FTP_PASSWORD")
assert b"admin-pse.webnvn.com" in os.environ["ENV_FILE"].encode()
req=Request(SOURCE_URL,headers={"User-Agent":"PSE-OneTimeMediaImport/1.0"})
try:
    with urlopen(req,timeout=28,context=ssl.create_default_context()) as r:
        assert r.status==200, "Source image not available"
        image=r.read(12*1024*1024+1)
except Exception as e:
    print("PSE_MEDIA_IMPORT source_http=FAIL class="+type(e).__name__)
    raise SystemExit(1)
assert 1000 < len(image) <= 12*1024*1024 and image.startswith(b"\xff\xd8\xff")
sha=hashlib.sha256(image).hexdigest()
print("PSE_MEDIA_IMPORT source_verified=PASS bytes="+str(len(image)))
ftp=ftplib.FTP_TLS(context=ssl.create_default_context(),timeout=24)
temp=".pse-media-import-"+secrets.token_hex(10)+".tmp"
uploaded=False
try:
    ftp.connect(parsed.hostname,parsed.port or 21)
    ftp.auth()
    ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
    ftp.prot_p()
    # Only make directories inside WordPress PSE's wp-content/uploads.
    for path in (DOCROOT,DOCROOT+"/2026",DOCROOT+"/2026/09"):
        try:ftp.cwd(path)
        except ftplib.error_perm as err:
            if path==DOCROOT:raise
            ftp.mkd(path)
            ftp.cwd(path)
        assert ftp.pwd().rstrip("/")==path
    ftp.voidcmd("TYPE I")
    try:
        existing=ftp.size(FILE)
    except ftplib.error_perm as ex:
        if not str(ex).startswith("550"):raise
        existing=None
    if existing is not None:
        print("PSE_MEDIA_IMPORT skip=existing_file_protected")
        raise SystemExit(0)
    ftp.storbinary("STOR "+temp,io.BytesIO(image))
    uploaded=True
    remote=io.BytesIO()
    ftp.retrbinary("RETR "+temp,remote.write)
    if hashlib.sha256(remote.getvalue()).hexdigest()!=sha:
        raise RuntimeError("Remote temporary hash mismatch")
    ftp.rename(temp,FILE)
    uploaded=False
    print("PSE_MEDIA_IMPORT remote_sha256=PASS imported=PASS")
finally:
    if uploaded:
        try:ftp.delete(temp)
        except Exception:pass
    try:ftp.quit()
    except Exception:ftp.close()
try:
    with urlopen(Request(PSE_URL,headers={"User-Agent":"PSE-MediaVerification/1.0"}),timeout=24,
                 context=ssl.create_default_context()) as resp:
        status=resp.status
        prefix=resp.read(8)
    print("PSE_MEDIA_IMPORT public_media="+("PASS" if status==200 and prefix.startswith(b"\xff\xd8\xff") else "FAIL"))
    if status!=200 or not prefix.startswith(b"\xff\xd8\xff"):raise SystemExit(1)
except Exception as e:
    print("PSE_MEDIA_IMPORT public_verify=FAIL class="+type(e).__name__)
    raise SystemExit(1)
