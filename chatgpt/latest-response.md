# PSE Visual Builder — Kết quả tiếp tục công việc 25/11/2026

- **Project:** `pse.vn`
- **Repo lưu phản hồi:** `ngocnhanvo/psevn-actions`, branch `main`
- **Thời gian:** 2026-11-25 10:59 (+07, Asia/Ho_Chi_Minh)
- **Kết quả lưu:** SAVED (GitHub xác minh sau cập nhật SHA)

## 1. Khôi phục commit, workflow, checkpoint

Đã đọc quy tắc `ngocnhanvo/knowledge/main` cùng checkpoint `docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md`, kiểm tra commit/log của `psevn-astro/master`, `psevn-php/master`, `psevn-actions/main`. Lúc bắt đầu: Knowledge `34310f05`, Astro `0263a1eb`, PHP `767ef442`, Actions `b986f8f8`. Source CI [#45540701099](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45540701099) PASS. Các SHA sau đó đã được cập nhật lên bản production mới nêu dưới đây.

## 2. PHP release và source-only QA

- Đã phát hành bản source-gated ban đầu PHP `a676e28...` qua [#45541030111](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45541030111): 1 file changed, checked 20, SHA256=PASS, cleanup0, không Astro build/không CMS write. Run cùng SHA [#45541051125](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45541051125) cũng PASS.
- G1 production [#45541394836](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45541394836) phát hiện FAQ clone bị mở khi kiểm tra Page thôi; logic test cũ định trước FAQ phải khóa. Đã sửa QA để so WordPress REST dry-run thật và UI; [#45541919720](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45541919720) PASS read-only, tuy nhiên vẫn chưa đủ vì còn phải kiểm tra cấu trúc Astro Preview.
- Source nâng cấp có **hai phê duyệt độc lập**: PHP Page/version/occurrence writer dry-run và Astro iframe pure DOM eligibility, chỉ mở nút gỡ/nhân bản khi cả hai cùng chấp thuận. CI [#45541960413](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45541960413) PASS, Astro **26/26 suites, 146/146 tests**.
- **PHP production hiện tại**: `09b60096b76d6eb6c0ef4ff8f06aeeb78f6c9fe8` qua FTPS [#45542344078](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45542344078) SUCCESS, `includes/item-section-ui.php` SHA256 PASS, changed1/checked20, no content write.

## 3. Astro signed production

- **Astro production hiện tại**: `f7465f330cff9cd6232a5e0674c17b4576bbd3ba`.
- WordPress Build Website [#45542542872](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45542542872) SUCCESS; signed deploy [#45542620028](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45542620028) SUCCESS, `PSE_DEPLOY_COMMIT` exact SHA, `SIGNED_UNZIP_SUCCESS`, signed hosting activation, không thay đổi nội dung CMS.

## 4. Authenticated live production QA

- G1 chỉ đọc [#45542876458](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45542876458) **SUCCESS**, G1 xác nhận lại [#45542891435](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45542891435) cũng SUCCESS.
- FAQ: Page clone dry-run có thể PASS nhưng Astro Preview wrapper không an toàn, nên shared clone **ẩn/khóa**; việc gỡ Page section theo vùng an toàn được phép. Hotline: shared clone và remove đều hỗ trợ sau khi Page + Astro duyệt. Vision: unsafe shared clone bị từ chối.
- Production-first Preview không mở controls trước click; nguồn Post S4 (`include=ID`) ngoài trang đầu PASS; 4 endpoint forged ticket denied; liên kết hữu ích đủ 6; FAQ 15, Hotline 3, History 6 khớp public; mobile 390px và desktop 1024px đúng text/geometry/font; S1 visible draft + Cancel và Footer rapid-click PASS. Không ghi WordPress.

## 5. Direct Preview swap, remove/clone + Cancel

- Read-only postrelease [#45543276751](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45543276751) **SUCCESS**: hoán đổi đỏ/xanh trực tiếp đúng source row cho 6 nhóm S1 Promise/Hero/Hotline/FAQ/History/Vision; section `pse_00_vi` ↔ `pse_01_vi` đúng 2 section (`swappedTwoOnly=true`).
- Hotline `shortcode_only` remove Preview PASS + Cancel phục hồi, Page version không đổi. Clone shared Hotline PASS, FAQ/Vision `REJECTED_UNSAFE_WRAPPER`. `PSE_BUILDER_SWAP_READ_ONLY=PASS NO_CMS_WRITE=true NO_SAVE=true PREVIEW_CANCELLED=true`.
- Checkpoint đã cập nhật: [PSE Visual Builder Source Compliance 25/11](https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md) tại commit `cf13ab9e`.

## 6. Giới hạn chưa thể gọi là hoàn tất toàn dự án

- **Actual CMS Save → REST → reload Preview → public cùng rollback** cho nhóm S1–S4 chưa có thử nghiệm được phép trên published fixture; QA read-only không thay thế kiểm thử ghi dữ liệu.
- Chưa có Page published dùng manual S2–S4 reference để nghiệm thu Save. S4 REST ngoài WordPress Posts chuẩn cần schema adapter; S5 query thiếu các cột nguồn được xác minh.
- Thêm/ẩn/hiện section có chủ sở hữu lưu bền, nhân bản thành nguồn TablePress độc lập và ESC Table con lồng nhau chưa đủ hợp đồng nguồn để triển khai an toàn. Không được tạo fixture giả hoặc ghi đè dữ liệu production chỉ để đạt PASS.

**Kết luận:** Phần source-gated Visual Builder, Preview trực tiếp, signed production và các QA không ghi dữ liệu đã triển khai và PASS; dự án tổng thể vẫn còn các phạm vi chưa đủ điều kiện nghiệm thu Save.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
