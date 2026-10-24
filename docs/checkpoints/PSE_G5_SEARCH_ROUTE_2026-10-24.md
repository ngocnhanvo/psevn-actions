# PSE G5 — Astro standalone route protected from CMS post fallback

Date: 2026-10-24. Mode: `auto-build`.

## Prior steps already complete — DO NOT replay

- Corporate menu 10 Page children bound natively in WordPress, menu click-through 20/20 PASS, run [#40085955883](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40085955883); WordPress build+signed FTPS #40085624269 and #40085688546 PASS.
- WordPress article detail fallback CPT redirect ID 80429 published, 9 redirect rules; read-only article details 6/6 PASS before current route fix, and G3 corporate/news 32/32 PASS.
- Joomla serialized migration queue is independent, running in Actions. Do not restart it.

## Root cause

- Published Astro route `src/pages/tim-kiem.astro` was HTTP 404 after general WordPress Rewrite `^/([^/.]+)$ -> /ssr/posts/$1/detail` because its `page_not_exists` condition checked only WordPress Pages; physical Astro routes were absent from the build-time in-memory route context.
- Live utility QA run #40085839057 FAIL: homepage HTTP 200, search HTTP 404. Do not alter WordPress rule as a hardcoded search exception.

## Code

- Astro branch `github` DEV: `scripts/physical-page-routes.mjs`, `scripts/physical-page-routes.test.ts`, and a small change in `scripts/patch-entry.mjs`: detect real physical root Astro route names from `src/pages`, add to `routeContext.pages` only when not already WordPress Page. Native matcher/SSR/cache/WordPress redirect rules unchanged.
- PR [#27](https://github.com/ngocnhanvo/psevn-astro/pull/27) merged to Astro `master` SHA `53e4e4af0f412a396524a368ded8232ffc213f8d`; `github` fast-forwarded and identical.
- CI first attempt #40087017529 FAIL on a syntax error in new line; corrected. Latest CI [#40087081434](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40087081434) SUCCESS, 78/78 test files, 353/353 tests, syntax/AST parser PASS. No build/FTP in CI.

## Official deployment

- Owner authorized WordPress `Build ngoại lệ` when needed. One official WordPress authenticated trigger [#40087263953](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40087263953) PASS, PHP `pending_count=0`, mode owner-approved-exception, lock and nonce remained enforced.
- Signed Astro build + FTPS [#40087320612](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40087320612) SUCCESS, source master SHA `53e4e4a`, rollback/provenance activation and production smoke PASS. No independent Astro dispatch was used.

## Live verification after release

- Auto workflow read-only utility QA [#40087456377](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40087456377) SUCCESS: `PSE_UTILITIES_LIVE=PASS`, `PSE_SEARCH_SSR_LIVE=PASS`, published post query verified, GET only.
- Targeted G4 detail regression (no repeat G2/G3), [#40087526768](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40087526768) SUCCESS: six published article requests, HTTP 200 on desktop 1440px and mobile 390px; H1=1, time, canonical, description, no legacy related/sidebar/overflow, PDFs/images retained; `checks=6, failures=0`.
- Status: **G5 SEARCH ROUTE FIX DEPLOYED AND VERIFIED PASS.** Older failed runs refer to previous SHAs and should not be rerun.

## Remaining work outside this task

- Serialized Joomla article migration queue remains independent; check its newest checkpoint and current run before any action. Do not infer full content parity from frontend QA.
- Continue other incomplete PSE pages/menus only after reading newest state. Do not rebuild/revalidate these passing commits unnecessarily.
