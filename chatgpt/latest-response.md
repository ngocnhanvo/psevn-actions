# Phản hồi mới nhất — PSE / Joomla → WordPress / Astro

**Thời điểm:** 21/11/2026, khoảng 22:35 (Asia/Ho_Chi_Minh)
**Project:** pse.vn
**Repository:** ngocnhanvo/psevn-actions
**Branch:** main
**Checkpoint:** docs/checkpoints/PSE_SOURCE_CONTENT_PARITY_2026-11-21.md
**Kết quả tổng thể:** PARTIAL — chưa hoàn tất

## Hoàn tất một hạng mục mới: báo cáo tài chính bán niên 2012

Mình đã đối chiếu 4 bản lưu gốc của bài Joomla #298 và chứng minh link MediaFire trước đây đã xuất hiện trên Joomla từ năm 2015, nhưng hiện dẫn đến lỗi. Bản tài liệu thay thế trên Stockbiz đã được kiểm tra đúng công ty PSE, báo cáo tài chính đã được soát xét cho kỳ 01/01–30/06/2012, 22 trang, 5.520.707 byte, SHA-256 06d58c64257e7751df13981b383b62fd2a4b48a5afbf4a30fd6ebf8be75e6e26. Đây là bản lưu thay thế, KHÔNG thể khẳng định trùng byte với file gốc đã mất.

- Kiểm tra nguồn PDF [#44918382814](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44918382814): PASS.
- Sau khi sao lưu UpdraftPlus, chỉ cập nhật WordPress Post #82548, tạo WordPress Media #83504, giữ nguyên ngày đăng 16/08/2012, tiêu đề và danh mục; ghi chú công khai nguồn Stockbiz và việc không chứng minh trùng byte với file MediaFire. Native CMS backup/ghi/readback [#44919000386](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44919000386): PASS. Không sửa các bài khác, không còn bản ghi tạm.
- Yêu cầu build đúng WordPress PHP Build Website [#44919264249](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44919264249): PASS với pending_count=1, no force.
- Signed Astro/FTPS production [#44919348861](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44919348861): PASS, không sử dụng pipeline độc lập.
- QA độc lập sau triển khai [#44919560360](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44919560360): PASS. Trang bài viết HTTP 200, canonical đúng, PDF mới trên Astro /api/files/ khớp byte/SHA-256 với Media WordPress và bản nguồn, chú thích Stockbiz hiển thị, link MediaFire chết không còn, responsive 390px/1440px không tràn ngang.

Trang đã hoàn tất sửa: https://pse.webnvn.com/pvfcco-se-cong-bo-thong-tin-bao-cao-tai-chinh-ban-nien-2012-da-duoc-soat-xet

## Kết quả kiểm kê 758 bài / 400 liên kết tài liệu

- Quét 758 Posts, 503 lượt liên kết tài liệu, 400 URL riêng.
- 397 WordPress Uploads PDF/Office files HEAD HTTP 200, không phát hiện 404/410; 2 bản annual report 2014 và 2016 sử dụng đường dẫn tương đối /api/files/ hợp lệ trên Astro public host, HTTP 200, đã so byte và SHA. Kết quả đầu tiên báo 404 do nhầm origin WordPress admin là **báo sai**, đã sửa script, không ghi thừa vào WP.
- Link PDF bên ngoài MediaFire năm 2012 đã được giải quyết tại #298 bằng bản lưu thay thế và công khai provenance.

## Hồi quy ngoài phạm vi #298

- Homepage/search regression sau deploy [#44919538583](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44919538583): PASS.
- Bảy bài Joomla phục hồi [#44919538713](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44919538713): FAIL do GET nguồn Joomla #205 timeout cả 3 lần, chưa thực sự so dữ liệu ở run này; không có chứng cứ Astro sai mới. Lần QA lịch sử #44912571563 PASS, không được mạo nhận mới PASS.
- Bốn album [#44919538681](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44919538681): FAIL vì ngay nguồn Joomla #1053 GET timeout 60 giây; chưa tới so ảnh và #975. Album #975 còn mâu thuẫn metadata ngày nguồn với tiêu đề sự kiện, chưa công bố.

## Chưa thể hoàn tất toàn website

- 12 bài Joomla thông thường (114,121,127,178,186,196,198,202,237,382,1090,341) thiếu bằng chứng byte ảnh/bài gốc, không tự giả ngày hoặc hình.
- 4 alias mô tả sản phẩm cũ 1425,1426,1434,1678 chưa có đích chính xác chứng minh duy nhất; không tạo sản phẩm trùng hoặc redirect đoán.
- Album 975 cần metadata Joomla đáng tin cậy; ảnh nguồn Tuổi Trẻ ở bài #225 chưa có bản binary gốc xác minh.
- Website Joomla www.pse.vn timeout gần đây, nên không thể chốt toàn bộ source-target parity từ trang nguồn. Cần dữ liệu backup Joomla và thư mục images gốc/ảnh nguồn publisher hoặc nguồn độc lập chứng minh chính xác mới được nhập tiếp. Không có build/deploy đang chờ và không cần chạy lại hạng mục #298/#379 đã PASS.

**Checkpoint đã cập nhật:** https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/checkpoints/PSE_SOURCE_CONTENT_PARITY_2026-11-21.md

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
