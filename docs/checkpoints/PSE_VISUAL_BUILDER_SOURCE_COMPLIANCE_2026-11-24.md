# PSE Visual Builder source-contract compliance — checkpoint 2026-11-24

Status: PARTIAL. This checkpoint records exact source / deployment evidence and deliberately separates shipped functionality from unsupported source types.

## Required knowledge
- `ngocnhanvo/knowledge@main/stacks/esc-visual-builder-section-item-management.md`
- `ngocnhanvo/knowledge@main/stacks/esc-visual-builder-theme-source-labels.md`
- `ngocnhanvo/knowledge@main/stacks/wordpress-astro-theme-visual-builder.md`
- `ngocnhanvo/knowledge@main/stacks/esc-table-cell-coordinate-contract.md`
- Source branches: `psevn-php@master`, `psevn-astro@master`, `psevn-actions@main`.

## Completed and tested
1. `psevn-php` source SHA `623426c84f5049c1d04ff108fd02ddc36139939c`:
   - Removed all list-based swap selection/fallback from `includes/item-section-ui.php`.
   - Item swap requires source + target clicks on live Preview and positive iframe preview acknowledgement before WordPress write.
   - Missing row anchors or unsafe component DOM swap returns `BUILDER_GAP`, never writes.
   - Source red, destination green, source-swap UI does not allow blind selection.
   - Dynamic API item mutation controls stay disabled until a source-specific reference writer can be validated. This is intentionally **not** a claim that S2–S4 support is finished.
2. `psevn-astro` source commits:
   - `d57fdefd11582ea1e5132ac6b9596282bdcd50e9`: source/target Preview colors red/green.
   - `d55e6bbd5b64af7667305b33c8779ff910299928`: static vs WP Product/Page/category/REST API editability source descriptions.
   - `b32b9adcc98f8a8f7ce1f7fd66c52781ab5f224a`: FAQ physical source row retained despite filtering hidden/empty rows.
   - `3a3f30b892c5aa3026bb289d2ee6c13f2d0a5f98`: hotline grouped cards annotated with source rows.
   - `38ef58390e7076bfde157a57d3451e89a91f5023`: warehouse card source-row adapter, with child card change `d8c3e282a8023073559360dd284ce0070d119cbe`.
   - `5456a9e00b1fb4fc367f640c98cc329c0f2cd653`: corporate-history timeline row markers; `readPseHistory` maintains strict public validation and renders sanitized repair placeholders inside authenticated Builder preview.
   - `7685cd88d44e3ddd76b838d14230f089fcd43f31`: S04 sustainability highlight rows annotated without changing public three-card limit.
   - Tests added/updated for source label, green destination and history repair.
3. Source-only CI:
   - Initial `https://github.com/ngocnhanvo/psevn-actions/actions/runs/45402421099` SUCCESS.
   - Extended PHP item + Astro source-row CI `https://github.com/ngocnhanvo/psevn-actions/actions/runs/45403973054` SUCCESS.
4. First PHP live release `https://github.com/ngocnhanvo/psevn-actions/actions/runs/45402751626`: SUCCESS, checksum/readback/rollback-capable FTPS.
5. First frontend build `https://github.com/ngocnhanvo/psevn-actions/actions/runs/45403146731`: SUCCESS through native WordPress Build Website.
6. Second frontend build requested through same native WordPress gate at `https://github.com/ngocnhanvo/psevn-actions/actions/runs/45404178279` for Astro master `7685cd88d44e3ddd76b838d14230f089fcd43f31`. Confirm resulting production deploy run and actual pinned SHA; do not mark as deployed before success.

## Remaining work (must not report DONE)
- S2 Product/Page manual references, S3 ProductCategory refs, S4 REST manual refs: PHP item manager still rejects nonempty `meta.api` entirely. Build source-specific key/reference picker, distinct local field writer, validation of referenced IDs, and test that upstream API data never mutates.
- S5 `api-key=auto`: only safe template/filter/query settings; no manual card add/swap, and source ownership UI must explicitly distinguish automatic collections from manually indexed references.
- Section lifecycle: add/remove/duplicate/show/hide missing; current PHP `section-order.php` only supports safe section swap/order, and rejects duplicate table IDs. Implement occurrence-aware structural identities and Page-source guarded writes, not artificial DOM-only duplicate.
- Generic saved-item Preview in `builderSectionDrafts.ts` can still use committed placeholder cards instead of exact component re-render. Replace with source-backed component adapter or block further edits and require verified refresh; never call placeholder parity complete.
- Source identity gaps in hero `Pse_00.astro` and mixed API/news `Pse_01.astro`; `Home_04..08` use mapped API records with no physical TablePress row invariant. Never tag API expansion index as source-row ID.
- `Pse_hotline.astro` grouped cards: across-group swaps cannot pass generic sibling-root safety. Need group-aware component adapter whose Preview accurately reproduces the canonical WordPress data transform.
- Full WP Admin authenticated Playwright QA: click source/target in one Preview, cancel, save, WordPress read-after-write, refresh, public, stale version collision, 403, mobile. Use audit pages, preserve business data and do not leak secrets.
- Per-section CSS/WordPress Editor source taxonomy and editor field rights still require a sitewide ownership map.

## No-guess guardrails
- Never claim production release from a green source-only CI alone.
- Do not cross a source boundary to mutate Product, Category, Post, or remote REST response when editing a local ESC Table ref.
- Never reconstruct `sourceRow` from filtered, paginated, grouped or expanded API display index.
- Keep original DOM/layout and public SEO/links; no CMS test data.
- No independent Astro dispatch; WordPress/PHP Build Website is the only production build gate.
