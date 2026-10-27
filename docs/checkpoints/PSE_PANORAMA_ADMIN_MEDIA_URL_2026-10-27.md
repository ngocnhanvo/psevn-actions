# PSE homepage — Panorama media URL leak resolved (2026-10-27)

## Scope
- Public: `https://pse.webnvn.com/trang-chu`, section “Định hướng phát triển”, Astro `src/astro/tablepress/Pse_02.astro`.
- WordPress ESC Table `pse_02_vi`, first item `background`, original Media Library attachment ID `76979`: `/wp-content/uploads/2026/10/pse-original-panorama-2026.jpg`.
- Before: field stored bare absolute URL on `admin-pse.webnvn.com`. Data transform `src/lib/wordpress/tablepress/getData.ts` recognizes Insert Image `<img>` markup but not the plain URL. `Pse_02.astro` output raw `image.src`, exposing WordPress admin host.
- This **was not a failing image nor Imagick failure**: live `/api/files` JPEG and `/api/images/1024/jpg` WebP both HTTP200. Read-only diagnosis [#40529547316](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40529547316).

## Corrective change and deployment
- Using **native WordPress ESC Table Insert Image**, selected existing Media attachment `76979`; saved one image tag with descriptive alt in `pse_02_vi` row 1 `background`. Confirmed all other columns/rows unchanged. No Astro or PHP code modification, no hard-coded domain, no duplicate media file.
- Guarded WordPress UI operation [#40530798856](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40530798856) **PASS**; WP REST read-after-write verified same image and one-cell change.
- Triggered the **existing WordPress/PHP Build Website** via normal pending-change count and signed preflight [#40531232810](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40531232810). No force or manual Astro dispatch.
- Production incremental build/FTP signed activation [#40531394736](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40531394736) **PASS**, staged/deployed through the existing PHP-controlled path.

## Final read-only live QA
- Public Playwright [#40532364857](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40532364857) **PASS**:
  - Image `src` `/images/pages/pse-original-panorama-2026-1536w.webp`, all 8 `srcset` URLs are same-origin `pse.webnvn.com`, fully loaded (`naturalWidth=1280`).
  - No `admin-pse.webnvn.com` in the promise section HTML.
  - WordPress native `<img src="/wp-content/uploads/2026/10/pse-original-panorama-2026.jpg" alt="Toàn cảnh nhà máy và hệ thống bồn chứa"...>` saved in ESC Table.
  - Original same-origin `/api/files` and `/api/images` alternatives also return 200.
- The first postdeploy test runs [#40531802307](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40531802307) / [#40532107191](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40532107191) failed **only because an incorrect test assumed that production images must always use `/api/images`**. The original SSG/Sharp path uses `/images/pages/*-1536w.webp` and is compliant. Adjusted test expectation; final run PASS. Do not introduce a feature-only forced build or alter the global image pipeline.

## Future authoring
For WordPress Media Library images in ESC Table cells, always use **Insert Image** with meaningful alt. Do not enter bare Admin media URLs as cell text. Image output may use same-origin Astro static optimized WebP or existing Astro image/file proxy, depending on build strategy. The CMS remains the source of content; Astro is the presentation layer.

**Status:** `ROOT_CAUSE_CONFIRMED`, `WP_CMS_CORRECTED`, `PRODUCTION_DEPLOYED`, `PUBLIC_IMAGE_URL_QA_PASS`, `CODE_MODE=auto-build`.
