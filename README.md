# psevn-actions

Automation and browser-testing repository for the PSE project.

Imported code must be reviewed and adapted from EduResearch Hub before activation. No workflow deployment to nghiencuukhoahoc.webnvn.com is authorized for PSE.

## Shared Playwright (knowledge-actions)

This PSE repository calls the shared browser engine at [ngocnhanvo/knowledge-actions](https://github.com/ngocnhanvo/knowledge-actions) using [pse-shared-playwright.yml](.github/workflows/pse-shared-playwright.yml).

- `smoke`: tests `https://pse.webnvn.com` in desktop and mobile viewports without any login secret.
- `wordpress-site-health`: read-only admin browser check on `https://admin-pse.webnvn.com`, with explicit project-specific `WP_ADMIN_USERNAME` and `WP_ADMIN_PASSWORD`; no screenshots, passwords, cookies or raw DB names in public logs.
- To run an approved suite interactively, use GitHub Actions → PSE shared Playwright checks → Run workflow.
- Chromium and system libraries are supplied by the pinned Docker image; npm dependency download cache is reused per caller repository.
- This does **not** deploy PSE or bypass the WordPress/PHP-controlled Astro Build Website tool.

Public smoke evidence: [run #39612921299](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39612921299) PASS and [run #39613176502](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39613176502) PASS, second run confirmed npm cache hit.
