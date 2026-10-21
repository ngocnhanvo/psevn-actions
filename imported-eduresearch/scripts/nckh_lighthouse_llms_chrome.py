#!/usr/bin/env python3
"""Read-only Playwright Chromium rendering checks for Astro github CSS.

Runs a local DOM fixture using *actual* CSS from the development branch.
It does not claim that an undeployed fix is present on the public website.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ORIGIN = "https://nghiencuukhoahoc.webnvn.com"
ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path("source").resolve()
STYLES = (ROOT / "src/styles/eduresearch-home.css").read_text(encoding="utf-8")
HEADER = (ROOT / "src/astro/components/Layout/Header.astro").read_text(encoding="utf-8")
LLMS = (ROOT / "public/llms.txt").read_text(encoding="utf-8")


def channel(v: int) -> float:
    s = v / 255.0
    return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4


def luminance(rgb: list[int]) -> float:
    return sum(x * channel(y) for x, y in zip((0.2126, 0.7152, 0.0722), rgb[:3]))


def contrast(foreground: list[int], background: list[int]) -> float:
    top, bottom = sorted((luminance(foreground), luminance(background)), reverse=True)
    return (top + 0.05) / (bottom + 0.05)


def parse_rgb(value: str) -> list[int]:
    matches = re.findall(r"[\d.]+", value)
    if len(matches) < 3:
        raise AssertionError(f"Invalid browser color: {value}")
    return [round(float(x)) for x in matches[:3]]


def main() -> None:
    m = re.search(
        r"#main-header\.research-header\s+\.research-brand-subtitle\s*\{[^}]*?color:\s*(#[0-9a-fA-F]{6})",
        HEADER,
    )
    assert m, "Cannot find the source subtitle CSS color"
    title_color = m.group(1)
    links = re.findall(r"\[[^\]]+\]\((https://[^)]+)\)", LLMS)
    assert LLMS.lstrip().startswith("# "), "llms.txt must have Markdown H1"
    assert len(links) >= 2, "llms.txt must contain Markdown links"
    assert all(link.startswith(ORIGIN + "/") for link in links), "Only public canonical links allowed"
    assert "nghiencuukhoahoc.id.vn" not in LLMS

    fixture = f"""<!DOCTYPE html><html lang="vi"><head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>{STYLES}</style>
    <style>#main-header.research-header .research-brand-subtitle {{ color: {title_color}; }}</style>
    </head><body style="margin:0;background:#fff">
    <header id="main-header" class="research-header" style="background:#fff">
      <div class="research-brand-copy">
        <span class="research-brand-subtitle">NHẬT KÝ KHOA HỌC</span>
      </div>
    </header>
    <main class="nd-page">
      <h1>Nhật ký khoa học cùng giáo viên</h1>
      <section id="gioi-thieu">
        <div class="nd-container">
          <div class="nd-hero-image">
            <div class="nd-document">
              <div class="nd-document-body">
                <h2>Nhật ký khảo sát và thu thập mẫu</h2>
                <p class="nd-paper-p">Ghi nhận mẫu nước và phân tích kết quả khảo sát.</p>
                <div class="nd-doc-foot"><span>Ngày khảo sát · Ví dụ</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="khong-gian">
        <div class="nd-container"><div class="nd-work-text">
          <p class="nd-demo-label">Dữ liệu bên cạnh là minh họa.</p>
        </div></div>
      </section>
      <footer class="nd-footer">
        <div class="nd-container"><div class="nd-copyright">
          <span>© 2026 EduResearch Hub</span>
          <span>Bản minh họa tính năng</span>
        </div></div>
      </footer>
    </main></body></html>"""
    samples = [
        ("header brand subtitle", "#main-header .research-brand-subtitle", "#ffffff"),
        ("notebook description", ".nd-document .nd-paper-p", "#ffffff"),
        ("notebook date", ".nd-document .nd-doc-foot span", "#ffffff"),
        ("demo helper", ".nd-demo-label", "#ffffff"),
        ("footer copyright", ".nd-copyright span:first-child", "#f8f9fc"),
        ("footer footnote", ".nd-copyright span:last-child", "#f8f9fc"),
    ]

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 412, "height": 915}, device_scale_factor=1)
        page.set_content(fixture, wait_until="load")
        for label, selector, expected_bg in samples:
            target = page.locator(selector)
            assert target.count() == 1, f"Missing fixture selector {selector}"
            fg = parse_rgb(target.evaluate("(el) => getComputedStyle(el).color"))
            bg = [int(expected_bg[i:i + 2], 16) for i in (1, 3, 5)]
            ratio = contrast(fg, bg)
            print(f"{label}: contrast {ratio:.2f}:1")
            assert ratio >= 4.5, f"WCAG AA contrast failed for {label}: {ratio:.2f}"
        heading_sequence = page.locator("h1, h2, h3").evaluate_all(
            "(els) => els.map(el => Number(el.tagName[1]))"
        )
        assert heading_sequence == [1, 2], f"Preview heading order invalid: {heading_sequence}"
        print("PASS: Playwright Chromium (mobile) verified all 6 reported contrast nodes and heading fixture.")
        print("PASS: Development llms.txt canonical Markdown links.")
        print("Scope: local rendering fixture from Astro github. No staging deployment, production login, or data writes.")
        browser.close()


if __name__ == "__main__":
    main()
