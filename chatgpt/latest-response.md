# PSE — phản hồi cuối 2026-11-25 ~22:52 ICT

Project: pse.vn
Knowledge: 34310f05a3b76c1dfd3f4bdecb27550342549f13
Astro production: a5a84dc435eb8a48fbed48f25b87a798c46b6d91
PHP production: 86d811bc29ed6712d76d7fe00e75337ccd9546d6
Actions checkpoint: 44d666965edcaa65e4579bc37e77aa4a8516c6ae
Isolated WordPress QA: #45649079525 SUCCESS
Status: PARTIAL — chưa hoàn tất.

## Nguyên văn phản hồi

## Đã mở rộng kiểm thử Visual Builder sang S8

Bộ kiểm thử trên WordPress/MariaDB cô lập đã ghi nhận **PASS** cho ba thao tác mới:

- **Menu:** sửa nhãn → đọc lại bản ghi WordPress → hoàn tác.
- **Thứ tự Menu:** đổi vị trí hai item thật → kiểm tra thứ tự nguồn → đổi ngược.
- **Footer:** sửa trường Hotline trong ACF thật → đọc lại → hoàn tác.

Các phép thử trước đó về S1–S6, ảnh WordPress Media và nhân bản/gỡ section cũng tiếp tục PASS.

Mình đang bổ sung kiểm tra từ chối thao tác sai nguồn/sai ngôn ngữ trước khi lưu checkpoint. Đây vẫn là kiểm thử ghi trên môi trường cô lập, không phải Save trên production.

[Workflow #45647758477](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45647758477) đã **SUCCESS**.

Ngoài các thao tác Save/rollback của S8, kiểm thử mới cũng xác nhận:

- Page tiếng Anh không được đọc nhầm Footer hoặc Header tiếng Việt.
- Item thuộc Menu khác bị từ chối.
- URL Menu dạng `javascript:` bị chặn.
- Hai bản ghi Info cùng ngôn ngữ gây lỗi nguồn không rõ ràng, thay vì hệ thống tự chọn một bản ghi.
- Ticket chỉnh sửa giả không được ghi dữ liệu.

Dữ liệu thử đều nằm trên WordPress cô lập; workflow xác nhận không ghi CMS production, không FTP và không build Astro.

[Workflow #45648411450](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45648411450) — **SUCCESS**.

Mình đã bổ sung và kiểm thử thành công thao tác đổi **ảnh chứng nhận Bộ Công Thương** trong Footer bằng Media ID của ACF thật. REST lưu ảnh mới, đọc lại, từ chối phiên bản cũ/ID không phải ảnh, rồi khôi phục Media ID ban đầu. Trường Hotline vẫn giữ nguyên.

Các kiểm thử S8 Menu, Footer text, quyền truy cập và S1–S6 cũng tiếp tục PASS.

[Workflow #45649079525](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45649079525) — **SUCCESS**.

Đã xác minh thêm nguồn **Footer ESC Table** trên WordPress thật trong môi trường cô lập: sửa nhãn → đọc lại bảng gốc → hoàn tác chính xác. Kiểm thử cũng xác nhận không thay cột ảnh hoặc item khác và từ chối phiên bản cũ, trường ảnh không được phép sửa, liên kết `javascript:`.

Đến đây, S8 đã có bằng chứng Save/readback/rollback cho **Menu, thứ tự Menu, Footer ACF text, Footer Media và Footer ESC Table assets**. Toàn bộ các phép thử S1–S6 tiếp tục PASS trong cùng workflow.

**Checkpoint:** [PSE Visual Builder — 25/11/2026](https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md), commit [44d6669](https://github.com/ngocnhanvo/psevn-actions/commit/44d666965edcaa65e4579bc37e77aa4a8516c6ae).

**Còn chưa hoàn tất:** Nhân bản section với ESC Table nguồn độc lập cần mapping renderer Astro và rollback hai nguồn; hiện Astro ánh xạ component từ tên shortcode nên bản copy mang ID khác không hiển thị đúng. Chưa có nguồn Page/ESC Table đã xuất bản được phép thử trên PSE production cho chuỗi Save → REST → Preview mới → signed Astro public build → kiểm tra responsive → rollback. S7 WordPress Post/Product và S9 code-managed tiếp tục readonly theo ma trận nguồn, không giả có writer.

**Phạm vi đã xong trong lượt này:** S8 backend thực trên WordPress cô lập và cập nhật checkpoint. Không thay PHP/Astro production, không ghi CMS production, không FTPS hay chạy Astro build không cần thiết.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
