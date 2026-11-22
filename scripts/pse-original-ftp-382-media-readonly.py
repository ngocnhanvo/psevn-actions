#!/usr/bin/env python3
"""Source original Joomla #382 3 images path-exact evidence; never upload or modify FTP."""
import hashlib,importlib.util,json,os,sys,unicodedata
from pathlib import Path
src=importlib.util.spec_from_file_location("ftp",Path("scripts/pse-original-ftp-readonly.py"))
base=importlib.util.module_from_spec(src);src.loader.exec_module(base)
ROOT="/domains/pse.vn/public_html"
SOURCE_DIR=ROOT+"/images/web"
NAMES=("Áo_2.JPG","Ba_Lan.JPG","Mỏ_muối_Wieliczka_dưới_mặt_đất_135m_-_Ba_lan.JPG")
MAX_IMAGE=8*1024*1024
OUT=Path("artifacts/pse-original-ftp-382-media-readonly/summary.json")
def norm(v):return unicodedata.normalize("NFC",v).casefold()
def jpg_ok(data):
    return len(data)>512 and data[:3]==b"\xff\xd8\xff" and data[-2:]==b"\xff\xd9"
def inspect(client):
    root=client.listdir(ROOT)
    markers={n.casefold() for n,_,_ in root}
    if not all(x in markers for x in ("configuration.php","administrator","components","images")):
        raise ValueError("source_root_mismatch")
    try:
        directory=client.listdir(SOURCE_DIR)
    except Exception as e:
        return {"directory_status":"NOT_READABLE","error_type":e.__class__.__name__,
                "expected":len(NAMES),"exact_matches":0,"verified_original_images":0,
                "files_read":0,"modified_files":0,"deleted_files":0}
    results=[]
    listed={norm(name):[(name,kind,size) for name,kind,size in directory if norm(name)==norm(wanted)]
            for wanted in NAMES}
    for index,wanted in enumerate(NAMES,1):
        records=listed[norm(wanted)]
        if len(records)!=1 or records[0][1]!="file":
            results.append({"source_image_index":index,"status":"NOT_EXACT_UNIQUE_MATCH",
                            "match_count":len(records)})
            continue
        name,kind,size=records[0]
        if size<512 or size>MAX_IMAGE:
            results.append({"source_image_index":index,"status":"SIZE_OUT_OF_BOUNDS"})
            continue
        binary=bytearray()
        def add(block):
            if len(binary)+len(block)>MAX_IMAGE:raise ValueError("bounded_image_limit")
            binary.extend(block)
        client.c.cwd(SOURCE_DIR)
        client.c.retrbinary("RETR "+name,add,blocksize=65536)
        data=bytes(binary)
        if len(data)!=size or not jpg_ok(data):
            results.append({"source_image_index":index,"status":"IMAGE_BYTE_VALIDATION_FAILED"})
            continue
        results.append({"source_image_index":index,"status":"EXACT_ORIGINAL_PATH_AND_BYTES_VERIFIED",
                        "size_bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),
                        "source_site":"pse.vn","original_directory_verified":True})
    return {"directory_status":"READABLE","expected":len(NAMES),
            "exact_matches":sum(x["status"]!="NOT_EXACT_UNIQUE_MATCH" for x in results),
            "verified_original_images":sum(x["status"]=="EXACT_ORIGINAL_PATH_AND_BYTES_VERIFIED" for x in results),
            "results":results,"files_read":sum(x["status"]=="EXACT_ORIGINAL_PATH_AND_BYTES_VERIFIED" for x in results),
            "bytes_read":sum(x.get("size_bytes",0) for x in results),
            "modified_files":0,"deleted_files":0}
def main():
    if os.getenv("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise ValueError("wrong_repo")
    if base.env("PSE_SOURCE_FTP_PROTOCOL")!="ftps":raise ValueError("ftps_only")
    host,port=base.validated_host("ftps")
    connection=None
    try:
        connection=base.FTPS(host,port,base.env("PSE_SOURCE_FTP_USERNAME"),base.env("PSE_SOURCE_FTP_PASSWORD"))
        report=inspect(connection)
        report.update(schema="pse-original-382-media-verified-v1",
                      original_joomla_host_trusted=True,no_wp_writes=True,no_ftp_writes=True,
                      image_bodies_in_artifact=False)
        OUT.parent.mkdir(parents=True,exist_ok=True)
        OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print("PSE_382_SOURCE_FTP_MEDIA="+json.dumps(report,ensure_ascii=False))
    finally:
        if connection:connection.close()
if __name__=="__main__":
    try:main()
    except Exception as e:
        safe={"wrong_repo","ftps_only","source_root_mismatch","bounded_image_limit"}
        print("PSE_382_SOURCE_FTP_MEDIA_ERROR="+
              (str(e) if str(e) in safe else e.__class__.__name__),file=sys.stderr)
        sys.exit(1)
