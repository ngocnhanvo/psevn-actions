# PSE reusable template — WordPress database cleanup checkpoint (2026-10-22)

Scope: only `ngocnhanvo/psevn-astro`, `ngocnhanvo/psevn-php`, `ngocnhanvo/psevn-actions`. No independent Astro builds. This file reports confirmed checkpoints, not a claim of a sanitized distributable database.

## Verified source and runtime boundary

- Frontend `github` DEV and `master` production source: source audit high-priority paths = 0 in both, [audit run 39731080272](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39731080272).
- Astro `master` offline unit tests: 96/96 PASS, [run 39729661286](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39729661286).
- WordPress frontend/domain, SEO and FTPS checks had passed earlier.
- Astro production build/deploy is **not** triggered by this task. Only the WordPress/PHP Build Website tool may trigger Astro builds.

## Database checkpoints, in strict order

1. [Run 39730902436](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39730902436) — UpdraftPlus WordPress database-only backup, local protected backup, remote cloud copy disabled. PASS.
2. [Run 39731611908](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39731611908) — removed precisely 4 research student + 1 research teacher test accounts through native WordPress admin, retained one administrator. PASS.
3. [Run 39731855019](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39731855019) — second database-only recovery snapshot. PASS.
4. [Run 39732505337](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39732505337) — WP admin content audit: 0 posts, 5 pages, 2 media, 0 comments, 1 user, 1 general-information record, 5 ACF field groups, 39 plugins installed/27 active. One page title and three page editor contents contain legacy brands, two page editors contain contact data; general-information editor has one legacy-source indication. This was READ ONLY.
5. [Run 39732754269](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39732754269) — protected Updraft SQL read-only audit: 94 table schemas including 5 NCKH-named tables. Most inherited Blue Sea domain references were disposable transient/cache entries; chat history and agent knowledge are separate data stores.
6. [Run 39734264698](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39734264698) — one-time WP admin nonce + capability guarded cache/chat cleanup: **303 transient rows**, **4,437 historical chat rows**, **39 chat summary rows** in the preflight. Cleanup PASS; the temporary FTP-deployed PHP admin tool was **removed** (confirmed PASS). A fresh DB-only local UpdraftPlus snapshot was created and fully scanned through verified FTPS.
7. The after-cleanup SQL snapshot had **112** Blue Sea domain references (previously **11,213**) and **487** Blue Sea label references (previously **1,427**), plus 30 old research-domain references. These are occurrence counts, not distinct records.
8. The after-cleanup backup still contains inherited page/postmeta, Agent knowledge, Media Cleaner and Yoast-index data. These are **not** wholesale deleted or string-replaced since some entries are WordPress/ACF/TablePress/Agent structural data, and accidental edits could break the template.

## Remaining scope / must not repeat

- Do not rerun the two user-deletion actions. The single administrator is intentional.
- Do not rerun backup jobs that already PASS simply to repeat prior steps. Create new backups only **after new DB changes**.
- Do not re-upload the temporary WP admin PHP file; it has been removed. It was used only for disposable transients and old chat history.
- Pending: classify the five pages, their ACF fields, the general-information value(s) and historical Agent knowledge before a bounded data-content cleanup. Keep ACF definitions, page identifiers/actions, menus, TablePress structures and system/plugin schemas unless verified unneeded.
- Pending: a separate **sanitized and restoration-tested database clone** for actual reusable distribution. The live UpdraftPlus backups are recovery snapshots and may include passwords, secrets, old business data, and non-template records. NEVER publish or commit them.
- No GitHub or Actions CI PASS proves that the distributable template DB is clean. Treat it as **NOT YET CERTIFIED** until restored to an isolated environment with expected content/roles/plugins and zero private/legacy residue.

Sources of truth: workflows, SHA-linked GitHub Actions logs, and WordPress WP-admin; not prior chat guesses.

## Page-level content review (read-only)

[Run 39734883912](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39734883912) confirmed the specific residual scopes. IDs are WordPress post IDs for a future *bounded* cleanup, **not authorization to delete pages**.

- Pages `51979`, `51950`: no inherited brand or private-contact flag.
- Page `248`: inherited brand in ACF `cssmore` (CSS that may control UI); no detected embedded layout in editor. **Do not blindly clear or regex-replace its CSS**.
- Pages `53390`, `47222`: inherited brand text **and** contact-like content; no embedded script/TablePress/layout marker detected by the read-only classifier. Review and neutralize only after confirming page purpose and preserving required page/action/shortcode identity.
- The single `thong-tin-chung` record: inherited company branding specifically in ACF field `tencongty`. Its front-end `domain` setting had been verified to match the PSE environment earlier.
- Two media items had no inherited-source/contact flags. Keep them until attachment use is verified.
- Exactly 1 administrator, 0 old research roles and 3 recent DB backup records were verified at this review.

The scanner only checked selected editor fields and regular expressions. No assertion is made that these are the only possible stored secrets, archived revisions, plugin options or old URLs. A reusable DB still needs an isolated clone/restore and exhaustive privacy/identity check.
