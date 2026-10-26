# PSE four shared soft-hero banners — checkpoint 2026-10-26

## Approved visual change
Match the WordPress-authored PublicPage hero for **Hỏi đáp**, **Đường dây nóng**, **Kênh phân phối**, and **Thông tin tài chính** to the existing green/cream corporate **Thông điệp** hero (decorative leaf, title rule, matched breadcrumb treatment and spacing). Hide the `Hoạt động kinh doanh / Kênh phân phối` eyebrow and extra description **only on the Kênh phân phối index hero**. Keep body sections/data unchanged.

## Repository sources and implementation
- `ngocnhanvo/psevn-astro` production `master` merged PR [#82](https://github.com/ngocnhanvo/psevn-astro/pull/82) at `d6a230a749eebd2ae0e59d2202052cbed99ec3c5`.
- Reuses `PublicPage.astro` original corporate SVG/gradient for all selected pages. `PseBreadcrumbs.astro` uses the same breadcrumb background.
- Generic `isPseSoftHeroPage` consults an exact `/* PSE_SHARED_SOFT_HERO_V1 */` marker in WordPress Page ACF `cssmore` and requires `action=PublicPage`. No page ID, URL, domain, or content hardcoded into the frontend.
- Added/updated source regression tests for soft-hero CMS opt-in and corporate template.

## WordPress data
- `hoi-dap` ID `80930`; `duong-day-nong` ID `80932`; `kenh-phan-phoi` ID `81045`; `thong-tin-tai-chinh` ID `81050`.
- Authenticated CMS batch `psevn-actions` [#40271256749](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40271256749) **PASS**: 22/22 relevant Vitest checks after one repaired stale assertion, plus exactly four WordPress cssmore marker writes with read-after-write verification. Existing Page bodies and ESC Table data untouched.
- One earlier first test attempt in the same run failed because a pre-existing corporate regression test asserted the former literal variable name; repaired assertion then 22/22 PASS. The CMS write job executed **only after** the successful source test attempt.

## Build gate and current blocker
- Standard authenticated WordPress/PHP Build Website request [#40271593945](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40271593945) **FAILED/REFUSED, deliberately**: signed unzip preflight PASS; live PHP reports `PSE_WP_PENDING_CHANGE_COUNT=0` and declines build. `PSE_FORCE_BUILD_ONCE=false`. No Astro build dispatched.
- `wp-content/plugins/github-trigger/vcs-hook.php` in PHP source uses `save_post` and `vcs_astro_event_logs`, but the live site did not record pending changes after the four ACF REST updates.
- A guarded, separate WordPress Page Save registration [#40272011369](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40272011369) **FAILED at the queue acceptance guard** after four native REST Page title saves. Each individual Page save returned PASS and readback confirmed title, content, and CSS were unchanged; live VCS queue remained `before=0, after=0`. No deploy/forced build occurred. Do **not** repeat these Page saves without a distinct repair plan.
- The prior signed deployed build [#40268944636](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40268944636) predates this visual change; therefore the new four banners are **not yet verified in production**.

## Next action
- Since the normal PHP build gate sees no tracked changes despite valid saved ACF CSS, require a **specific owner authorization for one exceptional WordPress/PHP Build Website action**, or separately authorized tracking bug fix. Do not bypass PHP with direct Actions build/dispatch or assume the old one-time exceptional request grants perpetual permission.
- After authorized WordPress/PHP build, read signed Actions result and perform read-only Playwright checks at 390/768/1440 on all four URLs: HTTP 200, one H1, breadcrumb, gradient, title rule and leaves, no overflow; Kênh phân phối index lacks kicker and extra subtitle. Compare screenshots with Thông điệp. Do not claim visual QA or deployment before those runs PASS.
- No edits to WordPress source/body/ESC Table should be repeated for this issue.

Status: `ASTRO_CODE_MERGED=PASS`; `SOURCE_REGRESSION=PASS 22/22`; `WORDPRESS_CSSMORE_CONFIG=PASS 4/4`; `NORMAL_WORDPRESS_BUILD=BLOCKED(no pending change logs)`; `DEPLOYED=NO`; `POST_DEPLOY_VISUAL_QA=NOT_TESTED`.

Chế độ code: auto-build.
