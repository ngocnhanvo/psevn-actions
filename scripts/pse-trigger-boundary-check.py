#!/usr/bin/env python3
"""Offline tenant-boundary assertions for PSE WordPress GitHub Trigger.

Never connect to WordPress, GitHub API, DB or FTP. Never dispatch a build.
"""
from pathlib import Path
import os
import re

source = Path(os.environ.get("PSE_PHP_SOURCE", "source-php"))
trigger = (source / "wp-content/plugins/github-trigger/vcs-build-trigger.php").read_text(encoding="utf-8")
mu = (source / "wp-content/mu-plugins/esc-github-trigger-config.php").read_text(encoding="utf-8")

required_trigger = [
    "private const PSE_ACTIONS_REPO = 'psevn-actions';",
    "private const PSE_SITE_URL = 'https://admin-pse.webnvn.com';",
    "private const PSE_FRONTEND_DOMAIN = 'pse.webnvn.com';",
    "private const FORBIDDEN_SOURCE_DB = 'nghiencuukhoahoc_181026';",
    "VCS_GH_REPO !== self::PSE_ACTIONS_REPO",
    "DB_NAME === self::FORBIDDEN_SOURCE_DB",
    "untrailingslashit(site_url()) !== self::PSE_SITE_URL",
    "!defined('PSE_ASTRO_DEPLOY_READY')",
    "PSE_ASTRO_DEPLOY_READY !== true",
    "!defined('PSE_GITHUB_ACTIONS_TOKEN')",
    "trim(PSE_GITHUB_ACTIONS_TOKEN) === ''",
    "$repo = self::PSE_ACTIONS_REPO;",
    "'site_domain'  => self::PSE_FRONTEND_DOMAIN",
    "'event_type' => 'wp_trigger_build'",
    "$url = \"https://api.github.com/repos/{$owner}/{$repo}/dispatches\";",
]
required_mu = [
    "define('VCS_GH_REPO', 'psevn-actions');",
    "'/pse-github-trigger-token.php'",
    "define('PSE_GITHUB_ACTIONS_TOKEN'",
]
for label, body, values in (("trigger", trigger, required_trigger), ("MU config", mu, required_mu)):
    for value in values:
        assert value in body, f"{label}: missing tenant guard/config signature: {value}"
# Legacy repo name must not be an active routing value.
for label, body in (("trigger", trigger), ("MU config", mu)):
    assert "NCKH_ACTIONS_REPO" not in body, f"{label}: leftover NCKH dispatch constant"
    assert "nghiencuukhoahoc-actions" not in body, f"{label}: wrong Actions repo"
    assert "xuongmunonbaohiem-actions" not in body, f"{label}: wrong Blue Sea Actions repo"
    assert "esc-github-trigger-token.php" not in body, f"{label}: inherited token file"
assert "VCS_GH_ACTIONS_TOKEN" not in trigger, "legacy Actions token still used"
assert re.search(r'\$token\s*=\s*defined\([\'"]PSE_GITHUB_ACTIONS_TOKEN', trigger)
assert trigger.count("$repo = self::PSE_ACTIONS_REPO;") >= 2, "trigger and poll must use PSE repo"
assert trigger.count("PSE_ASTRO_DEPLOY_READY !== true") == 1, "missing duplicate or accidental gate change"
print("PSE_GITHUB_TRIGGER_BOUNDARY=PASS (static, non-deploy)")
print("PSE_READINESS_DEFAULT=LOCKED_UNTIL_PSE_ASTRO_DEPLOY_READY")
