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
