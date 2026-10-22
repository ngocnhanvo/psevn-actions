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


def sql_values(statement):
    """Yield complete SQL VALUES tuples, observing SQL single quotes and escapes."""
    match=re.search(rb"\bVALUES\s*",statement,re.I)
    if not match:
        return
    data=statement
    n=len(data)
    i=match.end()
    while i<n:
        while i<n and data[i] not in (40,59): # ( or ;
            i+=1
        if i>=n or data[i]==59:
            return
        i+=1
        start=i
        depth=1
        quoted=False
        while i<n:
            b=data[i]
            if quoted:
                if b==92: # MySQL string backslash escape
                    i+=2
                    continue
                if b==39:
                    if i+1<n and data[i+1]==39: # doubled quote
                        i+=2
                        continue
                    quoted=False
            elif b==39:
                quoted=True
            elif b==40:
                depth+=1
            elif b==41:
                depth-=1
                if depth==0:
                    yield data[start:i]
                    i+=1
                    break
            i+=1
        else:
            return

def sql_columns(row):
    """Tokenize one tuple without interpreting escaped SQL values."""
    parts=[]
    start=0
    quote=False
    i=0
    while i<len(row):
        b=row[i]
        if quote:
            if b==92:
                i+=2
                continue
            if b==39:
                if i+1<len(row) and row[i+1]==39:
                    i+=2
                    continue
                quote=False
        elif b==39:
            quote=True
        elif b==44:
            parts.append(row[start:i])
            start=i+1
        i+=1
    parts.append(row[start:])
    return parts

def option_group(name):
    name=name.lower().strip().strip(b"'")
    if b"transient" in name or b"cache" in name:
        return "TRANSIENT_OR_CACHE"
    if b"tablepress" in name:
        return "TABLEPRESS"
    if b"nckh" in name or b"research" in name:
        return "NCKH_RESEARCH"
    if b"woocommerce" in name or name.startswith(b"wc_"):
        return "WOOCOMMERCE"
    if b"esc_" in name or b"builder" in name:
        return "ESC_BUILDER"
    if b"acf" in name:
        return "ACF"
    if b"updraft" in name:
        return "UPDRAFT"
    if b"widget" in name or b"theme_mods" in name or b"sidebars" in name:
        return "THEME_WIDGET"
    if b"seo" in name or b"rank_math" in name or b"yoast" in name:
        return "SEO"
    return "OTHER_OPTIONS"

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
        option_groups={}
        posts_groups={}
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
                if table_match and len(line)<125_000_000:
                    table_lower=table_match.group(1).lower()
                    if table_lower.endswith(b"_options"):
                        for row in sql_values(line):
                            columns=sql_columns(row)
                            if len(columns)<3:
                                continue
                            group=option_group(columns[1])
                            stat=option_groups.setdefault(group,[0,0,0])
                            stat[0]+=1
                            low_row=row.lower()
                            stat[1]+=low_row.count(b"xuongmunonbaohiem")
                            stat[2]+=low_row.count(b"nghiencuukhoahoc")
                    elif table_lower.endswith(b"_posts"):
                        for row in sql_values(line):
                            columns=sql_columns(row)
                            if len(columns)<21:
                                continue
                            post_type=columns[20].lower().strip().strip(b"'")
                            if post_type in (b"page",b"post",b"revision",b"attachment",b"acf-field",b"acf-field-group"):
                                group=post_type.decode("ascii")
                            else:
                                group="OTHER_POST_TYPES"
                            stat=posts_groups.setdefault(group,[0,0,0])
                            stat[0]+=1
                            low_row=row.lower()
                            stat[1]+=low_row.count(b"xuongmunonbaohiem")
                            stat[2]+=low_row.count(b"nghiencuukhoahoc")
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
        status("TABLE_DATA_GROUPS_BEGIN","PASS")
        for group,stat in sorted(option_groups.items()):
            status("OPTION_GROUP_"+group+"_ROWS",stat[0])
            status("OPTION_GROUP_"+group+"_BLUESEA_REFS",stat[1])
            status("OPTION_GROUP_"+group+"_NCKH_REFS",stat[2])
        for group,stat in sorted(posts_groups.items()):
            status("POST_GROUP_"+group+"_ROWS",stat[0])
            status("POST_GROUP_"+group+"_BLUESEA_REFS",stat[1])
            status("POST_GROUP_"+group+"_NCKH_REFS",stat[2])
        status("TABLE_DATA_GROUPS_END","PASS")
        status("NO_SQL_EXECUTED","PASS")
        status("NO_EXPORT_ARTIFACT","PASS")
finally:
    try:ftp.quit()
    except Exception:ftp.close()
