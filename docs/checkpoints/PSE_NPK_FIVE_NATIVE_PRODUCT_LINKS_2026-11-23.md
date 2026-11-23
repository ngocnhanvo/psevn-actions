# PSE NPK Phú Mỹ — 5 remaining image links and four native Products — 2026-11-23

## Scope
PSE source Joomla NPK original historical article #1434; existing WordPress Page ID 83593 (/npk-phu-my) and Astro production (ngocnhanvo/psevn-astro master). Write scope: four missing native WooCommerce Products and five missing links inside Page 83593 only. Keep 20 original images, CSS More, product data and other Pages unchanged.

## Verified source and matching
- Existing product for original Page row 16 (code 05395, NPK Phú Mỹ 16-6-19+TE, K2O 19%): **WordPress ID 80958**, slug `npk-phu-my-16-6-19-te-1683`. Distinguish ID 80976: duplicate title/code but an inconsistency in its detailed table (K2O 9% versus 19% in its excerpt); deliberately did not update or link 80976.
- Original Page row 3 (code 05412, NPK 16-7-16): newly published native Product ID **83649**, slug `npk-16-7-16-05412`, original native Media ID 83576.
- Original Page row 12 (code 00066, NPK Phú Mỹ 16-16-8+5S+TE): newly published ID **83650**, slug `npk-phu-my-16-16-8-5s-te-00066`, Media ID 83584.
- Original Page row 13 (code 00063, NPK Phú Mỹ 16-16-8+9S+TE): newly published ID **83651**, slug `npk-phu-my-16-16-8-9s-te-00063`, Media ID 83585.
- Original Page row 14 (code 00062, NPK Phú Mỹ 16-16-8+10S+TE): newly published ID **83652**, slug `npk-phu-my-16-16-8-10s-te-00062`, Media ID 83586.
- All four WordPress Media files existed and matched original Page image bytes; no duplicate upload. Product category 1764 (Nhóm phân hỗn hợp NPK Phú Mỹ). Product descriptions came from original imported Joomla NPK Page cell HTML; no invented price.

## Evidence and execution
- Read-only source and media audit: [Actions #45207403402](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45207403402): PASS, 3896 native Media scanned, four genuine missing products, exact original image SHA checks.
- Fresh Updraft WordPress DB backup + four native products published + Page 83593 five image links updated, read-after-write: [Actions #45208496944](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45208496944) PASS; 4 product IDs above.
- Existing WordPress PHP Build Website pending=5, normal request (no force): [Actions #45210040130](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45210040130) PASS.
- Astro production pipeline signed build, deploy & smoke: [Actions #45210153483](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45210153483) SUCCESS.
- Independent Playwright production QA: [Actions #45210691451](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45210691451) SUCCESS:
  - Page has exactly 20 original product images and 20 internal native product links; zero external old-site anchors, zero unlinked images.
  - All 20 native product detail URLs return HTTP 200 and contain H1.
  - Four newly published products' details contain matching exact source code 05412, 00066, 00063 and 00062.
  - Responsive NPK layout test at 1440, 1240, 768, 390px passes without viewport overflow and without damaged product tables.
  - Other two text related links remain internal.

## Decision
**DONE** for all five missing links: four verified products created, one verified existing product reused. Existing duplicate Product 80976 remains unchanged and its inconsistency is a separate data-quality audit, not part of this link-completion scope. No further NPK media/product import is needed for this cohort.
