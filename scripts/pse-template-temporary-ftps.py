#!/usr/bin/env python3
"""Install/remove one PSE-only temporary admin cleanup plugin via verified FTPS.

Mode install|remove, always PSE WP root derived from WC_URL in ENV_FILE.
Never dumps credentials, SQL, backup content or users.
"""
import ftplib
import hashlib
import io
import os
from pathlib import Path
import ssl
import sys
from urllib.parse import urlsplit

if len(sys.argv)!=2 or sys.argv[1] not in ('install','remove'):
    raise SystemExit('Usage: template-temporary-ftps.py install|remove')
mode=sys.argv[1]
raw=os.environ.get('FTP_SERVER','').strip()
u=urlsplit(raw if '://' in raw else 'ftp://'+raw)
if not (u.scheme in ('ftp','ftps') and u.hostname and u.port in (None,21)
        and not u.username and not u.password and u.path in ('','/')
        and not u.query and not u.fragment):
    raise RuntimeError('Invalid FTP_SERVER')
values=[]
for line in os.environ.get('ENV_FILE','').splitlines():
    line=line.strip().removeprefix('export ').strip()
    if line.startswith('WC_URL='):
        values.append(line.split('=',1)[1].strip().strip('"\'')) 
if len(values)!=1:
    raise RuntimeError('Expected one trusted WC_URL')
wp=urlsplit(values[0])
if (wp.scheme!='https' or not wp.hostname or wp.port not in (None,443)
        or wp.username or wp.password or wp.path not in ('','/')
        or wp.query or wp.fragment):
    raise RuntimeError('Invalid WP origin')
tools={
    'cache': 'pse-template-temporary-maintenance.php',
    'content': 'pse-template-content-maintenance.php',
    'residue': 'pse-template-residue-inspection.php',
}
tool=os.environ.get('PSE_TEMPLATE_MAINTENANCE_TOOL','cache')
if tool not in tools:
    raise RuntimeError('Unapproved temporary WordPress tool')
name=tools[tool]
file=Path('scripts')/name
data=file.read_bytes()
digest=hashlib.sha256(data).hexdigest()
root=f'/domains/{wp.hostname}/public_html'
ftp=ftplib.FTP_TLS(context=ssl.create_default_context(),timeout=25)
def navigate(path):
    ftp.cwd(path)
    if ftp.pwd().rstrip('/') != path.rstrip('/'):
        raise RuntimeError('FTPS path identity mismatch')
def hash_remote():
    b=io.BytesIO()
    ftp.retrbinary('RETR '+name,b.write)
    return hashlib.sha256(b.getvalue()).hexdigest()
try:
    ftp.connect(u.hostname,u.port or 21)
    ftp.auth()
    ftp.login(os.environ['FTP_USERNAME'],os.environ['FTP_PASSWORD'])
    ftp.prot_p()
    navigate(root)
    ftp.size('wp-load.php')
    navigate(root+'/wp-content/mu-plugins')
    present=False
    try:
        ftp.size(name)
        present=True
    except ftplib.error_perm as e:
        if not str(e).startswith('550'):
            raise
    if mode=='install':
        if present:
            if hash_remote()!=digest:
                raise RuntimeError('Refusing overwrite of unknown temporary plugin')
            print('PSE_TEMP_MAINTENANCE INSTALL_ALREADY_PRESENT=PASS')
        else:
            ftp.storbinary('STOR '+name,io.BytesIO(data))
            if hash_remote()!=digest:
                ftp.delete(name)
                raise RuntimeError('FTP content digest mismatch')
            print('PSE_TEMP_MAINTENANCE INSTALLED=PASS')
    else:
        if present:
            if hash_remote()!=digest:
                raise RuntimeError('Refusing remove of an unexpected PHP file')
            ftp.delete(name)
            print('PSE_TEMP_MAINTENANCE REMOVED=PASS')
        else:
            print('PSE_TEMP_MAINTENANCE ALREADY_REMOVED=PASS')
    print('PSE_TEMP_MAINTENANCE FTPS_CERTIFICATE=VERIFIED')
    print('PSE_TEMP_MAINTENANCE NO_ASTRO_BUILD=PASS')
finally:
    try: ftp.quit()
    except Exception: ftp.close()
