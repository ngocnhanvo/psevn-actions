# Phản hồi mới nhất — PSE tiếp tục nguồn Joomla, ngày 21/11/2026 23:00 (Asia/Ho_Chi_Minh)

**Project:** pse.vn
**Repository:** ngocnhanvo/psevn-actions
**Branch:** main
**Checkpoint:** docs/checkpoints/PSE_SOURCE_CONTENT_PARITY_2026-11-21.md
**Status:** PARTIAL — chưa hoàn tất
**Only new commits:** actions/main read-only scripts/workflows and checkpoint, no WordPress CMS/app-source write, no production Astro build/FTPS in this continuation.

## Phát hiện mới: album Joomla #975 có dữ liệu EXIF khác hẳn năm trong tiêu đề

Kiểm tra độc lập [GitHub Actions #44921649351](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44921649351) đã xác nhận cả **16/16 ảnh gốc được lấy mẫu** đều có EXIF DateTimeOriginal là **ngày 11/09/2010**.

Đây là phát hiện quan trọng vì:

- Nguồn Joomla RSS ghi ngày 05/03/2011 và com_search ghi 06/03/2011.
- Tiêu đề album lại ghi *Đại hội công đoàn nhiệm kỳ II 10/2013*.
- Các ảnh mẫu đều được chụp trước ngày nguồn Joomla ghi nhận, chứ không phải tháng 10/2013.

Điều này cho thấy **mâu thuẫn có thể nằm trong lịch sử nội dung/tiêu đề của Joomla**, chứ không đơn thuần là lỗi ngày chuyển sang WordPress. Tuy nhiên, ngày chụp ảnh không phải ngày xuất bản. Mình sẽ kiểm tra đủ **110 ảnh** trước khi đưa ra quyết định về album này.

## Đã kiểm tra đủ 110/110 ảnh của album #975

[GitHub Actions #44921806074](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44921806074) **SUCCESS**.

| Kiểm tra | Kết quả |
|---|---:|
| Ảnh gốc trong WordPress Media | 110/110 |
| Ảnh tải được, có SHA-256 | 110/110 |
| Ảnh có EXIF DateTimeOriginal | 110/110 |
| Ảnh có ngày chụp ghi trong EXIF là 11/09/2010 | **110/110** |

Kết quả này xác nhận **album không thiếu file ảnh**. Vấn đề còn lại là lịch sử xuất bản: ảnh ghi năm 2010, dữ liệu Joomla ghi năm 2011, nhưng tiêu đề ghi tháng 10/2013.

Mình vẫn giữ album ở trạng thái chưa công bố vì chưa có bằng chứng xác định khi nào bài Joomla được sửa tiêu đề hoặc xuất bản dưới tiêu đề hiện tại. Tự chọn 2011 hay 2013 để đăng có thể làm sai lịch sử nội dung.

## Tiếp tục và mốc còn thiếu

Đối với bài #225, mình tìm được quy luật đường dẫn lưu ảnh tĩnh của hệ thống Tuổi Trẻ cũ và kiểm tra biến thể cụ thể dành cho ảnh ThumbnailID=521979. Workflow đọc-only [#44921384378](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44921384378) SUCCESS nhưng **không tìm được JPEG gốc có thể xác minh SHA-256**. Vì vậy chưa sửa ảnh nguồn HTTP trong WordPress.

**Checkpoint mới nhất:** [PSE source content parity 21/11](https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/checkpoints/PSE_SOURCE_CONTENT_PARITY_2026-11-21.md), đã xác minh sha f44b4fb18656709c2a252c874cf3f37dbd2dd045. Đã hoàn thành 2 workflow điều tra mới; không có job đang chạy.

Các hạng mục đã hoàn thành trước gồm PDF báo cáo tài chính 2012 Joomla #298 → Post #82548 / Media #83504, WordPress Build Website, signed Astro FTPS và QA mobile/desktop #44919560360 PASS. Không làm lại.

**Chưa thể xác nhận đồng bộ toàn bộ website:** 12 bài Joomla thiếu ảnh/văn bản nguồn; album #975 thiếu bằng chứng ngày đăng sau khi tiêu đề thay đổi; 4 alias Product cũ #1425/#1426/#1434/#1678 thiếu đích duy nhất; ảnh #225 Tuổi Trẻ không còn byte gốc; Joomla gốc vừa timeout khi chạy hồi quy. Cần bản sao lưu Joomla DB (các trường #__content created, modified, publish_up cho #975), ảnh nguồn/thư mục images gốc hoặc bằng chứng ảnh từ publisher để tiếp tục mà không đoán.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
