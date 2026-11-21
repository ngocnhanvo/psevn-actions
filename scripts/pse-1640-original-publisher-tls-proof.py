#!/usr/bin/env python3
"""Read-only, CA-verified provenance probe for original PSE #1640 publisher JPEGs.

A one-host legacy TLS option is isolated to this diagnostic. Never disable
certificate verification, never copy guessed mirror photos into WordPress.
"""
import hashlib
import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

if os.getenv("GITHUB_REPOSITORY") != "ngocnhanvo/psevn-actions":
    raise SystemExit("Wrong PSE Actions repository")

ORIGINALS = (
    "https://www.baobariavungtau.com.vn/dataimages/202505/original/images2017799_Ca_kh_c.jpg",
    "https://www.baobariavungtau.com.vn/dataimages/202505/original/images2017800_16_2025_acondao.jpg",
)
HOSTS = frozenset(("www.baobariavungtau.com.vn", "baobariavungtau.com.vn"))
MAX_BYTES = 12 * 1024 * 1024


class RestrictedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        if parsed.scheme != "https" or parsed.hostname not in HOSTS:
            raise ValueError("Untrusted original publisher redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def get_original(url, legacy=False):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in HOSTS or parsed.username or parsed.password:
        raise ValueError("Unexpected original publisher source")
    context = ssl.create_default_context()
    if legacy:
        # OpenSSL SSL_OP_LEGACY_SERVER_CONNECT permits connecting to a legacy
        # publisher only; CA verification and hostname checking remain enabled.
        context.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=context), RestrictedRedirect())
    req = urllib.request.Request(url, headers={
        "User-Agent": "PSE-Original-Media-Provenance/1.0",
        "Accept": "image/jpeg"
    })
    with opener.open(req, timeout=22) as response:
        final = urllib.parse.urlsplit(response.geturl())
        if final.scheme != "https" or final.hostname not in HOSTS:
            raise ValueError("Publisher response escaped trusted source")
        mime = response.headers.get_content_type()
        content = response.read(MAX_BYTES + 1)
        if len(content) > MAX_BYTES:
            raise ValueError("Publisher asset exceeds safe byte cap")
        if response.status != 200 or mime not in ("image/jpeg", "image/pjpeg"):
            raise ValueError("Not a successful original JPEG response")
        if len(content) < 256 or not content.startswith(bytes.fromhex("ffd8")):
            raise ValueError("Publisher content is not a valid JPEG header")
        return {
            "http": response.status, "mime": mime, "bytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
            "certVerified": context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname,
            "legacyServerConnect": legacy, "originalPublisher": True
        }


rows = []
for source in ORIGINALS:
    item = {"source": source, "verified": False, "attempts": [], "evidence": None}
    for legacy in (False, True):
        try:
            evidence = get_original(source, legacy)
            item["attempts"].append({"mode": "legacy-ca-verified" if legacy else "strict-ca-verified", "ok": True})
            item["evidence"] = evidence
            item["verified"] = True
            break
        except (OSError, ValueError, urllib.error.URLError) as exc:
            item["attempts"].append({
                "mode": "legacy-ca-verified" if legacy else "strict-ca-verified",
                "ok": False, "error": str(exc)[:210]
            })
            if not legacy and "unsafe legacy renegotiation" not in str(exc).lower():
                break
    rows.append(item)
    print("PSE_1640_ORIGINAL_TLS_ROW=" + json.dumps({
        "source": source, "verified": item["verified"], "evidence": item["evidence"],
        "attempts": item["attempts"]
    }, ensure_ascii=False))

report = {
    "schema": "pse-1640-original-publisher-tls-provenance-v1",
    "readOnly": True, "noCmsWrites": True, "noBuild": True,
    "noCertificateVerificationBypass": True, "rows": rows,
    "verifiedOriginalJPEGs": sum(r["verified"] for r in rows),
}
path = Path("artifacts/pse-1640-original-tls/report.json")
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("PSE_1640_ORIGINAL_TLS_SUMMARY=" + json.dumps({
    "verifiedOriginalJPEGs": report["verifiedOriginalJPEGs"],
    "expected": len(ORIGINALS), "certVerificationRequired": True, "readOnly": True
}))
