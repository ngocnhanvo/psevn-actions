#!/usr/bin/env python3
"""Strict metadata-only identification of SQL dump candidate entries inside original Joomla ZIP.

Reads only ZIP central directory over certificate-validated FTPS REST.
Reports file sizes, entry *hashes*, and classification, never filenames, SQL
contents, login values, source config, or file bytes.
"""
import collections,hashlib,importlib.util,json,os,struct,sys,unicodedata
from pathlib import Path
spec=importlib.util.spec_from_file_location("ziptoc",Path("scripts/pse-original-ftp-zip-toc-readonly.py"))
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
OUT=Path("artifacts/pse-original-ftp-sql-candidates/summary.json")

def classify(buf, expected_entries):
    candidates=[]
    SQL_ENDINGS=(".sql",".sql.gz",".mysql",".dump")
    counters=collections.Counter()
    max_sql=0
    # Only exact source-known image paths; filename-only candidates never prove identity.
    target_images=("Áo_2.JPG","Ba_Lan.JPG","Mỏ_muối_Wieliczka_dưới_mặt_đất_135m_-_Ba_lan.JPG")
    normalize=lambda p:unicodedata.normalize("NFC",p).casefold()
    wanted={normalize(name):i for i,name in enumerate(target_images,1)}
    image_matches={i:{"basename_count":0,"source_path_count":0,"source_entries":[]} for i in (1,2,3)}
    cursor=0
    entries=0
    while cursor<len(buf):
        if cursor+46>len(buf) or buf[cursor:cursor+4]!=b"PK\x01\x02":raise ValueError("invalid_central_directory")
        flags,method=struct.unpack_from("<HH",buf,cursor+8)
        comp,uncomp=struct.unpack_from("<II",buf,cursor+20)
        n,x,c=struct.unpack_from("<HHH",buf,cursor+28)
        end=cursor+46+n+x+c
        if end>len(buf):raise ValueError("central_directory_overrun")
        raw=buf[cursor+46:cursor+46+n]
        name=raw.decode("utf-8","replace").replace("\\","/")
        low=name.lower()
        if not name.endswith("/"):
            basename=normalize(name.rsplit("/",1)[-1])
            idx=wanted.get(basename)
            if idx is not None:
                candidate=image_matches[idx]
                candidate["basename_count"]+=1
                if normalize(name).endswith("/images/web/"+basename):
                    candidate["source_path_count"]+=1
                    candidate["source_entries"].append({
                      "entry_key_sha256":hashlib.sha256(raw).hexdigest(),
                      "uncompressed_bytes":uncomp,
                      "compressed_bytes":comp,
                      "compression_method":method,
                      "encrypted":bool(flags&1)
                    })
            for ext in SQL_ENDINGS:
                if low.endswith(ext):
                    counters[ext]+=1
                    installer=any(t in low for t in (
                        "/installation/","/install/","/sql/","/updates/",
                        "uninstall.sql","install.sql","sample_data","schema.sql",
                        "com_","/plugins/","/modules/","/libraries/"))
                    root_shape=low.count("/")<=2
                    dump_keyword=any(t in low for t in ("dump","backup","database","export","db_","mysql"))
                    score=(100 if uncomp>=1_000_000 else 50 if uncomp>=100_000 else 0)+(40 if root_shape else 0)+(30 if dump_keyword else 0)-(80 if installer else 0)
                    candidates.append({
                        "entry_key_sha256":hashlib.sha256(raw).hexdigest(),
                        "format":ext,"compressed_bytes":comp,
                        "uncompressed_bytes":uncomp,
                        "compression_method":method,
                        "encrypted":bool(flags&1),
                        "known_extension_installer_pattern":installer,
                        "plausible_database_dump":score>=60,
                        "rank_score":score
                    })
                    max_sql=max(max_sql,uncomp)
                    break
        cursor=end
        entries+=1
        if entries>100_000:raise ValueError("excessive_zip_entries")
    if entries!=expected_entries:raise ValueError("zip_entry_count_mismatch")
    chosen=sorted(candidates,key=lambda r:(r["rank_score"],r["uncompressed_bytes"]),reverse=True)[:12]
    return {
       "sql_like_entry_count":len(candidates),
       "sql_like_by_extension":dict(counters),
       "sql_installer_pattern_count":sum(bool(x["known_extension_installer_pattern"]) for x in candidates),
       "plausible_database_dump_candidates":sum(bool(x["plausible_database_dump"]) for x in candidates),
       "largest_sql_uncompressed_bytes":max_sql,
       "original_382_image_candidates_in_zip":image_matches,
       "top_bounded_sql_candidates":chosen,
       "raw_archive_paths_logged":False,
       "sql_body_accessed":False,
       "full_zip_downloaded":False,
       "ftp_writes":0
    }

def main():
    if os.getenv("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise ValueError("wrong_repo")
    if base.source.env("PSE_SOURCE_FTP_PROTOCOL")!="ftps":raise ValueError("ftps_only")
    host,port=base.source.validated_host("ftps")
    ftp=None
    try:
        ftp=base.source.FTPS(host,port,base.source.env("PSE_SOURCE_FTP_USERNAME"),base.source.env("PSE_SOURCE_FTP_PASSWORD"))
        rows=ftp.listdir(base.ROOT)
        names={name.casefold() for name,_,_ in rows}
        if not all(x in names for x in ("configuration.php","administrator","components","images")):
            raise ValueError("source_root_mismatch")
        matches=[(n,size) for n,k,size in rows if k=="file" and n.lower().endswith(".zip") and size==base.EXPECTED_SIZE]
        if len(matches)!=1:raise ValueError("zip_identity_mismatch")
        name,size=matches[0]
        ftp.c.cwd(base.ROOT)
        tail=base.read_rest_to_eof(ftp.c,name,size-65557,65557)
        meta=base.central_directory_location(tail,size)
        suffix=base.read_rest_to_eof(ftp.c,name,meta["cd_offset"],base.MAX_TRANSFER)
        if len(suffix)!=size-meta["cd_offset"]:raise ValueError("zip_toc_short")
        report=classify(suffix[:meta["cd_size"]],meta["entries"])
        report.update(schema="pse-original-sql-candidate-toc-v1",zip_size_bytes=size,zip_toc_entries=meta["entries"],
                      central_directory_bytes=meta["cd_size"],
                      bounded_ftp_bytes_read=len(tail)+len(suffix),joomla_root_verified=True)
        OUT.parent.mkdir(parents=True,exist_ok=True)
        OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        print("PSE_SQL_CANDIDATES_TOC="+json.dumps(report,ensure_ascii=False))
    finally:
        if ftp:ftp.close()

if __name__=="__main__":
    try:main()
    except Exception as e:
        safe={
          "wrong_repo","ftps_only","source_root_mismatch","zip_identity_mismatch",
          "zip_toc_short","invalid_central_directory","central_directory_overrun",
          "excessive_zip_entries","zip_entry_count_mismatch"
        }
        print("PSE_SQL_CANDIDATES_TOC_ERROR="+
              (str(e) if str(e) in safe else e.__class__.__name__),file=sys.stderr)
        sys.exit(1)
