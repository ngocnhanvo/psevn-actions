# PSE — 15 bài Tin Công ty Joomla đã nhập và nghiệm thu production

**Ngày nghiệm thu:** 2026-11-27 (Asia/Ho_Chi_Minh)  
**Trạng thái:** COMPLETE — 15/15 WordPress Posts và 93/93 ảnh gốc, QA production PASS.

## Dữ liệu gốc và phạm vi

- Trang Joomla: https://pse.vn/21-tin-tuc-su-kien/tin-cong-ty.html
- Database do chủ dự án cung cấp: `ckiv4_content`, danh mục Joomla `catid=21`.
- SHA-256 bản SQL gốc: `ec85436b4e7a475b13c2955e8e0adcbbae11c87e8502669b3ae77e51f2bc4f2c`.
- Manifest chính xác đến giây: `docs/source/pse-company-15-joomla-created-seconds.json`.
- Mốc `created` và `publish_up` đối chiếu trùng nhau cho 15/15 bài; dùng giờ địa phương WordPress UTC+7.
- Danh mục WordPress đích: `1742` (`tin-cong-ty`). Giữ tiêu đề, slug, nội dung HTML gốc, thứ tự 93 ảnh, source origin ID và featured media.
- Kiểm kê trước khi import: `docs/checkpoints/pse-company-missing-source-articles-2026-11-27.json` (là **snapshot trước import**, có trạng thái PENDING lịch sử; **không** được dùng để kết luận trạng thái hiện tại).

## WordPress đã xuất bản

| Joomla ID | WordPress Post ID | Ngày giờ xuất bản gốc UTC+7 |
|---|---:|---|
| 1657 | 83794 | 2025-10-21 06:50:40 |
| 1644 | 83796 | 2025-06-04 09:16:25 |
| 1643 | 83798 | 2025-06-04 09:02:01 |
| 1633 | 83800 | 2025-04-21 08:17:05 |
| 1632 | 83802 | 2025-04-21 08:04:37 |
| 1607 | 83804 | 2025-01-16 12:44:44 |
| 1605 | 83806 | 2025-01-14 08:35:35 |
| 1589 | 83808 | 2024-08-22 09:15:52 |
| 1588 | 83810 | 2024-08-20 09:22:42 |
| 1569 | 83812 | 2023-12-26 01:36:20 |
| 1557 | 83814 | 2023-04-27 04:39:44 |
| 1538 | 83816 | 2022-11-21 09:18:27 |
| 1530 | 83818 | 2022-08-24 08:16:40 |
| 1517 | 83820 | 2022-05-24 06:17:36 |
| 1494 | 83822 | 2021-12-06 10:32:15 |

**Bằng chứng import:** https://github.com/ngocnhanvo/psevn-actions/actions/runs/45967914746  
Log: `PSE_HISTORICAL_COMPANY_RESTORE_PASS=15_POSTS_93_IMAGES_SECOND_PRECISION_2025_UNCHANGED`.

## An toàn ghi dữ liệu và xử lý sự cố

- Đã thực hiện backup database WordPress bằng UpdraftPlus trước import; không xóa bản sao lưu.
- Ảnh được đối chiếu theo byte SHA-256, không ghi đè Media tồn tại. Một số tên JPG Joomla trùng tên ảnh WordPress nhưng khác bytes: đã dùng tên mới xác định bằng hash URL nguồn.
- Nếu kết nối tạm thời ngắt, importer kiểm tra lại exact Media để tiếp tục, không tạo trùng.
- Sau upload, kiểm tra lại 93/93 Media trong WordPress **trước** khi xuất bản 15 bài.
- Các lần thử chưa thành công được lưu trong Actions; chỉ run #45967914746 được xác nhận PASS toàn bộ.

## Múi giờ hiển thị Astro

- Mã nguồn Astro production: `ngocnhanvo/psevn-astro` nhánh `master`, commit `852facb6b1904519334482abfa175a2cc2ce83d2`.
- Trang chi tiết sử dụng `date` WordPress (giờ địa phương) cho thuộc tính `<time datetime>` và ngày xuất bản, giữ nguyên giây.
- `date_gmt` chỉ dùng làm mốc tính thời gian tương đối để tránh chênh lệch giờ.
- Source-only CI: https://github.com/ngocnhanvo/psevn-actions/actions/runs/45971057029 — **153/153 test files, 718/718 tests PASS**.
- Triển khai production qua WordPress Build Website và pipeline ký sẵn: https://github.com/ngocnhanvo/psevn-actions/actions/runs/45971542620 — **SUCCESS**, xác minh source SHA đúng `852facb6...`.
- Quyền ngoại lệ force-once cho lần release này đã thu hồi khỏi danh sách allowlist sau nghiệm thu.

## QA production cuối cùng

https://github.com/ngocnhanvo/psevn-actions/actions/runs/45971839726 — **SUCCESS**.

- 15/15 trang bài viết chính thức trả HTTP 200.
- 15/15 tiêu đề khớp Joomla và thời gian xuất bản `<time datetime>` khớp chính xác `created` của SQL Joomla đến giây.
- 93/93 ảnh nội dung qua proxy Astro `/api/images/` trả HTTP 200 và content-type `image/*`.
- Menu **Tin Công ty → Tất cả** hiện diện và trỏ đúng trang lưu trữ.
- Chốt: `PSE_COMPANY_HISTORICAL_LIVE_PARITY=PASS 15_POSTS_93_ORIGINAL_IMAGES_MENU`.

**Trạng thái hiện tại cho phạm vi 15 bài:** DONE. Không phát sinh bài trùng hoặc xóa bài WordPress hiện có.
