#!/usr/bin/env python3
"""Read and hash ONLY #382 original long-name Wieliczka JPEG from original FTP.
Source original archive path SHA and size independently pinned from ZIP metadata.
Never write FTP or WP; no original image bytes in logs/artifact.
"""
import hashlib,importlib.util,json,os,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location("source",Path("scripts/pse-original-ftp-readonly.py"))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
dimspec=importlib.util.spec_from_file_location("austria",Path("scripts/pse-original-382-ao-bytes-proof.py"))
dim=importlib.util.module_from_spec(dimspec);dimspec.loader.exec_module(dim)
ROOT="/domains/pse.vn/public_html"
FOLDER=ROOT+"/images/web"
EXPECTED_PATH_SHA="becc367010421ecf87b192e2263076057bd311449fd0e3bbdeccb4c5839911c6"
EXPECTED_SIZE=143031
OUT=Path("artifacts/pse-original-382-wieliczka-byte-proof/report.json")
def inspect(ftp):
 listing=ftp.listdir(ROOT)
 if not all(x in {n.casefold() for n,_,_ in listing} for x in ("configuration.php","administrator","components","images")):raise ValueError("joomla_root_wrong")
 candidates=[(n,size) for n,t,size in ftp.listdir(FOLDER) if t=="file" and
  hashlib.sha256(("images/web/"+n).encode("utf8")).hexdigest()==EXPECTED_PATH_SHA]
 if len(candidates)!=1 or candidates[0][1]!=EXPECTED_SIZE:raise ValueError("archive_filename_size_not_present")
 name,size=candidates[0];b=bytearray();ftp.c.cwd(FOLDER)
 def add(chunk):
  if len(b)+len(chunk)>EXPECTED_SIZE:raise ValueError("original_image_too_large")
  b.extend(chunk)
 ftp.c.retrbinary("RETR "+name,add,blocksize=65536)
 photo=bytes(b)
 if len(photo)!=EXPECTED_SIZE:raise ValueError("original_image_length_mismatch")
 width,height=dim.jpeg_dimensions(photo)
 return dict(schema="pse-original-382-wieliczka-verified-jpeg-v1",source_id=382,
  original_source_html="images/web/Mỏ_muối_Wieliczka_dưới_mặt_đất_135m_-_Ba_lan.JPG",
  original_url_filename_mojibake=True,verified_original_archive_path_sha=EXPECTED_PATH_SHA,
  size_bytes=len(photo),sha256=hashlib.sha256(photo).hexdigest(),width=width,height=height,
  original_photo="Wieliczka salt mine underground 135m, Poland",
  original_archive_source="original Joomla 1.25GB ZIP metadata and live exact path",
  byte_valid_jpeg=True,no_ftp_writes=True,no_wp_writes=True,no_original_file_in_artifact=True)
def main():
 if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise ValueError("wrong_repo")
 if base.env("PSE_SOURCE_FTP_PROTOCOL")!="ftps":raise ValueError("ftps_only")
 host,port=base.validated_host("ftps");ftp=None
 try:
  ftp=base.FTPS(host,port,base.env("PSE_SOURCE_FTP_USERNAME"),base.env("PSE_SOURCE_FTP_PASSWORD"))
  result=inspect(ftp)
  OUT.parent.mkdir(parents=True,exist_ok=True)
  OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
  print("PSE_382_WIELICZKA_SOURCE_JPEG_PROOF="+json.dumps(result,ensure_ascii=False),flush=True)
 finally:
  if ftp:ftp.close()
if __name__=="__main__":
 try:main()
 except Exception as e:
  safe={"wrong_repo","ftps_only","joomla_root_wrong","archive_filename_size_not_present",
        "original_image_too_large","original_image_length_mismatch","not_valid_jpeg_markers",
        "jpeg_marker_invalid","jpeg_marker_short","jpeg_segment_invalid",
        "jpeg_dimensions_out_of_bounds","jpeg_dimensions_missing"}
  print("PSE_382_WIELICZKA_SOURCE_JPEG_ERROR="+(str(e) if str(e) in safe else e.__class__.__name__),file=sys.stderr);sys.exit(1)
