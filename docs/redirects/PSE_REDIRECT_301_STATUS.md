# PSE — Legacy Joomla path 301 checkpoint (2026-10-26 +07:00)

## Owner's updated scope
- **Primary acceptance:** old-style Joomla `*.html` paths **when requested on the current Astro hostname** must issue HTTP **301 Location: /new-path** (root-relative), preserving whatever frontend hostname is used now or in the future.
- Example: `/pvfcco-pse/thong-diep.html` -> `/thong-diep`, only if WordPress has a published equivalent and frontend target is 200 with matching canonical.
- Cover Pages, native Post detail, taxonomy/listings and verified Products, retaining content/category identity. No catch-all `*.html` rewrite toward nonexisting or unrelated pages. The old `pse.vn` Joomla hosting and DNS are **outside this phase**.
- Retire **exactly 22** inherited helmet redirects, scoped by seed key `seo-legacy22:`; keep 14 structural WordPress SSR Rewrite rules and user-authored rules. No pinned domain in new redirect targets.
- Source of truth: WordPress `chuyen-huong-link` CPT + Astro compiled routing cache. Browser redirects require a later authorized WordPress-triggered Astro build.

## Verified work completed
1. `ngocnhanvo/knowledge/main` policies CORE-01..08 and applicable WordPress/Astro/Actions stacks read. Code mode `auto-build`; Astro build only from PHP/WordPress **Build Website**.
2. `ngocnhanvo/psevn-php/master`: removed seed mappings of 22 helmet paths and bumped seed from v5 to `2026-10-data-routing-v6-pse-clean-legacy22`. Changed stale cleanup to only trash `seo-legacy22:` via `wp_trash_post`, not delete unscoped routes with SQL. PHP routing regression updated. Commits `7bcb116d608fc5ddc57139a76a8be8483e954d11`, `f2c27df19bfd4767570166c24ba61005610b8fe2`, `8492729cd2b8a4c08977deac825fdc7a8c135566`.
3. `ngocnhanvo/psevn-actions/main`: protected FTPS allowlist for `esc-url-routing-manager.php`, PHP lint/route contract added; trigger commit `52d9034a9134e4c1be54cb210e5d4c4d3fa53f64`. **PHP release PASS** [run #40217158168](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40217158168), no Astro build from PHP FTP workflow.
4. Native WordPress CMS Playwright auditor/guarded applier `scripts/pse-legacy-redirect-301.mjs` and workflow `.github/workflows/pse-legacy-redirect-301.yml` committed. Reads native Pages/Posts/Categories/Menus and source article inventory, verifies targets HTTP 200/canonical, avoids collisions, creates exact relative redirect CPT records with readback, moves only 22 confirmed helmet seed rules to WordPress Trash on authorized **apply** mode, stores rollback inventory artifacts. Script updated to `a53d02a5e2415d2f35bfbad76d54cbf3913c9bdd` (bounded four-way target verification; does not rerun in-flight jobs) and `2b9cb9f08f409bd88926a08dbb813755c38d74b2` derives legacy-host identities from tracked source inventory rather than literals and includes category aliases for three known source category URLs only when WordPress taxonomy is present.
5. Live acceptance test added: `scripts/pse-legacy-redirect-live-qa.mjs` + `.github/workflows/pse-legacy-redirect-live-qa.yml` ([commit `db0bdbee`](https://github.com/ngocnhanvo/psevn-actions/commit/db0bdbee425ff90efe0b34de6a13176fe9c1f14a)). This read-only job uses the current configured frontend origin, checks each published PSE 301 from native WP registry for **actual HTTP 301, relative Location, exact 200 target, consistent canonical** and 12+ unchanged SSR Rewrite rules. Trigger only after CMS apply plus WordPress-controlled build using `.pse-legacy-redirect-live-qa-trigger`; no premature trigger created.
6. Read-only audit Actions [#40217462368](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40217462368) **IN_PROGRESS** at 2026-10-26 ~00:48 +07; second queued audit [#40217473093](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40217473093) **PENDING**. Do not claim those succeeded or rerun while ongoing. These two use earlier script SHAs; after completion any further apply uses latest `main` script.
7. Other PSE Jobs in flight: [#40217462402](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40217462402) independently triggered Astro production deploy via authenticated WordPress PHP **completed SUCCESS** (not triggered by this redirect work); avoid duplicate builds or CMS collisions.

## Accurate status
- `PHP_SOURCE_CLEANUP=PASS`, `PHP_FTPS_DEPLOY=PASS`.
- `WP_22_LEGACY_RECORDS_TRASHED=NOT_YET_VERIFIED` — removing seed code does not remove CPT records; CMS apply still required.
- `WORDPRESS_REDIRECT_INVENTORY=IN_PROGRESS`; `PSE_PAGE_POST_CATEGORY_MAPPING=PARTIAL`; `PRODUCTS_MAPPING=NOT_VERIFIED`.
- `ASTRO_REDIRECT_BUILD=NOT_STARTED_BY_THIS_TASK`; `LIVE_301_PASS=NOT_TESTED`; no full parity claimed.

## Exact next actions
1. Inspect **finished** runs #40217462368 and #40217473093, their job logs and artifact `pse-legacy-redirect-audit`; do not rerun completed PASS. If failed, fix concrete error, rerun only relevant audit.
2. On valid inventory with safe verified targets and helmet records, commit ONLY `.pse-legacy-redirect-301-trigger` with message **`cms(pse): apply source-verified legacy 301 redirects`**. This enables guarded CMS writes in `scripts/pse-legacy-redirect-301.mjs`; read run and backup artifacts. Re-run read-only verification after writes and confirm 22 are trashed, rewritten CPT entries published, 14 structural rewrites unaffected.
3. Expand manifest to **all known** legacy Pages, Posts, Categories, Products using source crawl and native CMS published IDs/slug, without fabricating unmatched Product records. Preserve skipped/unmapped manifest.
4. When prior WordPress-triggered Astro build finishes and CMS redirects have genuine pending changes, use only authenticated **WordPress Build Website** tool with nonce/lock, *never dispatch Astro build workflow directly or force without authority*; monitor release and verify actual frontend HTTP301/Location/path200 with Playwright.
5. Trigger live QA by updating `.pse-legacy-redirect-live-qa-trigger` after authorized WordPress-controlled release; read its run/artifact, fix any FAIL. Record counts of legacy source URLs, matched, target200, CMS rules published, unverified/excluded, actual live 301 and errors. Require zero collisions, loops, admin origin exposures, wrong-content 301s. Save final report/rollback and checkpoint.
6. A scheduled hourly, seven-occurrence continuation task was created to pursue at least a six-hour checking/continuation window; it is **periodic execution, not a guaranteed continuous six-hour agent session**.

## Boundaries / rollback
- All redirect destinations root-relative. No production DNS/cutover of old Joomla host, no raw wp_posts deletion, no removal of 14 structural system routes.
- PHP rollback is source commit revert + approved protected FTPS release. WordPress 22 helmet routes are trashable/restorable; newly created redirect CPT IDs in the audit artifact can be put in trash. Astro change requires normal WordPress-controlled build.
