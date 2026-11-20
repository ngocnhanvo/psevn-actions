#!/usr/bin/env python3
"""Deploy only new PSE governance ordering mu-plugin; fail closed on any collision."""
import ftplib, hashlib, io, os, re
from pathlib import Path
rel="wp-content/mu-plugins/pse-governance-source-order.php"
root="/domains/admin-pse.webnvn.com/public_html"
data=(Path("source-php")/rel).read_bytes()
if not data.startswith(b"<?php") or b"PSE Governance Original Archive Order" not in data or b"pse_governance_source_order" not in data:
    raise RuntimeError("Unreviewed governance plugin contents")
env=[line.split("=",1)[1].strip(" '\"") for line in os.environ.get("ENV_FILE","").splitlines() if line.strip().startswith("WC_URL=")]
if env!=["https://admin-pse.webnvn.com"]:raise RuntimeError("Wrong WordPress tenant")
h=os.environ.get("FTP_SERVER","").removeprefix("ftp://").removeprefix("ftps://")
host,sep,port=h.partition(":")
if not re.fullmatch(r"[A-Za-z0-9.-]+",host) or (sep and port!="21"):raise RuntimeError("Unexpected FTP server")
user,password=os.environ.get("FTP_USERNAME",""),os.environ.get("FTP_PASSWORD","")
if not user or not password:raise RuntimeError("Missing FTP credentials")
def sha(x):return hashlib.sha256(x).hexdigest()
def get(ftp,p):
    out=io.BytesIO()
    ftp.retrbinary("RETR "+p,out.write,blocksize=65536)
    return out.getvalue()
with ftplib.FTP_TLS(timeout=45) as ftp:
    ftp.connect(host,21,timeout=45)
    ftp.login(user,password)
    ftp.prot_p()
    if not get(ftp,root+"/wp-load.php").lstrip().startswith(b"<?php"):
        raise RuntimeError("WordPress deployment root mismatch")
    remote=root+"/"+rel
    try:existing=get(ftp,remote)
    except ftplib.error_perm as e:
        if not str(e).startswith("550"):raise
        existing=None
    if existing is not None and sha(existing)!=sha(data):
        raise RuntimeError("Governance plugin already exists with different content; refusing overwrite")
    created=False
    if existing is None:
        try:
            ftp.storbinary("STOR "+remote,io.BytesIO(data),blocksize=65536)
            created=True
            if sha(get(ftp,remote))!=sha(data):
                raise RuntimeError("PHP plugin readback SHA mismatch")
        except Exception:
            if created:
                try:ftp.delete(remote)
                except Exception:pass
            raise
    if sha(get(ftp,remote))!=sha(data):raise RuntimeError("Final PHP plugin SHA differs")
    print("PSE_GOV_PLUGIN=DEPLOY_VERIFIED; new="+str(created)+"; sha256="+sha(data)+"; bytes="+str(len(data)))
    ftp.quit()
