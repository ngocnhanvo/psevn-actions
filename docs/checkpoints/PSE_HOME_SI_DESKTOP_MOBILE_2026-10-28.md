# PSE — HomePage Performance Desktop/Mobile 99, actual Pse_00 component (2026-10-28)

## Owner goal

- User requested homepage Desktop Lighthouse 99–100 without changing approved layout or ESC Table, then asked why Mobile slider also scores 99.
- Knowledge: `ngocnhanvo/knowledge` main full core+stacks reviewed; PSE Astro `github`=DEVELOPMENT and `master`=PRODUCTION, PHP/WordPress official Build Website is the only Astro deploy gate; mode `auto-build`.

## Measurements before remediation

- Full menu after prior SEO/A11y optimization [#40549910858](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40549910858) + targeted five retries [#40550808779](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40550808779): homepage Mobile P99 Speed Index 2640ms, Desktop P99 Speed Index 1274ms; A11y, BP, SEO all 100.
- Focused Desktop later [#40555160161](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40555160161): Desktop P97, Speed Index 1780ms, FCP 607ms, LCP 791ms, TBT0, CLS0. SI weighted loss ~2.8 raw score points. Other performance metrics healthy.
- Important: Lighthouse Mobile and Desktop scoring use different reference distributions; a raw Mobile SI 2.6s can receive Performance 99 while Desktop SI 1.8s receives Performance 97. The real responsive picture can choose different resolutions per viewport.

## Correct source and remediation history

1. An early mistaken optimization targeted inherited `Home_00.astro`, [PR #104](https://github.com/ngocnhanvo/psevn-astro/pull/104), source tests [#40559343190](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40559343190) PASS, WordPress build [#40559677451](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40559677451) → deploy [#40559824616](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40559824616) PASS, desktop Lighthouse [#40560226692](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40560226692) P98/SI1312ms. BUT live browser QA [#40560205083](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40560205083) exposed wrong element selector, correctly leading to discovery that actual active PSE hero is **`src/astro/tablepress/Pse_00.astro`**, not generic `Home_00.astro`.
2. Corrected [PSE Astro PR #105](https://github.com/ngocnhanvo/psevn-astro/pull/105) merged into `master` **`029834d737af0998f7c8811751fbb35b406adf9b`**: restores generic `Home_00.astro` exactly to pre-PR#104 content and deletes its irrelevant test, adjusts ONLY real `Pse_00.astro` plus new `Pse_00.network.test.ts`:
   - ESC Table still supplies all image `src, srcSet, alt, width, height`, 11 real CMS banners unchanged, no CSS or layout alterations.
   - First hero image stays eager/high priority. For later slides, an inactive desktop `<source media="not all">` retains real srcset but delays network until needed; Mobile `<source media="(max-width:767px)">` loads natively. Builder preview emits original markup.
   - JS enables real image before revealing it, only after the image is loaded to avoid blank banners; prewarms next after 4300ms, preserves 6200ms autoplay, dots, aria, page transitions.
   - Focused non-build Vitest tests **7/7 PASS** plus Astro parser PASS [#40561045103](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40561045103).
3. Authenticated PHP/WordPress one-time Build Website [#40561324614](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40561324614) PASS → source master `029834d...` signed FTPS production deploy [#40561470854](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40561470854) PASS, smoke PASS. No independent Astro build.
4. **Real Chrome browser postdeploy** [#40561835975](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40561835975) PASS: 11 real slides, 10 desktop deferred sources, Desktop next slide loaded real image 1439×550 and dot navigation back PASS; Mobile next slide loaded real image 389×149 and dot navigation back PASS. Same real source selects Desktop /images/pages/pse-original-hero-2026-1536w.webp vs Mobile /images/pages/pse-original-hero-2026-480w.webp.
5. **Final Desktop Lighthouse** [#40561864756](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40561864756) PASS:
   - Performance **99**, Accessibility **100**, Best Practices **100**, SEO **100**.
   - FCP **478.763ms**, LCP **678.763ms**, Speed Index **1167.500ms**, TBT **0ms**, CLS **0.000472763**.
6. **Final Mobile Lighthouse** [#40562252345](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40562252345) PASS:
   - Performance **99**, Accessibility **100**, Best Practices **100**, SEO **100**.
   - FCP **1220.042ms**, LCP **1670.042ms**, Speed Index **2770.079ms**, TBT **0ms**, CLS **0**.
   - Mobile P99 is preserved; browser verified mobile responsive hero and pagination.

## Final state and guardrails

- DONE: live Production Desktop and Mobile both P99, A11y/BP/SEO 100; 11 banners visually/behaviorally retained; no source data/layout changed.
- No further build, page edits, Lighthouse tests, or commits are required solely for continuing this completed task. Scores are lab measurements and can vary by cold-cache/network/lab.
- For further analysis use **Pse_00**, not generic `Home_00`. Avoid reintroducing unrelated generic template work.
- Actions scripts/workflows are **read-only browser QA and independent source tests**, never independent Astro build/deploy; remember WordPress PHP Build Website remains sole deploy origin.
- `Chế độ code: auto-build`.
