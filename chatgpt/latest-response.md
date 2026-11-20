# PSE — Tin tổng hợp Joomla → WordPress/Astro — checkpoint 21/11/2026

## Mục tiêu và trạng thái
- Nguồn: https://pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop.html
- Mới: https://pse.webnvn.com/tin-tuc-su-kien/tin-tong-hop
- Code mode: auto-build; Source gateway: bypass.
- Dữ liệu nguồn đúng nhánh: **324 Joomla IDs**, 311 có WP ID, 13 cách ly nguồn media.
- WordPress xuất bản đúng Tin tổng hợp: **310** (manifest QA #44837011865 xác minh 309 trước sửa bài #1159; sửa #1159 WP #79852 run #44836727645 PASS; final REST manifest run #44837083554 và SSR category QA run #44837083584).
- Trong 67 trạng thái importer `draft_needs_date`, 66 đã xuất bản qua independent date backfill. **Chỉ Joomla #379 / WP #82119 còn draft chưa xác minh ngày**; 13 bài media missing là đầu việc thực sự còn thiếu. Không nhầm checkpoint importer với live WordPress.
- 6 bài nhập mới với 24 ảnh tự tải thành công: #1603 WP82801, #1586 WP82805, #1599 WP82817, #1565 WP82820, #1601 WP82828, #1363 WP82834 (4 ảnh gốc được xác minh ngày 2019-07-16).
- 6 bài WP sẵn có được gắn lại taxonomy: #1247 WP79031, #1172 WP79316, #1169 WP79253, #1165 WP78260, #1157 WP77573, #1159 WP79852. Tất cả bảo toàn nội dung, ngày, slug, PDF.
- WP media original 24/24, Astro images naturalWidth >0 24/24, QA #44835819195 PASS.
- Bằng chứng bài #1601/#1616 trùng tiêu đề nhưng khác sự kiện đã được tách, không quay lại nhập trùng.
- Không sửa hardcode Astro/PHP, không build Astro vì trang đang SSR.
- Báo cáo chi tiết các nguồn đang thiếu: `docs/reports/pse-tin-tong-hop-source-gaps-2026-11-21.md`.

## Công việc chưa xong
- 13 bài Joomla IDs: 186, 196, 198, 202, 204, 205, 226, 227, 229, 237, 240, 382, 1090. Lý do là file ảnh chính gốc trả 404/403, DNS lỗi, TLS hết hạn, từ chối kết nối; báo cáo nguồn #44833855640. Không bỏ ảnh hoặc thay ảnh không đúng nguồn.
- #379 WP82119 bản nháp vì không có ngày tạo Joomla xác minh độc lập, dateState `review` sau 2 lần.
- Chưa đạt SOURCE_TO_TARGET_PARITY_PASS toàn bộ, chỉ WP ↔ Astro đã PASS. Cần bộ media gốc/backups và ngày gốc 379.
- Khi có dữ liệu: backup WP → nhập dữ liệu đúng bài → QA nội dung/media/date → kiểm lại 324 bài → chốt.

## Evidence
- [Kiểm kê toàn bộ mapping từ checkpoint #44837011865](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44837011865)
- [WordPress + Astro SSR sau 309 bài #44835838192](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44835838192)
- [Sửa bài 1159 source đúng và taxonomy #44836727645](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44836727645)
- [Tải 24 ảnh nguồn #44835819195](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44835819195)
- [Media blockers #44833855640](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44833855640)
- [Ngày nguồn backfill #44781587195](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44781587195)

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
