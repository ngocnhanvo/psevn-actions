#!/usr/bin/env python3
"""Read one exact PSE Agent PolicySkill via certificate-checked FTPS into private git audit branch; no remote writes."""
import ftplib, hashlib, io, os, re, ssl, subprocess
from pathlib import Path
from urllib.parse import urlsplit
repo=Path("source-php")
branch="audit/pse-policy-live-20261028"
src="wp-content/mu-plugins/esc-agent/src/Skills/PolicySkill.php"
target=repo/"docs/checkpoints/PSE_AGENT_POLICY_LIVE_20261028.php"
def val(key):
    x=[line.strip().split("=",1)[1].strip().strip("'\"") for line in os.environ.get("ENV_FILE","").splitlines() if line.strip().startswith(key+"=")]
    assert len(x)==1 and x[0]
    return x[0]
wp=urlsplit(val("WC_URL"))
assert (wp.scheme,wp.hostname,wp.port,wp.path) in [
    ("https","admin-pse.webnvn.com",None,""),("https","admin-pse.webnvn.com",None,"/"),
    ("https","admin-pse.webnvn.com",443,""),("https","admin-pse.webnvn.com",443,"/")
]
ftp_url=urlsplit((os.getenv("FTP_SERVER","") if "://" in os.getenv("FTP_SERVER","") else "ftp://"+os.getenv("FTP_SERVER","")))
assert ftp_url.hostname and ftp_url.port in (None,21) and ftp_url.scheme in ("ftp","ftps")
root="/domains/admin-pse.webnvn.com/public_html"
ftp=ftplib.FTP_TLS(context=ssl.create_default_context(),timeout=35)
try:
    ftp.connect(ftp_url.hostname,ftp_url.port or 21)
    ftp.auth()
    ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
    ftp.prot_p()
    ftp.cwd(root)
    assert ftp.pwd().rstrip("/")==root
    assert ftp.size("wp-load.php")
    parent,name=src.rsplit("/",1)
    ftp.cwd(root+"/"+parent)
    assert ftp.pwd().rstrip("/")==root+"/"+parent
    mem=io.BytesIO()
    ftp.retrbinary("RETR "+name,mem.write)
    raw=mem.getvalue().replace(b"\r\n",b"\n")
finally:
    try:ftp.quit()
    except Exception:ftp.close()
assert 100<len(raw)<200000 and raw.lstrip().startswith(b"<?php") and b"\0" not in raw
s=raw.decode("utf-8")
assert not re.search(r"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|(?:sk-|gsk_|ghp_|github_pat_|AIza)[A-Za-z0-9_-]{12,}",s)
target.parent.mkdir(parents=True,exist_ok=True)
assert not target.exists(), "audit target already exists, do not overwrite"
target.write_bytes(raw)
def git(*args):
    subprocess.run(["git","-C",str(repo),*args],check=True,stdout=subprocess.DEVNULL)
git("config","user.name","PSE Source Audit")
git("config","user.email","pse-audit@users.noreply.github.com")
git("add","--",str(target.relative_to(repo)))
git("commit","-m","audit(pse): preserve exact verified live policy source before PSE-only rewrite")
git("push","origin","HEAD:refs/heads/"+branch)
print("PSE_AGENT_POLICY_LIVE_PRIVATE_AUDIT=PASS read_only_ftps=PASS bytes="+str(len(raw))+" git_blob_sha1="+hashlib.sha1(b"blob "+str(len(raw)).encode()+bytes([0])+raw).hexdigest())
