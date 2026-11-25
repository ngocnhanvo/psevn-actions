# PSE Visual Builder — Phản hồi mới nhất

- Ngày: 2026-11-25 (Asia/Ho_Chi_Minh)
- Project: `pse.vn`
- Repository ghi: `ngocnhanvo/psevn-actions@main`
- PHP production: `ngocnhanvo/psevn-php@master` `796b00dbad6c1f292601b7b54448dcc496eac1fc`
- Astro source: `ngocnhanvo/psevn-astro@master` `b16a0bc9da447a76a23ca0abe3bae5602dd85e51`; Astro runtime production signed SHA `9a80fa78f6c893d0989761c083a42a0acbbd0141`
- Source CI: `45561807982` SUCCESS
- Guarded PHP FTPS: `45562079421` SUCCESS
- Real Inspector read-only E2E: `45562326752` SUCCESS
- Checkpoint commit: `cd06b8960c15b8a86e39d8aa6647888c3545f2d8`
- Kết luận: UI_PASS / PRODUCTION_READ_ONLY_PASS; SAVE_INTEGRITY_PASS chưa kiểm chứng.

## Nguyên văn phản hồi cuối cùng

**Chức năng “Thêm section sau vị trí chọn” đã PASS trên production.**

[Playwright #45560060922](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45560060922) xác nhận:

- Chọn section nguồn `pse_02_vi`, đặt sau `pse_00_vi` trực tiếp trên Preview: **PASS**.
- WordPress xác minh nguồn và vị trí chèn bằng `dry_run`: **PASS**.
- Hủy bản nháp và khôi phục Preview: **PASS**.
- Hoán đổi section, sáu nhóm item và thao tác Enter/Space/Escape: **PASS**.

Kết quả kiểm thử: `NO_CMS_WRITE=true`, `NO_SAVE=true`, `PREVIEW_CANCELLED=true`. Bản sửa PHP đã được phát hành và xác minh SHA256; Astro production không cần build lại.

Đây là nghiệm thu **Preview và kiểm tra lưu giả lập**, chưa phải nghiệm thu một lần Save thật lên WordPress.

**Inspector đã nghiệm thu thành công trên production.**

[Playwright #45562326752](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45562326752) xác nhận toàn bộ thao tác thực tế:

- Nhấp section nguồn `pse_02_vi`.
- Nút **Thêm section sau vị trí chọn (chung nguồn)** xuất hiện và sử dụng được.
- Nhấp section đích `pse_00_vi` ngay trên Preview; nguồn viền đỏ, đích viền xanh.
- Nút xác nhận được mở đúng điều kiện; bấm **Hủy** khôi phục trạng thái, không lưu WordPress.

Kết quả: `PSE_BUILDER_SECTION_INSERT_INSPECTOR_LIVE=PASS`. Các bài kiểm tra hoán đổi section, item, bàn phím và gỡ/nhân bản an toàn vẫn PASS.

Mình đã cập nhật [checkpoint Visual Builder](https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md) với commit `cd06b8960c15b8a86e39d8aa6647888c3545f2d8`. Phiên bản PHP đã phát hành: `796b00dbad6c1f292601b7b54448dcc496eac1fc`, [FTPS #45562079421](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45562079421) **SUCCESS**. [CI #45561807982](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45561807982) **PASS 157/157 bài test**.

**Phần vẫn chưa hoàn tất của toàn bộ Visual Builder:** ẩn/hiện section với cơ chế lưu và render thật; nhân bản ESC Table với **nguồn độc lập**; xử lý bảng ESC lồng nhau; các hợp đồng nguồn S2–S5 còn thiếu dữ liệu kiểm thử; và nghiệm thu Save thật → REST readback → Preview/public desktop/mobile → rollback trên dữ liệu đã được phép thay đổi. Mình không tạo dữ liệu giả hay ghi thử lên CMS production để báo PASS. Tính năng thêm section dùng chung nguồn đã hoàn tất ở mức **UI + Preview + dry-run production**, không đồng nghĩa đã nghiệm thu Save thật.

Chế độ code: auto-build  
Cổng ghi source: bypass  
Trạng thái: PARTIAL — chưa hoàn tất
