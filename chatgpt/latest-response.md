# Phản hồi ChatGPT mới nhất — PSE

- Ngày: 2026-11-25 (Asia/Ho_Chi_Minh)
- Project: pse.vn
- Repository: ngocnhanvo/psevn-actions/main
- Trạng thái: PARTIAL — chưa hoàn tất
- Checkpoint chuẩn: docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md
- PHP source **đã triển khai**: ngocnhanvo/psevn-php commit 4077306a1238c6e9f5deece31a99943cbe46bed6
- PHP `master` đã tiến tiếp do thay đổi khác sau lần triển khai: `c34fab5a8cb5255cc8318447177b6ddf49fd5783` (code chỉ đổi `esc-visual-builder.php` và tests; source CI https://github.com/ngocnhanvo/psevn-actions/actions/runs/45456038256 SUCCESS). **Chưa xác minh deploy những commit mới này.**
- Astro source/production (không đổi): ngocnhanvo/psevn-astro@master 05275b6a31ed4078efcd05ad385305ed3b705b76
- Source-only CI: https://github.com/ngocnhanvo/psevn-actions/actions/runs/45454932475 — SUCCESS
- PHP-only signed FTPS/checksum/readback: https://github.com/ngocnhanvo/psevn-actions/actions/runs/45455130090 — SUCCESS, changed=2 checked=20 cleanup_pending=0
- Postdeploy authenticated read-only Playwright: https://github.com/ngocnhanvo/psevn-actions/actions/runs/45455489053 — SUCCESS, six S1 item swaps/Cancel, Page swap/Cancel, Hotline clone/remove dry-run/Cancel, NO CMS WRITE.

## Công việc phiên 25/11

Đã kiểm tra knowledge/main, commit/log/checkpoint PSE. Tiếp tục và triển khai bổ sung khả năng **gỡ một row tham chiếu API S2–S4** trực tiếp sau khi chọn item thật trong Visual Builder. REST PHP xác minh TablePress physical key, version, SHA-256 row hash và quyền; chỉ xóa reference row, không xóa Product/Page/Term/REST record; auto API cards bị khóa. UI xác nhận lại collection_mode/can_delete; tự khóa stale Preview sau thao tác. Bổ sung source regressions PHP + JS; CI PASS 116 Astro Vitest. Đã phát hành đúng hai PHP includes qua FTPS có kiểm tra checksum và rollback. Đã chạy lại production Browser QA sau phát hành, không có regression được quan sát.

## Giới hạn và bước phải tiếp tục

- **Chưa có live S2–S4 Save acceptance:** QA homepage phát hiện 0 API sections; khảo sát trước đó 29 Page phụ cũng không có dynamic. Không tạo/xóa CMS data để làm đẹp kết quả.
- S2–S4 thêm/chọn reference bằng picker, sửa local fields; S5 API-auto cấu hình query; section add/hide/show/nested và nguồn/REST Save→reload→public, rollback/concurrency vẫn chưa hoàn tất.
- Bước tiếp theo: kiểm tra riêng nhánh thay đổi giao diện mới hơn chưa triển khai, tránh FTPS chồng chéo; tiếp tục triển khai adapter tiếp theo theo S1–S9 trên schema có nguồn thật, mở rộng isolated source tests; chỉ thử CMS Save trên fixture độc lập được phép rồi đọc lại và dọn sạch. Không rerun các build/QA đã PASS khi không có thay đổi liên quan.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
