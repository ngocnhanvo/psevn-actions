#!/usr/bin/env python3
"""Set only GitHub build repository routing in the existing PSE wp-config.php.

FTP TLS, verified PSE WordPress docroot, preflight original config, no secrets
logged, atomic rename/readback and best-effort rollback. Does not touch DB_NAME,
tokens, domain or trigger build.
"""
import ftplib,hashlib,io,os,re,secrets,ssl
from urllib.parse import urlsplit
settings=[]
for row in os.environ.get('ENV_FILE','').splitlines():
    m=re.match(r'^\s*(?:export\s+)?WC_URL=(.*)$',row)
    if m:settings.append(m.group(1).strip().strip('"\''))
if len(settings)!=1:raise RuntimeError('Ambiguous configured PSE WordPress origin')
wp=urlsplit(settings[0])
uri=os.environ.get('FTP_SERVER','')
if '://' not in uri:uri='ftps://'+uri
ftpuri=urlsplit(uri)
if not (wp.scheme=='https' and wp.hostname and wp.path in ('','/') and
        not wp.username and not wp.password and not wp.query and not wp.fragment and
        wp.port in (None,443)):raise RuntimeError('Unsafe WP origin')
if not (ftpuri.scheme in ('ftp','ftps') and ftpuri.hostname and ftpuri.port in (None,21)
        and not ftpuri.username and not ftpuri.password and not ftpuri.path.strip('/')
        and not ftpuri.query and not ftpuri.fragment):raise RuntimeError('Unsafe FTP target')
if not os.environ.get('FTP_USERNAME') or not os.environ.get('FTP_PASSWORD'):
    raise RuntimeError('FTP credentials not provided')
root='/domains/'+wp.hostname+'/public_html'
ftp=ftplib.FTP_TLS(context=ssl.create_default_context(),timeout=25)
backup=None;temp=None;swapped=False
def get(name):
    buf=io.BytesIO()
    ftp.retrbinary('RETR '+name,buf.write)
    return buf.getvalue()
try:
    ftp.connect(ftpuri.hostname,ftpuri.port or 21)
    ftp.auth();ftp.login(os.environ['FTP_USERNAME'],os.environ['FTP_PASSWORD']);ftp.prot_p()
    ftp.cwd(root)
    if ftp.pwd().rstrip('/')!=root:raise RuntimeError('Unexpected FTP WP root')
    old=get('wp-config.php')
    if not (100<len(old)<1_000_000):raise RuntimeError('Unexpected wp-config size')
    raw=old.decode('utf8')
    if not raw.lstrip().startswith('<?php') or 'DB_NAME' not in raw or 'wp-settings.php' not in raw:
        raise RuntimeError('Not a valid site-owned WordPress wp-config.php')
    keys=('VCS_GH_OWNER','VCS_GH_REPO')
    if any(re.search(r"define\s*\(\s*['\"]"+name+r"['\"]",raw) for name in keys):
        raise RuntimeError('wp-config already owns GitHub routing; refuse to override existing declaration')
    marker=re.search(r"(?m)^\s*(?:require_once|require)\s+ABSPATH\s*\.\s*['\"]wp-settings\.php['\"]\s*;",raw)
    if not marker:raise RuntimeError('Cannot find canonical WordPress bootstrap insertion point')
    insert=(
        "// WordPress Build Website repository routing for this PSE installation.\n"
        "// Keep project-specific values in wp-config, never in shared PHP plugins.\n"
        "if (!defined('VCS_GH_OWNER')) define('VCS_GH_OWNER', 'ngocnhanvo');\n"
        "if (!defined('VCS_GH_REPO')) define('VCS_GH_REPO', 'psevn-actions');\n\n"
    )
    new=(raw[:marker.start()]+insert+raw[marker.start():]).encode('utf8')
    if new==old:raise RuntimeError('No configuration change')
    tag=secrets.token_hex(8)
    temp='.pse-wp-config-'+tag+'.tmp'
    backup='.pse-wp-config-'+tag+'.backup'
    ftp.storbinary('STOR '+temp,io.BytesIO(new))
    if hashlib.sha256(get(temp)).digest()!=hashlib.sha256(new).digest():
        raise RuntimeError('FTPS temporary wp-config readback mismatch')
    ftp.rename('wp-config.php',backup)
    ftp.rename(temp,'wp-config.php')
    swapped=True
    if hashlib.sha256(get('wp-config.php')).digest()!=hashlib.sha256(new).digest():
        raise RuntimeError('FTPS active wp-config checksum mismatch')
    ftp.delete(backup)
    backup=None
    print('PSE_WP_CONFIG_BUILD_ROUTE=PASS; repo_routing_set_in_wp_config=true; FTPS_SHA256=PASS; tokens_unchanged=true; DB_NAME_unchanged=true; no_Astro_build=true')
except BaseException:
    print('PSE_WP_CONFIG_BUILD_ROUTE=FAIL; attempting WP config rollback without logging file')
    if backup:
        try:
            if swapped:
                ftp.delete('wp-config.php')
            ftp.rename(backup,'wp-config.php')
            backup=None
            print('PSE_WP_CONFIG_ROLLBACK=PASS')
        except Exception:
            print('PSE_WP_CONFIG_ROLLBACK=FAILED_REQUIRES_MANUAL_REVIEW')
    raise
finally:
    if temp:
        try:ftp.delete(temp)
        except ftplib.all_errors:pass
    try:ftp.quit()
    except ftplib.all_errors:ftp.close()
