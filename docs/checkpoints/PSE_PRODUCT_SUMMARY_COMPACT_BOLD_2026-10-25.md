# PSE Product excerpt: compact lines and bold section headings (2026-10-25)

## Owner request
After confirmed 44/44 native WP Product excerpts were rewritten into separate paragraphs, user reports gaps too large in product cards and `Thành phần:` / `Loại cây:` visually not bold. Target: compact, airy lines and bold labels without data edits, category changes, SEO or rerunning completed product migration.

## Governing scope
- Knowledge: `ngocnhanvo/knowledge`, branch `main`, AGENTS + CORE 01-08 + relevant WordPress/Astro/Actions policies read.
- Astro: `ngocnhanvo/psevn-astro` development `github` and production source `master`.
- WordPress/PHP: `ngocnhanvo/psevn-php` `master` (no code change).
- Execution: `ngocnhanvo/psevn-actions` `main`.
- Code mode: `auto-build`. Build only through authenticated WordPress/PHP **Build Website**; no independent Astro dispatch or forced build without owner-authorized exception.

## Verified input: do not redo
- 44/44 native WordPress Product excerpts previously updated with structured HTML `<p>` lines, `<strong>Thành phần:</strong>` and `<strong>Loại cây:</strong>` and validated in six CMS batches. See `docs/checkpoints/PSE_PRODUCT_EXCERPT_LINES_2026-10-25.md`.
- Root cause **on Astro**: `productSummaryText` intentionally sanitized CMS HTML to plain text and preserved `\n\n` between `<p>` blocks; SSR and client listing rendered `whitespace-pre-line`, causing oversized gaps and lost bold headings.
- Product/category identity, full Product description, 44 CMS excerpts and WordPress fields **unchanged in this task**.

## Applied source changes (DONE)
- Astro `src/lib/wordpress/products/productSummary.ts`: add `productSummaryLines` which collapses paragraph gaps, marks `Thành phần:` and `Loại cây:` as headings, and keeps complete source text/numerical values.
- Astro `src/astro/pages/ProductsSSRPage.astro`: SSR compact one-row-per-specification paragraphs, `leading-[1.5]`, `mb-1` (4px), `mt-3`, bold section labels, preserve HTML escaping/true CMS SSR/category links.
- Astro `src/astro/pages/ProductsPage.astro`: parallel safe client render with HTML escaping, same spacing and bold labels, original search fields retained.
- Added/adjusted Vitest contract and parser-like tests for paragraph format, strong labels and listings. Exactly six Astro files changed.
- Astro `github` tip was `d140b0ced44750ad6cbf7fb7fc035668d60eac6f`.
- Independent no-build/no-FTP GitHub Actions [#40167540201](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40167540201) **SUCCESS**.
- Astro [PR #48](https://github.com/ngocnhanvo/psevn-astro/pull/48) merged `github` into `master`: **`562ae62d2b9a7bd4e0484cd31584a4a667a73dac`**. Code merged successfully; this does NOT equal deployment.

## PHP WordPress release — guarded normal request BLOCKED (do not rerun unchanged)
- Existing official workflow [#40167696434](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40167696434) attempted authenticated WordPress/PHP Build Website with normal mode, **not forced**.
- Workflow preflight succeeded; WordPress reported `PSE_WP_BUILD_STATUS_CHECK=success` and `PSE_WP_PENDING_CHANGE_COUNT=0`.
- Native guard emitted `PSE_WP_BUILD=NO_PENDING_CHANGES; no owner-approved exception on this event` and exited code 2; workflow reports FAILURE because no build was authorized. **No new Astro build, FTPS deploy or live UI verification occurred.**
- This guard behavior is correct. Do NOT retry normal build without new genuine pending WordPress changes. Do NOT dispatch GitHub Actions Astro independently. Do NOT fabricate/alter CMS data just to increment WordPress pending counts.
- **BLOCKER:** owner must explicitly approve one-time exceptional build of Astro `master` `562ae62d...` via the WordPress/PHP tool (or another genuine WordPress content change must create legitimate pending changes). Existing workflow exceptional path requires exact explicit owner-approved marker; do not invoke automatically. Await that approval before deploy.

## State
`WP_PRODUCT_EXCERPTS=PASS(pre-existing 44/44)`; `ASTRO_SOURCE=PASS`; `ASTRO_TESTS=PASS`; `PR_MERGE_MASTER=PASS`; `WORDPRESS_NORMAL_BUILD=BLOCKED(pending_count=0)`; `SIGNED_DEPLOY=NOT_STARTED`; `LIVE_VISUAL_QA=NOT_TESTED`.

## Resume after owner approval
1. Confirm FE `master` remains `562ae62d...`, WP build lock idle, no newer actual deploy, and not already queued; do not redo code/tests/merge.
2. If the owner explicitly authorizes exceptional build, use existing authenticated WordPress/PHP Build Website one-shot exception only; monitor resulting GitHub signed run, no direct Astro dispatch.
3. Run independent READ-ONLY Playwright against production 390/768/1440px verifying actual rendered specification line spacing, `<strong>` labels and correct data, then record deployment SHA/run and checkpoint status.
