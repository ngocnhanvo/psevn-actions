#!/usr/bin/env python3
"""Deploy only reviewed PSE archive ordering mu-plugin to the verified WordPress host."""
import ftplib,io,hashlib,os,re
from pathlib import Path
wp="/domains/admin-pse.webnvn.com/public_html"
rel="wp-content/mu-plugins/pse-annual-source-order.php"
local=Path("source-php")/rel
data=local.read_bytes()
if b"Plugin Name: PSE Annual Original Archive Order" not in data or b"pse_annual_source_order" not in data:
    raise RuntimeError("Reviewed archive sorting PHP identity mismatch")
env=[v.split("=",1)[1].strip(" '\"") for v in os.environ.get("ENV_FILE","").splitlines() if v.strip().startswith("WC_URL=")]
if env!=["https://admin-pse.webnvn.com"]:raise RuntimeError("Wrong WordPress host")
host_raw=os.environ.get("FTP_SERVER","").removeprefix("ftp://").removeprefix("ftps://")
host,sep,port=host_raw.partition(":")
if not re.fullmatch(r"[a-zA-Z0-9.-]+",host) or (sep and port!="21"):raise RuntimeError("Unexpected FTP server")
user,password=os.environ.get("FTP_USERNAME",""),os.environ.get("FTP_PASSWORD","")
if not user or not password:raise RuntimeError("Missing WordPress deploy secrets")
def sha(v):return hashlib.sha256(v).hexdigest()
def read(ftp,path):
    out=io.BytesIO()
    try:ftp.retrbinary("RETR "+path,out.write,blocksize=65536)
    except ftplib.error_perm as e:
        if str(e).startswith("550"):return None
        raise
    return out.getvalue()
with ftplib.FTP_TLS(timeout=40) as ftp:
    ftp.connect(host,21,timeout=40)
    ftp.login(user,password)
    ftp.prot_p()
    core=read(ftp,wp+"/wp-load.php")
    if core is None or not core.lstrip().startswith(b"<?php"):raise RuntimeError("WordPress root identity failed")
    remote=wp+"/"+rel
    before=read(ftp,remote)
    if before is not None and sha(before)!=sha(data):
        raise RuntimeError("PSE annual archive plugin already differs on hosting")
    if before is None:
        ftp.storbinary("STOR "+remote,io.BytesIO(data),blocksize=65536)
    after=read(ftp,remote)
    if after is None or sha(after)!=sha(data):raise RuntimeError("Source order plugin remote SHA mismatch")
    print("PSE_ANNUAL_ORDER_PLUGIN=DEPLOY_VERIFIED; sha256="+sha(data)+"; bytes="+str(len(data)))
    ftp.quit()
