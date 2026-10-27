# PSE — WordPress news archive SSR API scheduling optimization (2026-10-28)

## Scope
- Owner-authorized long task: optimize public news SSR. Code mode: `auto-build`.
- Exact repositories: `ngocnhanvo/knowledge` main (rules read), `ngocnhanvo/psevn-astro` (Astro), `ngocnhanvo/psevn-actions` (CI/WordPress build/measurements). No PHP or MySQL modifications.
- Baseline investigation: [PSE_SSR_NEWS_API_DATABASE_LATENCY_2026-10-28.md](./PSE_SSR_NEWS_API_DATABASE_LATENCY_2026-10-28.md). Redirect optimization #106 was already finished and not repeated.
- Isolated candidate from Astro production `master` at `cdd25a67d0816e2ef9372970844fead810c04d9d`; development branch `github` diverged substantially from `master`. Did not merge unrelated commits.

## Source changes — DEPLOYED_PRODUCTION
- [Astro PR #107](https://github.com/ngocnhanvo/psevn-astro/pull/107) squash merged at `f448728b2588384ec9b21a400d3118c4a021bc29`.
- `src/pages/ssr/posts/[slug]/[page].astro`: **unfiltered** native archive loads full published WordPress category registry and 12 latest posts concurrently with `Promise.all`. **Filtered** native archive reads the authoritative validated category registry once, selects exact slug/ID locally, then fetches posts by native `categories=<id>`, removing redundant `/wp/v2/categories?slug=...` request.
- Kept existing unknown `catSlug` 404, legacy `?cat=...` 301, category ID, WordPress-sourced category SEO metadata, canonical URLs, pagination and legacy non-PSE listings; no cache/change-log/build architecture modifications.
- Updated source contract in `src/lib/seo/pseNewsCategorySsr.test.ts`.
- Full test caught **one stale test assertion** in media listing; it expected the now intentionally removed API call, not a runtime regression. [Astro PR #108](https://github.com/ngocnhanvo/psevn-astro/pull/108) changes only `src/lib/seo/pseMediaLibrary.test.ts` assertion, squash merged `62a92abc2f2c7b1910a7c72fb8bd161f8b0b4b3e`.
- Final production Astro master SHA: **`62a92abc2f2c7b1910a7c72fb8bd161f8b0b4b3e`**.

## Testing and official production release — PASS
- Targeted news SSR source regression + Astro parser [Actions #40568152377](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40568152377): **13/13 tests PASS**, parser PASS; NO BUILD.
- First complete master CI [#40568448835](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40568448835): **546/547** passed; only stale media-source assertion failed, fixed via PR #108.
- Rerun full production-source CI [#40568766912](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40568766912): **123 test files / 547 tests PASS**, source boundaries PASS, no website build in CI.
- Official authenticated WP/PHP **Build Website** [Actions #40568963424](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40568963424): signed unzip preflight PASS; PHP reports `pending_count=0`, accepted one owner-approved **force-once** through the normal WP nonce/capability/lock AJAX mechanism. Not a direct Astro dispatch.
- WP-generated Astro production build/FTP-TLS/signed staging+activation/smoke [Actions #40569122811](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40569122811): **PASS**, deployed exact master SHA above. PSE homepage, WordPress-backed SSR user API and robots/SEO root smoke PASS. Image/static delta reuse retained; sitemap unchanged. No PHP or DB writes.

## Live SSR TTFB evidence (runner-to-production, serial GET)
Previous read-only baseline [Actions #40563849404](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40563849404):
- `tin-tong-hop` 4073ms (one sample); `thong-tin-thi-truong` 3520/4025ms; `bao-cao-thuong-nien` 2890/2926ms; `thong-tin-co-dong` 2835/3034ms.
- WordPress categories registry 1295/1274ms; WP posts+embed 1595/1397ms.

Postdeploy #1 [Actions #40569481848](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40569481848):
- `tin-tong-hop` **2737ms** (HTTP 200); `thi-truong` **2335/2336ms** (200); `bao-cao` **8757/2282ms** (200); `co-dong` **2517/7337ms** (200).
- WP categories **1354/1313ms**; WP posts+embed **1466/1457ms**. Existing content page response byte sizes matched previously observed category samples.

Postdeploy #2 [Actions #40569889276](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40569889276), extended existing read-only audit to include the previously unmeasured unfiltered `/tin-tuc-su-kien`:
- **Unfiltered all-news SSR: 1592/1803ms**, HTTP 200; no pre-fix unfiltered baseline exists, so do NOT invent its percentage improvement.
- Filtered `tin-tong-hop` **2554ms** (200), `thi-truong` **8185/3258ms** (200), `bao-cao` **2172/2247ms** (200), `co-dong` **2209/2236ms** (200).
- WP categories **1250/1225ms**; WP posts+embed **1428/1311ms**.
- Postdeploy samples prove many category requests faster than baseline, and unfiltered route is around 1.6–1.8s in two samples. However **intermittent 7–9s spikes remain**, including `thi-truong` and other routes. Do **not** claim stable latency or percent reduction across all SSR traffic from these samples.

## Remaining/next work
- **NOT PROVEN:** MySQL as latency culprit; no SQL EXPLAIN/slow-query profile and WordPress REST timings include network/PHP/bootstrap/query/serialization.
- **NOT FIXED:** intermittent SSR latency spikes. Next investigate request-level timing and backend contention: categorize Node SSR local JSON reads, WP category REST, posts REST, mapping/transform and concurrency; capture correlated timings for spike vs normal, respecting logging/privacy. Consider PHP/DB profiling only with authorized observability and evidence.
- **NOT MEASURED:** a valid public article detail SSR URL. Prior diagnostic guessed `/bai-viet/<latest WP slug>` and got 404; archive scraper did not find a matching `/bai-viet/` anchor. First discover the **actual rendered public article URL** and confirm HTTP 200, then benchmark detail separately, before changing PHP-related queries.
- **NOT LIVE-TESTED:** invalid category 404 and legacy `?cat` 301 postdeploy, although source assertions preserved these branches. Could run bounded read-only route checks in follow-up.
- Do not rerun successful source tests/build/deploy without further source or content changes. Do not change WordPress schema/indexes, plugin-disable behavior, `_embed` post data, or cache strategy based only on the above timing samples.
- Return to precise checkpoint if later session resumes. Code mode: `auto-build`.
