# PSE Visual Builder — Khôi phục và tiếp tục nghiệm thu 25/11/2026

- Project: `pse.vn`.
- Đích lưu: `ngocnhanvo/psevn-actions@main`, `chatgpt/latest-response.md`.
- Thời điểm: 2026-11-25 khoảng 11:40 (+07, Asia/Ho_Chi_Minh).
- Căn cứ: `docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md` mới nhất, commit Actions `ed68c658a1cee086f634f3e025f93f3ca9e53498`.
- Trạng thái lưu: lưu qua GitHub commit trực tiếp, đối chiếu SHA sau ghi; cổng bypass được khai báo.

## Đã khôi phục trạng thái mới nhất của PSE

Đối chiếu GitHub và checkpoint ngày 25/11/2026, các bản production trước lượt này đã có bằng chứng triển khai thành công:

| Thành phần | Commit | Kết quả |
|---|---|---|
| Knowledge `main` | `34310f05` | Đã cập nhật quy định Visual Builder |
| Astro `master` | `2936ecb0` | Deploy PASS trước lượt này |
| PHP `master` | `09b60096` | FTPS PASS trước lượt này |
| Playwright production | [Run #45544969354](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45544969354) | QA PASS trước lượt này |

Các chức năng đã nghiệm thu ở chế độ không ghi CMS gồm hoán đổi section/item trên Preview, chọn bằng Enter/Space, khôi phục khi Hủy và ngăn thao tác nhân bản section không an toàn.

**Dự án chưa hoàn tất toàn bộ:** nghiệm thu Save/REST thực tế, một số thao tác section độc lập và nguồn dữ liệu động S2–S5 vẫn còn thiếu. Tiếp tục các phần có thể kiểm chứng an toàn, không tự sửa dữ liệu WordPress production để tạo kết quả kiểm thử.

## Phần nâng cấp đã triển khai trong lượt này

Đã bổ sung **nhấn Escape để Hủy chọn đích hoán đổi** trong Visual Builder. WordPress Inspector kiểm tra đúng iframe, nguồn dữ liệu và phiên thao tác trước khi thực hiện Hủy; không phát sinh API ghi dữ liệu mới.

- [Source CI #45546864579](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45546864579): **PASS**.
- [PHP FTPS #45547029397](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45547029397): **PASS**, đúng SHA `e4d3d835`, chỉ 1 file thay đổi.
- [Astro production #45547221745](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45547221745): **PASS**, đúng SHA `88abba46`, ZIP đã ký kích hoạt thành công.
- Checkpoint mới đã lưu tại commit Actions `c0ef0228` ở giai đoạn giữa lượt và đã được cập nhật tiếp sau nghiệm thu.

Bài kiểm thử trình duyệt xác nhận đường Hủy thực tế từ Inspector từng đang chạy; kết quả cuối dưới đây thay thế trạng thái chờ đó.

### Nghiệm thu browser đã hoàn tất

[Playwright production #45547663816](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45547663816) **PASS**: section và item đều Hủy bằng Escape qua Inspector thật; 6/6 nhóm hoán đổi trực tiếp PASS; Hotline clone/remove không ghi CMS PASS; FAQ/Vision bị chặn nhân bản không an toàn đúng quy tắc. Log xác nhận `NO_CMS_WRITE=true`, `NO_SAVE=true`, `PREVIEW_CANCELLED=true`. Lượt kiểm thử đầu [#45547472119](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45547472119) thất bại do assertion diễn ra trước khi iframe dọn marker; đã sửa kiểm thử chờ trạng thái DOM ổn định, không bỏ assertion, và rerun PASS.

Kiểm thử [4 album/464 ảnh #45547443106](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45547443106) **PASS** ở cả 390px và 1440px; SSR, homepage, bảy bài Joomla và build-speed postdeploy cũng PASS. Checkpoint được lưu đầy đủ tại [commit `ed68c658`](https://github.com/ngocnhanvo/psevn-actions/commit/ed68c658a1cee086f634f3e025f93f3ca9e53498).

**Trạng thái tổng thể:** đợt nâng cấp Escape đã hoàn tất, nhưng toàn bộ Visual Builder vẫn PARTIAL vì chưa nghiệm thu Save→REST readback→Preview reload→public→rollback trên fixture production được phép cho S1–S4; thiếu published manual reference fixture S2–S4, metadata query tự động S5 và các thao tác section add/show/hide độc lập. Không tạo dữ liệu giả, không thực hiện no-op CMS Save chỉ để làm test xanh.

Phản hồi cuối cùng đã được lưu tại `chatgpt/latest-response.md` trên Actions main.

Chế độ code: auto-build  
Cổng ghi source: bypass  
Trạng thái: PARTIAL — chưa hoàn tất
