# PSE Visual Builder — Kết quả tiếp tục 25/11/2026

- Project: `pse.vn`
- Repo lưu phản hồi: `ngocnhanvo/psevn-actions`, branch `main`
- Thời điểm: 2026-11-25 11:18 (+07, Asia/Ho_Chi_Minh)
- Đối chiếu checkpoint: `docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md` commit `013cbc178c6c4e05a22186d76e2260529e38b8c9`
- Trạng thái ghi: SAVED sau khi GitHub xác minh commit

## 1. Đã khôi phục trạng thái dự án PSE

Đã đọc `knowledge/main` (quy tắc S1–S9 và CORE), checkpoint ngày 25/11, `chatgpt/latest-response.md` trước lượt này; đối chiếu repo Astro/PHP/Actions và các run production trước đó. Lúc khôi phục Knowledge `34310f05`, Astro production `f7465f33`, PHP production `09b60096`, Actions `e40da605`. Previous signed Astro [#45542620028](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45542620028) PASS, PHP guarded FTPS [#45542344078](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45542344078) PASS, direct Preview Playwright no-write [#45543276751](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45543276751) PASS.

## 2. Đã bổ sung thao tác bàn phím cho Visual Builder

Astro `master@2936ecb0a2ee62ac46f94d0a1f42290cf47ab75b`: Tab+Enter/Space chọn item/section đích trực tiếp trên DOM Preview khi bật chế độ đỏ nguồn/xanh đích; không có danh sách sắp xếp/modal/chip giả, không thay layout public. Giữ physical source-row và không nhận hàng của ESC Table con không cùng nguồn, khôi phục `tabindex` ban đầu khi Hủy/dispose. Các commit `eb71e2f`, `71b20e7`, `2936ecb`. Source-only CI [#45544472680](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45544472680) **SUCCESS 26/26 suites, 148/148 tests**, PHP lint/JS parse/Tailwind/Astro parser PASS.

## 3. Production và QA thật

- WordPress Build Website [#45544654021](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45544654021) **SUCCESS**, signed Astro production [#45544725561](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45544725561) **SUCCESS**, exact `PSE_DEPLOY_COMMIT=2936ecb0a2ee62ac46f94d0a1f42290cf47ab75b`, `SIGNED_UNZIP_SUCCESS`, activation 0, protected `.env` unchanged. Không thay source PHP, không ghi nội dung WordPress.
- Authenticated read-only Playwright [#45544969354](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45544969354) **SUCCESS**: section Enter/Cancel/tabindex PASS, Promise physical item Space/Cancel/tabindex PASS; 6 nhóm S1 hoán đổi trực tiếp + Cancel và swap hai section `pse_00_vi ↔ pse_01_vi` PASS, Hotline shared clone/remove Preview+Cancel PASS, FAQ/Vision unsafe clone bị chặn, `NO_CMS_WRITE=true NO_SAVE=true PREVIEW_CANCELLED=true`.
- Postdeploy SSR [#45544940471](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45544940471), homepage/search [#45544940372](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45544940372), bảy bài Joomla [#45544940321](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45544940321) **SUCCESS**. Gallery 4 album/464 ảnh [#45544940418](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45544940418) attempt #1 FAIL vì ảnh #980 index134 chờ pixel decode; rerun đúng job attempt #2 **SUCCESS 8/8 viewport rows** (390px/1440px), 4/4 gallery, 464 ảnh được kiểm kê, 5 pixel decode/album/viewport, zero admin-origin leakage. Ghi lại cảnh báo latency ảnh 15.9s ở album #975; không suy ra lỗi Visual Builder.
- Checkpoint đã cập nhật và xác minh commit [`013cbc17`](https://github.com/ngocnhanvo/psevn-actions/commit/013cbc178c6c4e05a22186d76e2260529e38b8c9).

## 4. Phạm vi chưa đủ nghiệm thu toàn dự án

Chưa có `SAVE_INTEGRITY_PASS` thực sự (CMS Save có quyền → REST readback → reload Preview → public desktop/mobile → rollback) cho các nguồn S1–S4 trên published fixture được phép. Inventory đã kiểm không có Page S2–S4 manual reference được publish; không tự tạo bản ghi production để ép test. S5 native query columns không hiện hữu ở nguồn PSE đã kiểm. Section add/show/hide độc lập, clone thành bảng nguồn mới và nested ESC Table mutations còn thiếu hợp đồng lưu đúng dữ liệu. Bắt đầu bước tiếp theo bằng việc tìm một source/Page có quyền test và cấu trúc write/rollback rõ ràng, nếu chưa có thì phát triển adapter source-only an toàn trước; không bỏ các guard CMS/build.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
