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

Chế độ code: auto-build.
