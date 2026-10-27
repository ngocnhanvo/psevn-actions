# PSE Báo cáo thường niên — migration checkpoint (2026-10-27)

## Scope and routing
- PSE old archive: `https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-thuong-nien.html`.
- New public archive: `https://pse.webnvn.com/tin-tuc-su-kien/bao-cao-thuong-nien`.
- Actual URLs from the user's message govern; the visible Markdown link text was stale.
- Exact source repos: `ngocnhanvo/psevn-actions` main, `ngocnhanvo/psevn-astro` github/master, `ngocnhanvo/psevn-php` master. Policy: `ngocnhanvo/knowledge` main. Code mode: auto-build. **No independent Astro build, no FTP deploy** in this workstream.
- Persistent authoritative per-ID state: `docs/pse-legacy-migration-state.json`, maintained by serialized `pse-legacy-article-import-queue.yml`; never overwrite it from a parallel job.
- Migration preflight `backup_verified=true` from existing audited Updraft backup; never treat this as permission to delete source assets.

## Verified results, do not repeat
1. Source article IDs exactly `998,999,1000,1041,1042,1043,1092,1188,1259,1307,1353,1386,1412,1511,1546,1578,1625,1667` (18 originals, years 2008–2025).
2. Original inventory: 8 imported, 2 draft because publication day unverified, 8 quarantined. The original `1018` search result is **not** in this annual archive.
3. Existing ten WordPress articles have source-verified native child category `bao-cao-thuong-nien`, WordPress ID `1758`: source IDs `999,1041,1307,1353,1386,1412,1511,1546,1578,1625`. Keep original post IDs/slugs/status; particularly `1041=WP 78153` and `1546=WP 77142` remain DRAFT pending date; do not make duplicate articles or invent dates. Evidence importer Actions [#40505823369](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40505823369) and [#40506078948](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40506078948).
4. Annual 2025 `1667`: verified 33,341,195-byte PDF uploaded as WordPress Media `82290`, original document linked, post `82291` published with independently verified 2026-04-02 source day. Evidence [#40506398552](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40506398552). Do **not** discard PDF as a broken image.
5. Four reports `1042,1043,1188,1259` originally blocked by `49-byte gif`. Those GIFs have a **valid** image signature/content-type; do not delete them on byte-length alone. Valid-GIF exception only for four exact source IDs, same-origin/signature checked; WordPress media migration is progressing through serialized small batches. First audited batch [#40507032810](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40507032810) uploaded 24 media, records remained `media` status at run=222; **not yet completed/post-published** at this checkpoint. Source code fix for repeated batches: commit `db86f32bec0f950ef2cc6bbdd8d87922270afd67`.
6. Read-only public QA [#40507423588](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40507423588): new archive HTTP 200; H1 Báo cáo thường niên; no broken <img> elements among completed images.
7. Source-specific audit [#40507786340](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40507786340): 2008 (`998`) is a booklet containing **94 JPG image elements**; 2010 (`1000`) a booklet with **130 JPG image elements**. Image pages are substantive report content: never replace all with placeholder/text. Original article HTML includes JavaScript and unrelated foreign-host anchors; do not copy script/spam links into CMS. These require a separate source-verified, sanitized and bounded media-gallery importer, NOT the generic plain-text article path.
8. 2014 `1092` text is an abbreviated disclosure with original document link `https://www.pse.vn/images/web/news/qhcd/ThongTinCongBo/BCTN2014`; independent HEAD returned **HTTP 404**, evidenced [#40508317036](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40508317036). Do not present it as an accessible report or synthesize a PDF. Preserve the original disclosure text in any future draft; find a verified original report file before publishing.
9. Existing code path naturally renders public archive from WP taxonomy `category=1758`, so frontend hardcoding or rebuilding Astro is not needed for CMS imports.

## Additional media audit and bounded continuation
- Verified [#40508897325](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40508897325): four reports blocked by a 49-byte GIF are actually booklets with many substantive pages:
  - 2012 source `1042`: 26 JPG, 26 GIF.
  - 2013 source `1043`: 26 JPG, 26 GIF.
  - 2015 source `1188`: 33 JPG, 33 GIF.
  - 2016 source `1259`: 32 JPG, 32 GIF, 1 PNG and 1 PDF.
  These images cannot all be dropped without destroying the report. 49-byte valid GIFs are retained; WordPress media attachments are imported in source order using the idempotent serialized queue.
- Batches 222 and 223 already uploaded 48 report media, with zero duplicate WordPress article creation. Four source IDs remained at `media` in batch 223. See [#40507032810](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40507032810) and [#40507969642](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40507969642).
- Importer commit `e4f6556a66d800dfb4e18ec4705d9fefb8d5d3ed` increases **only these four verified annual booklet media** from 6 to 12 sequential files per record/batch within existing 14-minute safety budget; all other posts remain at 6. No parallel WP uploads.
- After the current running/queued job completes, confirm that each source is actually in `imported` or `draft_needs_date`, with verified WordPress post ID and exact media readback. Upload success alone is not publication success.

## Resume procedure (do not duplicate)
1. **First check existing run(s)**: [#40507969642](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40507969642) was in progress and [#40508185351](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40508185351) queued/pending at the time of this note. Verify current runs and statuses, and read actual importer logs and checkpoint; do not manually dispatch while the serialized runner is active.
2. Continue upload of the four GIF reports from `media` status and verify publication, native category, no duplicate slug, original body text/media link read-after-write. Any WP timeout: inspect logs and checkpoint before retry.
3. Handle 2008/2010 by a separate bounded media-heavy importer with sanitization and verified source images; 2014 requires restoration/provenance of unavailable original document; drafts 2011/2022 require independently verified source publish date. Do not make up dates, replace legal reports, or delete mandatory documents.
4. After CMS changes, repeat independent read-only QA on the public archive, category counts and exact published years; check article body image/PDF links. No Astro code/production build unless real frontend changes require PHP/WordPress-authorized Build Website.

**Status:** `DATA_PARTIAL` / `CATEGORIZATION_PASS` (10 original WordPress articles) / `2025_DOCUMENT_IMPORT_PASS` / `LIVE_ARCHIVE_HTTP_PASS` / `FOUR_GIF_REPORTS_IN_PROGRESS` / `2008_2010_2014_UNRESOLVED`. Code mode: auto-build.

## 2026-10-27 evening — visible Joomla spam / gallery regression fixed

User screenshot proved live 2012 post `/bao-cao-thuong-nien-2012` displayed Russian external spam and Joomla plugin fallback text instead of annual report scanned pages, although WordPress already held all image media. **This was a data content/parsing error, not missing media or Astro rendering architecture**.

- Safeguarded audit [run #40515244396](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40515244396): source/target identity, annual taxonomy ID 1758, 117 original JPG scan pages plus one 2016 PDF, WP-owned media, direct `/api/files/wp-content/uploads/...` GET and JPEG signature passed; all four existing WordPress article HTML blobs contained injected spam. Audit performs no writes.
- Exact-authorized WordPress cleanup [run #40515608281](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40515608281) **PASS / WP read-after-write PASS**: repaired `1042`/2012 → WP `82405` (26 JPG), `1043`/2013 → `82396` (26 JPG), `1188`/2015 → `82414` (33 JPG), `1259`/2016 → `82410` (32 JPG and one PDF). Total **4 repaired, 117 JPG, 1 PDF**. Removed contaminated legacy Joomla markup and external spam, retained verified document scans and descriptive accessible image captions, rewrote excerpt/SEO from factual title and scan count; preserved original post status, slug, date, categories. No duplicate post, no Astro build, no PHP FTP deployment.
- New guarded importer/repair source: `scripts/pse-annual-booklet-cms-repair.mjs`, workflow `.github/workflows/pse-annual-booklet-cms-repair.yml`, trigger `.pse-annual-booklet-repair-trigger`. It is **idempotent** and only mutates on commit message `cms(pse): repair source-verified annual booklet pages and remove injected spam`; ordinary pushes audit without writing. Repair commit `59959c1d02bd7426415905b36183b93f03187357`.
- Browser QA under independent read-only workflow `.github/workflows/pse-annual-booklet-live-qa.yml`, [run #40516129326](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40516129326) was queued/in progress when this checkpoint was authored. **Check its final result and screenshots before reporting live-visual PASS.** It asserts all four public routes at 1440 and 390 widths, correct H1, 117 image tags, one PDF, no external spam/admin origin, and first scan image loads.
- 2008/2010 big image booklets and 2014 missing original source document remain separately unresolved; no changes were made to those in this repair.

**2026-10-27 evening state:** `CMS_REPAIR_PASS=4/4`, `POST_REST_READBACK_PASS=4/4`, `PUBLIC_BROWSER_QA_PASS=8/8`. Code mode: auto-build.

- Independent public browser QA [#40516129326](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40516129326) **PASS 8/8**: all 2012, 2013, 2015 and 2016 routes at desktop 1440px and mobile 390px returned 200 with correct H1, the exact image counts 26/26/33/32, 2016 PDF retained, first real JPEG loaded successfully, zero external links or spam, 100% of image URLs through same-origin `/api/files/wp-content/uploads/`. Job stores desktop/mobile 2012 screenshots and JSON test results as artifact `pse-annual-booklet-public-qa`. No Astro build required or performed.
