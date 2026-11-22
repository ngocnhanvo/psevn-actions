#!/usr/bin/env python3
"""Read ONLY old Joomla ZIP central directory, check public article image basenames.

All expected filenames come from the owner-provided Joomla SQL public-content
selection. No full backup, no article data, no image bytes, no FTP writes.
"""
import importlib.util,collections,json,os,sys,unicodedata
from pathlib import Path
from urllib.parse import urlsplit,unquote
tool=importlib.util.spec_from_file_location("toc",Path("scripts/pse-original-ftp-zip-toc-readonly.py"))
base=importlib.util.module_from_spec(tool);tool.loader.exec_module(base)
ROOT=base.ROOT
SOURCES=Path("docs/source/pse-original-public-articles-11-2026-11-22.json")
OUT=Path("artifacts/pse-original-ftp-joomla-image-matches/summary.json")
EXPECTED=(114,121,127,178,186,196,202,237,341,382,1090)
def norm(v):
    return unicodedata.normalize("NFC",unquote(str(v))).casefold()
def basename(url):
    try:return norm(urlsplit(url).path.rsplit("/",1)[-1])
    except Exception:return ""
def verified_source_catalog(document):
    if document.get("schema")!="pse-original-joomla-selected-public-articles-v1":
        raise ValueError("unexpected_public_source_format")
    if document.get("source_ids")!=list(EXPECTED) or len(document.get("entries",[]))!=11:
        raise ValueError("unexpected_public_source_ids")
    records={}
    for row in document["entries"]:
        source_id=row["source_id"]
        if source_id not in EXPECTED or source_id in records:raise ValueError("unexpected_source_identity")
        records[source_id]=[]
        for idx,url in enumerate(row["inline_image_src"],1):
            name=basename(url)
            if not name or len(name)>200 or not name.endswith((".jpg",".jpeg",".png",".gif",".webp")):
                raise ValueError("unexpected_source_image")
            records[source_id].append({"source_id":source_id,"media_order":idx,"original_basename":name,
                  "exact_old_joomla_path":norm(url).lstrip("/") if "://" not in url else None,
                  "archive_matches":0,"matches_in_images":0,"matches_exact_path":0,
                  "archive_file_metadata":[]})
    if sum(len(r) for r in records.values())!=59:raise ValueError("source_images_count_changed")
    return records
def parse_zip_directory(buf,entries,records):
    byname=collections.defaultdict(list)
    for r in records.values():
        for image in r:byname[image["original_basename"]].append(image)
    at=0
    num=0
    while at<len(buf):
        if at+46>len(buf) or buf[at:at+4]!=b"PK\x01\x02":
            raise ValueError("invalid_central_directory")
        flags=int.from_bytes(buf[at+8:at+10],"little")
        method=int.from_bytes(buf[at+10:at+12],"little")
        compressed=int.from_bytes(buf[at+20:at+24],"little")
        uncompressed=int.from_bytes(buf[at+24:at+28],"little")
        name_len=int.from_bytes(buf[at+28:at+30],"little")
        extra_len=int.from_bytes(buf[at+30:at+32],"little")
        comment_len=int.from_bytes(buf[at+32:at+34],"little")
        end=at+46+name_len+extra_len+comment_len
        if end>len(buf):raise ValueError("bad_directory_bounds")
        raw=buf[at+46:at+46+name_len]
        name=norm(raw.decode("utf8","replace").replace("\\","/"))
        if not name.endswith("/"):
            possible=byname.get(name.rsplit("/",1)[-1],())
            for item in possible:
                item["archive_matches"]+=1
                if "/images/" in name or "/media/" in name:
                    item["matches_in_images"]+=1
                exact=item["exact_old_joomla_path"]
                if exact and name.endswith("/"+exact):
                    item["matches_exact_path"]+=1
                # Only compact metadata, never raw ZIP path/archive contents.
                if len(item["archive_file_metadata"])<5:
                    item["archive_file_metadata"].append({
                        "uncompressed_bytes":uncompressed,"compressed_bytes":compressed,
                        "compression_method":method,"encrypted":bool(flags&1),
                        "in_images_dir":"/images/" in name or "/media/" in name,
                        "source_path_exact":bool(exact and name.endswith("/"+exact))})
        at=end;num+=1
        if num>100_000:raise ValueError("zip_entry_limit")
    if num!=entries:raise ValueError("zip_count_mismatch")
    flat=[x for v in records.values() for x in v]
    return {"schema":"pse-original-joomla-archive-image-basename-matches-v1",
      "source_article_count":len(records),"source_image_occurrences":len(flat),
      "archive_entries_examined":entries,"matched_occurrences":sum(x["archive_matches"]>0 for x in flat),
      "unique_media_path_exact_matches":sum(x["matches_exact_path"]==1 for x in flat),
      "per_post":{str(id):{"images":len(v),
         "filename_match_count":sum(x["archive_matches"]>0 for x in v),
         "exact_path_matches":sum(x["matches_exact_path"]==1 for x in v)}
         for id,v in records.items()},
      "images":flat,"photo_bytes_read":False,
      "archive_fully_downloaded":False,"source_ftp_writes":0,"wp_writes":0}
def main():
    if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise ValueError("wrong_repo")
    if base.source.env("PSE_SOURCE_FTP_PROTOCOL")!="ftps":raise ValueError("ftps_only")
    doc=json.loads(SOURCES.read_text(encoding="utf8"))
    records=verified_source_catalog(doc)
    host,port=base.source.validated_host("ftps");ftp=None
    try:
        ftp=base.source.FTPS(host,port,base.source.env("PSE_SOURCE_FTP_USERNAME"),base.source.env("PSE_SOURCE_FTP_PASSWORD"))
        rows=ftp.listdir(ROOT)
        names={n.casefold() for n,t,_ in rows}
        if not all(x in names for x in ("configuration.php","administrator","components","images")):
            raise ValueError("wrong_joomla_root")
        found=[(n,z) for n,t,z in rows if t=="file" and n.lower().endswith(".zip") and z==base.EXPECTED_SIZE]
        if len(found)!=1:raise ValueError("zip_identity_changed")
        name,size=found[0];ftp.c.cwd(ROOT)
        tail=base.read_rest_to_eof(ftp.c,name,size-65557,65557)
        toc=base.central_directory_location(tail,size)
        suffix=base.read_rest_to_eof(ftp.c,name,toc["cd_offset"],base.MAX_TRANSFER)
        if len(suffix)!=size-toc["cd_offset"]:raise ValueError("toc_range_wrong")
        report=parse_zip_directory(suffix[:toc["cd_size"]],toc["entries"],records)
        report["bounded_bytes_read"]=len(tail)+len(suffix)
        OUT.parent.mkdir(parents=True,exist_ok=True)
        OUT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
        print("PSE_SOURCE_ZIP_IMAGE_MAP="+json.dumps({k:v for k,v in report.items() if k!="images"},ensure_ascii=False))
    finally:
        if ftp:ftp.close()
if __name__=="__main__":
    try:main()
    except Exception as e:
        safe={"wrong_repo","ftps_only","unexpected_public_source_format","unexpected_public_source_ids",
        "unexpected_source_identity","unexpected_source_image","source_images_count_changed",
        "invalid_central_directory","bad_directory_bounds","zip_entry_limit","zip_count_mismatch",
        "wrong_joomla_root","zip_identity_changed","toc_range_wrong"}
        print("PSE_SOURCE_ZIP_IMAGE_MAP_ERROR="+
          (str(e) if str(e) in safe else e.__class__.__name__),file=sys.stderr)
        sys.exit(1)
