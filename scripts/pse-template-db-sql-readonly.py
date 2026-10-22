#!/usr/bin/env python3
"""Read-only inspection of the newest protected UpdraftPlus SQL database backup.

Reads via verified FTPS into an ephemeral GitHub runner scratch file. Prints
aggregate booleans/counts only, never any records, credentials, SQL or filenames.
No database SQL statements are executed. Never uploads data or artifacts.
"""
import ftplib
import gzip
import hashlib
import os
import pathlib
import posixpath
import re
import ssl
import tempfile
from urllib.parse import urlsplit

def status(key, value):
    print("PSE_SQL_AUDIT " + key + "=" + str(value), flush=True)

def read_env(name):
    vals=[]
    for line in os.environ.get("ENV_FILE", "").splitlines():
        line=line.strip().removeprefix("export ").strip()
        if line.startswith(name+"="):
            vals.append(line.split("=",1)[1].strip().strip("'\""))
    if len(vals)!=1:
        raise RuntimeError("Expected exactly one "+name)
    value=urlsplit(vals[0])
    if (value.scheme!="https" or not value.hostname or value.port not in (None,443)
            or value.path not in ("","/") or value.query or value.fragment
            or value.username or value.password):
        raise RuntimeError("Invalid trusted WordPress origin")
    return value.hostname

wp_host=read_env("WC_URL")
raw=os.environ.get("FTP_SERVER", "").strip()
ftp_url=urlsplit(raw if "://" in raw else "ftp://"+raw)
if (ftp_url.scheme not in ("ftp","ftps") or not ftp_url.hostname
        or ftp_url.port not in (None,21) or ftp_url.path not in ("","/")
        or ftp_url.username or ftp_url.password or ftp_url.query or ftp_url.fragment):
    raise RuntimeError("Invalid FTPS target")
if not os.environ.get("FTP_USERNAME") or not os.environ.get("FTP_PASSWORD"):
    raise RuntimeError("Missing FTPS credentials")
root="/domains/"+wp_host+"/public_html/wp-content/updraft"
ftp=ftplib.FTP_TLS(context=ssl.create_default_context(),timeout=25)
try:
    ftp.connect(ftp_url.hostname,ftp_url.port or 21)
    ftp.auth()
    ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
    ftp.prot_p()
    ftp.cwd(root)
    if ftp.pwd().rstrip("/")!=root:
        raise RuntimeError("Backup directory identity mismatch")
    status("FTPS_BACKUP_PATH","PASS")
    try:
        ftp.size(".htaccess")
        status("UPDRAFT_HTACCESS_PRESENT","YES")
    except ftplib.error_perm:
        status("UPDRAFT_HTACCESS_PRESENT","UNVERIFIED")
    names=ftp.nlst()
    allowed=re.compile(r"^backup_[0-9-]{15,25}_[A-Za-z0-9_.-]+-db[.]gz$")
    files=[posixpath.basename(v) for v in names if allowed.fullmatch(posixpath.basename(v))]
    if not files:
        status("DB_ARCHIVES_FOUND",0)
        raise RuntimeError("No Updraft database .gz backups found for PSE")
    status("DB_ARCHIVES_FOUND",len(files))
    latest=max(files)
    with tempfile.TemporaryFile() as temp:
        size=0
        h=hashlib.sha256()
        def write_chunk(chunk):
            global size
            size+=len(chunk)
            if size>300_000_000:
                raise RuntimeError("Compressed DB backup exceeds safety limit")
            temp.write(chunk)
            h.update(chunk)
        ftp.retrbinary("RETR "+latest,write_chunk,blocksize=65536)
        temp.seek(0)
        if temp.read(2)!=b"\x1f\x8b":
            raise RuntimeError("Backup file not GZip")
        temp.seek(0)
        status("DB_BACKUP_DOWNLOAD_TLS","PASS")
        status("DB_BACKUP_SIZE_CLASS","SMALL" if size<25_000_000 else "LARGE")
        status("DB_BACKUP_SHA16",h.hexdigest()[:16])
        patterns={
            "OLD_NCKH_DOMAIN":b"nghiencuukhoahoc",
            "OLD_BLUESEA_DOMAIN":b"xuongmunonbaohiem",
            "OLD_BLUESEA_BRAND":b"blue sea",
            "ESC_SOURCE_HOST":b"admin.esc.vn",
            "WP_USER_STUDENT_ROLE":b"nckh_student",
            "WP_USER_TEACHER_ROLE":b"nckh_teacher",
        }
        counts={name:0 for name in patterns}
        create_table=0
        nckh_tables=0
        total_uncompressed=0
        grouped={}
        touched={}
        by_table={}
        option_buckets={}
        current_table_category="SQL_HEADER_OR_UNSCOPED"
        current_table_name=""
        def table_category(table_name):
            t=table_name.decode("utf-8","ignore").lower()
            for suffix in ("postmeta","posts","options","termmeta","terms","term_taxonomy","term_relationships","users","usermeta","comments","commentmeta"):
                if t.endswith("_"+suffix):
                    return "WORDPRESS_"+suffix.upper()
            if "nckh" in t:
                return "NCKH_CUSTOM"
            if "woocommerce" in t or "wc_" in t:
                return "WOOCOMMERCE_CUSTOM"
            if "tablepress" in t:
                return "TABLEPRESS_CUSTOM"
            return "OTHER_PLUGIN_TABLE"
        with gzip.GzipFile(fileobj=temp,mode="rb") as sql:
            for line in sql:
                total_uncompressed+=len(line)
                if total_uncompressed>1_000_000_000:
                    raise RuntimeError("Uncompressed DB backup exceeds safety limit")
                low=line.lower()
                table_match=re.match(rb"\s*(?:INSERT INTO|REPLACE INTO)\s+`?([a-zA-Z0-9_]+)`?",line,re.I)
                if table_match:
                    current_table_category=table_category(table_match.group(1))
                    current_table_name=table_match.group(1).decode("utf-8","ignore").lower()
                    touched[current_table_category]=touched.get(current_table_category,0)+1
                elif re.match(rb"\s*(?:CREATE TABLE|DROP TABLE|ALTER TABLE|LOCK TABLES|UNLOCK TABLES)\b",line,re.I):
                    current_table_category="SQL_SCHEMA"
                for key,pattern in patterns.items():
                    n=low.count(pattern)
                    counts[key]+=n
                    if n:
                        k=(key,current_table_category)
                        grouped[k]=grouped.get(k,0)+n
                        per=(key,current_table_name)
                        by_table[per]=by_table.get(per,0)+n
                if current_table_category=="WORDPRESS_OPTIONS":
                    # Option keys, never values; buckets deliberately omit secrets.
                    for match in re.finditer(rb"\(\s*\d+\s*,\s*'([a-zA-Z0-9_-]{1,160})'\s*,",line):
                        name=match.group(1).decode("ascii","ignore").lower()
                        end=line.find(b"\n",match.end())
                        segment=line[match.end():end if end!=-1 else len(line)]
                        hits=segment.lower().count(b"xuongmunonbaohiem")
                        if hits:
                            bucket=(
                                "TRANSIENT" if name.startswith(("_transient_","_site_transient_")) else
                                "CACHE" if "cache" in name or "cached" in name else
                                "SEARCH_INDEX" if "index" in name else
                                "SEO" if "seo" in name or "yoast" in name else
                                "OPTION_OTHER"
                            )
                            option_buckets[bucket]=option_buckets.get(bucket,0)+hits
                if re.search(rb"\bCREATE TABLE\b",line,re.I):
                    create_table+=1
                    if b"nckh" in low:
                        nckh_tables+=1
        status("DB_GZIP_FULL_CRC","PASS")
        status("CREATE_TABLE_COUNT",create_table)
        status("NCKH_NAMED_TABLE_COUNT",nckh_tables)
        for key,count in counts.items():
            status(key+"_REFERENCES",count)
        for (key,category),n in sorted(grouped.items(),key=lambda x:-x[1])[:25]:
            status("TABLE_CATEGORY_BREAKDOWN_"+key+"_"+category,n)
        for category,n in sorted(touched.items()):
            status("INSERT_STATEMENTS_"+category,n)
        # Print normalized table names (strip randomized WordPress prefix)
        # only for non-core tables with copied brand/domain values.
        for (marker,table),n in sorted(by_table.items(),key=lambda x:-x[1])[:16]:
            if table_category(table.encode()) in ("OTHER_PLUGIN_TABLE","NCKH_CUSTOM","WOOCOMMERCE_CUSTOM"):
                suffix=re.sub(r"^[A-Za-z0-9]+_(?=(?:esc_|nckh_|yoast_|wc_|woocommerce_|tablepress_|wp_))","",table)
                status("AFFECTED_CUSTOM_TABLE_"+marker+"_"+suffix,n)
        for bucket,n in sorted(option_buckets.items()):
            status("OPTION_LEAK_BUCKETS_"+bucket,n)
        # A green source audit or a valid recovery backup must never be
        # interpreted as a clean reusable database. Classify the current
        # protected snapshot without modifying or exporting any records.
        inherited = (counts["OLD_BLUESEA_DOMAIN"] +
                     counts["OLD_BLUESEA_BRAND"] +
                     counts["OLD_NCKH_DOMAIN"])
        status("LEGACY_SOURCE_OCCURRENCES", inherited)
        status("TEMPLATE_DISTRIBUTABLE_DB",
               "NOT_READY_LEGACY_RESIDUE" if inherited else
               "UNVERIFIED_RESTORE_AND_SECRET_REVIEW")
        status("SEPARATE_ISOLATED_DB_RESTORE_TESTED", "NO")
        status("CURRENT_ARCHIVE_PURPOSE", "RECOVERY_BACKUP_NOT_TEMPLATE")
        status("NO_SQL_EXECUTED","PASS")
        status("NO_EXPORT_ARTIFACT","PASS")
finally:
    try:ftp.quit()
    except Exception:ftp.close()
