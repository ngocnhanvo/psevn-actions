#!/usr/bin/env python3
"""Read-mostly Playwright E2E for the staging-only NCKH teacher email selector.
Uses an approved existing WP admin secret; never sends mail, prints email, or stores screenshots.
"""
import os
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, expect

BASE = "https://api-nghiencuukhoahoc.webnvn.com"
PAGE = BASE + "/wp-admin/tools.php?page=nckh-invite-email"

def ensure_staging(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "api-nghiencuukhoahoc.webnvn.com":
        raise RuntimeError("STOP: Playwright left the permitted WordPress staging host")


def verify_additional_admin_modules(page, browser):
    """Read-only Chromium QA for independently gated NCKH WordPress admin modules."""
    protected = [
        "/wp-admin/tools.php?page=nckh-rubric",
        "/wp-admin/tools.php?page=nckh-private-files",
        "/wp-admin/users.php?page=nckh-teacher-approval",
    ]
    rubric_url, files_url, teacher_url = [BASE + path for path in protected]

    page.goto(rubric_url, wait_until="domcontentloaded", timeout=45000)
    ensure_staging(page.url)
    if urlparse(page.url).path != "/wp-admin/tools.php":
        raise RuntimeError("Rubric WordPress admin page not accessible")
    expect(page.get_by_role("heading", name="Rubric NCKH — Quản lý phiên bản")).to_be_visible()
    keys = ["problem_solving", "data_analysis", "theory_application", "presentation"]
    criteria = page.locator('input[type="text"][name^="criterion["]')
    expect(criteria).to_have_count(20)
    for key in keys:
        for level in range(1, 6):
            field = page.locator(f'input[name="criterion[{key}][{level}]"]')
            expect(field).to_have_count(1)
            if not field.input_value().strip():
                raise RuntimeError("Rubric draft has an empty required level descriptor")
    if "CHƯA BẬT công bố rubric" not in page.locator("body").inner_text():
        raise RuntimeError("STOP: Rubric publication gate unexpectedly enabled")
    if page.locator('form input[name="action"][value="nckh_rubric_approve"]').count():
        raise RuntimeError("Rubric approval form must remain disabled on staging")
    print("PASS: Rubric editor renders 4x5 descriptors; publication remains OFF")

    page.goto(files_url, wait_until="domcontentloaded", timeout=45000)
    ensure_staging(page.url)
    expect(page.get_by_role("heading", name="Tệp riêng tư EduResearch — staging")).to_be_visible()
    body = page.locator("body").inner_text()
    if "Lưu tệp thật: ĐANG TẮT" not in body:
        raise RuntimeError("STOP: Real private file upload unexpectedly enabled")
    if "public_html" not in body:
        raise RuntimeError("Private storage policy warning was removed")
    marker = "Kiểm tra thư mục ngoài webroot và quyền ghi PHP:"
    if marker not in body:
        raise RuntimeError("D2 PHP-local storage diagnostic absent after staging release")
    if "CHƯA SẴN SÀNG" in body:
        print("BLOCKED D2: PHP reports storage path or write permissions are not ready")
    elif "SẴN SÀNG" in body:
        print("PASS D2: PHP confirms private directory path, no symlink and writable access")
    else:
        raise RuntimeError("D2 PHP directory diagnostic has unknown state")
    print("PASS: Private attachments remain disabled; file backup still unverified")

    page.goto(teacher_url, wait_until="domcontentloaded", timeout=45000)
    ensure_staging(page.url)
    if urlparse(page.url).path != "/wp-admin/users.php":
        raise RuntimeError("Teacher approval admin page not accessible")
    expect(page.get_by_role("heading", name="EduResearch Hub — Duyệt giáo viên")).to_be_visible()
    if "Chỉ tài khoản đã liên kết Google thật" not in page.locator("body").inner_text():
        raise RuntimeError("Teacher approval prerequisite warning is missing")
    forms = page.locator('form input[name="action"][value="nckh_teacher_approval"]')
    if forms.count() == 0 and "Chưa có tài khoản EduResearch" not in page.locator("body").inner_text():
        raise RuntimeError("No teacher approval form or documented empty state")
    print("PASS: Teacher approval UI visible with Google-linked identity guard; roles unchanged")

    anon = browser.new_context(ignore_https_errors=False, accept_downloads=False)
    anon_page = anon.new_page()
    for path in protected:
        anon_page.goto(BASE + path, wait_until="domcontentloaded", timeout=45000)
        ensure_staging(anon_page.url)
        if anon_page.locator('input[name^="criterion["]').count() or (
            anon_page.locator('input[name="action"][value="nckh_teacher_approval"]').count()
        ) or anon_page.locator("h1").filter(has_text="Tệp riêng tư EduResearch — staging").count():
            raise RuntimeError("SECURITY FAIL: Anonymous context can view private NCKH admin module")
    anon.close()
    print("PASS: Anonymous browser cannot access rubric/files/teacher private admin")



def audit_wordpress_home_ctas(page, context):
    """Explicit, guarded one-time WordPress home CTA fix; defaults to read-only."""
    import re
    import json
    nonce_response = context.request.get(BASE + "/wp-admin/admin-ajax.php?action=rest-nonce", timeout=30000)
    if not nonce_response.ok:
        raise RuntimeError("Home page audit: WordPress REST nonce unavailable")
    nonce = nonce_response.text().strip()
    if not (8 <= len(nonce) <= 20):
        raise RuntimeError("Home page audit: invalid REST nonce")
    headers = {"X-WP-Nonce": nonce, "Accept": "application/json"}
    response = context.request.get(BASE + "/wp-json/wp/v2/pages?context=edit&per_page=100", headers=headers, timeout=40000)
    if not response.ok:
        raise RuntimeError(f"Home page audit: WP pages listing HTTP {response.status}")
    pages = response.json()
    if not isinstance(pages, list):
        raise RuntimeError("Home page audit: not a list")
    markers = ("Hai phân hệ trong cùng một không gian học tập", "Bắt đầu hành trình nghiên cứu của bạn")
    matching = [item for item in pages if isinstance(item.get("content"),dict) and all(
        mark in item["content"].get("raw","") for mark in markers)]
    if len(matching)!=1 or matching[0].get("id")!=248 or matching[0].get("slug")!="trang-chu":
        raise RuntimeError("STOP: exactly one approved WordPress staging homepage (id 248) was not found")
    original=matching[0]["content"]["raw"]
    print("PASS HOME AUDIT: WordPress staging home id 248, slug trang-chu, unique content match")

    # Works on the WordPress-managed page HTML only, preserving all other WP fields.
    def replace_anchor(html, old_label, new_label, dest):
        anchors=list(re.finditer(r'<a\b[^>]*>[\s\S]*?</a\s*>',html,re.IGNORECASE))
        found=[m for m in anchors if old_label in m.group()]
        if not found:
            if new_label in html: return html
            raise RuntimeError("STOP: expected homepage CTA label not found: "+old_label)
        if len(found)!=1:
            raise RuntimeError("STOP: ambiguous homepage CTA: "+old_label)
        hit=found[0]
        old=hit.group()
        open_match=re.match(r'<a\b[^>]*>',old,re.IGNORECASE)
        if not open_match:
            raise RuntimeError("STOP: malformed CTA")
        tag=open_match.group()
        patched_tag,n=re.subn(r'\bhref\s*=\s*(["\']).*?\1','href="'+dest+'"',tag,count=1,flags=re.IGNORECASE|re.DOTALL)
        if n!=1:
            raise RuntimeError("STOP: existing CTA has no quoted href")
        new=patched_tag+old[len(tag):].replace(old_label,new_label,1)
        return html[:hit.start()]+new+html[hit.end():]

    def replace_preview_label(html, choice, label, dest, accessible):
        pattern=r'<label\b(?=[^>]*\bfor\s*=\s*["\']'+re.escape(choice)+r'["\'])[^>]*>\s*'+re.escape(label)+r'\s*</label>'
        replacement='<a class="nd-tab" href="'+dest+'" aria-label="'+accessible+'">'+label+' ↗</a>'
        fixed,n=re.subn(pattern,lambda _: replacement,html,count=1,flags=re.IGNORECASE)
        if n!=1:
            if replacement in html: return html
            raise RuntimeError("STOP: WP homepage feature label not found: "+choice)
        return fixed

    updated=replace_anchor(original,"Xem không gian nghiên cứu","Mở Sổ tay NCKH","/so-tay")
    updated=replace_anchor(updated,"Xem trước các tính năng","Bắt đầu sử dụng Sổ tay","/so-tay")
    updated=replace_preview_label(updated,"nd-choose-journal","Sổ tay NCKH","/so-tay","Mở Sổ tay NCKH thật")
    updated=replace_preview_label(updated,"nd-choose-skills","Quản lý kỹ năng","/so-tay?tab=skills","Mở Quản lý kỹ năng thật")
    updated=updated.replace(
        "Các màn hình bên cạnh chỉ minh họa quy trình, chưa kết nối hệ thống.",
        "Dữ liệu bên cạnh là minh họa. Chọn Sổ tay hoặc Quản lý kỹ năng để mở ứng dụng thật."
    ).replace(
        "Chúng tôi đang hoàn thiện không gian giúp bạn ghi chép, trao đổi và phát triển nghiên cứu một cách bài bản.",
        "Ghi chép, trao đổi với giáo viên và theo dõi tiến trình kỹ năng trực tiếp trong ứng dụng."
    )
    if updated==original:
        print("PASS HOME AUDIT: direct CTA links already present, no WordPress write needed")
        return
    if os.environ.get("NCKH_HOME_CTA_APPLY")!="1":
        print("HOME AUDIT: safe direct-link update ready but disabled; no WordPress content changed")
        return
    # Re-fetch the exact staging page to avoid racing a newer editorial update.
    page_url=BASE+"/wp-json/wp/v2/pages/248?context=edit"
    again=context.request.get(page_url,headers=headers,timeout=30000)
    if not again.ok or again.json().get("slug")!="trang-chu" or (
        again.json().get("content",{}).get("raw")!=original):
        raise RuntimeError("STOP: homepage content changed since read; no write performed")

    import ftplib,io,secrets,time,hashlib
    required=("FTP_SERVER","FTP_USERNAME","FTP_PASSWORD")
    if any(not os.environ.get(k) for k in required):
        raise RuntimeError("STOP: staging FTPS secrets unavailable for homepage backup")
    from urllib.parse import urlparse
    raw=os.environ["FTP_SERVER"]
    server=urlparse(raw if "://" in raw else "ftps://"+raw)
    ftp=ftplib.FTP_TLS()
    ftp.connect(server.hostname,server.port or 21,timeout=30)
    try:
        ftp.login(os.environ["FTP_USERNAME"],os.environ["FTP_PASSWORD"])
        ftp.prot_p()
        root="/domains/api-nghiencuukhoahoc.webnvn.com"
        ftp.cwd(root)
        if ftp.pwd().rstrip("/")!=root: raise RuntimeError("STOP: wrong FTP domain")
        try:
            ftp.cwd(root+"/nckh-config-backups")
        except ftplib.error_perm as e:
            if not str(e).startswith("550"): raise
            ftp.cwd(root);ftp.mkd("nckh-config-backups");ftp.cwd(root+"/nckh-config-backups")
        backup_name="nckh-home-links-before-"+str(int(time.time()))+"-"+secrets.token_hex(4)+".html.txt"
        content_bytes=original.encode("utf-8")
        ftp.storbinary("STOR "+backup_name,io.BytesIO(content_bytes))
        saved=bytearray()
        ftp.retrbinary("RETR "+backup_name,saved.extend)
        if hashlib.sha256(saved).digest()!=hashlib.sha256(content_bytes).digest():
            raise RuntimeError("STOP: original staging homepage FTPS backup checksum mismatch")
    finally:
        try: ftp.quit()
        except ftplib.all_errors: pass
    print("PASS HOME BACKUP: original WordPress homepage stored outside public_html and verified")

    posted=context.request.post(
        BASE+"/wp-json/wp/v2/pages/248",
        data=json.dumps({"content":updated},ensure_ascii=False),
        headers={**headers,"Content-Type":"application/json"},timeout=55000
    )
    if not posted.ok:
        raise RuntimeError(f"WordPress staging home CTA update rejected HTTP {posted.status}")
    final=context.request.get(page_url,headers=headers,timeout=35000)
    if not final.ok or final.json().get("content",{}).get("raw")!=updated:
        raise RuntimeError("STOP: WordPress homepage update could not be verified byte-for-byte")
    print("PASS HOME UPDATED: WordPress staging homepage CTAs now link directly to the real NCKH notebook/skills")

def verify_live_homepage_navigation(browser):
    """Click actual public Astro/WordPress homepage links; no sign-in or user data writes."""
    frontend = "https://nghiencuukhoahoc.webnvn.com"
    front = urlparse(frontend)
    def safe_front_url(url):
        dest = urlparse(url)
        if dest.scheme != "https" or dest.hostname != front.hostname:
            raise RuntimeError("STOP: staging homepage click left the approved Astro host")
        return dest
    public = browser.new_context(ignore_https_errors=False, locale="vi-VN", accept_downloads=False)
    page = public.new_page()
    page.set_default_timeout(25000)
    page.goto(frontend + "/", wait_until="domcontentloaded", timeout=60000)
    safe_front_url(page.url)
    expect(page.locator('.nd-tabs a.nd-tab[href="/so-tay"]')).to_have_count(1)
    expect(page.locator('.nd-tabs a.nd-tab[href="/so-tay?tab=skills"]')).to_have_count(1)
    expect(page.locator('.nd-cta a.nd-btn[href="/so-tay"]')).to_have_count(1)
    expect(page.locator('.nd-cta a.nd-btn')).to_contain_text("Bắt đầu sử dụng Sổ tay")
    if page.locator('.nd-cta a[href^="#"]').count():
        raise RuntimeError("Homepage main CTA still loops to an in-page preview")
    print("PASS HOME BROWSER: WordPress homepage renders direct real notebook and skills links")

    page.locator('.nd-cta a.nd-btn').click()
    page.wait_for_url("**/so-tay", timeout=55000)
    route = safe_front_url(page.url)
    if route.path != "/so-tay":
        raise RuntimeError("Homepage call-to-action did not reach real notebook route")
    expect(page.locator("#login-link")).to_have_count(1)
    print("PASS HOME CLICK: last-page CTA opens the real notebook application")

    page.goto(frontend + "/", wait_until="domcontentloaded", timeout=60000)
    safe_front_url(page.url)
    page.locator('.nd-tabs a.nd-tab[href="/so-tay?tab=skills"]').click()
    page.wait_for_url("**/so-tay?tab=skills", timeout=55000)
    route = safe_front_url(page.url)
    if route.path != "/so-tay" or route.query != "tab=skills":
        raise RuntimeError("Homepage skills link did not preserve deep-linked tab")
    expect(page.locator("#tab-skills")).to_have_count(1)
    print("PASS HOME CLICK: skill feature opens the real workspace with tab=skills")
    public.close()


def main():
    username = os.environ.get("WP_ADMIN_USERNAME", "")
    password = os.environ.get("WP_ADMIN_PASSWORD", "")
    if not username or not password:
        raise RuntimeError("STOP: Existing WP staging admin secrets missing; no test session started")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(ignore_https_errors=False, locale="vi-VN", accept_downloads=False)
        page = context.new_page()
        page.set_default_timeout(20000)
        ensure_staging(BASE)
        page.goto(BASE + "/wp-login.php", wait_until="domcontentloaded", timeout=45000)
        ensure_staging(page.url)
        page.locator("#user_login").fill(username)
        page.locator("#user_pass").fill(password)
        page.locator("#wp-submit").click()
        page.wait_for_url("**/wp-admin/**", timeout=45000)
        ensure_staging(page.url)
        print("PASS: Chromium signed into existing WordPress staging administrator")

        page.goto(PAGE, wait_until="domcontentloaded", timeout=45000)
        ensure_staging(page.url)
        if urlparse(page.url).path != "/wp-admin/tools.php":
            raise RuntimeError("Admin teacher email page not available")
        expect(page.locator("#nckh-test-teacher")).to_be_visible()
        expect(page.locator('form input[name="action"][value="nckh_invite_email_test_teacher"]')).to_have_count(1)
        expect(page.locator('form input[name="_wpnonce"]')).to_have_count(1)

        # No selection occurs if server flag is on. This action must not send a real email.
        if "ĐANG TẮT (an toàn)" not in page.locator("body").inner_text():
            raise RuntimeError("STOP: Outbound email appears enabled; will not change selection")

        choices = page.locator("#nckh-test-teacher option")
        available = [v for v in choices.evaluate_all("(els) => els.map(el => el.value)") if v and v != "0"]
        if not available:
            raise RuntimeError("No verified Google-linked teacher is listed on NCKH Email page")
        print(f"PASS: WordPress selector shows {len(available)} verified Google-linked teacher account(s)")

        selected = page.locator("#nckh-test-teacher").input_value()
        if selected in available:
            print("PASS: An approved verified teacher is already selected; no admin write needed")
        elif len(available) == 1:
            page.locator("#nckh-test-teacher").select_option(available[0])
            page.locator('form input[name="submit"]').click()
            page.wait_for_url("**/wp-admin/tools.php?page=nckh-invite-email&saved=1", timeout=40000)
            ensure_staging(page.url)
            expect(page.locator("#nckh-test-teacher")).to_have_value(available[0])
            print("PASS: Selected the sole verified teacher via nonce-protected staging admin UI")
        else:
            print("SAFE SKIP: Multiple verified teachers; requires explicit selection by admin")

        page.reload(wait_until="domcontentloaded", timeout=45000)
        ensure_staging(page.url)
        expect(page.locator("#nckh-test-teacher")).to_be_visible()
        if "ĐANG TẮT (an toàn)" not in page.locator("body").inner_text():
            raise RuntimeError("STOP: outbound flag unexpectedly active after selection")
        print("PASS: Admin selector persists and automatic invitation mail remains OFF")

        anon = browser.new_context(ignore_https_errors=False)
        anon_page = anon.new_page()
        anon_page.goto(PAGE, wait_until="domcontentloaded", timeout=45000)
        ensure_staging(anon_page.url)
        if anon_page.locator("#nckh-test-teacher").count():
            raise RuntimeError("SECURITY FAIL: Anonymous visitor can view teacher selector")
        print("PASS: Anonymous visitor cannot read privileged teacher selector")
        anon.close()
        verify_additional_admin_modules(page, browser)
        audit_wordpress_home_ctas(page, context)
        verify_live_homepage_navigation(browser)
        context.close()
        browser.close()

    print("PASS: Playwright NCKH multi-module staging admin E2E; no SMTP send, no private upload, no rubric publish")

if __name__ == "__main__":
    main()
