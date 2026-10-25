# PSE Contact Page — restore WordPress/ESC Table architecture (2026-10-26)

## Owner report
WordPress Page [#47222] displayed all office/warehouse content in the classic editor while Astro PrivatePage had been supplied with a hardcoded Contact-specific HTML slicing helper, layout CSS, fallback form data, and manually inserted component. This contravenes `knowledge/main/stacks/wordpress-editor-esc-table.md`. Owner requires exactly: HTML/CSS, ESC Table, or their combination; no business content/layout hardcoded in Astro.

## Corrected ownership
- **Native WordPress Page #47222**: `action=PrivatePage`, `key=contact`, published; contains the source-verified main office + five warehouse HTML cards, followed by one shortcode `[table id=contact_00_vi /]` inserted through native TablePress **Insert Code** selector and WordPress Quicktags native editor API. NOT inserted by writing raw shortcode into REST/DB. All 5 warehouses preserved; editorial placeholder absent.
- **WordPress ACF `cssmore`** holds page layout styles including desktop office-left/ESC-form-right, warehouse grid below and mobile stacking. CSS scoped via actual CMS section to the generic `#main-content`, rather than Astro hardcoded page type/layout; current CSS `PSE_CONTACT_WORDPRESS_OWNED_LAYOUT_V1`.
- **ESC Table `contact_00_vi`** created/edited through native TablePress UI: six items `hoten`, `sodienthoai`, `email`, `chude`, `noidung`, `cta`, with fields `key`, `label`, `required`. Admin can modify labels and required flags through ESC Table; `Contact_00.astro` remains reusable logic for security and `/api/contact` but receives `data.items` from CMS, no fallback form data created in PrivatePage.
- **Astro `PrivatePage.astro`** now is only generic WordPress content `ExtractHTML` + `cssmore` renderer, Page H1 fallback and inherited Footer condition. Deleted `pseContactLayout.ts`, `pseContactLayout.test.ts`, removed Astro-specific office/form CSS and `nativeContactFormData`. All business data controlled in CMS.

## Completed evidence (do not rerun)
- Read-only native CMS audit [#40239545820](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40239545820): before, 0 ESC tables and 0 shortcodes, `cssmore` existed, original 5 warehouses.
- Native UI ESC Table initial creation was successful in [#40240442130](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40240442130). Follow-up runs #40240706172/#40240950960/#40241143110 failed safe BEFORE WordPress Page update while debugging native Insert Code target. Never duplicate table.
- Native WordPress Insert Code achieved at [#40241405441](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40241405441): native Quicktags inserted to main Page content; Save initiated and then readback raced WP editor redirect, triggering job failure AFTER the successful save.
- Separate read-only CMS audit [#40241568512](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40241568512) SUCCESS: Page has one ESC shortcode, CSS in `cssmore`, five warehouses, no editor note.
- Independent authoritative Admin audit [#40241849466](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40241849466) **PASS**: WordPress Page 47222 `PrivatePage/contact`, body 3555 chars, cssmore 10577 chars, exactly one `contact_00_vi` shortcode, REST table fields `key,label,required` with six items; editable native `cssmore`, all warehouses preserved. No overlap/duplicates.
- Astro changes on DEV `github`, no-build source test [#40240385172](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40240385172) SUCCESS. Targeted PR [#75](https://github.com/ngocnhanvo/psevn-astro/pull/75) **MERGED** production source at `ec71e59e21d19c85da37c408e9a5bb42bc344e82`.
- Normal PHP WordPress Build Website [#40242015072](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40242015072) **SUCCESS**: pending=60, mode=normal (no force), signed Astro run [#40242078822](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40242078822) IN_PROGRESS at checkpoint. Previous build #40240280529 independently PASS.
- Long-running independent WordPress legacy redirects batch [#40241415260](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40241415260) in progress concurrently; it does NOT own Contact Page/ESC Table. Normal PHP build initiated under verified build lock; do not deploy PHP/force anything.

## Remaining
1. Check signed Astro run #40242078822 conclusion, provenance/source SHA, signed deploy/activation and smoke.
2. Trigger read-only `pse-media-live-qa.yml` with exact **contact-only** marker after successful signed deploy. Script `scripts/pse-media-live-qa.mjs` now checks native WordPress / ESC Table DOM, native form exactly once, 5 verified warehouse cards, office-left/form-right 1440px, stacked at 768/390, no overflow, no admin URL, no public editorial notes. No email submissions.
3. If failure, investigate a specific selector/HTML/ESC cache issue; fix only source owner, then normal PHP build, not legacy Astro special-casing. Update final verified status.
4. Keep git source ↔ production distinct; no repeat CMS writes/import or already-successful native ESC Table creation.

Chế độ code: auto-build.

## Final production acceptance — 2026-10-26

- Astro signed WordPress-triggered deployment [#40242078822](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40242078822): **SUCCESS**, commit `ec71e59e21d19c85da37c408e9a5bb42bc344e82` verified in builder logs, signed PHP activation and smoke PASS. Trigger was **normal** WordPress Build Website [#40242015072](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40242015072) with `pending_count=60`, no force or bypass.
- Source-of-truth WP/ESC audit [#40241849466](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40241849466) **PASS**: Page #47222 `PrivatePage/contact` contains native `contact_00_vi` shortcode x1, ESC fields `key,label,required`, 6 editable items, CSS in ACF `cssmore`, native 5 warehouses, no placeholder.
- Live Chromium [#40242234252](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40242234252) **SUCCESS**: `PSE_CONTACT_TWO_COLUMN=PASS` at 390, 768, 1440; desktop office left and ESC form right; smaller widths stack; all 5 warehouses below; no internal note. `PSE_MEDIA_CONTACT_FORM=PASS` at all 3: exactly one form, five required inputs, Turnstile structure and native HTML5 empty invalidity, **no real submission/email sent**. No horizontal overflow, private WordPress hostname hidden.
- Final status: `CMS_OWNED_LAYOUT=PASS`; `CMS_ESC_FORM_AUTHORING=PASS`; `ASTRO_NO_HARDCODED_CONTACT_LAYOUT=PASS`; `SIGNED_PRODUCTION_DEPLOY=PASS`; `RESPONSIVE_BROWSER_QA=PASS`; `EMAIL_DELIVERY=NOT_TESTED` (intentional). This corrects earlier UI-only compliance report.

Chế độ code: auto-build.
