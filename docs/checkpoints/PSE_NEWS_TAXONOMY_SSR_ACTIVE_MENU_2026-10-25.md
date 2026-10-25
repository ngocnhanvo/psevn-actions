# PSE WordPress News taxonomy SEO SSR + active Header — FINAL 2026-10-25

## User requirement
News archive initially used `/tin-tuc-su-kien/?cat=tin-cong-ty`. Implement News category SEO-friendly SSR paths like Products, use existing native WordPress Post Categories as single CMS source, and highlight correct WordPress Header menu category on both category archives and detail Posts assigned to that category.

## Read governing rules / locked project
- General `ngocnhanvo/knowledge` branch `main` (AGENTS/README, CORE 01-08 and WordPress Header, WordPress/PHP build, UI, Actions stacks).
- Frontend `ngocnhanvo/psevn-astro`: `github` DEV, `master` production source.
- WordPress/PHP `ngocnhanvo/psevn-php`: `master`, unchanged code.
- CI/CMS/Playwright `ngocnhanvo/psevn-actions`: `main`.
- Code mode **auto-build**; Astro release ONLY through existing authenticated WordPress/PHP Build Website and signed FTPS, no independent Astro build and no forced exceptions.

## Source changes, completed
- Astro PR [#51](https://github.com/ngocnhanvo/psevn-astro/pull/51) **MERGED**, source `master` **`bf2041e8539db8e220276027eb1fabc8813b90be`**.
- `src/pages/ssr/posts/[slug]/[page].astro`: archive category request `catSlug` maps to actual WP term via `categories?slug=`, WordPress REST numeric Post filter `categories=<id>`, native 404 for unknown category, 301 old `?cat=<slug>` to canonical, per-category/page title/description/canonical. Never hardcode menu terms, site domains or Post assignments.
- `src/astro/pages/PostsPage.astro`: category dropdown renders canonical `/<news-archive>/<category-slug>`, pagination `/2`, preserve search UX, no client-side-only category SEO filter.
- `src/lib/wordpress/categories/index.ts`, `getData.ts`, `src/entities/Pages.ts`, `src/lib/seo/listingTitles.ts`: native WP term hierarchy, name, description and optional Yoast SEO title/description.
- `src/lib/stringUtils/menuTree.ts`, `src/astro/components/Layout/Header.astro`, Desktop/Mobile/branches: resolve active category from **WordPress Post `categories_detail` and WordPress Header tree**, with most-specific assigned linked branch; category pages use `aria-current=page`, Post detail uses contextual `aria-current=location`; preserve button click/tap, keyboard and nested menu handling.
- `src/lib/seo/pseBreadcrumbs.ts`, `src/astro/components/Layout/PseBreadcrumbs.astro`: News category/post breadcrumb links canonical SSR.
- Tests added/updated for SSR Post category and menu; 18 FE files changed in PR.
- Independent full no-build CI [#40173050727](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40173050727) **SUCCESS**: 92 files, **405/405 tests PASS** and compiler parser `PostsPage.astro`, `PostDetails.astro`, both SSR Post routes PASS. No build/FTP in CI.

## WordPress CMS — verified, source of truth, do NOT redo
- **Existing** archive WP Page ID **77030**, `slug=tin-tuc-su-kien`, ACF `key=ssr-posts`, `action=PostsPage`. Native 19 WordPress Categories; none reimported/created/deleted.
- Guarded native WP Routing Manager WordPress rule save via PSE Actions [#40172868035](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40172868035) **SUCCESS**, following read-only preflight [#40172709072](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40172709072):
  - ID **81056** regex category `^/([^/]+)/([a-z][a-z0-9-]+)/?$` → `/ssr/posts/$1/null?catSlug=$2`, priority **390**, condition `page_key` capture 1 = `ssr-posts`.
  - ID **81057** regex category-page `^/([^/]+)/([a-z][a-z0-9-]+)/([0-9]+)/?$` → `/ssr/posts/$1/$3?catSlug=$2`, priority **390**, same condition.
  - Published/readback PASS; existing Post detail and archive root routing unaffected.
- 18 existing taxonomy-backed WordPress Header custom URL fields synchronized from `?cat=<slug>` to canonical public URLs. Read-only preflight [#40172920635](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40172920635) **PASS**, native authenticated Menu Manager form save + ESC REST readback [#40173081084](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40173081084) **PASS**, preserving hierarchy, order, names and WordPress assignments. Spans company, library, agriculture and investor menus.
- No user-owned articles, Post content, taxonomy assignments, Product records, PHP routing architecture or hosting database modified.

## Official production release — complete
- WordPress/PHP Build Website [#40173451123](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40173451123) **SUCCESS**; `PSE_WP_BUILD_STATUS_CHECK=idle`, `PSE_WP_PENDING_CHANGE_COUNT=3`, `PSE_WP_BUILD_REQUEST_MODE=normal`; no force, no independent Astro dispatch.
- Signed Astro/FTPS build+activation+smoke [#40173508398](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40173508398) **SUCCESS**, verified `PSE_DEPLOY_COMMIT=bf2041e8539db8e220276027eb1fabc8813b90be`, `SIGNED_UNZIP_SUCCESS`.
- Homepage post-deploy read-only QA [#40173599302](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40173599302) PASS.

## Live public Chromium Playwright QA — complete
- Initial QA [#40173629015](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40173629015) failed **only** because the test incorrectly expected WordPress category name `Tin Công ty`; actual taxonomy name is **`Tin PVFCCo-PSE`**, whereas Header label is `Tin Công ty`. No source defect; URL/canonical were already correct. Test revised to compare actual WP H1 and category selector instead of imposing the Header label.
- Final real live browser [#40173886790](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40173886790) **SUCCESS 12/12**:
  - Viewports **390/768/1440**; 3 selected taxonomy category paths `/tin-tuc-su-kien/tin-cong-ty`, `/tin-tuc-su-kien/tin-tong-hop`, `/tin-tuc-su-kien/kien-thuc-nong-nghiep`.
  - All 9 HTTP 200 with exact SEO canonical and meaningful H1 from WordPress, no horizontal page overflow.
  - WordPress Header active category anchor confirmed on nested click-open menus (`aria-current=page`), including agriculture under Business Header, not News.
  - Actual Post `/pvfcco-pse-to-chuc-thanh-cong-giai-pickleball-pse-open-2026`: HTTP200 and source-assigned WordPress category remains active (`aria-current=location`) at all 3 viewports.
  - No writes or builds from browser QA.
- Supplemental focused read-only SEO routing [#40174101784](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40174101784) **SUCCESS 3/3**:
  1. Legacy `/tin-tuc-su-kien/?cat=tin-cong-ty` HTTP **301** → `/tin-tuc-su-kien/tin-cong-ty`.
  2. `/tin-tuc-su-kien/tin-cong-ty/2` HTTP **200**, correct page-2 canonical, WP category H1 and pagination current=2.
  3. Unknown `/tin-tuc-su-kien/pse-unknown-category-test` HTTP **404** (no false duplicate SEO catalog).

## Final state & resume hygiene
`WP_NATIVE_POST_CATEGORY=PASS`; `WP_NEWS_ROUTES_81056_81057=PASS`; `WP_HEADER_CANONICAL_18=PASS`; `SOURCE_MASTER_PR51=PASS`; `ASTRO_UNIT_405_OF_405=PASS`; `WP_NORMAL_BUILD=PASS`; `SIGNED_PRODUCTION_DEPLOY=PASS`; `LIVE_ACTIVE_HEADER_12_OF_12=PASS`; `LIVE_SEO_URLS_3_OF_3=PASS`.

**DONE.** Do not repeat taxonomy sync, native rewrite creation, test, merge, build, FTP or live QA in follow-up turns unless requested behavior/source/WordPress data actually changes. Last authorized deployed frontend source `bf2041e8539db8e220276027eb1fabc8813b90be`.

Code mode: auto-build.
