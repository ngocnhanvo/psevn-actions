# PSE G8 — Modern achievement cards (WordPress-backed PublicPage)

Date: 2026-10-24. Mode: `auto-build`. Status: **DEPLOYED / READ-ONLY LIVE QA PASS**.

## User request

On `https://pse.webnvn.com/thanh-tuu`, replace imported Joomla award table with more modern, easy-to-read cards. Screenshot showed cramped text and obsolete dark-blue year treatment. Images and CMS text must remain correct, with responsive desktop/mobile.

## State confirmed before change

- Exact project Astro `ngocnhanvo/psevn-astro` `github=DEV`, `master=production source`; PHP `ngocnhanvo/psevn-php`, Actions `ngocnhanvo/psevn-actions`.
- Existing G7 source/deploy SHA `8f2cf99f81fdfe64ac2c0e06c3d4bf4bca5740ed` identical on both branches, signed FTPS and G7 live QA 20/20 PASS. Do not replay.
- Read-only native Chromium inventory [#40094665893](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40094665893) and [#40094890367](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40094890367) confirmed legacy `table#Table_01` with nested two-cell rows: **8 award records** in CMS order **2026, 2015, 2013, 2012, 2011, 2010, 2009, 2008**; each contains a real WordPress image and one or more `<li>` descriptions. The obsolete outer footer image has `alt="chan-trang-giay"`, i.e. decorative, not an award. The year treatment depended on an old `title-nam.jpg` background and white text. No data migration/update required.

## Code implementation

- New `src/lib/seo/pseAchievementCards.ts`: strict structural detection of `table#Table_01` with nested award records. Transform *only when the full record schema validates*. Each source image, existing year and item description remains sourced from WordPress, not hardcoded in frontend. Convert to semantic `article` cards with accessible year `h2`, a full-image source link and source-derived fallback alt for blanks; old decorative graphic not duplicated. If unexpected source markup, return the original content unchanged. Preserve all non-table surrounding HTML.
- `src/astro/pages/PublicPage.astro`: apply presentation-only transform after existing trailing-empty-row cleanup, style semantic cards with two-column photo+text desktop, one-column mobile, legible green-on-pale-green year pill, flexible card height, contained image, well-spaced list. Scope selectors to `pse-public-page`; do not affect other public Pages, PostDetails, cache/SSR, and do not change WordPress DB.
- New `src/lib/seo/pseAchievementCards.test.ts` tests output item counts, text, media preservation, alt, invalid-schema fallback, special chars.
- PR [#31](https://github.com/ngocnhanvo/psevn-astro/pull/31) merged to master, then `github` synchronized; both at **`c36b65f8a5006dad5c1e9bed69bf9a34845b0f63`**. Independent NO BUILD CI [#40095182689](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40095182689) SUCCESS: **81/81 Vitest files, 367/367 tests, Astro parser PASS**.

## Official PHP-controlled deploy and live verification

- One authenticated WordPress `Build Website` trigger [#40095459113](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40095459113): PHP returned `pending_count=0`, mode `owner-approved-exception` as previously permitted, correct nonce/lock and dispatch PASS.
- Signed Astro build + FTPS [#40095521462](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40095521462) SUCCESS for exact SHA `c36b65f`; signed unzip, homepage/API/robots smoke PASS. No direct Astro build started outside PHP.
- Read-only Playwright [#40095682224](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40095682224) SUCCESS: `PSE_AWARDS_CARD_SUMMARY={"checks":2,"failed":0,"expected":2,"readOnly":true}`; desktop 1440/mobile 390 both HTTP 200, single H1, eight year labels in CMS order, **8 images all actually loaded**, nonempty alt, all original 17 list items, no legacy table, text visible/unclipped and nonwhite, no horizontal overflow, 9 same-menu links retained. Screenshots stored in run artifact **pse-corporate-live-screenshots** (artifact ID `12560796197`) with `g8-awards-1440.png` and `g8-awards-390.png`.
- Parallel independent Joomla publication-date backfill run `#40095535232` FAILED, unrelated to G8, untouched. Do not restart or assume content migration complete.
- Extra caveat: original text remains faithful to CMS, including legacy spelling/dated award details; no unsupported factual rewrite was performed.

## Resume discipline

G8 **COMPLETE** for presentation and live QA. Do not rerun PR/CI/build/FTP/QA for this SHA. New user feedback should be compared against the live cards and saved screenshots before further edits. Other independent tasks/migrations have separate checkpoints.
