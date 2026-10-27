#!/usr/bin/env python3
"""Bounded read-only WordPress hosting DB diagnostic (counts only; no log lines)."""
import ftplib, ssl, os, re, io
from urllib.parse import urlsplit

def parse_origin():
    val=[s.strip().removeprefix("export ").split("=",1)[1].strip().strip("'\"")
         for s in os.environ.get("ENV_FILE","").splitlines()
         if s.strip().removeprefix("export ").startswith("WC_URL=")]
    if len(val)!=1:raise ValueError("WC_URL_NOT_UNIQUE")
    u=urlsplit(val[0])
    if not (u.scheme=="https" and u.hostname and u.port in (None,443) and u.path in ("","/")
            and not u.query and not u.fragment and not u.username and not u.password):
        raise ValueError("WC_URL_INVALID")
    return u.hostname

def main():
    raw=os.environ.get("FTP_SERVER","").strip()
    u=urlsplit(raw if "://" in raw else "ftp://"+raw)
    if not (u.scheme in ("ftp","ftps") and u.hostname and u.port in (None,21) and
       u.path in ("","/") and not u.username and not u.password and not u.query and not u.fragment):
        raise ValueError("FTPS_INVALID")
    root="/domains/"+parse_origin()+"/public_html"
    f=ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=25)
    try:
        f.connect(u.hostname,u.port or 21);f.auth()
        f.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);f.prot_p()
        f.cwd(root)
        if f.pwd().rstrip("/")!=root:raise ValueError("DOCROOT_MISMATCH")
        print("PSE_WP_DB_FTPS_ROOT_VERIFIED=PASS")
        paths=["error_log","wp-content/error_log","wp-content/debug.log"]
        for name in paths:
            f.cwd(root)
            try:
                size=f.size(name)
                if size is None or size>4_000_000:
                    print("PSE_WP_DB_LOG "+name.replace("/","_")+"=SKIP_SIZE")
                    continue
                data=bytearray()
                f.retrbinary("RETR "+name,data.extend,blocksize=16384)
                content=bytes(data).decode("utf-8","replace")
                # Never print content or freeform server exceptions.
                patterns={
                    "db_connection":r"Error establishing a database connection|Lỗi kết nối tới cơ sở dữ liệu|mysqli_real_connect|Can't connect to (?:local|MySQL)|database is down",
                    "max_connections":r"Too many connections|max_user_connections",
                    "mysql_gone":r"MySQL server has gone away|Lost connection to MySQL|SQLSTATE\[HY000\]",
                    "php_fatal":r"PHP Fatal error|Uncaught Error|Allowed memory size of",
                    "timeout":r"timed out|Timeout|Connection refused",
                }
                out={k:len(re.findall(p,content,re.I)) for k,p in patterns.items()}
                print("PSE_WP_DB_LOG "+name.replace("/","_")+"=READ_ONLY "+ " ".join(k+"="+str(v) for k,v in out.items()))

                # Only predefined issue classes and UTC hour bins; never print full lines.
                classes={
                    "wp_query_error":r"WordPress database error",
                    "mysql_connect":r"mysqli_real_connect|mysqli_connect|connect\s*\(\)\s*failed|Can't connect to MySQL",
                    "mysql_denied":r"Access denied for user|using password:\s*(?:YES|NO)",
                    "mysql_limit":r"max_user_connections|Too many connections|User .* has exceeded",
                    "mysql_packet":r"Packet too large|Got a packet bigger",
                    "mysql_lost":r"MySQL server has gone away|Lost connection to MySQL",
                    "db_fatal":r"Error establishing a database connection|Lỗi kết nối tới cơ sở dữ liệu",
                    "wp_timeout":r"Connection timed out|server has gone away",
                    "wp_memory":r"Allowed memory size of .* exhausted",
                    "wp_php_exception":r"PHP Fatal error|Uncaught .*Error",
                }
                details={k:len(re.findall(p,content,re.I)) for k,p in classes.items()}
                hours={}
                for line in content.splitlines():
                    if not re.search(r"database error|database connection|kết nối tới cơ sở dữ liệu|mysqli_real_connect|too many connections",line,re.I):
                        continue
                    hit=re.search(r"\[(?:27-Oct-2026|26-Oct-2026)\s+(\d{2}):",line,re.I)
                    if hit:
                        key=hit.group(1)
                        hours[key]=hours.get(key,0)+1
                print("PSE_WP_DB_CLASSES "+name.replace("/","_")+"="+
                    " ".join(k+"="+str(v) for k,v in details.items())+
                    " today_or_yesterday_hour_bins="+','.join(f'{k}:{v}' for k,v in sorted(hours.items())))

            except (ftplib.error_perm,ftplib.error_temp):
                print("PSE_WP_DB_LOG "+name.replace("/","_")+"=UNAVAILABLE")
        print("PSE_WP_DB_FTPS_NO_WRITES=PASS")
    finally:
        try:f.quit()
        except Exception:f.close()

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("PSE_WP_DB_LOG_PROBE_FAILED="+type(e).__name__)
        raise SystemExit(1)
