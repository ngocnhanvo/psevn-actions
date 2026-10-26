# PSE — Related product quote CTA fix (2026-10-27)

## User symptom
The four related-product cards showed a purple `Yêu cầu báo giá` control that did nothing when clicked.

## Root cause / fix
- `psevn-astro/src/astroutils/RelatedProducts.astro` rendered the CTA as an unhandled `<button>`.
- Changed to a real `<a>` using the WordPress-resolved locale-specific contact path passed down from `ProductDetailsPage.astro`.
- Encodes the same query parameters as the detail product price link: `quote=1`, `product`, `category`, and `productPath`. The existing `Contact_00.astro` prefill reads these fields. No hardcoded domain, extra form submission, CMS data change, or CSS redesign.
- Added regression assertions to `ProductDetailsPage.quote.test.ts`.

## Git and validation
- DEV branch: `psevn-astro/github`, final fixing commit `449099aa56eaaa844613478aaa622590ce0daac9`.
- Production: scoped hotfix PR [#96](https://github.com/ngocnhanvo/psevn-astro/pull/96), squash commit `1ccf038fdec152f5edf4725f1cb034e7093cb18e`. Three files only; no unrelated merge from divergent development branch.
- DEV full Vitest/parser [40376850223](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40376850223) PASS.
- Production source full Vitest [40377121536](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40377121536) PASS.
- Native WP Build Website normal request [40377379118](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40377379118) reported NO_PENDING_CHANGES (`pending_count=0`) without initiating a build.
- One-time scoped PHP WordPress Build Website exception [40377655534](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40377655534) PASS.
- Astro master Build + signed FTP activation [40377786021](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40377786021) PASS, confirmed source SHA `1ccf038fdec152f5edf4725f1cb034e7093cb18e`.
- Independent postdeploy utility SSR [40378057980](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40378057980) PASS.
- Real Playwright browser [40378356168](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40378356168) PASS: clicked a related-product quote on `/san-pham/npk-phu-my-15-15-15-nhap-khau-1714` -> `/lien-he`; query validated, subject and message prefilled with selected product, no form submitted. Independent SSR/robots/sitemap smoke also PASS.

## Rollback
Revert PR #96 only on Astro production source, then release through WordPress PHP Build Website according to code mode. Avoid reverting unrelated work on the divergent development branch.

## Final state
CODE_READY PASS; DEV_CI PASS; PROD_CI PASS; DEPLOYED PASS; LIVE_BROWSER_QA PASS.
