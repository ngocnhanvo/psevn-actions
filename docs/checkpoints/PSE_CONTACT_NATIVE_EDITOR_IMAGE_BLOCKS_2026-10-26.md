# PSE Contact #47222 — native WordPress ESC Table image previews (2026-10-26)

## Owner-approved target
- Remove unrequested custom WordPress-only `Xem trước bố cục liên hệ từ WordPress / ESC Table` panel/iframe.
- WordPress Classic Visual Editor is the authoring UI. ESC Table `Insert Code` selector produces a quick IMAGE preview at the exact section position; ESC Visual Builder remains the full layout tool. Do not add a new preview UI.
- Page `47222` (`lien-he`), `action=PrivatePage`, `key=contact`; keep CMS `cssmore` as the layout owner and Astro generic renderer/SSR/form interactions.
- Three existing ESC Table IDs, ordered: `pse_contact_office_vi`, `contact_00_vi`, `pse_contact_warehouses_vi`. Existing item counts `1/6/5`. No duplicate tables or shortcode text authoring.

## Confirmed changes
1. **Removed unrequested custom admin UI**: `ngocnhanvo/psevn-php@master` commit [`29f19c0`](https://github.com/ngocnhanvo/psevn-php/commit/29f19c092bba42a3b45edd840d8d78b49cb1363a) makes `wp-content/mu-plugins/pse-contact-editor-preview.php` inert (no registered WordPress metabox, iframe, extra frontend layer). Historical JS/CSS files remain unloaded as backward-compatible source assets until deploy allowlist retirement.
2. Protected **PHP-only FTPS deploy** [#40253166789](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40253166789) SUCCESS, SHA256 verified, no Astro build.
3. Knowledge [PR #18](https://github.com/ngocnhanvo/knowledge/pull/18) MERGED to main `c83d2936764a26d48e4eff5e3b926342455a937f`; prohibits custom preview when Visual Builder exists; requires native ESC Insert Code + one visual image preview per section; Save→Reload QA.
4. `scripts/pse-contact-editor-wrapper-repair.mjs` (Actions `main`) now safely uses actual WordPress TinyMCE **ESC Insert Code popup** for each existing table, not paste/REST shortcode authoring. Original Page content and `cssmore` are backed up before write, and every table count and page identity are checked. Script is idempotent and read-first: if three valid native wrappers exist, it **never rewrites WordPress**.
5. Two unsaved authoring trials [#40253991605](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40253991605) and [#40254198126](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40254198126) PASS: three independent native image wrappers and correct shortcode badges.
6. Guarded native **WordPress Save** [#40254429019](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40254429019) issued the WordPress Update successfully, but Playwright initially FAILED when the WP editor redirected during readback (`Execution context was destroyed`). The next read-only run proves the update persisted. Artifact backup and pre-save screenshot [workflow artifact #12622440063](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40254429019/artifacts/12622440063).
7. Authenticated read-only post-Save reload [#40254673453](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40254673453) PASS: exactly 3 native WordPress saved visual wrappers, one ESC ID/shortcode/image per wrapper, correct order, custom panel absent, NO second CMS write.
8. **Final image-loading QA** [#40254970202](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40254970202) PASS: all three native images complete with `naturalWidth=300`; includes authenticated Editor screenshot artifact; `PSE_CONTACT_NATIVE_EDITOR=ALREADY_DONE`, `no_cms_write=true`, `no_build=true`.

## Follow-up QA runs
- Legacy iframe-specific QA script was rewritten to invoke the guarded **read-only native editor check**, and its workflow renamed. [#40255107278](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40255107278) **SUCCESS**. No CMS writes.
- A near-simultaneous duplicate verification [#40255120773](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40255120773) failed due to **WordPress admin navigation timeout (60 seconds)** while other unrelated PHP work was in progress. It did not change CMS content and does not invalidate the earlier authenticated image-loading PASS [#40254970202](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40254970202). If repeating, wait for Admin availability; do not re-author Page content.

## Maintained safeguards
- No new Astro source, no independent Astro Actions build, no new ESC tables, no form submission.
- CMS controls section content and layout. Native visual editor shows image-based section order. Public Astro uses `stripEscTableEditorPreviews.ts` on the editor-only wrappers, preserving the shortcode order with generic ESC rendering.
- Deprecated preview-specific QA was repointed to the native, read-only image-block verifier; CI renamed accordingly.
- Do not repeat the Contact CMS mutation or trigger a build based on this checkpoint. If visual disagreement is reported, first read actual CMS state, latest runs and screenshots; no page-specific Astro layout hacks.
- Public site Contact QA previously PASS at desktop/tablet/mobile in [#40251011874](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40251011874), before the native editor markup correction. Public **post-correction** browser smoke is not independently rerun in this work; do not relabel the previous test as a new post-correction PASS.

Status: native WordPress authoring/editor image previews **PASS**; PHP custom preview removal **DEPLOYED/PASS**; Knowledge policy **MERGED**; post-correction public site independent QA **NOT TESTED**; actual mail send **NOT TESTED** (intentionally).

Chế độ code: auto-build.
