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
