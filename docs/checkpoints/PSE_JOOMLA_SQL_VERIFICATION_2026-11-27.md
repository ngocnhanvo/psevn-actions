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

These four records' Joomla ID, category, slug, title, original created local-second, and HTML image counts match `docs/source/pse-tin-tong-hop-four-20261127.json`. Per owner instruction, the importer intentionally uses original **created** timestamp for WordPress `date`, not `publish_up` or `modified`. This choice matters particularly for #1745.

## Delivery and verification state

- Import request was committed on `psevn-actions@main` as `382f9a244f3bf0de07647599809166c6b2e7556b` with the guarded four-post production workflow at `.github/workflows/pse-tin-tong-hop-four-apply.yml`.
- A read-only live-QA workflow was added in `b7df1473347b74c7c2a70048a93b8ac4494a17cd`. It checks exact-second dates, source content, absence of the "Các bài viết khác" section and original image counts.
- **Neither the push event nor this SQL audit proves an Actions success or WordPress read-after-write.** Only mark import PASS after the exact import run completes successfully and the public WordPress/Astro checks pass; do not trigger a duplicate import on this audit's account.
- Do not commit any raw SQL dump or secrets. No production CMS operation is performed by this checkpoint.
