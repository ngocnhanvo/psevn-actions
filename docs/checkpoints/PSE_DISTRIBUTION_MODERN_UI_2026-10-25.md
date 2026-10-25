# PSE — Kênh phân phối, giao diện hiện đại từ WordPress (25/10/2026)

## Phạm vi và dữ liệu đã kiểm chứng

- Source website: `https://pse.vn/hoat-dong-kinh-doanh/kenh-phan-phoi.html` (Joomla cũ). Dữ liệu đã được nhập vào 4 native WP Pages từ phiên trước; lần này **không nhập lại, không thay ảnh/PDF, không chỉnh CSDL**.
- `ngocnhanvo/psevn-astro`: DEV `github`, PROD `master`. `ngocnhanvo/psevn-actions`: `main`. PHP/WordPress xử lý duy nhất Build Website.
- Native WP Page keys: `pse-business-kenh-phan-phoi`, `pse-business-quy-che-nha-phan-phoi`, `pse-business-he-thong-kho`, `pse-business-he-thong-phan-phoi-san-pham-tai-cac-tinh-mien-dong-nam-bo`; all action `PublicPage`.
- Chromium READ ONLY shape audit [#40195148946](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40195148946) và [#40195267840](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40195267840) PASS:
  - Kho: một bảng `STT/HỆ THỐNG KHO`, 5 kho, mỗi kho **3 dòng** gồm hàng tên với `rowspan=3`, hàng địa chỉ, hàng điện thoại/fax.
  - Kênh phân phối: một bảng lồng 4 **chi nhánh** (Lâm Đồng, Đồng Nai, Bình Phước, Tây Ninh) với trụ sở chính và điện thoại/fax; bảng dữ liệu riêng **11 tỉnh/thành**, tổng **04 chi nhánh, 26 đại lý, 711 cửa hàng**. **Không phải 13 doanh nghiệp** như phỏng đoán ban đầu; 13 là tổng dòng bảng gồm tiêu đề và tổng kết.
  - Trang quy chế chứa liên kết PDF WordPress Media do phiên trước đã đối soát SHA; không sửa hay thay liên kết.
- WordPress gốc vẫn là source of truth cho mọi địa chỉ, số liệu, khu vực, ảnh và PDF; Astro chỉ biến đổi HTML trên giao diện, không ghi ngược vào CMS.

## Mã nguồn và bảo vệ dữ liệu

- PR [#53](https://github.com/ngocnhanvo/psevn-astro/pull/53) merged `97ad60289f28a040e49d2bcf92c381b929080b41`: giao diện landing hiện đại, CSS cards, bộ lọc và unit tests, không thay router.
- Sau audit cấu trúc thực tế, PR [#55](https://github.com/ngocnhanvo/psevn-astro/pull/55) merged `41693534e079119fdf5f3c7e9312e65036bde1d6` (isolated 4 files, không gộp thay đổi homepage-slider từ agent khác):
  - `src/lib/seo/pseDistributionPresentation.ts` chỉ chuyển cấu trúc bảng **khi schema khớp đầy đủ**. Nhóm đủ 3 dòng kho; giữ đầy đủ 4 liên hệ chi nhánh; bảng thống kê 11 tỉnh; tính tổng từ WordPress, đối chiếu tổng của hàng cuối. Nếu nguồn thay đổi, render nguyên HTML CMS không xóa gì.
  - `src/astro/pages/PublicPage.astro` nhận diện bốn khóa `pse-business-*`, hiển thị tên trang và KPI đúng nội dung, ô tìm tỉnh không dấu/bộ lọc tỉnh, counter và empty state.
  - `src/styles/pseDistribution.css`: 3 card landing, cards kho và chi nhánh, KPI/tỉnh, responsive 390/768/1440, không tạo scroll nội bộ.
  - `src/lib/seo/pseDistributionPresentation.test.ts`: fixtures đúng rowspan 3 dòng, bảng lồng chi nhánh, 11 tỉnh/tổng, fallback nội dung gốc.
- NO BUILD Vitest + Astro compiler [#40194584207](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40194584207) PASS (PR53) và [#40195770679](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40195770679) PASS (cấu trúc CMS thật). Các thay đổi của tính năng slider homepage phát sinh song song đã được tách ra khỏi PR55.
- Existing read-only PSE Distribution Playwright `scripts/pse-distribution-live-qa.mjs` đã cập nhật đo cards 5/11, 4 chi nhánh, 3 KPIs 4/26/711, tương tác bộ lọc và PDF. Workflow `pse-distribution-live-qa.yml` thêm chế độ chỉ kiểm tra schema thật, dùng khi chưa deploy. **Không chạy live UI acceptance khi code chưa được phát hành**.

## Chặn phát hành cần giữ nguyên

- Một NORMAL PHP/WordPress Build Website [#40194870103](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40194870103) chạy sau PR53, signed-unzip preflight PASS, auth/PHP status success nhưng **`PSE_WP_PENDING_CHANGE_COUNT=0` => `PSE_WP_BUILD=NO_PENDING_CHANGES`**, exit 2 (expected gate). Không gửi Astro build Actions, không FTP, không triển khai source PR53 hay PR55.
- Không dùng `force_build`, không sửa WP giả để tạo pending_count, không chạy trùng official PHP request. Cần một thay đổi CMS thật được duyệt hoặc quyền Build ngoại lệ rõ ràng đúng tác vụ này rồi mới phát hành.
- **State:** `CMS_SOURCE_PARITY=PASS`, `CODE_MERGED=PASS`, `SOURCE_TESTS=PASS`, `WORDPRESS_BUILD=BLOCKED_NO_PENDING`, `DEPLOYMENT=NOT_DONE`, `NEW_VISUAL_LIVE_QA=NOT_RUN`. Website đang là phiên trước.
- Nếu owner phê duyệt cách build đúng gate ở lần sau: trước hết kiểm tra latest HEAD, active PHP/Astro runs, pending_count; Build Website duy nhất qua PHP/WordPress, kiểm tra signed FTPS/mã release, sau đó kích hoạt *một* `.pse-distribution-live-trigger` thông thường (commit message KHÁC chuỗi `audit(pse): distribution CMS table shapes before rollout`) để chạy QA mới tại 390/768/1440; xác thực hình, link, PDF và không scroll. Không lặp những source imports đã PASS.

Chế độ code: auto-build
