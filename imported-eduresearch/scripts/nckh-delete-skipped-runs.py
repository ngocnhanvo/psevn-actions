#!/usr/bin/env python3
"""Delete completed Actions runs created through Oct 19 local time; never delete active runs."""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request

REPO = "ngocnhanvo/nghiencuukhoahoc-actions"
ROOT = "/repos/" + REPO
TOKEN = os.environ.get("GITHUB_TOKEN", "")
BEGAN = time.monotonic()
CUTOFF = "2026-10-19T16:59:59Z"  # 2026-10-19 23:59:59 Asia/Ho_Chi_Minh
MAX_SECONDS = 2700
MAX_DELETIONS = 1600
FLOWS = ".github/workflows/nckh-delete-skipped-runs.yml"
SNAPSHOT = Path("docs/nckh-protected-action-runs-2026-10-19.json")


def call(method: str, path: str, data: dict | None = None):
    if (os.environ.get("GITHUB_REPOSITORY") != REPO
            or os.environ.get("GITHUB_REF") != "refs/heads/main"
            or not TOKEN or not path.startswith(ROOT + "/")):
        raise RuntimeError("STOP: repository, branch, GitHub token or API allowlist mismatch")
    raw = json.dumps(data).encode() if data is not None else None
    for attempt in range(6):
        req = urllib.request.Request(
            "https://api.github.com" + path,
            data=raw, method=method,
            headers={"Authorization": "Bearer " + TOKEN,
                     "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28",
                     "User-Agent": "NCKH-SkipOnlyCleanup",
                     **({"Content-Type": "application/json"} if raw is not None else {})})
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                body = response.read(3200000)
                return json.loads(body) if body else None
        except urllib.error.HTTPError as exc:
            if exc.code == 404 and method in ("DELETE", "GET"):
                return False if method == "DELETE" else None
            if exc.code not in (403, 429, 500, 502, 503, 504):
                raise RuntimeError("GitHub API HTTP " + str(exc.code) + " during " + method) from None
            remaining = exc.headers.get("X-RateLimit-Remaining", "")
            reset = int(exc.headers.get("X-RateLimit-Reset", "0"))
            retry = exc.headers.get("Retry-After", "")
            if remaining == "0":
                sleep = max(30, min(2400, reset - time.time() + 10))
            elif retry.isdigit():
                sleep = min(900, max(10, int(retry)))
            else:
                sleep = min(240, 20 * (attempt + 1))
            print("GitHub API busy or throttled, HTTP", exc.code,
                  "retry in", int(sleep), "sec", flush=True)
            if time.monotonic() + sleep > BEGAN + MAX_SECONDS:
                raise TimeoutError("Safe cleanup window exceeded while waiting for GitHub")
            time.sleep(sleep)
        except urllib.error.URLError as exc:
            if attempt == 5:
                raise RuntimeError("GitHub API network unavailable") from exc
            time.sleep(min(30, 5 * (attempt + 1)))
    raise RuntimeError("GitHub API retry limit exceeded")


def main():
    # Preserve documented historical snapshot but supersede its permanent
    # protection of completed runs at the user's explicit new request.
    manifest = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    if manifest.get("repository") != REPO or len(manifest.get("protected_run_ids", [])) < 126:
        raise RuntimeError("Previous protected-run snapshot missing/invalid: STOP")
    protected = {int(os.environ.get("GITHUB_RUN_ID", "0"))}
    candidates: list[int] = []
    newer = 0
    older_active = 0
    scanned = 0

    # One stable inventory pass, NOT a full re-scan after every deletion.
    # Active runs are never deleted, including runs created yesterday.
    for page in range(1, 151):
        payload = call("GET", ROOT + "/actions/runs?per_page=100&page=" + str(page))
        runs = (payload or {}).get("workflow_runs", [])
        if not isinstance(runs, list):
            raise RuntimeError("Unexpected GitHub Actions response")
        for run in runs:
            scanned += 1
            rid = int(run.get("id", 0))
            if rid <= 0:
                continue
            created = str(run.get("created_at", ""))
            if run.get("status") != "completed":
                protected.add(rid)
                if created <= CUTOFF:
                    older_active += 1
                continue
            if created > CUTOFF:
                newer += 1
                continue
            if rid not in protected:
                candidates.append(rid)
        if len(runs) < 100:
            break
    else:
        raise RuntimeError("More than 15,000 runs: incomplete inventory, STOP")

    print("HISTORICAL CLEANUP preview: cutoff", CUTOFF, "scanned", scanned,
          "eligible completed", len(candidates), "older active protected",
          older_active, "newer protected", newer, flush=True)
    deleted = 0
    missing = 0
    for rid in candidates:
        if deleted >= MAX_DELETIONS or time.monotonic() - BEGAN >= MAX_SECONDS - 45:
            break
        if rid in protected:
            continue
        current = call("GET", ROOT + "/actions/runs/" + str(rid))
        if not current:
            missing += 1
            continue
        if (current.get("status") != "completed"
                or str(current.get("created_at", "")) > CUTOFF):
            protected.add(rid)
            continue
        # Explicitly checked status just before irreversible deletion.
        gone = call("DELETE", ROOT + "/actions/runs/" + str(rid))
        if gone is False:
            missing += 1
        else:
            deleted += 1
        if deleted > 0 and deleted % 100 == 0:
            print("Deleted", deleted, "finished historical Actions runs", flush=True)
        time.sleep(1.35)

    remaining = max(0, len(candidates) - deleted - missing)
    report = (
        "### NCKH old Actions history cleanup (through 19 Oct 2026 VN time)\n\n"
        f"Fixed cutoff: **{CUTOFF} UTC** / **19 Oct 2026 23:59:59 ICT**.\n"
        f"Scanned: **{scanned}**; eligible finished runs: **{len(candidates)}**; "
        f"deleted this pass: **{deleted}**; already absent: **{missing}**; "
        f"remaining in snapshot: **{remaining}**.\n"
        f"Preserved older queued/running/waiting: **{older_active}**; "
        f"newer runs: **{newer}**.\n\n"
        "Includes old success/failure/skipped/cancelled runs, as requested. "
        "No ongoing runs, later runs, source code, FTP or production touched.\n"
    )
    print(report, flush=True)
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf8") as f:
        f.write(report)
    try:
        call("POST", ROOT + "/issues/302/comments", {"body": report})
    except Exception as error:
        print("Could not post optional issue comment:", type(error).__name__, flush=True)
    if remaining == 0 and older_active == 0:
        call("PUT", ROOT + "/actions/workflows/" + FLOWS.split("/")[-1] + "/disable")
        print("PASS: no eligible completed runs remain; cleanup disabled", flush=True)
    else:
        print("PARTIAL: safe scheduled continuation will handle remaining old runs", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("STOP: no unverified deletion allowed:", type(error).__name__, str(error), file=sys.stderr)
        raise
