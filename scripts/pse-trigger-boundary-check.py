#!/usr/bin/env python3
"""Read-only PSE PHP source audit for portable WordPress-owned Build Website.

No credentials, website requests, GitHub dispatch, DB access or FTP writes.
Routing is configured by the installation, not hardcoded in any PHP source.
"""
from pathlib import Path
import os

source = Path(os.environ.get("PSE_PHP_SOURCE", "source-php"))
trigger = (source / "wp-content/plugins/github-trigger/vcs-build-trigger.php").read_text(encoding="utf-8")
mu = (source / "wp-content/mu-plugins/esc-github-trigger-config.php").read_text(encoding="utf-8")
js = (source / "wp-content/plugins/github-trigger/vcs-build-trigger.js").read_text(encoding="utf-8")

required_trigger = [
    "private function is_build_configured(): bool",
    "defined('VCS_GH_OWNER')",
    "defined('VCS_GH_REPO')",
    "defined('VCS_GH_ACTIONS_TOKEN')",
    "$this->github_token() !== ''",
    "if (!$this->is_build_configured())",
    "$repo = trim(VCS_GH_REPO);",
    "'event_type' => 'wp_trigger_build'",
    "'site_domain'  => get_site_domain()",
    '"https://api.github.com/repos/{$owner}/{$repo}/dispatches"',
]
required_mu = [
    "'/esc-github-trigger-token.php'",
    "'/esc-runtime-config.php'",
    "define('VCS_GH_TOKEN'",
]
for label, body, values in (("trigger", trigger, required_trigger), ("MU config", mu, required_mu)):
    for value in values:
        assert value in body, f"{label}: missing portable Build Website contract: {value}"

for label, body in (("trigger", trigger), ("MU config", mu), ("UI", js)):
    for forbidden in (
        "PSE_ACTIONS_REPO", "FORBIDDEN_SOURCE_DB", "NCKH_ACTIONS_REPO",
        "nghiencuukhoahoc", "xuongmunonbaohiem",
        "define('VCS_GH_REPO', 'psevn-actions')",
        "self::PSE_ACTIONS_REPO",
    ):
        assert forbidden not in body, f"{label}: fixed tenant/source identity {forbidden}"
assert "private function is_pse_deploy_ready()" not in trigger
assert "function is_build_configured(): bool" in trigger
assert "PSE_ASTRO_DEPLOY_READY" not in trigger
assert "PSE_GITHUB_ACTIONS_TOKEN" not in trigger
assert "is_build_configured()" in trigger
assert "wp_remote_post($url" in trigger
print("PSE_GITHUB_TRIGGER_BOUNDARY=PASS_PORTABLE_CONFIG_REQUIRED")
print("PSE_BUILD=WORDPRESS_CONTROLLED; NO_DISPATCH=PASS; NO_ASTRO_BUILD=PASS")
