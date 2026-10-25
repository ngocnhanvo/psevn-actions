# PSE news dropdown stacking and missing-post image fallback — 2026-10-25

## Exact scope
- Source: `ngocnhanvo/psevn-astro` `github` DEV → `master` PROD.
- Execution: `ngocnhanvo/psevn-actions/main`; PHP release only via authenticated WordPress Build Website.
- Knowledge: `ngocnhanvo/knowledge/main`, mode `auto-build`.
- User screenshot: `/tin-tuc-su-kien/` category dropdown appeared behind transformed article cards, with broken image alt text flashing continuously on empty/invalid news thumbnails.

## Implemented and source-verified — do not duplicate
- News `PostsPage.astro`: the subheader remains nonsticky; the toolbar now uses `relative z-30` so the dropdown layers above transformed cards without pinning to viewport.
- New valid local PSE news image asset `public/images/posts/no-image.svg` (text: Chưa có hình ảnh).
- `PostsPage.astro`, `RelatedPosts.astro`, `Pse_01.astro`: use real CMS image when present; missing optional thumbnails use the local static asset. An actual load failure clears srcset/sizes, applies the local fallback **at most once**, and no longer loads absent `/placeholders/product.webp`.
- Preserved genuine WordPress media source URLs, image alt on valid pictures, source build failure guards for mandatory CMS assets. Did not edit CMS image records or PHP image pipeline.
- Focused Vitest `src/lib/seo/psePostListingImages.test.ts` and Astro parser added; Actions independent no-build [#40151478807](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40151478807) **SUCCESS**.
- Astro [PR #44](https://github.com/ngocnhanvo/psevn-astro/pull/44) merged to `master` SHA `d2e22fae0ae698f07f8374ddbb03bf9fadd5589a`; `github` fast-forward to same SHA.
- Enhanced existing Actions `scripts/pse-listing-toolbar-live-qa.mjs` to assert the news overlay's actual elementFromPoint over a card, local fallback HTTP/content type, and synthetic double error does not restart image load. Runs 390/768/1440 on both News & Products; accepts `position:relative` but rejects sticky/fixed and insists that toolbar scrolls off screen.

## Release gate at checkpoint write
- One WordPress PHP-controlled Build Website run [#40151637840](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40151637840) **IN PROGRESS AT WRITING**. Marker commit `4181c524` documents source change and PSE-owner-approved exception policy for subpages. Verify actual WordPress pending-count/lock and run conclusion before claiming deploy.
- DO NOT retrigger the PHP build or directly dispatch Astro Actions. Wait for the original `wp_trigger_build` downstream signed Astro run; verify exact `master` SHA, signed FTPS activation, SSR smoke, and success.
- After downstream deploy success, update `.pse-listing-toolbar-live-trigger` exactly once to run enhanced Chromium acceptance. Read-only browser QA; do not submit forms/modify WordPress. On failure inspect logs and distinguish real UI regression from test visibility assumptions.
- Declare independently `CODE_READY`, `SIGNED_DEPLOYED` and `LIVE_QA_PASS`; the latter two are **NOT yet confirmed at checkpoint writing**.

**Code mode:** auto-build.
