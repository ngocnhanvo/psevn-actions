# PSE Header: menu item WordPress thật, không tự sinh "Tất cả"

Ngày kiểm tra: 2026-10-26 (giờ Việt Nam). Mục tiêu: nhãn/URL/thứ tự của các mục như "Tất cả" phải là menu item WordPress có thể chỉnh sửa, không phải liên kết ghép chuỗi theo menu cha.

## Trạng thái triển khai

- WordPress PHP `master`: commit `75e1c421b83dd03ea5c0df2e9f57a1794914eb2b` bỏ checkbox và thuộc tính REST `showViewAll`, không thay dữ liệu menu. FTPS release + regression [#40246790023](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40246790023) PASS.
- Astro: [PR #76](https://github.com/ngocnhanvo/psevn-astro/pull/76) merge `github`, [PR #77](https://github.com/ngocnhanvo/psevn-astro/pull/77) merge `master`. Loại bỏ các anchor "Xem tất cả" do Astro tự tạo ở desktop và mobile; các menu item WordPress hiện hữu vẫn được render và giữ hoạt động active/transition. Test cả hai nhánh [#40246409916](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40246409916) PASS.
- Kiểm kê WordPress [#40246626041](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40246626041) PASS: `Header/vi` 47 item, các mục cha có URL đang `showViewAll=false`, nên không cần thêm item nào để bảo toàn giao diện hiện có. Đặc biệt Thư viện `showViewAll=false`; Ảnh/Video giữ nguyên. Không ghi CMS.
- Bấm Build Website thông qua PHP [#40246923756](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40246923756) PASS (pending 4, mode normal, no forced build). [Astro Build + FTPS + activate #40246981687](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40246981687) PASS.
- Live Playwright [#40247129925](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40247129925) PASS: 390px/1440px, 36 URL WordPress cần có thì missing 0; Thư viện không có item "Xem tất cả" nhưng còn Ảnh + Video; hiệu ứng phủ mờ khi click liên kết nội bộ hoạt động.

## Nguyên tắc tiếp theo

Mỗi mục "Tất cả" là menu item WordPress **thực**, thêm theo các loại liên kết mà Menu Manager đã hỗ trợ, có nhãn do quản trị viên đặt; có thể kéo thả, sửa, xóa như mọi item khác. Không thêm checkbox trong menu cha; không tự nối "Xem tất cả" + nhãn menu cha trong frontend. Menu cha có menu con vẫn đóng/mở bằng button click/tap; item thật có URL được render bằng link.

## Ghi chú kiểm toán

Không xóa/di chuyển/sửa một trong 47 menu item hiện có. Không chạy chế độ APPLY của tác vụ chuyển đổi (vì kiểm kê không có ứng viên). Các script kiểm tra WordPress/API sử dụng cấu hình qua secrets, không gán cứng host hoặc tài khoản vào mã nguồn. Kiểm thử PHP REST loại bỏ thuộc tính cũ bổ sung trong workflow Header live QA.
