#!/usr/bin/env python3
"""Static, non-deploying checks for the PSE-only WordPress->Astro pipeline."""
from pathlib import Path

root=Path(".")
workflow=(root/".github/workflows/pse-production-deploy.yml").read_text()
php=(root/"source-php/pse-unzip.php").read_text()
ready=(root/"source-php/pse-unzip-v2.ready").read_text().strip()
seo=(root/"source-astro/scripts/sync-seo-files.mjs").read_text()
client=(root/"scripts/pse-remote-unzip.py").read_text()
ftp=(root/"scripts/pse-resumable-ftp.sh").read_text()
revision=(root/"scripts/pse-published-sitemap-revision.py").read_text()

expected_workflow=[
    "repository_dispatch:", "types: [wp_trigger_build]",
    "github.repository == 'ngocnhanvo/psevn-actions'",
    "repository: ngocnhanvo/psevn-astro",
    "ref: master", "source/.cache", "cache: pnpm",
    "pnpm install --frozen-lockfile", "pnpm run build-git",
    "pse-remote-unzip.py verify", "pse-published-sitemap-revision.py",
    "pse-resumable-ftp.sh", "pse-remote-unzip.py unpack",
    "PSE_CLIENT_ORIGIN", "PSE_CLIENT_HOST",
    "PSE_DEPLOY_REQUEST_DOMAIN", "ASTRO_FTP_TARGET",
    "FTP_ASTRO_DIR",
    "pse-staging-build.json", ".template-sitemap-deploy-state.json",
]
for item in expected_workflow:
    assert item in workflow, "Missing inherited pipeline/tenant boundary: "+item
assert "\n  workflow_dispatch:" not in workflow, "Build may only be initiated through WordPress"
assert "\n  issues:" not in workflow, "Issue-based deploy is forbidden"
assert workflow.count("repository_dispatch:")==1, "Unexpected alternate dispatch route"
assert "ngocnhanvo/nghiencuukhoahoc-" not in workflow, "Wrong project repository"
for forbidden in ("PSE_ASTRO_UNZIP_SIGNING_KEY", "PSE_ASTRO_FTP_TARGET", "PSE_BUILD_ENABLED",
                  "PSE_ASTRO_DEPLOY_READY", "PSE_ASTRO_DEPLOY_TARGET"):
    assert forbidden not in workflow and forbidden not in php and forbidden not in client, (
        "Unnecessary newly introduced build key still present: " + forbidden)
assert "out.write('ASTRO_FTP_TARGET='+target" in workflow, "FTP target must derive from validated WC_URL_CLIENT"
# No website hostname belongs in reusable deployment source.
assert "webnvn.com" not in workflow, "Hardcoded hosting domain found in deploy workflow"

for token in ("VCS_GH_ACTIONS_TOKEN", "VCS_GH_REPO",
              "pse-staging-build.json","pse-astro.zip","X_ESC_DEPLOY_TIMESTAMP",
              "X_ESC_DEPLOY_SIGNATURE","hash_equals","ZipArchive","rollback",
              "WordPress deploy identity is not configured"):
    assert token.lower() in php.lower(), "Missing PSE signed deploy guard: "+token
assert all(token in php for token in ("defined('DB_NAME')", "defined('VCS_GH_OWNER')", "defined('VCS_GH_REPO')")), "Deploy identity must be explicitly configured in WordPress"
assert "DB_NAME === 'nghiencuukhoahoc_181026'" not in php, "Portable PHP cannot pin a cloned database name"
assert "VCS_GH_REPO !== 'psevn-actions'" not in php, "Portable PHP cannot pin a static Actions repository"
assert "webnvn.com" not in php, "A fixed website hostname remains in signed PHP deploy"
assert ready=="PSE_ASTRO_UNZIP_PROTOCOL=2"
for token in ("PSE_ASTRO_UNZIP_PROTOCOL=2","/pse-unzip.php","pse-staging-build.json",
              "SOURCE_REPO_PAT","sha256","SIGNED_UNZIP_SUCCESS"):
    assert token in client, "Signed activation port missing "+token
assert 'os.environ["SOURCE_REPO_PAT"]' in client, "Inherited PAT-based signature is required"
assert "set ssl:verify-certificate yes" in ftp, "TLS chain verification must remain enabled"
assert "set ssl:verify-certificate no" not in ftp, "Insecure FTP client"
assert "PSE_CLIENT_HOST" in ftp and "pse-astro.zip" in ftp
assert "PSE_PUBLISHED_SITEMAP_REVISION" in revision, "Save-token optimization changed"
assert "FTP_TLS(context=ssl.create_default_context()" in revision, "Sitemap revision must use verified TLS"
assert "TEMPLATE_PUBLISHED_SITEMAP_REVISION" in revision, "Validated PSE FTP token must be forwarded to inherited Astro SEO key"
assert "TEMPLATE_PUBLISHED_SITEMAP_REVISION" in seo, "Shared Astro SEO Save-token is not connected"
assert ".template-sitemap-deploy-state.json" in seo, "Shared Astro SEO revision state path changed"
assert "process.env.WC_URL_CLIENT" in seo, "SEO frontend must be from site config"
assert "webnvn.com" not in seo, "Hardcoded website hostname remains in Astro SEO"
print("PSE_PRODUCTION_PIPELINE_STATIC=PASS")
print("PSE_RELEASE_GUARD=WORDPRESS_TRIGGER_PLUS_TENANT_PREFLIGHT")
print("NO_BUILD_NO_FTP_NO_DISPATCH=PASS")
