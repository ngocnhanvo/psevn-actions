# PSE Visual Builder — checkpoint mới nhất 25/11/2026

## Đã triển khai và nghiệm thu production (source có commit pin)

**Astro:** `ngocnhanvo/psevn-astro@master` `f7465f330cff9cd6232a5e0674c17b4576bbd3ba`. WordPress signed trigger [#45542542872](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45542542872) SUCCESS, signed production activation [#45542620028](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45542620028) SUCCESS (`PSE_DEPLOY_COMMIT` exact pin, `SIGNED_UNZIP_SUCCESS`). Không trực tiếp FTP/build và không ghi CMS.

**PHP:** `ngocnhanvo/psevn-php@master` `09b60096b76d6eb6c0ef4ff8f06aeeb78f6c9fe8`. Guarded PHP-only FTPS [#45542344078](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45542344078) SUCCESS, `includes/item-section-ui.php` activated SHA256 PASS, 1 file changed, 20 checked, cleanup_pending 0. Không Astro build từ PHP trigger.

**Source CI:** [#45541960413](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45541960413) SUCCESS; all PHP-real Page/nonce/version/hash tests and generated Inspector JavaScript security parser PASS, Astro `26/26 suites / 146/146 tests` PASS. Includes source safety probes of valid Hotline versus unsafe FAQ, forged parent origin, no Preview DOM mutation. Exact S4 published local WordPress REST Post picker and include old Post ID remain supported from previous release.

**Bug vừa sửa:** Production G1 diagnostic [#45541394836](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45541394836) detected FAQ *Nhân bản section* clickable even though Astro Preview wrapper was structurally unsafe (global DOM ID). WordPress Page shortcode dry_run alone wasn't enough. New shared Inspector gate requires **BOTH** existing authenticated Page/occurrence/version `remove-section` or `duplicate-section-shared` `dry_run=true` and exact iframe Astro `esc-vb-section-action-check-ack` (origin + frame + key/mode/requestId, 6.5s timeout fail-closed). Astro shares the same pure structural validator for preflight and actual Preview; probes never clone/remove/reorder nodes.

**Actual production browser QA:** [#45542876458](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45542876458) **SUCCESS**, `PSE_BUILDER_SECTION_SOURCE_CAPABILITIES=PASS`:
- FAQ Page `80930`: source Page allows shortcode clone but Astro rejects unsafe FAQ wrapper. `shared_clone=REJECTED_BY_PAGE_OR_IFRAME`, UI clone hidden/disabled, remove=SUPPORTED; actual DOM count unchanged.
- Hotline Page `80932`: Page + Astro both approve, `shared_clone=SUPPORTED remove=SUPPORTED`, controls only after source verified.
- S4 REST Posts `include=ID` for Post **outside default WP REST first page** PASS, four forged REST ticket checks fail closed; S1 FAQ 15 source rows item hide draft/Cancel no CMS Save; FAQ/Hotline/History original content parity; 6 History milestones same count/text/width/height/font at 1024px and 390px; Footer rapid selection PASS. `PSE_G1_SKELETON_LIVE=PASS NO_CMS_WRITE=PASS NO_BUILD=PASS`.
- Another G1 [#45542891435](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45542891435) and direct item/section red/green Preview swap [#45543276751](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45543276751) **IN_PROGRESS at handoff write**. Confirm actual status/log before claiming new PASS.

## Remaining work, do not assume DONE

- **S1** Page Item visible=0/1 backend hide/show with exact Table/row/field/version/hash and Hủy UI deployed; production FAQ currently `hidden_source_rows=0`; actual CMS hide→restore Save/REST/public/rollback `NOT_TESTED`.
- **S2/S3** Native Product/Page/ProductCategory references and **S4 verified local REST Posts**: picker/add/replace/local cell deployed, Post ID hydration passed code+live GET; on inspected production Pages there is **no published verified manual S2–S4 collection fixture** to execute actual CMS Save and rollback. Do not invent dummy Page/record or report Save PASS.
- **S4 other arbitrary REST endpoints**: not supported until a vetted schema/record adapter exists. **S5** actual source `pse_01_vi` lacks verified native news query cells, so Save/REST/public acceptance not proven.
- **Section gaps:** add new section with typed registry + source owner; section hide/show with durable Page-owner storage; clone with *independent* new TablePress source and transactional rollback; nested ESC Table child owner/writer path. Shared source clone and Page detach are separate actions and were validated only in read-only or PHP isolated fixture, not actual production CMS Save→readback→public.
- Broader S1–S9 sitewide field/desktop/mobile audit and actual scoped Save acceptance outstanding. Keep `PARTIAL` until source-specific work closes.
- Authoritative detailed document: `docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md` on `ngocnhanvo/psevn-actions@main`. Avoid reworking green/white hero chips, duplicate unrelated QA, and don't bypass signed deployment.

Chế độ code: auto-build  
Cổng ghi source: bypass  
Trạng thái: **PARTIAL — chưa hoàn tất**
