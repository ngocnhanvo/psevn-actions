#!/usr/bin/env python3
"""Offline tenant-boundary assertions for PSE WordPress GitHub Trigger.

Enforces inherited VCS_GH_ACTIONS_TOKEN plus PSE repository/DB isolation.
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
    "private const FORBIDDEN_SOURCE_DB = 'nghiencuukhoahoc_181026';",
    "VCS_GH_REPO === self::PSE_ACTIONS_REPO",
    "DB_NAME !== self::FORBIDDEN_SOURCE_DB",
    "defined('VCS_GH_ACTIONS_TOKEN')",
    "trim($token) !== ''",
    "$repo = self::PSE_ACTIONS_REPO;",
    "'site_domain'  => get_site_domain()",
    "'event_type' => 'wp_trigger_build'",
    "$url = \"https://api.github.com/repos/{$owner}/{$repo}/dispatches\";",
]
required_mu = [
    "define('VCS_GH_REPO', 'psevn-actions');",
    "'/esc-github-trigger-token.php'",
    "define('VCS_GH_TOKEN'",
]
for label, body, values in (("trigger", trigger, required_trigger), ("MU config", mu, required_mu)):
    for value in values:
        assert value in body, f"{label}: missing tenant guard/config signature: {value}"
# Legacy repo name must not be an active routing value.
for label, body in (("trigger", trigger), ("MU config", mu)):
    assert "NCKH_ACTIONS_REPO" not in body, f"{label}: leftover NCKH dispatch constant"
    assert "nghiencuukhoahoc-actions" not in body, f"{label}: wrong Actions repo"
    assert "xuongmunonbaohiem-actions" not in body, f"{label}: wrong Blue Sea Actions repo"
    assert "pse-github-trigger-token.php" not in body, f"{label}: new redundant token file"
assert "PSE_SITE_URL" not in trigger and "PSE_FRONTEND_DOMAIN" not in trigger, "Hardcoded project domain found"
assert "untrailingslashit(site_url()) === self::" not in trigger, "Fixed WordPress domain gate remains"
assert "'site_domain'  => get_site_domain()" in trigger, "Build payload must reflect WordPress managed domain"
assert "PSE_GITHUB_ACTIONS_TOKEN" not in trigger, "extra PSE GitHub credential is forbidden"
assert "PSE_ASTRO_DEPLOY_READY" not in trigger, "extra PHP readiness flag is forbidden"
assert re.search(r'\$token\s*=\s*defined\([\'"]VCS_GH_ACTIONS_TOKEN', trigger)
assert trigger.count("$repo = self::PSE_ACTIONS_REPO;") >= 2, "trigger and poll must use PSE repo"
assert "private function is_pse_deploy_ready(): bool" in trigger
assert "if (!$this->is_pse_deploy_ready()" in trigger
assert "$build_button_disabled = !$pse_deploy_ready" in trigger
print("PSE_GITHUB_TRIGGER_BOUNDARY=PASS (static, non-deploy)")
print("PSE_TRIGGER_GUARD=EXISTING_TOKEN_REPO_AND_DATABASE")
