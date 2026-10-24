# PSE G7 — Imported Joomla table layout on company PublicPages

Date: 2026-10-24. Mode: `auto-build`.

## What user requested

- Imported `PublicPage` article HTML must be naturally wide, centered, with narrow images presented attractively; avoid content squeezed in a table at the left of a spacious page.
- No independent vertical scrolling region inside CMS content or tables, including similar cases on other PublicPages.
- Remove excess whitespace before `Các bài viết khác`, particularly on `/hoi-dong-quan-tri`, without deleting real corporate/member data or modifying WordPress records.

## Diagnostic source evidence

- Read-only Playwright DOM runs [#40091908345](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40091908345), [#40092074891](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40092074891) show fixed imported tables: `qua-trinh-hinh-thanh-phat-trien` width 840px in 1376px body; `ban-giam-doc` width 810px, height 519px but internal content 576px (inner scroll); `thanh-tuu` width 713px, height 1223px but internal content 1641px (inner scroll); `ban-kiem-soat` width 810px; `dinh-huong-phat-trien` embedded width 840px.
- `hoi-dong-quan-tri` imported HTML ended in **4 empty NBSP `tr` rows**, approximately 33px each, causing 130+ px of unnecessary whitespace. `qua-trinh-hinh-thanh-phat-trien` ended with one empty NBSP row.
- Other empty rows *between* members are intentional separators and must stay.
- Original `pse-public-body` also had bottom padding 80px and CSS `table{display:block; overflow-x:auto}` which created the unwanted vertical scrollbar when combined with a Joomla fixed table height.

## Implementation and verification

- Exact frontend: `ngocnhanvo/psevn-astro`, development `github`, production source `master`.
- `src/astro/pages/PublicPage.astro`: scope responsive table styles to PSE PublicPage only; semantic table display; width 100%, max-width 1200px, auto height and overflow visible, centered intrinsic images, wrapping long text; preserve fixed-height decorative image cells; make `pre` wrap; reduce bottom padding to 40/48px.
- `src/lib/seo/pseLegacyTableCleanup.ts`: presentation-only `node-html-parser` normalization strips *trailing* blank NBSP rows from rendered content. Does **not** write to WordPress DB, remove real rows, affect `PostDetails`, or change SSR/cache/build API.
- `pseLegacyTableCleanup.test.ts`: 5 tests for trailing blank rows, nested tables, retained images/links, intentional middle separators and content-only HTML.
- PR [#29](https://github.com/ngocnhanvo/psevn-astro/pull/29) merged as `1f4730f628df926edb256494264a48dec3b28dfe`. Independent CI [#40092446414](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40092446414) **363/363 PASS** and Astro parser. WordPress build gate [#40092649978](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40092649978), signed FTPS [#40092711270](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40092711270) PASS.
- Playwright live [#40093023749](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40093023749): **19/20 PASS**; only `thanh-tuu` 390px still overflowed because its nested two-column table was 422px inside 350px content.
- Read-only CSS comparison [#40093236403](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40093236403) confirmed targeted nested-table `table-layout:fixed` at mobile changes outer table width **422→350px** without an inner scroll; broad `table-layout:fixed` on every table would damage other layouts, so not used.
- PR [#30](https://github.com/ngocnhanvo/psevn-astro/pull/30) merged as **`8f2cf99f81fdfe64ac2c0e06c3d4bf4bca5740ed`**; branch `github` fast-forwarded and **identical to `master`**. Independent CI [#40093395180](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40093395180) **363/363 PASS + Astro parser**.
- Normal PHP build gate with owner-approved `pending_count=0` exception [#40093562972](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40093562972) SUCCESS. Signed Astro build + FTPS [#40093619344](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40093619344) **SUCCESS**, source SHA `8f2cf99`, signed unzip and homepage/API/robots smoke PASS.
- Final post-deploy read-only Playwright [#40093842594](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40093842594) **SUCCESS**, exact `PSE_PUBLICPAGE_LAYOUT_SUMMARY={"checks":20,"failed":0,"pageCount":10,"readOnly":true}`. Verified each of 10 company Pages at 1440 and 390: HTTP 200, one H1, no short description, no nested overflow, responsive centered table width, zero trailing blank table rows, reduced bottom gap, related menu panel intact, no document horizontal overflow. Mobile `/thanh-tuu` specifically table width 350px / article width 350px and no overflow.
- Separate auto homepage utility/search QA [#40093767570](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40093767570) SUCCESS.
- Images are preserved in CMS markup and centered/scaled by CSS. QA ran on DOMContentLoaded: initial `img.complete=false` in some samples does **not** prove failed requests; image network/natural-size parity requires an explicit settled-image test if needed.

## No repeat

- **G7 is DEPLOYED / LIVE QA PASS**. Do not replay these two PHP builds, CI checks, source merges, or Joomla migration queue when continuing unrelated work.
- G6 corporate menu sibling links and G5 search route remain unchanged.
- Legacy Joomla article migration is separate; last known failed runs `#40087928688`, `#40089310586`; no importer reset or duplicate posts performed.
