#!/usr/bin/env python3
"""PSE Agent-only FTPS preflight and guarded release. No Astro build, no CMS edits.

Release is opt-in with --deploy. Default --check-only makes no FTP mutations.
Only the six PHP files changed in the reviewed PSE Agent PR; never overwrite the other 48 live Agent files.
"""
from __future__ import annotations

import argparse
import ftplib
import hashlib
import difflib
import io
import os
import re
import secrets
import ssl
from pathlib import Path
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
mode = parser.add_mutually_exclusive_group()
mode.add_argument("--deploy", action="store_true", help="Explicitly publish guarded Agent code")
mode.add_argument("--check-only", action="store_true", help="Read-only PSE FTPS identity/source audit")
parser.add_argument("--security-only", action="store_true", help="Release only security-hardened esc-agent.php")
args = parser.parse_args()

source = Path("source-php")
# Immutable allowlist from PSE PHP PR #5. Other live Agent files MUST remain untouched.
files = [
    Path("wp-content/mu-plugins/esc-agent.php"),
    Path("wp-content/mu-plugins/esc-agent/src/Core/AgentSynthesisPrompt.php"),
    Path("wp-content/mu-plugins/esc-agent/src/Core/KnowledgeAwarePlanner.php"),
    Path("wp-content/mu-plugins/esc-agent/src/Core/Planner.php"),
    Path("wp-content/mu-plugins/esc-agent/src/Skills/KnowledgeSearchSkill.php"),
    Path("wp-content/mu-plugins/esc-agent/src/Skills/ProductSkill.php"),
]
# The exact two deployed PSE files audited in the private snapshot are
# significantly different because they contain Blue Sea-specific LLM prompts.
# The reviewed PSE release deliberately replaces these. Permit this drift ONLY
# when the remote bytes still equal the immutable audited Git blob fingerprint.
# Never relax the guard for arbitrary hosting edits or any other Agent file.
audited_live_blobs = {
    "wp-content/mu-plugins/esc-agent/src/Core/Planner.php":
        "7ae7274782c07a75a3994aba90f5126f13dd9bd8",
    "wp-content/mu-plugins/esc-agent/src/Core/AgentSynthesisPrompt.php":
        "3d3ed5f45e6f3ba86f499564ab74ec9ce3bce0d4",
}


def approved_audited_drift(rel: Path, live: bytes, candidate: bytes) -> bool:
    expected = audited_live_blobs.get(str(rel))
    if expected is None:
        return False
    git_blob = hashlib.sha1(
        b"blob " + str(len(live)).encode("ascii") + bytes([0]) + live
    ).hexdigest()
    if git_blob != expected:
        return False
    candidate_text = candidate.decode("utf-8").casefold()
    if "blue sea" in candidate_text or "xuongmunonbaohiem" in candidate_text:
        return False
    if str(rel).endswith("/Planner.php"):
        return "không phụ thuộc trang đang mở" in candidate_text
    return "phạm vi chung pse" in candidate_text


assert len(files) == 6 and len(files) == len(set(files))
if args.security_only:
    files = files[:1]
assert all((source / p).is_file() and (source / p).stat().st_size > 0 for p in files)


raw_host = os.environ.get("FTP_SERVER", "").strip()
if "://" not in raw_host:
    raw_host = "ftp://" + raw_host
ftp_url = urlsplit(raw_host)
assert ftp_url.scheme in ("ftp", "ftps") and ftp_url.hostname and ftp_url.port in (None, 21)
assert not any((ftp_url.username, ftp_url.password, ftp_url.path.strip("/"), ftp_url.query, ftp_url.fragment))
assert os.environ.get("FTP_USERNAME") and os.environ.get("FTP_PASSWORD")

wp_origins = []
for line in os.environ.get("ENV_FILE", "").splitlines():
    line = line.strip()
    if line.startswith("export "):
        line = line[7:].strip()
    if line.startswith("WC_URL="):
        wp_origins.append(line.split("=", 1)[1].strip().strip("\"'"))
assert len(wp_origins) == 1, "Expected exactly one WordPress origin"
wp = urlsplit(wp_origins[0])
assert (wp.scheme == "https" and wp.hostname == "admin-pse.webnvn.com"
        and wp.port in (None, 443) and wp.path in ("", "/")
        and not wp.query and not wp.fragment and not wp.username and not wp.password), "Unexpected PSE production target"
root = f"/domains/{wp.hostname}/public_html"

ftp = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=25)
release_id = secrets.token_hex(8)
changed = []

def enter(directory: str) -> None:
    ftp.cwd(directory)
    assert ftp.pwd().rstrip("/") == directory.rstrip("/"), "Remote directory identity mismatch"

def exists(name: str) -> bool:
    ftp.voidcmd("TYPE I")
    try:
        ftp.size(name)
        return True
    except ftplib.error_perm as exc:
        if str(exc).startswith("550"):
            return False
        raise

def digest(name: str) -> str:
    buffer = io.BytesIO()
    ftp.retrbinary("RETR " + name, buffer.write)
    return hashlib.sha256(buffer.getvalue()).hexdigest()

def remove_if_exists(name: str) -> None:
    if exists(name):
        ftp.delete(name)

def remote_bytes(name: str) -> bytes:
    buffer = io.BytesIO()
    ftp.retrbinary("RETR " + name, buffer.write)
    return buffer.getvalue()

try:
    ftp.connect(ftp_url.hostname, ftp_url.port or 21)
    ftp.auth()
    ftp.login(os.environ["FTP_USERNAME"], os.environ["FTP_PASSWORD"])
    ftp.prot_p()
    enter(root)
    assert exists("wp-load.php"), "PSE WordPress root not recognized"
    enter(root + "/wp-content/mu-plugins")
    assert exists("esc-agent.php"), "Existing PSE Agent not found; abort before creating anything"
    enter(root + "/wp-content/mu-plugins/esc-agent/src")
    enter(root)
    print("PSE_AGENT_FTPS tls=PASS identity=PASS source_files=" + str(len(files)))

    # Check all candidate paths before any mutation; fail closed on live drift.
    if args.deploy:
        for rel in files:
            enter(root + "/" + str(rel.parent))
            if not exists(rel.name):
                raise RuntimeError("Reviewed Agent file missing remotely")
            before = remote_bytes(rel.name).replace(b"\r\n", b"\n").splitlines()
            candidate = (source / rel).read_bytes().replace(b"\r\n", b"\n").splitlines()
            similarity = difflib.SequenceMatcher(None, before, candidate, autojunk=False).ratio()
            if similarity < 0.85 and not approved_audited_drift(rel, remote_bytes(rel.name), (source / rel).read_bytes()):
                raise RuntimeError("Unreviewed Agent drift; abort before all FTP writes")
        # Backups must not become downloadable .backup files inside public_html.
        # A backup stored in mu-plugins/ itself as PHP would auto-load, so keep it
        # outside the webroot, under the verified PSE account's domain directory.
        private_root = f"/domains/{wp.hostname}/.pse-agent-rollback"
        try:
            enter(private_root)
        except ftplib.error_perm:
            ftp.mkd(private_root)
            enter(private_root)
        enter(root)
    else:
        private_root = None

    matched = 0
    missing = 0
    for rel in files:
        directory = root + "/" + str(rel.parent)
        enter(directory)
        name = rel.name
        expected = hashlib.sha256((source / rel).read_bytes()).hexdigest()
        found = exists(name)
        if not found:
            missing += 1
            print("PSE_AGENT_FTPS_DIFF missing=" + str(rel))
            if args.deploy:
                raise RuntimeError("Reviewed Agent file missing remotely")
        else:
            remote = remote_bytes(name)
            if hashlib.sha256(remote).hexdigest() == expected:
                matched += 1
                continue
            ours = (source / rel).read_bytes()
            remote_lines = remote.replace(b"\r\n", b"\n").splitlines()
            source_lines = ours.replace(b"\r\n", b"\n").splitlines()
            ratio = difflib.SequenceMatcher(None, remote_lines, source_lines, autojunk=False).ratio()
            print("PSE_AGENT_FTPS_DIFF file=" + str(rel)
                  + " remote_lines=" + str(len(remote_lines))
                  + " reviewed_lines=" + str(len(source_lines))
                  + " similarity=" + format(ratio, ".3f"))
            if not args.deploy and str(rel) in audited_live_blobs:
                expected = audited_live_blobs[str(rel)]
                actual = hashlib.sha1(
                    b"blob " + str(len(remote)).encode("ascii") + bytes([0]) + remote
                ).hexdigest()
                print("PSE_AGENT_AUDIT_STATUS file=" + str(rel)
                      + " exact_blob=" + str(actual == expected).lower()
                      + " candidate_marker=" + str(
                          approved_audited_drift(rel, remote, ours)
                          or ("pse" in ours.decode("utf-8").casefold()
                              and b"blue sea" not in ours.lower())
                      ).lower())
            # Existing production may be customized. Refuse automated replacement
            # of a substantially divergent file, even if the PR itself is reviewed.
            if args.deploy and ratio < 0.85 and not approved_audited_drift(rel, remote, ours):
                raise RuntimeError("Unreviewed live Agent drift: release stopped before overwriting this file")
        if not args.deploy:
            continue

        payload = (source / rel).read_bytes()
        tmp = f".pse-agent-{release_id}-{name}.tmp"
        bak = f"{private_root}/{release_id}-{name}.backup"
        assert not exists(tmp) and not exists(bak), "Temporary/backup name collision"
        entry = dict(directory=directory, name=name, tmp=tmp, bak=bak,
                     original=found, activated=False)
        changed.append(entry)
        ftp.storbinary("STOR " + tmp, io.BytesIO(payload))
        assert digest(tmp) == expected, "Temporary upload hash mismatch"
        if found:
            ftp.rename(name, bak)
        ftp.rename(tmp, name)
        entry["activated"] = True
        assert digest(name) == expected, "Installed Agent file hash mismatch"

    if args.deploy:
        print("PSE_AGENT_RELEASE installed=" + str(len(changed))
              + " matched=" + str(matched)
              + " preserved_rollback_backups=" + str(sum(1 for x in changed if x["original"])))
        print("PSE_AGENT_RELEASE result=PASS no_astro_build=PASS")
    else:
        print("PSE_AGENT_FTPS_PREFLIGHT=PASS matched=" + str(matched)
              + " mismatched_or_missing=" + str(len(files) - matched)
              + " missing=" + str(missing) + " writes=0")
except BaseException as exc:
    if args.deploy:
        print("PSE_AGENT_RELEASE FAILED; attempting bounded rollback")
        rollback = True
        for ent in reversed(changed):
            try:
                enter(ent["directory"])
                if ent["original"] and exists(ent["bak"]):
                    remove_if_exists(ent["name"])
                    ftp.rename(ent["bak"], ent["name"])
                elif ent["activated"]:
                    remove_if_exists(ent["name"])
                remove_if_exists(ent["tmp"])
            except Exception:
                rollback = False
        print("PSE_AGENT_RELEASE rollback=" + ("PASS" if rollback else "MANUAL_REVIEW_REQUIRED"))
    print("PSE_AGENT_FTPS error_class=" + type(exc).__name__)
    raise SystemExit(1)
finally:
    try:
        ftp.quit()
    except Exception:
        ftp.close()
