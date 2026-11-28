#!/usr/bin/env python3
"""Compare PSE deployed multilingual WP Admin filter against source, no FTP writes."""
import ftplib, hashlib, io, os, ssl
from pathlib import Path
from urllib.parse import urlsplit

src=Path('source-php/wp-content/mu-plugins/esc-multilingual-admin.php')
assert src.is_file() and src.stat().st_size > 5000, 'Expected multilingual PHP source'
source=src.read_bytes()
env={}
for entry in os.environ['ENV_FILE'].splitlines():
    s=entry.strip().removeprefix('export ').strip()
    if s.startswith('WC_URL='):
        env['WC_URL']=s.split('=',1)[1].strip().strip('\\"\'')
wp=urlsplit(env['WC_URL'])
assert wp.scheme=='https' and wp.hostname=='admin-pse.webnvn.com' and wp.port in (None,443)
assert wp.path in ('','/') and not wp.query and not wp.fragment
raw=os.environ['FTP_SERVER'].strip()
if '://' not in raw: raw='ftp://'+raw
server=urlsplit(raw)
assert server.scheme in ('ftp','ftps') and server.hostname and server.port in (None,21)
assert not server.path.strip('/') and not server.username and not server.password
folder='/domains/'+wp.hostname+'/public_html/wp-content/mu-plugins'
ftp=ftplib.FTP_TLS(context=ssl.create_default_context(),timeout=30)
try:
    ftp.connect(server.hostname,server.port or 21)
    ftp.auth()
    ftp.login(os.environ['FTP_USERNAME'],os.environ['FTP_PASSWORD'])
    ftp.prot_p()
    ftp.cwd(folder)
    assert ftp.pwd().rstrip('/')==folder
    data=io.BytesIO()
    ftp.retrbinary('RETR esc-multilingual-admin.php',data.write)
    remote=data.getvalue()
    assert remote.startswith(b'<?php') and len(remote)>3000
    print('PSE_MULTILINGUAL_ADMIN_FTPS_READONLY=PASS')
    print('PSE_MULTILINGUAL_ADMIN_LOCAL_SHA256='+hashlib.sha256(source).hexdigest())
    print('PSE_MULTILINGUAL_ADMIN_REMOTE_SHA256='+hashlib.sha256(remote).hexdigest())
    print('PSE_MULTILINGUAL_ADMIN_SOURCE_MATCH='+str(source==remote).upper())
    for label,phrase in [('root_filter',b'esc_ml_admin_filter_root_rows'),
       ('root_empty',b"'value' => ''"),
       ('root_zero',b"'value' => '0'"),
       ('post_type_root',b"'post' => [")]:
       print('PSE_MULTILINGUAL_ADMIN_REMOTE_'+label.upper()+'='+str(phrase in remote).upper())
finally:
    try:ftp.quit()
    except Exception:ftp.close()
