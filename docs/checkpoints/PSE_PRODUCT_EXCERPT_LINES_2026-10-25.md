# PSE native WordPress Product short descriptions — line-per-field (2026-10-25)

## User request
User requested all native WordPress Product **Mô tả ngắn** be formatted like WordPress visual editor screenshot: one Mã số line, bold Thành phần heading, **each original nutrient/ingredient on its own paragraph**, bold Loại cây heading and unchanged crop list. Existing public catalog already has approved 2 horizontal Product cards per row and source-verified categories/SSR; do not repeat those completed deployments.

## Proven starting checkpoint
- WordPress previously restored 44/44 original Product excerpts and full details, with last confirmed CMS content parity. No reimport/recreate; Product CPT IDs, category IDs, featured media and full content remain unchanged.
- FE source Astro master=github `c2e32919d1429f9153013b508f1a754ace42c9c6`; `ProductsSSRPage.astro` and `ProductsPage.astro` already render Product excerpt via `productSummaryText` with `whitespace-pre-line`; no frontend code edit necessary.
- Exact repos: `ngocnhanvo/psevn-astro` (github DEV, master PROD), `ngocnhanvo/psevn-php` master and `ngocnhanvo/psevn-actions` main; governing Knowledge `ngocnhanvo/knowledge` main. **Code mode: auto-build**.

## Source of truth and implementation
- Created guarded no-build `scripts/pse-product-excerpt-format.mjs` in `psevn-actions/main`, routed through existing Product batch workflow `.github/workflows/pse-product-batch.yml` and existing trigger `.pse-product-batch-trigger` (no new build workflow).
- WordPress Product `excerpt` is the *only* updated field via authenticated native WordPress REST with nonce. Parser separates Mã số, Thành phần, each recognized nutrient/other composition field, and Loại cây without altering original characters, numbers, units or punctuation; source text equality validated ignoring whitespace only. Mixed original expressions (e.g. `61%Độ ẩm`, `TE (Zn: 50ppm; B: 50ppm)`, Biuret, pH, `Vi sinh vật`) covered.
- Requires exactly 44 source-ID-backed published native Products, reads before and after each edit, guards published status, slug, full Product content, featured_media and product_cat; JSON artifact contains per-batch backup of previous excerpts for reversible correction. Bounded 8 records/batch and skips exact already-formatted values.
- No Product records, categories, media, detailed content, routes, menu or frontend Astro source code changed.

## Verified Actions — do NOT rerun
| Operation | Run | Result |
|---|---|---|
| Final no-write preflight all 44 Products | [#40165232994](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40165232994) | PASS 44/44, multi-line 44, 0 failures |
| WP excerpt update batch 1 | [#40165333586](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40165333586) | PASS 8/8 |
| WP excerpt update batch 2 | [#40165453730](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40165453730) | PASS 8/8 |
| WP excerpt update batch 3 | [#40165572367](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40165572367) | PASS 8/8 |
| WP excerpt update batch 4 | [#40165678539](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40165678539) | PASS 8/8 |
| WP excerpt update batch 5 | [#40165786781](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40165786781) | PASS 8/8 |
| WP excerpt update batch 6 | [#40165901152](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40165901152) | PASS 4/4 |
| Authenticated PHP/WordPress Build Website | [#40166004948](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40166004948) | PASS, normal build (44 pending), NOT forced |
| One signed WP-triggered Astro production / FTPS | [#40166070370](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40166070370) | PASS, signed deploy activation and smoke |
| Independent live Chromium read-only | [#40166342272](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40166342272) | PASS, 6/6 viewport checks + Product specific acceptance |

Initial no-write audit [#40165058755](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40165058755) failed due overly strict whitespace equality in original source; **zero WordPress writes**. Corrected formatter and final dry-run passed before any mutations. Do not rerun.

## Live UI acceptance evidence
- `/san-pham/huu-co-phu-my` SSR HTTP 200, correct category/canonical, 3 original CMS Product cards; viewport **390px 1 column**, **768px and 1440px 2 horizontal cards/row**.
- Kebo Product #80940 rendered **9 short-description lines** with code `23932`, separated `Thành phần`, per-ingredient including `Biuret: 1,2%`, separate `Loại cây`; browser assertion `PSE_PRODUCT_SHORT_DESCRIPTION_LINES` PASS.
- Kebo full detail unchanged: **2 genuine original tables** and dose/usage preserved; Header Vietnamese diacritics. Six news/product filter layout tests PASS; no browser-side CMS writes.
- Signed release built from unmodified Astro production master commit `c2e32919d1429f9153013b508f1a754ace42c9c6`; FTPS+signed unzip PASS, Image Delta and Static Delta reused verified payload. No second build.

## FINAL
`WP_PRODUCT_EXCERPT_FORMAT=PASS(44/44)`; `CREDENTIALLED_WP_BUILD=PASS`; `SIGNED_PRODUCTION_DEPLOY=PASS`; `RESPONSIVE_LIVE_QA=PASS`. No imports, commits, builds, or tests need repeating for this completed change unless source changes.
