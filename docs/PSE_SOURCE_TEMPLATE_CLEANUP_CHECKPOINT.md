# PSE source cleanup continuation — 2026-10-22

## Exact scope and code mode
- Target Astro: `ngocnhanvo/psevn-astro`, `github` (development only). Its `master` production branch was not modified in this continuation.
- Target PHP: `ngocnhanvo/psevn-php`, `master`.
- Target Actions: `ngocnhanvo/psevn-actions`, `main` (source-only CI coordination).
- **Read-only template references**, not writable targets: `ngocnhanvo/template-astro/github`, `ngocnhanvo/template-php/master`, `ngocnhanvo/template-actions/main`.
- Shared rules: `ngocnhanvo/knowledge/main`; code mode `auto`. No separate Astro build, no WordPress-triggered build, no frontend deploy or FTP PHP release occurred.

## Current verified source and checks (do not repeat these successful jobs)
1. Astro `github` commit [8be0b982](https://github.com/ngocnhanvo/psevn-astro/commit/8be0b9821578c85da4eb9e3dd331171c73b1d6f9) retired the old copied Getfly/quote/UI fixtures and aligned neutral-source tests. The changes are already present; do not reapply the stale changes from earlier failed CI.
2. [PSE Astro regression Actions 39822592443](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39822592443) SUCCESS: 68/68 test files and 311/311 tests, including source-only tenant boundaries, with no Astro build or deploy. Earlier failed job 39820912809 is superseded; do not rerun it.
3. PHP `master` commit [9e3b9fc0](https://github.com/ngocnhanvo/psevn-php/commit/9e3b9fc0fe3edf14a91637681affd2b0c9c372c7) deleted **three obsolete diagnostic MU profilers** (`esc-admin-profiler`, `esc-admin-hook-profiler`, `esc-admin-yoast-loader-profiler`) and **seven disabled Blue Sea workflow archives**. Core admin optimizers, ESC Agent, GitHub Trigger, WP theme and WordPress-controlled Build Website tool were left intact. Commit affects Git source; it does **not** prove those files have been removed from the live hosting account.
4. [PSE PHP Trigger Actions 39823181155](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39823181155) SUCCESS: PHP syntax, Agent fixtures, Build Website status/lock tests and repo/domain/security boundaries. `NO_ASTRO_BUILD` and `NO_FTP_UPLOAD` were explicitly reported.

## Fresh tree comparison with template reference
Path-and-blob comparison at this checkpoint (NOT an authorization to bulk-delete):
- Astro: 8 common-path source differences and 93 PSE-only files.
- PHP: 3 common-path differences and 218 PSE-only files (WordPress core/plugin/vendor trees are substantial and remain protected).
- Actions: 1 common-path difference and 138 PSE-only files (many are project workflows, audits, historic checkpoints and release tools).
- A unique filename is **not** evidence a feature, image, plugin or WordPress page can be deleted. Check active runtime references, WordPress page/menu mappings and release dependencies before removal.

## Remaining safe-review queue
- **Astro**: categorize PSE-only public homepage assets and obsolete `src/pages/api/quote`, `src/pages/api/files`, `src/pages/xem-truoc`, `supportAI` and extra tests. Preserve assets/routes that are still referenced by WordPress pages or active API consumers. Confirm no stale imports before deleting.
- **PHP**: verify actual usage of legacy webroot WHOIS scripts before removal, and review one-time migrators separately. Some legacy scripts disable TLS verification; do not deploy or reuse them as approved template behavior. Never delete plugin/vendor/core trees just because paths differ.
- **Actions**: classify one-time FTP/domain/DB maintenance workflows and trigger markers separately from Build Website, release, source tests and Playwright. Check run history and dependencies before retiring workflows; do not delete successful recovery artifacts or diagnostic capability without a rollback path.
- **Production**: no source-only test certifies live WordPress runtime or a new Astro build. PHP source removals are not FTP deployments; Astro source updates are not website builds. In `auto` mode, do not trigger the WordPress Build Website tool.

## Non-repeat boundary
No additional cleanup of users, WordPress ACF content, DB backups, template SQL, migrations or historic jobs was done here. The successful DB-template work is recorded separately in `docs/PSE_TEMPLATE_DB_CLEANUP_CHECKPOINT.md`.


## Post-merge closeout — 2026-10-23 (supersedes source-only branch status above)

- Astro PR [#5](https://github.com/ngocnhanvo/psevn-astro/pull/5) was **merged** from `github` into `master`, preserving both histories: final merge commit [`df6689c58ea3b36c9e3e41b545d8e62506bab5b0`](https://github.com/ngocnhanvo/psevn-astro/commit/df6689c58ea3b36c9e3e41b545d8e62506bab5b0); reconciled DEV commit `c918cefb0e1f179c8c4f2527cd06917ac36ccab7` is its parent. Both branch heads match exactly; GitHub compare reported `identical`, 0 ahead / 0 behind / 0 files different.
- DEV post-reconciliation [CI run 39827368052](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39827368052): **PASS 68/68 test files, 317/317 tests**. Includes the newly added generic WordPress SSR route regressions and verifies obsolete tenant routes were removed. No build/FTP.
- Production-branch [source-only CI run 39827235548 (attempt 2)](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39827235548): **PASS 68/68 test files, 317/317 tests** after the merge. Do not rerun its earlier failed attempt, which checked pre-merge source.
- [Release architecture run 39827307034](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39827307034): **PASS**. Actions CI and WordPress-controlled deployment workflow are aligned with active SSR routes `/api/user/info`, `/ssr/posts`, and `/ssr/products`; legacy `/api/auth/me`, `/so-tay`, and `src/lib/nckh` are no longer required by build validation. Preserve existing WordPress build trigger, FTP-TLS, signed unzip, sitemap Save revision, incremental cache and rollback.
- The Astro repositories were **source-only merged**: NO WordPress Build Website trigger, NO Astro production build, NO Astro FTPS publish and NO PHP FTP deploy as part of this merge. Live runtime parity remains unverified pending a separately authorized website build. Under `code: auto`, do not trigger that build.
- Old branch/test status in the 2026-10-22 checkpoint documents the previous state and is intentionally retained as history. Remaining cleanup queue (PSE-only assets, WHOIS/migrations, one-time Actions) is **not automatically resolved by this merge**; assess references and safety before further deletion.


## Follow-up cleanup — 2026-10-23 (after PR #6)

### Completed in Git source

- `psevn-astro/github`: deleted 5 old tenant artifacts: `src/pages/api/quote/index.ts` (Blue Sea Getfly/helmet-only endpoint), broken NCKH `src/pages/xem-truoc/index.astro`, plus `supportAI/input.html` (old ESC cart sample) and empty `supportAI/input.css`, `supportAI/output.tsx`. Commit [`71614433c04ef9e57a310b1c8ffe36182bce857c`](https://github.com/ngocnhanvo/psevn-astro/commit/71614433c04ef9e57a310b1c8ffe36182bce857c).
- [PSE DEV NO-BUILD CI #39828724003](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39828724003) PASS, including complete Vitest and explicit assertions that legacy routes and supportAI are absent. **Do not rerun** without source change.
- [Astro PR #6](https://github.com/ngocnhanvo/psevn-astro/pull/6) merged, final commit [`ebbd65c731e0ea5289d8507c327ea07d7adb3533`](https://github.com/ngocnhanvo/psevn-astro/commit/ebbd65c731e0ea5289d8507c327ea07d7adb3533). `github` fast-forward synced to exactly the same SHA as `master`, 0 ahead / 0 behind / 0 different files.
- `psevn-actions/main`: updated read-only `pse-postdeploy-verify.yml` to require active WordPress SSR `/api/user/info` + robots and homepage instead of retired `/api/auth/me` and `/so-tay`; change [`0a69be2`](https://github.com/ngocnhanvo/psevn-actions/commit/0a69be2f8d1911c4fa8dc3b50ed78efbf24370b5). This change is **source-only, no live postdeploy check was run**.
- Actions [`4174a99559ff77e195c3d1a46ec3f79de1957387`](https://github.com/ngocnhanvo/psevn-actions/commit/4174a99559ff77e195c3d1a46ec3f79de1957387): removed 5 orphan one-time trigger markers with no listeners among the 25 active workflows: `.pse-legacy-optimized-media-probe`, `.pse-media-import-request`, `.pse-node-restart-once-trigger`, `.pse-placeholder-upload-request`, `.pse-source-import-trigger`. Past requests survive in Git history; executable and maintenance workflows stay intact.
- `psevn-php/master`: corrected outdated root README and removed superseded import-only `MIGRATION_STATUS.md`. Current SHA [`eea71feb77e3cec4ec25170f7e9d59759209d875`](https://github.com/ngocnhanvo/psevn-php/commit/eea71feb77e3cec4ec25170f7e9d59759209d875). Documentation change **not** uploaded to PSE FTPS.

### Protected or unverified items intentionally retained

- Legacy `whois_memberall.php` and `whois_qte_price.php`: standalone old root PHP handlers contain insecure TLS configuration and dependencies external to the tracked WP repo. Their external callers / actual host files were not conclusively identified. **Do not run, expose as supported template endpoints or delete live hosting files until usage is verified.** Read-only public HTTP access could not confirm status.
- `public/home-first/`, `public/logo-first/`, `public/tool/`: no direct references in the 14 checked Astro Home TablePress component sources, but WordPress-managed dynamic Page/TablePress data may reference them. Retained pending a verified site-wide WordPress asset-reference inventory. Do not bulk-delete images by path/name alone.
- `src/pages/api/files/[...path].ts` is still targeted by `scripts/inject-handler.js` for WordPress document rewrites; retain. Other WordPress API, cart, commerce, SSR routes, plugins, core files, active diagnostic CI, FTPS/rollback, DB safety tooling and archived historical recovery records retained.
- No WordPress-managed Astro build, Astro FTP deploy, PHP upload or live database update occurred in this continuation. Current production website artifact may differ from the newly merged Astro source, and the postdeploy verification remains NOT TESTED on that artifact. `code: auto` prohibits auto-triggering Build Website.
