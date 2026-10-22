#!/usr/bin/env python3
"""Generate a privacy-gated PSE starter DB from the *verified* protected backup.

Only schema, published page identities, menu linkage, safe ACF definitions and
explicitly allowlisted structural WP settings enter the clean DB. No original
user, credentials, content revisions, site copy, history, chat or plugin data
is carried over. Two separate temporary local databases are cleaned up.
The public artifact is released ONLY after the SQL dump privacy gate AND
second import verification both pass.
"""
import gzip
import importlib.util
import os
import pathlib
import re
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("pse_restore", HERE / "pse-template-private-restore.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

SRC = base.DB
DST = "pse_template_clean"
VERIFY = "pse_template_verify"
DEST = pathlib.Path(os.environ.get("PSE_TEMPLATE_OUTPUT", "/tmp/pse-template.sql.gz"))
Q = chr(96)
LEGACY = "xuongmunonbaohiem|blue[[:space:]]*sea|nghiencuukhoahoc|eduresearch"
PII = r"[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}"
DANGEROUS = re.compile(
    rb"(?:xuongmunonbaohiem|nghiencuukhoahoc|eduresearch|blue[\s_-]*sea|"
    rb"(?:[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})|"
    rb"(?:https?://(?!example[.]invalid)[^\s\"'<]+)|"
    rb"(?:\b(?:0[35789][0-9]{8}|\+84[35789][0-9]{8})\b))", re.I)


def ident(value):
    if not re.fullmatch(r"[A-Za-z0-9_]{1,100}", value):
        raise RuntimeError("Unsafe DB identifier")
    return Q + value + Q


def exec_sql(statement):
    return base.mysql(statement)


def aggregate(db, query):
    r = base.mysql("SELECT " + query, db=False)
    if not re.fullmatch("[0-9]+", r):
        raise RuntimeError("Expected a numeric private aggregate")
    return int(r)


def core_name(table_list):
    candidates = [x for x in table_list if x.endswith("_posts")]
    if len(candidates) != 1:
        raise RuntimeError("Expected exactly one WP posts table")
    original_prefix = candidates[0][:-len("posts")]
    if not original_prefix or not re.fullmatch("[A-Za-z0-9_]+", original_prefix):
        raise RuntimeError("Unrecognized WP prefix")
    names = {}
    for source in table_list:
        if not source.startswith(original_prefix):
            raise RuntimeError("Mixed table prefixes in backup; fail closed")
        target = "wp_" + source[len(original_prefix):]
        if target in names.values():
            raise RuntimeError("Conflicting template schema table name")
        names[source] = target
    for expected in ("posts", "postmeta", "options", "users", "usermeta",
                     "terms", "term_taxonomy", "term_relationships"):
        if original_prefix + expected not in names:
            raise RuntimeError("Missing WP core database structure")
    return original_prefix, names


def qualified(db, table):
    return ident(db) + "." + ident(table)


def copy_schema(table_names):
    exec_sql("CREATE DATABASE " + ident(DST) + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    for source, target in table_names.items():
        exec_sql("CREATE TABLE " + qualified(DST, target) + " LIKE " + qualified(SRC, source))


def copy_posts(prefix):
    a = qualified(SRC, prefix + "posts")
    b = qualified(DST, "wp_posts")
    # Only active page/menu/general-information identities and ACF schema remain.
    # No original page body, business title, author, password, URL or guid is copied.
    where = ("(post_type='page' AND post_status='publish') OR "
             "(post_type IN ('acf-field','acf-field-group','nav_menu_item','thong-tin-chung') "
             "AND post_status NOT IN ('trash','auto-draft','inherit'))")
    keep = ("(post_type='page' AND post_status='publish') OR "
            "(post_type IN ('acf-field','acf-field-group','nav_menu_item','thong-tin-chung') "
            "AND post_status NOT IN ('trash','auto-draft','inherit'))")
    acf = "post_type IN ('acf-field','acf-field-group')"
    # Retain structural ACF definition bodies only after strict refusal of
    # legacy URLs, old brand and email/phone-like values.
    unsafe_acf = aggregate(SRC, "COUNT(*) FROM " + a + " WHERE " + acf +
                           " AND (" +
                           "LOWER(CONCAT_WS(' ',post_title,post_excerpt,post_content)) REGEXP '" + LEGACY + "'" +
                           " OR CONCAT_WS(' ',post_title,post_excerpt,post_content) REGEXP '" + PII + "'" +
                           " OR LOWER(CONCAT_WS(' ',post_title,post_excerpt,post_content)) REGEXP 'https?://' )")
    if unsafe_acf:
        base.status("STRUCTURAL_ACF_REVIEW_REQUIRED", unsafe_acf)
        raise RuntimeError("ACF structure contains unreviewed legacy or contact values")

    slug = ("CASE WHEN post_type IN ('acf-field','acf-field-group') THEN post_name "
            "WHEN post_type='nav_menu_item' THEN CONCAT('muc-menu-',ID) "
            "WHEN post_name REGEXP '^[a-z0-9-]{1,80}$' "
            "AND LOWER(post_name) NOT REGEXP '" + LEGACY + "' THEN post_name "
            "ELSE CONCAT('trang-mau-',ID) END")
    title = ("CASE WHEN " + acf + " THEN post_title "
             "WHEN post_type='thong-tin-chung' THEN 'Thong tin chung' "
             "WHEN post_type='nav_menu_item' THEN CONCAT('Muc menu ',ID) "
             "ELSE CONCAT('Trang mau ',ID) END")
    body = "CASE WHEN " + acf + " THEN post_content ELSE '' END"
    excerpt = "CASE WHEN " + acf + " THEN post_excerpt ELSE '' END"
    sql = ("INSERT INTO " + b + " "
           "(ID,post_author,post_date,post_date_gmt,post_content,post_title,"
           "post_excerpt,post_status,comment_status,ping_status,post_password,"
           "post_name,to_ping,pinged,post_modified,post_modified_gmt,"
           "post_content_filtered,post_parent,guid,menu_order,post_type,post_mime_type,comment_count)"
           " SELECT ID,0,'2020-01-01 00:00:00','2020-01-01 00:00:00'," + body + ","
           + title + "," + excerpt + ","
           "CASE WHEN post_type='page' THEN 'publish' ELSE post_status END,"
           "'closed','closed',''," + slug + ",'','','2020-01-01 00:00:00',"
           "'2020-01-01 00:00:00','',post_parent,"
           "CONCAT('https://example.invalid/?p=',ID),menu_order,post_type,'',0"
           " FROM " + a + " WHERE " + where)
    exec_sql(sql)
    # Do not keep a parent reference to a discarded object.
    exec_sql("UPDATE " + b + " SET post_parent=0 WHERE post_parent<>0 "
             "AND post_parent NOT IN (SELECT ID FROM "
             "(SELECT ID FROM " + b + ") AS kept)")
    kept_pages = aggregate(DST, "COUNT(*) FROM " + b + " WHERE post_type='page'")
    if kept_pages < 5:
        raise RuntimeError("Insufficient current page identities in clean template")
    base.status("STARTER_PAGE_IDENTITIES", kept_pages)
    base.status("ACF_FIELD_DEFINITIONS", aggregate(DST, "COUNT(*) FROM " + b + " WHERE post_type='acf-field'"))
    base.status("ACF_FIELD_GROUPS", aggregate(DST, "COUNT(*) FROM " + b + " WHERE post_type='acf-field-group'"))
    base.status("MENU_ITEM_IDENTITIES", aggregate(DST, "COUNT(*) FROM " + b + " WHERE post_type='nav_menu_item'"))


def copy_safe_meta(prefix):
    source = qualified(SRC, prefix + "postmeta")
    target = qualified(DST, "wp_postmeta")
    posts = qualified(DST, "wp_posts")
    # All business-specific ACF values are intentionally excluded. Only
    # whitelisted action/page-template and ACF reference keys survive.
    meta_condition = ("(meta_key IN ('action','_action','key','_key','_wp_page_template') "
                      "OR (meta_key REGEXP '^_[a-zA-Z0-9_-]{1,80}$' "
                      "AND meta_value REGEXP '^field_[a-zA-Z0-9_]{4,90}$')) "
                      "AND CHAR_LENGTH(meta_value) <= 100 "
                      "AND meta_value REGEXP '^[a-zA-Z0-9_/-]*$' "
                      "AND LOWER(meta_value) NOT REGEXP '" + LEGACY + "'")
    exec_sql("INSERT INTO " + target + " (meta_id,post_id,meta_key,meta_value) "
             "SELECT meta_id,post_id,meta_key,meta_value FROM " + source +
             " WHERE post_id IN (SELECT ID FROM " + posts + ") AND " + meta_condition)
    # Native WordPress menu linkage, without any imported URLs/classes.
    allowed = ("('_menu_item_type','_menu_item_object','_menu_item_object_id',"
               "'_menu_item_menu_item_parent','_menu_item_target')")
    exec_sql("INSERT IGNORE INTO " + target + "(meta_id,post_id,meta_key,meta_value) "
             "SELECT s.meta_id,s.post_id,s.meta_key,s.meta_value FROM " + source +
             " s INNER JOIN " + posts + " p ON p.ID=s.post_id "
             "WHERE p.post_type='nav_menu_item' AND s.meta_key IN " + allowed +
             " AND CHAR_LENGTH(s.meta_value)<100 AND s.meta_value REGEXP '^[a-zA-Z0-9_-]*$'")
    base.status("SAFE_STRUCTURAL_META_ROWS", aggregate(DST, "COUNT(*) FROM " + target))


def menus(prefix):
    src_tax = qualified(SRC, prefix + "term_taxonomy")
    dst_tax = qualified(DST, "wp_term_taxonomy")
    src_terms = qualified(SRC, prefix + "terms")
    dst_terms = qualified(DST, "wp_terms")
    src_rel = qualified(SRC, prefix + "term_relationships")
    dst_rel = qualified(DST, "wp_term_relationships")
    posts = qualified(DST, "wp_posts")
    exec_sql("INSERT INTO " + dst_terms + " (term_id,name,slug,term_group) "
             "SELECT t.term_id,CONCAT('Menu ',t.term_id),CONCAT('menu-',t.term_id),0 "
             "FROM " + src_terms + " t JOIN " + src_tax +
             " tt ON tt.term_id=t.term_id WHERE tt.taxonomy='nav_menu'")
    exec_sql("INSERT INTO " + dst_tax +
             "(term_taxonomy_id,term_id,taxonomy,description,parent,count) "
             "SELECT term_taxonomy_id,term_id,taxonomy,'',0,0 FROM " +
             src_tax + " WHERE taxonomy='nav_menu'")
    exec_sql("INSERT INTO " + dst_rel + "(object_id,term_taxonomy_id,term_order) "
             "SELECT r.object_id,r.term_taxonomy_id,r.term_order FROM " +
             src_rel + " r INNER JOIN " + dst_tax + " tt "
             "ON tt.term_taxonomy_id=r.term_taxonomy_id INNER JOIN " +
             posts + " p ON p.ID=r.object_id AND p.post_type='nav_menu_item'")
    base.status("TEMPLATE_MENU_TAXONOMIES", aggregate(DST, "COUNT(*) FROM " + dst_tax))


def safe_options(prefix):
    source = qualified(SRC, prefix + "options")
    target = qualified(DST, "wp_options")
    values = {
        "siteurl":"https://example.invalid",
        "home":"https://example.invalid",
        "blogname":"Website mau",
        "blogdescription":"Noi dung website mau",
        "admin_email":"admin@example.invalid",
        "users_can_register":"0",
        "default_role":"subscriber",
        "timezone_string":"UTC",
        "gmt_offset":"0",
        "permalink_structure":"/%postname%/",
        "show_on_front":"posts",
        "blog_public":"0",
        "active_plugins":"a:0:{}",
        "upload_path":"",
        "upload_url_path":"",
        "start_of_week":"1",
        "posts_per_page":"10",
        "posts_per_rss":"10",
        "rss_use_excerpt":"0",
        "use_smilies":"1",
        "date_format":"F j, Y",
        "time_format":"g:i a",
    }
    # Preserve only a safe, file-path-shaped theme identifier, not untrusted
    # serialized options or provider/plugin credentials.
    try:
        themenames = base.mysql(
            "SELECT option_name, option_value FROM " + source +
            " WHERE option_name IN ('template','stylesheet')",db=False).splitlines()
        for item in themenames:
            fields = item.split("\t",1)
            if len(fields)==2 and fields[0] in ("template","stylesheet") and re.fullmatch(r"[a-zA-Z0-9_-]{1,70}",fields[1]):
                values[fields[0]] = fields[1]
    except RuntimeError:
        pass
    values.setdefault("template","vibe-code-theme")
    values.setdefault("stylesheet","vibe-code-theme")
    # Numeric WordPress schema version is non-sensitive.
    version = base.mysql("SELECT option_value FROM " + source +
                         " WHERE option_name='db_version' LIMIT 1",db=False)
    if re.fullmatch("[0-9]{3,10}",version):
        values["db_version"]=version
    def esc(v):
        return "'" + v.replace("'","''") + "'"
    for name,val in values.items():
        exec_sql("INSERT INTO " + target + "(option_name,option_value,autoload) VALUES (" +
                 esc(name)+","+esc(val)+",'yes')")
    base.status("ALLOWLISTED_CORE_OPTIONS", len(values))


def export_and_verify(src_names):
    DEST.parent.mkdir(parents=True, exist_ok=True)
    plain = DEST.with_name("pse-template-uncompressed-private.sql")
    cmd = ["sudo","-n","mariadb-dump","--protocol=socket",
           "--default-character-set=utf8mb4","--single-transaction",
           "--skip-comments","--skip-dump-date","--skip-add-locks",
           "--skip-lock-tables","--skip-triggers","--no-tablespaces",DST]
    try:
        with plain.open("wb") as dest:
            subprocess.run(cmd,stdout=dest,stderr=subprocess.DEVNULL,check=True,timeout=180)
        raw = plain.read_bytes()
        if len(raw)>60_000_000:
            raise RuntimeError("Generated template SQL unexpectedly large")
        detected = DANGEROUS.search(raw)
        if detected:
            # Public logs must not expose the matching value.
            raise RuntimeError("Privacy gate rejected a retained value")
        # Prevent accidental export of real deployment configuration.
        if b"INSERT INTO \`wp_users\`" in raw or b"INSERT INTO \`wp_usermeta\`" in raw:
            raise RuntimeError("User credentials persisted in SQL export")
        if b"INSERT INTO \`wp_comments\`" in raw or b"INSERT INTO \`wp_commentmeta\`" in raw:
            raise RuntimeError("Chat/comment data persisted in SQL export")
        with gzip.open(DEST,"wb",compresslevel=8,mtime=None) as dest:
            dest.write(raw)
        exec_sql("CREATE DATABASE " + ident(VERIFY) + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        # Import twice: first in creator's clean copy, second into brand-new DB.
        try:
            with plain.open("rb") as sql:
                subprocess.run(["sudo","-n","mariadb","--protocol=socket",
                                "--database",VERIFY],stdin=sql,stderr=subprocess.DEVNULL,
                               stdout=subprocess.DEVNULL,timeout=180,check=True)
        except (subprocess.SubprocessError, OSError) as exc:
            raise RuntimeError("Second isolated SQL import failed") from exc
        expected = len(src_names)
        count = len(base.mysql("SHOW TABLES FROM " + ident(VERIFY)).splitlines())
        if count!=expected:
            raise RuntimeError("Reimport did not retain all plugin and WP table schemas")
        for table in ("wp_users","wp_usermeta","wp_comments","wp_commentmeta"):
            if table in src_names and aggregate(VERIFY,"COUNT(*) FROM " + qualified(VERIFY,table)):
                raise RuntimeError("Unexpected private data in sanitized template")
        if aggregate(VERIFY,"COUNT(*) FROM " + qualified(VERIFY,"wp_posts") +
                     " WHERE post_type='revision'") != 0:
            raise RuntimeError("Revision content in sanitized template")
        if aggregate(VERIFY,"COUNT(*) FROM " + qualified(VERIFY,"wp_posts") +
                     " WHERE post_type='page' AND post_status='publish'") < 5:
            raise RuntimeError("Starter page identities absent from reimport")
        base.status("REIMPORT_SCHEMA_TABLES",count)
        base.status("STRICT_CONTENT_PRIVACY_GATE","PASS")
        base.status("FRESH_SQL_REIMPORT","PASS")
        base.status("ZERO_USERS_REVISIONS_CHATS_KNOWLEDGE","PASS")
        base.status("ARTIFACT_BYTES",DEST.stat().st_size)
        base.status("TEMPLATE_TYPE","SANITIZED_STARTER_SKELETON")
        base.status("LIVE_WORDPRESS_UNCHANGED","PASS")
        base.status("NO_ASTRO_BUILD","PASS")
    finally:
        plain.unlink(missing_ok=True)


def main():
    if not os.environ.get("PSE_EXPECTED_BACKUP_SHA16"):
        raise RuntimeError("Missing immutable backup fingerprint")
    DEST.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory(prefix="pse-template-private-") as scratch:
        archive = pathlib.Path(scratch)/"verified.gz"
        sqlfile = pathlib.Path(scratch)/"verified.sql"
        base.download_snapshot(archive)
        base.validate_and_expand(archive,sqlfile)
        try:
            exec_sql("CREATE DATABASE " + ident(SRC))
            with sqlfile.open("rb") as source:
                subprocess.run(["sudo","-n","mariadb","--protocol=socket","--database",SRC],
                               stdin=source,stderr=subprocess.DEVNULL,stdout=subprocess.DEVNULL,
                               timeout=420,check=True)
            original = base.mysql("SHOW TABLES FROM " + ident(SRC)).splitlines()
            prefix,names=core_name(original)
            copy_schema(names)
            copy_posts(prefix)
            copy_safe_meta(prefix)
            menus(prefix)
            safe_options(prefix)
            export_and_verify(set(names.values()))
        finally:
            for db in (VERIFY,DST,SRC):
                try:
                    exec_sql("DROP DATABASE IF EXISTS " + ident(db))
                except Exception:
                    DEST.unlink(missing_ok=True)
                    raise
            base.status("ALL_EPHEMERAL_DATABASES_REMOVED","PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        DEST.unlink(missing_ok=True)
        base.status("TEMPLATE_RESULT","FAILED_CLOSED_NO_ARTIFACT")
        raise SystemExit(1)
