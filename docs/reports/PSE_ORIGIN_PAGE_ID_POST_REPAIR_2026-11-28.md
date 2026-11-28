# PSE — 48 Joomla original Posts: origin metadata production repair (2026-11-28)

## Result

- **WordPress metadata repair:** PASS, [run #46098496736](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46098496736). Exact job log: `PSE_ORIGIN_48_ROOT_REPAIR=PASS changed=48 skipped=0 readbacks=48 adminSearch=12`.
- **Independent post-repair census:** PASS, [run #46097644036 attempt 2](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46097644036). All **792/792** WordPress Posts returned; `withNonemptyOrigin=0`, `suspectRecords=0`, `emptyOrigins=792`, `acfWithOrigin=792`; 52 serialized empty ACF arrays are root-empty, not translation references.
- **Rollback checkpoint:** Existing UpdraftPlus verified a fresh, local, database-only backup before modifications (`PLUGIN_ACTIVE=PASS`, `NEW_DB_BACKUP_LISTED=PASS`, `BACKUP_ROWS_VERIFIED=1`, `NO_REMOTE_TRANSFER=PASS`). No remote backup location or backup contents were published.
- **CMS changes:** On the 48 exact allowlisted original Vietnamese WordPress Posts, cleared mistaken `acf.origin_page_id` and preserved the historical numeric ID in independent `pse_joomla_source_id` field. No other Post IDs were written.
- **Integrity:** All 48 same-identity post-readbacks confirmed root-empty, correct separate source ID, and unchanged type, publication status, title, slug, publish date (seconds), link, HTML content, excerpt, categories, featured media, ACF `action`/`key`, and locale.
- **Native WordPress Admin search:** 12/12 representative Posts located after the repair, including historical galleries and company articles.

## Provenance qualification

- 15/48 Joomla IDs have independent owner Joomla SQL manifest evidence at `docs/source/pse-company-15-joomla-created-seconds.json` (matched Joomla source ID, WordPress ID, slug and exact publish date).
- For the other 33/48, their ID values were carried over from the old, invalid `origin_page_id` field by owner-authorized migration, protected by exact WordPress ID/title/VI/status/action/key and non-conflicting source ID checks. Independent source SQL matching for these 33 IDs was **not** done in this repair run. Do not cite them as independently source-SQL-proven.
- Historical evidence and allowlist: `docs/reports/PSE_ORIGIN_PAGE_ID_POST_CENSUS_2026-11-28.md` and `docs/source/pse-origin-page-id-48-repair-20261128.json`.

## Execution

- Workflow: `.github/workflows/pse-origin-page-id-48-repair.yml` (single permitted `main` push marker trigger, exact commit message, existing WordPress credentials, backup gate, record allowlist, read-before-write and read-after-write).
- Code: `scripts/pse-origin-page-id-48-repair.mjs`.
- Apply request commit: `007f04a939b9a3a3e634ac2df7ee251e0597f3ec`.
- No Astro source changes or Astro production build needed for this metadata-only WordPress Admin visibility repair.

**Result: 48/48 production metadata corrections PASS; independent full Post census 0 suspect / 792 total.**
