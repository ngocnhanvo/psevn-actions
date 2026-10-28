# PSE Agent — Group 1 (10 company questions) live QA checkpoint, 2026-10-28

**State: QA CODE READY / LIVE NOT TESTED / NO AGENT CHANGE / NO DEPLOY.**

## Source of truth and operating boundary

- Policy: `ngocnhanvo/knowledge` branch `main`, AGENTS + CORE-02/03/06/07/08.
- WordPress/PHP: `ngocnhanvo/psevn-php` `master` currently `5cc990ddd9005e6a875b92740ab6df8a2f7c1f3a`.
- QA: `ngocnhanvo/psevn-actions` `main`. Astro frontend unchanged.
- Code mode: `auto-build`. This test must **not** invoke Astro build.
- Prior founding source fix and one-file production upload are complete: PHP PR #12, Actions #40660970204 (FTPS/readback successful; one intermediate LLM test failed), Actions #40661240301 and #40661430506 (fresh founding tests PASS). **Do not repeat** those releases without a relevant source change.

## New read-only company QA (not yet run)

- Script: `scripts/pse-agent-company-group-qa.py`, created at `c83fc30ca779648bb90ad6c3aa3ef8706dd8e1b2`.
- Workflow: `.github/workflows/pse-agent-company-group-qa.yml`, created at `9d2b34c0568c5c32056092e14b7dd9976a5ee280`, added owner manual `workflow_dispatch` at `5920e7364c854c79d8e37d685a80f50312e0c1ed`.
- The ten question texts are the user's Group 1 #1–#10. Each sends a fresh synthetic session to current authenticated PSE Agent backend and calls the official history cleanup endpoint; logs only HTTP, selected skill actions, answer-evidence booleans and cleanup status; never logs raw reply, secret or session ID.
- QA checks are test assertions **only**. Dates 2008/2011, expected date formats and wording are *not* added to Agent production code. Review status is heuristic and must be inspected before editing production logic.

## Verified blocker

Attempted to create only `.pse-agent-company-group-qa-request` to invoke the QA workflow through an approved GitHub connector. Tool response: **“Lệnh gọi công cụ này đã bị chặn bởi cơ chế kiểm tra an toàn của OpenAI. Vui lòng kiểm tra kỹ nội dung bạn đang gửi.”** Trigger file was NOT created and no new run appeared. Did not circumvent blocked execution. New manual `workflow_dispatch` remains available for the authorized owner. No real Group 1 production answers have been observed in this session, so no PASS/FAIL is claimed for those ten questions.

## Code inspection — hypotheses, not verified live failures

- `CompanySkill::getCompanyProfile()` (company.get) currently uses WordPress `blogname` and published WooCommerce categories. It can identify the business category but may not provide the **legal company name expansion** required by Group 1 Q2 when blogname is abbreviated. Verify the live Planner route and authoritative current published Page before modifying. Do not hardcode a legal name from old sites.
- `CompanySkill::getAboutPayload()` already reads the history Page's attached ESC Table, including establishment and conversion dates, without hardcoding. Business-page branch reads current published `nganh-nghe-kinh-doanh` content; verify actual Page representation before changing.
- **Already-existing brittle branching (not introduced by this work):** `CompanySkill::getAboutPayload()` uses keyword substrings `nganh nghe` / `kinh doanh` / `linh vuc` to choose one of two fixed published Page slugs. That is a potential misrouting risk for other paraphrases. Before changing it, verify the live company group question routes, current menu/page structure and whether Planner can explicitly select a source intent. Prefer a general normalized topic/source contract with verified published CMS references, not one condition per user question. Do not remove the existing date-source protection without a passing replacement test.
- `CompanySkill::getAdvantagesPayload()` depends on `ESC_AGENT_ADVANTAGES_TABLE` config and `TablePressData::getRows`. Do not assume inherited `home_09` table in generic legacy tests is current PSE evidence; verify the actual configured table and published source first.
- If an answer is wrong, inspect Planner -> selected Skill/source -> synthesis. Fix generic provenance/evidence handling in the relevant layer; do not make exact-question regex or hardcode historical business data into PHP.

## Continuation — natural company sourcing change (same date)

- PHP branch `fix/pse-agent-company-evidence-natural-20261028`, base `master=5cc990ddd9005e6a875b92740ab6df8a2f7c1f3a`.
- Draft PR **[#14](https://github.com/ngocnhanvo/psevn-php/pull/14)**, head `37a0e914dc8a2e24167396c483f7940b3fe6ae8d`, **UNMERGED / NOT DEPLOYED**.
- Removes the exact substring source switch from `CompanySkill::getAboutPayload`. Instead it retrieves **both published, verified current PSE Page sources**, preserving the native history Page's linked ESC Table, valid dates, fail-closed broken table and no admin permalink. CMS source slugs remain the verified source identifiers, not conditionals on customer wording.
- `about.content` contains the titled evidence; `sources` contains only kind/title metadata, avoiding duplicate model context; `current_date` is read from WordPress local timezone.
- Planner makes a semantic distinction between quick company overview and detailed business/history source; synthesis is instructed to answer conversationally, distinguish founding/starting/converted events, and not invent company facts.
- Expanded `tests/pse-history-esc-table-source.php` with paraphrases; neither the source PHP test nor full 10-question live QA has a **new executed PASS** in this session. Diff was checked using GitHub PR fetch and repository comparison. No production write, deploy, or Astro build.
- Execution boundary remains the previous security rejection of the QA trigger (see above). Public PSE site and WP REST GET could not be fetched from available web client, and local container DNS reported `Temporary failure in name resolution`. A user/authorized operator can start the registered read-only workflow through GitHub Actions manual `workflow_dispatch`; this is not evidence that it has run.
- Do not merge PR #14 or upload its PHP source before targeted source CI and live 10-question results are verified. Also review Q2 legal name and Q10 advantage table source based on real responses, not hardcoded PSE name/claims.

## Next actionable step

Read new Actions workflow runs (if owner subsequently launched the manual QA). Classify every one of ten answers: HTTP + selected Skill + published source evidence + user-facing correctness. For each proven FAIL, create a small PHP source change on reviewed branch, add a tenant-appropriate unit/regression test, test and release through guarded PHP FTPS; do not trigger Astro build for a PHP-only fix. If the security layer continues blocking automated QA execution, preserve **LIVE NOT TESTED** instead of declaring success.
