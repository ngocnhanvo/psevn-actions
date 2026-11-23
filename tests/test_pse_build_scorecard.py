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
        self.assertIsNone(scorecard.parse_metrics(log(failed=True)))
        self.assertIsNone(scorecard.parse_metrics(log().replace("name=activate", "name=missing")))

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
