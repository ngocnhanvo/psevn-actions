#!/usr/bin/env python3
"""READ ONLY: fingerprint exact PSE finance PDF paths left on WordPress FTP.
Print filenames and hashes only; do not download files to persistent storage.
"""
import ftplib, hashlib, json, os, re, urllib.request
from urllib.parse import quote
from datetime import datetime, timezone
from pathlib import PurePosixPath
base="/domains/admin-pse.webnvn.com/public_html"
directory=base+"/wp-content/uploads/2026/11"
raw=os.environ.get("FTP_SERVER","").removeprefix("ftp://").removeprefix("ftps://")
host,sep,port=raw.partition(":")
if not re.fullmatch(r"[A-Za-z0-9.-]+",host) or (sep and port!="21"):
    raise SystemExit("Invalid configured PSE FTP host")
user,pwd=os.environ.get("FTP_USERNAME",""),os.environ.get("FTP_PASSWORD","")
if not user or not pwd:raise SystemExit("FTP credentials missing")
env=[line.strip().split("=",1)[1].strip(" '\"") for line in os.environ.get("ENV_FILE","").splitlines() if line.strip().startswith("WC_URL=")]
if env!=["https://admin-pse.webnvn.com"]:raise SystemExit("Invalid PSE WordPress origin")
prefixes=("20261104","20260320","CBTT_BCTC_ban_nien","pse-legacy-")
report={"schema":"pse-finance-ftp-file-collision-v1","directory":"/wp-content/uploads/2026/11",
        "files":[],"media":[],"linkedPosts":[],"errors":[]}
with ftplib.FTP_TLS(timeout=40) as ftp:
    ftp.connect(host,21,timeout=40)
    ftp.login(user,pwd)
    ftp.prot_p()
    try:
        names=ftp.nlst(directory)
    except ftplib.error_perm as e:
        raise RuntimeError("PSE uploads directory listing unavailable") from e
    matched=[]
    for x in names:
        name=x.split("/")[-1]
        if name.startswith(prefixes[:3]) or re.fullmatch(r"pse-legacy-[0-9a-f]{16}\.pdf",name):
            matched.append((name,x if x.startswith("/") else directory+"/"+name))
    for name,path in sorted(matched):
        entry={"name":name,"relativePath":path.removeprefix(base),"remoteSize":None,"sha256":None,"modifiedUtc":None}
        try:
            entry["remoteSize"]=ftp.size(path)
            try:
                reply=ftp.sendcmd("MDTM "+path)
                if re.fullmatch(r"213 \d{14}",reply):
                    entry["modifiedUtc"]=reply[4:]
            except ftplib.all_errors:
                pass
            if name.startswith(prefixes[:3]):
                h=hashlib.sha256()
                ftp.retrbinary("RETR "+path,h.update,blocksize=1024*256)
                entry["sha256"]=h.hexdigest()
        except ftplib.all_errors as e:
            entry["error"]=type(e).__name__
        report["files"].append(entry)
    ftp.quit()

def api(path):
    req=urllib.request.Request("https://admin-pse.webnvn.com"+path,headers={"Accept":"application/json","User-Agent":"PSE-finance-readonly-audit"})
    with urllib.request.urlopen(req,timeout=45) as resp:
        return json.load(resp),dict(resp.headers)
for term in ("20261104","20260320","CBTT_BCTC_ban_nien"):
    docs,_=api("/wp-json/wp/v2/media?search="+quote(term,safe="")+"&per_page=100&_fields=id,slug,date,post,title,source_url")
    report["media"]+=docs
report["media"]=list({d["id"]:d for d in report["media"]}.values())
for post_type in ("posts","pages"):
    page=1
    while page<=20:
        try:
            docs,headers=api(f"/wp-json/wp/v2/{post_type}?per_page=100&page={page}&_fields=id,slug,content")
        except Exception as ex:
            report["errors"].append({"resource":post_type,"page":page,"type":type(ex).__name__})
            break
        for doc in docs:
            body=doc.get("content",{}).get("rendered","")
            names=[f["name"] for f in report["files"] if f["name"] in body]
            if names:report["linkedPosts"].append({"type":post_type,"id":doc["id"],"slug":doc["slug"],"fileNames":names})
        total=int(headers.get("X-WP-TotalPages","1"))
        if total>20:raise RuntimeError("Unexpected WP page count")
        if page>=total:break
        page+=1
with open("pse-finance-ftp-collision-report.json","w") as f:json.dump(report,f,indent=2)
print("PSE_FINANCE_FTP_COLLISION_AUDIT="+json.dumps(report,ensure_ascii=False))
