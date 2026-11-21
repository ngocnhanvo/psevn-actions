# Latest ChatGPT response — pse.vn

Time: 2026-11-21 21:22 Asia/Ho_Chi_Minh
Project: pse.vn
Scope: Joomla original source -> native WordPress -> Astro production
Repo: ngocnhanvo/psevn-actions@main
Source branches: ngocnhanvo/psevn-astro@master, ngocnhanvo/psevn-php@master
Checkpoint: docs/checkpoints/PSE_SOURCE_CONTENT_PARITY_2026-11-21.md
Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất

## MOST RECENT VERIFIED SUCCESS — DO NOT REPEAT
- Joomla original article **#379** exact original RSS publication time `2013-07-03T02:10:17+07:00` independently proven after historical pagination. WordPress native Post **#82119** published with 479/479 source text and 5/5 source Media URLs, fresh Updraft backup, native readback PASS [#44911428019](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44911428019).
- Exact Joomla old URL -> Astro canonical **HTTP301**, target **HTTP200**, correct same-origin canonical; native WordPress `chuyen-huong-link` rule **#83503**, DB backup and readback PASS [#44912100132](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44912100132); production HTTP PASS [#44912586254](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44912586254).
- Authenticated WordPress Build Website -> signed Astro master / Python FTPS / activate / smoke-test [#44912356120](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44912356120) PASS. Current Astro source HEAD **e213d006**. No extra builds or code hardcodes.
- Final original Joomla #379 -> WP -> Astro [#44912815053](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44912815053) **SUCCESS**: 5/5 SHA-valid original files through WP and /api/files, 5 WebP optimized derivatives correctly identified and decoded by Chromium at **390/1440px**, body/title/canonical and no horizontal overflow. Earlier test-only failures from relative WP URL and .jpg->.webp matching were fixed. Article #379 is **DONE**.
- Full independent Joomla 804 source identities versus live WordPress [#44912343356](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44912343356) **SUCCESS**: 754 PUBLISHED_ID, 7 PUBLISHED_SLUG, 15 PUBLISHED_GALLERY, 1 PHOTO_GALLERY_NOT_PUBLIC, 2 NATIVE_PAGE, 5 NATIVE_PRODUCT, taxonomyMismatch=0. Native WordPress registry 758 published Posts, 53 Products, 25 Pages. The accounting groups overlap; never sum these as unique Posts.
- Seven additional published original Posts/46 photographs mobile+desktop source parity [#44912571563](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44912571563) SUCCESS. Other successful QA must not be rerun unnecessarily.

## ACTUAL REMAINING SOURCE BLOCKERS
- **12 ordinary Joomla articles** not public: seven Tin tổng hợp #186,#196,#198,#202,#237,#382,#1090; four agriculture usage guides #114,#121,#127,#178; market #341. Historical exact RSS date evidence newly recovered for all seven Tin tổng hợp missing-media identities, but media ownership/bytes still missing; never publish dates alone.
- Photo album #975: **110/110 original images preserved**, but Joomla RSS/Atom 2011 timestamp conflicts explicitly October 2013 event title; 7 Wayback snapshots cannot resolve actual source publication day. Preserve native media but do not publish fabricated date. Four-gallery aggregate QA [#44912571580](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44912571580) expected FAIL for #975 HTTP404; 1053/990/980 each individually passed mobile image/SEO. Do not claim total gallery PASS.
- Joomla #341 original articleBody empty (source HTTP200, but injected unrelated/unsafe surrounding text); three historical Wayback snapshots also empty. Two read-only RSS/Atom probes [#44913112426](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44913112426) and [#44913412457](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44913412457) completed SUCCESS as workflows, but **4/4 original category RSS/Atom variants timed out (HTTP null; 0 items checked)**. Source feed is **unavailable, not proven empty**. Do not retry same endpoints without new upstream evidence; retain source-data quarantine. Never copy another publisher's same-title story as original.
- Four unresolved legacy product-description aliases require verified semantic target mapping; never create duplicate WooCommerce products or arbitrary redirect.
- For unresolved articles, obtain Joomla original DB `#__content` rows + created/publish metadata, exact `images/` archives or trusted original publisher binary bytes. Recheck targeted ID only after proof; do not repeat failed archival variants. No WordPress/FTP modifications since the strictly scoped #379 recovery.

## NEXT ACTION
1. **No running PSE source audit is pending at this checkpoint.** #341 exact old-source feed returned four timeouts, not an article; preserve quarantine and do not retry without a changed condition.
2. Next independent action requires owner-provided Joomla historical DB `#__content` row(s), exact original media directory or credible byte/date provenance for missing IDs. Four ambiguous Product aliases need independently proven semantic destination mapping.
3. Only after actual original media/database/date evidence becomes available: fresh Updraft backup -> guarded exact single-record WordPress write -> readback -> existing PHP Build Website -> signed Astro production deploy -> source media/canonical/redirect QA. Do not trigger redundant build for documentation or audits.

Current entire-site `SOURCE_TO_TARGET_PARITY=PARTIAL`, while #379 is fully DONE.
