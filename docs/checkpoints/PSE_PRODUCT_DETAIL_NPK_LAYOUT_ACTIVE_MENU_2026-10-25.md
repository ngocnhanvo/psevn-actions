# PSE Product detail NPK: responsive specification table and assigned taxonomy active Header — 2026-10-25

## Owner report
Screenshot and public URL `https://pse.webnvn.com/san-pham/npk-phu-my-15-15-15-nhap-khau-1714`: broken WordPress Product detail information layout and Header not active on the associated Product group. Code mode: `auto-build`.

## Governing scope
Knowledge `ngocnhanvo/knowledge/main` read, project AGENTS: FE `ngocnhanvo/psevn-astro` `github` DEV / `master` PROD, PHP `ngocnhanvo/psevn-php` `master`, Actions `ngocnhanvo/psevn-actions` `main`. Follow WordPress/PHP Build Website signed release only; no independent Astro build, no force/exception. No PHP source change.

## Independent read-only diagnosis: PASS
- [#40191085365](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40191085365) Chromium 390/768/1440 confirmed correct HTTP200, CMS imported HTML table literally `<table style="width: 909px; height: 699px;">`; desktop information column only 548px. Fixed dimensions caused overflow/uneven row spacing. Product Header category context had been supplied only from the first Product category and a custom menu-slug lookup.

## Source fix: PASS
- Astro FE `src/astro/pages/ProductDetailsPage.astro`: add Product detail-scoped CSS `table{width:100%!important;height:auto!important;table-layout:fixed}` plus auto height cells, compact padding, wrapping, mobile refinements. WordPress Product body retained as-is, no text/media changes through Astro.
- Astro FE `src/pages/ssr/products/[slug]/detail.astro`: pass ALL assigned native `product.categories[lang]` into `currentPage.categories_detail` (fallback to primary if absent). Removed ad hoc menu slug matcher and hardcoded guesses.
- Astro FE `src/astro/components/Layout/Header.astro` and `src/lib/stringUtils/menuTree.ts`: use assigned-WordPress-category menu context for Posts AND ProductDetailsPage; prefer deepest menu leaf, tie-break by CMS assigned category order; contextual active link gets `aria-current="location"` while SEO canonical remains article/product URL.
- Two new/updated regression test files. Exactly six FE files changed.
- Independent full Vitest and Astro parser NO BUILD [#40191470298](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40191470298) SUCCESS.
- [PR #52](https://github.com/ngocnhanvo/psevn-astro/pull/52) merged to Astro `master` **`1785a65d13b05a744bfe8f3818e409929285094f`**.

## Native WordPress source correction: PASS
- Normal build initially denied [#40191706477](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40191706477), `pending_count=0`. No bypass or forced build attempted.
- Because actual WordPress Product content contained the broken imported inline fixed dimensions, a legitimate data correction was independently warranted.
- Guarded read-only native Product audit [#40192040313](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40192040313) PASS: ID **81014**, exact slug, 2 tables, exactly 1 fixed `909x699` table, 1981→1944 HTML characters, full displayed text parity.
- Guarded authentic WordPress REST update [#40192146942](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40192146942) PASS: only remove the problematic presentational table dimensions, read-after-write verified; **text/spec data, Product excerpt, categories, featured image, status, slug unchanged**. Product content revision/backup recorded in guarded Actions artifact. No other Products changed.
- Existing authenticated PHP normal WordPress Build Website [#40192247140](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40192247140) SUCCESS with **`pending_count=1`**, idle build lock, normal mode; no exceptional build.
- Signed Astro build/deploy FTPS/unzip/smoke [#40192313507](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40192313507) SUCCESS, exact FE master source `1785a65d13b05a744bfe8f3818e409929285094f`, `SIGNED_UNZIP_SUCCESS` and homepage/SSR/robots smoke PASS.

## Production live QA: PASS
Read-only Chromium [#40192466011](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40192466011) **3/3 PASS**, with screenshots at 390, 768, 1440:
- Every width HTTP 200 and correct canonical `/san-pham/npk-phu-my-15-15-15-nhap-khau-1714`, H1 present, no horizontal viewport overflow.
- **390px:** content width 358px; table width 358px; natural table height 493px.
- **768px:** content width 688px; table width 688px; natural table height 464px.
- **1440px:** content width 548px; table width 548px; natural table height 464px (instead of imported 909x699).
- Correct WordPress-assigned Product menu item **`Nhóm phân hỗn hợp NPK Phú Mỹ`**, href `/san-pham/nhom-phan-hon-hop-npk-phu-my`, is marked **`aria-current="location"`** in desktop/mobile Header HTML. No incorrectly active root catalog.
- Screenshots uploaded as GitHub Actions artifact `pse-fertilizer-responsive-screenshots`.

## Final handoff
`CODE_READY=PASS`; `WP_DATA_PARITY=PASS`; `VITEST=PASS`; `WP_BUILD_NORMAL=PASS`; `SIGNED_PRODUCTION_DEPLOY=PASS`; `LIVE_LAYOUT_390_768_1440=PASS(3/3)`; `HEADER_ASSIGNED_CATEGORY_ACTIVE=PASS`; `SEO_CANONICAL=PASS`.

**DONE.** No need to repeat production build, audit, product content edits, PR merge or live QA on continuation unless new evidence or new requirement. Code mode: auto-build.
