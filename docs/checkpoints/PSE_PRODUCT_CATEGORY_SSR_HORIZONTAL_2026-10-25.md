# PSE WordPress ProductCategory SSR cutover & horizontal catalog — 2026-10-25

## Request
- User screenshots: `/san-pham?cat=huu-co-phu-my` currently client-side cards with enormous vertical image and flattened descriptions; wants two products/row with image on left and specification on right (old Joomla exemplar) and SEO URLs grouped by WordPress ProductCategory. Product detail header/menu active mark appeared to disappear.
- Read general `ngocnhanvo/knowledge/main` including AGENTS/core and relevant UI, PHP Build Website, menu stacks; mode `auto-build`. Repos PSE Astro `github` DEV → `master` PROD, PHP `master`, Actions `main`. DO NOT use similarly named repos.

## Architecture and source (DONE)
- Native WooCommerce `product_cat` taxonomy is the **only** admin source for categories, IDs, name, slug, parent, category SEO metadata (Yoast). No duplicate taxonomy, no hard-coded category list in Astro.
- WordPress `esc-url-routing-manager.php` already has group routes `group:product-list`, `group:product-category`, `group:product-category-page`, product detail; no new routing mechanism added.
- SSR `src/astro/pages/ProductsSSRPage.astro`: 1 stacked card/row mobile, 2 horizontal cards/row from tablet, image left object-contain, product name and real WP excerpt on right, green CTA and toolbar nonsticky. CMS category selection renders public `/san-pham/<category-slug>` link and SSR per-category H1/SEO.
- `src/pages/ssr/products/[slug]/[page].astro` unknown category → 404 rather than duplicate all-products page; uses native CMS category membership, pagination, SEO title/description. Page branding `isPseBrandedPage` supports `ProductsSSRPage/ssr-products`. `Desktop.astro` active menu uses public `curUrl` instead of internal `/ssr/products/...` route.
- Full independent Vitest/parse run [#40161764563](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40161764563) **SUCCESS 90 test files / 396 cases** after changing old mobile layout test and preserving Builder category-heading contract.
- Astro PR [#47](https://github.com/ngocnhanvo/psevn-astro/pull/47) MERGED; `github` and `master` synced SHA `c2e32919d1429f9153013b508f1a754ace42c9c6`.

## WordPress management changes (DONE)
- WordPress preflight [#40161541094](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40161541094): Page `80968` old action `ProductsPage`, key `products`; six native Product categories and six menu query URLs to update; one legacy wildcard detail rewrite `81047` colliding with category URLs.
- Guarded CMS cutover script `scripts/pse-product-ssr-cutover.mjs` through existing Actions `pse-product-catalog-page.yml`, with before-values saved in artifact `pse-product-ssr-cutover-backup`. Apply [#40161904050](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40161904050) **SUCCESS**: WordPress Page 80968 now key `ssr-products`, action `ProductsSSRPage`; six header menu category links converted to public `/san-pham/<slug>`; legacy custom detail rewrite narrowed to product source numeric suffix, eliminating category collision. REST readback confirmed. No Product records or taxonomy terms created/deleted/modified.

## Deployment checkpoint
- WordPress/PHP authenticated Build Website [#40162063081](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40162063081) **SUCCESS**, pending CMS count 1, mode normal. One signed Astro production build/deploy [#40162129405](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40162129405) **RUNNING WHEN WRITTEN**. Do not trigger second build.
- Read-only Actions Playwright `scripts/pse-listing-toolbar-live-qa.mjs` extended for `/san-pham/huu-co-phu-my`: HTTP200, category title/canonical, real CMS cards, 2 horizontally arranged at 768/1440, responsive single-column 390, image to left of text, dropdown actual category links, normal scroll, Kebo Product details source parity and Vietnamese Header label. Wait for signed deploy PASS then execute once via `.pse-listing-toolbar-live-trigger`.
- Do not claim production LIVE-QA PASS before its actual run; if QA fails inspect log/screenshot and fix only the relevant error, follow normal WordPress PHP build if source changes.

Code mode: auto-build.
