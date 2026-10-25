# PSE Contact Page office/form two-column — 2026-10-26

## Scope
- Owner screenshot: public `/lien-he`; office information left, existing Contact_00/native contact form on right at desktop; native five warehouse cards below; delete “Nội dung sẽ được cập nhật khi cấu hình website mới.”.
- Mandatory Knowledge `ngocnhanvo/knowledge/main`, `auto-build`. Exact repos: FE `ngocnhanvo/psevn-astro` (`github` DEV, `master` PROD); PHP `ngocnhanvo/psevn-php` master (no code changes); Actions `ngocnhanvo/psevn-actions` main.
- Source of truth: WordPress native Page #47222, action PrivatePage, key contact; 5 source-verified warehouse cards and office already in WP; ESC shortcodes 0, so Astro uses its single functional Contact_00 fallback form. **Never create second form or duplicate warehouses.**

## Completed, do not repeat
1. FE DEV source feature files `src/lib/seo/pseContactLayout.ts`, `src/lib/seo/pseContactLayout.test.ts`, `src/astro/pages/PrivatePage.astro`: split the exact source-owned location section into intro, office, five-warehouse grid, and existing remaining CMS content. Responsive 2-column office/form above 900px, stacked below; all content preserved, no pinned URL/data or new mail route. Suppress exact internal note on render as defense in depth; original API/form/Tunstile preserved.
2. Reusable no-build Actions Vitest/ASTRO parser [#40237697832](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40237697832) **SUCCESS**. FE separate three-file PR [#72](https://github.com/ngocnhanvo/psevn-astro/pull/72) **MERGED** master `a88714b13e27eb35af3402dce9bda3810b6303c9` (do not merge all divergent DEV commits).
3. Owner directive added to Knowledge: no public agent/developer editorial notes, implementation comments or setup-status placeholders. [Knowledge PR #15](https://github.com/ngocnhanvo/knowledge/pull/15) MERGED main `dfb1b2a59d35b2c0929a6b6694ab23dcd956a7ba`; updated UI stack, README and CHANGELOG.
4. WordPress read-only [#40237961643](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40237961643) confirmed exact one legacy public editor-note in CMS, native office/warehouses intact. Guarded native WordPress Page #47222 cleanup [#40238085923](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40238085923) **SUCCESS**: original content backed up in action artifact, one note removed, five warehouses preserved, native read-after-write PASS, NO BUILD. No need to re-run CMS mutation.
5. Normal authenticated PHP Build Website request [#40238264384](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40238264384) stopped without deploy: WP showed pending_count 0. Existing approved exceptional build path for subpage QA then executed ONCE: authenticated WordPress Build Website [#40238497921](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40238497921) **SUCCESS**: PHP UI build lock idle, pending 0, owner-approved one-time exception accepted; produced signed Astro production run [#40238571107](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40238571107), RUNNING at checkpoint. No independent workflow dispatch or FTP bypass.
6. Existing read-only media/contact QA helper `scripts/pse-media-live-qa.mjs` extended at Actions commit `fd9e32c7` to assert: exactly one native form, fields/validation, 5 warehouses, absence of internal text, left/right at desktop, vertical on 390/768, warehouse below, no WP-admin URL leaks, no horizontal overflow. No real email sends.

## Remaining steps (only)
1. Inspect signed Astro run #40238571107 until completed, verify GitHub job logs for correct source SHA, artifact, signed FTP deploy, activation and smoke. Do **not** re-trigger WordPress build while in flight.
2. After live deploy SUCCESS trigger existing read-only workflow `.github/workflows/pse-media-live-qa.yml` by updating `.pse-media-live-qa-trigger` (no build). Read result and screenshot artifacts at desktop 1440, tablet 768, mobile 390. If specific contact layout fails inspect root cause and fix only involved FE/CMS.
3. Only report `LIVE_QA_PASS` after actual live screenshots/layout check, no duplicated form, 5 warehouses intact, no editor note. Keep no-build / deploy / CMS writes separate.
4. If deployment fails, inspect exact log and repair before retry through WordPress/PHP tool. No forced build by default; owner-approved exception was **one-time** and used.

Code mode: auto-build.
