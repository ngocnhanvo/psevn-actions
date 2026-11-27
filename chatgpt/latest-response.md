# PSE — phản hồi ngày 27/11/2026, Asia/Ho_Chi_Minh

Project: pse.vn
Repository: ngocnhanvo/psevn-actions
Branch: main
Code mode: auto-build
Source gateway: bypass
Read-only audit workflow: #45936673048 SUCCESS
Audit source commit: aa43d0bc5c695ad2d7f2fab7374c225b2f1caf43
Report commit: b730be7e56d95ee60c066dc03468831357449527
Status: PARTIAL — chưa xác minh bảng SQL gốc.

## Nguyên văn phản hồi dự định gửi

## Kết quả truy vết ban đầu

Mình đã xác minh được một vị trí hiển thị trên website Joomla gốc:

- **Trang:** https://pse.vn/ — Trang chủ.
- **Khu vực:** “Liên kết hữu ích”.
- **Cách hiển thị:** Một hộp chọn dạng dropdown (`select`), không phải danh sách bài viết trong mục “Tin MÙA VỤ THỊ TRƯỜNG”.

Ở website Astro mới, khu vực “Liên kết hữu ích” được hiển thị thành các liên kết riêng, lấy dữ liệu từ ESC Table `pse_03_vi`, qua component `src/astro/tablepress/Pse_03.astro`.

**Điểm chưa xác minh ở đầu lượt:** Năm tên miền khách đề cập trong ảnh có thực sự nằm trong dropdown Joomla này hay không, và chúng được lưu tại bảng/module nào của database gốc.

## Kết quả kiểm thử trực tiếp (27/11/2026)

Workflow read-only Playwright [#45936673048](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45936673048) đã **SUCCESS**. Joomla hiện dùng khối `div.moduletable` tên “Liên kết hữu ích” với `select name="jumpmenu"` và `onchange="MM_jumpMenu('window.open()',this,0)"`: chọn một mục thì mở URL trong cửa sổ/tab mới.

Có **7 liên kết thật** (cộng 1 placeholder): DPM, PVN, PVFC, DPM Miền Bắc, PCE Miền Trung, DPM Tây Nam Bộ, PVFCCo-SBD. URL và nhãn nguyên bản đều nằm trong [báo cáo kiểm chứng](https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/reports/PSE_ORIGINAL_JOOMLA_EXTERNAL_LINKS_2026-11-27.md).

Năm tên miền `vietfood.org.vn`, `giacaphe.com`, `dashsu.vn`, `thitruongphanbon.com`, `agromonitor.vn` **không xuất hiện** trong `option.value`, `a.href` hoặc HTML DOM trên hai trang Joomla đã kiểm tra: trang chủ và trang “Thông tin thị trường”. Trang “Thông tin thị trường” hiển thị danh sách bài báo, không có dropdown.

Khối `moduletable` + HTML/JavaScript này phù hợp với **Custom HTML module**. Bảng cần xác minh trước tiên là `ckiv4_modules`, tiếp đến `ckiv4_modules_menu` / `ckiv4_menu`; **chưa được chứng minh bằng SQL**. File SQL gzip thuộc cuộc trò chuyện trước không được mount vào cuộc trò chuyện hiện tại; không suy đoán ID module hoặc lịch sử link.

Đã lưu báo cáo, không sửa WP/Astro/PHP, không thêm liên kết hay build production.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
