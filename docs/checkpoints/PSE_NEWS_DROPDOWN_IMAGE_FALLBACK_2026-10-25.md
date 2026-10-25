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

## Final release and acceptance — completed
- WordPress/PHP authenticated Build Website [#40151637840](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40151637840) **SUCCESS**, signed preflight PASS; CMS `pending_count=0`, mode `owner-approved-exception` per PSE checkpoint's previously approved one-time subpage build policy.
- Signed Astro production build, FTPS and release [#40151707639](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40151707639) **SUCCESS** from Astro `master` SHA `d2e22fae0ae698f07f8374ddbb03bf9fadd5589a`. Homepage utilities regression [#40151802207](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40151802207) SUCCESS.
- Final targeted Chromium/Playwright [#40151813266](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40151813266) **6/6 SUCCESS**: news `/tin-tuc-su-kien/` and product `/san-pham/` at widths 390/768/1440px. News dropdown computed toolbar `z-index=30`; actual element-from-point overlap above card **PASS** at 390px and 768px (desktop 1440 had no overlapping hit region inside viewport), remains `position=relative` and scrolls offscreen. News local SVG GET HTTP200, page handled twice-dispatched synthetic error once (srcset removed) at all three sizes; no repeated fallback error. Product page regression checks remained PASS; no production writes during live QA.
- `CODE_READY=PASS`, `UNIT_CI=PASS`, `DEPLOYED_PRODUCTION=PASS`, `LIVE_SCROLL/OVERLAY/IMAGE_QA=PASS`. Preserve code, avoid repeated saves, builds, or tests already successful.
