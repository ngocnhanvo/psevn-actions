# PSE verified Delta Static — checkpoint (2026-10-25)

## Purpose and preserved architecture
- Existing 350-image SHA-256 Delta Image production works; **do not reimplement it**.
- Additional transport saving targets eligible `client/**/*.html`, `client/**/*.css`, `client/**/*.js` only. `client/index.html` must remain ZIP-local; `server/` SSR, WordPress sitemap/robots/llms, environment and sensitive files are never reused.
- Signed PHP inventory contains stable relative paths, sizes and SHA-256. If old PHP omits `static`, static deployment stays **full ZIP**. If hashes are different despite equal size, new bytes must be in ZIP.
- Signed PHP restores reused static files from the verified old `client/` into fresh staging and verifies every result before the pre-existing atomic activation/backup/rollback. Old files are discarded only via successful backup cleanup, not before reconstruction.
- Existing image marker/reuse, archive signing, HTTPS, FTPS/TLS, WordPress build lock, and rollback remain unchanged.

## Source and test evidence
- PHP source branch `feature/pse-static-delta-20261025` PR [#2](https://github.com/ngocnhanvo/psevn-php/pull/2): merged to `master` as `9e79d90389cbb44f3abfa7a7b15f0bc9d9e2761a` (source **only**, not evidence of FTP deploy).
- Actions branch `feature/pse-static-delta-20261025`, PR [#12](https://github.com/ngocnhanvo/psevn-actions/pull/12); deploy workflow unmerged as of initial checkpoint.
- Standalone cross-repo contract workflow [#40143365210](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40143365210) **PASS**, with PHP feature and Actions PR.
- Repeat on merged PHP `master` [#40143421762](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40143421762) **PASS**. Static unit covers HTML/CSS/JS reuse, same size but different SHA, mandatory index retention, symlink, unsafe paths, missing/stray files and full ZIP fallback. Existing image contract also PASS.
- No independent Astro build or FTP was triggered by the tests.

## Production safety and remaining actions
- At inspection, an **independently triggered** WordPress Astro production build [#40143412040](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40143412040) is active. **Do not modify live PHP unpacker until that run completes**.
- **PENDING**: after that run is complete, release the already-merged PHP source using the existing signed/reversible `pse-php-live-release.yml` FTPS mechanism; verify SUCCESS, without triggering Astro build.
- **PENDING**: after PHP release verification, merge Actions PR #12 after rechecking branch diff and confirming independent CI PASS. Do not overwrite unrelated PSE branches/commits.
- **NOT TESTED IN PRODUCTION**: static reuse benefit and impact on 90s objective. Wait for next **legitimate WordPress Build Website**; no direct Actions build, force-build or fabricated WordPress change.
- Rollback: revert Actions PR #12 (restores full static ZIP); PHP remains backward-compatible with no marker. If needed, revert PHP PR #2 via verified PHP release workflow. Keep all protections.

## 2026-10-25 completion — supersedes PENDING production safety items above

- Pre-existing WordPress-driven Astro production release [#40143412040](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40143412040) completed **SUCCESS** before any PHP static delta installation. It had **864 compiled images, only 350 reused**, new ZIP **44,458,730 bytes**, FTPS **111s**, signed unpack + public smoke PASS. Large image additions caused a longer production upload; the prior 87s target is not a guaranteed SLA for media-heavy builds.
- PHP static reuse source [PR #2](https://github.com/ngocnhanvo/psevn-php/pull/2) merged `master` SHA `9e79d90389cbb44f3abfa7a7b15f0bc9d9e2761a`. FTPS deployment [#40143823261](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40143823261) **SUCCESS**, both `pse-image-delta.php` and `pse-unzip.php` replaced with SHA-256 readback PASS, unrelated PHP files unchanged, no Astro build, ready marker and independent WordPress QA PASS.
- Actions [PR #12](https://github.com/ngocnhanvo/psevn-actions/pull/12) merged `main` SHA `e088a6b63b11f3acb625079d8366d9ea3b1f2e93`. Independent release architecture workflow [#40144007396](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40144007396) **SUCCESS** after merge; cross-repo static/image unit CI [#40143421762](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40143421762) **SUCCESS**.
- Live signed HMAC PHP manifest probe [#40144035336](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40144035336) **SUCCESS**: **44 public static HTML/CSS/JS files / 2,453,854 bytes** available for SHA-256 matching; **864 image files / 56,007,886 bytes** inventoried. All are snapshot counts, NOT yet a measured byte saving. Probe is READ ONLY, no FTP or Astro build.
- **PRODUCTION STATIC DELTA DEPLOY = NOT TESTED** until the next normal WordPress/PHP Build Website release includes the updated Actions packaging. No force build, no direct Actions build or artificial CMS edit was performed.
- On that next legitimate release, inspect `PSE_STATIC_DELTA=ENABLED` reuse count and saved bytes, signed PHP activation, homepage + SSR + robots checks, and total run duration. If static manifest absent/unsupported, full static ZIP remains the safe fallback. If any postdeploy issue occurs, revert the Actions static PR first (removes static delta ZIP marker), then recover through the existing signed rollback path if necessary.
