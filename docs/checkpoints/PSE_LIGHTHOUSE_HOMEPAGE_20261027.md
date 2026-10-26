# PSE Lighthouse homepage remediation — 2026-10-27

## Scope and baseline
- Source audit: desktop Lighthouse v13.5.0, 2026-10-26T17:36:28Z, public `/trang-chu`.
- Scores: Performance 100; Accessibility 94; Best Practices 100; SEO 69.
- Accessibility failures: date text contrast (4.24/3.51 to required 4.5); banner dots 10x10 touch area; back-to-top visible label not included in accessible name.
- Other non-weighted warning: BCT footer badge had no width/height.
- SEO failure: robots.txt `Disallow: /` blocks crawling; other weighed SEO audits already passed.
- Performance suggestions for later: image transfer size/cache, render blocking CSS; **performance already 100**, do not remodel cache/build or overwrite CMS images for Lighthouse alone.

## Implemented
1. Development `psevn-astro/github`: improve news date contrast to #4b695a (~6.06:1), make slider button clickable region >=28x28 while preserving visual dots.
2. Exact production branch patch PR [#95](https://github.com/ngocnhanvo/psevn-astro/pull/95) merged: commit `a3cb6a46f8b4e67c3f80ad6c9231e09ce3b58892`; additionally aligns Back-to-top label and adds audited BCT fallback 600x227 and `sizes=174px`.
3. WordPress-owned robots.txt updated **through native authenticated SEO Settings Save**, not hardcoded in Astro: changed exactly wildcard root `Disallow: /` -> `Allow: /`; all remaining rules, sitemap revision and llms unchanged. Read-after-write PASS.
4. Production build via WordPress PHP Build Website, owner-authorized one-time exception (not independent Actions dispatch), successful signed FTP deploy and GET-only SSR smoke.

## Evidence
- DEV full Vitest/Astro parser: `40371767253` PASS.
- Production-source full Vitest/parser: `40372475289`, `40372504675` PASS.
- Native WordPress robots Save: `40372166380` PASS.
- WordPress build request: `40372710300` PASS.
- Astro build/deploy: `40372851512` PASS, checked out exactly commit `a3cb6a46`.
- Homepage postdeploy smoke: `40373118577` PASS.
- Real desktop Lighthouse postdeploy job `40373166713` was queued when this checkpoint was recorded. **Do not claim a final 100 without measured job output**.

## Next action
Check GitHub Actions run `40373166713`; if failed, inspect job logs and `artifacts/pse-lighthouse/summary.json`, fix only remaining real regressions through PSE source/CMS owner, repeat source tests then WordPress/PHP build. If 100 for SEO/A11y, report measured actual and run link. Note that allowing crawling on the staging domain can expose it to search indexing; reverse robots policy at domain cutover as SEO strategy requires.

## Verified live Lighthouse desktop after deployment
- Run `40373166713` PASS: Performance **99**, Accessibility **100**, Best Practices **100**, SEO **100**.
- `robotsBlocked=false`, `failedActionable=[]`, public route `/trang-chu`.
- Performance was **100** in the user's earlier desktop report; one-point variation on a new runner is not by itself grounds for changing image/cache architecture.
- Repeat measurement requested through existing read-only workflow to check stability, with no second build or CMS mutation.

## Variance diagnostic — avoid false 100% guarantees
- Repeat desktop run `40373638237`: Performance 99 / A11y 100 / Best Practices 100 / SEO 100; no accessibility/SEO failures.
- Instrumented run `40374001222`: Performance 87 / A11y 100 / Best Practices 100 / SEO 100; FCP 1.245s, LCP 1.522s, TBT 0ms, CLS 0.0057, Speed Index 2.283s.
- User-provided run 2026-10-26T17:36Z: Performance 100 / A11y 94 / Best Practices 100 / SEO 69; FCP 0.385s, LCP 0.612s, Speed Index 0.495s. Same route, fundamentally different measured timing.
- Observed browser run variance drives performance 87–100. No fixed-performance-100 promise; no extra build, PHP change or cache bypass authorized solely by a changing benchmark. Browser metrics and image-cache audit may be considered separately if real-user Core Web Vitals are slow.
