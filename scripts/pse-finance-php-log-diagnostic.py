#!/usr/bin/env python3
"""Read-only, bounded PSE WordPress PHP error-log inspection. Never print secrets."""
import ftplib,io,os,re,hashlib
host=os.environ.get("FTP_SERVER","").removeprefix("ftp://").removeprefix("ftps://").split(":")[0]
if not re.fullmatch(r"[a-zA-Z0-9.-]+",host):raise SystemExit("Invalid FTPS host")
lines=[v.split("=",1)[1].strip(" '\"") for v in os.environ.get("ENV_FILE","").splitlines() if v.strip().startswith("WC_URL=")]
if lines!=["https://admin-pse.webnvn.com"]:raise SystemExit("Wrong WP origin")
ftp=ftplib.FTP_TLS(timeout=35)
try:
 ftp.connect(host,21,timeout=35);ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"]);ftp.prot_p()
 paths=[
  "/domains/admin-pse.webnvn.com/public_html/wp-content/debug.log",
  "/domains/admin-pse.webnvn.com/public_html/error_log",
  "/domains/admin-pse.webnvn.com/logs/error.log",
  "/domains/admin-pse.webnvn.com/logs/php-error.log",
 ]
 for path in paths:
  label=path.rsplit("/",1)[-1]
  try:
   size=ftp.size(path)
   if not isinstance(size,int) or size<1:continue
   data=io.BytesIO()
   offset=max(0,size-262144)
   ftp.retrbinary("RETR "+path,data.write,blocksize=32768,rest=offset if offset else None)
   raw=data.getvalue().decode("utf-8","replace")
   found=[]
   for x in raw.splitlines():
    if not re.search(r"finance-temporary-sideload|finance_sideload|php fatal error|uncaught (error|exception)",x,re.I):continue
    # Only disclose fatal error type and basename:line; never remote paths or messages.
    m=re.search(r"(?:PHP Fatal error: )?Uncaught ([A-Za-z_\\]+):",x,re.I)
    src=re.search(r"(?:pse-finance-temporary-sideload\.php|pse-legacy-article-seo-rest\.php)(?::(\d+))?",x,re.I)
    if m or src:
     found.append({"class":m.group(1) if m else "UNKNOWN",
                  "file":"pse-finance-temporary-sideload.php" if src and "finance-temporary" in src.group(0) else "OTHER",
                  "line":src.group(1) if src else None})
   print("PSE_FINANCE_ERROR_LOG_PROBE="+str({"log":label,"size":size,"sourceMatches":found[-12:]}))
  except ftplib.all_errors as e:
   print("PSE_FINANCE_ERROR_LOG_UNAVAILABLE="+label+"; reason="+type(e).__name__)
finally:ftp.quit()
