# PSE G6 — Company child Pages: no visible short description and native sibling navigation

Date: 2026-10-24. Code mode: `auto-build`.

## User request

1. Hide the short descriptive excerpt below the H1 on all PSE child Pages, without deleting WordPress content or the SEO meta description.
2. At the bottom, render **Các bài viết khác** and **Trang trước / Trang sau**, ordered by WordPress Header Menu Manager child items under the same immediate parent (PVFCCo-PSE). The current page is excluded from the related list; at the first/last page, the missing direction is a disabled non-link.

## Verified source

- Frontend `ngocnhanvo/psevn-astro`: changes only in `PublicPage.astro`, new `pseMenuSiblings.ts` helper/test and menu prop wiring into the existing static, preview and Visual Builder route renderers. No hardcoded page URLs/menu IDs/domains, no data/SSR/cache changes.
- Pull request [#28](https://github.com/ngocnhanvo/psevn-astro/pull/28) merged and `github` fast-forwarded; both branches at `fefe50401aad4a72a2a629a86d01b46b6911ae2d`.
- Independent NO BUILD CI [#40089909263](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40089909263) SUCCESS: 358/358 Vitest cases, Astro parser PASS.
- WordPress normal/exception gate [#40090253151](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40090253151): `pending_count=0`, authorized one-time exception via WordPress/PHP nonce and build lock PASS; no direct Astro workflow dispatch.
- Astro source build + signed FTPS [#40090313250](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40090313250) SUCCESS with `PSE_DEPLOY_COMMIT=fefe504`, signed unzip, homepage/SSR smoke PASS; same 9 redirect rules retained.
- Read-only Playwright [#40090525794](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40090525794) SUCCESS: `PSE_COMPANY_SIBLING_SUMMARY={"checks":20,"failures":0,"menuItems":10,"readOnly":true}`. Each of 10 Pages at 1440px + 390px returned HTTP 200; one H1; `introCount=0`; related links are the other 9 siblings in the actual live CMS menu order; previous/next exact; boundary button disabled; no horizontal overflow.
- Auto postdeploy homepage utility/search QA [#40090446187](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40090446187) SUCCESS, no search regression.

## Do not repeat

G2 menu binding 20/20 PASS, G3 archive and G4 PostDetails and G5 search route were previously verified. This G6 release is **DEPLOYED / VERIFIED PASS**. Do not rerun GitHub builds/tests or WordPress menu writes absent a related new change.

## Separate task

Joomla serialized legacy post migration is an independent workflow; its recent runs #40087928688 and #40089310586 FAILED. This checkpoint does **not** mark content migration complete and does not restart it.
