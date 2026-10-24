# PSE — Tầm nhìn và Sứ mệnh: checkpoint đã triển khai (2026-10-25)

**Phạm vi:** `ngocnhanvo/psevn-astro` (github DEV, master PROD), `ngocnhanvo/psevn-actions` (main), WordPress `ngocnhanvo/psevn-php`. **Chế độ code:** auto-build. Không thay kiến trúc build/SSR/cache.

## Trạng thái kết thúc
- **CODE_READY / TEST PASS:** Astro `github` và `master` cùng SHA `bbc8ff920989b7715064278f65117091b72da07a` sau [PR #36](https://github.com/ngocnhanvo/psevn-astro/pull/36). Gồm `src/astro/tablepress/Pse_vision.astro`, `src/lib/seo/pseVisionMission.ts` và unit tests. [NO BUILD regression #40133800743](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40133800743) PASS.
- **CMS PARITY PASS:** WordPress Page **79303**, slug `tam-nhin-su-menh`, ACF `action=PublicPage`, `key=pse-company-tam-nhin-su-menh`; native ESC Table `pse_vision_vi` gồm hai item `Sứ mệnh` / `Tầm nhìn`. Hai ảnh gốc media IDs **79277** và **79302** được chèn bằng Insert Image, có ALT; giữ nguyên nội dung và `Tầm nhìn đến 2025`, không cập nhật giả định về mục tiêu doanh nghiệp. [Native ESC author #40133696353](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40133696353) PASS. [Native WP Insert Code + REST readback #40134255876](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40134255876) PASS: shortcode đúng một lần, bảng Joomla cũ đã bỏ, Page published, action/key giữ nguyên.
- **DEPLOYED / SIGNED FTPS PASS:** công cụ **WordPress/PHP Build Website** nhận pending changes=2 và kích hoạt build qua [request #40134372422](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40134372422) PASS; **không force build**. [Astro official build + signed FTPS deploy #40134437874](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40134437874) PASS. Không gọi Actions build ngoài WordPress/PHP.
- **VISUAL_QA_PASS (3/3):** [Playwright live QA #40134618637](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40134618637) PASS trên widths 390, 768, 1440 (HTTP200, H1=1, 2 card, giữ chữ 2025, ảnh 2/2 loaded+ALT, không nội dung bị ẩn, không overflow, không nested scroll, không shortcode hiện như văn bản hoặc bảng legacy). Screenshots artifact [#12576611760](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40134618637/artifacts/12576611760) (lưu trữ tạm theo policy GitHub Actions).

## Ghi chú an toàn
- Những lượt fail ban đầu chỉ là thử author ảnh khi WP Media Editor chưa sẵn sàng và preflight so sánh URL tuyệt đối / tương đối hoặc raw Text editor; đã sửa, chạy idempotent và có PASS sau đó. **Không chạy lại** các công việc đã PASS.
- Page gốc đã backup vào workflow artifacts trong các bước author/attach; nội dung nguồn và hình ảnh giữ nguyên trong ESC Table, không hardcode vào Astro.
- Lượt build request #40133351611 trước khi cập nhật Page trả no_pending_changes, **không phải lỗi của build hiện tại**; không bật ngoại lệ.
- Không thay đổi PHP, database schema, action/key, routing, SEO metadata, build pipeline, external domains.
- **Trạng thái cuối: CODE_READY=PASS; CMS_PARITY=PASS; DEPLOYED=PASS; VISUAL_QA=PASS.** Không còn bước dở của trang `tam-nhin-su-menh`; công việc migration hàng loạt tin tức là luồng độc lập.
