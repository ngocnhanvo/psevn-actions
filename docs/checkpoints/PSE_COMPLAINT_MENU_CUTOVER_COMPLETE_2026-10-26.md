# PSE — Complaint Page + Header cutover (2026-10-26)

## Owner request
Finish the missing "Xử lý khiếu nại – Ý kiến khách hàng" Page and link it from native WordPress Header, preserving the existing form and preventing false-positive completion.

## Final state — VERIFIED
- Existing WordPress Page **81087**, slug `xu-ly-khieu-nai-y-kien-khach-hang`, `status=publish`, `action=PseComplaintPage`, `key=pse-complaint`. Publication confirmed by WordPress Actions [#40273559842](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40273559842).
- Existing WordPress Header menu item **77020** under parent **77004** was already rebound by native WP REST to Page 81087, but ESC-specific menu metadata retained `linkMode=custom`, `linkType=external` and the old Joomla URL. This caused the public compiled Header to stay wrong after earlier signed deploy #40274448392.
- Native ESC WordPress Menu Manager form Save successfully corrected the item metadata and navigated in run [#40277317550](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40277317550). That run's final readback failed only because it evaluated during the navigation. The *following* idempotent WordPress REST verification [#40277535579](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40277535579) reported `PSE_COMPLAINT_ESC_MENU=ALREADY_DONE; no_write=true`: the item was **already correctly in Page/internal mode**. Do not Save again.
- Exact admin editor UI behavior: child item LI had class `esc-menu-child-hidden` and `display:none` while WordPress's own controller could activate its settings. Only the intended item was temporarily exposed in the DOM for form editing; no frontend workaround, direct DB manipulation, CSS hack in project source, menu duplicates, or content alteration. Native `requestSubmit` triggered the real WordPress menu save with original session/nonce.
- WordPress/PHP normal Build Website [#40277718959](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40277718959): `pending_count=1`, `PSE_WP_BUILD_REQUEST_MODE=normal`, success; **not** forced. Signed Astro build, FTP-TLS, PHP activation and smoke [#40277799427](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40277799427) **PASS**.
- Final read-only public Playwright [#40278023741](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40278023741) **PASS 390px / 768px / 1440px**: public URL HTTP 200; Header's exact complaint anchors point to **same-origin** `/xu-ly-khieu-nai-y-kien-khach-hang`, no Joomla URL; unique H1, form, required fields and security zone present, Header/Footer present, no horizontal overflow, no client JavaScript error, no WP admin host leak. No live email sent.

## Rule / next work
- **Do not redo** Page create/publish, WP menu REST update, ESC Menu Page-mode correction, build or already successful QA.
- Complaint form backend safety verification [#40273346880](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40273346880): public registry available, malformed JSON rejected HTTP 400, unsupported type HTTP 415, no-token Turnstile rejected HTTP 403, no mail dispatched. End-to-end *real delivery* has **not** been tested; never claim real email was delivered.
- WordPress menu is the single source. Avoid hardcoding Joomla redirect or frontend slug-specific menu overrides in Astro.
- Code mode `auto-build`. Future Astro build only via native WordPress/PHP Build Website and only when pending/authorized.
- This checkpoint covers complaint Page/Header and does not attest completion of other PSE initiatives (e.g. photo gallery migration, Visual Builder work).
