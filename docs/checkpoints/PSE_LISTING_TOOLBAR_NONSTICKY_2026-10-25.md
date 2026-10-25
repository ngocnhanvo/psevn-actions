# PSE listing secondary toolbar normal scrolling — 2026-10-25
## Scope & preservation
- PSE Astro `ngocnhanvo/psevn-astro`, `github` development, `master` production; PSE Actions `ngocnhanvo/psevn-actions/main`.
- Knowledge read: `ngocnhanvo/knowledge/main`; mode `auto-build`. No main website header sticky change, no WordPress content changes, no source data/cache redesign.
- User screenshot shows **secondary search + category filters** sticking and obscuring article cards after scroll. Requirement: normal document flow; scope all matching listing templates.
## Implemented source and tests (PASS)
- `src/astro/pages/PostsPage.astro`: removed `sticky top-[60px]` from subheader.
- `src/astro/pages/ProductsPage.astro`: removed `sticky top-[80px]`.
- `src/astro/pages/ProductsSSRPage.astro`: removed `sticky top-[68px] min-[900px]:top-[60px]`.
- Added `data-listing-toolbar` to each section and Vitest contract `src/lib/seo/pseListingToolbarPosition.test.ts`.
- Astro source [PR #43](https://github.com/ngocnhanvo/psevn-astro/pull/43) MERGED; `master` and `github` synced at `9d10c03c4ebf46d3d1b4d9a8a5ba168d5e4570be`.
- Source-only full independent Vitest/regression [#40150434850](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40150434850) **PASS** (no build).
## Release status at checkpoint write
- Official WordPress/PHP authenticated **Build Website** [#40150622466](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40150622466) **PASS**. Owner-approved WP exception for subpages was previously recorded in `docs/checkpoints/2026-10-25-pse-remaining-subpages.md`; still through WP PHP nonce/lock rather than direct Astro Actions dispatch.
- The resulting signed Astro production release [#40150677056](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40150677056) **IN PROGRESS at checkpoint write**. Check exact conclusion before claiming deployment success. Do not trigger another build if ongoing or already completed successfully.
- Read-only Playwright QA workflow `.github/workflows/pse-listing-toolbar-live-qa.yml` tests actual news archive `/tin-tuc-su-kien/` and product catalog `/san-pham/` at 390/768/1440. Initial [#40150521645](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40150521645) FAILED because it ran **before** release and live HTML did not yet contain `data-listing-toolbar`. Do not classify this as a failed new build. QA refined to use existing native click toggles for both product/news (not force ARIA behavior unsupported in the original Product UI).
- **NEXT** after signed release PASS: update existing `.pse-listing-toolbar-live-trigger` exactly once, wait for run PASS; if failure, inspect actual Playwright log, fix test assumption vs actual UI problem, rerun only relevant scroll QA. Verify CSS `position:static`, toolbar scrolls out of viewport, click filter remains functional. Report `DEPLOYED` and `LIVE_QA_PASS` separately.
