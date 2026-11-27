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

## Final VERIFIED — 2026-11-27 (supersedes all earlier pending status above)

- Production browser QA proved the first removal of Astro `<RelatedPosts>` was insufficient: Joomla article body contains literal nested markup `<h2><strong>Các bài viết khác</strong></h2><div><ul>...</ul></div>`. Old render QA [#45956469665](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45956469665) FAIL-CLOSED; independent diagnostic QA [#45956698852](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45956698852) captured DOM for source original #1741. Do not claim that the initial release fixed all content.
- Fixed via `psevn-astro/master`: `bd99736c42de829fea59b9417df5880bdf6974c9` removes only legacy related-navigation markup when rendering `PostDetails` via `stripLegacyArticleRelatedLinks`; `c427facd1ce6a9a46c33f2f6b0b48da51abb6960` preserves the existing image-processing contract; final `4f285c42c57497e65abd9eaccbb41fd6e99066cf` adds a regression covering the **actual** nested Joomla HTML. WordPress content/database remains untouched; article body, images, share buttons, and previous/next navigation are preserved.
- Source-only CI [#45956640387](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45956640387) SUCCESS 152 suites (before final nested fixture); follow-up source CI [#45956870866](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45956870866) SUCCESS. Final nested fixture is source-only additive.
- Existing WordPress Build Website one-time request [#45956822554](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45956822554) SUCCESS; existing single signed Astro production pipeline [#45956905855](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45956905855) SUCCESS, exact built/deployed `master` SHA `4f285c42c57497e65abd9eaccbb41fd6e99066cf`, verified FTPS and `SIGNED_UNZIP_SUCCESS`. One-time build exception was removed again from WordPress build request allowlist in Actions commit `849af304a096c70fb560c7b42f72c496c430289b`.
- Independent live Playwright acceptance [#45957117682](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45957117682) **SUCCESS**, second independently triggered live check [#45957130819](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45957130819) **SUCCESS**. Both article source IDs **1741 and 1739** showed `PSE_RELATED_OTHER_POSTS_REMOVED=PASS`, public details HTTP200 and original inline images respectively **4/4 + 5/5** optimized media HTTP200. Tin Công ty parent archive and native “Tất cả” submenu passed desktop 1440 and mobile 390. No native WordPress records deleted or edited for this UI change.

**Final scope status: DONE — source code, signed production release, and live article-body + archive QA all verified.**
