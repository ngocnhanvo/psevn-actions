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
DIAGNOSTICS = ("preflight", "cache_setup")
STAGES = re.compile(r"PSE_STAGE name=(\w+) \S+_ms=(\d+) exit=(\d+)")
SOURCE_SHA = re.compile(r"Astro production SHA:\s*([0-9a-f]{40})")
ZIP_META = re.compile(r"PSE_ZIP_METRICS (\{[^\r\n]+\})")
IMAGE_DELTA = re.compile(r"PSE_IMAGE_DELTA=ENABLED total=(\d+) reuse=(\d+)")
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


def parse_historical_phases(log: str) -> dict[str, float] | None:
    """Best-effort durations from real GitHub timestamped job log markers.

    This works before dedicated preflight/cache_setup monotonic stages existed.
    Log boundaries are estimates, not the same as timing the underlying command.
    Missing or reordered markers result in no estimate (never invent zeros).
    """
    events = []
    for line in log.splitlines():
        prefix, marker, message = line.partition("Z ")
        if not marker or not prefix.startswith("20") or len(prefix) > 39:
            continue
        try:
            instant = parsed_time(prefix + "Z")
        except ValueError:
            continue
        events.append((instant, message))
    events.sort(key=lambda entry: entry[0])

    def first_after(fragment: str, after: datetime | None = None) -> datetime | None:
        return next((when for when, text in events
                     if (after is None or when > after) and fragment in text), None)

    checkout = first_after("##[group]Run actions/checkout@v4")
    second = first_after("##[group]Run actions/checkout@v4", checkout) if checkout else None
    preflight = first_after("##[group]Run set -euo pipefail", second) if second else None
    pnpm = first_after("##[group]Run pnpm/action-setup@v4", preflight) if preflight else None
    cache = first_after("##[group]Run actions/cache@v4", pnpm) if pnpm else None
    install = first_after("##[group]Run set -euo pipefail", cache) if cache else None
    smoke_done = first_after("PSE_STAGE name=smoke", install) if install else None
    cache_saved = first_after("Cache saved with key:", smoke_done) if smoke_done else None
    if any(value is None for value in (checkout, second, preflight, pnpm,
                                       cache, install, smoke_done, cache_saved)):
        return None

    timings = {
        "checkout": (preflight - checkout).total_seconds(),
        "preflight": (pnpm - preflight).total_seconds(),
        "cache_setup": (install - pnpm).total_seconds(),
        "post_smoke_cache_save": (cache_saved - smoke_done).total_seconds(),
    }
    if any(value < 0 or value > 1200 for value in timings.values()):
        return None
    return {key: round(value, 3) for key, value in timings.items()}


def parse_metrics(log: str) -> dict | None:
    stage_results = {}
    for name, ms, exit_code in STAGES.findall(log):
        if name in REQUIRED or name in DIAGNOSTICS:
            stage_results[name] = {"elapsed_ms": int(ms), "exit_code": int(exit_code)}
    match = SOURCE_SHA.search(log)
    if not match or any(name not in stage_results for name in REQUIRED):
        return None
    # Only the eight production stages are acceptance gates.
    # Preflight/cache_setup timers are intentionally best-effort (the
    # production workflow records them with "|| true"); a telemetry failure
    # must not invalidate an otherwise verified successful signed deploy.
    if any(stage_results[name]["exit_code"] != 0 for name in REQUIRED):
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
    image_status = "unknown"
    image_delta = IMAGE_DELTA.search(log)
    if image_delta:
        images_total, images_reused = map(int, image_delta.groups())
        if images_reused <= images_total:
            image_status = "unchanged" if images_reused == images_total else "changed"
    return {
        "source_sha": match.group(1),
        "warm": astro_cache_warm and pnpm_cache_warm,
        "media_status": image_status,
        "stages": stage_results,
        "zip_bytes": zip_data.get("bytes"),
        "reused_files": zip_data.get("reused_files"),
        "historical_phases": parse_historical_phases(log),
    }


def unmeasured_seconds(row: dict) -> float | None:
    """Gap between full GitHub workflow and monotonic measured stages.

    Includes queue, checkouts, preflight, pnpm/cache setup and post-job work.
    This is NOT automatically wasted time or a guarantee it can be removed.
    """
    metrics = row.get("metrics")
    if not metrics or not all(name in metrics["stages"] for name in REQUIRED):
        return None
    measured = sum(metrics["stages"][name]["elapsed_ms"] for name in REQUIRED) / 1000
    gap = row["seconds"] - measured
    # GitHub run timestamps are whole-second resolution. A negative result
    # means telemetry cannot be reconciled; never display it as zero overhead.
    return round(gap, 3) if gap >= 0 else None


def summarize(rows: list[dict], failures: int, candidates: int) -> str:
    # newest successful, complete-metrics production run defines the source
    latest = next((row for row in rows if row.get("metrics")), None)
    if not latest:
        return (
            "## PSE build speed scorecard\n\n"
            "No complete production telemetry yet; state=INSUFFICIENT_EVIDENCE.\n"
        )
    sha = latest["metrics"]["source_sha"]
    same_sha = [row for row in rows if row.get("metrics")
                and row["metrics"]["source_sha"] == sha]
    warm_same_sha = [row for row in same_sha if row["metrics"]["warm"]]
    media_changed = sum(row["metrics"]["media_status"] == "changed" for row in warm_same_sha)
    media_unknown = sum(row["metrics"]["media_status"] == "unknown" for row in warm_same_sha)
    eligible = [row for row in warm_same_sha
                if row["metrics"]["media_status"] == "unchanged"]
    eligible = eligible[:12]
    totals = [row["seconds"] for row in eligible]
    lines = [
        "## PSE build speed scorecard (read-only)",
        "",
        f"- Astro source SHA: `{sha}`.",
        f"- Production runs examined: {candidates}; failed/cancelled: {failures}.",
        f"- Same-source verified warm/no-new-media samples: **{len(eligible)}/12**.",
        f"- Excluded warm runs with new media: {media_changed}; unknown image-delta status: {media_unknown}.",
        "- Cache warm requires a confirmed restored pnpm store and Astro `.cache`.",
        "- The image delta must confirm all existing images were reused; new-media/cold cohorts are separate.",
        "- Source revisions are never mixed in a statistical cohort.",
        "- Outside-stages time = GitHub workflow total minus eight monotonic stages;",
        "  it includes runner queue, checkout, preflight, cache restore/save and post-job.",
        "  It is **not** a measured single bottleneck or fully recoverable time.",
        "",
        "| Run | Total | Outside stages | ZIP bytes | Astro | FTPS | Effective FTPS MiB/s | Slowest measured stage |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for row in eligible:
        m = row["metrics"]
        slowest = max(REQUIRED, key=lambda name: m["stages"][name]["elapsed_ms"])
        ftp_ms = m["stages"]["ftps"]["elapsed_ms"]
        archive_bytes = m["zip_bytes"] if type(m["zip_bytes"]) is int else 0
        effective_mibps = archive_bytes / (1024 * 1024) / (ftp_ms / 1000) if ftp_ms > 0 else 0
        outside = unmeasured_seconds(row)
        outside_label = f"{outside:.1f}s" if outside is not None else "unreconciled"
        lines.append(
            f"| #{row['id']} | {row['seconds']:.1f}s | {outside_label} | {m['zip_bytes'] or '—'}"
            f" | {m['stages']['astro']['elapsed_ms'] / 1000:.3f}s"
            f" | {ftp_ms / 1000:.3f}s | {effective_mibps:.2f}"
            f" | {slowest} ({m['stages'][slowest]['elapsed_ms'] / 1000:.1f}s) |"
        )
    # Distinguish cold/media-change cohorts and every slow signed production
    # run. These are diagnostics, NEVER counted as warm acceptance samples.
    different = [
        row for row in same_sha
        if not row["metrics"]["warm"] or row["metrics"]["media_status"] != "unchanged"
    ]
    if different:
        lines.extend([
            "",
            "### Cold / changed-media cohorts (NOT part of warm acceptance)",
            "",
            "| Run | Total | Cache | Media | Slowest measured stage |",
            "| --- | ---: | --- | --- | --- |",
        ])
        for row in different[:8]:
            metrics = row["metrics"]
            slow = max(REQUIRED, key=lambda n: metrics["stages"][n]["elapsed_ms"])
            warm_label = "warm" if metrics["warm"] else "cold / unverified"
            lines.append(
                f"| #{row['id']} | {row['seconds']:.1f}s | {warm_label}"
                f" | {metrics['media_status']} | {slow}"
                f" ({metrics['stages'][slow]['elapsed_ms'] / 1000:.1f}s) |"
            )

    slow_runs = [row for row in rows if row.get("metrics") and row["seconds"] > 180]
    if slow_runs:
        lines.extend([
            "",
            "### Slow signed production runs above 180s (diagnostic only)",
            "",
            "| Run | Astro SHA | Total | Cache | Media | Slowest measured stage |",
            "| --- | --- | ---: | --- | --- | --- |",
        ])
        for row in slow_runs[:12]:
            metrics = row["metrics"]
            slow = max(REQUIRED, key=lambda n: metrics["stages"][n]["elapsed_ms"])
            lines.append(
                f"| #{row['id']} | `{metrics['source_sha'][:9]}`"
                f" | {row['seconds']:.1f}s | {'warm' if metrics['warm'] else 'cold/unverified'}"
                f" | {metrics['media_status']} | {slow}"
                f" ({metrics['stages'][slow]['elapsed_ms'] / 1000:.1f}s) |"
            )
        lines.append(
            "SHA cohorts remain separate; investigate each slow run's full job log"
            " before attributing the delay to one stage."
        )
    if eligible:
        latest_ftp = eligible[0]["metrics"]["stages"]["ftps"]["elapsed_ms"]
        latest_outside = unmeasured_seconds(eligible[0])
        latest_metrics = eligible[0]["metrics"]
        setup = [latest_metrics["stages"].get(name) for name in DIAGNOSTICS]
        if (latest_outside is not None and all(
            isinstance(item, dict) and item.get("exit_code") == 0 for item in setup
        )):
            preflight, caches = [item["elapsed_ms"] / 1000 for item in setup]
            remaining = latest_outside - preflight - caches
            if remaining >= 0:
                lines.append("")
                lines.append(
                    f"- **Outside-stage breakdown (latest only):** signed preflight"
                    f" **{preflight:.1f}s**, Node/pnpm/cache setup **{caches:.1f}s**,"
                    f" remaining queue/checkout/post-job **{remaining:.1f}s**."
                )
            else:
                lines.append("")
                lines.append("- **Outside-stage breakdown:** timings could not be reconciled.")
        else:
            historical = latest_metrics.get("historical_phases")
            if historical:
                lines.append("")
                lines.append(
                    "- **Historical log timestamps (latest):** two checkouts"
                    f" **{historical['checkout']:.1f}s**, signed preflight"
                    f" **{historical['preflight']:.1f}s**, Node/pnpm/cache restore"
                    f" **{historical['cache_setup']:.1f}s**, smoke-to-cache-save"
                    f" **{historical['post_smoke_cache_save']:.1f}s**."
                    " These are GitHub log boundary estimates, not monotonic stage timings."
                )
            else:
                lines.append("")
                lines.append(
                    "- **Outside-stage breakdown:** signed preflight/cache setup"
                    " instrumentation pending next real production run."
                )
        if latest_ftp > 30_000:
            lines.append("")
            lines.append(
                "**Transfer diagnostic:** latest verified FTPS stage exceeded 30s;"
                " examine TLS/transfer/rename phases before tuning transport."
            )
        if latest_outside is None or latest_outside > 30:
            lines.append("")
            lines.append(
                "**Workflow diagnostic:** more than 30s outside the eight"
                " measured stages (or inconsistent timings); inspect checkout,"
                " signed preflight, cache restore and post-job steps individually."
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
    latest = next((row["metrics"]["source_sha"] for row in rows if row.get("metrics")), None)
    current_warm = sum(bool(row.get("metrics") and row["metrics"]["warm"]
                            and row["metrics"]["source_sha"] == latest
                            and row["metrics"]["media_status"] == "unchanged") for row in rows)
    print("PSE_BUILD_SCORECARD=PASS_READONLY same_source_warm_samples=" + str(current_warm))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, HTTPError, OSError, KeyError, json.JSONDecodeError) as exc:
        print("PSE_BUILD_SCORECARD=FAIL error_class=" + type(exc).__name__, file=sys.stderr)
        sys.exit(2)
