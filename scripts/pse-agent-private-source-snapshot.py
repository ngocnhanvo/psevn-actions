#!/usr/bin/env python3
"""Read-only FTPS capture of exactly two live PSE Agent classes into a PRIVATE PHP audit branch.

Never print live source, credentials, answers or session data. No remote writes.
The snapshot branch is for human/code reconciliation, NOT a release branch.
"""
from __future__ import annotations

import ftplib
import hashlib
import io
import os
import re
import ssl
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

REPO = Path("source-php")
BRANCH = "audit/pse-live-agent-runtime-20261028"
FILES = (
    "wp-content/mu-plugins/esc-agent/src/Core/Planner.php",
    "wp-content/mu-plugins/esc-agent/src/Core/AgentSynthesisPrompt.php",
)

def fail(message: str):
    raise RuntimeError(message)

def git(*args: str, capture: bool = False):
    return subprocess.run(["git", "-C", str(REPO), *args], check=True,
                          text=True, stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                          stderr=subprocess.PIPE if capture else subprocess.DEVNULL).stdout

def config(name: str) -> str:
    rows = [line.strip().removeprefix("export ").strip().split("=", 1)[1].strip().strip("\"'")
            for line in os.environ.get("ENV_FILE", "").splitlines()
            if line.strip().removeprefix("export ").strip().startswith(name + "=")]
    if len(rows) != 1 or not rows[0]:
        fail("Missing or duplicate environment field: " + name)
    return rows[0]

def main() -> None:
    wp = urlsplit(config("WC_URL"))
    if not (wp.scheme == "https" and wp.hostname == "admin-pse.webnvn.com"
            and wp.port in (None, 443) and wp.path in ("", "/")
            and not any([wp.username, wp.password, wp.query, wp.fragment])):
        fail("Wrong WordPress production target")
    ftp_server = os.environ.get("FTP_SERVER", "").strip()
    ftp_url = urlsplit(ftp_server if "://" in ftp_server else "ftp://" + ftp_server)
    if not (ftp_url.scheme in ("ftp", "ftps") and ftp_url.hostname and
            ftp_url.port in (None, 21) and not any([ftp_url.username, ftp_url.password,
            ftp_url.path.strip("/"), ftp_url.query, ftp_url.fragment])):
        fail("Invalid FTP endpoint configuration")
    if not os.environ.get("FTP_USERNAME") or not os.environ.get("FTP_PASSWORD"):
        fail("Missing FTPS credentials")
    if not os.environ.get("SOURCE_REPO_PAT"):
        fail("Missing private repository write credential")
    if not (REPO / ".git").exists():
        fail("Expected checked-out private PSE PHP source")
    root = f"/domains/{wp.hostname}/public_html"
    payloads: dict[str, bytes] = {}

    ftp = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=30)
    try:
        ftp.connect(ftp_url.hostname, ftp_url.port or 21)
        ftp.auth()
        ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
        ftp.prot_p()
        ftp.cwd(root)
        if ftp.pwd().rstrip("/") != root or ftp.size("wp-load.php") is None:
            fail("Unverified WordPress production root")
        for rel in FILES:
            directory, filename = rel.rsplit("/", 1)
            ftp.cwd(root + "/" + directory)
            if ftp.pwd().rstrip("/") != root + "/" + directory:
                fail("Unexpected Agent source directory")
            buffer = io.BytesIO()
            ftp.retrbinary("RETR " + filename, buffer.write)
            data = buffer.getvalue()
            if not (100 < len(data) < 128000 and data.lstrip().startswith(b"<?php")
                    and b"\x00" not in data):
                fail("Remote PHP candidate failed format/size validation")
            source = data.decode("utf-8")
            # Do not import anything resembling a literal secret into source history.
            if re.search(r"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|(?:sk-|gsk_|ghp_|github_pat_|AIza)[A-Za-z0-9_-]{12,}", source):
                fail("Remote source contains possible embedded credential")
            payloads[rel] = data.replace(b"\r\n", b"\n")
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()

    if git("status", "--porcelain", capture=True).strip():
        fail("Private source checkout is not clean")
    # Fail closed if branch already exists; never overwrite a prior capture.
    old = subprocess.run(["git", "-C", str(REPO), "ls-remote", "--exit-code", "origin",
                          "refs/heads/" + BRANCH], stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL)
    if old.returncode == 0:
        fail("Audit branch already exists; refusing duplicate snapshot")
    if old.returncode != 2:
        fail("Unable to verify private audit branch absence")
    git("checkout", "-b", BRANCH)
    manifest = [
        "# PSE live Agent source capture (read-only FTPS)",
        "",
        "Date: 2026-10-28 (Asia/Ho_Chi_Minh)",
        "WordPress identity: admin-pse.webnvn.com (verified by WC_URL + wp-load.php)",
        "Captured exactly two PHP class files from live production; never deployed or executed remotely.",
        "Source branch baseline: PHP master. This is an audit snapshot, NOT approved for merge or FTP release.",
        "Do not overwrite production Planner/Synthesis without reconciling the approved Agent feature branch.",
        "",
        "## Source fingerprints",
    ]
    for rel, data in payloads.items():
        target = REPO / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        manifest.append("- `" + rel + "`: SHA256 `" + hashlib.sha256(data).hexdigest() + "`")
    checkpoint = REPO / "docs/checkpoints/PSE_AGENT_LIVE_RUNTIME_SNAPSHOT_20261028.md"
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    checkpoint.write_text("\n".join(manifest) + "\n", encoding="utf-8")
    git("add", "--", *FILES, "docs/checkpoints/PSE_AGENT_LIVE_RUNTIME_SNAPSHOT_20261028.md")
    git("config", "user.name", "PSE Source Audit")
    git("config", "user.email", "pse-source-audit@users.noreply.github.com")
    git("commit", "-m", "audit(pse): preserve live Agent Planner and synthesis source for reconciliation")
    # This tool has no privilege to change production; only a new private audit branch.
    git("push", "origin", "HEAD:refs/heads/" + BRANCH)
    print("PSE_AGENT_LIVE_SOURCE_SNAPSHOT=PASS files=2 remote_writes=0 private_branch=" + BRANCH)
    print("PSE_AGENT_LIVE_SOURCE_CAPTURE_NO_DEPLOY=PASS")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("PSE_AGENT_LIVE_SOURCE_SNAPSHOT=FAIL type=" + type(exc).__name__ +
              " reason=" + str(exc)[:120])
        raise SystemExit(1)
