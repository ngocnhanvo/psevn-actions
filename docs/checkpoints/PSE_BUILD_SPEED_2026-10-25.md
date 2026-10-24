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

## 2026-10-25 05:00 ICT — FTPS slowdown reproduced and source measured

This supersedes the earlier `NOT MEASURED` status above.

- Latest live production build **[#40135974794](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40135974794)** = **129s** including FTP **54s**, ZIP **22,140,603 bytes**, FTPS **0.39 MiB/s**; signed unzip/SSR smoke PASS. Earlier after optimization [#40134437874](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40134437874) = 122s, FTPS 52s (0.41 MiB/s). Thus socket buffer change did **not** establish improvement and 90-second target is **FAIL/NOT ACHIEVED** in these runs.
- Reproducible bounded FTPS profiling **[#40136422393](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40136422393)**, 6 MiB random data, same runner: Python FTPS certificate verified 15.68s / 0.38 MiB/s, lftp 4 MiB buffer 18.09s / 0.33 MiB/s. Temporary artifacts removed. Official production ZIP was removed by signed deploy, so archive directory composition cannot be fetched read-only over FTP after activation.
- Restored independent WordPress cache investigation **[#40136637928](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40136637928)**: 350 images, 16,806,102 raw bytes, ZIP estimate 16,848,095 bytes; 12 other cache files = 372,646 bytes. Existing `.cache` cache restore PASS; NO ASTRO BUILD, NO FTP. **It does not prove all 350 files are unchanged between deploys.**
- Root cause: 0.3–0.4 MiB/s long-haul FTPS throughput combined with full ~22MB ZIP each time. To meet 90s from the current 129s while preserving full build, substantial asset-reuse/delta packaging is indicated, not more buffering.
- A specific architecture-change proposal is stored at **[docs/proposals/PSE_DELTA_IMAGE_FTPS_DEPLOY_2026-10-25.md](../proposals/PSE_DELTA_IMAGE_FTPS_DEPLOY_2026-10-25.md)**. **Status: pending owner architecture approval; NOT IMPLEMENTED**. Full ZIP signed deploy continues unchanged.
- Next permitted action: with owner approval, implement the source + signed PHP manifest/copy/verify/fallback with unit + live WordPress-triggered end-to-end QA and measured runtime. Without approval, do not change deployment protocol, hardcode domains or force Astro build.


## 2026-10-25 05:15 ICT — Retained image cache compared byte-for-byte (NO BUILD)

New independent diagnostic [#40137717136](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40137717136), merged via [PR #7](https://github.com/ngocnhanvo/psevn-actions/pull/7), restored the **exact two historical production caches** from successful runs #40134437874 and #40135974794 and compared the SHA-256 for every relative image path.

- Before: **350 images / 16,806,102 bytes**; after: **350 images / 16,806,102 bytes**.
- **Unchanged: 350 / 350, totaling 16,806,102 bytes**; modified = 0; added = 0; removed = 0.
- This proves 100% image-cache equality **for those two builds only**, not all future content changes or the actual ZIP file membership. The ZIP is deleted by the signed PHP activator and was not available for a direct archive diff.
- With measured FTPS ~0.39 MiB/s, avoiding transmission of those bytes would theoretically save ~41 seconds; additional PHP manifest read/hash/copy time is unmeasured and the 90-second end-to-end target is NOT VERIFIED.
- Test is read-only with respect to hosting and production: no WordPress changes, no FTP, no Astro build/deploy; GitHub Actions PASS.
- Owner architecture-approval gate remains in force: **do not edit production ZIP, PHP signed unzip protocol or atomic activation** until the explicit proposed delta-image transport change is authorized.
