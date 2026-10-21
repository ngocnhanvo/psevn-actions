# PSE source import checkpoint — 2026-10-21

## Result
**PASS — source import completed** via [GitHub Actions run #39596953375](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39596953375) (no deploy).

Previous blocked run #39596101423 failed before checkout because SOURCE_REPO_PAT was unavailable. After the user configured the secret, run #39596953375 completed successfully. The token was validated and all three source checkouts and target writes succeeded.

## Pinned source snapshots
- Astro: `ngocnhanvo/nghiencuukhoahoc-astro`, commit `f208bde5e4c137b32a2e30f9515e4fdae29a225d` (source `github`).
- PHP: `ngocnhanvo/nghiencuukhoahoc-php`, commit `c1c6f6d3e4c4710f2b1cda18808b6d57c6f723c0` (source `master`).
- Actions: `ngocnhanvo/nghiencuukhoahoc-actions`, commit `875e98cf3d7d2c25f7215e602aa953ee5dbf4283` (source `main`).

## Destinations and evidence
- PSE Astro `ngocnhanvo/psevn-astro`: branch `github`; import commit `354bf15d8d0fa9e87133a032b640ee1e6f9c77a1`. Mandatory inherited policy was restored from the pinned source in follow-up commits `adbd59d9474db162fb74a9e50299fdd2d550b48f` and `13cb5a21f5ccecde149ffc9e3d53afdaa9f67795`, as the source .gitignore ignores docs by default.
- PSE PHP `ngocnhanvo/psevn-php`: isolated import branch `import/eduresearch-baseline`, commit `93fbcc5f01b43bd80bb55bf541065b1b554bfaaf`.
- PSE Actions `ngocnhanvo/psevn-actions`: import commit `cadbb8d525fd3323d0f2023d38d8f64577039223`, reference workflows under `imported-eduresearch/workflows-disabled/*.yml.txt` (30 original workflows). They are NOT active workflows.

## Safety and unfinished adaptation
- No FTP upload, no WordPress admin operations, no Astro build, no production deploy, and no edits to source repositories were performed.
- PHP import excluded wp-config.php and backups, uploads, cache, emergency PHP unzip/debug scripts and secret-like files. Review the complete source and deployment configuration before using it.
- PSE production environments, domain, WordPress API, OAuth redirect URLs, secrets, FTP destination, and Build Website integration have NOT been validated.
- PSE Astro `master` production branch was NOT created. PSE PHP `master` production branch was NOT changed or created.
- Code has been copied, but no build/test run on the imported application was performed. Do not claim application or deployment PASS.
- The one-time import trigger is intentionally guarded against overwriting destination import branches on retries. Do not rerun it unnecessarily.

## Next stage
1. Review PSE-specific domain, identity, WordPress API and deployment configuration, without changing the inherited build/cache/incremental architecture.
2. Review/redact old domain references before enabling PSE-only Actions workflows; retain only needed CI workflows.
3. Test code offline and staging with correct PSE environment, then follow the PSE code-mode approval path for any production action.


## Branch normalization (2026-10-21)
Requested layout from PSE project context:
- `psevn-astro`: `github` = development/test, `master` = production. Both now exist, both at `13cb5a21f5ccecde149ffc9e3d53afdaa9f67795` during initial import (source EduResearch Astro code was identical between `github` and `master` except implementation status documentation).
- `psevn-php`: `master` now holds imported backend snapshot `93fbcc5f01b43bd80bb55bf541065b1b554bfaaf`.
- `psevn-actions`: `main` kept; `knowledge`: `main` kept. Knowledge proposal branches are outside PSE cleanup scope.

Actions run [#39599552679](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39599552679) completed and removed the PHP `import/eduresearch-baseline` temporary ref after verifying it exactly matched `master`.

**PARTIALLY BLOCKED (GitHub administrative permission):**
- Astro and PHP repositories still have `main` as their GitHub default branch; both `main` branches contain only original bootstrap README.
- `SOURCE_REPO_PAT` has sufficient Contents rights for reading/writing/deleting non-default refs, but GitHub returned HTTP 403 (`Resource not accessible by personal access token`) when trying to PATCH each repository's `default_branch`.
- No attempt was made to delete either current default branch. A guarded workflow `.github/workflows/pse-branch-finalize.yml` remains ready to re-run after the existing PAT is granted **Repository permissions → Administration: Read and write** for `psevn-astro` and `psevn-php`, or after the repository owner manually changes the two default branches (Astro → github; PHP → master).
- Once defaults switch, this guarded workflow will delete only `psevn-astro/main` at `d20d0604b01c288c0fd6229d4007a10c7bd08e97` and `psevn-php/main` at `e97ffce51f14e02effca0459198e286ee1a030d9`, refusing deletion if changed.
- No production deploy/build/FTP/WordPress action taken. Source EduResearch repositories were not changed.

## Infrastructure isolation audit — 2026-10-21

**Result: NOT VERIFIED AS ISOLATED; application code still references source EduResearch environment. Do not deploy imported PSE source yet.**

- Completed read-only audit: https://github.com/ngocnhanvo/psevn-actions/actions/runs/39602614690
- PSE Actions GitHub secrets confirmed PRESENT (names only): `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `WP_ADMIN_USERNAME`, `WP_ADMIN_PASSWORD`, `SOURCE_REPO_PAT`.
- Public read-only GET probes: `https://admin-pse.webnvn.com/wp-json/` HTTP 200, `https://api-nghiencuukhoahoc.webnvn.com/wp-json/` HTTP 200; each frontend root HTTP 200. This does NOT establish database isolation.
- There is no committed PSE runtime `wp-config.php` with the actual database name/host/credentials. `wp-config-sample.php` is a template only. Database identity of deployed WordPress PSE versus EduResearch cannot be determined from GitHub.
- PSE Astro `src/lib/nckh/serverWp.ts` hardcodes EduResearch WordPress API; `src/lib/nckh/serverSession.ts` hardcodes EduResearch origin/host; `src/lib/nckh/privateRuntime.ts` locks private runtime to EduResearch domain.
- PSE PHP `wp-content/plugins/github-trigger/vcs-build-trigger.php` still points to `nghiencuukhoahoc-actions` and enforces EduResearch-only `DB_NAME` and `site_url()` values in the build trigger guard. Those source guards must NOT simply be deleted or bypassed.
- PSE Actions live workflows: source import, branch finalization, read-only infrastructure isolation audit. No PSE FTP deploy workflow configured. The 30 inherited EduResearch workflows are deliberately stored as nonexecutable `.txt` references. Their old FTP path `/domains/nghiencuukhoahoc.webnvn.com/public_html/` is not a PSE deployment target.
- FTP secrets PRESENT does not prove target/account/path isolation. No FTP connection, upload, deletion, or directory traversal was attempted.
- PSE Astro branches only `github` and `master`; PSE PHP only `master`; PSE Actions only `main`, after successful branch cleanup https://github.com/ngocnhanvo/psevn-actions/actions/runs/39601722164. Both PSE Astro and PHP GitHub defaults currently `master`.
- Source repositories and running websites were not modified by the audit; no production build/deploy was performed.

### Required before deploying PSE
1. Verify on hosting that PSE and EduResearch WordPress use different database identifiers/users and preferably independent privileges. Do not reveal passwords. Record sanitized identity and isolation evidence.
2. Verify FTP account scope, real remote deployment directories, and inability of the PSE deploy account to overwrite the EduResearch website. A shared physical FTP server is acceptable if rights and directories are isolated.
3. Convert old hardcoded Astro WordPress API/origin/private-runtime paths and WordPress Build Website repo/site-domain guards to PSE-specific verified settings, retaining existing build architecture and protective checks.
4. Build PSE-specific deployment workflow only after verifying destination and permissions; use the WordPress/PHP Build Website trigger for Astro, not an independent build path.

### Follow-up FTPS credential/path probe — 2026-10-21
- Run: https://github.com/ngocnhanvo/psevn-actions/actions/runs/39603222624 (PASS, read-only).
- Connection using the `psevn-actions` FTP secrets: **FTPS login/PWD succeeded** using TLS with certificate verification enabled.
- Tested candidate paths (CWD/PWD only; no LIST/GET/PUT/DELETE):
  - `/domains/pse.webnvn.com/public_html/`: no_or_unverified
  - `/domains/admin-pse.webnvn.com/public_html/`: no_or_unverified
  - `/domains/nghiencuukhoahoc.webnvn.com/public_html/`: no_or_unverified
- Important: all candidate paths failed or were not verified, which may reflect FTP chroot or differing remote-root mappings. It is **not proof** of separate FTP accounts or permission isolation; the true PSE FTP deployment path remains unverified.
- No remote files were listed or changed, no build/deploy performed. Do not reuse the old EduResearch absolute FTP path in the PSE workflow.

## Shared Playwright infrastructure — 2026-10-21

**Implemented and tested:** `ngocnhanvo/knowledge-actions` (public) hosts a reusable `.github/workflows/playwright.yml` with Playwright `1.64.0`/Chromium Docker image. Each caller owns the target site and optional WordPress credentials. PSE calls it from `.github/workflows/pse-shared-playwright.yml`; the engine has no central project credentials.

- Public PSE desktop/mobile smoke: [#39612921299](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39612921299) PASS.
- Second public smoke: [#39613176502](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39613176502) PASS; npm cache restored (around 11MB); browser image contains Chromium.
- WordPress PSE Site Health: [#39614955441](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39614955441) PASS, authenticated with PSE-specific WP secrets, detected actual DB name in Site Health without logging it.
- This confirms WordPress Site Health browser access, **not** that PSE and EduResearch databases are different. The source project's runtime name has not been verified in the same way.
- First attempts at the Site Health suite needed YAML syntax and Vietnamese label parser fixes; the final run above supersedes the failing diagnostic runs.
- Common operating guidance submitted for review in [knowledge PR #9](https://github.com/ngocnhanvo/knowledge/pull/9), not merged automatically per Knowledge CONTRIBUTING policy.
- No WordPress writes, DB writes, FTP uploads, Astro builds or production deployment occurred. Avoid sharing credentials or DB names in public Actions logs.

