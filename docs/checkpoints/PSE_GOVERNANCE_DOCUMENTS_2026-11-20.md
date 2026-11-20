# CHỐT NGHIỆM THU — Tài liệu quản trị công ty PSE (20/11/2026)

> **FINAL: COMPLETE. SOURCE JOOMLA 24 → WORDPRESS 24 PUBLISHED → ASTRO SSR 24, SEO TITLE 24/24, ORIGINAL ARCHIVE ORDER 24/24, DESKTOP/MOBILE PASS.**
>
> Bản kiểm tra cuối **read-only** GitHub Actions #44748928751: `PASS_24_SOURCE_RECORDS_24_SEO_24_PUBLISHED`. Artifact `pse-governance-final-independent-qa` ID `14633299566` đã được tải và xác nhận `errors=[]`. Các checkpoint 23/24 và thiếu ngày ở tháng 10 là **lịch sử**, được thay thế bởi bản FINAL này. Không tạo bài trùng. Không cần build lại Astro vì archive/chi tiết là SSR.

## Phạm vi

- Joomla source: `https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty.html` (6 trang, `start=0,5,10,15,20,25`).
- Astro production: `https://pse.webnvn.com/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty` (2 trang, 12+12).
- WordPress: `https://admin-pse.webnvn.com`; native WP category `1759`, slug `tai-lieu-quan-tri-cong-ty`, parent `1744`.
- `ngocnhanvo/psevn-astro/master` giữ nguyên; chỉ cập nhật dữ liệu WordPress, scoped plugin WordPress và Actions.

### Source ID → WordPress post ID theo đúng thứ tự Joomla

| Joomla | WordPress | Joomla | WordPress |
|---|---:|---|---:|
| 1735 | 77072 | 1664 | 82425 |
| 1649 | 82428 | 1609 | 77415 |
| 1574 | 77523 | 1563 | 77553 |
| 1541 | 77630 | 1524 | 79060 |
| 1502 | 79102 | 1479 | 77351 |
| 1473 | 77372 | 1405 | 77887 |
| 1395 | 77912 | 1317 | 77841 |
| 1316 | 78107 | 1302 | 78992 |
| 1230 | 79381 | 1184 | 79439 |
| 1177 | 79445 | 1119 | 77721 |
| 376 | 82440 | 90 | 82437 |
| 91 | 82434 | 92 | 82431 |

Thứ tự liên tục đọc theo dòng, từ trái qua phải. Tất cả 24 post có `status=publish`, category 1759 và ACF `action=PostDetails, key=ssr-post`. File PDF/ảnh nội bộ được giữ; kiểm thử cuối không tìm thấy Joomla media hotlink. Kiểm tra số file đính kèm không bị giảm so với baseline đã kiểm.

## Khôi phục bài #92: chứng minh ngày từ chính Joomla

- Joomla #92: `https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/92-dieu-le-cong-ty-co-phan-phan-bon-va-hoa-chat-dau-khi-dong-nam-bo.html`.
- WordPress #82431: trước đây đã import đủ nội dung/PDF nhưng ở draft do thiếu bằng chứng ngày.
- **RSS có exact ID/link/title**: `https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty.html?start=25&format=feed&type=rss` — `Mon, 20 Jun 2011 01:52:44 +0700`.
- **Atom độc lập exact ID/link/title**: `https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty.html?start=25&format=feed&type=atom` — `2011-06-20T01:52:44+07:00`; 2 timestamps so khớp UTC.
- **Lưu ý provenance**: đây là **timestamp publish metadata của Joomla**, KHÔNG phải ngày Điều lệ được thông qua. Bài gốc nói Điều lệ được thông qua **15/04/2013**; không dùng ngày phê duyệt để điền ngày CMS, không giả định bản tài liệu hiện tại đã tồn tại vào năm 2011.
- Xuất bản #82431 đúng `date=2011-06-20T01:52:44` (UTC+7) và local PDF không mất. WP SEO title, description, nội dung, slug, category giữ nguyên.
- PHP plugin nguồn `ngocnhanvo/psevn-php/master: wp-content/mu-plugins/pse-governance-source-order.php`, source commit `725dfa9dadaa8946f5ac9d8b0e4850c7feb1dc16`, FTP binary verified SHA256 `2c6b1b917ca5d4734fb65a5805e8aa23ed4ff3186c575720c024b58a84fbba37`. Native REST endpoint `/wp-json/pse-governance/v1/original-archive-order` stores 24 per-post ranks, category checksum, and scopes `rest_post_query` strictly to category 1759, without altering dates to force ordering.
- Joomla archive original order restored, notably `1317→1316` and `90→91`.

## SEO, media, SSR

- Tất cả **24/24 Yoast SEO titles** khớp `<title>` gốc (23 direct Playwright; #1563 verified separately on original Joomla article HTML). Không ghi đè target meta descriptions, vì Joomla source không cung cấp meta descriptions.
- Source content / files imported prior; verified no missing PDF counts for the original 23 accessible source details. #1563 old Joomla detail temporarily timeout nhưng nguồn HTML được xác minh lại; WordPress đã có đủ hai PDF theo checkpoint.
- 2008/2010 annual reports, finance, disclosure and other categories không bị sửa.
- Final **24/24 WordPress publish**, `draft=[]`; exact 24 rank metadata active with source checksum `698367c73e5a5ce184acf2762039d8d8dd5c3bd00a875be2a3bf4083fa972243`.
- Astro archive: **desktop 1366×840** và **mobile 390×844**, trang 1 HTTP 200/12 bài, trang 2 HTTP 200/12 bài, đúng từng slug theo Joomla và **horizontal overflow=false**.
- Chi tiết #92 Astro SSR HTTP 200, PDF lưu cục bộ, không tràn ngang. QA cuối read-only không tìm thấy hotlink tài liệu Joomla, `errors=[]`.
- **Không build lại Astro** vì frontend là SSR, lấy archive và post detail từ WordPress theo API.

## Bằng chứng GitHub Actions (20/11/2026)

1. [#44744504960](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44744504960) — inventory 6 trang nguồn/24 post; xác định 23 thiếu SEO và một lần timeout #1563.
2. [#44747738951](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44747738951) — **RSS+Atom ID 92 exact published timestamp**, artifact `pse-governance-92-legacy-feed-proof` ID `14634755122`.
3. [#44746288504](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44746288504) — Yoast source titles **retry attempt 2 PASS** (attempt 1 wrote 22 + #92 but detected unrelated draft date refresh; source draft date restored separately).
4. [#44747233513](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44747233513) — #1563 source title PASS.
5. [#44747461592](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44747461592) — restored #92 interim WP draft date safely before publishing using independently verified source feed date.
6. [#44746708381](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44746708381) — PHP source order plugin deploy/23 published ranks PASS.
7. [#44748372880](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44748372880) — #92 publish by source metadata & final 24 rank PASS, mobile/desktop 12+12.
8. [#44748474075](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44748474075) — independent idempotent 24 rank & article SSR + local PDF PASS.
9. [#44748928751](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44748928751) — **FINAL READ-ONLY PASS**: `source=24,wp=24,seo=24,published=24,draft=[],ranked=24,sourceLinkHotlinks=0,errors=[]`, two viewport 12+12 each and #92 PDF local.

## Tình trạng cuối

**COMPLETE — 24/24. Không còn phần dữ liệu còn thiếu trong phạm vi chuyên mục.**

Bản checkpoint này là kết luận nghiệm thu có bằng chứng cuối, ghi đè nội dung PARTIAL lịch sử ở checkpoint 27/10/2026. Các thay đổi mới ngoài phạm vi này cần audit mới; không chạy lại importer và không tạo bài trùng.
