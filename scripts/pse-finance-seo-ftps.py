#!/usr/bin/env python3
"""Scoped, SHA-verified FTPS update of PSE WordPress post SEO REST field.
Backs up the original PHP outside public_html; no Astro build.
"""
from __future__ import annotations
import ftplib,hashlib,io,os,re
from pathlib import Path
ROOT="/domains/admin-pse.webnvn.com/public_html"
REL="wp-content/mu-plugins/pse-legacy-article-seo-rest.php"
REMOTE=ROOT+"/"+REL
SOURCE=Path("source-php")/REL
BACKUP="/domains/admin-pse.webnvn.com/.pse-php-rollback"
def sha(b):return hashlib.sha256(b).hexdigest()
def read(ftp,path):
    b=io.BytesIO()
    ftp.retrbinary("RETR "+path,b.write,blocksize=65536)
    return b.getvalue()
def upload(ftp,path,data):
    ftp.storbinary("STOR "+path,io.BytesIO(data),blocksize=65536)
def main():
    env=[x.split("=",1)[1].strip(" '\"") for x in os.environ.get("ENV_FILE","").splitlines() if x.strip().startswith("WC_URL=")]
    if env!=["https://admin-pse.webnvn.com"]:raise RuntimeError("WordPress host mismatch")
    raw=os.environ.get("FTP_SERVER","").removeprefix("ftp://").removeprefix("ftps://")
    host,sep,port=raw.partition(":")
    if not re.fullmatch(r"[A-Za-z0-9.-]+",host) or (sep and port!="21"):raise RuntimeError("FTPS host invalid")
    user,pwd=os.environ.get("FTP_USERNAME",""),os.environ.get("FTP_PASSWORD","")
    if not user or not pwd:raise RuntimeError("FTPS secret missing")
    new=SOURCE.read_bytes()
    if b"Plugin Name: PSE Legacy Article SEO REST Field" not in new or b"pse_seo_title" not in new or b"pse_seo_description" not in new:raise RuntimeError("SEO PHP contract changed")
    with ftplib.FTP_TLS(timeout=45) as ftp:
        ftp.connect(host,21,timeout=45)
        ftp.login(user,pwd)
        ftp.prot_p()
        core=read(ftp,ROOT+"/wp-load.php")
        if not core.lstrip().startswith(b"<?php"):raise RuntimeError("Not PSE WordPress host")
        old=read(ftp,REMOTE)
        if b"PSE Legacy Article SEO REST Field" not in old or b"pse_seo_description" not in old:
            raise RuntimeError("Unexpected installed WordPress SEO contract")
        if sha(old)==sha(new):
            print("PSE_FINANCE_SEO_FTPS=UNCHANGED_VERIFIED; sha256="+sha(new))
            return
        backup=f"{BACKUP}/{os.environ.get('GITHUB_RUN_ID','unknown')}-pse-legacy-seo-rest.php"
        try:ftp.mkd(BACKUP)
        except ftplib.error_perm as e:
            if not str(e).startswith("550"):raise
        upload(ftp,backup,old)
        if sha(read(ftp,backup))!=sha(old):raise RuntimeError("Rollback copy not verified")
        try:
            upload(ftp,REMOTE,new)
            if sha(read(ftp,REMOTE))!=sha(new):
                raise RuntimeError("PSE SEO PHP upload SHA mismatch")
        except Exception:
            upload(ftp,REMOTE,old)
            if sha(read(ftp,REMOTE))!=sha(old):raise RuntimeError("SEO PHP rollback failed")
            raise
        print("PSE_FINANCE_SEO_FTPS=DEPLOY_VERIFIED; backup=private; bytes="+str(len(new))+"; sha256="+sha(new))
        ftp.quit()
if __name__=="__main__":main()
