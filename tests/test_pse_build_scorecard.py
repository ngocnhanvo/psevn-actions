#!/usr/bin/env python3
"""Offline checks: PSE scorecard never launches a build or calls hosting."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "pse_build_scorecard",
    Path(__file__).resolve().parents[1] / "scripts" / "pse-build-scorecard.py"
)
scorecard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scorecard)
SHA = "a" * 40
NEW_SHA = "b" * 40


def log(sha=SHA, warm=True, failed=False):
    lines = [
        f"- Astro production SHA: {sha}",
        'PSE_ZIP_METRICS {"bytes":2032324,"files":1633,"reused_files":1035}',
        'PSE_IMAGE_DELTA=ENABLED total=901 reuse=901 bytes_saved=56170883',
    ]
    for stage in scorecard.REQUIRED:
        lines.append(f"PSE_STAGE name={stage} elapsed_ms=1500 exit={1 if failed and stage == 'smoke' else 0}")
    if warm:
        lines.extend([
            "Cache restored from key: node-cache-Linux-x64-pnpm-example",
            "Cache restored from key: pse-prod-dot-cache-v2-Linux-example",
        ])
    return "\n".join(lines)


class ScorecardTest(unittest.TestCase):
    def test_warm_logs_require_all_passed_stage_markers(self):
        data = scorecard.parse_metrics(log())
        self.assertEqual(data["source_sha"], SHA)
        self.assertEqual(data["zip_bytes"], 2032324)
        self.assertEqual(data["stages"]["astro"]["elapsed_ms"], 1500)
        self.assertTrue(data["warm"])
        self.assertEqual(data["media_status"], "unchanged")
        self.assertIsNone(scorecard.parse_metrics(log(failed=True)))
        self.assertIsNone(scorecard.parse_metrics(log().replace("name=activate", "name=missing")))

    def test_media_update_is_not_a_normal_warm_acceptance_sample(self):
        updated = scorecard.parse_metrics(log().replace(
            "total=901 reuse=901", "total=902 reuse=901",
        ))
        unknown = scorecard.parse_metrics(log().replace(
            "PSE_IMAGE_DELTA=ENABLED", "PSE_IMAGE_DELTA=DISABLED",
        ))
        self.assertEqual(updated["media_status"], "changed")
        self.assertEqual(unknown["media_status"], "unknown")
        normal = scorecard.parse_metrics(log())
        rows = [
            {"id": 1, "seconds": 81, "metrics": normal},
            {"id": 2, "seconds": 240, "metrics": updated},
            {"id": 3, "seconds": 180, "metrics": unknown},
        ]
        report = scorecard.summarize(rows, failures=0, candidates=3)
        self.assertIn("1/12", report)
        self.assertIn("new media: 1; unknown image-delta status: 1", report)
        self.assertNotIn("p50=", report)

    def test_illogical_image_delta_fails_closed(self):
        sample = scorecard.parse_metrics(log().replace(
            "total=901 reuse=901", "total=900 reuse=901",
        ))
        self.assertEqual(sample["media_status"], "unknown")
        report = scorecard.summarize(
            [{"id": 1, "seconds": 80, "metrics": sample}], 0, 1,
        )
        self.assertIn("0/12", report)

    def test_cache_cold_and_masked_elapsed_are_handled(self):
        data = scorecard.parse_metrics(log(warm=False).replace("elapsed_ms", "ela***d_ms"))
        self.assertIsNotNone(data)
        self.assertFalse(data["warm"])
        self.assertEqual(data["stages"]["ftps"]["elapsed_ms"], 1500)

    def test_twelve_same_sha_runs_required_for_p50_p90(self):
        rows = [{
            "id": i,
            "seconds": 70.0 + i,
            "metrics": scorecard.parse_metrics(log()),
        } for i in range(12)]
        report = scorecard.summarize(rows, failures=1, candidates=13)
        self.assertIn("12/12", report)
        self.assertIn("p50=75.5s, p90=80.0s", report)
        self.assertIn("Effective FTPS MiB/s", report)
        self.assertIn("Slowest measured stage", report)
        self.assertIn("PASS", report)
        # New revision must not be mixed with older runs.
        new = {"id": 99, "seconds": 100, "metrics": scorecard.parse_metrics(log(NEW_SHA))}
        partial = scorecard.summarize([new] + rows, failures=0, candidates=13)
        self.assertIn("1/12", partial)
        self.assertIn("PARTIAL", partial)
        self.assertNotIn("p50=", partial)

    def test_unmeasured_workflow_overhead_is_visible_and_not_assumed_avoidable(self):
        sample = scorecard.parse_metrics(log())
        # Eight 1.5-second stages occupy 12s. The remaining 38s include
        # checkout, queue, signed preflight, cache setup and post-job work.
        row = {"id": 1, "seconds": 50.0, "metrics": sample}
        self.assertEqual(scorecard.unmeasured_seconds(row), 38)
        report = scorecard.summarize([row], failures=0, candidates=1)
        self.assertIn("Outside stages", report)
        self.assertIn("| #1 | 50.0s | 38.0s |", report)
        self.assertIn("inspect checkout", report)
        self.assertIn("not", report.lower())
        # Fail closed when the stage durations do not reconcile with GitHub.
        inconsistent = {"id": 2, "seconds": 8.0, "metrics": sample}
        self.assertIsNone(scorecard.unmeasured_seconds(inconsistent))
        self.assertIn("unreconciled", scorecard.summarize([inconsistent], 0, 1))

    def test_optional_telemetry_failure_does_not_disqualify_signed_deploy(self):
        source = log()
        # Best-effort timer failure only, signed production stages still passed.
        source += "\nPSE_STAGE name=preflight elapsed_ms=0 exit=2"
        source += "\nPSE_STAGE name=cache_setup elapsed_ms=0 exit=3"
        parsed = scorecard.parse_metrics(source)
        self.assertIsNotNone(parsed)
        self.assertTrue(parsed["warm"])
        self.assertEqual(parsed["media_status"], "unchanged")
        self.assertEqual(parsed["stages"]["preflight"]["exit_code"], 2)
        self.assertIn("1/12", scorecard.summarize([
            {"id": 10, "seconds": 108, "metrics": parsed},
        ], 0, 1))
        # Still reject a failure in any of the mandatory eight deployment
        # stages; optional metrics never downgrade this fail-closed contract.
        failed = source.replace("name=activate elapsed_ms=1500 exit=0",
                                "name=activate elapsed_ms=1500 exit=1")
        self.assertIsNone(scorecard.parse_metrics(failed))

    def test_new_preflight_and_cache_setup_diagnostics_do_not_change_acceptance(self):
        source_log = log() + "\n" + "\n".join([
            "PSE_STAGE name=preflight elapsed_ms=3200 exit=0",
            "PSE_STAGE name=cache_setup elapsed_ms=7400 exit=0",
        ])
        metrics = scorecard.parse_metrics(source_log)
        self.assertTrue(metrics["warm"])
        self.assertEqual(metrics["stages"]["preflight"]["elapsed_ms"], 3200)
        self.assertEqual(metrics["stages"]["cache_setup"]["elapsed_ms"], 7400)
        report = scorecard.summarize(
            [{"id": 44, "seconds": 50.0, "metrics": metrics}], 0, 1,
        )
        self.assertIn("preflight **3.2s**", report)
        self.assertIn("cache setup **7.4s**", report)
        self.assertIn("remaining queue/checkout/post-job **27.4s**", report)
        self.assertIn("1/12", report)
        self.assertNotIn("p50=", report)
        legacy = scorecard.summarize(
            [{"id": 43, "seconds": 50, "metrics": scorecard.parse_metrics(log())}], 0, 1,
        )
        self.assertIn("instrumentation pending next real production run", legacy)

    def test_separate_cold_media_and_very_slow_runs_without_mixing_shas(self):
        warm = scorecard.parse_metrics(log(sha=SHA, warm=True))
        cold = scorecard.parse_metrics(log(sha=SHA, warm=False))
        changed = scorecard.parse_metrics(log(sha=SHA).replace(
            "total=901 reuse=901", "total=902 reuse=901",
        ))
        older = scorecard.parse_metrics(log(sha=NEW_SHA))
        rows = [
            {"id": 4, "seconds": 89, "metrics": warm},
            {"id": 3, "seconds": 223, "metrics": cold},
            {"id": 2, "seconds": 199, "metrics": changed},
            {"id": 1, "seconds": 251, "metrics": older},
        ]
        report = scorecard.summarize(rows, 0, 4)
        self.assertIn("1/12", report)
        self.assertIn("Cold / changed-media cohorts", report)
        self.assertIn("| #3 | 223.0s | cold / unverified | unchanged |", report)
        self.assertIn("| #2 | 199.0s | warm | changed |", report)
        self.assertIn("Slow signed production runs above 180s", report)
        self.assertIn(chr(96) + "bbbbbbbbb" + chr(96), report)
        self.assertIn("| #1 |", report)
        self.assertIn("SHA cohorts remain separate", report)
        # The cross-SHA slow-run audit must never affect warm sample counts.
        self.assertNotIn("p50=", report)
        self.assertNotIn("12/12", report)

    def test_historical_log_phase_boundaries_are_strict_and_read_only(self):
        timestamped = "\n".join([
            "2026-11-23T00:00:00.0000000Z ##[group]Run actions/checkout@v4",
            "2026-11-23T00:00:02.0000000Z ##[group]Run actions/checkout@v4",
            "2026-11-23T00:00:04.0000000Z ##[group]Run set -euo pipefail",
            "2026-11-23T00:00:11.0000000Z ##[group]Run pnpm/action-setup@v4",
            "2026-11-23T00:00:12.0000000Z ##[group]Run actions/cache@v4",
            "2026-11-23T00:00:20.0000000Z ##[group]Run set -euo pipefail",
            "2026-11-23T00:00:30.0000000Z PSE_STAGE name=smoke elapsed_ms=1500 exit=0",
            "2026-11-23T00:00:33.0000000Z Cache saved with key: pse-prod-dot-cache-v2-Linux",
        ])
        expected = {
            "checkout": 4.0,
            "preflight": 7.0,
            "cache_setup": 9.0,
            "post_smoke_cache_save": 3.0,
        }
        self.assertEqual(scorecard.parse_historical_phases(timestamped), expected)
        # The earliest log records can be in separate ZIP members.
        shuffled = "\n".join(reversed(timestamped.splitlines()))
        self.assertEqual(scorecard.parse_historical_phases(shuffled), expected)
        self.assertIsNone(scorecard.parse_historical_phases(
            timestamped.replace("Cache saved with key:", "Cache skip:")))
        self.assertIsNone(scorecard.parse_historical_phases(
            timestamped.replace("actions/cache@v4", "unrecognized-cache-action")))
        sample = scorecard.parse_metrics(log() + "\n" + timestamped)
        self.assertEqual(sample["historical_phases"], expected)
        report = scorecard.summarize(
            [{"id": 42, "seconds": 90, "metrics": sample}], 0, 1)
        self.assertIn("Historical log timestamps", report)
        self.assertIn("preflight **7.0s**", report)
        self.assertIn("Node/pnpm/cache restore **9.0s**", report)
        self.assertIn("boundary estimates", report)
        self.assertIn("1/12", report)

    def test_signed_release_ftps_phase_profiling_does_not_mix_helper_uploads(self):
        # Tiny PHP inventory staging uploads can appear earlier in job logs.
        helper = "\n".join([
            "FTPS_PHASE attempt=1 phase=transfer ela***d_ms=90000 bytes=7500",
            "FTPS_UPLOAD=PASS bytes=7500 sha_prefix=0123456789ab",
        ])
        signed = "\n".join([
            "FTPS_TRANSFER_START bytes=2032324 sha_prefix=123456789abc",
            "FTPS_PHASE attempt=1 phase=connect_tls ela***d_ms=2200",
            "FTPS_PHASE attempt=1 phase=remote_probe ela***d_ms=200",
            "FTPS_PHASE attempt=1 phase=transfer ela***d_ms=18000 bytes=2032324",
            "FTPS_PHASE attempt=1 phase=verify_temp_size ela***d_ms=200",
            "FTPS_PHASE attempt=1 phase=rename_verify ela***d_ms=600",
            "FTPS_UPLOAD=PASS bytes=2032324 sha_prefix=123456789abc",
            "PSE_STAGE name=ftps ela***d_ms=21500 exit=0",
        ])
        metrics = scorecard.parse_metrics(log() + "\n" + helper + "\n" + signed)
        measured = metrics["ftps_release"]
        self.assertIsNotNone(measured)
        self.assertEqual(measured["elapsed_ms"]["transfer"], 18000)
        self.assertEqual(measured["elapsed_ms"]["connect_tls"], 2200)
        self.assertEqual(measured["attempt"], 1)
        self.assertGreater(measured["transfer_mibps"], 0.10)
        report = scorecard.summarize(
            [{"id": 10, "seconds": 85, "metrics": metrics}], 0, 1)
        self.assertIn("ZIP data 18.0s", report)
        self.assertIn("data STOR exceeded 15s", report)
        self.assertIn("FTP data transfer", report)
        self.assertIn("1/12", report)

        self.assertIsNone(scorecard.parse_ftps_release_phases(helper, 2032324))
        self.assertIsNone(scorecard.parse_ftps_release_phases(
            signed.replace("bytes=2032324 sha_prefix=123456789abc",
                           "bytes=2032323 sha_prefix=123456789abc", 1), 2032324))
        self.assertIsNone(scorecard.parse_ftps_release_phases(
            signed.replace("PSE_STAGE name=ftps", "PSE_STAGE name=activate"), 2032324))
        self.assertIsNone(scorecard.parse_ftps_release_phases(
            signed.replace("FTPS_UPLOAD=PASS", "FTPS_UPLOAD=FAILED"), 2032324))
        self.assertIsNone(scorecard.parse_ftps_release_phases(
            signed.replace("phase=transfer", "phase=unknown"), 2032324))

    def test_slow_ftps_warns_without_failing_production(self):
        sample = scorecard.parse_metrics(log())
        sample["stages"]["ftps"]["elapsed_ms"] = 38138
        rows = [{"id": 90240402, "seconds": 122, "metrics": sample}]
        report = scorecard.summarize(rows, failures=0, candidates=1)
        self.assertIn("0.00", report) if not sample["zip_bytes"] else self.assertIn("0.05", report)
        self.assertIn("ftps (38.1s)", report)
        self.assertIn("exceeded 30s", report)
        self.assertIn("1/12", report)

    def test_failed_runs_and_missing_caches_never_count(self):
        rows = [
            {"id": 1, "seconds": 79, "metrics": scorecard.parse_metrics(log())},
            {"id": 2, "seconds": 85, "metrics": scorecard.parse_metrics(log(warm=False))},
            {"id": 3, "seconds": 111, "metrics": None},
        ]
        report = scorecard.summarize(rows, failures=2, candidates=5)
        self.assertIn("1/12", report)
        self.assertIn("failed/cancelled: 2", report)

    def test_run_inventory_uses_only_signed_production_workflow(self):
        runs = [
            {"id": 11, "name": scorecard.WORKFLOW, "event": "repository_dispatch",
             "status": "completed", "conclusion": "success",
             "created_at": "2026-11-23T00:22:02Z", "updated_at": "2026-11-23T00:23:32Z"},
            {"id": 12, "name": scorecard.WORKFLOW, "event": "repository_dispatch",
             "status": "completed", "conclusion": "failure",
             "created_at": "2026-11-23T00:23:02Z", "updated_at": "2026-11-23T00:23:17Z"},
            {"id": 13, "name": "Unrelated workflow", "event": "repository_dispatch",
             "status": "completed", "conclusion": "success",
             "created_at": "2026-11-23T00:24:02Z", "updated_at": "2026-11-23T00:24:17Z"},
        ]
        def api(path, token):
            self.assertEqual(token, "test-token")
            if "?event=" in path:
                return json.dumps({"workflow_runs": runs}).encode()
            return json.dumps({"jobs": [{"id": 445, "name": "astro", "conclusion": "success"}]}).encode()
        with patch.object(scorecard, "api_get", side_effect=api), \
             patch.object(scorecard, "job_log", return_value=log()):
            rows, failures, candidates = scorecard.collect("test-token")
        self.assertEqual((len(rows), failures, candidates), (1, 1, 2))
        self.assertEqual(rows[0]["seconds"], 90)
        self.assertEqual(rows[0]["metrics"]["source_sha"], SHA)


if __name__ == "__main__":
    unittest.main()
