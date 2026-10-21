#!/usr/bin/env python3
"""NCKH-only WordPress SEO Files staging fix: guarded FTPS + real Chrome save.

Only writes:
  api-nghiencuukhoahoc.webnvn.com/wp-content/mu-plugins/esc-seo-files.php
  the owner's requested one-URL sitemap setting via authenticated WP admin.

Never modifies the Astro source/deployment or other WordPress installations.
"""
from __future__ import annotations

import ftplib
import hashlib
import io
import json
import os
import time
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

from playwright.sync_api import sync_playwright

API_HOST = "api-nghiencuukhoahoc.webnvn.com"
API_ORIGIN = "https://" + API_HOST
SITE = "https://nghiencuukhoahoc.webnvn.com"
FTP_DIR = "/domains/" + API_HOST
SOURCE = Path("source/wp-content/mu-plugins/esc-seo-files.php")
TARGET = "public_html/wp-content/mu-plugins/esc-seo-files.php"
BACKUPS = "nckh-config-backups"


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def remote_read(ftp: ftplib.FTP_TLS, path: str) -> bytes | None:
    buf = io.BytesIO()
    try:
        ftp.retrbinary("RETR " + path, buf.write)
    except ftplib.error_perm as exc:
        if str(exc).startswith("550"):
            return None
        raise
    return buf.getvalue()


def expected_public_sitemap(context) -> str:
    response = context.request.get(
        SITE + "/sitemap.xml",
        headers={"Cache-Control": "no-cache"},
        timeout=35000,
    )
    if response.status != 200:
        raise RuntimeError("Public staging sitemap is unavailable")
    xml = response.text()
    ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    urls = [item.text for item in ET.fromstring(xml).findall(f"{ns}url/{ns}loc")]
    if urls != [SITE + "/"]:
        raise RuntimeError("STOP: staging sitemap differs from reviewed single public homepage")
    return xml


def smoke_save() -> None:
    user = os.environ.get("WP_ADMIN_USERNAME", "")
    password = os.environ.get("WP_ADMIN_PASSWORD", "")
    if not user or not password:
        raise RuntimeError("Missing staging WordPress admin test account")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(
            viewport={"width": 1280, "height": 860},
            extra_http_headers={"Cache-Control": "no-cache"},
        )
        try:
            public_xml = expected_public_sitemap(context)
            before = context.request.get(API_ORIGIN + "/wp-json/esc-seo-files/v1/public", timeout=30000)
            if before.status != 200:
                raise RuntimeError("SEO Files public contract unavailable on WordPress staging")
            initial = before.json()
            if initial.get("site") != SITE:
                raise RuntimeError("STOP: SEO Files still resolves old/foreign canonical host")
            if initial.get("sitemap", {}).get("mode") == "manual":
                previous_xml = initial.get("sitemap", {}).get("xml") or ""
                if previous_xml.strip() and previous_xml.strip() != public_xml.strip():
                    # No surprise rewrite of a manual sitemap with additional real pages.
                    # Legacy Blue Sea or retired .id.vn copies are handled by PHP migration.
                    if (SITE in previous_xml or
                        "xuongmunonbaohiem" not in previous_xml
                        and "nghiencuukhoahoc.id.vn" not in previous_xml):
                        raise RuntimeError("STOP: different existing manual sitemap; no destructive overwrite")
            page = context.new_page()
            page.goto(API_ORIGIN + "/wp-login.php", wait_until="domcontentloaded", timeout=50000)
            page.locator("#user_login").fill(user)
            page.locator("#user_pass").fill(password)
            page.locator("#wp-submit").click()
            page.wait_for_load_state("domcontentloaded", timeout=45000)
            target = API_ORIGIN + "/wp-admin/options-general.php?page=esc-seo-files&tab=sitemap"
            page.goto(target, wait_until="domcontentloaded", timeout=50000)
            if not page.locator('input[name="action"][value="esc_seo_files_save"]').count():
                raise RuntimeError("Staging SEO Files admin not available with authenticated account")
            live_link = page.locator(".esc-seo-files a", has_text="Xem trên website").first
            if live_link.count() != 1 or live_link.get_attribute("href") != SITE + "/sitemap.xml":
                raise RuntimeError("WordPress SEO Files link targets wrong frontend origin")
            # User's exact one-URL manual XML as shown in the bug report.
            page.locator('input[name="sitemap_mode"][value="manual"]').check()
            page.locator("#esc-seo-xml").fill(public_xml)
            page.locator("#esc-seo-confirm-drop").check()
            page.locator(".esc-seo-files form").first.locator("#submit").click()
            page.wait_for_load_state("domcontentloaded", timeout=45000)
            url = urllib.parse.urlparse(page.url)
            query = urllib.parse.parse_qs(url.query)
            # WordPress may normalize admin screen query parameters on
            # redirect. The persisted option is the source of truth, not
            # a byte-for-byte match against a redirect query string.
            if url.netloc != API_HOST or not url.path.endswith("/wp-admin/options-general.php"):
                raise RuntimeError("WordPress save did not return to admin settings")
            print("POST SAVE: returned to WordPress admin; query keys:",
                  sorted(query.keys()))
            result = context.request.get(API_ORIGIN + "/wp-json/esc-seo-files/v1/public",
                                         headers={"Cache-Control": "no-cache"}, timeout=30000)
            if result.status != 200:
                raise RuntimeError("Saved public SEO contract endpoint returned HTTP " + str(result.status))
            data = result.json()
            saved = data.get("sitemap", {})
            if (data.get("site") != SITE or saved.get("mode") != "manual"
                    or saved.get("xml", "").strip() != public_xml.strip()):
                raise RuntimeError("WordPress returned success but manual sitemap settings were not persisted")
            # Reopen the edit screen to verify persisted form values as well.
            page.goto(target, wait_until="domcontentloaded", timeout=50000)
            if not page.locator('input[name="sitemap_mode"][value="manual"]').is_checked():
                raise RuntimeError("WordPress admin form did not retain manual sitemap mode")
            if page.locator("#esc-seo-xml").input_value().strip() != public_xml.strip():
                raise RuntimeError("WordPress admin textarea did not retain saved sitemap XML")
            # Legacy staging Astro manifest owns publicly deployed XML, not this WP option.
            # No triggering Astro build, no accidental publishing of private pages.
            print("PASS: real Chrome WordPress admin-post save and reopened form")
            print("PASS: manual sitemap persisted via SEO Files public REST contract")
            print("PASS: staging frontend sitemap remains the reviewed one-public-URL document")
            print("Scope: one NCKH WordPress MU plugin, safe one-URL admin config, no Astro master/production")
        finally:
            context.close()
            browser.close()


def main() -> None:
    source = SOURCE.read_bytes()
    if (b"Plugin Name: EduResearch Hub SEO Files" not in source
            or b"https://nghiencuukhoahoc.webnvn.com" not in source
            or b"function esc_seo_files_validate_manual_xml" not in source):
        raise RuntimeError("STOP: source file is not approved NCKH SEO Files")
    for key in ("FTP_SERVER", "FTP_USERNAME", "FTP_PASSWORD"):
        if not os.environ.get(key):
            raise RuntimeError("Missing FTPS staging secret: " + key)
    host_value = os.environ["FTP_SERVER"]
    parsed = urllib.parse.urlparse(host_value if "://" in host_value else "ftps://" + host_value)
    if not parsed.hostname:
        raise RuntimeError("Missing FTP server address")
    ftp = ftplib.FTP_TLS()
    ftp.connect(parsed.hostname, parsed.port or 21, timeout=25)
    ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
    ftp.prot_p()
    ftp.cwd(FTP_DIR)
    if not ftp.pwd().rstrip("/").endswith(FTP_DIR):
        raise RuntimeError("FTP destination mismatch: abort deployment")
    try:
        try:
            ftp.mkd(BACKUPS)
        except ftplib.error_perm as exc:
            if not str(exc).startswith("550"):
                raise
        prior = remote_read(ftp, TARGET)
        if prior is None:
            raise RuntimeError("STOP: existing staging SEO MU plugin missing; refuse unreviewed new install")
        is_same = sha(prior) == sha(source)
        old_backup = None
        if not is_same:
            stamp = str(int(time.time()))
            temp = BACKUPS + "/seo-files-stage-" + stamp + ".txt"
            old_backup = BACKUPS + "/seo-files-prev-" + stamp + ".txt"
            ftp.storbinary("STOR " + temp, io.BytesIO(source))
            candidate = remote_read(ftp, temp)
            if candidate is None or sha(candidate) != sha(source):
                raise RuntimeError("FTPS staged file checksum mismatch")
            deployed = False
            try:
                ftp.rename(TARGET, old_backup)
                ftp.rename(temp, TARGET)
                deployed = True
                remote = remote_read(ftp, TARGET)
                if remote is None or sha(remote) != sha(source):
                    raise RuntimeError("Post-deploy PHP checksum mismatch")
                print("PASS: isolated WordPress SEO Files staged with recoverable backup")
                smoke_save()
            except Exception:
                # Restore the previous plugin, even if the browser verification fails.
                try:
                    if deployed:
                        ftp.delete(TARGET)
                    ftp.rename(old_backup, TARGET)
                except Exception as rollback:
                    print("ERROR: automatic rollback failed, manual attention required:", type(rollback).__name__)
                raise
        else:
            print("PASS: exact SEO Files source already deployed, skipping identical FTPS write")
            smoke_save()
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            pass


if __name__ == "__main__":
    main()
