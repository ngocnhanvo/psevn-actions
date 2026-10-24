# PSE G9 — Định hướng phát triển responsive redesign, 2026-10-24

## Exact scope
- Frontend: ngocnhanvo/psevn-astro github DEV / master PRODUCTION source; Actions: ngocnhanvo/psevn-actions main; backend: ngocnhanvo/psevn-php master.
- Code mode: auto-build. Official WordPress/PHP Build Website is the ONLY permitted Astro build trigger.
- User explicitly closed G8 Thành tựu: DO NOT resave or rebuild G8 ESC Table just to rework it. G8 was fully verified in docs/PSE_G8_AWARDS_ESC_CHECKPOINT_2026-10-24.md.
- Page under redesign: /dinh-huong-phat-trien WordPress Page id 79278, key pse-company-dinh-huong-phat-trien, action PublicPage. No WordPress editorial data is changed.

## Verified source changes (do not repeat)
- Astro: PR #33 merged to master ce8a46cfdb42c6ba97fdd3a1291f39442b9f4d46; github fast-forward synchronized to same SHA. Four files only: src/astro/pages/PublicPage.astro, src/lib/seo/pseDevelopmentStrategy.ts, src/lib/seo/pseDevelopmentStrategy.test.ts, src/styles/pseDevelopmentStrategy.css.
- Navigation derived from five real CMS Roman-numbered headers, with links to each section; modern typography/card-based reading hierarchy; original WordPress text and old 2015/2025 targets unmodified.
- Existing historical metrics table stays semantic; mobile rows become width-adaptive cards without nested horizontal scrolling.
- Independent no-build CI #40103108261 PASS: full Vitest, source resolution, Astro parser. Reuse; do not rerun without a new code change.
- Actions read-only Playwright QA script/workflow added: scripts/pse-development-direction-live-qa.mjs and .github/workflows/pse-development-direction-live-qa.yml. Trigger marker: .pse-development-direction-live-qa-trigger, NOT created as of this checkpoint.

## Deployment in progress (verify before any next action)
- Exactly one normal WordPress/PHP Build Website request marker e507cf56bab2eda8a654f286aa9eb49b141d6c4f; workflow run #40103315911. It was in progress when checkpoint authored.
- **NEVER trigger a duplicate**. Check this run, the accepted WP trigger response, the downstream repository_dispatch build and FTPS validation before declaring success.
- Do not force an exceptional build when WordPress reports pending=0; obtain appropriate authorization instead. Do not use direct Astro workflow_dispatch.
- Existing independent Joomla article migration queue #40103272274 was in progress; do not restart it.

## Exact next actions
1. Read conclusion/log of #40103315911; if accepted, find the resulting downstream PSE Astro build and signed FTPS deploy. If WP refuses due pending=0, report the actual gate without bypassing.
2. Only after successful deployment, update/create .pse-development-direction-live-qa-trigger (one commit), run the READ ONLY script at 390, 768 and 1440px. It checks 5 headings and anchors, historic text, the 10+ row table, horizontal/nested overflow and produces three screenshots.
3. On visual QA failure, diagnose actual WordPress HTML and browser CSS; fix source rather than hardcoding/censoring CMS data. Reuse normal merge and PHP build rules.
4. Report CODE_READY, CI, DEPLOY, VISUAL_QA as separate states with evidence.

## Build gate final result (read before continuing)

- Standard PHP/WordPress build request #40103315911 finished **FAIL (policy guard, not code failure)**. Authenticated WP dashboard read succeeded: `PSE_WP_BUILD_STATUS_CHECK=success`, `PSE_WP_PENDING_CHANGE_COUNT=0`, then `PSE_WP_BUILD=NO_PENDING_CHANGES; no owner-approved exception on this event`; exit code 2. Full run: https://github.com/ngocnhanvo/psevn-actions/actions/runs/40103315911.
- **No downstream Astro deploy was started for G9.** No live QA, no screenshot parity pass. Do NOT retry same normal WordPress Build Website action without a genuine changed pending record; no synthetic CMS edits just to fool the gate.
- The separate earlier #40101843339 successful deploy belongs to G8, not G9. This G9 source remains CODE_READY + CI_PASS, but LIVE_NOT_DEPLOYED.
- For G9 release when WordPress remains pending=0, owner must explicitly approve one-time **Build Website ngoại lệ** through the existing PHP/WordPress tool. That authorization is NOT implicit from auto-build mode; NEVER invoke direct Actions build. After an authorized source release, run targeted read-only QA with existing script and trigger once, then record actual result.
