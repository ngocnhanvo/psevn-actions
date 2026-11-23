#!/usr/bin/env python3
"""Safe per-stage metrics for the existing PSE production deploy (no network calls).

A process-shared monotonic clock records durations across successive Actions
steps on the same runner. Metrics are best-effort observability, never a deploy
gate or a substitute for signed PHP checks and post-deploy QA.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import time
from zipfile import ZipFile


STAGES = ("install", "astro", "verify", "package", "ftps", "runtime_env", "activate", "smoke")
LABELS = {
    "install": "pnpm install",
    "astro": "Astro build-git (WP, images, Vite)",
    "verify": "Compiled output verification",
    "package": "ZIP and delta packaging",
    "ftps": "Python TLS upload",
    "runtime_env": "Protected runtime env",
    "activate": "Signed PHP activate",
    "smoke": "Homepage/API/SEO smoke",
}


def state_path() -> Path:
    return Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "pse-build-metrics.json"


def read_state() -> dict:
    path = state_path()
    if not path.is_file():
        return {"stages": {}, "zip": {}}
    state = json.loads(path.read_text(encoding="utf8"))
    if not isinstance(state, dict) or not isinstance(state.get("stages"), dict):
        raise ValueError("Invalid PSE metric state")
    return state


def write_state(state: dict) -> None:
    path = state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(state, sort_keys=True), encoding="utf8")
    os.replace(temp, path)


def stamp(command: str, stage: str, status: int = 0) -> None:
    if stage not in STAGES:
        raise ValueError("Unknown PSE build stage")
    state = read_state()
    stages = state["stages"]
    if command == "start":
        stages[stage] = {"start_ns": time.monotonic_ns()}
    elif command == "stop":
        previous = stages.get(stage)
        if previous is None or not isinstance(previous.get("start_ns"), int):
            raise ValueError("Build metric stop without start")
        elapsed_ns = max(0, time.monotonic_ns() - previous["start_ns"])
        stages[stage] = {"elapsed_ms": round(elapsed_ns / 1_000_000), "exit_code": status}
        print(f"PSE_STAGE name={stage} elapsed_ms={stages[stage]['elapsed_ms']} exit={status}")
    else:
        raise ValueError("Unknown metric command")
    write_state(state)


def zip_metrics(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError("Release ZIP missing")
    buckets: dict[str, dict[str, int]] = {}
    saved_count = 0
    saved_bytes = 0
    with ZipFile(path) as archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            name = entry.filename
            if name.startswith("server/"):
                group = "server SSR"
            elif name.startswith("client/_astro/"):
                group = "client _astro"
            elif name.startswith("client/data/"):
                group = "client data"
            elif name.startswith("client/images/"):
                group = "new images"
            elif name.startswith("client/"):
                group = "other client"
            else:
                group = "release metadata"
            bucket = buckets.setdefault(group, {"files": 0, "raw_bytes": 0, "zip_bytes": 0})
            bucket["files"] += 1
            bucket["raw_bytes"] += entry.file_size
            bucket["zip_bytes"] += entry.compress_size
        for marker in ("pse-image-delta.json", "pse-static-delta.json"):
            if marker not in archive.namelist():
                continue
            delta = json.loads(archive.read(marker))
            for name in delta["reuse"]:
                saved_count += 1
                saved_bytes += int(delta["files"][name]["size"])
    state = read_state()
    state["zip"] = {
        "bytes": path.stat().st_size,
        "files": sum(group["files"] for group in buckets.values()),
        "reused_files": saved_count,
        "reused_bytes": saved_bytes,
        "groups": buckets,
    }
    write_state(state)
    print("PSE_ZIP_METRICS " + json.dumps({
        key: value for key, value in state["zip"].items() if key != "groups"
    }, sort_keys=True))


def summary() -> str:
    state = read_state()
    lines = [
        "## PSE production build timings",
        "",
        f"- Run: {os.environ.get('GITHUB_RUN_ID', 'unknown')}"
        f" / attempt {os.environ.get('GITHUB_RUN_ATTEMPT', 'unknown')}",
        f"- Astro production SHA: {os.environ.get('PSE_DEPLOY_COMMIT', 'not reached')}",
        "",
        "| Stage | Elapsed | Result |",
        "| --- | ---: | --- |",
    ]
    for stage in STAGES:
        metric = state["stages"].get(stage, {})
        millis = metric.get("elapsed_ms")
        result = ("PASS" if metric.get("exit_code") == 0 else "FAIL") if millis is not None else "NOT RUN"
        lines.append(f"| {LABELS[stage]} | {millis / 1000:.3f} s | {result} |" if millis is not None
                     else f"| {LABELS[stage]} | — | {result} |")
    stats = state.get("zip") or {}
    if stats:
        lines.extend([
            "",
            f"- ZIP: {stats['bytes']} bytes; {stats['files']} files.",
            f"- Delta reuse: {stats['reused_files']} files; {stats['reused_bytes']} source bytes omitted.",
            "",
            "| ZIP segment | Files | Raw bytes | Compressed bytes |",
            "| --- | ---: | ---: | ---: |",
        ])
        for group, data in sorted(stats["groups"].items()):
            lines.append(f"| {group} | {data['files']} | {data['raw_bytes']} | {data['zip_bytes']} |")
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str]) -> None:
    if len(argv) == 3 and argv[1] == "start":
        stamp("start", argv[2])
    elif len(argv) == 4 and argv[1] == "stop":
        stamp("stop", argv[2], int(argv[3]))
    elif len(argv) == 3 and argv[1] == "zip":
        zip_metrics(Path(argv[2]))
    elif len(argv) == 2 and argv[1] == "summary":
        content = summary()
        print(content)
        path = os.environ.get("GITHUB_STEP_SUMMARY")
        if path:
            with open(path, "a", encoding="utf8") as output:
                output.write(content + "\n")
    else:
        raise SystemExit("Usage: pse-build-metrics.py start|stop <stage> [exit] | zip <archive> | summary")


if __name__ == "__main__":
    try:
        main(sys.argv)
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as exc:
        print("PSE_BUILD_METRICS_ERROR=" + type(exc).__name__, file=sys.stderr)
        raise SystemExit(2) from exc
