# PSE — Lighthouse 39 Header pages AFTER SEO/Accessibility optimization (2026-10-28)

## Scope and releases

- Baseline: [pre-optimization audit 78/78](./PSE_LIGHTHOUSE_ALL_HEADER_MENU_2026-10-27.md), original prior to CMS/semantic repairs.
- Post-optimization scan: [Actions #40549910858](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40549910858), **73 successful results**, 5 transient Lighthouse trace failures only; retry exactly those 5 on [#40550808779](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40550808779), **5/5 success**. Totals **78/78 valid measurements across 39 menu URLs × two devices**.
- IMPORTANT: full census occurred after normal WordPress-controlled deployment [#40549539533](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40549539533) but **before** final image intrinsic-size-only deployment [#40552782542](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40552782542). Interpret each result at its actual measurement time; do not imply another full 39-page scan occurred after the latter deployment.
- 39-page mobile averages: {"performance":"97.7","accessibility":"100.0","bestPractices":"100.0","seo":"100.0"}; desktop averages: {"performance":"97.2","accessibility":"100.0","bestPractices":"100.0","seo":"100.0"}. All 78 measurements had Accessibility/Best Practices/SEO = 100.
- Organization desktop was 88 (CLS≈0.223) during the full scan, **then separately repaired to 100 Performance and CLS=0** after the final deployment, verified [#40553290350](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40553290350). Do not rerun that already PASS test.

## All 39 paths — performance after first optimization deployment

| # | Menu route | Mobile P | Desktop P | A/BP/SEO |
|---:|---|---:|---:|---|
| 1 | `/trang-chu` | 99 | 99 | 100/100/100 |
| 2 | `/ban-giam-doc` | 100 | 100 | 100/100/100 |
| 3 | `/ban-kiem-soat` | 100 | 100 | 100/100/100 |
| 4 | `/dinh-huong-phat-trien` | 99 | 99 | 100/100/100 |
| 5 | `/duong-day-nong` | 100 | 100 | 100/100/100 |
| 6 | `/hoi-dap` | 99 | 100 | 100/100/100 |
| 7 | `/hoi-dong-quan-tri` | 99 | 99 | 100/100/100 |
| 8 | `/kenh-phan-phoi` | 100 | 100 | 100/100/100 |
| 9 | `/lien-he` | 99 | 93 | 100/100/100 |
| 10 | `/nganh-nghe-kinh-doanh` | 99 | 100 | 100/100/100 |
| 11 | `/qua-trinh-hinh-thanh-phat-trien` | 100 | 95 | 100/100/100 |
| 12 | `/san-pham/dam-phu-my` | 100 | 99 | 100/100/100 |
| 13 | `/san-pham/huu-co-phu-my` | 99 | 100 | 100/100/100 |
| 14 | `/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my` | 100 | 99 | 100/100/100 |
| 15 | `/san-pham/nhom-phan-hon-hop-npk-phu-my` | 99 | 99 | 100/100/100 |
| 16 | `/san-pham/nhom-san-pham-ure-nguyen-lieu-cho-san-xuat-cong-nghiep` | 100 | 100 | 100/100/100 |
| 17 | `/san-pham/phan-bon-sinh-hoc` | 99 | 100 | 100/100/100 |
| 18 | `/so-do-to-chuc` | 99 | 88 | 100/100/100 |
| 19 | `/tai-lieu-huong-dan-su-dung-phan-bon` | 99 | 99 | 100/100/100 |
| 20 | `/tam-nhin-su-menh` | 100 | 100 | 100/100/100 |
| 21 | `/thanh-tuu` | 100 | 100 | 100/100/100 |
| 22 | `/thong-diep` | 99 | 99 | 100/100/100 |
| 23 | `/thong-tin-tai-chinh` | 100 | 100 | 100/100/100 |
| 24 | `/tin-tuc-su-kien/anh` | 93 | 94 | 100/100/100 |
| 25 | `/tin-tuc-su-kien/ban-cong-bo-thong-tin` | 94 | 95 | 100/100/100 |
| 26 | `/tin-tuc-su-kien/bao-cao-tai-chinh` | 95 | 95 | 100/100/100 |
| 27 | `/tin-tuc-su-kien/bao-cao-thuong-nien` | 96 | 95 | 100/100/100 |
| 28 | `/tin-tuc-su-kien/dang-uy` | 95 | 95 | 100/100/100 |
| 29 | `/tin-tuc-su-kien/hoat-dong-chi-bo-hdqt-bks` | 95 | 94 | 100/100/100 |
| 30 | `/tin-tuc-su-kien/hoat-dong-cong-doan-doan-tn-nu-cong` | 93 | 93 | 100/100/100 |
| 31 | `/tin-tuc-su-kien/huong-dan-su-dung-phan-bon` | 95 | 95 | 100/100/100 |
| 32 | `/tin-tuc-su-kien/phan-biet-va-chon-mua-phan-bon` | 96 | 96 | 100/100/100 |
| 33 | `/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty` | 95 | 95 | 100/100/100 |
| 34 | `/tin-tuc-su-kien/thong-tin-co-dong` | 96 | 96 | 100/100/100 |
| 35 | `/tin-tuc-su-kien/thong-tin-quan-tri` | 96 | 96 | 100/100/100 |
| 36 | `/tin-tuc-su-kien/thong-tin-thi-truong` | 94 | 95 | 100/100/100 |
| 37 | `/tin-tuc-su-kien/tin-tong-hop` | 93 | 94 | 100/100/100 |
| 38 | `/tin-tuc-su-kien/video` | 96 | 96 | 100/100/100 |
| 39 | `/xu-ly-khieu-nai-y-kien-khach-hang` | 99 | 100 | 100/100/100 |

## Homepage desktop specifically: why not 100?

- Full 39-page scan desktop: **Performance 99** at FCP 0.629s, LCP 0.813s, TBT 0ms, CLS 0, Speed Index 1.274s; mobile P=99.
- **Focused new desktop post-final-deployment measurement** [#40555160161](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40555160161): **Performance 97; Accessibility=100; Best Practices=100; SEO=100**. FCP 607ms (score .99, weight 10), LCP 791ms (.98, weight 25), **Speed Index 1,780ms (.72, weight 10)**, TBT=0ms, CLS=0. The weighted loss from SI alone was **2.8 unrounded score points**; LCP 0.5, FCP 0.1. Score variability comes mainly from visual completion/SI, not CPU blocking or layout shift.
- Additional Lighthouse diagnostic signals on latest homepage: render-blocking CSS assets `/_astro/Layout.CHV3kW1M.css` and `/_astro/compiler.Bh26A3SS.css`; image-delivery potential savings ≈129KiB (featured news photo ~81KiB, a carousel image ~27KiB, logo ~24KiB); unused CSS estimated ~46KiB; total resource weight ~1,981KiB. These are **opportunities**, not direct proof each will raise the score a fixed number.
- Current `src/astro/tablepress/Home_00.astro` already uses `loading=lazy` for noninitial slide images, but `source srcset` is emitted for all carousel slides and Lighthouse lists later carousel WebPs among the largest network requests. Further deferring image fetch must preserve image content/SEO, Visual Builder preview, accessibility, breakpoint handling and autoplay. **No frontend CSS/markup/runtime changes made in this investigative request**; never remove banners or reorder layout just to hit 100.
- Diagnostic-only Changes in `psevn-actions` script: [code commit `6b1cb50a`](https://github.com/ngocnhanvo/psevn-actions/commit/6b1cb50a78846545abe451ba9eea888236f2ecba), [trigger commit `4b56e3d5`](https://github.com/ngocnhanvo/psevn-actions/commit/4b56e3d56beb06a261e557b56ce89fd95496a3cd). No Astro build triggered by this investigation.

## Conclusion and checkpoint

- **DONE:** all menu post-opt scores retrieved; Homepage desktop cause diagnosed to Speed Index and visually above-the-fold resources; accuracy caveat: lab scores vary with run load/network/cache.
- **NOT DONE:** no changes or redeploy of homepage frontend to chase a volatile 100; no repeat of 39-page audit needed merely to explain scores.
- Code mode: `auto-build`. If further authorized for fixes, change only source-owned responsive image delivery/CSS with isolated tests/visual QA, merging validated Astro PR and deploying exclusively through authenticated WordPress/PHP Build Website, retaining cache architecture and layout.
