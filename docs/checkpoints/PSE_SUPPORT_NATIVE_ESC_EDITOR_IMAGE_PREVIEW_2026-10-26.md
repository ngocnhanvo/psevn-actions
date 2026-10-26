# PSE native ESC Table image previews — 2026-10-26

## Owner request and architectural boundary
- Remove duplicate WordPress Page metabox “Xem trước bố cục từ WordPress / ESC Table” for Hotline and FAQ.
- Keep ESC Visual Builder as the sole full-layout builder; use WordPress Classic Visual Editor's existing native ESC Table **Insert Code** image preview blocks.
- ESC Tables remain the source of structured content. WordPress ACF `cssmore` remains the layout CSS source. Do not create a separate renderer or hardcode page layout in Astro.
- Repo `ngocnhanvo/knowledge` `main` already specifies these rules in `stacks/wordpress-editor-esc-table.md`; no duplicate rules were committed.

## Completed and deployed
1. `ngocnhanvo/psevn-php@master` commit `fb225c302b71d91bd07b82b7e0c6250fb324ead8`: inert `wp-content/mu-plugins/pse-support-editor-preview.php`, no extra postbox or iframe. JS/CSS kept as inert compatibility assets on FTPS allowlist.
2. Guarded WordPress-only FTPS release [#40255173968](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40255173968): **PASS**, SHA256 readback; no Astro build.
3. `ngocnhanvo/psevn-actions@main`: `scripts/pse-support-native-esc-image-blocks.mjs`, `.github/workflows/pse-support-native-esc-image-blocks.yml`, and guarded apply marker. Authenticated native TinyMCE Insert Code only; checks page identity/ACF/ESC Table schema/row counts, backs up before write, requires first read to match, canonical `editor.save()` to serialize content, then one WP Publish save and REST readback, reopens the editor and verifies real image.
4. Dry run [#40255807821](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40255807821): **PASS** for Page `80932` and `80930`, both native image `naturalWidth=300`.
5. Final CMS apply/readback [#40257070011](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40257070011): **PASS**, Hotline `80932` `pse_hotline_vi` already had one valid saved image wrapper and was **not rewritten**; FAQ `80930` `pse_faq_vi` saved one native image wrapper and reopened editor with image loaded. Output `PSE_SUPPORT_NATIVE_EDITOR_QA=PASS pages=2 apply=true no_astro_build=true`.

## Read-after-write and compatibility
- Hotline ESC Table: 3 rows, fields `group/label/phone/note`; FAQ ESC Table: 15 rows, fields `question/answer/visible`. Neither data table was written by this workflow.
- WordPress Classic Editor's ACF CSS textarea normalizes LF to CRLF on Page Publish. This changed Hotline `cssmore` from 2056 to 2081 characters but does **not** change CSS semantics. The final script compares the normalized CSS with the pre-save original and did not overwrite existing author CSS. FAQ CSS retained its rules.
- Astro already strips the strictly recognized native `tablepress-preview-wrap` authoring wrapper back to its sole underlying shortcode (`src/lib/wordpress/tablepress/stripEscTableEditorPreviews.ts`); no Astro source changes, direct builds or page-specific renderer changes required.
- Initial guarded apply attempt had a mismatch until canonical `tinymce.editor.save()` was called; then an apparent CSS mismatch was proven to be CRLF-only. Read-only diagnosis preceded retry; no duplicate CMS writes after the accepted saved Hotline image wrapper.
- Any future modifications should use original WordPress ESC Insert Code, not hand-typed shortcode or second preview tool.

## Final signed production and live browser acceptance (2026-10-26)
- Astro source `ngocnhanvo/psevn-astro@master` commit `3e2e36bd81a55ad5d1dacc8235512439b92212d0` removed Hotline/FAQ duplicate component-owned CSS; site layout CSS remains in WordPress ACF `cssmore`. Source-only tests were already PASS; no additional Astro source code patch in this continuation.
- Immediately after native Editor Save, the old production site had passed functional six-viewport checks but **failed CMS CSS origin markers** in browser QA [#40257352670](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40257352670). Do not count this pre-release regression as a passing run.
- Authenticated WordPress/PHP Build Website request [#40257740480](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40257740480) **SUCCESS**. Preflight signed FTP/unzip PASS. Although an explicit one-time exception was authorized for the subpages, PHP reported `pending_count=3` and used `PSE_WP_BUILD_REQUEST_MODE=normal`, so no force build occurred and no standalone Actions build was dispatched.
- Signed WordPress-initiated Astro build and production FTP-TLS activation [#40257838766](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40257838766): **SUCCESS**, source SHA verified above, `SIGNED_UNZIP_SUCCESS`, public GET smoke complete. Delta Image reused 865/865; Static Delta reused 46/76 files.
- **Post-deploy public acceptance PASS** in independent Playwright runs [#40258041199](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40258041199) and [#40258047637](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40258047637). Both reported `PSE_SUPPORT_LIVE_QA_SUMMARY={"checks":6,"failures":[],"readOnly":true}` for `/duong-day-nong` and `/hoi-dap` at 390px, 768px and 1440px.
- Each tested page returned HTTP 200 and exactly one H1, with no horizontal overflow or uncaught browser errors. Hotline preserved 3 valid tel links/cards. FAQ preserved 15 items, nonempty answers and working native accordion. Critically, `cmsCssLoaded=true` for both page-specific WordPress CSS marker strings on every viewport, confirming released CMS-owned layout.
- No live contact form or FAQ submission was performed; not in task scope. No further build or CMS rewrite required for this completed requirement.

Status: `CMS_NATIVE_IMAGE_PREVIEWS=PASS`; `DUPLICATE_CUSTOM_PREVIEW_REMOVED=DEPLOYED/PASS`; `ESC_DATA_PARITY=PASS`; `SIGNED_ASTRO_DEPLOY=PASS`; `POST_DEPLOY_RESPONSIVE_QA=PASS`; `LIVE_SUBMISSION=NOT_TESTED` (intentional).

Chế độ code: auto-build.
