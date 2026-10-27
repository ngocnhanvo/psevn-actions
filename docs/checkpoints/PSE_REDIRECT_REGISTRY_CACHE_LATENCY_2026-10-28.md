# PSE — 685 redirect registry cache latency improvement (2026-10-28)

## Request and scope
User measured WordPress incremental Astro build: redirects 10.233s (685 rules, 0 changed, logs), independent WordPress loads 10.243s, despite cache. Asked to inspect why cache still takes ~10s. This note is solely redirect build-time performance, **not frontend request SSR latency**.

## Root cause — proven from source
- PSE Astro source `src/lib/wordpress/cache.ts` -> `loadRedirects()` reads cached `redirects.json` and incremental WP change logs. When logs are empty, it still verifies the authoritative published registry to catch missing update/deletion events.
- `src/lib/wordpress/redirects/index.ts` -> `verifyRedirectRegistry()` issued GET `/wp-json/wp/v2/chuyen-huong-link?status=publish&per_page=100&page=N&_fields=id,modified` sequentially, one HTTP request per 100 redirects: **7 sequential pages for 685 published redirects**. Thus unchanged processed cache still required seven WordPress requests.
- No evidence indicates 685-rule JS processing or MySQL slow queries consumed those 10s. Verification is still necessary to avoid stale/deleted redirects if change logs are incomplete.
- The 10.233s is **Astro build-time data sync**, not a request-level delay added to every public SSR page load.

## Minimal code fix
- Isolated [PSE Astro PR #106](https://github.com/ngocnhanvo/psevn-astro/pull/106) merged into production `master` at SHA `cdd25a67d0816e2ef9372970844fead810c04d9d`.
- Only `src/lib/wordpress/redirects/index.ts`: obtain WP `X-WP-TotalPages` from first page, fetch remaining pages in bounded batches of **max three concurrent requests**, preserve 100-per-page size, full ID+modified registry validation, reject duplicates, fail closed on page-count drift, preserve incremental logs/cache/full-refresh-on-drift and WordPress-driven build/cache architecture.
- New regression `src/lib/wordpress/redirects/registry.bounded-concurrency.test.ts`: 685 records, seven pages, max-three concurrency, missing ID triggers full-refresh, mismatched page-count fails, duplicate IDs fails.
- Isolated non-build CI [Actions #40565659591](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40565659591): **23/23 tests PASS**, original redirect tests also PASS.

## Actual production build evidence
- Authenticated WordPress/PHP Build Website request [Actions #40565970708](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40565970708): PASS; one-time code-only build exception invoked through the official WordPress button/helper.
- Standard signed Astro production source build/FTP deployment [Actions #40566116549](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40566116549): **PASS**, source `master` SHA `cdd25a67d0816e2ef9372970844fead810c04d9d`, signed unzip and HTTP smoke PASS.
- Measured new log: `Redirect registry checked: { pages: 7, published: 685, maxConcurrentPages: 3, elapsedMs: 3504 }`; `Redirects xong trong 4.614 giây (685 rules, 0 changed, logs).`
- User's original build log: `Redirects xong trong 10.233 giây (685 rules, 0 changed, logs)`.
- Improvement: **10.233s → 4.614s (-5.619s, ~55% faster)**, WordPress independent parallel loads **10.243s → 4.624s (~55% faster)**.
- No data/redirect changes; 685 preserved; no WordPress PHP/DB changes; no frontend layout/SSR changes.

## Separate news SSR follow-up
- Independent [SSR/API/DB audit checkpoint](./PSE_SSR_NEWS_API_DATABASE_LATENCY_2026-10-28.md): published category routes SSR TTFB ~2.8–4.1s; WP category registry ~1.3s, posts REST embed ~1.4–1.6s, extra selected-category slug lookup (serial). These cannot be fixed by redirect build-time registry performance. SQL EXPLAIN and DB time were **NOT measured**, so do not state database is the cause.
- If asked to optimize SSR, make separately scoped fixes (remove redundant WP slug lookup via already loaded category registry, parallelize independent category registry and posts query) with test/SEO/category semantics preservation. Do not alter WP cache or DB indexes without evidence.

## Status and repeat guards
- **DONE**: root cause verified, source code minimally optimized, 23 tests PASS, merged, official WP-controlled production build/deploy PASS, real post-fix build timing measured.
- **NOT CHANGED**: category/article SSR code, database/schema, plugin stack, API contract and cache flags, WP content/redirect rules.
- Do not repeat build/merge/unit test solely on continued chat. Source only branch master SHA as above; if future changes check fresh state.
- Chế độ code: auto-build.
