# Phản hồi ChatGPT mới nhất — PSE

- Ngày: 2026-11-23 (Asia/Ho_Chi_Minh)
- Project: pse.vn
- Repository: ngocnhanvo/psevn-actions
- Branch: main
- Trạng thái: DONE — hoàn tất phân tích nguyên nhân
- Đích kiểm tra: https://pse.webnvn.com/kali-phu-my-mo-ta-cac-bien-the
- Page ID: 83572
- Live browser QA: https://github.com/ngocnhanvo/psevn-actions/actions/runs/45128039993 (PASS read-only)

## Phản hồi cuối cùng

Mình đã xác minh nguyên nhân trên chính trang production bằng Playwright, đối chiếu với nội dung WordPress Page **83572**.

**Nguyên nhân chính là bảng HTML 3 hàng nhập từ Joomla chưa có ràng buộc kích thước ảnh, kết hợp CSS bảng dùng chung của Astro.** Trong WordPress, mỗi hàng là một ảnh sản phẩm cạnh mô tả, nhưng các thẻ `<img>` đều thiếu `width`/`height`. Trường ACF `cssmore` đang trống.

Trong `src/astro/pages/PublicPage.astro`, CSS chung ép bảng nội dung `width:100%!important` (giới hạn 1200 px), còn ảnh trong bảng `max-width:100%;height:auto`. Trình duyệt dùng auto table layout, dành **832 px** cho cột ảnh và **344 px** cho cột chữ ở viewport 1240 px.

Sau khi tải đủ ba ảnh, kích thước trên trang đo được là khoảng **830 × 1142 px**, **830 × 1065 px**, **830 × 1065 px**. Toàn bộ bảng cao **3373 px**. Trước khi hai ảnh lazy tải xong, bảng cao khoảng 1745 px, nên còn xảy ra thay đổi bố cục mạnh khi ảnh tải. Đây là lỗi **tỷ lệ ảnh và cấu trúc bảng**, không phải lỗi 404, ảnh hỏng hay tràn ngang: Playwright thấy `document.scrollWidth` bằng viewport ở 1440, 1240, 1024, 768 và 390 px.

**Hướng xử lý phù hợp:** sửa tại WordPress Page 83572, không hard-code dữ liệu vào Astro. Chuyển 3 hàng bảng cũ thành 3 mục sản phẩm responsive (ảnh giới hạn khoảng 240–300 px, mô tả chiếm phần còn lại; mobile xếp dọc) và cung cấp kích thước hoặc aspect ratio để giảm layout shift. Có thể tận dụng ACF `cssmore` để style đúng wrapper `.pse-historical-kali-1426`; không sửa quy tắc bảng toàn site để chữa riêng trang. Đồng thời, nội dung còn vài liên kết về `pse.vn` nên cần đối chiếu redirect riêng.

Mình mới **kiểm tra nguyên nhân, chưa ghi sửa nội dung WordPress hoặc deploy lại Astro**, đúng phạm vi yêu cầu hiện tại. Bằng chứng: [Playwright read-only](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45128039993).

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất

Nhật ký phản hồi: SAVED
