#!/usr/bin/env python3
"""Export EXACT original #382 Austria JPEG from owner Joomla FTP into runner-only /tmp.
Run ONLY after a fresh Updraft rollback backup, never include bytes in artifacts.
"""
import hashlib,importlib.util,json,os,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location("base",Path("scripts/pse-original-ftp-readonly.py"))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
ROOT="/domains/pse.vn/public_html"
DIR=ROOT+"/images/tin-tuc"
NAME="Ao_2.JPG"
SIZE=269085
SHA="7a190b8e1c4144e8b9f4aeab0a7aedf415cc74281212ce100cc61dd31db08964"
OUT=Path("/tmp/pse-382-original-Ao_2.JPG")
def main():
 if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions" or os.environ.get("PSE_382_AO_BACKUP_READY")!="yes":
  raise ValueError("not_authorized")
 if base.env("PSE_SOURCE_FTP_PROTOCOL")!="ftps":raise ValueError("ftps_required")
 host,port=base.validated_host("ftps");ftp=None
 try:
  ftp=base.FTPS(host,port,base.env("PSE_SOURCE_FTP_USERNAME"),base.env("PSE_SOURCE_FTP_PASSWORD"))
  root=ftp.listdir(ROOT)
  if not all(x in {n.casefold() for n,_,_ in root} for x in ("configuration.php","administrator","components","images")):
   raise ValueError("joomla_root_not_verified")
  rows=ftp.listdir(DIR)
  matched=[(n,size) for n,k,size in rows if k=="file" and n==NAME]
  if len(matched)!=1 or matched[0][1]!=SIZE:raise ValueError("original_image_identity_changed")
  ftp.c.cwd(DIR);body=bytearray()
  def add(chunk):
   if len(body)+len(chunk)>SIZE:raise ValueError("image_larger_than_verified")
   body.extend(chunk)
  ftp.c.retrbinary("RETR "+NAME,add,blocksize=65536)
  binary=bytes(body)
  if len(binary)!=SIZE or hashlib.sha256(binary).hexdigest()!=SHA or not binary.startswith(b"\xff\xd8\xff") or not binary.endswith(b"\xff\xd9"):
   raise ValueError("source_original_image_byte_proof_changed")
  fd=os.open(OUT,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
  with os.fdopen(fd,"wb") as f:f.write(binary)
  print("PSE_382_AO_SOURCE_PRIVATE_EXPORT="+json.dumps({"original_source_id":382,"bytes":SIZE,"sha256":SHA,"no_ftp_writes":True,"private_temp_file_only":True}),flush=True)
 finally:
  if ftp:ftp.close()
if __name__=="__main__":
 try:main()
 except Exception as e:
  OUT.unlink(missing_ok=True)
  safe={"not_authorized","ftps_required","joomla_root_not_verified","original_image_identity_changed",
     "image_larger_than_verified","source_original_image_byte_proof_changed"}
  print("PSE_382_AO_PRIVATE_EXPORT_ERROR="+(str(e) if str(e) in safe else e.__class__.__name__),file=sys.stderr);sys.exit(1)
