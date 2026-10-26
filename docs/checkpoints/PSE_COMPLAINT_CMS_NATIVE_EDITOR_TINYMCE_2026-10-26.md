# PSE Complaint Page — CMS ownership and native TinyMCE parity (2026-10-26)

## Scope
Owner observed blank Classic Editor on published Page 81087 while the Astro site still showed the complaint form. This checkpoint concerns only correcting the source of the Page form/layout and ensuring native WP Visual Editor parity, not modifying existing Header item 77020.

## Verified WordPress CMS / Astro state
- Existing WordPress Page **81087**: slug `xu-ly-khieu-nai-y-kien-khach-hang`; published; `action=PseComplaintPage`, `key=pse-complaint`. Native authoring already executed exactly once in [CMS run #40291344225](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40291344225); subsequent read-only audit [#40292045616](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40292045616) confirms `ALREADY_DONE; no_write=true`.
- Page body is native CMS-owned HTML (3565 chars) with a form containing 9 fields and two section headings; CMS ACF `cssmore` is 3376 chars. Original menu and Page identity remained unchanged.
- Astro production component `src/astro/pages/PseComplaintPage.astro` uses `<ExtractHTML page={currentPage} />` and `currentPage.cssmore`; **it no longer contains hardcoded form HTML/layout**. Astro retains only secure `/api/contact` submit and Turnstile behavior. Astro production revision `eb8ba4be1b6e858100a7e93d6ba342b6af69930f`, deployed via native WordPress Build Website [#40291772312](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40291772312).
- Public read-only Playwright [#40292095004](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40292095004) passed 390/768/1440px, CMS DOM marker and CSS grid, required fields, menu, header/footer, no leaked WP admin host or JS runtime errors; no email sent.

## Native TinyMCE parity regression and resolution
- The first generic PHP mu-plugin `esc-native-page-cssmore-editor.php` reused each Page's ACF `cssmore` in TinyMCE `content_style`, but passed CSS without JS-literal escaping. WordPress core `_WP_Editors::_parse_init()` wraps string values in unescaped double quotes, so CSS newlines and `content:"..."` introduced `Invalid or unexpected token` and prevented `tinyMCEPreInit` from initializing. This was reproduced in read-only runs #40293336207, #40293390715, #40293768329, #40294170802.
- Repaired in PHP `master` at `5df222e5fe73f72ee805c7cb5729a4bc0c371ac8`: JSON-encode the combined CSS and strip the outer quotes for WP core's JS literal wrapper; regression test validates newline, quoted content, Unicode, backslash and preservation of the original editor style. The plugin remains generic for Pages, with no page ID, hardcoded layout or second preview panel.
- Approved PHP/FTPS workflow [#40294782878](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40294782878) **PASS**, PHP regression PASS, checksum-verified plugin upload PASS, `no_astro_build=PASS`.
- Independent read-only native Visual/Text switching [#40295098081](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40295098081) **PASS**: `tinyMCEPreInit` present, Visual switch PASS, HTML switch PASS, no CMS write.
- Read-only Page parity [#40295091589](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40295091589) **PASS**: H1, 9 form fields, 2 section headings, `gridDisplay=grid`, `gridColumns=409.562px 409.562px` in WordPress native editor. `PSE_COMPLAINT_CMS=ALREADY_DONE; no_write=true`.

## Do not repeat
Do not re-author Page 81087, save Menu 77020, rerun previous successful deploys, send live complaint email or trigger an Astro build without new authorized changes. For later changes, use WordPress Editor/ACF and native Visual Editor, then WordPress/PHP-controlled Astro Build Website only when pending changes require it.

## Outstanding scope
- Real outgoing complaint email delivery was intentionally **NOT TESTED**.
- The form currently lives in CMS-native HTML + ACF CSS, **not in item-level ESC Table/Visual Builder**. Any new requirement for item drag/drop or ESC Table editing is a separate authorized CMS migration, not something to declare already supported.
- Mode: `auto-build`. No independent Astro build or frontend hardcoded form was introduced in this fix.
