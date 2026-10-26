# PSE Contact — WordPress-authored visual layout and Astro parity (2026-10-26)

## Outcome

**Complete and verified.** Page `47222` (`lien-he`, ACF `action=PrivatePage`, `key=contact`) now uses WordPress/ESC Table as the source of section order/content/layout CSS. The WordPress Admin editing screen includes a responsive visual layout preview in PHP/JS. Astro reads the same saved page and ESC data; no page-specific layout rearrangement was introduced in Astro.

### Source of truth

- WordPress page content: the existing `pse-contact-hero` authored HTML followed by standalone native ESC shortcodes, in this exact order:
  1. `pse_contact_office_vi` (one headquarters)
  2. `contact_00_vi` (contact form)
  3. `pse_contact_warehouses_vi` (five warehouses)
- Page ACF `cssmore` retains `PSE_CONTACT_ESC_OWNED_SECTIONS_V2`, defining responsive two-column office/form and warehouses below.
- The 3 ESC Tables already existed; none was recreated. Original TablePress Insert Code-originated shortcode tokens were preserved; the obsolete TinyMCE visual preview wrapper was removed from saved post content.
- WordPress content no longer contains `tablepress-preview-wrap` after the repair; the previous wrapper had incorrectly nested the office and form shortcodes in the badge for table `contact_00_vi`. Astro had consequently rendered only the form.
- Page content remains manageable from WordPress, not hardcoded into Astro. The admin preview uses form controls disabled and never submits live data.

### Code and policies

- `ngocnhanvo/psevn-php@master`: MU files `pse-contact-editor-preview.php`, `.js`, `.css`. Admin-only preview panel uses saved ESC Table data, page HTML and CSSmore, with desktop / tablet / mobile selection. Deployed by safeguarded FTPS and SHA256 verification.
- `ngocnhanvo/psevn-actions@main`: guarded recovery, wrapper repair and read-only browser QA scripts/workflows. Protected PHP FTPS release allowlist includes the three MU files.
- Knowledge rule PR [#17](https://github.com/ngocnhanvo/knowledge/pull/17) **merged** into `knowledge/main`: WordPress/PHP manages and previews CMS layout; Astro consumes structure and handles common rendering/SSR/SEO/interactions. No direct Astro build was triggered.

### Evidence (2026-10-26, times UTC)

- Admin-only PHP FTPS: [#40248599923](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40248599923) **PASS**, three MU files uploaded/byte-verified, no Astro build.
- Authenticated WordPress Admin Chromium preview: [#40249025992](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40249025992) **PASS**. Office left/form right/warehouses below at desktop; stacked mobile, five warehouse items, form disabled, three ESC IDs in editor.
- Source-only wrapper verification: [#40250620741](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40250620741) **PASS**; Page raw content contains exactly 3 standalone ESC shortcodes, no TinyMCE preview wrapper. Read-only because state had already been corrected.
- WordPress PHP Build Website trigger: [#40250737115](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40250737115) **PASS**.
- Signed Astro production build/release: [#40250804433](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40250804433) **PASS**.
- Real site [`/lien-he`](https://pse.webnvn.com/lien-he) Chromium QA: [#40251011874](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40251011874) **PASS at 390, 768 and 1440px**:
  - ESC-owned office/form/five warehouses present, office/form side by side on desktop, stacked correctly on mobile, warehouses below;
  - exactly one contact form, 5 required fields and native validation, no test submits/emails;
  - admin origin stays hidden, internal editor note does not appear, no horizontal overflow.
- Final Action run artifacts contain mobile/tablet/desktop full-page screenshots.

## Lessons / guardrails

1. WordPress Classic Editor may save a `tablepress-preview-wrap` visual badge around Insert Code tokens. Never allow multiple native shortcode tokens inside a single table's preview badge. Inspect `content.raw` **and** `content.rendered` after publish; a valid count alone is insufficient.
2. When page content has nested editor artifacts, fix the saved WordPress source rather than adding Astro-specific business/page layout hacks. Preserve existing native ESC Table data and shortcode tokens exactly.
3. Require both authenticated Admin responsive preview QA and publicly deployed browser QA before claiming parity. `npm build` success alone is insufficient.
4. Only request Astro build through existing PHP/WordPress Build Website trigger. Keep rollout and artifacts auditable.

Chế độ code: auto-build.
