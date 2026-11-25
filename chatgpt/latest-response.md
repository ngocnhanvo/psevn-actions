# PSE Visual Builder — checkpoint tiếp nối 25/11/2026

## Nguồn phát hành đã xác minh

- Astro production: `ngocnhanvo/psevn-astro@master` `87f4c37f077dd87f3e42116beb947969ee70ecba`; signed WordPress trigger [#45525483787](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45525483787) **SUCCESS**, signed Astro production build/deploy [#45525561538](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45525561538) **SUCCESS**, exact immutable source SHA and signed unzip proven. Không viết CMS.
- PHP production: `ngocnhanvo/psevn-php@master` `b0f750711c0cc298d83ed139223f18e3982787f9`; guarded FTPS [#45526948922](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45526948922) **SUCCESS**, 2 changed/20 checked, SHA256 readback PASS, cleanup 0. Không rebuild Astro.
- CI static source [#45526531612](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45526531612) **SUCCESS**, PHP S1 visibility source hide/show rollback + S2/S3 reference insert, JS syntax and Astro 25/25 suites, 138/138 tests.
- Browser production [#45527861359](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45527861359) **SUCCESS**: production-first successful source sync info hidden, genuine FAQ source `pse_faq_vi` has 15 original rows + `visible` cell, `can_toggle_visibility=true`, contextual Hide/Show inspector after real source item click; no-op Save disabled, draft enabled, Hủy without writing; FAQ 15/Hotline 3/History 6 public-vs-Preview parity; History six milestone cards identical geometries/text/font at CSS inner viewport widths 1024 and 390; Footer rapid-click and invalid-ticket denial PASS.
- Direct Preview item/section swap-and-Cancel [#45528157545](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45528157545) **SUCCESS** after latest PHP release: six S1 physical source cohorts, Page section swap `pse_00_vi`↔`pse_01_vi`, `NO_CMS_WRITE=true NO_SAVE=true PREVIEW_CANCELLED=true`.
- False QA failures resolved: iframe CSS width 1024 yielded actual innerWidth 1022 (border 2px) crossing Tailwind breakpoint; script now aligns innerWidth from within cross-origin Astro frame. FAQ click previously before deferred Astro item-picker listener, script now waits for `style[data-esc-vb-item-pick-style]`; full final browser PASS.

## Tiếp tục đúng phần còn thiếu (không lặp test đã PASS)

- **Không báo DONE toàn Builder.** Live FAQ source has `hidden_source_rows=0`; actual CMS hide→restore Save/readback/rollback **NOT_TESTED**. The PHP in-memory fixture verifies hide/show bitwise restoration, not production write.
- S2 Product/Page and S3 ProductCategory native manual references: picker/replace/add/local cell code deployed, but published inspected Pages have **zero manual reference collections**; actual authenticated WP Save→REST→Preview→public/rollback NOT_TESTED.
- S4 arbitrary REST typed picker/approved endpoint schema not implemented; S5 actual source query config fields missing from `pse_01_vi`, query Save NOT_TESTED. Independent section insert/hide, independent-source clone, nested TablePress and sitewide responsive visual parity remain gaps.
- **Next safe independent implementation:** inspect Page/ESC Table owner for section-visibility storage; implement schema-bound, versioned Page-owned section show/hide only with exact source mapping/rollback and no invented Page markup or shared-source mutation. Alternatively add S2/S3 isolated approved fixture acceptance if a real scoped published Page becomes available. Run source CI, guarded deploy, authenticated readonly QA; do not create dummy production Page/records solely for PASS.
- Detailed authoritative checkpoint: `docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md` (actions/main). Preserve source-owner and Click→controls UX contract.

Chế độ code: auto-build  
Cổng ghi source: bypass  
Trạng thái: PARTIAL — chưa hoàn tất
