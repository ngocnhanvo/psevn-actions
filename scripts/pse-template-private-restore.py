#!/usr/bin/env python3
"""Restore a *protected* PSE Updraft DB snapshot into a local, disposable MariaDB.

This script never connects to a production SQL server and never changes WordPress.
It reads the archived snapshot via verified FTPS, keeps data within the ephemeral
runner, blocks cross-database/privileged SQL, suppresses SQL and row values in
logs, and destroys the temporary database before exiting.
"""
import ftplib
import gzip
import hashlib
import os
import pathlib
import posixpath
import re
import ssl
import subprocess
import tempfile
from urllib.parse import urlsplit

DB = "pse_ephemeral_restore"
EXPECTED_SHA16 = os.environ.get("PSE_EXPECTED_BACKUP_SHA16", "")
MARKER = "xuongmunonbaohiem|blue[[:space:]]*sea|nghiencuukhoahoc"


def status(name, val):
    print("PSE_ISOLATED_RESTORE " + name + "=" + str(val), flush=True)


def read_wp_hostname():
    lines = []
    for raw in os.environ.get("ENV_FILE", "").splitlines():
        raw = raw.strip().removeprefix("export ").strip()
        if raw.startswith("WC_URL="):
            lines.append(raw.split("=", 1)[1].strip().strip("'\""))
    if len(lines) != 1:
        raise RuntimeError("Expected exactly one configured WC_URL")
    parsed = urlsplit(lines[0])
    if (parsed.scheme != "https" or not parsed.hostname or parsed.port not in (None, 443)
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment
            or parsed.username or parsed.password):
        raise RuntimeError("Invalid WordPress origin")
    return parsed.hostname


def ftp_config():
    ftp_url = os.environ.get("FTP_SERVER", "").strip()
    parsed = urlsplit(ftp_url if "://" in ftp_url else "ftp://" + ftp_url)
    if (parsed.scheme not in ("ftp", "ftps") or not parsed.hostname
            or parsed.port not in (None, 21) or parsed.path not in ("", "/")
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise RuntimeError("Invalid FTPS destination")
    if not os.environ.get("FTP_USERNAME") or not os.environ.get("FTP_PASSWORD"):
        raise RuntimeError("Missing FTPS credentials")
    return parsed.hostname, parsed.port or 21


def mysql(query=None, db=False, sql_file=None):
    cmd = ["sudo", "-n", "mariadb", "--protocol=socket", "--batch",
           "--skip-column-names"]
    if db:
        cmd += ["--database", DB]
    if query is not None:
        cmd += ["--execute", query]
    try:
        if sql_file is None:
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                    timeout=100, check=True, text=True)
        else:
            with open(sql_file, "rb") as source:
                result = subprocess.run(cmd, stdin=source, stdout=subprocess.DEVNULL,
                                        stderr=subprocess.DEVNULL, timeout=420, check=True)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as err:
        raise RuntimeError("Isolated local MariaDB operation failed") from err
    return result.stdout.strip() if query is not None else ""


def sql_int(query):
    result = mysql(query, db=True)
    if not re.fullmatch(r"[0-9]+", result):
        raise RuntimeError("Unexpected aggregate DB result")
    return int(result)


def safe_identifier(value):
    if not re.fullmatch(r"[A-Za-z0-9_]{1,100}", value):
        raise RuntimeError("Unsafe SQL identifier in restore")
    return "\`" + value + "\`"


def download_snapshot(destination):
    ftp_host, ftp_port = ftp_config()
    expected_root = "/domains/" + read_wp_hostname() + "/public_html/wp-content/updraft"
    ftp = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=30)
    try:
        ftp.connect(ftp_host, ftp_port)
        ftp.auth()
        ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
        ftp.prot_p()
        ftp.cwd(expected_root)
        if ftp.pwd().rstrip("/") != expected_root:
            raise RuntimeError("Backup directory identity mismatch")
        names = ftp.nlst()
        allowed = re.compile(r"^backup_[0-9-]{15,25}_[A-Za-z0-9_.-]+-db[.]gz$")
        candidates = [posixpath.basename(n) for n in names
                      if allowed.fullmatch(posixpath.basename(n))]
        if not candidates:
            raise RuntimeError("No valid protected database snapshot")
        latest = max(candidates)
        digest = hashlib.sha256()
        size = 0
        with open(destination, "wb") as target:
            def write(chunk):
                nonlocal size
                size += len(chunk)
                if size > 300_000_000:
                    raise RuntimeError("Protected archive exceeds size limit")
                digest.update(chunk)
                target.write(chunk)
            ftp.retrbinary("RETR " + latest, write, blocksize=65536)
        sha16 = digest.hexdigest()[:16]
        if not re.fullmatch(r"[0-9a-f]{16}", EXPECTED_SHA16) or sha16 != EXPECTED_SHA16:
            raise RuntimeError("Protected snapshot fingerprint changed; refuse unexpected archive")
        status("BACKUP_SHA16", sha16)
        status("FTPS_TLS_READ_ONLY", "PASS")
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


def validate_and_expand(archive, extracted):
    # Parse only structural SQL lines. No SQL body is ever printed or logged.
    prohibited = re.compile(
        rb"^\s*(?:(?:CREATE|DROP|ALTER)\s+(?:DATABASE|SCHEMA|USER|SERVER|"
        rb"FUNCTION|PROCEDURE|TRIGGER|EVENT)\b|"
        rb"(?:USE|GRANT|REVOKE|LOAD\s+DATA|SOURCE|DELIMITER|SYSTEM)\b|"
        rb"\\[.!]\s|SET\s+GLOBAL\b)", re.I)
    dangerous_anywhere = re.compile(rb"\b(?:INTO\s+OUTFILE|INTO\s+DUMPFILE|"
                                    rb"LOAD_FILE\s*\(|@@GLOBAL[.])", re.I)
    total = 0
    schemas = 0
    with gzip.open(archive, "rb") as source, open(extracted, "wb") as dest:
        for line in source:
            total += len(line)
            if total > 1_000_000_000:
                raise RuntimeError("Uncompressed SQL exceeds safety limit")
            if prohibited.search(line) or dangerous_anywhere.search(line):
                raise RuntimeError("SQL contains a statement prohibited in isolated restoration")
            if re.match(rb"^\s*CREATE\s+TABLE\b", line, re.I):
                schemas += 1
            dest.write(line)
    if schemas < 20:
        raise RuntimeError("SQL schema unexpectedly incomplete")
    status("GZIP_CRC", "PASS")
    status("SCHEMA_STATEMENTS", schemas)
    status("PRIVILEGED_SQL_FILTER", "PASS")


def inspect():
    table_names = mysql("SHOW TABLES", db=True).splitlines()
    if len(table_names) < 20:
        raise RuntimeError("Isolated restore has too few tables")
    suffixes = ("posts", "postmeta", "options", "users", "usermeta")
    tables = {}
    for suffix in suffixes:
        matches = [t for t in table_names if t.endswith("_" + suffix)]
        if len(matches) != 1:
            raise RuntimeError("Missing or ambiguous core WordPress table " + suffix)
        tables[suffix] = safe_identifier(matches[0])
    if len({t.rsplit("_", 1)[0] for t in [x.strip("\`") for x in tables.values()]}) != 1:
        raise RuntimeError("WordPress database table prefix mismatch")

    posts = tables["posts"]
    meta = tables["postmeta"]
    options = tables["options"]
    users = tables["users"]
    condition = ("LOWER(CONCAT_WS(' ', COALESCE(post_title,''),"
                 "COALESCE(post_content,''), COALESCE(post_excerpt,'')))"
                 " REGEXP '" + MARKER + "'")
    status("RESTORED_TABLES", len(table_names))
    for typ in ("page", "revision", "post", "attachment", "nav_menu_item"):
        status("POST_TYPE_" + typ.upper(), sql_int(
            "SELECT COUNT(*) FROM " + posts + " WHERE post_type='" + typ + "'"))
        status("LEGACY_ROWS_" + typ.upper(), sql_int(
            "SELECT COUNT(*) FROM " + posts + " WHERE post_type='" + typ + "' AND " + condition))
    status("LEGACY_ROWS_POST_OTHER", sql_int(
        "SELECT COUNT(*) FROM " + posts + " WHERE post_type NOT IN "
        "('page','revision','post','attachment','nav_menu_item') AND " + condition))
    status("LEGACY_ROWS_POSTMETA", sql_int(
        "SELECT COUNT(*) FROM " + meta + " WHERE LOWER(COALESCE(meta_value,'')) REGEXP '" + MARKER + "'"))
    status("LEGACY_ROWS_OPTIONS", sql_int(
        "SELECT COUNT(*) FROM " + options + " WHERE LOWER(COALESCE(option_value,'')) REGEXP '" + MARKER + "'"))
    status("WP_USERS", sql_int("SELECT COUNT(*) FROM " + users))
    status("RESTORE_SQL_EXECUTED_ONLY_IN_EPHEMERAL_DB", "PASS")
    status("DISTRIBUTABLE_SANITIZED_DB", "NOT_CERTIFIED")
    status("NO_LIVE_DB_WRITE", "PASS")
    status("NO_ASTRO_BUILD", "PASS")
    status("NO_SQL_EXPORT_OR_ARTIFACT", "PASS")


def main():
    if not EXPECTED_SHA16:
        raise RuntimeError("Expected protected backup fingerprint is mandatory")
    # No connection string, host, or password is accepted for MariaDB: UNIX socket only.
    with tempfile.TemporaryDirectory(prefix="pse-ephemeral-sql-") as temporary:
        os.chmod(temporary, 0o700)
        archive = pathlib.Path(temporary) / "protected.gz"
        sql_file = pathlib.Path(temporary) / "isolated.sql"
        download_snapshot(archive)
        validate_and_expand(archive, sql_file)
        try:
            mysql("CREATE DATABASE " + DB + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            mysql(db=True, sql_file=sql_file)
            inspect()
        finally:
            # Never leave imported data around even if a check/import fails.
            try:
                mysql("DROP DATABASE IF EXISTS " + DB)
                status("EPHEMERAL_DB_REMOVED", "PASS")
            except RuntimeError:
                status("EPHEMERAL_DB_REMOVED", "UNVERIFIED")
                raise


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # In particular: never print SQL, an FTP response, passwords or private row data.
        status("RESULT", "FAILED_CLOSED")
        raise SystemExit(1)
