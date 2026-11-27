# PSE — Remove "Các bài viết khác" from article detail (2026-11-27)

## Owner request and scope
Follow-up request "bỏ giúp tui các bài viết khác nhé" refers to the literal heading in `src/astroutils/RelatedPosts.astro`, rendered from `src/astro/pages/PostDetails.astro`. Remove that RelatedPosts section from article details only. Preserve original WordPress Posts, category archives, company menu "Tất cả" and article content, sharing, and previous/next links. **No WordPress delete.**

## Code and tests
- `psevn-astro/master` commit `62027a22b1ddbf78f2f48010f57417c1c9a7ba88`: removed RelatedPosts import/markup from PostDetails.
- `psevn-astro/master` commit `87b374f2e4e45fcad2c93f0af105fb861f34d11e`: added regression `src/lib/seo/psePostDetailsNoOtherPosts.test.ts`.
- Source CI run [45955892040](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45955892040) SUCCESS: 151 files and 707 tests pass, no build or CMS writes.
- Read-only browser postdeploy assertion added to `psevn-actions/main` `scripts/pse-company-live-posts-qa.mjs`, commit `ca75952806147325bb11ca65c47d809558d7d3ac`: checks exact heading absent on two original November article details.

## Production release
- Normal WordPress Build Website request [45955990768](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45955990768) correctly did not deploy: authenticated `pending_count=0`, no exception. No fake WordPress edit.
- Narrow exact-message one-time exception added to the existing WordPress build request workflow, source `19cef4ba61a69154a48da3628d50204847fd2292`, without changing release pipeline. Owner auto-build request marker commit `376e4ab4a1ec83567fbd5f8cdfd28d9ec79d5774`, build request run [45956166364](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45956166364) **PENDING verification**.
- Required next gate: WordPress trigger accepted → existing `PSE Astro build and deploy via WordPress GitHub Trigger` production run `wp_trigger_build` SUCCESS with exact Astro source commit `87b374f2e4e45fcad2c93f0af105fb861f34d11e` → live Playwright article detail QA shows heading absent and other content/navigation intact.
- Trigger postdeploy read-only company QA ONLY AFTER deployed SHA confirmed by updating `.pse-company-live-posts-qa-request` with exact expected message `test(pse): check live company all menu and two November posts`; no CMS writes.
- Historical 15-company-article restoration run [45955333445](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45955333445) failed separately and is NOT evidence of this article-detail UI build or release. Do not recreate/source-import content as part of UI task.

## Status
`CODE_READY, CI_PASS, DEPLOY_PENDING, LIVE_QA_PENDING`. Do not mark DONE until deploy/QA success.
