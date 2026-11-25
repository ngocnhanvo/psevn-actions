# PSE — latest response / current checkpoint (2026-11-25 ~18:29 Asia/Ho_Chi_Minh)

Project: pse.vn
Continuation after previous chat limit, source/bypass mode, automatic build only via approved WordPress signed Astro pipeline.
Knowledge main `34310f05a3b76c1dfd3f4bdecb27550342549f13`; Astro master **e345b24eec08def52be6620d64859432b72a7118** (production); PHP production immutable **3a29d06263182d14119a150778fd60cd1076b185**. PHP master **ad5cdb55a4dd316c9f2f31bd9e5f6c0980054e4a** with test-only later commits, runtime `site-config.php` file blob byte-identical to production `481dd560504deabed6d402221bd41216dad87c4a`. Actions main checkpoint commit `18b78e23db4d1cb8e88a27e031b55cda7be094c0`.
Canonical checkpoint: `docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md`.

## Planned verbatim user-facing answer (plain Markdown)

### 4. Kết quả Playwright sau triển khai

- [#45603540957](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45603540957) **SUCCESS**: Preview/Public khớp tại 1440, 1024 và 390 px (các vùng được kiểm tra), Hero không còn nhãn kỹ thuật, hành vi click-to-edit và liên kết hữu ích đúng; FAQ 15, Hotline 3, History 6; History responsive 1024/390 PASS.
- [#45603547124](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45603547124) **SUCCESS**: hoán đổi item/section trực tiếp trên Preview, nhấn Escape/Hủy khôi phục, thêm section dùng chung và xóa chỉ chạy dry-run; các thao tác clone nguy hiểm bị từ chối. **NO_CMS_WRITE=true; NO_SAVE=true.**
- Sau khi rà soát PHP, xác nhận quyền chỉnh sửa `Home_02` được tự phát hiện theo cột TablePress thực tế; không phải danh sách trường tĩnh. Bản thay đổi allowlist không cần thiết đã được hoàn nguyên. Bổ sung test đúng cho cột `button_link` và `image`; CI mới nhất [#45604412392](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45604412392) **SUCCESS — 28/28 test files, 162/162 tests**. Không có deploy PHP mới.
- Checkpoint đã lưu: [PSE Visual Builder source compliance, 25/11/2026](https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md) tại commit `18b78e2`.

**Các phần còn thiếu để đạt DONE toàn bộ:** nghiệm thu Save CMS thật trên nguồn thử riêng được phê duyệt với REST readback, Preview reload, public desktop/mobile và rollback; hoàn thiện vòng đời ẩn/hiện section, nhân bản section có nguồn độc lập, nested ESC Table và nghiệm thu đầy đủ S2–S5. Không tự tạo hoặc chỉnh nội dung kinh doanh production để giả lập bằng chứng.

**Kết luận:** Đã hoàn thành và kiểm chứng bản sửa source, CI, deploy Astro và Playwright hậu triển khai trong lượt này; **toàn bộ Visual Builder vẫn PARTIAL**, checkpoint lưu đầy đủ để tiếp tục đúng phần còn thiếu.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
