# PSE G10 — Quá trình hình thành & phát triển (2026-10-24)

## Scope / baseline
- WordPress Page id 79301, slug `qua-trinh-hinh-thanh-phat-trien`, action `PublicPage`, key `pse-company-qua-trinh-hinh-thanh-phat-trien`.
- Astro: `ngocnhanvo/psevn-astro`, `github` DEV and `master` production source; PHP `ngocnhanvo/psevn-php`; Actions `ngocnhanvo/psevn-actions` main.
- Mode auto-build. Official PHP/WordPress Build Website only, no independent Astro build; do not alter pipeline.
- Follow `knowledge/stacks/wordpress-editor-esc-table.md`: native ESC Table structured items for corporate section, WordPress Insert Code to attach shortcode, preserve old image as editorial asset.
- Before edits: Astro branches identical at ce8a46cfdb42c6ba97fdd3a1291f39442b9f4d46; G9 finished separately. Do not rerun G9/G8 or Joomla queue.

## Content inventory / migration
- Original WordPress body is one 7-cell HTML table: first cell WordPress image ALT `qua-trinh-phat-trien` 835x293, third cell exactly 6 editorial paragraphs, other cells blank.
- Source dates preserved: 07/08/2008; 01/09/2008; 22/12/2010; 12/01/2011; 30/01/2011; 01/02/2011. The WordPress editorial prose remains unchanged as milestone `details`, including original corporate names, decision numbers and chronology; six titles are CMS item labels.
- `pse_history_vi` authored via native WordPress ESC Table editor; 6 rows, fields `date/title/details`. Native Advanced Editor tested 6/6; row move and restore PASS. Creation interrupted by admin navigation, blank table verified then resumed safely without duplicate. Successful [run #40107509284](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40107509284).
- Original WordPress photo kept as ordinary `<figure class="pse-history-cover">` before native shortcode; ESC Table inserted only through native WordPress Insert Code UI. Dry preflight [#40107781862](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40107781862) PASS.
- Native Save in run #40107893490 wrote a valid WordPress Page but its strict raw string comparison flagged false failure due editor preview + CRLF normalization. READ ONLY readback [#40108043544](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40108043544) PASS: single `pse_history_vi` editor preview with shortcode token, original `figure/img` retained, old table gone. DO NOT SAVE AGAIN just to satisfy raw formatting.
- No second table and no duplicate insertion.

## Astro source
- `src/astro/tablepress/Pse_history.astro`: SSR from WordPress ESC Table, semantic `ol/li` vertical responsive green history timeline, date badges, no nested scrolling. Global cover styles preserve the original WordPress photo; media URL and contents are not hardcoded in Astro.
- `src/lib/seo/pseHistoryTable.ts`: strict CMS date/detail validation. `src/lib/seo/pseHistoryTable.test.ts`: unit tests.
- [PR #34](https://github.com/ngocnhanvo/psevn-astro/pull/34) merged as `4abe7f38d8272d9687b56815ad600f6c0234f806`; [PR #35](https://github.com/ngocnhanvo/psevn-astro/pull/35) merged as `9b139247ab942b05852480fca63f52fed74fe43f`. Both `github` and `master` fast-forward synchronized.
- Independent full Vitest/Astro parser NO BUILD [#40106719099](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40106719099) PASS and [#40107417577](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40107417577) PASS.
- QA code/workflow exists in `scripts/pse-history-live-qa.mjs` / `.github/workflows/pse-history-live-qa.yml`; trigger only AFTER signed deploy is proven, with `.pse-history-live-qa-trigger`.

## Build deployment state — check run before acting
- Genuine WordPress pending changes=2, force exception=false, PHP build request [#40108179317](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40108179317) SUCCESS. This is the **only build trigger** for G10.
- Downstream PSE signed Astro/FTPS [#40108247001](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40108247001) launched, in progress when checkpoint first written. **DO NOT start another build while it is running**.
- After signed deploy PASS: run exactly one read-only QA at widths 390, 768, 1440: six milestones, dates, headings, image source/ALT/load, no nested horizontal/vertical scrolling, screenshots.
- On failure investigate direct job log, CMS shortcodes/asset processing and browser layout without altering pipeline or deleting CMS data.

## Status
- ASTRO_CODE/MERGE: PASS, CI: PASS, NATIVE_ESC_AUTHOR: PASS, WORDPRESS_ATTACH: SAVED + READBACK PASS.
- PHP normal build trigger PASS. Signed deploy and live QA: **PENDING at first checkpoint**.

## Final live deployment and QA — verified complete
- Normal WordPress/PHP build [#40108179317](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40108179317) **SUCCESS**, `pending_count=2`, `PSE_FORCE_BUILD_ONCE=false`; no exception and no duplicate build.
- Downstream Astro `master` exact SHA `9b139247ab942b05852480fca63f52fed74fe43f`, signed bundle / FTPS [#40108247001](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40108247001) **SUCCESS**, `SIGNED_UNZIP_SUCCESS`, production smoke PASS.
- Responsive read-only Playwright [#40108416292](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40108416292) **SUCCESS 3/3** at **390/768/1440px**. All three: HTTP 200, one H1, 6 ESC Table milestones with all six source dates in the original order, nonempty texts, existing WordPress photo present/loaded/visible with ALT, no hidden/clipped text, no horizontal overflow, no nested scroll, 11 sibling menu links, no exposed shortcode. Three full-page screenshots uploaded as artifact `pse-g10-history-responsive`.
- Final status: **CODE_READY=PASS; CI=PASS; NATIVE_ESC=PASS; WORDPRESS_PAGE=PASS; PHP_BUILD=PASS; SIGNED_FTPS=PASS; LIVE_QA=PASS.**
- No further deployment, re-save, tests, or mutations required for G10 unless new user feedback arrives.
