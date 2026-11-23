#!/usr/bin/env python3
"""Read-only PSE production build scorecard from GitHub Actions.

Never triggers a build, writes WordPress, uploads files or exposes secrets.
A valid warm sample needs successful signed production + restored pnpm/Astro
caches + complete stage metrics and the same pinned Astro source SHA.
"""
from __future__ import annotations

from datetime import datetime, timezone
import io
import json
import math
import os
import re
import statistics
import sys
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen
from zipfile import BadZipFile, ZipFile

REPO = "ngocnhanvo/psevn-actions"
WORKFLOW = "PSE Astro build and deploy via WordPress GitHub Trigger"
SINCE = datetime.fromisoformat("2026-11-23T00:21:23+00:00")
REQUIRED = ("install", "astro", "verify", "package", "ftps", "runtime_env", "activate", "smoke")
STAGES = re.compile(r"PSE_STAGE name=(\w+) \S+_ms=(\d+) exit=(\d+)")
SOURCE_SHA = re.compile(r"Astro production SHA:\s*([0-9a-f]{40})")
ZIP_META = re.compile(r"PSE_ZIP_METRICS (\{[^\r\n]+\})")
MAX_ARCHIVE = 12_000_000
MAX_DECOMPRESSED = 30_000_000


def parsed_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def p90(values: list[float]) -> float:
    return sorted(values)[math.ceil(0.9 * len(values)) - 1]


def api_get(path: str, token: str) -> bytes:
    if not path.startswith("/repos/ngocnhanvo/psevn-actions/"):
        raise ValueError("Unexpected GitHub API path")
    request = Request("https://api.github.com" + path, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "PSE-Signed-Build-Scorecard/1.0",
    })
    with urlopen(request, timeout=25) as response:
        data = response.read(MAX_ARCHIVE + 1)
    if len(data) > MAX_ARCHIVE:
        raise ValueError("GitHub response exceeded safe size")
    return data


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def job_log(job_id: int, token: str) -> str:
    if not isinstance(job_id, int) or job_id <= 0:
        raise ValueError("Invalid job identity")
    endpoint = "/repos/ngocnhanvo/psevn-actions/actions/jobs/" + str(job_id) + "/logs"
    request = Request("https://api.github.com" + endpoint, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "PSE-Signed-Build-Scorecard/1.0",
    })
    opener = build_opener(NoRedirect)
    try:
        with opener.open(request, timeout=25) as response:
            payload = response.read(MAX_ARCHIVE + 1)
    except HTTPError as exc:
        if exc.code not in (302, 303, 307, 308):
            raise
        # GitHub uses a signed temporary object-store URL. Never forward token.
        location = exc.headers.get("Location") or ""
        parsed = urlsplit(location)
        host = (parsed.hostname or "").lower()
        if not (parsed.scheme == "https" and parsed.port in (None, 443)
                and not parsed.username and not parsed.password
                and (host.endswith(".blob.core.windows.net")
                     or host.endswith(".actions.githubusercontent.com")
                     or host.endswith(".githubusercontent.com"))):
            raise ValueError("Unexpected GitHub job-log redirect origin")
        with urlopen(Request(location, headers={
            "User-Agent": "PSE-Signed-Build-Scorecard/1.0",
        }), timeout=30) as response:
            payload = response.read(MAX_ARCHIVE + 1)
    if len(payload) > MAX_ARCHIVE:
        raise ValueError("Job log archive exceeded safe size")
    try:
        with ZipFile(io.BytesIO(payload)) as archive:
            chunks = []
            total = 0
            for member in archive.infolist():
                if member.is_dir():
                    continue
                total += member.file_size
                if total > MAX_DECOMPRESSED or len(chunks) >= 150:
                    raise ValueError("Job log expansion exceeded safe size")
                chunks.append(archive.read(member).decode("utf-8", errors="replace"))
            return "\n".join(chunks)
    except BadZipFile:
        return payload.decode("utf-8", errors="replace")


def parse_metrics(log: str) -> dict | None:
    stage_results = {}
    for name, ms, exit_code in STAGES.findall(log):
        if name in REQUIRED:
            stage_results[name] = {"elapsed_ms": int(ms), "exit_code": int(exit_code)}
    match = SOURCE_SHA.search(log)
    if not match or any(name not in stage_results for name in REQUIRED):
        return None
    if any(result["exit_code"] != 0 for result in stage_results.values()):
        return None
    zip_match = ZIP_META.search(log)
    try:
        zip_data = json.loads(zip_match.group(1)) if zip_match else {}
    except json.JSONDecodeError:
        zip_data = {}
    # Both native data-cache restore and pnpm's package store must be warm.
    # Do not infer cache hit just because the build finished quickly.
    astro_cache_warm = any(
        "Cache restored from key:" in line and "prod-dot-cache-v2" in line
        for line in log.splitlines()
    )
    pnpm_cache_warm = any(
        "Cache restored from key:" in line and "node-cache-" in line
        for line in log.splitlines()
    )
    return {
        "source_sha": match.group(1),
        "warm": astro_cache_warm and pnpm_cache_warm,
        "stages": stage_results,
        "zip_bytes": zip_data.get("bytes"),
        "reused_files": zip_data.get("reused_files"),
    }


def summarize(rows: list[dict], failures: int, candidates: int) -> str:
    # newest successful, complete-metrics production run defines the source
    latest = next((row for row in rows if row.get("metrics")), None)
    if not latest:
        return (
            "## PSE build speed scorecard\n\n"
            "No complete production telemetry yet; state=INSUFFICIENT_EVIDENCE.\n"
        )
    sha = latest["metrics"]["source_sha"]
    eligible = [row for row in rows if row.get("metrics")
                and row["metrics"]["warm"] and row["metrics"]["source_sha"] == sha]
    eligible = eligible[:12]
    totals = [row["seconds"] for row in eligible]
    lines = [
        "## PSE build speed scorecard (read-only)",
        "",
        f"- Astro source SHA: `{sha}`.",
        f"- Production runs examined: {candidates}; failed/cancelled: {failures}.",
        f"- Same-source verified warm samples: **{len(eligible)}/12**.",
        "- Cache warm requires a confirmed restored pnpm store and Astro `.cache`.",
        "- Source revisions are never mixed in a statistical cohort.",
        "",
        "| Run | Total | ZIP bytes | Astro | FTPS |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for row in eligible:
        m = row["metrics"]
        lines.append(
            f"| #{row['id']} | {row['seconds']:.1f}s | {m['zip_bytes'] or '—'}"
            f" | {m['stages']['astro']['elapsed_ms'] / 1000:.3f}s"
            f" | {m['stages']['ftps']['elapsed_ms'] / 1000:.3f}s |"
        )
    lines.append("")
    if len(totals) < 12:
        lines.append("**Status: PARTIAL — fewer than 12 independently verified warm runs.**")
    else:
        median = statistics.median(totals)
        percentile = p90(totals)
        verdict = "PASS" if median <= 90 and percentile < 120 else "NOT_MET"
        lines.append(
            f"**p50={median:.1f}s, p90={percentile:.1f}s, target p50≤90s & p90<120s: {verdict}.**"
        )
    lines.append("")
    return "\n".join(lines)


def collect(token: str, count: int = 40) -> tuple[list[dict], int, int]:
    payload = json.loads(api_get(
        "/repos/ngocnhanvo/psevn-actions/actions/runs?event=repository_dispatch&per_page=100",
        token,
    ))
    runs = payload.get("workflow_runs")
    if not isinstance(runs, list):
        raise ValueError("Invalid workflow run list")
    relevant = [
        run for run in runs
        if run.get("name") == WORKFLOW
        and run.get("event") == "repository_dispatch"
        and parsed_time(run["created_at"]) >= SINCE
        and run.get("status") == "completed"
    ]
    relevant = sorted(relevant, key=lambda r: parsed_time(r["created_at"]), reverse=True)
    failures = sum(run.get("conclusion") in ("failure", "cancelled", "timed_out") for run in relevant)
    rows = []
    for run in relevant[:count]:
        if run.get("conclusion") != "success":
            continue
        run_id = run["id"]
        jobs = json.loads(api_get(
            f"/repos/ngocnhanvo/psevn-actions/actions/runs/{run_id}/jobs?per_page=100",
            token,
        )).get("jobs", [])
        job = next((item for item in jobs if item.get("name") == "astro"
                    and item.get("conclusion") == "success"), None)
        if not job:
            continue
        try:
            metrics = parse_metrics(job_log(job["id"], token))
        except (HTTPError, TimeoutError, OSError, ValueError):
            # Unavailable logs cannot count toward acceptance.
            metrics = None
        rows.append({
            "id": run_id,
            "seconds": (parsed_time(run["updated_at"]) - parsed_time(run["created_at"])).total_seconds(),
            "metrics": metrics,
        })
    return rows, failures, len(relevant)


def main() -> int:
    if os.environ.get("GITHUB_REPOSITORY") != REPO:
        raise ValueError("Unexpected repository for PSE scorecard")
    token = os.environ.get("GH_TOKEN")
    if not token:
        raise ValueError("Missing read-only GitHub token")
    rows, failures, candidates = collect(token)
    report = summarize(rows, failures, candidates)
    print(report)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as output:
            output.write(report + "\n")
    print("PSE_BUILD_SCORECARD=PASS_READONLY samples=" +
          str(sum(bool(x.get("metrics") and x["metrics"]["warm"]) for x in rows)))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, HTTPError, OSError, KeyError, json.JSONDecodeError) as exc:
        print("PSE_BUILD_SCORECARD=FAIL error_class=" + type(exc).__name__, file=sys.stderr)
        sys.exit(2)
