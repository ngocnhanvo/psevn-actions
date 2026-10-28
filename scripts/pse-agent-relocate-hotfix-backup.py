#!/usr/bin/env python3
"""Relocate the one known PSE Agent PHP rollback file outside public_html.

Only touches the hotfix rollback file; never changes active PHP, WordPress data,
Astro or any other backup. The operation is idempotent.
"""
import ftplib
import os
import re
import ssl
import urllib.error
import urllib.request
from urllib.parse import urlsplit

origin = "https://admin-pse.webnvn.com"
session = "00000000-0000-4000-8000-000000000001"
url = origin + "/wp-json/esc/v1/chat-history?session_id=" + session
try:
    with urllib.request.urlopen(url, timeout=25) as response:
        status = response.status
except urllib.error.HTTPError as response:
    status = response.code
assert status in (401, 403), "Secure history must already be live before backup migration"

host_raw = os.environ.get("FTP_SERVER", "").strip()
if "://" not in host_raw:
    host_raw = "ftp://" + host_raw
target = urlsplit(host_raw)
assert target.scheme in ("ftp", "ftps") and target.hostname and target.port in (None, 21)
assert not any((target.username, target.password, target.path.strip("/"), target.query, target.fragment))
assert os.environ.get("FTP_USERNAME") and os.environ.get("FTP_PASSWORD")

root = "/domains/admin-pse.webnvn.com/public_html"
plugin = root + "/wp-content/mu-plugins"
private = "/domains/admin-pse.webnvn.com/.pse-agent-rollback"
ftp = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=30)
try:
    ftp.connect(target.hostname, target.port or 21)
    ftp.auth()
    ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
    ftp.prot_p()
    ftp.cwd(root)
    assert ftp.pwd().rstrip("/") == root
    ftp.voidcmd("TYPE I")
    assert ftp.size("wp-load.php") is not None
    ftp.cwd(plugin)
    assert ftp.pwd().rstrip("/") == plugin
    assert ftp.size("esc-agent.php") is not None

    names = [x.rsplit("/", 1)[-1] for x in ftp.nlst()]
    match = re.compile(r"^\.pse-agent-[a-f0-9]{16}-esc-agent\.php\.backup$")
    rollback_files = sorted(set(x for x in names if match.fullmatch(x)))
    assert len(rollback_files) <= 1, "Multiple rollback sources need manual review"
    if not rollback_files:
        print("PSE_AGENT_HOTFIX_ROLLBACK_RELOCATION=PASS moved=0 already_safe=TRUE")
    else:
        name = rollback_files[0]
        size = ftp.size(name)
        assert size is not None and 100 <= size <= 2_000_000, "Unexpected rollback payload size"
        try:
            ftp.cwd(private)
        except ftplib.error_perm:
            ftp.mkd(private)
            ftp.cwd(private)
        assert ftp.pwd().rstrip("/") == private
        ftp.voidcmd("TYPE I")
        try:
            ftp.size(name)
        except ftplib.error_perm as err:
            assert str(err).startswith("550")
        else:
            raise RuntimeError("Rollback destination already exists")
        ftp.rename(plugin + "/" + name, private + "/" + name)
        ftp.cwd(plugin)
        assert name not in [x.rsplit("/", 1)[-1] for x in ftp.nlst()]
        ftp.cwd(private)
        assert ftp.size(name) == size
        print("PSE_AGENT_HOTFIX_ROLLBACK_RELOCATION=PASS moved=1 outside_webroot=TRUE")
finally:
    try:
        ftp.quit()
    except Exception:
        ftp.close()
