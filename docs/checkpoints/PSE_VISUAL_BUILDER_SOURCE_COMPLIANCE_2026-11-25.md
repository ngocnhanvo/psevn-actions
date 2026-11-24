# PSE Visual Builder — source ownership, API reference swaps, production checkpoint (2026-11-25)

## Canonical sources and policy
- Knowledge: `ngocnhanvo/knowledge@main` (S1–S9 Visual Builder source policy, Page/ESC/API isolation, direct red/green Preview picking).
- PHP `ngocnhanvo/psevn-php@master` **`e1377d84d1c9124bdfa12b9803a147f712185240`**.
- Astro `ngocnhanvo/psevn-astro@master` **`05275b6a31ed4078efcd05ad385305ed3b705b76`**.
- Actions release request `0deb3f953f0a4614cfc6b5360a2014dc8d1d5708`.

## Evidence, immutable release pins
1. Original stable 2026-11-24 checkpoint: `docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-24.md` (original production PHP `4c72855`, Astro `244c1f8`; live read-only Page section swap/cancel and Hotline clone/remove dry run passed).
2. Manual-API PHP guarded REST source writer: validates `tablepress_meta_<id>.api`, approved source class, physical `api-key`/`key`/`_id` reference column; rejects API auto templates and missing/ambiguous keys; swaps exactly two physical ESC Table data rows with optimistic version + SHA-256 row hashes; NEVER edits WordPress Product/Page/Term/remote API records. Inserts/deletes stay blocked for manual API until verified picker exists.
3. PHP `item-section-ui.php` now allows only `manual_reference` item red/green source-row swap from authenticated Preview, while API auto cards and local/upstream fields remain readonly. No alternate sort list UI.
4. Astro `builderCollectionMode.ts`, `getData.ts`, `ExtractHTML.astro`, `builderSectionDrafts.ts`, `builderEditabilityCues.ts`, `preview/[pageId].astro` classify a source BEFORE `api-key=auto` expansion. Preview-only physical source index is present ONLY for manual API references, with direct card markers for Home_04–Home_08. Same-ID nested source wrappers inherit authoritative outer owner metadata; distinct nested table IDs are kept separate.
5. Source-only CI **SUCCESS** [#45451853497](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45451853497): PHP source/unit/JS and Astro Vitest (including manual swap/cancel, readonly auto, nested source), Astro parser, Tailwind. No Astro site build, CMS write or FTP. Earlier CI failures #45451071528 (capitalized source label assertion) and #45451628850 (callback isolation) were fixed and rerun successfully at pinned Astro `05275b6`.
6. Guarded PHP-only FTPS [#45450745414](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45450745414) **SUCCESS**: source pin `e1377d84...`, `item-manager.php` and `item-section-ui.php` sha256 readback PASS; `changed=2 checked=20 cleanup_pending=0`. NO CMS content mutation.
7. WordPress authenticated Build Website request [#45452024196](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45452024196) **SUCCESS**: WordPress returned successful GitHub dispatch, `PSE_WP_PENDING_CHANGE_COUNT=2`, `PSE_WP_BUILD_REQUEST_MODE=normal`. Actual signed Astro build/deploy [#45452106838](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45452106838) **IN_PROGRESS at checkpoint creation**, not a production PASS yet.

## Acceptance and remaining scope
- S1 static ESC Table and previous Page section Preview paths: prior source and readonly browser QA PASS; no evidence of real CMS Save/readback.
- S2–S4: the guarded manual source-row swap and Preview adapters are implemented and source-tested. Manual reference creation/deletion, local-field write adapters and live validated Save/readback are NOT COMPLETE. The only accepted Preview swap is a complete physical card collection with exact source coordinates; otherwise fail closed.
- S5: automatic API query filter/limit/order/template editor is NOT COMPLETE; generated API cards must remain readonly (no fake physical item IDs).
- Section independent add/clone, show/hide persistence, nested TablePress source mutation, broader row insert/delete and responsive acceptance remain NOT COMPLETE.
- Before claiming full completion: exact signed Astro production pin/activation; authenticated live no-write Preview regression including API source-mode audit; separately approved isolated CMS Save -> REST readback -> reload -> public desktop/mobile + concurrency/rollback tests.
- **Trạng thái: PARTIAL — chưa hoàn tất.** Never represent source CI or read-only dry-run as actual CMS Save.
