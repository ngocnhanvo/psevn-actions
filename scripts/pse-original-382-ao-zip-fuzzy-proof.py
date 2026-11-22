#!/usr/bin/env python3
"""Verify original Joomla ZIP filename variants and exact live FTP candidate path hashes.
Metadata-only REST from the 1.25GB original ZIP. No image bodies, CMS or FTP writes.
"""
import hashlib,importlib.util,json,os,struct,sys,unicodedata,re
from pathlib import Path
spec=importlib.util.spec_from_file_location("ftp_zip",Path("scripts/pse-original-ftp-zip-toc-readonly.py"))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
FIXTURE=Path("docs/source/pse-original-public-articles-11-2026-11-22.json")
OUT=Path("artifacts/pse-original-382-ao-zip-fuzzy-proof/report.json")
TARGET_HASHES={
 "3ed23465173338e05687d2b3e5cb19df2d5a922c03e2c98def55f9fcaf45b6de",
 "94e1a8b035c3050a21fae53f3df49dc1244616b452331f0918c364cc1c9533d2",
}
TARGET_SIZE=269085
def exact(s):return unicodedata.normalize("NFC",s).casefold()
def similar(s):
 s=unicodedata.normalize("NFKD",exact(s)).replace("đ","d")
 return re.sub("[^a-z0-9]","", "".join(c for c in s if not unicodedata.combining(c)))
def candidate_relative_path(raw):
 name=raw.replace(chr(92),"/").strip("/")
 chunks=[c for c in name.split("/") if c]
 if not chunks or any(x in (".","..") for x in chunks):return []
 return ["/".join(chunks[i:]) for i in range(len(chunks))]
def parse_toc(buf,num):
 at=0;count=0;rows=[]
 while at<len(buf):
  if at+46>len(buf) or buf[at:at+4]!=b"PK\x01\x02":raise ValueError("invalid_zip_toc")
  compressed=int.from_bytes(buf[at+20:at+24],"little")
  size=int.from_bytes(buf[at+24:at+28],"little")
  method=int.from_bytes(buf[at+10:at+12],"little")
  flags=int.from_bytes(buf[at+8:at+10],"little")
  n=int.from_bytes(buf[at+28:at+30],"little")
  ex=int.from_bytes(buf[at+30:at+32],"little")
  cm=int.from_bytes(buf[at+32:at+34],"little")
  end=at+46+n+ex+cm
  if end>len(buf):raise ValueError("invalid_zip_entry_end")
  fname=buf[at+46:at+46+n].decode("utf8","replace").replace(chr(92),"/")
  if not fname.endswith("/") and similar(fname.split("/")[-1])==similar("Áo_2.JPG"):
   suffixes=candidate_relative_path(fname)
   matched=[p for p in suffixes if hashlib.sha256(p.encode("utf8")).hexdigest() in TARGET_HASHES]
   media_path=[p for p in matched if p.startswith(("images/","media/"))]
   rows.append(dict(file_index=count,size_bytes=size,compressed_bytes=compressed,method=method,
      encrypted=bool(flags&1),same_size_as_live_candidate=size==TARGET_SIZE,
      matches_live_path_hash=bool(matched),
      # Reveal only explicitly scoped PUBLIC image/media paths.
      public_media_relative_path=media_path[0] if media_path else None,
      basename_variant_exact=exact(fname.split("/")[-1])==exact("Áo_2.JPG")))
  count+=1;at=end
 if count!=num:raise ValueError("zip_toc_count_mismatch")
 return dict(schema="pse-original-382-ao-source-zip-fuzzy-path-v1",
   total_archive_entries=num,candidate_zip_variants=rows,
   target_live_candidate_hashes=len(TARGET_HASHES),
   same_size=sum(x["same_size_as_live_candidate"] for x in rows),
   exact_live_relative_path_hashes=sum(x["matches_live_path_hash"] for x in rows),
   no_ftp_writes=True,no_wp_writes=True,no_photo_bodies_read=True)
def main():
 if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise ValueError("wrong_repo")
 doc=json.loads(FIXTURE.read_text(encoding="utf8"))
 if doc.get("schema")!="pse-original-joomla-selected-public-articles-v1" or len(doc.get("entries",[]))!=11:raise ValueError("fixture_changed")
 x=[r for r in doc["entries"] if r["source_id"]==382]
 if len(x)!=1 or len(x[0]["inline_image_src"])!=3 or "Áo_2.JPG" not in x[0]["inline_image_src"][0]:raise ValueError("382_photo_changed")
 if base.source.env("PSE_SOURCE_FTP_PROTOCOL")!="ftps":raise ValueError("ftps_only")
 host,port=base.source.validated_host("ftps");ftp=None
 try:
  ftp=base.source.FTPS(host,port,base.source.env("PSE_SOURCE_FTP_USERNAME"),base.source.env("PSE_SOURCE_FTP_PASSWORD"))
  root=ftp.listdir(base.ROOT)
  markers={n.casefold() for n,_,_ in root}
  if not all(x in markers for x in ("configuration.php","administrator","components","images")):raise ValueError("joomla_root_wrong")
  z=[(n,s) for n,k,s in root if k=="file" and n.lower().endswith(".zip") and s==base.EXPECTED_SIZE]
  if len(z)!=1:raise ValueError("zip_identity_wrong")
  name,size=z[0];ftp.c.cwd(base.ROOT)
  tail=base.read_rest_to_eof(ftp.c,name,size-65557,65557)
  directory=base.central_directory_location(tail,size)
  remainder=base.read_rest_to_eof(ftp.c,name,directory["cd_offset"],base.MAX_TRANSFER)
  if len(remainder)!=size-directory["cd_offset"]:raise ValueError("zip_toc_range_wrong")
  report=parse_toc(remainder[:directory["cd_size"]],directory["entries"])
  OUT.parent.mkdir(parents=True,exist_ok=True)
  OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
  print("PSE_382_AO_SOURCE_ARCHIVE_CANDIDATES="+json.dumps(report,ensure_ascii=False),flush=True)
 finally:
  if ftp:ftp.close()
if __name__=="__main__":
 try:main()
 except Exception as e:
  safe={"wrong_repo","fixture_changed","382_photo_changed","ftps_only","joomla_root_wrong",
        "zip_identity_wrong","zip_toc_range_wrong","invalid_zip_toc","invalid_zip_entry_end","zip_toc_count_mismatch"}
  print("PSE_382_AO_ZIP_FUZZY_PROOF_ERROR="+(str(e) if str(e) in safe else e.__class__.__name__),file=sys.stderr)
  sys.exit(1)
