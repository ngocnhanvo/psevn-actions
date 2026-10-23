#!/usr/bin/env python3
"""READ ONLY: check PSE WordPress config runtime build routing over verified FTPS.
Never print config contents, token strings, DB values, URLs or credentials.
"""
import ftplib,io,os,re,ssl
from urllib.parse import urlsplit
parts={}
for raw in os.environ.get('ENV_FILE','').splitlines():
    m=re.match(r'^\s*(?:export\s+)?(WC_URL)=(.*)$',raw)
    if m:parts[m[1]]=m[2].strip().strip('"\'')
wp=urlsplit(parts.get('WC_URL',''))
server=os.environ.get('FTP_SERVER','')
if '://' not in server:server='ftps://'+server
ft=urlsplit(server)
if wp.scheme!='https' or not wp.hostname or wp.path not in ('','/') or wp.query or wp.fragment or wp.username or wp.password:raise RuntimeError('Invalid WordPress origin')
if ft.scheme not in ('ftp','ftps') or not ft.hostname or ft.username or ft.password or ft.path not in ('','/') or ft.port not in (None,21):raise RuntimeError('Invalid FTP endpoint')
root='/domains/'+wp.hostname+'/public_html'
ftp=ftplib.FTP_TLS(context=ssl.create_default_context(),timeout=25)
try:
    ftp.connect(ft.hostname,ft.port or 21);ftp.auth()
    ftp.login(os.environ['FTP_USERNAME'],os.environ['FTP_PASSWORD']);ftp.prot_p()
    ftp.cwd(root)
    if ftp.pwd().rstrip('/')!=root:raise RuntimeError('Unexpected FTP PSE root')
    def read(rel):
        b=io.BytesIO()
        try:ftp.retrbinary('RETR '+rel,b.write)
        except ftplib.error_perm as e:
            if str(e).startswith('550'):return None
            raise
        if b.tell()>2_000_000:raise RuntimeError('Unexpected oversized PHP config')
        return b.getvalue().decode('utf8')
    main=read('wp-config.php')
    extra=read('wp-content/esc-runtime-config.php')
    mu=read('wp-content/mu-plugins/esc-github-trigger-config.php')
    if main is None:print('PSE_WP_CONFIG_LOCATION=NOT_AT_DOCROOT')
    else:print('PSE_WP_CONFIG_LOCATION=DOCROOT_FOUND')
    def detect(t,key):
        if t is None:return 'file_absent'
        pattern=r"define\s*\(\s*['\"]"+re.escape(key)+r"['\"]\s*,\s*['\"]([^'\"]+)['\"]"
        m=re.search(pattern,t)
        if not m:return 'not_literal'
        val=m.group(1)
        expected={'VCS_GH_REPO':'psevn-actions','VCS_GH_OWNER':'ngocnhanvo'}.get(key)
        return 'expected_value' if expected and val==expected else 'different_literal'
    for key in ('VCS_GH_OWNER','VCS_GH_REPO'):
        print('PSE_WP_BUILD_'+key+'_WP_CONFIG='+detect(main,key))
        print('PSE_WP_BUILD_'+key+'_RUNTIME_CONFIG='+detect(extra,key))
    print('PSE_WP_RUNTIME_CONFIG_EXISTS='+str(extra is not None).lower())
    print('PSE_WP_MU_CONFIG_EXISTS='+str(mu is not None).lower())
    print('PSE_WP_BUILD_ROUTE_AUDIT=PASS; mode=READ_ONLY; secrets_logged=false; ftp_writes=0')
finally:
    try:ftp.quit()
    except ftplib.all_errors:ftp.close()
