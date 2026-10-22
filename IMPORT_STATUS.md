# PSE template source readiness — 2026-10-22

## Exact repositories
- Astro: `ngocnhanvo/psevn-astro`; `github` development, `master` production source.
- WordPress/PHP: `ngocnhanvo/psevn-php` `master`.
- Actions: `ngocnhanvo/psevn-actions` `main`.
- Shared rules: `ngocnhanvo/knowledge` `main`.

## Verified (source-only, without build)
- Astro development: [114/114 unit tests](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39725446919) PASS.
- Astro production source: [89/89 tests](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39726080850) PASS.
- WordPress domain persisted setting and SEO REST contract: [WordPress domain](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39725073788), [SEO](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39725069661), both PASS.
- FTP certificate, authentication and target root: [read-only verification](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39722988791) PASS.

## Reuse boundaries
- Historic copied-project and one-off migration tools are retained in `imported-eduresearch/` but disabled and excluded from operational workflows.
- Production Astro may only be built via the existing PHP/WordPress Build Website mechanism. A source commit does **not** mean a build or deploy happened.
- A green source audit is a scanned report, **not** proof that source is perfectly portable or that the WordPress database is sanitized.
- Production DB remains separate from a reusable template DB. Full database cleanup requires a private verified backup, a disposable copy, content/credentials/user/PII sanitization and restoration testing. Never scrub the live DB as a template.

Historical migration detail and source snapshots are preserved in `imported-eduresearch/IMPORT_STATUS.md.txt`.
