# PSE — Four newest original Joomla Tin tổng hợp Posts, exact publication seconds and title (2026-11-28)

## Owner scope and source
- Owner requested sync newly visible Joomla category #101 Tin tổng hợp into native WordPress #1746, using **Joomla publish_up** (not created) exact to second and removing rendered “Các bài viết khác”, preserving 13 original JPEGs. Do not duplicate Posts.
- Verified source inventory: `docs/source/pse-tin-tong-hop-four-20261127.json`; source SQL provenance: `docs/checkpoints/PSE_JOOMLA_SQL_VERIFICATION_2026-11-27.md`.
- Joomla 1746 → WP 83843, publish_up 2026-11-27 09:52:48, 11 images.
- Joomla 1745 → WP 83845, publish_up 2026-11-26 08:50:00, 1 image; source created 2026-11-27 08:50:01 is NOT publication date.
- Joomla 1744 → WP 83847, publish_up 2026-11-27 08:24:52, 0 images.
- Joomla 1743 → WP 83849, publish_up 2026-11-27 08:05:27, 1 image.
- Guarded WordPress restore: Actions [#46034879038](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46034879038) SUCCESS; `PSE_TTH_FOUR_NATIVE_RESTORE_PASS=4_POSTS_13_ORIGINAL_JPEGS_EXACT_JOOMLA_SECONDS_NO_RELATED`.

## Archive SSR latency repair
- Prior WP categories REST with global Yoast `yoast_head_json`: ~72,220 ms versus posts ~1.5–2.6 s; archive could HTTP 500 under load.
- Astro master `086cdf36c9ca9cd5074d734b588cd68eacb472d6` requests lightweight category registry, selected term SEO separately. Source CI [#46042047515](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46042047515) SUCCESS 153 suites.
- Signed production Astro deploy [#46043809099](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46043809099) SUCCESS and SHA exact.

## Follow-up title parity repair
- Read-only production QA [#46045872332](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46045872332) found Joomla #1744 original title contains ASCII ` - `, while WordPress `title.rendered` uses en dash ` – `. HTTP200, exact seconds, 0/0 images, 1477 content chars and no related links were independently correct.
- PHP master `7d4cb9a7da85c286997fcf5e7195968de676cd05` adds **read-only** `pse_joomla_source_title` REST field for a published native Joomla-origin Post (returns raw stored `post_title` without global `wptexturize`), with five offline identity/security tests.
- Same existing PHP FTPS release workflow, **one-file SHA-pinned** [#46046760992](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46046760992) SUCCESS, 5/5 PHP tests PASS, checksum readback PASS, unchanged WordPress database. No alternative deployment pipeline.
- Astro master `1bcbf6953ba9a77b9376b8bfef86dc276e83ac58` picks source title only for `PostDetails` + valid Joomla origin, otherwise preserves normal rendered title. Full source CI [#46046608093](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46046608093) SUCCESS.
- Existing WordPress Build Website request [#46046979055](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46046979055) attempt 2 SUCCESS, then signed production deploy [#46047515701](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46047515701) attempt 2 SUCCESS; verified Astro source SHA `1bcbf6953ba9a77b9376b8bfef86dc276e83ac58`, `SIGNED_UNZIP_SUCCESS`. Attempt 1 failed only on transient WordPress REST connection before upload.

## Production acceptance
- Existing read-only browser QA `.github/workflows/pse-tin-tong-hop-four-live-qa.yml` checks WP count, archive count, all 4 exact original titles, publication seconds, content and absence of “Các bài viết khác”, and all 13 public optimized image GETs. It also compares the new WordPress source-title REST field against original Joomla title.
- Previous QA [#46044627919](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46044627919) proved articles 1746 and 1745 fully PASS on old Astro, including original 11+1 optimized photos. It then correctly detected #1744 typographic title mismatch; other runs intermittently timed out with WP REST or image proxy `ECONNRESET`.
- Current post-repair QA [#46047936903](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46047936903) was triggered read-only after signed deploy #236 and is **PENDING completion** at this checkpoint. DO NOT mark 4/4 live PASS without that real evidence.
- Additional FTP read-only Node/host inspection [#46045824363](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46045824363) SUCCESS: compiled server and public client files exist; it does not prove runtime/media reachability.

## Next action / hard stop
1. Fetch run #46047936903 status, job logs and artifact. If FAIL, classify exact WP REST, frontend HTML, title or image response; do not treat transient network timeouts as CMS data mismatches or suppress assertions.
2. On valid source/title mismatch, fix in owning WordPress/Astro source and use existing signed release workflows. Do not reimport 4 Posts/13 media.
3. On transient host timeout, use bounded read-only QA retry and/or diagnose runtime overload without a concurrent build. Full acceptance only after the four original pages and 13 images are verifiably live.
4. After validated PASS, change checkpoint status to DONE. Until then: **PARTIAL — live acceptance pending**, despite successful CMS import and signed deployments.
