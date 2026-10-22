#!/usr/bin/env python3
"""Read-only, bounded public-content inventory of the legacy PSE website.

Migration research only. Does not access WP Admin, mutate sites or deploy anything.
Output is a provisional manifest: unknown fields are null, never fabricated.
"""
import hashlib
import json
import os
import re
import time
import heapq
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen

SOURCE = "https://www.pse.vn/"
SEEDS = [
    SOURCE,
    "https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty.html",
    "https://www.pse.vn/hoat-dong-kinh-doanh/thong-tin-thi-truong.html",
    "https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh.html",
]
MAX_PAGES = 110
MAX_PAGE_SECONDS = 232
MAX_SECONDS = 310
MAX_FILES_TO_VERIFY = 10
DOCUMENT_EXTENSIONS = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip")
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg")
IGNORED_EXTENSIONS = (".js", ".css", ".woff", ".woff2", ".ttf", ".ico", ".map")
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; PSE-PublicMigrationAudit/1.0)", "Accept": "text/html,application/xhtml+xml"}
TARGET_HOSTS = {"pse.vn", "www.pse.vn"}


def plain(value):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]*>", " ", str(value or "")))).strip()[:280]


def normalize(href, parent=SOURCE):
    raw = str(href or "").strip()
    if not raw or raw.startswith(("#", "javascript:", "mailto:", "tel:", "data:")):
        return None
    parsed = urlsplit(urljoin(parent, raw))
    if parsed.scheme not in ("http", "https") or parsed.hostname not in TARGET_HOSTS:
        return None
    path = quote(unquote(re.sub(r"/{2,}", "/", parsed.path or "/")), safe="/-._~")
    # Keep Joomla pagination, but discard feed, user/preview and query-driven search.
    query = parsed.query if re.fullmatch(r"start=\d{1,4}", parsed.query) else ""
    return urlunsplit(("https", "www.pse.vn", path, query, ""))


def category(url):
    path = urlsplit(url).path.lower()
    if "quan-he-nha-dau-tu" in path or "co-dong" in path or "bao-cao-tai-chinh" in path:
        return "shareholder"
    if "tin-cong-ty" in path or "21-tin-tuc-su-kien" in path:
        return "company"
    if "mua-vu" in path or "nong-nghiep" in path or "thi-truong" in path:
        return "agriculture-market"
    return "other"


def page_priority(url, depth):
    path = urlsplit(url).path
    if url == SOURCE or depth == 0:
        return 0
    if re.search(r"/\d{3,5}-", path):
        return 1
    if category(url) != "other":
        return 2
    return 3


class Markup(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = []
        self.h1 = []
        self.links = []
        self.images = []
        self.meta = {}
        self.canonical = None
        self.datetime = None
        self._capture = None
        self._anchor = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("title", "h1"):
            self._capture = tag
        if tag == "meta":
            key = a.get("property") or a.get("name")
            if key:
                self.meta[key.lower()] = a.get("content", "")
        if tag == "link" and "canonical" in (a.get("rel") or "").lower():
            self.canonical = a.get("href")
        if tag == "time" and a.get("datetime"):
            self.datetime = self.datetime or a.get("datetime")
        if tag == "a" and a.get("href"):
            self._anchor = [a["href"], ""]
        if tag == "img":
            src = a.get("data-src") or a.get("src")
            if src:
                self.images.append({"src": src, "alt": plain(a.get("alt"))})

    def handle_data(self, data):
        if self._capture == "title":
            self.title.append(data)
        if self._capture == "h1":
            self.h1.append(data)
        if self._anchor is not None:
            self._anchor[1] += data

    def handle_endtag(self, tag):
        if tag == self._capture:
            self._capture = None
        if tag == "a" and self._anchor:
            self.links.append({"href": self._anchor[0], "label": plain(self._anchor[1])})
            self._anchor = None


def read_html(url):
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=12) as response:
        final = normalize(response.geturl())
        if not final:
            raise ValueError("Offsite redirect")
        content = response.read(2_500_001)
        if len(content) > 2_500_000:
            raise ValueError("HTML too large")
        charset = response.headers.get_content_charset() or "utf-8"
        return content.decode(charset, errors="replace"), response.status, final


def verify_file(url):
    record = {"url": url, "http_status": None, "bytes": None, "sha256": None, "verified": False}
    try:
        with urlopen(Request(url, headers={"User-Agent": HEADERS["User-Agent"]}, method="HEAD"), timeout=10) as response:
            if not normalize(response.geturl()):
                raise ValueError("Offsite redirect")
            record["http_status"] = response.status
            length = response.headers.get("Content-Length")
            if length and length.isdigit():
                record["bytes"] = int(length)
        if record["bytes"] is not None and record["bytes"] > 12_000_000:
            record["reason"] = "Large file: size verified, checksum deferred"
            return record
        digest = hashlib.sha256()
        read_count = 0
        with urlopen(Request(url, headers={"User-Agent": HEADERS["User-Agent"]}), timeout=12) as response:
            if not normalize(response.geturl()):
                raise ValueError("Offsite redirect")
            while chunk := response.read(65536):
                read_count += len(chunk)
                if read_count > 12_000_000:
                    record["reason"] = "File exceeds checksum cap"
                    return record
                digest.update(chunk)
        record["bytes"] = read_count
        record["sha256"] = digest.hexdigest()
        record["verified"] = True
    except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
        record["reason"] = type(error).__name__
        if isinstance(error, HTTPError):
            record["http_status"] = error.code
    return record


def main():
    started = time.monotonic()
    seen, queued, pending = set(), set(SEEDS), []
    seq = 0
    for seed in SEEDS:
        heapq.heappush(pending, (0, seq, seed, 0))
        seq += 1
    discovered_docs, discovered_images = {}, {}
    pages = []
    errors = []
    with ThreadPoolExecutor(max_workers=3, thread_name_prefix="pse-public-readonly") as pool:
      while pending and len(pages) < MAX_PAGES and time.monotonic() - started < MAX_PAGE_SECONDS:
        batch = []
        while pending and len(batch) < min(3, MAX_PAGES - len(pages)):
            _, _, url, depth = heapq.heappop(pending)
            if url in seen:
                continue
            seen.add(url)
            if urlsplit(url).path.lower().endswith(IGNORED_EXTENSIONS + DOCUMENT_EXTENSIONS + IMAGE_EXTENSIONS):
                continue
            batch.append((url, depth, pool.submit(read_html, url)))
        for url, depth, future in batch:
          try:
            html, status, resolved = future.result()
            parser = Markup()
            parser.feed(html)
            title = plain(parser.meta.get("og:title") or " ".join(parser.title))
            records = []
            for a in parser.links:
                link = normalize(a["href"], resolved)
                if not link:
                    continue
                label = a["label"]
                if urlsplit(link).path.lower().endswith(DOCUMENT_EXTENSIONS):
                    discovered_docs.setdefault(link, {"url": link, "label": label, "found_on": resolved})
                    records.append(link)
                elif depth < 3 and not urlsplit(link).path.lower().endswith(IMAGE_EXTENSIONS + IGNORED_EXTENSIONS):
                    if link not in seen and link not in queued:
                        queued.add(link)
                        heapq.heappush(pending, (page_priority(link, depth + 1), seq, link, depth + 1))
                        seq += 1
            images = []
            for image in parser.images:
                link = normalize(image["src"], resolved)
                if link:
                    discovered_images.setdefault(link, {"url": link, "alt": image["alt"], "found_on": resolved})
                    images.append(link)
            date = parser.meta.get("article:published_time") or parser.meta.get("date") or parser.datetime
            kind = "article" if re.search(r"/\d{3,5}-[^/]+\.html$", urlsplit(resolved).path) else ("homepage" if resolved == SOURCE else "category-or-page")
            pages.append({
                "old_url": resolved,
                "target_new_url": None,
                "import_status": "not_started",
                "kind": kind,
                "group_hint": category(resolved),
                "title": title,
                "h1": plain(" ".join(parser.h1)),
                "description": plain(parser.meta.get("description") or parser.meta.get("og:description")),
                "publish_date": date,
                "canonical": normalize(parser.canonical, resolved) if parser.canonical else None,
                "status": status,
                "linked_files": list(dict.fromkeys(records)),
                "images": list(dict.fromkeys(images))[:25]
            })
          except (HTTPError, URLError, TimeoutError, ValueError, OSError) as error:
            errors.append({"url": url, "reason": type(error).__name__,
                           "status": error.code if isinstance(error, HTTPError) else None})
    documents = []
    for i, record in enumerate(discovered_docs.values()):
        check = verify_file(record["url"]) if i < MAX_FILES_TO_VERIFY and time.monotonic()-started < MAX_SECONDS else {"verified": False, "reason": "Not yet probed"}
        documents.append({**record, **check})
    output = {
        "schema": "pse-legacy-inventory-v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source": SOURCE,
        "scope": "public read-only, bounded crawl; not a complete migration inventory",
        "limits": {"max_pages": MAX_PAGES, "page_time_budget_seconds": MAX_PAGE_SECONDS, "total_seconds": MAX_SECONDS, "max_file_checks": MAX_FILES_TO_VERIFY},
        "pages": pages,
        "documents": documents,
        "images": list(discovered_images.values()),
        "errors": errors,
        "remaining_candidates": len(pending),
    }
    os.makedirs("artifacts", exist_ok=True)
    output_path = "artifacts/pse-legacy-public-manifest.json"
    with open(output_path, "w", encoding="utf-8") as fp:
        json.dump(output, fp, ensure_ascii=False, indent=2)
    stats = {}
    for row in pages:
        stats[row["group_hint"]] = stats.get(row["group_hint"], 0) + 1
    print("LEGACY_G0=PARTIAL_READ_ONLY")
    print("LEGACY_PAGES="+str(len(pages))+" docs="+str(len(documents))+
          " images="+str(len(discovered_images))+" errors="+str(len(errors))+
          " remaining="+str(len(pending)))
    print("LEGACY_GROUPS="+json.dumps(stats, sort_keys=True))
    print("LEGACY_MANIFEST="+output_path)
    if not pages:
        raise RuntimeError("No public PSE source pages accessible; review network restrictions")


if __name__ == "__main__":
    main()
