# PSE news archive — selected category contrast and Uncategorized menu removal (2026-10-25)

## Scope & exact source
- Knowledge `ngocnhanvo/knowledge/main` read. PSE Astro `ngocnhanvo/psevn-astro` (`github` DEV, `master` PROD), PSE Actions `ngocnhanvo/psevn-actions/main`. Code mode: `auto-build`.
- User screenshot from the PSE news category `Kiến thức nông nghiệp`: selected filter had blue background and dark-green label/icon with low contrast; dropdown also exposed WP default `Uncategorized`.
- Source fix `src/astro/pages/PostsPage.astro`: PSE-only green active filter `#17613f` with white label and icon, explicit `data-category-selected` and specificity higher than previous inherited PSE dark-green rule. Keeps normal white/unselected style and relative (nonsticky) toolbar. WordPress `Uncategorized` is hidden by slug/name only from filterCategories used to build public dropdown; raw `cates`, SSR category URL, breadcrumbs, posts and WP taxonomy remain intact.
- Focused source tests added to `src/lib/seo/psePostListingImages.test.ts`; independent no-build complete Vitest/Astro parser [#40152611470](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40152611470) **SUCCESS**.
- Astro [PR #45](https://github.com/ngocnhanvo/psevn-astro/pull/45) merged to `master` SHA `7358c5e23c7e8e36830913f0a2678a57771875b7`, `github` fast-forward synced to same SHA.
- Existing Playwright runner `scripts/pse-listing-toolbar-live-qa.mjs` extended to check selected real category URL `Kiến thức nông nghiệp`, selected filter computed text contrast ≥ 4.5, icon contrast ≥3, `Uncategorized` hidden from all/selected dropdowns, menu click interaction, existing screenshot and normal scroll behavior at 390/768/1440px. No CMS mutation.

## Release checkpoint when written
- WordPress/PHP Build Website [#40152731399](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40152731399) **SUCCESS** with nonce/lock/signed unzip; preflight `pending_count=0`, previously approved owner PHP exceptional build path only. No independent Astro Actions dispatch.
- Resulting signed Astro build/FTPS [#40152791739](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40152791739) **IN PROGRESS at checkpoint creation**. Check exact outcome; never retrigger build already running/successful.
- NEXT only after Astro deploy PASS: update `.pse-listing-toolbar-live-trigger` once to execute existing enhanced read-only mobile/tablet/desktop QA. If fail, inspect log and distinguish UI flaw/test assumption, then rerun only necessary focused QA. Save final tested statuses here.
- STATUS at writing: `SOURCE_READY=PASS`, `UNIT_CI=PASS`, `WP_BUILD_ACCEPTED=PASS`, `SIGNED_DEPLOY=IN_PROGRESS`, `LIVE_SELECTED_FILTER_QA=NOT_TESTED`.
