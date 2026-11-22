#!/usr/bin/env python3
"""Metadata-only old Joomla ZIP name leads for missing third #382 Wieliczka image.
No ZIP content extraction, no FTP/WP writes, no original JPEG body transfer.
"""
import importlib.util,json,os,re,sys,unicodedata
from pathlib import Path
spec=importlib.util.spec_from_file_location("toc",Path("scripts/pse-original-ftp-zip-toc-readonly.py"))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
OUT=Path("artifacts/pse-original-382-wieliczka-zip-name-leads/report.json")
def norm(s):
 s=unicodedata.normalize("NFKD",s.casefold()).replace("đ","d")
 return "".join(ch for ch in s if not unicodedata.combining(ch))
def map_toc(buf,num):
 rows=[];at=0;count=0
 while at<len(buf):
  if at+46>len(buf) or buf[at:at+4]!=b"PK\x01\x02":raise ValueError("zip_toc_bad_header")
  uncompressed=int.from_bytes(buf[at+24:at+28],"little")
  n=int.from_bytes(buf[at+28:at+30],"little")
  extra=int.from_bytes(buf[at+30:at+32],"little")
  comment=int.from_bytes(buf[at+32:at+34],"little")
  end=at+46+n+extra+comment
  if end>len(buf):raise ValueError("zip_toc_entry_bounds")
  raw=buf[at+46:at+46+n]
  name=raw.decode("utf8","replace").replace("\\","/")
  tail=name.split("/")[-1];normalized=norm(tail)
  # Only older PSE PUBLIC Joomla images, not personal backup names.
  public=("/images/web/" in name.lower() or "/images/tin-tuc/" in name.lower())
  if public and tail.lower().endswith((".jpg",".jpeg",".png",".gif")):
   leads=[key for key in ("wieliczka","muoi","135m","balan","ba_lan","ba lan","ao_2") if key in normalized]
   if leads:
    # Only public-image filenames and file metadata. Not owner SQL private data.
    if len(rows)<150:
     rows.append(dict(public_rel_path=name[name.lower().find("/images/")+1:],
      zip_entry_index=count,uncompressed_bytes=uncompressed,matched_keywords=leads))
  at=end;count+=1
 if count!=num:raise ValueError("zip_entry_count_changed")
 return {"schema":"pse-original-382-wieliczka-archive-leads-v1",
  "total_archive_entries":num,"keyword_candidate_count":len(rows),
  "candidates":rows,"image_bytes_read":0,"ftp_writes":0,"wp_writes":0,
  "source_media_identity_verified":False}
def main():
 if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise ValueError("wrong_repo")
 if base.source.env("PSE_SOURCE_FTP_PROTOCOL")!="ftps":raise ValueError("ftps_only")
 host,port=base.source.validated_host("ftps");ftp=None
 try:
  ftp=base.source.FTPS(host,port,base.source.env("PSE_SOURCE_FTP_USERNAME"),base.source.env("PSE_SOURCE_FTP_PASSWORD"))
  root=ftp.listdir(base.ROOT)
  if not all(x in {n.casefold() for n,_,_ in root} for x in ("configuration.php","administrator","components","images")):raise ValueError("joomla_root_wrong")
  z=[(n,size) for n,kind,size in root if kind=="file" and n.lower().endswith(".zip") and size==base.EXPECTED_SIZE]
  if len(z)!=1:raise ValueError("original_zip_identity_changed")
  name,size=z[0];ftp.c.cwd(base.ROOT)
  tail=base.read_rest_to_eof(ftp.c,name,size-65557,65557)
  cd=base.central_directory_location(tail,size)
  suffix=base.read_rest_to_eof(ftp.c,name,cd["cd_offset"],base.MAX_TRANSFER)
  if len(suffix)!=size-cd["cd_offset"]:raise ValueError("original_zip_toc_incomplete")
  report=map_toc(suffix[:cd["cd_size"]],cd["entries"])
  OUT.parent.mkdir(parents=True,exist_ok=True)
  OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
  print("PSE_382_WIELICZKA_ZIP_NAME_LEADS="+json.dumps(report,ensure_ascii=False),flush=True)
 finally:
  if ftp:ftp.close()
if __name__=="__main__":
 try:main()
 except Exception as e:
  safe={"wrong_repo","ftps_only","joomla_root_wrong","original_zip_identity_changed",
        "original_zip_toc_incomplete","zip_toc_bad_header","zip_toc_entry_bounds","zip_entry_count_changed"}
  print("PSE_382_WIELICZKA_SOURCE_ZIP_ERROR="+(str(e) if str(e) in safe else e.__class__.__name__),file=sys.stderr);sys.exit(1)
