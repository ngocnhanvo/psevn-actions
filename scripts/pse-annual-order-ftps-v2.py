#!/usr/bin/env python3
"""Deploy one verified evolving PSE annual ordering mu-plugin with SHA-pinned rollback."""
import ftplib,io,hashlib,os,re
from pathlib import Path
wp="/domains/admin-pse.webnvn.com/public_html"
rel="wp-content/mu-plugins/pse-annual-source-order.php"
data=(Path("source-php")/rel).read_bytes()
if b"Plugin Name: PSE Annual Original Archive Order" not in data or b"pse_annual_source_order" not in data or b"['15', '16', '17', '18']" not in data:
    raise RuntimeError("Reviewed original 15-18 report ordering plugin mismatch")
old_sha="3a34a5ef7ebf7c22c6f7c0be71cbf589be7c2c039fbf8d70b7d5317be525d539"
env=[v.split("=",1)[1].strip(" '\"") for v in os.environ.get("ENV_FILE","").splitlines() if v.strip().startswith("WC_URL=")]
if env!=["https://admin-pse.webnvn.com"]:raise RuntimeError("Wrong tenant")
host_raw=os.environ.get("FTP_SERVER","").removeprefix("ftp://").removeprefix("ftps://")
host,sep,port=host_raw.partition(":")
if not re.fullmatch(r"[a-zA-Z0-9.-]+",host) or (sep and port!="21"):raise RuntimeError("Unexpected FTP endpoint")
user,password=os.environ.get("FTP_USERNAME",""),os.environ.get("FTP_PASSWORD","")
if not user or not password:raise RuntimeError("Missing deployment secrets")
def sha(data):return hashlib.sha256(data).hexdigest()
def fetch(ftp,p):
    out=io.BytesIO()
    ftp.retrbinary("RETR "+p,out.write,blocksize=65536)
    return out.getvalue()
with ftplib.FTP_TLS(timeout=40) as ftp:
    ftp.connect(host,21,timeout=40)
    ftp.login(user,password)
    ftp.prot_p()
    base=fetch(ftp,wp+"/wp-load.php")
    if not base.lstrip().startswith(b"<?php"):raise RuntimeError("WordPress root identity mismatch")
    remote=wp+"/"+rel
    original=fetch(ftp,remote)
    digest=sha(original)
    if digest not in [old_sha,sha(data)]:
        raise RuntimeError("Existing annual source order PHP has unexpected SHA; no overwrite")
    if digest!=sha(data):
        try:
            ftp.storbinary("STOR "+remote,io.BytesIO(data),blocksize=65536)
            after=fetch(ftp,remote)
            if sha(after)!=sha(data):
                raise RuntimeError("WordPress annual source order updated PHP SHA mismatch")
        except Exception:
            try:
                ftp.storbinary("STOR "+remote,io.BytesIO(original),blocksize=65536)
                if sha(fetch(ftp,remote))!=digest:raise RuntimeError("Rollback remote SHA mismatch")
            except Exception as e:
                raise RuntimeError("V2 deployment failed and rollback could not be verified") from e
            raise
    print("PSE_ANNUAL_ORDER_PLUGIN_V2=DEPLOY_VERIFIED; old_sha256="+digest+"; new_sha256="+sha(data)+"; bytes="+str(len(data)))
    ftp.quit()
