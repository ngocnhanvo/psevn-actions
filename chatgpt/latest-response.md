# PSE Visual Builder — Phản hồi mới nhất

- Ngày: 2026-11-25 (Asia/Ho_Chi_Minh), khoảng 12:20 (+07)
- Project: `pse.vn`
- Repo bàn giao: `ngocnhanvo/psevn-actions@main`, `chatgpt/latest-response.md`
- PHP production: `ngocnhanvo/psevn-php@master` `950aeebd568ba49d3a6518c7cf81be1f3e0341aa`
- Astro production không đổi: `ngocnhanvo/psevn-astro@master` `88abba46e9aa13543fd0c24af0f2d04d207feb6d`
- Checkpoint commit: `43f7b1325ff7a8dcb6f90e60cf8f19b5a64a9e66`
- Production QA run: `45552324540` SUCCESS (read-only)
- Lưu phản hồi: GitHub write trực tiếp trong cổng bypass, kiểm tra SHA lại sau ghi.

## Nguyên văn phản hồi cuối cùng

Mình đã xử lý thêm lỗi nhận diện nguồn section trong Visual Builder: các chuỗi giống shortcode ESC Table nhưng nằm trong HTML comment, thuộc tính hoặc vùng `<script>`, `<style>`, `<textarea>`… không còn được coi là section hợp lệ để hoán đổi.

- Mã nguồn PHP đã cập nhật tại commit [`4bf3b35`](https://github.com/ngocnhanvo/psevn-php/commit/4bf3b35ce3e423849bbb1375b813d22130b95cfe).
- [CI #45551437442](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45551437442) **PASS**, bao gồm các trường hợp biên vừa phát hiện và 150 bài test Astro.

Bản sửa này bảo vệ dữ liệu Page khi người quản trị thao tác trên Preview. Đây là phần bổ sung sau đợt nâng cấp hoán đổi section trước đó.

Mình cũng đã sửa đường kiểm tra quyền chỉnh sửa ESC Table: một shortcode trùng tên bảng nhưng nằm trong comment hoặc HTML không hiển thị sẽ không còn được tính là bằng chứng Page sở hữu bảng đó.

Phần này đã được commit vào `psevn-php/master` tại [`950aeeb`](https://github.com/ngocnhanvo/psevn-php/commit/950aeebd568ba49d3a6518c7cf81be1f3e0341aa). Bản vá có thêm test từ chối lưu vào bảng khi nguồn Page không hợp lệ. Mình đang kiểm thử trước khi đưa phần thay đổi này lên production.

**Cả hai bản PHP đã được phát hành và nghiệm thu trên production.** [FTPS #45551562551](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45551562551) và [FTPS #45552058706](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45552058706) đều SUCCESS; SHA256 readback PASS, `cleanup_pending=0`. Bản PHP cuối cùng là `950aeebd`. Không cần build Astro vì mã nguồn frontend không đổi và không có thao tác ghi CMS.

[CI cuối #45551925895](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45551925895) **SUCCESS**, gồm PHP nguồn, bảo vệ quyền sở hữu bảng và **150/150 test Astro**. [Playwright production #45552324540](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45552324540) **SUCCESS**: hoán đổi hai section `pse_00_vi` ↔ `pse_01_vi` đúng vị trí, sáu nhóm item PASS, Enter/Space/Escape và Hủy PASS, Hotline clone/remove dry-run PASS, FAQ/Vision clone không an toàn bị chặn. `NO_CMS_WRITE=true`, `NO_SAVE=true`, `PREVIEW_CANCELLED=true`.

Các lần CI đầu của bản vá mới đã thất bại tại test biên `<textarea>` và được chẩn đoán, sửa đúng parser; CI cuối PASS. Không nới lỏng test, không sửa dữ liệu WordPress production để tạo kết quả giả.

Checkpoint mới nhất: [Visual Builder Source Compliance](https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md), commit [`43f7b13`](https://github.com/ngocnhanvo/psevn-actions/commit/43f7b1325ff7a8dcb6f90e60cf8f19b5a64a9e66).

**Toàn bộ Visual Builder vẫn chưa thể gọi là DONE:** thiếu writer/nguồn đã xác minh cho section thêm/ẩn/hiện và nhân bản nguồn độc lập, quản lý ESC Table lồng nhau, dữ liệu mẫu S2–S5 và nghiệm thu Save→REST readback→Preview→public→rollback trên fixture production được phép. Kết quả preflight/Preview không phải nghiệm thu Save thật. Mình giữ nguyên các chốt bảo vệ và đã lưu phần còn lại trong checkpoint để phiên tiếp theo triển khai tiếp, không làm lặp các bước PASS.

Chế độ code: auto-build  
Cổng ghi source: bypass  
Trạng thái: PARTIAL — chưa hoàn tất
