# PSE — Tin Công ty / source Joomla ↔ WordPress/Astro — checkpoint 2026-11-27

## Scope
- Source Joomla: https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty.html
- WordPress taxonomy: `tin-cong-ty` ID `1742`; descendants `[1746,1747,1748,1749]`.
- Astro public target: https://pse.webnvn.com/tin-tuc-su-kien/tin-cong-ty
- Required archive semantic: **only posts assigned directly to category 1742**, exclude all descendants before WP pagination.
- Header native WordPress Menu Manager `Header/vi` ID1687 -> Tin tức root76995 -> Tin Công ty76996 -> **Tất cả ID83686 first**, then original children 76997..77000. No Astro hardcode.

## Completed and verified
- Astro production `ngocnhanvo/psevn-astro/master` commit `efe7af2f8c43d89ef5d2e40e5eeec1911d03fde5` added native REST categories_exclude and tests; signed production deployment [#45950334325](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45950334325) PASS, SSR postdeploy [#45950554268](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45950554268) PASS.
- Header native menu item `Tất cả` ID83686 created and confirmed FIRST, exact href /tin-tuc-su-kien/tin-cong-ty, original child IDs & URLs preserved; [#45950040371](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45950040371) PASS.
- Source Joomla original 10 pages read: 56 rows / **55 distinct titles**. WordPress total published posts **771** at audit; category1742 total including descendants **409**, direct-only **37** prior to Nov 2026 restoration. Evidence [#45951216521](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45951216521) and [#45951534765](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45951534765).
- Joomla 55 matching summary: 35 exact direct parent, 2 already in legitimate WP children, 1 older 2025 Joomla article `1658` already in WordPress as 2025 post ID77291 with changed title, and **17 distinct original articles absent by exact title** from all 771 published WordPress Posts. Old 2025 post ID77291 MUST NOT BE OVERWRITTEN.
- Exactly two recent originals: Joomla `1741` title 'Phú Mỹ Đông Nam Bộ tổ chức Lễ công bố và trao quyết định về công tác cán bộ', created 2026-11-16 (4 originals); Joomla `1739` title 'PHÚ MỸ ĐÔNG NAM BỘ: MỘT NGÀY THỨ BẢY ĐẦY Ý NGHĨA', created 2026-11-10 (5 originals). All 9 source JPEGs HTTP200, absent in native WP Media before restoration. Exact Joomla com_search created dates: [#45951419764](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45951419764). Guarded source and nine image preflight [#45951844642](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45951844642) PASS.
- **15 older original articles** omitted by prior Joomla migration; all IDs, original canonical URLs, com_search created dates checked. One 2025 similar title `1658` mapped existing WP77291. Provenance run [#45951948522](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45951948522) PASS.
- Machine-readable exact 15 older source IDs and 2 new originals: [`pse-company-missing-source-articles-2026-11-27.json`](./pse-company-missing-source-articles-2026-11-27.json). 15 older IDs: 1657, 1644, 1643, 1633, 1632, 1607, 1605, 1589, 1588, 1569, 1557, 1538, 1530, 1517, 1494.

## Pending
- The **guarded WordPress two-November-Posts/nine JPEG native restoration** was dispatched as [#45952078135](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45952078135). Do NOT declare published without run PASS and native Posts/Media REST readback. Built-in guard: dates+source ID+original image ordering, POST as draft then verify and publish, never overwrite 2025 post.
- The **15 older originals** require source-content/media inventory and guarded native WP restore. Do not assume imported merely because 804/804 old redirect URLs passed. Restore title, Joomla source created day and original image assets; preserve native taxonomy parent-only. Do not overwrite published existing Posts. No false DONE while these are pending.
- After all CMS writes, run normal PSE WordPress Build Website via `.pse-wordpress-build-request` (no force) then signed activation and live public article/category QA.
- Existing News taxonomy QA [#45950602929](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45950602929) passed company category in all three viewports (390,768,1440), failed an **unrelated** agricultural category active-link check; do not classify that as a company archive failure.

## Required final status
Current content parity is `PARTIAL` until the 15 older and 2 new originals are fully restored and verified on production.
