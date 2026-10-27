# PSE — SSR news latency diagnostic: API vs database (2026-10-28)

## Scope and rules
- Read full `ngocnhanvo/knowledge` branch main AGENTS, core and stack docs and PSE Astro `AGENTS.md` and inherited build preservation policy.
- Investigation only: no Astro/WordPress source files edited, no PHP FTP deployment, no WordPress build. Temporary diagnostics exist **only in** `psevn-actions`.
- Published PSE site and backend were probed with bounded, sequential GET requests from GitHub Actions, not production DB access.
- Build mode: `auto-build`.

## Actual route and code facts

- `psevn-astro/master:src/pages/ssr/posts/[slug]/[page].astro`: `getCacheData` loads published JSON, `getCachePage`, then news archive calls `getAllPublishedWordPressCategories(WC_URL)`; when a category is specified it **then awaits** `getWordPressCategoryBySlug(WC_URL, categoryQuery)`; and then awaits `getPosts(...)`. With no selected category, category listing + posts also serialized.
- `psevn-astro/master:src/lib/wordpress/categories/index.ts`: registry fetch from `wp/v2/categories?per_page=100&page=N&hide_empty=false&_fields=...` (while perPage100 can paginate); extra selected-category slug lookup fetches separate `wp/v2/categories?slug=...`, even though registry already holds the slug and id.
- `psevn-astro/master:src/lib/wordpress/posts/index.ts`: `getPosts()` fetches 12 posts from native WordPress `/wp/v2/posts?_embed=true&status=publish...`, then maps via `getData()`, which may process SEO/body image data. Detail `getPost()` calls custom `/custom/v1/related-posts-by-slug?slug=...&relate=true`, maps current, related, previous, next, and language pages.
- `psevn-php/master:wp-content/themes/vibe-code-theme/inc/post/endpoint_post.php`: custom detail API does WordPress `postmeta` lookup by origin ID and product language, plus **three WP_Query** (related, older/newer) with category/date and `product_lang LIKE`, then `rest_do_request('/wp/v2/posts')` for all selected IDs; no direct query-profile/EXPLAIN data collected.
- `psevn-php/master:wp-content/mu-plugins/disable-plugins-for-api.php` already has optimized `default_content_group` route handling for WordPress posts, categories and custom related endpoint, excluding WooCommerce/utility/TablePress/github-trigger plugins. DO NOT claim that all plugins are loading unless actually proven.
- `psevn-astro/master:src/lib/wordpress/cache_dist.ts` reads `cms-common.json` and `cms-products.json` per SSR request; additional local overhead not separately benchmarked.

## Bounded live production timings (runner-to-origin)

[GitHub Actions #40563849404](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40563849404) **PASS**:
| Resource | TTFB observed (ms) | Response size |
|---|---|---|
| SSR /tin-tuc-su-kien/tin-tong-hop | 4073 | 109883 bytes |
| SSR /tin-tuc-su-kien/thong-tin-thi-truong | 3520, 4025 | 107377 bytes |
| SSR /tin-tuc-su-kien/bao-cao-thuong-nien | 2890, 2926 | 107197 bytes |
| SSR /tin-tuc-su-kien/thong-tin-co-dong | 2835, 3034 | 109668 bytes |
| WP category registry | 1295, 1274 | 36482 bytes |
| WP posts 12 with embed | 1595, 1397 | 65135 bytes |
| WP posts 12 minimal fields (different payload, no _embed) | 1164, 1173 | 1586 bytes |

- No cache-control, age, server-timing headers exposed in sampled requests, so cannot infer origin DB CPU or cache hits from these timings alone.
- **Main listing diagnosis:** several independent WP API calls (approx 1.3s + 1.5s and an extra slug lookup when category filter selected) are awaited **in series** during SSR. A multi-second backend HTML TTFB follows naturally. WP API latency includes HTTP transit, bootstrap, PHP, DB, serialization.
- Compare _embed (~65KB) vs minimal (~1.6KB) with 300–430ms extra response latency measured. Different payloads; not a controlled DB-only comparison. Removing `_embed` without auditing necessary image and metadata fields risks breaking UI.

## Details custom API measurements
[GitHub Actions #40564292306](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40564292306) **PASS**:
- WP single-post slug lookup TTFB 1450ms.
- WP custom related endpoint `relate=false` TTFB **1286/1279ms**, response 12,150 bytes.
- WP custom related endpoint `relate=true` TTFB **1555/1545ms**, response 64,002 bytes.
- The extra related data adds roughly 260ms in this sample; it contains 3 WP_Query and multi-post response conversion, **not solely DB overhead**.
- Test guessed public `/bai-viet/<newest WP slug>` and received **404**; that URL is NOT a valid detail SSR benchmark. Do not present its 660–679ms as detail performance evidence. Determine real public article path from published link before measuring detail SSR specifically.

## Next actions (do not redo successful tests)
1. High-confidence, low-risk Astro archive fix: eliminate **duplicate category-slug WP API** by selecting the category from the already validated full WordPress registry. For an unfiltered list, fetch registry and 12 posts **concurrently**. This is a source-level scheduling optimization; preserve status/404/301/SEO/category ID and JSON cache architecture. Independently test with fixtures and live SSR route QA.
2. Re-run **only targeted** archive SSR TTFB (3 sample paths) after an approved change/deployment through WordPress/PHP-native Build Website, never standalone Actions build. No DB migrations, indexes or plugin disabling without evidence.
3. If detailed posts remain slow, profile backend `WP_Query` and `$wpdb->queries` / MySQL slow query/EXPLAIN on authorized environment, compare same endpoint cold/warm. Check `wp_postmeta` origin language meta `LIKE` where used, SQL index selectivity; record query plan before proposing indexes.
4. For detail frontend use links **actually rendered** in archive, not guessed URL prefix. Verify 200 before treating timing as proof.

## Status
- **PASS:** code-path trace; backend route bootstrap policy; bounded read-only GET timing; API vs SSR relative latency diagnosis.
- **NOT TESTED:** true SQL time, WP object-cache performance, actual published article frontend detail TTFB, complete browser/network-waterfall.
- **NOT CHANGED:** production source, database indexes, API contracts, caches, builds, frontend layout.
- Code mode `auto-build`.
