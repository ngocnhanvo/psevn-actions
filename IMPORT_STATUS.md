# PSE source import checkpoint — 2026-10-21

## Current state
BLOCKED — the PSE GitHub Actions repository has no configured `SOURCE_REPO_PAT` secret.
Initial dry run: https://github.com/ngocnhanvo/psevn-actions/actions/runs/39596101423
The job stopped before any checkout/copy/deploy. This is not a successful import.

## Pinned inputs
- Astro: `ngocnhanvo/nghiencuukhoahoc-astro`, commit `f208bde5e4c137b32a2e30f9515e4fdae29a225d` (source `github`).
- PHP: `ngocnhanvo/nghiencuukhoahoc-php`, commit `c1c6f6d3e4c4710f2b1cda18808b6d57c6f723c0` (source `master`).
- Actions: `ngocnhanvo/nghiencuukhoahoc-actions`, commit `875e98cf3d7d2c25f7215e602aa953ee5dbf4283` (source `main`).

## Intended destinations
- `ngocnhanvo/psevn-astro` branch `github`: development source.
- `ngocnhanvo/psevn-php` branch `import/eduresearch-baseline`: isolated source; no production deploy.
- `ngocnhanvo/psevn-actions` branch `main`: script/test references and disabled original workflows under `imported-eduresearch/`.

## Next steps
1. Configure `SOURCE_REPO_PAT` as a secret in THIS repository (do not paste secret in chat). The token needs read access to the three source repositories and write access to all three PSE repositories.
2. Start `PSE one-time source import (NO DEPLOY)` via GitHub Actions workflow_dispatch, or create/update `.pse-source-import-trigger` on `main` to trigger it by GitHub push.
3. Wait for the workflow to finish; inspect actual job steps and verify commit SHAs/branches.
4. Independently audit PSE domain, WordPress API, OAuth, permissions, FTP destination and build trigger. Do not deploy before this is complete.

No PHP FTP upload, WordPress changes, Astro build or website deployment was performed. Source repositories must remain untouched.
