#!/usr/bin/env python3
"""PSE Build Website UI-only FTPS patch release; two pinned files, no Astro build."""
from __future__ import annotations

import argparse
import difflib
import ftplib
import hashlib
import io
import os
from pathlib import Path
import re
import secrets
import ssl
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
mode = parser.add_mutually_exclusive_group(required=True)
mode.add_argument('--check-only', action='store_true')
mode.add_argument('--deploy', action='store_true')
args = parser.parse_args()

PLUGIN = 'wp-content/plugins/github-trigger'
FILES = ('vcs-build-trigger.php', 'vcs-build-trigger.js')
SOURCE = Path('source-php') / PLUGIN
sha = os.environ.get('PSE_PHP_SOURCE_SHA', '')
if not re.fullmatch(r'[a-f0-9]{40}', sha):
    raise SystemExit('Invalid pinned PSE PHP source SHA')
if not all((SOURCE / n).is_file() and (SOURCE / n).stat().st_size for n in FILES):
    raise SystemExit('Incomplete reviewed Build Website plugin files')
php = (SOURCE / FILES[0]).read_text(encoding='utf-8')
js = (SOURCE / FILES[1]).read_text(encoding='utf-8')
if not all(s in php for s in ('class VCS_Build_Trigger', "'duration_seconds'", "'1.2.7'")):
    raise SystemExit('Pinned PHP source lacks reviewed status behavior')
if not all(s in js for s in ('formatDuration(exactDuration)', 'completedOnThisPage', 'Đang xác minh trạng thái')):
    raise SystemExit('Pinned JS source lacks reviewed status behavior')

origins = []
for line in os.environ.get('ENV_FILE', '').splitlines():
    m = re.fullmatch(r"\s*(?:export\s+)?WC_URL\s*=\s*(.*?)\s*", line)
    if m:
        origins.append(m.group(1).strip().strip("'\""))
if len(origins) != 1:
    raise SystemExit('Missing or ambiguous PSE WordPress origin')
wp = urlsplit(origins[0])
if not (wp.scheme == 'https' and wp.hostname == 'admin-pse.webnvn.com'
        and wp.port in (None, 443) and wp.path in ('', '/') and not wp.username
        and not wp.password and not wp.query and not wp.fragment):
    raise SystemExit('Wrong PSE WordPress host')
raw = os.environ.get('FTP_SERVER', '').strip()
if '://' not in raw:
    raw = 'ftp://' + raw
server = urlsplit(raw)
if not (server.scheme in ('ftp', 'ftps') and server.hostname and server.port in (None, 21)
        and not server.username and not server.password and not server.path.strip('/')
        and not server.query and not server.fragment):
    raise SystemExit('Invalid FTPS host')
if not os.environ.get('FTP_USERNAME') or not os.environ.get('FTP_PASSWORD'):
    raise SystemExit('Missing FTPS credential')

root = '/domains/' + wp.hostname
webroot = root + '/public_html'
pluginroot = webroot + '/' + PLUGIN
rollbackroot = root + '/.pse-build-trigger-rollback'

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

ftp = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=35)
items = []
activated = []
try:
    ftp.connect(server.hostname, server.port or 21)
    ftp.auth()
    ftp.login(os.environ['FTP_USERNAME'], os.environ['FTP_PASSWORD'])
    ftp.prot_p()

    def cwd(folder: str) -> None:
        ftp.cwd(folder)
        if ftp.pwd().rstrip('/') != folder.rstrip('/'):
            raise RuntimeError('Remote FTPS directory mismatch')

    def exists(name: str) -> bool:
        ftp.voidcmd('TYPE I')
        try:
            ftp.size(name)
            return True
        except ftplib.error_perm as e:
            if str(e).startswith('550'):
                return False
            raise

    def read(name: str) -> bytes:
        out = io.BytesIO()
        ftp.retrbinary('RETR ' + name, out.write)
        return out.getvalue()

    def write(name: str, data: bytes) -> None:
        ftp.storbinary('STOR ' + name, io.BytesIO(data))
        if digest(read(name)) != digest(data):
            raise RuntimeError('FTPS readback checksum mismatch')

    cwd(webroot)
    if not exists('wp-load.php'):
        raise RuntimeError('PSE WordPress docroot identity mismatch')
    cwd(pluginroot)
    remote = {}
    for name in FILES:
        if not exists(name):
            raise RuntimeError('Build Website plugin file absent: ' + name)
        old = read(name)
        if name.endswith('.php') and not all(x in old for x in (b'class VCS_Build_Trigger', b'wp_ajax_vcs_check_build_status')):
            raise RuntimeError('Remote PHP plugin identity mismatch')
        if name.endswith('.js') and not all(x in old for x in (b'vcs_check_build_status', b'getFormattedTime')):
            raise RuntimeError('Remote JS plugin identity mismatch')
        new = (SOURCE / name).read_bytes()
        # Avoid replacing unknown live edits to an unrelated plugin revision.
        similarity = difflib.SequenceMatcher(None, old.splitlines(), new.splitlines(), autojunk=False).ratio()
        if similarity < 0.90:
            raise RuntimeError('Remote plugin has unexpected source drift: ' + name)
        remote[name] = old
        print('PSE_BUILD_STATUS_FTPS_PRECHECK name=' + name + ' similarity=' + format(similarity,'.3f'))

    pending = [name for name in FILES if digest(remote[name]) != digest((SOURCE / name).read_bytes())]
    if args.check_only:
        print('PSE_BUILD_STATUS_FTPS_CHECK=PASS changed=' + str(len(pending)) + ' source=' + sha)
    else:
        # A preserved backup outside the web root is mandatory before editing.
        cwd(root)
        try:
            cwd(rollbackroot)
        except ftplib.error_perm as e:
            if not str(e).startswith('550'):
                raise
            ftp.mkd(rollbackroot)
            cwd(rollbackroot)
        backupdir = rollbackroot + '/' + sha
        try:
            cwd(backupdir)
        except ftplib.error_perm as e:
            if not str(e).startswith('550'):
                raise
            ftp.mkd(backupdir)
            cwd(backupdir)
        for name in pending:
            backupname = 'original-' + name
            if exists(backupname):
                if digest(read(backupname)) != digest(remote[name]):
                    raise RuntimeError('Existing rollback backup differs: ' + name)
            else:
                write(backupname, remote[name])
        print('PSE_BUILD_STATUS_FTPS_PRIVATE_ROLLBACK=PASS copies=' + str(len(pending)))
        cwd(pluginroot)
        token = secrets.token_hex(8)
        # Prepare all changed files before activating either one.
        for name in pending:
            new = (SOURCE / name).read_bytes()
            stage = '.pse-build-status-' + token + '-' + name + '.stage'
            backup = '.pse-build-status-' + token + '-' + name + '.backup'
            if exists(stage) or exists(backup):
                raise RuntimeError('FTPS staging file collision')
            item = dict(name=name, stage=stage, backup=backup, new=new, original=remote[name], moved=False)
            items.append(item)
            write(stage, new)
        print('PSE_BUILD_STATUS_FTPS_STAGE=PASS count=' + str(len(items)))
        for item in items:
            ftp.rename(item['name'], item['backup'])
            item['moved'] = True
            ftp.rename(item['stage'], item['name'])
            if digest(read(item['name'])) != digest(item['new']):
                raise RuntimeError('Activation readback mismatch: ' + item['name'])
            activated.append(item['name'])
        for item in items:
            if exists(item['backup']):
                ftp.delete(item['backup'])
        print('PSE_BUILD_STATUS_FTPS_DEPLOY=PASS changed=' + str(len(activated)) + ' source=' + sha)
        print('PSE_BUILD_STATUS_FTPS_NO_ASTRO_BUILD=PASS')
except BaseException as e:
    if args.deploy and items and len(activated) != len(items):
        print('PSE_BUILD_STATUS_FTPS_ROLLBACK=BEGIN reason=' + type(e).__name__)
        restored = True
        for item in reversed(items):
            try:
                cwd(pluginroot)
                if exists(item['backup']):
                    if exists(item['name']):
                        ftp.delete(item['name'])
                    ftp.rename(item['backup'], item['name'])
                    if digest(read(item['name'])) != digest(item['original']):
                        restored = False
                if exists(item['stage']):
                    ftp.delete(item['stage'])
            except ftplib.all_errors:
                restored = False
        print('PSE_BUILD_STATUS_FTPS_ROLLBACK=' + ('PASS' if restored else 'MANUAL_REVIEW_REQUIRED'))
    raise
finally:
    try:
        ftp.quit()
    except Exception:
        ftp.close()
