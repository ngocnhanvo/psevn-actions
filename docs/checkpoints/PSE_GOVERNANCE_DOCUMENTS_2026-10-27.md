# PSE — Tài liệu quản trị công ty — Migration checkpoint (2026-10-27)

## Exact scope, repository and public paths
- Original Joomla archive: `https://pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty.html`.
- New public archive: `https://pse.webnvn.com/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty`.
- WordPress taxonomy `tai-lieu-quan-tri-cong-ty`: category ID `1759`, parent `1744`.
- Existing PSE repo map: Actions `ngocnhanvo/psevn-actions` main; Astro `ngocnhanvo/psevn-astro` github (dev), master (production); PHP `ngocnhanvo/psevn-php` master. Policy source `ngocnhanvo/knowledge` main. Code mode `auto-build`.
- **No Astro source changes, PHP FTP deploy or Astro build were necessary.** All changes are WordPress data, via authorized serialized Actions and Playwright.
- State: `docs/pse-legacy-migration-state.json` is authoritative; do NOT overwrite it with an older run artifact or directly modify it outside its existing SHA-leased serialized worker.

## Completed and independently verified
1. Initial manifest from checkpoint: **21 original Joomla articles** in exact `/tai-lieu-quan-tri-cong-ty/<ID>-*.html` scope, originally 18 existing WordPress posts (6 marked imported, 12 previously draft in an older checkpoint) and 3 quarantined. Actual current WP publication status must prevail over stale checkpoint fields. Current read-only live audit found all 18 posts **PUBLISHED**, and 17 had native category 1759. Evidence: [governance audit #40521605999](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40521605999).
2. Tagged the only missing pre-existing post: original Joomla `1184`, WP `79439`, with native category `1759`. No body/date/status/document edits to any of the other 17 posts. [Apply #40521982802](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40521982802): `alreadyTagged=17, tagged=1, awaitingOriginal=3`, PASS, WordPress REST readback PASS.
3. Two original PDF notices exceeded the default 24MB importer limit and were quarantined. Provenance-restricted exception **only** for source `1664` 39,702,837-byte PDF and `1649` 28,360,845-byte PDF. Serialized importer validated exact original source URL, host, byte-length, MIME and `%PDF-` binary signature; uploaded WordPress media and created/published source-verified WordPress posts:
   - Joomla `1664` → WordPress post `82425`, 2026-01-29 source day.
   - Joomla `1649` → WordPress post `82428`, 2025-07-29 source day.
   - Job [#40521659022](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40521659022) PASS; checkpoint run `227`. Documents retained; **never treat large PDFs as broken images.**
4. Existing Joomla `1184` had percent-encoded Vietnamese WP slug `ngh%e1%bb%8b-quy%e1%ba%bft-v%e1%bb%81-vi%e1%bb%87c-ch%e1%ba%a5p-thu%e1%ba%adn-kh-kd-2016`. Public lowercase/uppercase/decoded URLs returned 404, despite existing WP `79439`. Audit [#40523214271](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40523214271) PASS. Applied **one-post slug-only** canonical correction `nghi-quyet-ve-viec-chap-thuan-kh-kd-2016` via [#40523509473](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40523509473), with WordPress REST and public HTTP 200 verification. Kept ID, content, taxonomy, date, status and document links unchanged.
5. Final read-only Playwright public QA [#40523816338](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40523816338): **20/20 posts HTTP 200 and body rendered; zero broken images, zero Joomla spam strings, no missing article body**. Joomla `1184` canonical URL verified HTTP 200, one original image and one PDF retained. Images on all 20 existing/public posts passed naturalWidth tests; **no need to delete a valid image**. The archive itself is HTTP 200 with correct H1.
6. In-place categorization code `scripts/pse-governance-documents-repair.mjs`, workflow `.github/workflows/pse-governance-documents-repair.yml`, exact authorized commit message `cms(pse): classify verified governance documents without changing article text`. Slug-only code `scripts/pse-governance-encoded-slug-repair.mjs`, workflow `.github/workflows/pse-governance-encoded-slug-repair.yml`, guarded message `cms(pse): repair verified governance encoded permalink without touching article body`. Public QA `scripts/pse-governance-public-images-audit.mjs`.

## Still not verifiable as complete
- Joomla source `376`, **Nghị quyết về việc phê duyệt đơn vị kiểm toán báo cáo tài chính năm 2013**, is quarantined in serialized state, reason `Source content incomplete or oversized`, no WP post ID. Do not publish only the title or replace an unsupported original resolution PDF; obtain source-provenanced body/attachment before importing.
- Separate read-only six-page source archive parity audit was started from `scripts/pse-governance-documents-repair.mjs` (commit `7643db89205125a5bf921af494dd2ce6156601c5`). **Before claiming full historical parity**, read log `PSE_GOV_SOURCE_ALL_PAGES` from the resulting workflow and compare the set of original IDs to this 21-ID checkpoint; source archive page 1 indicates multiple pagination pages. Any untracked IDs require source verification and a new bounded import plan, not a fabricated source record.

## Resume without repeating successful operations
- First check run statuses/logs for the latest governance audit, public QA and serialized import worker. Never rerun the already successful taxonomy and PDF imports.
- If original `376` source content and document are independently retrievable, import that record via the safeguarded existing serialized path, preserving text and mandatory PDF. Never invent publish date; use draft if no verified source date.
- If images actually fail in any future source, remove **only demonstrably broken optional images**, preserve editorial text and all live PDF/document links. Never remove the document itself, scanned report page, or a valid 49-byte GIF merely because its byte count is small.
- For any newly discovered original URLs, create grounded checkpoint records under the existing source-verified, SHA-leased worker process and check duplicates before CMS creation.

**Verified:** `WP_TAGGED=18/18`, `ADDITIONAL_PDF_IMPORT=2/2`, `PUBLIC_QA=20/20`, `BROKEN_IMAGES=0`, `NO_ASTRO_BUILD`. **Not yet proven:** `COMPLETE_SOURCE_PARITY` until all six legacy listing pages reviewed; `JOOMLA_376=QUARANTINED`.
