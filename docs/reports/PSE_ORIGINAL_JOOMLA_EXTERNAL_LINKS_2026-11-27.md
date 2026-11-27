# PSE — Xác minh liên kết ngoại bộ trên Joomla gốc (27/11/2026)

## Phạm vi và bằng chứng

- Nguồn khảo sát: HTML DOM thực tế, trình duyệt Chromium/Playwright không đăng nhập.
- Trang Joomla gốc: `https://www.pse.vn/` (HTTP 200) và `https://www.pse.vn/hoat-dong-kinh-doanh/thong-tin-thi-truong.html` (HTTP 200).
- Workflow chỉ đọc: [#45936673048](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45936673048) — SUCCESS, `PSE_JOOMLA_LINK_DOM_PASS`, `no_mutations=true`.
- Source kiểm tra: `scripts/pse-original-link-dom-audit.mjs`; workflow `.github/workflows/pse-original-link-dom-audit.yml`; artifact 14 ngày `pse-original-joomla-link-dom/report.json`.
- Không truy cập cơ sở dữ liệu gốc và không kết luận về lịch sử trước thời điểm kiểm tra.

## Vị trí hiển thị được xác minh

**Trang chủ Joomla:** khối `div.moduletable` có heading **Liên kết hữu ích**. Khối này chứa `<form>` với `<select name="jumpmenu" onchange="MM_jumpMenu('window.open()',this,0)">`. Người dùng nhìn thấy một **dropdown**; khi chọn một tùy chọn, JavaScript mở URL của lựa chọn trong cửa sổ/tab mới.

Danh sách mục theo thứ tự DOM:

| Thứ tự | Nhãn gốc | Giá trị URL gốc |
|---|---|---|
| 0 | ----Select---- | `!` (placeholder) |
| 1 | Tổng Công ty Phân bón và Hóa chất Dầu khí | `http://dpm.vn/` |
| 2 | Tập đoàn Dầu khí Việt Nam | `http://www.pvn.vn/` |
| 3 | Tổng công ty tài chính cổ phần dầu khí VN | `http://pvfc.com.vn/` |
| 4 | Công ty CP Phân bón và Hóa chất Dầu Khí Miền Bắc | `http://dpm-mb.vn/Home/` |
| 5 | Công ty CP Phân bón và Hóa chất Dầu Khí Miền Trung | `http://pce.vn/` |
| 6 | Công ty CP Phân bón và Hóa chất Dầu Khí Tây Nam Bộ | `http://dpmtnb.com.vn/` |
| 7 | Công ty CP quản lý và phát triển nhà Dầu khí miền Nam | `http://www.pvfcco-sbd.vn/` |

**Đính chính:** có **7 liên kết thật + 1 placeholder** (các chỉ số DOM 0..7).

Trang `/hoat-dong-kinh-doanh/thong-tin-thi-truong.html` không có phần tử `select` nào trong DOM được quan sát.

## 5 tên miền khách nêu

`vietfood.org.vn`, `giacaphe.com`, `dashsu.vn`, `thitruongphanbon.com`, `agromonitor.vn`.

Cả 5 đều **không xuất hiện** trong các `option.value`, `a.href` và HTML DOM đã tải tại **hai URL trên**. Đây **không phải** bằng chứng chúng chưa từng tồn tại ở nơi khác, không phải bằng chứng đã bị xóa khỏi database hay không có ở trang con chưa khảo sát.

## Nhận định vị trí lưu (chưa xác minh bằng SQL)

- Form và hàm `MM_jumpMenu` nằm trực tiếp trong nội dung của khối `moduletable`; kiểu triển khai này **phù hợp** với một **Custom HTML module** Joomla.
- Ứng viên cần đối chiếu trong dump gốc: `ckiv4_modules` (`title`, `module`, `position`, `content`, `published`), `ckiv4_modules_menu`, `ckiv4_menu`; chỉ kiểm tra `ckiv4_weblinks` nếu bảng này thực sự tồn tại.
- Chưa được đọc các bảng nói trên; **không gán** module ID, database row hay bảng lưu cụ thể khi chưa có chứng cứ SQL.
- File gzip đã tải ở cuộc trò chuyện trước không có mount trong cuộc trò chuyện hiện tại; bản báo cáo kiểm kê ngày 22/11 chỉ xuất `ckiv4_content` và `ckiv4_categories`.

## Đối chiếu website mới

- `psevn-astro/master/src/astro/tablepress/Pse_03.astro`: khu vực “Liên kết hữu ích” hiển thị thành danh sách link, đọc ESC Table `pse_03_vi` (không phải dropdown giống Joomla).
- Chưa thay đổi dữ liệu WordPress/Astro/PHP, chưa bổ sung 5 tên miền, chưa build/deploy production.

## Bước xác minh còn thiếu

Khi có lại dump `psevn_2028_1795354143.sql(1).gz` của Joomla gốc, lọc riêng các bảng `ckiv4_modules`, `ckiv4_modules_menu`, `ckiv4_menu` và bảng web links (nếu có) theo heading, hàm `MM_jumpMenu`, các tên miền, trả về chỉ metadata không chứa bí mật. Đối chiếu module `published`, `position` và `menuid` để chốt chính xác nơi lưu và phạm vi hiển thị.
