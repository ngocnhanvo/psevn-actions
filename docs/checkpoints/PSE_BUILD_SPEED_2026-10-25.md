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

## 2026-10-25 — Continuation checkpoint: newer production measurement

- Re-read Knowledge main, PSE Astro AGENTS, deployment inheritance policy and PSE Actions source. Checked current runs and previously completed independent diagnostics before taking action.
- Latest signed production deploy **[#40137989832](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40137989832)**: 2026-10-24 22:18:31–22:20:33 UTC, **122 seconds end-to-end**. ZIP **22,189,765 bytes**, FTPS transfer **56 seconds / 0.38 MiB/s**. Signed unzip returned PASS, homepage/user SSR/robots smoke PASS. This is a new measured datapoint, not a rerun triggered by this checkpoint.
- Previously completed SHA-by-SHA image-cache comparison [#40137717136](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40137717136) remains **350/350 images unchanged** between the two earlier run snapshots; it does not independently prove equality to the newest #40137989832 output.
- Thus the transport bottleneck persists. Tuning `lftp` buffers did not reach 90 seconds; switching from lftp to Python FTP_TLS was also slower/essentially equivalent in prior bounded benchmark.
- **Status: delta image reuse protocol still awaits specific owner approval** under Knowledge core/01 and `psevn-astro/docs/BUILD_ARCHITECTURE_INHERITANCE_POLICY.md`. Detailed existing proposal: [PSE_DELTA_IMAGE_FTPS_DEPLOY_2026-10-25.md](../proposals/PSE_DELTA_IMAGE_FTPS_DEPLOY_2026-10-25.md). No source/runtime/deploy protocol changes made in this continuation; no Astro build or FTP deploy triggered.

## 2026-10-25 — Delta Image approved, deployed and measured — 40139560969

**Supersedes the older `approval required` / `NOT IMPLEMENTED` text above.** The owner explicitly approved the specific [Delta Image proposal](../proposals/PSE_DELTA_IMAGE_FTPS_DEPLOY_2026-10-25.md) in this conversation. No new approval is required for this scoped protocol change.

### What was already done before the present continuation
- `psevn-actions/main` has signed remote-image manifest preflight, `scripts/pse-image-delta-package.py`, unchanged full ZIP fallback and original WordPress-triggered deploy gate.
- `psevn-php/master` has `pse-image-delta.php` and signed `pse-unzip.php` integration to verify hashes, copy reused image files inside staging, reject unsafe names/symlinks and preserve atomic activation and rollback.
- Independent delta unit contracts **PASS** [#40139207204](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139207204); release architecture verification **PASS** [#40139231115](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139231115); verified PHP FTPS deployment **PASS** [#40139258852](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139258852); signed image manifest preflight **PASS** [#40139422918](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139422918).
- A regular WordPress/PHP Build Website request **PASS** [#40139483353](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139483353) triggered exactly one production Astro release [#40139560969](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139560969). This continuation only **observed** the already running release and did not re-trigger a build.

### Verified first successful Delta Image production deploy
- `#40139560969`: **SUCCESS**, created 2026-10-24 22:40:24 UTC, completed 22:41:57 UTC, **93 seconds end-to-end** (including GitHub job cleanup).
- Signed remote image inventory **350 files / 16,806,102 bytes**.
- `PSE_IMAGE_DELTA=ENABLED total=350 reuse=350 bytes_saved=16806102`.
- Full ZIP baseline [#40137989832](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40137989832): 22,189,765 bytes; new delta ZIP: **5,313,697 bytes** (~76% smaller).
- New FTPS transfer: **14 seconds** vs 56 seconds baseline. **42 seconds saved on FTP**.
- Signed PHP unzip and atomic activation **PASS**; homepage HTTP, WordPress-backed `/api/user/info` SSR endpoint and `robots.txt` smoke **PASS**.
- End-to-end duration improved **122 -> 93 seconds** (29 seconds faster). **90-second objective not yet strictly met** (3-second gap); do not present it as under 90.
- As always, full ZIP fallback remains for cold/unavailable image inventory, and checks must be revalidated if new media are published.

### Next action
- Prefer observing the **next normal WordPress-triggered deploy** to measure variation against 90 seconds; do not fabricate WordPress changes, force build, dispatch Astro directly, or repeat the completed production release.
- If the target is consistently missed, profile independent preflight/cache steps and consider minimal safe parallelization only after inspecting current HEAD and tests; do not remove signature/SSR/rollback or compromise image integrity.
- Do not alter unrelated active PSE Joomla/news migration jobs.

## 2026-10-25 — 87-second measured production success (target met once)

**Supersedes the 93-second / target-not-met status above.**

- Signed Delta Image and WP-triggered full deployment code were already released and tested, as recorded above.
- Another PSE session merged a minimal parallel read-only preflight step (sitemap Save token and signed image inventory concurrently, AFTER verifying signed target). The workflow continues to wait for both results and fails if either fails. Related architecture verification [#40139847146](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139847146) **PASS**, delta contract [#40139801954](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139801954) **PASS**.
- A duplicate concurrent implementation attempt from this continuation was identified before merge. Its [PR #11](https://github.com/ngocnhanvo/psevn-actions/pull/11) was **closed unmerged**, preserving the canonical change on `main`.
- Native PSE WordPress PHP request [#40139893419](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139893419) **PASS** and created the ordinary Astro release [#40139962300](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139962300). This continuation only observed it and never dispatched duplicate builds.
- [#40139962300](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139962300) **SUCCESS**, created 2026-10-24 22:46:13 UTC, completed 22:47:40 UTC: **87 seconds end-to-end**, meeting the requested 90-second threshold by 3 seconds in this one measured run.
- Signed image manifest **350 images / 16,806,102 bytes**. `PSE_IMAGE_DELTA=ENABLED total=350 reuse=350 bytes_saved=16806102`.
- ZIP **5,313,696 bytes**, FTPS **18 seconds** (~0.28 MiB/s); signed unzip/atomic activate **PASS**, homepage + WordPress-backed SSR API + robots HTTP smoke **PASS**.
- Historic pre-Delta baseline [#40137989832](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40137989832): **122 seconds end-to-end**, full ZIP 22,189,765 bytes, upload 56 seconds. End-to-end improved **35 seconds (~29%)**.
- **Status: DELTA_IMAGE=DEPLOYED_PASS; LIVE_SIGNED_FTPS=PASS; PHP_BUILD=PASS; 90_SECOND_TARGET=MET_IN_ONE_RUN.** This is not a hard latency guarantee: runner startup, cache misses, new images and FTPS network speed vary. Keep the full ZIP fallback and monitor future real WordPress-triggered builds; do not fabricate CMS edits or force another build only for benchmarking.

## 2026-10-25 — Owner-approved Delta Image successfully deployed; 90s target met once

**Owner approval:** explicit approval in this conversation to implement `docs/proposals/PSE_DELTA_IMAGE_FTPS_DEPLOY_2026-10-25.md`. Preserve branch/security and official WP Build Website gate.

### Code, checks and production release

- PHP `ngocnhanvo/psevn-php/master` [PR #1](https://github.com/ngocnhanvo/psevn-php/pull/1), merge `cf32e5c3b7c848b8413af6f992750c9379769b60`: `pse-image-delta.php` plus signed read-only `image_manifest` in `pse-unzip.php`, complete stage image verification by size/SHA-256 before existing atomic activate/rollback. Signed full ZIP remains backward compatible.
- Actions `ngocnhanvo/psevn-actions/main` [PR #9](https://github.com/ngocnhanvo/psevn-actions/pull/9), merge `3f6b13d1c7084df3d8abd3be09a8b6381f89501f`: signed remote inventory; compiler-source image delta packager, full fallback, archive validation, existing protected PHP uploader includes new helper.
- Dedicated offline unit contracts [#40139149765](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139149765), and follow-up [#40139801954](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139801954) PASS: PHP syntax, image reuse, FULL ZIP fallback, wrong hash, missing/unlisted image, traversal and symlink rejection, Python packaging. Production release isolation CI [#40139231115](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139231115) PASS.
- Protected PHP FTPS release [#40139258852](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139258852) PASS: only `pse-image-delta.php` and `pse-unzip.php` changed; each SHA-256 readback verified. Remaining PHP files unchanged. No Astro build in PHP release.
- Signed live manifest read-only [#40139422918](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139422918) PASS: **350 deployed images / 16,806,102 bytes**; no upload/build.
- One normal (NOT force) authenticated WP build request [#40139483353](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139483353) PASS with `pending_count=1`; actual production [#40139560969](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139560969) SUCCESS **93 seconds** 22:40:24–22:41:57 UTC, 350/350 reused, 16,806,102 bytes omitted, ZIP 5,313,697 bytes, upload 14s, signed unzip & live homepage/API/robots smoke PASS.
- Further owner-scoped safe performance optimization: [Actions PR #10](https://github.com/ngocnhanvo/psevn-actions/pull/10) merge `c19c30ab21b01863c70b9a83644aed0dd93dc13a`. Parallel only the independent signed sitemap/manifest reads and independent read-only postdeploy GET requests. Both signed preflight and original three HTTP smoke PASS requirements stay unchanged. NO BUILD architecture CI [#40139847146](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139847146) PASS.
- Second normal WP request [#40139893419](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139893419) PASS with genuine `pending_count=1`, normal mode, no force. Actual production build [#40139962300](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40139962300) **SUCCESS in 87 seconds** (2026-10-24 22:46:13–22:47:40 UTC): `PSE_IMAGE_DELTA=ENABLED total=350 reuse=350 bytes_saved=16806102`, transferred 5,313,696 bytes in 18s (~0.28 MiB/s), signed unzip PASS and homepage, WordPress-backed SSR and robots.txt GET smoke PASS. **TARGET <=90s = PASS on this actual run.**

### Interpretation and continuity

- Compared with the pre-delta 122s production build, latest is **35s faster end-to-end**; upload payload drops ~22.2 MB to ~5.31 MB.
- **Do not guarantee future 90s**: FTPS throughput varies (14s first delta vs 18s second), and real content changes can legitimately require additional media; cold-cache/full-ZIP is an intentional fallback.
- No change to pnpm build, WordPress data cache or CMS, sitemap Save semantics, server credentials, FTPS/TLS validation, source repository identity, and PHP nonce/build lock.
- **No automatic additional build needed:** two production releases and all mandatory signed/SSR checks PASS. Never dispatch Astro directly or force when pending=0.
- Rollback if needed: revert Actions PR #10 for sequential reads, revert Actions PR #9 for full ZIP; existing PHP image helper is backward-compatible. PHP signed release uses SHA-256 verified FTP rollback procedure.
