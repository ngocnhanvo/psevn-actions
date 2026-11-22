#!/usr/bin/env python3
"""Inspect original pse.vn large ZIP central directory only via verified FTPS REST.

No full ZIP download, no file contents, no extraction and NO remote writes.
No raw archive filenames or credentials in logs/artifacts.
"""
import collections,ftplib,importlib.util,json,os,struct,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location("sourceftp",Path("scripts/pse-original-ftp-readonly.py"))
source=importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)
ROOT="/domains/pse.vn/public_html"
EXPECTED_SIZE=1_256_229_536
MAX_CENTRAL_DIRECTORY=8*1024*1024
MAX_TRANSFER=MAX_CENTRAL_DIRECTORY+256*1024
OUT=Path("artifacts/pse-original-ftp-zip-toc-readonly/summary.json")

def central_directory_location(tail,archive_size):
    pos=tail.rfind(b"PK\x05\x06")
    if pos<0 or len(tail)-pos<22:raise ValueError("zip_eocd_unavailable")
    sig,disk,cd_disk,on_disk,entries,cd_size,cd_offset,comment=struct.unpack_from("<IHHHHIIH",tail,pos)
    if disk!=0 or cd_disk!=0 or on_disk!=entries:raise ValueError("zip_multidisk_not_allowed")
    if any(v in (0xffff,0xffffffff) for v in (entries,cd_size,cd_offset)):
        raise ValueError("zip64_metadata_requires_separate_review")
    if cd_size>MAX_CENTRAL_DIRECTORY:raise ValueError("zip_central_directory_too_large")
    if cd_offset+cd_size>archive_size or cd_offset<0:
        raise ValueError("zip_directory_out_of_bounds")
    return {"entries":entries,"cd_size":cd_size,"cd_offset":cd_offset}

def summarize_directory(buf,expected_entries):
    # Only ZIP Central File Header entries are read; no decompression or data retrieval.
    offset=0
    total=0
    by_suffix=collections.Counter()
    webroot_signals=collections.Counter()
    while offset<len(buf):
        if offset+46>len(buf) or buf[offset:offset+4]!=b"PK\x01\x02":
            raise ValueError("invalid_zip_central_directory")
        name_len,extra_len,comment_len=struct.unpack_from("<HHH",buf,offset+28)
        end=offset+46+name_len+extra_len+comment_len
        if end>len(buf):raise ValueError("truncated_zip_central_directory")
        name=buf[offset+46:offset+46+name_len].decode("utf-8","replace")
        parts=[p.casefold() for p in name.replace("\\","/").split("/") if p]
        if parts:
            base=parts[-1]
            if not name.endswith("/"):
                total+=1
                for s in (".sql.gz",".sql",".jpa",".jps",".zip",".php",".jpg",".jpeg",".png",".pdf"):
                    if base.endswith(s):
                        by_suffix[s]+=1
                        break
                if base=="configuration.php":
                    webroot_signals["joomla_config_basename"]+=1
            for key in ("administrator","components","images","media"):
                if key in parts:webroot_signals[key]+=1
        offset=end
        if total>100_000:raise ValueError("zip_entry_count_limit")
    if offset!=len(buf):raise ValueError("zip_directory_boundary")
    return {"declared_entries":expected_entries,
       "files_seen":total,
       "file_suffix_counts":dict(by_suffix),
       "joomla_archive_indicators":dict(webroot_signals),
       "raw_paths_logged":False,
       "raw_file_bytes_downloaded":False,
       "zip_archive_fully_downloaded":False,
       "no_extraction":True,
       "no_remote_writes":True}

def read_rest_to_eof(ftp,name,offset,limit):
    ftp.voidcmd("TYPE I")
    sock=ftp.transfercmd("RETR "+name,rest=offset)
    data=bytearray()
    try:
        while True:
            block=sock.recv(min(262144,max(1,limit+1-len(data))))
            if not block:break
            data.extend(block)
            if len(data)>limit:
                raise ValueError("ftp_rest_range_exceeds_limit")
    finally:
        sock.close()
    ftp.voidresp()
    return bytes(data)

def main():
    if os.getenv("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":
        raise ValueError("wrong_repo")
    protocol=source.env("PSE_SOURCE_FTP_PROTOCOL")
    if protocol!="ftps":
        raise ValueError("ftps_rest_only")
    host,port=source.validated_host("ftps")
    ftp=None
    try:
        ftp=source.FTPS(host,port,source.env("PSE_SOURCE_FTP_USERNAME"),source.env("PSE_SOURCE_FTP_PASSWORD"))
        rows=ftp.listdir(ROOT)
        markers={name.casefold() for name,_,_ in rows}
        if not all(s in markers for s in ("configuration.php","administrator","components","images")):
            raise ValueError("joomla_root_unverified")
        candidates=[(name,size) for name,t,size in rows if t=="file" and name.casefold().endswith(".zip") and size==EXPECTED_SIZE]
        if len(candidates)!=1:
            raise ValueError("source_large_zip_identity_changed")
        name,size=candidates[0]
        ftp.c.cwd(ROOT)
        tail=read_rest_to_eof(ftp.c,name,size-65557,65557)
        cd=central_directory_location(tail,size)
        # Reading from the central-directory offset to the archive EOF, not full ZIP.
        to_read=size-cd["cd_offset"]
        if to_read>MAX_TRANSFER:
            raise ValueError("zip_toc_rest_tail_too_large")
        suffix=read_rest_to_eof(ftp.c,name,cd["cd_offset"],MAX_TRANSFER)
        if len(suffix)!=to_read:
            raise ValueError("zip_toc_rest_length_mismatch")
        detail=summarize_directory(suffix[:cd["cd_size"]],cd["entries"])
        result={"schema":"pse-original-ftp-zip-toc-readonly-v1",
                "root_verified":True,"large_zip_size":size,"zip_central_directory_bytes":cd["cd_size"],
                "bounded_ftp_bytes_read":len(tail)+len(suffix),**detail}
        OUT.parent.mkdir(parents=True,exist_ok=True)
        OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print("PSE_SOURCE_ZIP_TOC="+json.dumps(result,ensure_ascii=False))
    finally:
        if ftp:ftp.close()

if __name__=="__main__":
    try:main()
    except Exception as e:
        safe={x for x in (
            "wrong_repo","ftps_rest_only","joomla_root_unverified",
            "source_large_zip_identity_changed","zip_eocd_unavailable",
            "zip_multidisk_not_allowed","zip64_metadata_requires_separate_review",
            "zip_central_directory_too_large","zip_directory_out_of_bounds",
            "invalid_zip_central_directory","truncated_zip_central_directory",
            "zip_entry_count_limit","zip_directory_boundary",
            "ftp_rest_range_exceeds_limit","zip_toc_rest_tail_too_large",
            "zip_toc_rest_length_mismatch")}
        print("PSE_SOURCE_ZIP_TOC_ERROR="+
            (str(e) if str(e) in safe else e.__class__.__name__),file=sys.stderr)
        sys.exit(1)
