# PSE — Verification of fresh Joomla SQL export (2026-11-27)

## Input and scope

- Original uploaded archive: `psevn_2028_1795789363.sql.gz` (Joomla MySQL dump; do **not** put the raw database in this repository).
- Archive SHA-256: `2f1d86913b64d0e8e6f49c4a135ea4f31380833f7cabb86dd297f0d9dbb32818`.
- Directly parsed `ckiv4_content`: **1,037** articles; `ckiv4_categories`: **53** categories.
- Category Joomla **#101** (Tin tổng hợp - sự kiện mới - ASXH): **352** total, **337** published (`state=1`).
- Parent news category Joomla **#21** (TIN CÔNG TY): **57** direct articles, **56** published.
- Scope of current native WordPress import: **exactly four** latest Joomla articles in #101, **13** original `<img>` references. Do not infer that the remaining 9 published #101 items are necessarily missing from WordPress without source identity/readback audit.

## Exact Joomla metadata in the supplied SQL

| Joomla ID | Created (SQL) | Publish_up (SQL) | Modified (SQL) | Inline images | State |
| --- | --- | --- | --- | ---: | ---: |
| 1746 | 2026-11-27 09:52:48 | 2026-11-27 09:52:48 | 2026-11-27 10:08:59 | 11 | 1 |
| 1745 | 2026-11-27 08:50:01 | **2026-11-26 08:50:00** | 2026-11-27 13:49:20 | 1 | 1 |
| 1744 | 2026-11-27 08:24:52 | 2026-11-27 08:24:52 | 2026-11-27 09:59:47 | 0 | 1 |
| 1743 | 2026-11-27 08:05:27 | 2026-11-27 08:05:27 | 2026-11-27 09:59:52 | 1 | 1 |

These four records' Joomla ID, category, slug, title, original created local-second, and HTML image counts match `docs/source/pse-tin-tong-hop-four-20261127.json`. **Owner correction (2026-11-27):** WordPress publication `date` must use Joomla **`publish_up`** in Asia/Ho_Chi_Minh, preserving seconds; `created` is retained strictly for source identity. For #1745 the correct published date is **2026-11-26 08:50:00**. A guarded same-identity importer now updates an already-imported Post's date if it is still at the Joomla `created` value; never duplicate the Post.

## Delivery and verification state

- Import request was committed on `psevn-actions@main` as `382f9a244f3bf0de07647599809166c6b2e7556b` with the guarded four-post production workflow at `.github/workflows/pse-tin-tong-hop-four-apply.yml`.
- A read-only live-QA workflow was added in `b7df1473347b74c7c2a70048a93b8ac4494a17cd`. It checks exact-second dates, source content, absence of the "Các bài viết khác" section and original image counts.
- **Neither the push event nor this SQL audit proves an Actions success or WordPress read-after-write.** Only mark import PASS after the exact import run completes successfully and the public WordPress/Astro checks pass; do not trigger a duplicate import on this audit's account.
- Do not commit any raw SQL dump or secrets. No production CMS operation is performed by this checkpoint.

## Full published-source date audit (same SQL)

- Joomla category #101: **337** published, **29** rows with valid `publish_up != created`; **1** #1020 has zero `publish_up` and therefore requires a separately documented fallback or original evidence.
- Joomla direct category #21: **56** published, **1** with differing dates.
- Across all Joomla categories: **967** published; **122** valid differences and **1** zero date. These numbers are **source-only**, not WordPress mismatches. Never bulk-edit WordPress without verifying the source article identity, WP post type and current stored date.
- Current four-Post importer and live QA were updated to require Joomla `publish_up`; this does not automatically fix unrelated historical WordPress Posts. The broader source-to-WP audit and narrowly scoped corrections remain outstanding.
