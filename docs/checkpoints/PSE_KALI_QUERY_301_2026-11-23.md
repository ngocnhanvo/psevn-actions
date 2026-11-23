# PSE Kali Phú Mỹ — Original Joomla 1425/1427/1430 exact query 301 and source 1430 Page — 2026-11-23

## Scope
Owner authorized restoration of original Joomla Kali Bột MOP #1430 as a WordPress native Page, repair two links on existing native Page #83572, and query-aware 301s on new Astro production host `https://pse.webnvn.com`. Do not claim rules were installed on the legacy `pse.vn` server.

## Original-source and target evidence
- Original Joomla #1430 title: `Kali Phú Mỹ Bột MOP - Mô tả và HDSD`, original source `https://pse.vn/index.php?option=com_content&view=article&id=1430`, exact source hash/full-body hash and 2 original tables independently verified by Actions #44993780995.
- Original detail image `5-KALI-BOT_Phu_My_2019_cai_tien.png`, SHA256 `9e5bb2132889c5ac07a9562b055c7c0971facd254412111a411c877e5f3bea86`; the original overview illustration and historical detail image are distinct.
- Read-only CMS preflight #45220040010 confirms 1427 Product #80938 HTTP200 and #1430 lacks a native Page/Product before repair. Parent Page #83572 has old-site links.

## Native CMS restoration
- Guarded workflow/script: `.github/workflows/pse-kali-1427-1430-native-repair.yml`, `scripts/pse-kali-1427-1430-native-repair.mjs`. Runs only with exact owner-approved commit message and fresh Updraft DB-only backup. The prior failed attempts stopped safely; a media upload on one failed run was verified and reused idempotently without duplication.
- Final native apply [#45223471453](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45223471453) PASS with exact REST readback:
  - New native WordPress Page **#83674**, `/kali-phu-my-bot-mop-mo-ta-va-hdsd`, published with original source text, 2 tables and source-original PNG.
  - Existing WordPress Page **#83572**: two decorative image anchor links repaired from `pse.vn` to new-site native destinations, preserving images and text.
  - Three native published `chuyen-huong-link` CPT records, `Exact`, `301`, `enable=true`:
    - #83677: `/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html?id=1425` → `/kali-phu-my-bot-canada-mo-ta-va-hdsd`
    - #83678: `/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html?id=1427` → `/san-pham/kali-phu-my-mieng-mop-1427`
    - #83679: `/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html?id=1430` → `/kali-phu-my-bot-mop-mo-ta-va-hdsd`

## Production release and independent QA
- Existing signed, authenticated normal WordPress Build Website [#45224035253](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45224035253) PASS, `PSE_WP_PENDING_CHANGE_COUNT=5`, no force.
- Astro master production build and Python FTP-TLS signed activation [#45224197141](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45224197141) SUCCESS.
- Independent Chromium read-only QA [#45225252050](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45225252050) SUCCESS:
  - 3/3 exact Joomla query URLs return HTTP **301** and their precise targets HTTP **200** with H1/canonical.
  - Parent Page #83572 returns 200 and both corrected anchors point to the new-site native destinations.
  - #1430 Page returns HTTP 200, exact canonical, 2 tables, original-media image decoded; responsive desktop 1366px/mobile 390px overflow 0.
  - Invalid IDs `999999`, `0`, `1431` remain **404**, not redirected.
  - QA is read-only and never performs CMS mutations.
- Test script `scripts/pse-kali-1427-1430-live-qa.mjs`; workflow `.github/workflows/pse-kali-1427-1430-live-qa.yml`.

## Status
**DONE** for owner-requested Kali #1425/#1427/#1430 original query redirects, native #1430 source Page and Page #83572 anchor fixes on the **new** Astro production hostname. Legacy-host `pse.vn` redirect server configuration remains outside this scope. Overall Joomla migration parity is tracked separately.
