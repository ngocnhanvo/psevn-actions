#!/usr/bin/env python3
"""PSE-only run maintenance. Deleting a run also removes its logs/artifacts. Never modify workflow files, CMS or deployments."""
from __future__ import annotations

import collections
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO = "ngocnhanvo/psevn-actions"
API = "https://api.github.com/repos/" + REPO
AUDIT = Path(".pse-actions-history-audit.json")
LIMIT = 1200
FULL_LIMIT = 5000
LOCAL_TZ = dt.timezone(dt.timedelta(hours=7))
PROTECTED_WORKFLOWS = {
    "pse-production-deploy.yml", "pse-wordpress-build-request.yml",
    "pse-php-live-release.yml", "pse-postdeploy-verify.yml",
    "pse-build-speed-scorecard.yml", "pse-actions-history-cleanup.yml",
}
PROTECTED_NAME = re.compile(r"production|build via wordpress|php trigger release|deploy|dispatch bridge|rollback|backup|recovery|restore|release architecture|scorecard", re.I)
TERMINAL = {"success", "failure", "cancelled", "skipped", "timed_out", "neutral", "action_required", "stale", "startup_failure"}

def utc(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))

def critical(run):
    return (str(run.get("path", "")).split("@", 1)[0].rsplit("/", 1)[-1] in PROTECTED_WORKFLOWS
            or bool(PROTECTED_NAME.search(str(run.get("name", "")))))

def old_completed(run, cutoff):
    return (run.get("status") == "completed" and run.get("conclusion") in TERMINAL
            and bool(run.get("created_at")) and bool(run.get("updated_at"))
            and utc(run["created_at"]) < cutoff and utc(run["updated_at"]) < cutoff)

def before_local_day(run, cutoff):
    # Explicit owner request: keep today's runs (creation time), regardless
    # of workflow or conclusion. Active runs are never deleted.
    return (run.get("status") == "completed"
            and bool(run.get("created_at"))
            and utc(run["created_at"]) < cutoff)

def select_all_old(runs, cutoff):
    candidates = sorted((r for r in runs if before_local_day(r, cutoff)),
                        key=lambda row: (row["created_at"], row["id"]))
    return candidates, {"today_or_active": len(runs) - len(candidates)}

def select(runs, artifact_ids, reference_ids, cutoff):
    groups = collections.defaultdict(list)
    for run in runs:
        groups[run["workflow_id"]].append(run)
    recent = set()
    for group in groups.values():
        group.sort(key=lambda row: (row["created_at"], row["id"]), reverse=True)
        recent.update(row["id"] for row in group[:3])
        for conclusion in ("success", "failure"):
            latest = next((row for row in group if row.get("conclusion") == conclusion), None)
            if latest:
                recent.add(latest["id"])
    counts = collections.Counter()
    candidates = []
    for row in runs:
        ident = row["id"]
        if not old_completed(row, cutoff):
            counts["recent_or_not_completed"] += 1
        elif critical(row):
            counts["critical_workflow"] += 1
        elif ident in artifact_ids:
            counts["artifact"] += 1
        elif ident in reference_ids:
            counts["source_reference"] += 1
        elif ident in recent:
            counts["latest_per_workflow"] += 1
        else:
            candidates.append(row)
    candidates.sort(key=lambda row: (row["created_at"], row["id"]))
    return candidates, dict(counts)

def self_test():
    cutoff = utc("2026-11-17T00:00:00Z")
    def row(i, **overrides):
        data = dict(id=i, workflow_id=1, path=".github/workflows/one-off.yml",
                    name="One-off QA", status="completed", conclusion="success",
                    created_at="2026-11-01T00:00:00Z", updated_at="2026-11-01T01:00:00Z")
        data.update(overrides)
        return data
    rows = [row(i) for i in range(1, 10)]
    rows += [row(10, status="in_progress", conclusion=None),
             row(11, updated_at="2026-11-23T00:00:00Z"),
             row(12, workflow_id=2, name="PSE production deploy"),
             row(13, workflow_id=3, conclusion="failure")]
    ids, kept = select(rows, {2}, {3}, cutoff)
    assert [x["id"] for x in ids] == [1, 4, 5, 6, 7, 8], (ids, kept)
    assert sum(kept.values()) + len(ids) == len(rows)
    assert not old_completed(row(99, created_at="2026-11-17T00:00:00Z"), cutoff)
    assert not old_completed(row(99, conclusion=None), cutoff)
    local_cutoff = utc("2026-11-23T17:00:00Z")
    rows2 = [
        row(21, name="PSE production deploy", created_at="2026-11-23T16:59:59Z"),
        row(22, created_at="2026-11-23T17:00:00Z"),
        row(23, status="in_progress", conclusion=None),
        row(24, updated_at="2026-11-24T03:00:00Z"),
        row(25, workflow_id=99, conclusion="skipped"),
    ]
    all_old, kept2 = select_all_old(rows2, local_cutoff)
    assert {x["id"] for x in all_old} == {21, 24, 25}
    assert kept2 == {"today_or_active": 2}
    print("PSE_CLEANUP_SELECTION_UNIT=PASS")

def request(path, method="GET", missing_ok=False):
    token = os.environ["GH_TOKEN"]
    for attempt in range(4):
        req = Request(API + path, method=method, headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "PSE-actions-history-maintenance",
        })
        try:
            with urlopen(req, timeout=35) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else True
        except HTTPError as exc:
            if exc.code == 404 and missing_ok:
                return None
            retry = exc.headers.get("Retry-After")
            if attempt < 3 and exc.code == 403 and exc.headers.get("X-RateLimit-Remaining") == "0":
                reset = exc.headers.get("X-RateLimit-Reset", "")
                if reset.isdigit():
                    delay = max(5, int(reset) - int(time.time()) + 5)
                    if delay > 3700:
                        raise RuntimeError("Unexpected rate limit reset; refusing long retry")
                    print(f"PSE_CLEANUP_RATE_LIMIT pause_seconds={delay}", flush=True)
                    time.sleep(delay)
                    continue
            if attempt < 3 and (exc.code in (429, 500, 502, 503, 504) or (exc.code == 403 and retry)):
                delay = min(120, max(5, int(retry))) if retry and retry.isdigit() else 15 * (attempt + 1)
                time.sleep(delay)
                continue
            raise RuntimeError(f"GitHub API {method} {path.split('?')[0]} failed: HTTP {exc.code}") from None
        except URLError:
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("Retry budget exhausted")

def pages(path, key):
    # No server-side date filter: GitHub caps filtered run searches.
    # Deduplicate the inventory if new workflow runs arrive during paging.
    all_rows = {}
    for page in range(1, 501):
        result = request(f"{path}?per_page=100&page={page}")
        batch = result[key]
        for row in batch:
            all_rows[row["id"]] = row
        if len(batch) < 100:
            return list(all_rows.values())
    raise RuntimeError("Inventory page limit exceeded; refusing deletion")

def references():
    result = subprocess.run(["git", "grep", "-I", "-h", "-o", "-E", "[0-9]{9,}", "--", "."],
                            check=False, stdout=subprocess.PIPE, text=True)
    if result.returncode not in (0, 1):
        raise RuntimeError("Unable to scan tracked source references")
    return {int(line.strip()) for line in result.stdout.splitlines() if line.strip().isdigit()}

def compact(row):
    return {k: row.get(k) for k in ("id", "workflow_id", "path", "name", "status", "conclusion",
                                    "created_at", "updated_at", "run_attempt", "html_url")}

def persist(audit):
    AUDIT.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

def summary(message):
    print(message, flush=True)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as out:
            out.write(message + "\n\n")

def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        self_test()
        return
    if os.environ.get("GITHUB_REPOSITORY") != REPO or os.environ.get("GITHUB_REF") != "refs/heads/main":
        raise RuntimeError("Wrong repository or branch; no deletion")
    if len(sys.argv) != 3 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", sys.argv[1]) or sys.argv[2] not in ("preview", "apply", "apply-all-before-local-day"):
        raise RuntimeError("Expected YYYY-MM-DD and a recognized cleanup mode")
    mode = sys.argv[2]
    full = mode == "apply-all-before-local-day"
    if full:
        # Fixed owner-authorized calendar date in Vietnam, never a moving
        # cutoff that could delete later days if the runner is delayed.
        cutoff = dt.datetime.combine(dt.date.fromisoformat(sys.argv[1]), dt.time.min, tzinfo=LOCAL_TZ)
        if cutoff.date() > dt.datetime.now(LOCAL_TZ).date():
            raise RuntimeError("Cannot delete today's or future runs")
    else:
        cutoff = utc(sys.argv[1] + "T00:00:00Z")
        if cutoff > dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=7):
            raise RuntimeError("Must retain at least seven days of runs")
    cutoff = cutoff.astimezone(dt.timezone.utc)
    limit = FULL_LIMIT if full else LIMIT
    rows = pages("/actions/runs", "workflow_runs")
    if full:
        candidates, kept = select_all_old(rows, cutoff)
    else:
        artifacts = pages("/actions/artifacts", "artifacts")
        artifact_ids = set()
        for a in artifacts:
            run = a.get("workflow_run")
            if not isinstance(run, dict) or type(run.get("id")) is not int:
                raise RuntimeError("Artifact run linkage missing; refusing deletion")
            artifact_ids.add(run["id"])
        refs = references()
        candidates, kept = select(rows, artifact_ids, refs, cutoff)
    audit = {"repository": REPO, "cutoff_utc": cutoff.isoformat(), "mode": mode,
             "inventoried": len(rows), "retained": kept, "eligible": len(candidates),
             "batch_limit": limit, "candidates": [compact(x) for x in candidates],
             "deleted": [], "already_absent": [], "changed_retained": [], "error": None}
    persist(audit)
    summary(f"PSE_CLEANUP_PLAN mode={mode} runs={len(rows)} eligible={len(candidates)} protected={len(rows)-len(candidates)} cutoff={sys.argv[1]}")
    summary("Retained by reason: " + json.dumps(kept, sort_keys=True))
    if mode == "preview":
        return
    try:
        for row in candidates[:limit]:
            ident = row["id"]
            # A historical run can be re-run after the inventory snapshot.
            # Recheck completion and update timestamp, and never delete an active run.
            fresh = request(f"/actions/runs/{ident}", missing_ok=True)
            if fresh is None:
                audit["already_absent"].append(ident)
            elif ((not before_local_day(fresh, cutoff) if full
                   else (not old_completed(fresh, cutoff) or critical(fresh)))
                  or fresh.get("run_attempt") != row.get("run_attempt")
                  or fresh.get("workflow_id") != row.get("workflow_id")
                  or fresh.get("updated_at") != row.get("updated_at")):
                audit["changed_retained"].append(ident)
            else:
                result = request(f"/actions/runs/{ident}", method="DELETE", missing_ok=True)
                audit["deleted" if result else "already_absent"].append(ident)
            persist(audit)
            done = sum(len(audit[k]) for k in ("deleted", "already_absent", "changed_retained"))
            if done % 25 == 0:
                print(f"PSE_CLEANUP_PROGRESS processed={done} deleted={len(audit['deleted'])}", flush=True)
            # Stay comfortably below GitHub mutation/secondary rate limits.
            time.sleep(1.1)
    except Exception as exc:
        audit["error"] = str(exc)
        persist(audit)
        raise
    finally:
        summary(f"PSE_CLEANUP_RESULT deleted={len(audit['deleted'])} absent={len(audit['already_absent'])} changed_retained={len(audit['changed_retained'])} unprocessed={max(0,len(candidates)-limit)}")
    after = request("/actions/runs?per_page=1")
    summary(f"PSE_CLEANUP_TOTAL_AFTER={after['total_count']}")
    if full:
        remaining = pages("/actions/runs", "workflow_runs")
        old = [r for r in remaining if utc(r["created_at"]) < cutoff]
        audit["remaining_old"] = [compact(r) for r in old]
        persist(audit)
        summary(f"PSE_CLEANUP_OLD_REMAINING={len(old)}")
        if old:
            raise RuntimeError("Old runs remain (active, changed, or batch limit); inspect audit")

if __name__ == "__main__":
    main()
