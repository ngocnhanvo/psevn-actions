#!/usr/bin/env python3
"""Remove completed NCKH Actions runs safely; preserve all initially queued runs.

Temporary, rate-limit-aware GitHub Actions worker. NEVER deletes workflows,
queued, in-progress, requested, pending or waiting runs. The protected ID
snapshot survives subsequent scheduled cleanup passes.
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

REPO = "ngocnhanvo/nghiencuukhoahoc-actions"
API = "https://api.github.com/repos/" + REPO
WORKFLOW = ".github/workflows/nckh-actions-history-cleanup.yml"
SNAPSHOT = "docs/nckh-protected-action-runs-2026-10-19.json"
TOKEN = os.environ.get("GITHUB_TOKEN", "")
MAX_SECONDS = 18400
MAX_DELETE = 12000
NON_FINAL = ("queued", "in_progress", "waiting", "requested", "pending")
STARTED = time.monotonic()


def fail(reason: str) -> None:
    raise RuntimeError(reason)


def request(method: str, path: str, data: dict | None = None):
    if not TOKEN or os.environ.get("GITHUB_REPOSITORY") != REPO:
        fail("STOP: repository or Actions write token not approved")
    raw = json.dumps(data).encode() if data is not None else None
    url = "https://api.github.com" + path
    if not url.startswith(API + "/"):
        fail("STOP: API host/repo allowlist violation")
    for attempt in range(10):
        req = urllib.request.Request(
            url, data=raw, method=method, headers={
                "Authorization": "Bearer " + TOKEN,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "NCKH-Completed-Runs-Only-Cleanup",
                **({"Content-Type": "application/json"} if raw is not None else {}),
            })
        try:
            with urllib.request.urlopen(req, timeout=30) as result:
                payload = result.read(5_000_000)
                return json.loads(payload) if payload else None
        except urllib.error.HTTPError as exc:
            if method == "DELETE" and exc.code == 404:
                return None
            body = exc.read(2000).decode("utf-8", "replace").lower()
            if exc.code not in (403, 429, 500, 502, 503, 504):
                fail("GitHub API error: HTTP " + str(exc.code) + " on " + method)
            if exc.code == 403 and ("resource not accessible" in body or
                                   "must have admin" in body or
                                   "permission" in body and "rate" not in body):
                fail("GitHub Actions/contents write permission unavailable; no further deletions")
            remaining = exc.headers.get("X-RateLimit-Remaining", "")
            retry = exc.headers.get("Retry-After", "")
            if remaining == "0":
                until = int(exc.headers.get("X-RateLimit-Reset", "0")) - time.time() + 10
                delay = max(30, min(3700, until))
            elif retry and retry.isdigit():
                delay = max(10, min(600, int(retry)))
            else:
                delay = min(300, 15 * (attempt + 1))
            print("GitHub API throttling/transient status", exc.code, "waiting", int(delay), "seconds", flush=True)
            if time.monotonic() + delay > STARTED + MAX_SECONDS:
                raise TimeoutError("Run time window reached during API backoff")
            time.sleep(delay)
        except (urllib.error.URLError, TimeoutError) as exc:
            delay = min(90, 5 * (attempt + 1))
            if time.monotonic() + delay > STARTED + MAX_SECONDS:
                raise TimeoutError("Run time window reached during network retry")
            print("Temporary API connection failure, retrying after", delay, "seconds", flush=True)
            time.sleep(delay)
    fail("GitHub API retries exhausted")


def listing(status: str, page: int = 1) -> list[dict]:
    if status not in (*NON_FINAL, "completed"):
        fail("Invalid filtered status")
    url = "/repos/" + REPO + "/actions/runs?" + urllib.parse.urlencode({
        "status": status, "per_page": 100, "page": page
    })
    result = request("GET", url)
    rows = result.get("workflow_runs", [])
    if not isinstance(rows, list):
        fail("Unexpected Actions API payload")
    return rows


def current_protected() -> set[int]:
    ids: set[int] = set()
    for status in NON_FINAL:
        for page in range(1, 100):
            items = listing(status, page)
            for run in items:
                if run.get("status") != "completed":
                    ids.add(int(run["id"]))
            if len(items) < 100:
                break
        else:
            fail("More than 9,900 active runs; stop instead of incomplete protection")
    return ids


def still_completed(run_id: int, cutoff: str, protected: set[int]) -> bool:
    if run_id in protected:
        return False
    run = request("GET", "/repos/" + REPO + "/actions/runs/" + str(run_id))
    if not run or run.get("status") != "completed":
        protected.add(run_id)
        return False
    if run.get("created_at", "") > cutoff:
        protected.add(run_id)
        return False
    return True


def retire_temporary_schedule() -> None:
    """Disable the temporary cleanup workflow via Actions:write, no repo commits."""
    request(
        "PUT",
        "/repos/" + REPO + "/actions/workflows/nckh-actions-history-cleanup.yml/disable",
    )
    print("PASS: temporary cleanup workflow disabled after finishing", flush=True)

def main() -> None:
    if os.environ.get("GITHUB_REF") != "refs/heads/main":
        fail("STOP: only Actions main may execute cleanup")
    snapshot = json.loads(pathlib.Path(SNAPSHOT).read_text(encoding="utf-8"))
    if snapshot.get("repository") != REPO:
        fail("STOP: incorrect protected-run snapshot")
    cutoff = snapshot["cutoff_utc"]
    dt.datetime.fromisoformat(cutoff.replace("Z", "+00:00"))
    protected = set(int(value) for value in snapshot["protected_run_ids"])
    if len(protected) < 126:
        fail("STOP: original 126 queued runs not completely protected")
    protected |= current_protected()
    protected.add(int(os.environ.get("GITHUB_RUN_ID", "0")))
    print("Protected queued/active runs:", len(protected),
          "historical creation cutoff:", cutoff, flush=True)

    deleted = 0
    no_eligible = False
    while time.monotonic() - STARTED < MAX_SECONDS and deleted < MAX_DELETE:
        page = 1
        candidate = None
        while page <= 100:
            rows = listing("completed", page)
            for run in rows:
                run_id = int(run.get("id", 0))
                if (run.get("status") == "completed" and
                        run.get("created_at", "") <= cutoff and
                        run_id > 0 and run_id not in protected):
                    candidate = run_id
                    break
            if candidate is not None or len(rows) < 100:
                break
            page += 1
        if candidate is None:
            no_eligible = True
            break
        if not still_completed(candidate, cutoff, protected):
            continue
        request("DELETE", "/repos/" + REPO + "/actions/runs/" + str(candidate))
        deleted += 1
        if deleted % 100 == 0:
            print("Deleted", deleted, "historical completed runs; preserved", len(protected), flush=True)
        # This also prevents bursty GitHub secondary rate-limit violations.
        time.sleep(3.6)

    print("Cleanup sweep complete. Deleted:", deleted,
          "finished:", no_eligible, "protected:", len(protected), flush=True)
    if no_eligible:
        retire_temporary_schedule()
        print("PASS: all eligible completed historical runs removed", flush=True)
    else:
        print("PARTIAL: safe time/rate window reached; next 6-hour schedule continues",
              flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("STOP: historical run cleanup failed safely:", str(exc), file=sys.stderr)
        sys.exit(1)
