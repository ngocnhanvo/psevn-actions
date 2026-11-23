#!/usr/bin/env python3
"""Offline fixtures for monotonic build-stage and ZIP telemetry."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZipFile


spec = importlib.util.spec_from_file_location(
    "pse_build_metrics", Path(__file__).resolve().parents[1] / "scripts" / "pse-build-metrics.py"
)
metrics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metrics)


class MetricsContract(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.patcher = patch.dict(os.environ, {"RUNNER_TEMP": self.temp.name}, clear=False)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def test_monotonic_duration_and_failure_status(self):
        with patch.object(metrics.time, "monotonic_ns", side_effect=[1_000_000_000, 2_520_000_000]):
            metrics.stamp("start", "astro")
            metrics.stamp("stop", "astro", 1)
        state = metrics.read_state()
        self.assertEqual(state["stages"]["astro"], {"elapsed_ms": 1520, "exit_code": 1})
        report = metrics.summary()
        self.assertIn("1.520 s | FAIL", report)
        self.assertIn("NOT RUN", report)

    def test_zip_composition_and_reused_source_bytes(self):
        archive = Path(self.temp.name) / "release.zip"
        delta = {
            "format": 1,
            "reuse": ["old.webp"],
            "files": {"old.webp": {"size": 2345, "sha256": "a" * 64}},
        }
        with ZipFile(archive, "w", ZIP_DEFLATED) as z:
            z.writestr("server/entry.mjs", "server")
            z.writestr("client/index.html", "HTML")
            z.writestr("client/_astro/app.js", "JS")
            z.writestr("client/images/new.webp", "image")
            z.writestr("pse-image-delta.json", json.dumps(delta))
        metrics.zip_metrics(archive)
        stats = metrics.read_state()["zip"]
        self.assertEqual(stats["bytes"], archive.stat().st_size)
        self.assertEqual(stats["files"], 5)
        self.assertEqual(stats["reused_files"], 1)
        self.assertEqual(stats["reused_bytes"], 2345)
        self.assertEqual(stats["groups"]["server SSR"]["files"], 1)
        self.assertEqual(stats["groups"]["new images"]["files"], 1)

    def test_invalid_phase_and_unpaired_stop_fail_closed(self):
        with self.assertRaises(ValueError):
            metrics.stamp("start", "other")
        with self.assertRaises(ValueError):
            metrics.stamp("stop", "ftps", 0)


if __name__ == "__main__":
    unittest.main()
