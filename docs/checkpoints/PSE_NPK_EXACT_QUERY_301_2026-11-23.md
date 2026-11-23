# PSE NPK Phú Mỹ — 19 exact query Joomla 301 redirects — 2026-11-23

## Scope and intent
Owner requested all NPK variant old Joomla links redirect to native published Product details. Target runtime host: `https://pse.webnvn.com`. The legacy `pse.vn` server and DNS are **not changed**, because 301 rules on the new Astro hostname do not configure the old server.

## Original source-backed mapping
Original Joomla source article 1434 contains 20 product image slots; image slots 19 IDs use `/hoat-dong-kinh-doanh/san-pham/npk-phu-my.html?id=<id>`. These 19 source IDs were verified against the 20 original product rows on migrated WordPress Page 83593, and each native WordPress Product detail HTTP 200/H1. Existing original article alias `/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/1434-npk-phu-my.html` already redirects 301 to `/npk-phu-my`, **intentionally preserved** and not misdirected to the row 7 product.

19 exact query source IDs:
1436,1435,1482,1438,1440,1442,1446,1449,1451,1455,1459,1460,1461,1462,1463,1464,1465,1483,1484.

## Implementation
- Use existing WordPress `chuyen-huong-link` CPT native redirect registry; each record has `from_link=/hoat-dong-kinh-doanh/san-pham/npk-phu-my.html?id=NNNN`, `to_link=/san-pham/<verified-product-slug>`, `type=301`, `match_type=Exact`, `enable=true`, published.
- Astro already supports query-aware Exact redirect matching in `scripts/redirect-rules.mjs`: `splitRuleSource`, `exactQuery`, `matchesQuery`, and removes only required `id` from any remaining query string. No Astro/PHP code change was necessary.
- Guarded writer `scripts/pse-npk-19-query-301.mjs`, `.github/workflows/pse-npk-19-query-301.yml`; independent read-only QA `scripts/pse-npk-19-live-301.mjs`, workflow `.github/workflows/pse-npk-19-live-301.yml`.

## Verified evidence
1. Read-only preflight [#45213569061](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45213569061) PASS: 19 source/target identities unique, zero existing/conflicting WordPress records, 19 Product targets HTTP200/H1, original Joomla article alias still 301.
2. Fresh Updraft DB-only backup and WordPress guarded apply/readback [#45213976830](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45213976830) SUCCESS. Log `PSE_NPK_19_301_SAVED=PASS count=19 needsAstroBuild=true`, newly created CPT IDs **83654–83672**, exact source query paths each to correct Product.
3. PHP authenticated normal WordPress Build Website [#45215084554](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45215084554) SUCCESS, pending_count=19, no force.
4. Signed Astro production build and deployment [#45215225209](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45215225209) SUCCESS.
5. Independent Chromium live QA [#45215574756](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45215574756) SUCCESS: 19/19 **HTTP301** exact root-relative Location to correct native Products; every target HTTP200 with canonical and H1; original article 301 retained; unknown `id=999999` and missing `id` are not captured.

## Final status
**DONE for all 19 Joomla ?id= URLs requested on the new Astro hostname** and preserved original article 301. No original `pse.vn` webserver redirect was applied; separate legacy-host changes are required if owner wants visitors entering `https://pse.vn/...?` itself redirected.
