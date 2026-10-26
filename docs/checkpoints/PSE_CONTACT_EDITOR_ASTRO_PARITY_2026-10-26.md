# PSE Contact — WordPress native Editor / Astro layout parity (2026-10-26)

## User-approved ownership
- **WordPress Page #47222** owns the authored eyebrow `PVFCCo-PSE`, heading `Thông tin liên hệ` and description. These are NOT ESC Table data and must not be duplicated or stripped from Editor.
- Authored text has CSS directly on the native WordPress Visual Editor elements (inline style) so the editor matches the public hero. No separate preview tool/metabox was added.
- The ESC Tables `pse_contact_office_vi` (1 office), `contact_00_vi` (6 form fields) and `pse_contact_warehouses_vi` (5 warehouses) remain separate native Insert Code image blocks. Their **public display styles** now live in Astro `src/astro/tablepress/pse-contact-esc.css`, imported by `Pse_contact_office.astro`. The 3 ESC tables and business data were NOT re-created or rewritten.
- Preserve remaining unrelated WordPress `cssmore`; only the exact confirmed obsolete `PSE_CONTACT_ESC_OWNED_SECTIONS_V2` tail was removed. Existing 3 native previews remain; representative preview images may be curated later.
- No hardcoded business information/labels in Astro; no Editor-to-Astro parser and no direct Astro build workflow.

## Code/release provenance
- Astro DEV `github`: CSS migration `a49af22d`, import `68eb95c3`.
- Astro PRODUCTION `master`: [PR #81](https://github.com/ngocnhanvo/psevn-astro/pull/81) MERGED at `2f36599db017e2b0ccd3a8470fe8d305c933b05f`; changed only CSS + renderer import. Branches were diverged, so production change went through an isolated PR rather than a broad github→master merge.
- DEV regression without Astro build: [#40268065269](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40268065269) **PASS**.
- Initial native WordPress heading save [#40268108363](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40268108363) flagged FAIL because the code compared unnormalized CSS spacing; the save itself SUCCEEDED. Independent subsequent Admin read [#40268316608](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40268316608) **PASS**, verified `h2` inline CSS and preview count. Regex validation fixed; do NOT replay this write.
- Normal WordPress Build Website [#40268301999](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40268301999) **PASS**, signed Astro deployment [#40268379392](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40268379392) **PASS** with exact production SHA `2f36599...`.
- Guarded CMS CSS cleanup [#40268708232](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40268708232) **PASS**: `cssmore` 10355→4878 chars, native editor title stays green `rgb(23,82,56)`, all three ESC preview wrappers retained. No extra preview panel.
- Final WordPress Build Website [#40268862707](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40268862707) **PASS**, signed Astro deploy [#40268944636](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40268944636) **PASS**.
- Independent Admin read-only parity [#40269018747](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40269018747) **PASS**: cssmore ESC marker absent, native heading green, three blocks intact, no custom preview.
- Live Chromium contact-only responsive [#40269136173](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40269136173) **PASS** at `390px`, `768px`, `1440px`: WordPress heading inline styles, Astro ESC responsive grid, office/form side-by-side desktop and stacked on small screens, 5 warehouses below, 1 form, HTML5 constraints/Turnstile structure, no hidden WordPress-origin leak, no overflow or internal notes. No email submitted.

## Acceptance/status
- `WORDPRESS_EDITOR_TEXT_CSS=PASS`
- `NO_DUPLICATE_CMS_TITLE=PASS` (heading owned by Page; table titles are office/form/warehouses)
- `ESC_TABLE_CSS_IN_ASTRO=PASS`
- `CSSMORE_LEGACY_TABLE_SECTION_REMOVED=PASS`
- `NATIVE_INSERT_CODE_BLOCKS_3=PASS`
- `ASTRO_PRODUCTION_SIGNED_DEPLOY=PASS`
- `DESKTOP_TABLET_MOBILE_PUBLIC_QA=PASS`
- `CUSTOM_TABLE_PREVIEW_IMAGES=NOT TESTED` (owner allows these later; do not replace native Insert Code with a separate preview tool)
- `REAL_EMAIL_DELIVERY=NOT TESTED` (deliberately no form submission)

## Follow-on safety
1. Never insert shortcode as raw text; use WordPress ESC Insert Code. Preserve all 3 native preview wrappers. Don't run the old migration scripts again.
2. Authored free text outside ESC Table must be styled visibly inside WordPress Editor, not only via frontend CSS. ESC Table section/item public presentation lives in Astro reusable renderer.
3. For further visual adjustment, validate Admin Save/Reload and public Playwright at the three breakpoints; do not trigger an Astro build except through PHP Build Website and only with actual changes.
4. This checkpoint is final for the heading/CSS ownership task, not proof that the ESC preview images themselves are production screenshots.

Chế độ code: auto-build.
