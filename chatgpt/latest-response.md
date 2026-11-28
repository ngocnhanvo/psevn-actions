# PSE — phản hồi ngày 28/11/2026 (Asia/Ho_Chi_Minh)

Project: pse.vn
Repository: ngocnhanvo/psevn-actions
Branch: main
Code mode: auto-build
Source gateway: bypass
Scope: Không tìm được 4 Joomla Posts đã nhập khi tìm trong WordPress Admin.
Verified: DONE — WordPress Admin search 4/4 PASS; CMS Joomla source identity 4/4 PASS; reviewed PHP FTPS hashes PASS.

## Nguyên văn phản hồi cuối dự định gửi

### Đã kiểm chứng nguyên nhân

Ban đầu tìm nguyên tiêu đề bài “Thủ tướng Lê Minh Hưng…” trong WordPress Admin không ra, mặc dù cả 4 Post đều có `status=publish`, slug/WordPress ID và ngày xuất bản đúng. Kiểm thử WordPress REST và màn hình Admin độc lập đã tái hiện sự khác biệt.

Nguyên nhân được xác nhận bằng SQL production: bộ lọc chỉ hiển thị bài gốc trong `esc-multilingual-admin.php` chấp nhận `origin_page_id` không tồn tại, chuỗi rỗng hoặc `0`, nhưng ACF ghi một quan hệ rỗng thành `a:0:{}`. Vì vậy SQL Admin loại cả 4 bài dù REST và màn hình sửa bài mở được.

### Đã sửa lỗi trên production

- Bản vá PHP thêm chính xác giá trị ACF rỗng `a:0:{}` vào điều kiện bài gốc, vẫn ẩn bản dịch thực sự. GitHub Actions PHP release [#46094913853](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46094913853) **SUCCESS**.
- Playwright kiểm tra trực tiếp WordPress Admin [#46095066138](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46095066138) **SUCCESS: 4/4 bài tìm được**, cả tìm nguyên tiêu đề và các từ khóa riêng.
- Joomla ID 1746/1745/1744/1743 được chuyển sang trường nguồn riêng `pse_joomla_source_id`, không sử dụng `origin_page_id` dành cho bản dịch. WordPress metadata repair [#46095358937](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46095358937) **SUCCESS** sau DB-only backup: 4/4 nguồn, 4/4 tiêu đề gốc, 4/4 tìm Admin, nội dung/ngày/danh mục/ảnh giữ nguyên.
- PHP source identity release [#46095279755](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46095279755) **SUCCESS**.
- FTPS read-only [#46095566210](https://github.com/ngocnhanvo/psevn-actions/actions/runs/46095566210) xác nhận cả hai file PHP production trùng SHA source đã duyệt và mã chẩn đoán SQL tạm đã được gỡ.
- Importer được sửa để các lần nhập sau lưu Joomla ID vào đúng trường riêng, không lặp lỗi. Không chạy nhập lại và không sinh Post trùng.

Bốn WordPress Post: `83843`, `83845`, `83847`, `83849`. Giữ `publish_up` chính xác tới giây; riêng #1745 là **26/11/2026 08:50:00**.

Bây giờ có thể tải lại **WordPress → Bài viết**, tìm “Thủ tướng Lê Minh Hưng”, hoặc mở [bài 83843](https://admin-pse.webnvn.com/wp-admin/post.php?post=83843&action=edit).

[Checkpoint nghiệm thu](https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/checkpoints/PSE_FOUR_POSTS_ADMIN_SEARCH_FIX_2026-11-28.md).

**Lưu ý:** các bài/ảnh Joomla khác trong dự án tổng thể vẫn có thể cần QA riêng; phạm vi lỗi tìm kiếm Admin này đã được sửa và nghiệm thu.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
