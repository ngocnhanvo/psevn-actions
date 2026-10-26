# PSE CSS ownership audit and correction — 2026-10-26

Scope: `ngocnhanvo/psevn-astro` development `github` / production-source `master`; `ngocnhanvo/psevn-php` master; `ngocnhanvo/psevn-actions` main. Knowledge baseline: `ngocnhanvo/knowledge` main PR #19, commit `681e7782`.

## Authoritative rule

- ACF `cssmore` exclusively styles native WordPress Editor HTML rendered by WordPress/PHP.
- ESC Table content/layout styled with **Tailwind CSS in shared Astro components**. ESC Table order/records/schema/content remain WordPress-owned.
- The WordPress Visual Editor displays native ESC Table preview image; Visual Builder renders actual Astro preview.
- No page-key/ID hardcoded Astro content, no Editor HTML-to-card conversion and no alternative Astro build route.

## Verified full WordPress Page inventory

Read-only complete native WP REST Page inventory: [run 40307227780](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40307227780).
- 26 published Pages, no additional draft/private/pending/future Pages.
- 13 Pages initially had nonempty `acf.cssmore`; 7 Pages used ESC Table shortcode; 4 Pages had both.
- Browser CSSOM selector ownership inventory: [run 40308401461](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40308401461).
- Direct ESC Table CSSMore violations: Hotline (`80932`, 11 matching selectors), FAQ (`80930`, 14 matching selectors).
- Unused/stale CSSMore: Contact (`47222`, 0 matching selectors), Homepage (`248`, only global `:root` matched), About (`53390`, 0 matching selectors).
- Remaining 8 cssmore-bearing Pages have editor-owned selectors, no CSS crossing into ESC Table.

## Changes made

1. Converted Hotline and FAQ native ESC Table visual styles to static Tailwind utility classes in:
   - `src/astro/tablepress/Pse_hotline.astro`
   - `src/astro/tablepress/Pse_faq.astro`
   while preserving ESC Table data bindings and interactive FAQ functionality.
2. Added `src/astro/tablepress/Pse_support.cssOwnership.test.ts`; source-only CI [run 40308814173](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40308814173): 18 tests + Astro parsing PASS, NO BUILD.
3. Merged Astro production-source [PR #86](https://github.com/ngocnhanvo/psevn-astro/pull/86), commit `e56a7382211d47d776bc82db10ba6261733f821d`. **Source merge is not proof of website deployment.**
4. Native WordPress CSS cleanup of precisely 5 Pages, approved by content owner as part of all-site rule compliance. Protected dry-run [40309429680](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40309429680) PASS, private rollback CSS artifact; apply [40309611396](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40309611396) PASS with read-after-write and original Editor content/shortcodes unchanged.
5. Rerun full native Page inventory [40309877288](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40309877288) PASS: 26 published Pages, 8 Editor-only cssmore, 7 ESC Table Pages, **0 Page with both**, 0 flagged violations.
6. Retired legacy `scripts/pse-support-layout-cms-migrate.mjs` write path; historical workflow can no longer place ESC styles back into cssmore.

## Live smoke and deployment blocker

- Normal PHP/WordPress Build Website [40309841008](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40309841008) reported `pending_count=0`, no authorized exception, **did not trigger Astro build**. No independent Actions build was performed.
- Public smoke [40310238296](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40310238296) PASS: 26/26 published Page URLs HTTP 200. Hotline/FAQ visual and interactions PASS desktop (1440) and mobile (390); Contact/Home/About route smoke PASS.
- Critical version check [40310497516](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40310497516): public HTML **does not yet include the new Astro Tailwind component utility classes**; stale previously built HTML still contains inline legacy CSSMore styling. Do **not** claim Astro production deployment or CSS ownership visual acceptance yet.
- Next step after **explicitly authorized normal pending build or owner-approved one-time exception through the existing WordPress/PHP Build Website control**: verify signed build and frontend publish; rerun the postdeploy browser QA and confirm `astroTailwindSource=true` and `legacyCssmoreInline=false` for both Hotline and FAQ (desktop/mobile). Continue to respect nonce, lock and approved build route.
- Rollback: download CSS baseline artifact from run 40309429680 (private, 30-day retention), restore only after verifying ID/key/hash; source code rollback by reverting PR #86. Do not modify public content to artificially increase pending_count.

The audit and CMS migration are complete; the frontend deployment parity is **BLOCKED solely by the official WordPress build gate**. Do not repeat completed audits or CMS writes without a change in inputs.
