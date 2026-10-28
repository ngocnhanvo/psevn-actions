#!/usr/bin/env python3
"""Extend the PRIVATE PSE live Agent audit snapshot with exactly three remaining changed classes.

FTPS READ ONLY, private GitHub audit branch fast-forward only. No Astro build/release.
"""
from __future__ import annotations
import ftplib
import hashlib
import io
import os
import re
import ssl
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

REPO=Path("source-php")
BRANCH="audit/pse-live-agent-runtime-20261028"
FILES=(
 "wp-content/mu-plugins/esc-agent/src/Core/KnowledgeAwarePlanner.php",
 "wp-content/mu-plugins/esc-agent/src/Skills/KnowledgeSearchSkill.php",
 "wp-content/mu-plugins/esc-agent/src/Skills/ProductSkill.php",
)
def git(*args):
    subprocess.run(["git","-C",str(REPO),*args],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def config(name):
    rows=[]
    for line in os.environ.get("ENV_FILE","").splitlines():
        line=line.strip().removeprefix("export ").strip()
        if line.startswith(name+"="):rows.append(line.split("=",1)[1].strip().strip("'\""))
    if len(rows)!=1 or not rows[0]:raise RuntimeError("Missing or duplicate "+name)
    return rows[0]
def main():
    u=urlsplit(config("WC_URL"))
    if not (u.scheme=="https" and u.hostname=="admin-pse.webnvn.com" and u.port in (None,443)
            and u.path in ("","/") and not (u.query or u.fragment or u.username or u.password)):
        raise RuntimeError("Unexpected PSE WordPress identity")
    f=os.environ.get("FTP_SERVER","")
    url=urlsplit(f if "://" in f else "ftp://"+f)
    if not (url.scheme in ("ftp","ftps") and url.hostname and url.port in (None,21)
            and not (url.query or url.fragment or url.username or url.password or url.path.strip("/"))):
        raise RuntimeError("Unexpected PSE FTPS host")
    if not (os.environ.get("SOURCE_REPO_PAT") and os.environ.get("FTP_USERNAME") and os.environ.get("FTP_PASSWORD")):
        raise RuntimeError("Missing approved credentials")
    root=f"/domains/{u.hostname}/public_html"
    ftp=ftplib.FTP_TLS(context=ssl.create_default_context(),timeout=30)
    data={}
    try:
        ftp.connect(url.hostname,url.port or 21)
        ftp.auth()
        ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
        ftp.prot_p()
        ftp.voidcmd("TYPE I")
        ftp.cwd(root)
        if ftp.pwd().rstrip("/")!=root or not ftp.size("wp-load.php"):
            raise RuntimeError("WordPress root identity failed")
        for rel in FILES:
            parent,name=rel.rsplit("/",1)
            ftp.cwd(root+"/"+parent)
            if ftp.pwd().rstrip("/")!=root+"/"+parent:raise RuntimeError("Remote path mismatch")
            mem=io.BytesIO()
            ftp.retrbinary("RETR "+name,mem.write)
            raw=mem.getvalue().replace(b"\r\n",b"\n")
            if not(100<len(raw)<160000 and raw.lstrip().startswith(b"<?php") and b"\x00" not in raw):
                raise RuntimeError("Bad remote PHP content format")
            decoded=raw.decode("utf-8")
            if re.search(r"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|(?:sk-|gsk_|ghp_|github_pat_|AIza)[A-Za-z0-9_-]{12,}",decoded):
                raise RuntimeError("Possible secret embedded in source")
            data[rel]=raw
    finally:
        try:ftp.quit()
        except Exception:ftp.close()

    # Reuse existing source-only capture from run #40619285984; no duplicate reads of those classes.
    git("fetch","--depth=1","origin","refs/heads/"+BRANCH)
    git("checkout","-b",BRANCH,"FETCH_HEAD")
    checkpoint=REPO/"docs/checkpoints/PSE_AGENT_LIVE_RUNTIME_SNAPSHOT_20261028.md"
    old=checkpoint.read_text(encoding="utf-8")
    if "Captured exactly two PHP class files" not in old or "## Additional captured classes" in old:
        raise RuntimeError("Unexpected snapshot state or already captured")
    addition=["","## Additional captured classes (read-only second pass)","",
        "Three other reviewed PHP Agent class files were captured from the same verified live WordPress root.",
        "No remote writes or production deploy; this private branch remains audit-only.",""]
    for rel,raw in data.items():
        target=REPO/rel
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(raw)
        addition.append("- `"+rel+"`: SHA256 `"+hashlib.sha256(raw).hexdigest()+"`")
    checkpoint.write_text(old.rstrip()+"\n"+"\n".join(addition)+"\n",encoding="utf-8")
    git("add","--",*FILES,"docs/checkpoints/PSE_AGENT_LIVE_RUNTIME_SNAPSHOT_20261028.md")
    git("config","user.name","PSE Source Audit")
    git("config","user.email","pse-source-audit@users.noreply.github.com")
    git("commit","-m","audit(pse): preserve remaining live Agent class source for review")
    git("push","origin","HEAD:refs/heads/"+BRANCH)
    print("PSE_AGENT_PRIVATE_CLASS_CAPTURE=PASS files=3 total_audited=5 remote_writes=0")
if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("PSE_AGENT_PRIVATE_CLASS_CAPTURE=FAIL type="+type(exc).__name__)
        raise SystemExit(1)
