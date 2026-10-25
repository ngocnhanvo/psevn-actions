# PSE — Product dropdown and original fertilizer descriptions (2026-10-25)

## User request and evidence
- Three screenshots: `/san-pham?limit=48` filter dropdown hidden behind product cards; old category Joomla list displays full short product specifications; legacy product detail `Đạm Phú Mỹ Kebo - Mô tả và HDSD` contains tables with fertilizer nutrient metrics and four crop-specific usage rows not fully rendered on new site.
- Knowledge read `ngocnhanvo/knowledge/main`; exact repo FE `ngocnhanvo/psevn-astro` (github DEV, master PROD), BE `ngocnhanvo/psevn-php`, Actions `ngocnhanvo/psevn-actions/main`; code mode auto-build.
- Baseline Astro master `7358c5e23c7e8e36830913f0a2678a57771875b7`, no active build at start. Last successful PHP-signed deploy #40152791739 remains production until further notice.

## Verified root causes
- Astro `ProductsPage.astro` and `ProductsSSRPage.astro` had `position:static` toolbar while dropdown overlapped transformed product cards, unlike fixed news archive `relative z-30`.
- Previous product importer `scripts/pse-product-batch.mjs` creates native Products using `excerpt=item.name` (title only) and `content='<p>'+safe(item.full minus name)+'</p>'`, while original Joomla detail pages contain complete usage/specification tables. This is source data loss at import, not just CSS.
- Read-only existing audit [#40154190824](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40154190824) SUCCESS: native 44 published Products, original 49 Joomla family rows / 44 unique legacy product IDs; example Drone original `id=1668` has 2 detailed tables and 36-month validity, whereas native #80944 has `excerpt` only title and collapsed short content. Kebo source ID `1457`; keep Code `23932` (fertilizer label) separate from Joomla source ID.

## Work in progress
- Astro github changed `ProductsPage.astro` and `ProductsSSRPage.astro` filter bars to nonsticky `relative z-30`, added short specs rendering and `productSummaryText` to preserve verified newline/HTML formatting. `ProductDetailsPage.astro` now styles WordPress tables for readable detail. Focused Vitest added in `src/lib/wordpress/products/productSummary.test.ts` and `src/lib/seo/pseProductListingContent.test.ts`.
- Independent no-build CI [#40154676965](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40154676965) SUCCESS 89 test files, 404? tests count per run. Final no-build CI after all Astro source edits [#40154914731](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40154914731) **IN PROGRESS AT CHECKPOINT**; verify result before merge.
- PSE Actions added guarded `scripts/pse-product-description-repair.mjs` and Node-only router to **existing** `.github/workflows/pse-product-batch.yml` (no new build path); explicit `audit(pse): product content parity dry-run` makes **READ-ONLY** scan, `cms(pse): restore verified fertilizer descriptions batch N` allows controlled native WP edits only, 8 products/batch, strict source-ID/title/detail checks, backup original `excerpt` and `content` in artifact before write and REST readback. Original batch import script preserved. Fixed initial invalid Actions condition expression by routing in Node; initial no-job failures #40154543316 / #40154553766 / #40154606535 **were workflow syntax errors, zero WordPress writes**.
- Product restore dry-run [#40154629289](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40154629289) **IN PROGRESS AT CHECKPOINT**, scan full 44 mapped origin articles. Source Joomla tables may be nested; subsequent script fix supports nested overview/usage table extraction (running job originally checked out earlier SHA). Read audit log/artifact, then rerun dry **only if necessary** before any write. Do not assume `DRY_PASS` if job incomplete/fails.

## Next exact steps (no duplicate)
1. Read dry-run outcome and `pse-product-batch/product-description-repair.json`. If completeness failures, distinguish Joomla missing detail from parser bug, fix parser and rerun dry before writes. No guessed nutrient values or fabricated HDSD.
2. After verified content audit, apply bounded product batches using exact commit marker `cms(pse): restore verified fertilizer descriptions batch N` through existing Actions workflow, readback title, specification, usage table, image ID and category IDs, record backup artifact. Do not delete/recreate existing 44 Products. Continue batches only after prior batch PASS.
3. After CMS descriptions and FE independent CI PASS, open/merge FE PR to master per auto-build; run precisely one authenticated **WordPress PHP Build Website** through approved workflow/tool. Do not dispatch Astro independently. Follow signed FTPS release.
4. Run existing read-only Playwright `scripts/pse-listing-toolbar-live-qa.mjs`, recently enhanced to assert actual Product filter dropdown is above cards on 390/768/1440px; verify Kebo `Mã số 23932` and detail `Hướng dẫn sử dụng` / original crop dosage table, related Product paths, and no inner scroll. Record LIVE QA separately from CI/build and data-parity results.
5. Do not claim Production or all-44 content parity success until each relevant actual WordPress CMS readback, signed build and Playwright acceptance have completed.

STATUS AT WRITING: PRODUCT_OVERLAY_SOURCE=PARTIAL/NOT MERGED; SOURCE_DATA_PARSER=PARTIAL; REPAIR_DRY_RUN=IN_PROGRESS; CMS_RESTORATION=NOT_STARTED; PRODUCTION_DEPLOY=NOT_STARTED.

## Updated execution state (same day; replaces stale pre-release statuses above)

**Already completed — do not rerun:**
- Joomla original Product source/detail audit [#40154190824](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40154190824): 49 family rows; 44 native mapped Product IDs.
- Initial strict dry-run [#40155132109](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40155132109): 38/44 two-table details verified. Exceptional separate paragraph-format dry-run [#40155906701](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40155906701): remaining six source products verified, no fabricated usage tables.
- Six native Product content restoration batches **SUCCESS** with WordPress REST verification preserving category and media IDs:
  - Batch 1: [#40155291224](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40155291224), 8/8;
  - Batch 2: [#40155624173](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40155624173), 8/8;
  - Batch 3: [#40155794986](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40155794986), 8/8;
  - Batch 4: [#40156065326](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40156065326), 8/8;
  - Batch 5: [#40156249368](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40156249368), 8/8;
  - Batch 6: [#40156508708](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40156508708), 4/4.
- Total **44/44 CMS Products restored** (excerpts + detail content). Native WordPress Product #80940 Kebo (Joomla id=1457, fertilizer registration 23932) REST readback contains 1,812-character full description including original fertilizer tables/usage, excerpt 182 characters, unchanged featured_media and category assignment. The other products were individually read back as well.
- Astro source regression full Vitest + parser [#40155062204](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40155062204) **PASS**; source PR [#46](https://github.com/ngocnhanvo/psevn-astro/pull/46) merged. Astro `github` and `master` both at `39d69bd23255dca7c3e81a85f6e1d9ce711546c4`.
- Page layout now has nonsticky `relative z-30` toolbar for both Product and ProductSSR listing variants, and renders verified WordPress short excerpts in cards. Previous typography contract of ProductDetails remains intact (no extra CSS overriding it).

**Still pending at this checkpoint update:** one PHP-controlled signed WordPress Build Website trigger and release to `pse.webnvn.com`; then real-browser Chromium responsive overlay/short excerpt + Kebo detail usage acceptance. Do not claim website live QA PASS before deployed. No independent Astro dispatch.
