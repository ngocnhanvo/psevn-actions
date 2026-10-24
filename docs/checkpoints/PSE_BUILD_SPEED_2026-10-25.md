# PSE build speed optimization — checkpoint 2026-10-25

## Objective and baseline
Owner-requested target: **90 seconds end-to-end**, measured from WordPress-driven GitHub Actions creation through successful signed FTPS deployment and live SSR smoke. This is an optimization task, **not** authorization to bypass WordPress PHP Build Website or the build lock.

Last measured successful production workflow:
- [#40108247001](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40108247001): **112 s** elapsed, Astro server compilation **24.1 s**, ZIP **22,121,758 bytes**, FTPS transfer **33 s**. CI did not run Vitest during deploy.
- Five earlier sample builds [#40105657309](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40105657309), [#40101843339](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40101843339), [#40095521462](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40095521462), [#40093619344](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40093619344), [#40092711270](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40092711270): elapsed 134/129/107/129/121 s, FTPS 48/46/33/55/46 s; Astro compilation 24/26/23/24/24 s. These indicate transfer + setup, not test suite, dominate.

## Changes applied
- [Actions PR #4](https://github.com/ngocnhanvo/psevn-actions/pull/4), merge commit [418938b8](https://github.com/ngocnhanvo/psevn-actions/commit/418938b8b38e371a52435ad9a93bafbfaa2e9865) to `main`.
- `.github/workflows/pse-production-deploy.yml`: install `lftp` in background while the *existing* `pnpm install` / `pnpm run build-git` runs. Wait for installer success and check `lftp` before proceeding to upload; remove sequential installer step.
- `scripts/pse-resumable-ftp.sh`: `set net:socket-buffer 4194304` to reduce high-latency FTPS throughput limitations. Requires live measurement; improvement not guaranteed.
- No changes to WordPress pending guard, build command, cache, ZIP contents, FTPS TLS verification, resumable upload naming, SHA-256, signed unzip, rollback, sitemap revision, or live smoke.

## Verification
- Static workflow/security invariant checks: PASS.
- Non-build architecture workflow [#40133289222](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40133289222): **PASS** after PR merge.
- WordPress native build request [#40133351611](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40133351611): preflight **PASS**, PHP status **idle**, `pending_count=0`; ordinary build correctly refused (`NO_PENDING_CHANGES`). No Astro build/deploy triggered. No force build.
- **Actual performance after change = NOT MEASURED. 90-second target = NOT VERIFIED.** Do not report speed claim from theoretical improvement.

## Next authorized action
On a genuine WordPress content change that creates pending events, run **one** ordinary PHP/WordPress Build Website, then read newly generated `PSE Astro build and deploy via WordPress GitHub Trigger` job logs. Record end-to-end duration, pnpm install, Astro compile, package, lftp setup, ZIP bytes, FTPS transfer rate, signed activation, and smoke. Compare multiple samples against 90 s; if still above target, identify whether network bandwidth or bundle size dominates before proposing architecture-affecting delta upload.

## Rollback
Revert Actions PR #4 (both changed files) through a reviewed commit. No PHP, frontend source, CMS or secrets migration was performed.
