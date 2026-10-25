# PSE SSR Product category Header active state — execution checkpoint 2026-10-25

## Scope and authority
- User screenshot: `/san-pham/dam-phu-my` displays Product dropdown, but corresponding child is not highlighted; the static "Xem tất cả Sản phẩm" was green even on child pages.
- Governing Knowledge `ngocnhanvo/knowledge/main` AGENTS + CORE + WordPress Header policy. Target exact repos: FE `ngocnhanvo/psevn-astro` (`github` DEV, `master` PROD); BE `ngocnhanvo/psevn-php` (`master`, unchanged); Actions `ngocnhanvo/psevn-actions` (`main`). Code mode `auto-build`.
- Only WordPress/PHP Build Website can trigger production Astro; no independent Astro dispatch; no forced/exceptional WordPress build without explicit owner permission.

## Verified WordPress menu mismatch and repair: DONE
- Read-only native/ESC menu audit [#40169445270](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40169445270) PASS. Native WordPress `menu-items` IDs 77006–77011 already pointed to canonical `/san-pham/<taxonomy-slug>` SSR paths; their separate `esc-menu-item-custom-url[ID]` fields still pointed to old `/san-pham/?cat=<slug>` URL.
- WordPress authenticated native Menu Manager sync script `scripts/pse-product-menu-ssr-sync.mjs`, routed through existing Product menu workflow, performed strict preflight for six original menu IDs, native URLs and ESC fields; submitted actual nav-menus.php form with nonce; reloaded editor and ESC REST. [#40170200951](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40170200951) **SUCCESS 6/6**, no Product/Category/full content changes.
- First attempts [#40169881936](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40169881936) and [#40170041100](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40170041100) failed **before any WordPress save** when Playwright tried to interact with hidden collapsed menu inputs/toggles. Corrected to update exact existing native form inputs then `requestSubmit`; final readback PASS.

## FE first source fix and production release: DONE but active-state live QA failed
- Astro SSR active resolution enhanced for WordPress same-origin external-classified custom URL links, legacy `?cat` vs canonical SSR path; conditional "Xem tất cả" highlight, desktop/mobile and pagination; focused tests.
- PR [#49](https://github.com/ngocnhanvo/psevn-astro/pull/49) merged to `master`, commit `2f84ebbbb0c89e0481fc5dc7604198a6f9cac6d4`.
- Independent no-build CI [#40169870241](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40169870241) SUCCESS.
- WordPress tool [#40170309847](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40170309847) accepted **normal** build with `PSE_WP_PENDING_CHANGE_COUNT=1`, `PSE_WP_BUILD_STATUS_CHECK=idle`, not forced. Official signed Astro FTPS activation + smoke [#40170363210](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40170363210) **SUCCESS**, used exactly master commit `2f84ebbbb0c89e0481fc5dc7604198a6f9cac6d4`.
- Live Chromium [#40170478154](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40170478154), read-only targeted 390/768/1440: 3/9 PASS for /san-pham view-all, 6/9 FAIL for category direct active state. Diagnostic rerun [#40170609409](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40170609409) confirmed category hrefs, public URL and canonical are correct, but child anchor `aria-current` remains absent; view-all no longer erroneously active. **Do not claim first production release fixed categories.**

## Verified root cause and second source fix: CODE READY, NOT DEPLOYED
- `Desktop.astro`, `DesktopBranch.astro`, `MobileBranch.astro` were computing active URL from internal Astro SSR request (or `curUrl` absent), not from the actual canonical public URL already provided in `headProps.href`. Thus all child category pages failed SSR active state despite proper CMS URLs and source helper unit tests.
- Follow-up code passes `publicUrl={headProps?.href}` from `Layout.astro` to `Header.astro`, desktop/mobile roots, and recursively through all nested branches. Fallback to prior `curUrl`/pathname preserved for other pages. No tenant hostname, category ID, WP database, or pipeline changes.
- Updated SSR product category/menu regression to assert canonical public URL propagation.
- Full independent no-build CI [#40170846912](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40170846912) **SUCCESS**.
- PR [#50](https://github.com/ngocnhanvo/psevn-astro/pull/50) merged into production source master `83c08577897714464b5f3c78cfae5c04816a5efd`. `CODE_READY=PASS`, but this **new master commit has not been built/deployed**.
- Read-only WordPress Build Website dashboard [#40171023305](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40171023305) SUCCESS; `build_button_exists=yes`, `build_button_disabled=yes`, no clicks and no dispatches. Does not prove exact pending-count but shows normal UI control currently disabled.
- After previous legitimate WordPress menu update was consumed by successful build, **do not fabricate any CMS content updates simply to raise build pending-count**. Do not trigger an independent Astro build, and do not force PHP exceptional mode without explicit approval.
- `SIGNED_DEPLOY` for source `83c08577...` = NOT STARTED; `LIVE_BROWSER_QA` for that source = NOT TESTED. Last deployed source is `2f84ebbb...`.

## Next steps only
1. Obtain explicit owner approval for ONE WordPress/PHP Build Website exception for master `83c08577897714464b5f3c78cfae5c04816a5efd`, unless a new genuine WordPress change creates normal pending count. No other source/CMS changes necessary.
2. Confirm WP current lock/run status and Astro source HEAD, use existing one-time authenticated PHP exception route **only if approved**, never GitHub Astro direct dispatch.
3. After signed deploy success, rerun existing focused read-only Playwright `scripts/pse-product-menu-active-live-qa.mjs` through workflow `pse-fertilizer-live-qa.yml` with commit title `test(pse): live Product Header category active menu`; require **9/9** across 390/768/1440 for Đạm Phú Mỹ, Hữu cơ Phú Mỹ, root products; check submenu click and exact `aria-current`.
4. Record final QA/release statuses. Do not repeat the six CMS sync, merged source PRs, no-build tests or already-successful old signed deploy.

**State: WP_ESC_MENU_SYNC=PASS; ASTRO_SOURCE_MASTER=PASS(83c08577); SOURCE_CI=PASS; PRODUCTION_DEPLOY_SECOND_FIX=BLOCKED(authority for exception / no normal pending); LIVE_QA_SECOND_FIX=NOT_TESTED.**

**Code mode: auto-build.**
