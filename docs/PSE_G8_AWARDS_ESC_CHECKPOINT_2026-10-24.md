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
