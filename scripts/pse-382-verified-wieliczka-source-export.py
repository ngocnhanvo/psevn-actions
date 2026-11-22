#!/usr/bin/env python3
"""Original #382 Wieliczka JPEG: exact hashed live path, SHA-pinned bytes, temp only."""
import hashlib,importlib.util,json,os,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location("ftp",Path("scripts/pse-original-ftp-readonly.py"))
ftpbase=importlib.util.module_from_spec(spec);spec.loader.exec_module(ftpbase)
ROOT="/domains/pse.vn/public_html"
DIR=ROOT+"/images/web"
PATH_SHA="becc367010421ecf87b192e2263076057bd311449fd0e3bbdeccb4c5839911c6"
SHA="206537e10a6bf2a95c5943aa17140b0a83ccc3b8b9921b9f8d59c5d5eaffaa5b"
SIZE=143031
OUT=Path("/tmp/pse-382-original-Wieliczka.JPG")
def main():
 if os.getenv("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions" or os.getenv("PSE_382_WIELICZKA_BACKUP_READY")!="yes":
  raise ValueError("not_authorized")
 if ftpbase.env("PSE_SOURCE_FTP_PROTOCOL")!="ftps":raise ValueError("ftps_only")
 host,port=ftpbase.validated_host("ftps");ftp=None
 try:
  ftp=ftpbase.FTPS(host,port,ftpbase.env("PSE_SOURCE_FTP_USERNAME"),ftpbase.env("PSE_SOURCE_FTP_PASSWORD"))
  root=ftp.listdir(ROOT)
  if not {"configuration.php","administrator","components","images"}.issubset({n.casefold() for n,_,_ in root}):
   raise ValueError("source_joomla_root_changed")
  rows=ftp.listdir(DIR)
  matches=[(n,z) for n,t,z in rows if t=="file" and
   hashlib.sha256(("images/web/"+n).encode("utf8")).hexdigest()==PATH_SHA]
  if len(matches)!=1 or matches[0][1]!=SIZE:raise ValueError("original_archive_path_changed")
  name,size=matches[0];data=bytearray();ftp.c.cwd(DIR)
  def add(b):
   if len(data)+len(b)>SIZE:raise ValueError("original_image_too_large")
   data.extend(b)
  ftp.c.retrbinary("RETR "+name,add,blocksize=65536)
  raw=bytes(data)
  if len(raw)!=SIZE or hashlib.sha256(raw).hexdigest()!=SHA or not raw.startswith(b"\xff\xd8\xff") or not raw.endswith(b"\xff\xd9"):
   raise ValueError("original_photo_sha256_changed")
  fd=os.open(OUT,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
  with os.fdopen(fd,"wb") as out:out.write(raw)
  print("PSE_382_WIELICZKA_PRIVATE_EXPORT="+json.dumps({"source_id":382,"bytes":SIZE,"sha256":SHA,"no_ftp_writes":True,"bytes_artifact":False}),flush=True)
 finally:
  if ftp:ftp.close()
if __name__=="__main__":
 try:main()
 except Exception as e:
  OUT.unlink(missing_ok=True)
  safe={"not_authorized","ftps_only","source_joomla_root_changed","original_archive_path_changed",
        "original_image_too_large","original_photo_sha256_changed"}
  print("PSE_382_WIELICZKA_EXPORT_ERROR="+(str(e) if str(e) in safe else e.__class__.__name__),file=sys.stderr);sys.exit(1)
