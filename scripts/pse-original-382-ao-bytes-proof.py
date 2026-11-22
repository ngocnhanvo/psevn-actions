#!/usr/bin/env python3
"""Read-only SHA/dimensions proof for two original #382 Austria JPG copies.
Paths are independently bound to verified 21,658-entry owner ZIP and live FTPS.
No Joomla FTP writes, no WordPress writes and no photo bytes in artifact/log.
"""
import hashlib,importlib.util,json,os,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location("ftp",Path("scripts/pse-original-ftp-readonly.py"))
ftpbase=importlib.util.module_from_spec(spec);spec.loader.exec_module(ftpbase)
ROOT="/domains/pse.vn/public_html"
EXPECTED_BYTES=269085
PATH_HASHES={
 "images/web":"94e1a8b035c3050a21fae53f3df49dc1244616b452331f0918c364cc1c9533d2",
 "images/tin-tuc":"3ed23465173338e05687d2b3e5cb19df2d5a922c03e2c98def55f9fcaf45b6de",
}
OUT=Path("artifacts/pse-original-382-ao-bytes-proof/report.json")
def jpeg_dimensions(data):
 if not data.startswith(b"\xff\xd8\xff") or not data.endswith(b"\xff\xd9"):
  raise ValueError("not_valid_jpeg_markers")
 at=2
 while at<len(data)-4:
  if data[at]!=255: raise ValueError("jpeg_marker_invalid")
  while data[at]==255:at+=1
  marker=data[at];at+=1
  if marker in (0xd8,0xd9) or 0xd0<=marker<=0xd7 or marker==0x01:continue
  if marker==0xda:break
  if at+2>len(data):raise ValueError("jpeg_marker_short")
  size=int.from_bytes(data[at:at+2],"big")
  if size<2 or at+size>len(data):raise ValueError("jpeg_segment_invalid")
  if marker in (0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb):
   height=int.from_bytes(data[at+3:at+5],"big");width=int.from_bytes(data[at+5:at+7],"big")
   if width<100 or height<100 or width>10000 or height>10000:
    raise ValueError("jpeg_dimensions_out_of_bounds")
   return width,height
  at+=size
 raise ValueError("jpeg_dimensions_missing")
def collect(ftp):
 root=ftp.listdir(ROOT)
 markers={n.casefold() for n,_,_ in root}
 if not all(x in markers for x in ("configuration.php","administrator","components","images")):raise ValueError("wrong_original_root")
 result=[]
 for folder,expected in PATH_HASHES.items():
  listing=ftp.listdir(ROOT+"/"+folder)
  matches=[(n,sz) for n,kind,sz in listing if kind=="file" and
      hashlib.sha256((folder+"/"+n).encode("utf8")).hexdigest()==expected]
  if len(matches)!=1 or matches[0][1]!=EXPECTED_BYTES:raise ValueError("original_archive_file_identity_changed")
  n,size=matches[0];b=bytearray()
  def add(chunk):
   if len(b)+len(chunk)>EXPECTED_BYTES:raise ValueError("file_bounded_bytes_exceeded")
   b.extend(chunk)
  ftp.c.cwd(ROOT+"/"+folder)
  ftp.c.retrbinary("RETR "+n,add,blocksize=65536)
  raw=bytes(b)
  if len(raw)!=EXPECTED_BYTES:raise ValueError("file_size_readback_changed")
  width,height=jpeg_dimensions(raw)
  digest=hashlib.sha256(raw).hexdigest()
  result.append(dict(source_folder=folder,verified_path_sha256=expected,
    original_bytes=len(raw),sha256=digest,width=width,height=height))
 if len({x["sha256"] for x in result})!=1:raise ValueError("two_original_copies_have_different_bytes")
 return dict(schema="pse-original-382-ao-verified-bytes-v1",source_id=382,
  original_joomla_caption="Đoàn PVFCCo SE tại Áo",
  jpeg_copies=result,matching_sha256=result[0]["sha256"],
  exact_copy_bytes=EXPECTED_BYTES,unique_identical_copies=2,
  no_ftp_writes=True,no_wp_writes=True,no_public_post_writes=True,no_jpeg_in_artifact=True)
def main():
 if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise ValueError("wrong_repo")
 if ftpbase.env("PSE_SOURCE_FTP_PROTOCOL")!="ftps":raise ValueError("ftps_only")
 host,port=ftpbase.validated_host("ftps");ftp=None
 try:
  ftp=ftpbase.FTPS(host,port,ftpbase.env("PSE_SOURCE_FTP_USERNAME"),ftpbase.env("PSE_SOURCE_FTP_PASSWORD"))
  report=collect(ftp)
  OUT.parent.mkdir(parents=True,exist_ok=True)
  OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
  print("PSE_382_AO_EXACT_FTP_BYTES_PROOF="+json.dumps(report,ensure_ascii=False))
 finally:
  if ftp:ftp.close()
if __name__=="__main__":
 try:main()
 except Exception as e:
  safe={"wrong_repo","ftps_only","wrong_original_root","original_archive_file_identity_changed",
   "file_bounded_bytes_exceeded","file_size_readback_changed","not_valid_jpeg_markers",
   "jpeg_marker_invalid","jpeg_marker_short","jpeg_segment_invalid",
   "jpeg_dimensions_out_of_bounds","jpeg_dimensions_missing","two_original_copies_have_different_bytes"}
  print("PSE_382_AO_SOURCE_BYTES_ERROR="+(str(e) if str(e) in safe else e.__class__.__name__),file=sys.stderr)
  sys.exit(1)
