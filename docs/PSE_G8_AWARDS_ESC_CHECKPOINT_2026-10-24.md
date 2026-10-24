# G8 PSE Thành tựu — checkpoint (2026-10-24)

## Exact scope
- Rules: ngocnhanvo/knowledge `main`.
- Source frontend: ngocnhanvo/psevn-astro `github` (development), `master` (release).
- CMS backend: ngocnhanvo/psevn-php `master`.
- Automation: ngocnhanvo/psevn-actions `main`.
- Mode: `auto-build`, Astro build only via the existing PHP/WordPress Build Website control.

## Evidence (do NOT repeat successful steps)
1. Existing WordPress Page `79311`, slug `thanh-tuu`, `acf.key=pse-company-thanh-tuu`, `acf.action=PublicPage`.
2. ESC Table `pse_awards_vi` authored through the native ESC Table editor, with 8 year/image/detail rows and 17 list items, image ALT present, native reorder/restore verified. **PASS**: https://github.com/ngocnhanvo/psevn-actions/actions/runs/40098249650. Do not author or import this table again.
3. Astro card components `src/astro/tablepress/Pse_awards.astro`, `src/lib/seo/pseAwardsTable.ts` and tests already present. Astro `github` and `master` both at `c02ca2891167a159664b63a592fb4d254e914925` as checked in this continuation. No open Astro PR.
4. Existing Page legacy HTML has *not* been replaced/saved by the four failing attachment runs. Latest: https://github.com/ngocnhanvo/psevn-actions/actions/runs/40098895858. The WordPress native Quicktags Insert Code action found a single shortcode and removed `Table_01` from the editor selection, preserving the content prefix/suffix, but the strict inserted-middle check rejected the result **before Page Save**. Diagnostic: `shortcodeCount=1`, `oldStillExists=false`, `beforePreserved=true`, `afterPreserved=true`, `oldLength=7090`, `newLength=778`.
5. Script `scripts/pse-awards-esc-attach.mjs` updated in Actions commit `c155ccab26add7f2509541453879806d2c9c0a43` to print the exact inserted-middle substring (with bounded preview) on rejection. This change by itself did **not** trigger a workflow (workflow watches `.pse-awards-esc-attach-trigger` only).

## Current blocker and next exact action
- A request to update the attach trigger file was rejected by the available tool's safety gate in this continuation. **No new G8 attach workflow was triggered and no WordPress Page Save or Astro Build was completed.** Do not claim a successful attach/deploy.
- Next authorized execution: when workflow triggering is available, use *only* the existing `pse-awards-esc-attach.yml` to run this changed script once; inspect `PSE_AWARDS_ESC_ATTACH_INSERT_DIAGNOSTIC.middlePreview` and `middleTail` in the resulting job log. Do not guess what WordPress native Quicktags inserted.
- Modify the expected insert markup if and only if the logged output proves it preserves the exact public legacy content outside the selection and contains exactly the native ESC Table shortcode inside; never delete other Page content. Recheck current WP content/version before retry.
- Verify WordPress REST read-after-write: shortcode exists once, `Table_01` absent, remaining body identical, ACF action/key/status unchanged. Confirm table REST transform returns 8 valid awards.
- Only then perform native PHP/WordPress Build Website under `auto-build`, after checking the current build lock/pending changes; no manual Actions Astro build. After deployment run focused live Playwright QA for `/thanh-tuu` on desktop/mobile. Keep code, CMS, build and QA outcomes distinct.

## Status
`ESC_TABLE_AUTHOR_PASS`; `WORDPRESS_PAGE_ATTACH_NOT_DONE`; `BUILD_NOT_STARTED_IN_THIS_CONTINUATION`; `VISUAL_QA_PENDING`.

## G8 closure — 2026-10-24 native WordPress attachment and verified release

**Scope:** Page 79311 /thanh-tuu, ESC Table `pse_awards_vi`; Astro `github` and `master` at `c02ca2891167a159664b63a592fb4d254e914925`, synchronized; no frontend PR or source change needed. Actions `main` changes only WordPress Insert Code guard/diagnostic, workflow execution markers and this checkpoint.

1. **Native ESC Table authoring already PASS, never rerun:** 8 years, 8 image objects with ALT, 17 award descriptions, native reorder/restore #40098249650. Correct card component `Pse_awards.astro` and Astro image transform/preview unwrap were pre-existing.
2. **WordPress Page attachment PASS:** Diagnostic #40100801768 proved native Insert Code creates a `tablepress-preview-wrap` (embedded `[table id=pse_awards_vi /]`) rather than bare shortcode; strict pre-save guard fixed without bypassing native editor. Native Page Save #40101524168 **wrote content** but reported FAIL solely because WordPress normalized 4 bytes of initial whitespace. **Authoritative read-after-write** run #40101670355 PASS: Page id 79311, slug `thanh-tuu`, `publish`, action `PublicPage`, key `pse-company-thanh-tuu`, single `pse_awards_vi` shortcode, no `Table_01`, previewCount 1, `rawLength=782`, SHA256 `ee53d7f3c435266401f974c0c6f87911771b349b5ad94455db9f30b10be2502c`. Do **not** repeat Page Save. Current `pse-awards-esc-attach.yml` is READONLY to prevent accidental replay. The original legacy body backup artifact was stored with previous attach runs.
3. **WordPress-controlled build PASS:** Request workflow #40101779083 passed signed FTPS target preflight and WP status/lock check, `pending_count=10`, normal mode, no override/force, and native PHP Build Website accepted dispatch. Resulting authorized `repository_dispatch` run #40101843339 **PASS**: Astro build, FTPS encrypted upload, signed PHP activate/rollback and post-deploy smoke all PASS. No independent Astro workflow or force build.
4. **Live responsive source/visual QA PASS:** Read-only Playwright #40102114701 checked `/thanh-tuu` HTTP 200 at 1440px and 390px, all 8 years/cards, 8 functioning images with ALT, 17 list items, H1=1, 9 related links, explicit `data-pse-awards-source="esc-table"`, no legacy table, no document horizontal overflow, no card nested scroll or clipped text. `PSE_G8_ESC_LIVE_SUMMARY={"checks":2,"failed":0}`. Screenshots available in run artifact. No additional deployment required.
5. **Final state:** `ESC_TABLE_AUTHOR_PASS / WORDPRESS_PAGE_ATTACH_PASS / ASTRO_BUILD_PASS / FTPS_DEPLOY_PASS / LIVE_VISUAL_QA_PASS`. Do not recreate ESC Table, rewrite Astro cards, resave WP Page, rerun failed diagnostic runs or retrigger build without new actual content/code changes. Older checkpoint statements like `WORDPRESS_PAGE_ATTACH_NOT_DONE` describe the **pre-closure state** only. Keep Joomla legacy article import workers independent.
