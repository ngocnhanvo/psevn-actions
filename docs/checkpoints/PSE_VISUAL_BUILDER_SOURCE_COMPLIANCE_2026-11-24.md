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
6. Second frontend build source `7685cd88d44e3ddd76b838d14230f089fcd43f31`:
   - Normal WordPress Build Website `#45404178279` correctly declined `NO_PENDING_CHANGES` (source-only change; pending_count=0). No unauthorized independent dispatch.
   - Existing one-time owner Visual Builder exception through authenticated WordPress PHP Build Website `#45404396515` SUCCESS.
   - Production deployment `https://github.com/ngocnhanvo/psevn-actions/actions/runs/45404569944` initially FAILED protected runtime .env FTPS guard `ValueError`; separate ZIP staged but not activated. Retried same failed job with all security checks intact: **run attempt #2 SUCCESS** (source pin `7685cd88d44e3ddd76b838d14230f089fcd43f31`), includes signed activation of staging bundle, verified FTPS, PHP rollback support. Do not bypass runtime .env guard.
7. Authenticated read-only WordPress Builder live QA `https://github.com/ngocnhanvo/psevn-actions/actions/runs/45405415059` **SUCCESS** (actual WP cells, media chooser, header/footer, no CMS writes). This is not Save/read-after-write proof.
8. Additional source anchors for static Home_09 `24d4be7c216ea7c231bfbfd10b0a825667a31087`, Home_11 `198e36a6a3ad6710a2bdecd6e48103e08df2e095`, Home_13 `8ccbb535e120ea52c2416483b835bbd36eb4b6dc`. Pse_00 hero `71f503b900468e4558c8dd99b3a4e4e643daaf93` retains physical sourceRow through filtering and adds preview-only missing-row placeholder + real banner controls, keeping public rendering unchanged.
9. Third source-only CI `https://github.com/ngocnhanvo/psevn-actions/actions/runs/45406005569` SUCCESS, native authenticated WordPress build request `https://github.com/ngocnhanvo/psevn-actions/actions/runs/45406157928` SUCCESS, Astro production deploy `https://github.com/ngocnhanvo/psevn-actions/actions/runs/45406274079` **SUCCESS** pinned `71f503b900468e4558c8dd99b3a4e4e643daaf93` (signed activation, ZIP FTPS and protected runtime env FTPS verified). 
10. Final postdeploy read-only Playwright rerun requested via marker commit `6ec3fa436c5df5048d6e954700dac0ac6d62e652`; inspect exact result before claiming pass.

## Continuation — 2026-11-24 (source-only, not a production release)
- Astro `master`: `2549b9c` removed fake committed cards and false success acknowledgement; `4230974` added the insertion/coordinate regression; `38b4864` shared the pending/refresh policy across insert and delete; `ac18fb0` covers unsupported saved deletion. Real component adapter must acknowledge success, otherwise old SSR coordinates remain unmodified and user is told to refresh.
- PHP `master`: `cf2816f` locks Add/Duplicate/Delete/Swap when table source is stale, checking all entry points; `dae09dd` closes the post-deletion Add window; `0bc22d4` adds PHP-rendered JS source-regression assertions.
- Actions `main` schema-CI markers `c436814`, `35b0f3a`, `e30a24c` requested the existing **NO BUILD / NO FTP / NO CMS WRITE** source checks (newest pin was PHP `0bc22d4` + Astro `9c001a2`). The workflow run ID and conclusion are still not available through the connected commit-status/PR-run actions. A further source patch after these pins must be retested before CI PASS can be claimed. Source commits are **not CI-verified or deployed** in this checkpoint.
- No WordPress live Save/read-after-write performed. No new Astro Build Website request or production FTPS release attempted for these commits.

- Additional Astro `master` fixes: `4f62fbc` disallows stale preview button interactions through the shared editability cues, with test `9c001a2`; `c568ab4` strips physical row identity from temporary draft card, with test `e9a68eb`. This closes an accidental source-selection path without enabling unsupported writers.

- Astro `master` further fixes: `bb28198` grouped hotline Preview swap/cancel adapter, `222727a` retains nested ESC cell source-row identity on generic swaps, `b40d547` tests hotline group order + unsafe inputs, `4526445` supports self-wrapped hotline preview, `a3e0763` enforces exact nested source ownership, `e8b0171` rejects generic swaps with row markers outside the moved cards, `df391d0` tests that case. No proof of actual WordPress write or deployed UI yet.

## Remaining work (must not report DONE)
- S2 Product/Page manual references, S3 ProductCategory refs, S4 REST manual refs: PHP item manager still rejects nonempty `meta.api` entirely. Build source-specific key/reference picker, distinct local field writer, validation of referenced IDs, and test that upstream API data never mutates.
- S5 `api-key=auto`: only safe template/filter/query settings; no manual card add/swap, and source ownership UI must explicitly distinguish automatic collections from manually indexed references.
- Section lifecycle: add/remove/duplicate/show/hide missing; current PHP `section-order.php` only supports safe section swap/order, and rejects duplicate table IDs. Implement occurrence-aware structural identities and Page-source guarded writes, not artificial DOM-only duplicate.
- The generic committed placeholder is now removed (source fix `38b4864`), and unmatched insert/delete Preview explicitly returns `matched:false`, marks region pending and locks PHP item edits until refresh (`dae09dd`). **Remaining BUILDER_GAP:** implement exact source-backed re-render adapters for other sections beyond Home_00/Home_01; current fail-closed behavior is not equivalent to full inline Preview editing.
- Source identity gaps remain in mixed API/news `Pse_01.astro` and mapped API records `Home_04..08` without physical TablePress row invariant. Pse_00 native hero source-row identity is fixed at `71f503b...`. Never tag API expansion index as source-row ID.
- `Pse_hotline.astro` grouped-card Preview adapter was added in Astro `bb28198` and hardened through `a3e0763`; JSDOM regression authored `b40d547`. It moves real source-tagged cards across canonical group boundaries and can restore on cancel. **Source-only pending QA**: Vitest, PHP readback, authenticated Preview/Save, mobile and production have not been verified, so do not mark this acceptance complete.
- Full WP Admin authenticated Playwright QA: click source/target in one Preview, cancel, save, WordPress read-after-write, refresh, public, stale version collision, 403, mobile. Use audit pages, preserve business data and do not leak secrets.
- Per-section CSS/WordPress Editor source taxonomy and editor field rights still require a sitewide ownership map.

## No-guess guardrails
- Never claim production release from a green source-only CI alone.
- Do not cross a source boundary to mutate Product, Category, Post, or remote REST response when editing a local ESC Table ref.
- Never reconstruct `sourceRow` from filtered, paginated, grouped or expanded API display index.
- Keep original DOM/layout and public SEO/links; no CMS test data.
- No independent Astro dispatch; WordPress/PHP Build Website is the only production build gate.
