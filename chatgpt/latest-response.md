# PSE — Tin tổng hợp Joomla → Astro/WordPress — checkpoint 20/11/2026

## Phạm vi
- Joomla source: https://pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop.html
- Frontend SSR: https://pse.webnvn.com/tin-tuc-su-kien/tin-tong-hop
- Repos: ngocnhanvo/knowledge@main, psevn-astro@master, psevn-php@master, psevn-actions@main
- Chế độ code: auto-build
- Cổng ghi source: bypass

## Đã hoàn tất (không làm lại)
1. Kiểm kê Joomla archive 56 trang, snapshot nguồn độc lập run #44771869548: 318 mã nguồn có link số độc nhất. Có thêm 5 bài tiêu đề dạng inline không nằm trong snapshot numeric. QA tổng Archive WP/SSR trước import là 298/298.
2. Đã sao lưu UpdraftPlus trước mutation và dùng importer WordPress thật cho 5 bài mới (không hardcode vào Astro):
   - Joomla #1603 → WP #82801, ngày nguồn 2025-01-08, 2 ảnh.
   - #1586 → WP #82805, ngày 2024-07-17, 2 ảnh.
   - #1599 → WP #82817, ngày 2024-12-18, 4 ảnh.
   - #1565 → WP #82820, ngày 2023-08-24, 7 ảnh.
   - #1601 → WP #82828, ngày Joomla created 2024-12-31, sự kiện xảy ra 30/12/2024, 5 ảnh, URL slug có đuôi -2024.
3. Kiểm tra hai nguồn Joomla #1601/#1616 khác nội dung dù cùng tiêu đề: #1601 là sự kiện 30/12/2024, #1616 là 03/03/2025. Đã bảo toàn bài 2025 hiện có WP #77405 (slug/date/content/publish không đổi), sửa phân loại sai chỉ còn parent Tin PVFCCo-PSE [1742] thay vì Tin tổng hợp [1746]. QA độc lập #44773915965, sửa + nhập #44774688120 PASS.
4. WordPress và Astro SSR chuyên mục Tin tổng hợp đều có 303 bài/26 trang, 12 thẻ/trang. Five-post browser QA #44775441972 PASS desktop 1366px và mobile 390px, bài chi tiết mới HTTP 200, không tràn ngang.
5. Toàn bộ 20 ảnh mới đã xác nhận tải thực: WordPress media HTTP200, Astro /api/images trả ảnh naturalWidth=1024, không lỗi: #44776511159 PASS. Bản QA hình ảnh cập nhật để đợi img.decode() trước khi chụp: #44776855186 PASS, artifact #14650327478.
6. Dữ liệu migration checkpoint `docs/pse-legacy-migration-state.json` đã đạt 804 records, `runs=251`, không còn trạng thái `pending` hoặc `media`, 482 imported + 26 existing + 231 draft_needs_date + 65 quarantined. Đây là tổng toàn repo, không phải riêng Tin tổng hợp.

## Đang dở / blockers cần tiếp tục
- **20 bài lịch sử nguồn thuộc archive Tin tổng hợp chưa xuất bản trong WP**, 19 quarantined và 1 draft thiếu ngày; IDs: 1363,1247,1172,1169,1165,1157,1090,382,379,240,237,229,227,226,205,204,202,198,196,186. Phải giữ file ảnh/cấu trúc và ngày gốc, không tự bịa/force publish, không bỏ ảnh để làm QA xanh.
- Một QA hoàn chỉnh 56 trang chạy lại #44773289402 thất bại do Joomla nguồn timeout 7 trang, không vì WP. Dùng source snapshot thành công #44771869548 làm oracle, tránh vòng lặp quét nặng.
- Đã mở read-only collision audit 5 bài bị WP slug conflict: workflow #44776968875, scripts/pse-tin-tong-hop-five-collisions-audit.mjs. Đọc kết quả để xác minh phần có thể làm tiếp.
- Chưa kiểm tra chắc chắn tất cả tiêu đề/ảnh của 20 bài lịch sử. Chưa thể đánh dấu SOURCE_TO_TARGET_PARITY_PASS.
- Không cần Astro build: frontend danh sách bài là SSR lấy từ WordPress, live QA đã chứng minh.
- Nếu có thêm CMS writes: bắt buộc backup, scope chính xác, read-before-write, read-after-write; tránh trùng slug. Hợp đồng rule repo knowledge.

## URLs evidence
- source archive: https://github.com/ngocnhanvo/psevn-actions/actions/runs/44771869548
- migration 4 posts: https://github.com/ngocnhanvo/psevn-actions/actions/runs/44773661860
- 1601 fix: https://github.com/ngocnhanvo/psevn-actions/actions/runs/44774688120
- WP/SSR QA: https://github.com/ngocnhanvo/psevn-actions/actions/runs/44775441972
- loaded images: https://github.com/ngocnhanvo/psevn-actions/actions/runs/44776511159
- proper screenshot: https://github.com/ngocnhanvo/psevn-actions/actions/runs/44776855186

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
