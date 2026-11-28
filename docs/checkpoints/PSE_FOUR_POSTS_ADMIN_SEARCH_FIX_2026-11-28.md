# PSE — Four Joomla Posts WordPress Admin search repaired (2026-11-28)

## User-reported reproduction

WordPress Admin `Bài viết` search for “Thủ tướng Lê Minh Hưng: PETROVIETNAM 65 năm bồi đắp bản lĩnh, nuôi dưỡng khát vọng toàn cầu” yielded no rows. Direct WP REST and editor proved four native published Posts existed:

| Joomla ID | WordPress Post ID | Joomla `publish_up` local time | Source images |
| --- | --- | --- | --- |
| 1746 | 83843 | 2026-11-27 09:52:48 | 11 |
| 1745 | 83845 | 2026-11-26 08:50:00 | 1 |
| 1744 | 83847 | 2026-11-27 08:24:52 | 0 |
| 1743 | 83849 | 2026-11-27 08:05:27 | 1 |

## Root cause proved by live SQL (not inference)

Read-only protected Admin audit #46094635438 captured exact `WP_Query` SQL and metadata. Multilingual filter in `wp-content/mu-plugins/esc-multilingual-admin.php` kept `origin_page_id` only when absent, `''`, or `'0'`. ACF wrote an empty relationship as MySQL `wp_postmeta.meta_value='a:0:{}'`. Since this is none of those three values, the Admin `meta_query` excluded these four root Posts. Public REST (not using the Admin root list filter) nevertheless returned all four correctly. Prior attempt that cleared `origin_page_id` via ACF REST saved `a:0:{}` and the Admin still hid posts; this is what revealed the exact SQL defect. No data deletion occurred.

## Fix and production verification

1. `psevn-php/master` `b71bdd9b72c558be8951ff7e00172c14de368675` now treats exactly the serialized ACF empty array `a:0:{}` as a **root**, without exposing genuine translation children; `99af0ffd55aae8322fd4c97c744a8dbec5c8d1f5` expands regression tests.
2. Existing guarded PHP FTPS release #46094913853 **SUCCESS**: SHA-verified single-file deployment `esc-multilingual-admin.php`, no Astro build.
3. Independent Playwright Admin read-only audit **#46095066138 SUCCESS**, actual screen: search exact full title shows WP #83843, search the other three distinctive titles finds WP #83845/#83847/#83849. SQL search `PETROVIETNAM` now returns Posts 83843, 83847, 83849. The script requires **4/4** visible; its job genuinely passed.
4. Source ID metadata was separated: `psevn-php/master` `bbf7bbc59dcf2bc8453015dfb4f052a9ebf9c092` adds dedicated immutable `pse_joomla_source_id` with WordPress edit rights and updates `pse_joomla_source_title` to prefer it, falling back to historical IDs. This prevents the migration source ID from being interpreted as a WordPress translation-parent ID. Existing PHP single-file scoped release **#46095279755** PASS, source unit test 6 cases PASS.
5. Guarded WordPress metadata repair **#46095358937 SUCCESS**: fresh verified Updraft DB-only backup, four exact Post IDs updated with `pse_joomla_source_id=1746/1745/1744/1743`, each content/title/date/status/category/featured media preserved by read-after-write. Native Admin search PASS **4/4**, source REST title getter PASS **4/4**. No new Posts, no imported media changes.
6. Importer `psevn-actions/main` `af400c926fe842266f19a357d63d33f5685d14dd` now writes `pse_joomla_source_id` separately on future controlled imports, omitting ACF `origin_page_id` from create payload. Syntax checked; **no re-import was triggered**.
7. Temporary WordPress Admin SQL diagnostic added for investigation **was removed from PHP production**. Independent FTPS comparison read-only run **#46095566210 SUCCESS** proved both `esc-multilingual-admin.php` and `pse-legacy-article-seo-rest.php` installed SHA exactly match reviewed source, `pse-admin-query-diag` absent. Debug source code not active on production.

## Status

**DONE for the reported Admin missing-search issue**: 4/4 native Posts searchable by their titles, all exact Joomla `publish_up` local-second dates and 13 original media remain unchanged, Joomla source provenance is separate from multilingual root metadata, PHP checked on the live host, temporary diagnostic removed.

Separate larger Joomla→Astro image-proxy live parity and older historical date reconciliation are not claimed PASS here and were not re-imported or modified as part of this Admin repair.
