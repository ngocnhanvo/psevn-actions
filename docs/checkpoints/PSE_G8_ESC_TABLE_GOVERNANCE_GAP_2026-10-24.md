# PSE G8 follow-up — ESC Table governance gap on Thành tựu

Date: 2026-10-24. Code mode: `auto-build`. Status: **ARCHITECTURE/EDITOR EXPERIENCE GAP IDENTIFIED; MIGRATION NOT STARTED**.

## Knowledge rule and decision

Read `ngocnhanvo/knowledge` `main`, `stacks/wordpress-editor-esc-table.md`, especially **Quy tắc thiết kế trang web** sections 2, 3, 4, 5, 6 and **Ảnh trong ESC Table: bắt buộc Insert Image + ALT SEO**.

- ESC Table/TablePress is the DEFAULT for independent layout sections on introductory/landing pages, even where pure HTML/CSS is sufficient, to enable Visual Builder section management.
- Collections of individually editable cards/photos use ESC Table structured items to support order/change/replacement; item drag/drop must be tested separately, not assumed.
- Plain WordPress Editor HTML is an exception for fixed prose/editorial article content, NOT for a structured list of repeatable award cards.
- ESC Table insertion into WordPress Page editor **must use the native Insert Code tool**. Never paste shortcode as plain text. Each real picture must be inserted through native Insert Image with meaningful image-specific ALT; Astro must use processed image object from `src/lib/wordpress/tablepress/getData.ts`.

## Verified current implementation and issue

- Page: WordPress `/thanh-tuu` (previous corporate pages audit lists ID `79311`, verify live before any write), `action=PublicPage`, key `pse-company-thanh-tuu`.
- Current WordPress body still contains imported Joomla nested HTML `<table id="Table_01">...`, 8 award years 2026, 2015, 2013, 2012, 2011, 2010, 2009, 2008, with image+year+list text. Screenshot of Classic Editor shows these remain one legacy HTML table rather than items managed in ESC Table.
- Astro G8 PR [#31](https://github.com/ngocnhanvo/psevn-astro/pull/31) at `c36b65f8a5006dad5c1e9bed69bf9a34845b0f63` uses `src/lib/seo/pseAchievementCards.ts` to re-parse that HTML table into card markup. Production signed FTPS [#40095521462](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40095521462) PASS; visible desktop/mobile 8 cards/8 images read-only QA [#40095682224](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40095682224) PASS.
- **This is UI-only success, NOT correct CMS/Visual Builder architecture.** The user correctly objected. The earlier implementation violated the knowledge default by failing to offer structured ESC Table item authoring.

## Corrective migration outline (NOT DONE)

1. Preflight actual Page content, ESC Table availability/schema, existing table IDs and ESC Table editor Insert Code/Insert Image capabilities. Audit existing WordPress table and Page records with authenticated read-only tools. Never invent an ID or schema.
2. Back up Page raw content, ACF `action/key/cssmore`, image sources/alt, years and award lists, with checksums and rollback identifiers, avoiding public secrets.
3. Using ESC Table's **native table editor**, create one independently managed awards section with structured rows (`year`, `image`, `description` or `details`), one row per verified award, preserving all 8 items and their order. Insert images natively with descriptive ALT. Confirm save/reload/edit, row reordering and restore.
4. Implement the corresponding `src/astro/tablepress/<verified_shortcode_component>.astro` using `data.items`, processed image objects, accessible card UI. Do not reparse raw `<table>`/image strings. Do not modify shared build/cache/SSR architecture or hardcode the eight awards. Existing G8 design can be retained but the data source must change to ESC Table.
5. Insert the native ESC Table block/shortcode using WordPress **Insert Code** (not raw text), maintain Page `PublicPage` `action/key`, verify Visual Builder recognizes the section, supports section management, and test individual item edit/reorder separately.
6. Test page, preview and Builder, compare years/images/full description text to source, mobile/desktop rendering, SEO and 9 sibling menu links. Build ONLY via authorized PHP WordPress Build Website in `auto-build` after proper native CMS changes and source merge. Remove obsolete G8 HTML-to-card adapter only after CMS migration and QA prove it unused; preserve rollback.
7. Treat schema/admin access/capability failures as a blocker for only the migration, not grounds to invent raw shortcode writes or declare done.

## Current status and safety

- **Current production G8 card UI remains unchanged and passing.**
- **ESC Table migration: NOT STARTED**, no new ESC Table was created, no WP record was modified, no CI/build/FTP was triggered by this checkpoint.
- Do not treat frontend card QA as evidence that ESC Table/Visual Builder authoring works.
