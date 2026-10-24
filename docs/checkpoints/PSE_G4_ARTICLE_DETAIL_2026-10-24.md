# PSE trang con — checkpoint G4 (24/10/2026)

## Phạm vi

- Knowledge: `ngocnhanvo/knowledge` main (đã đọc trước khi thực hiện).
- Astro: `ngocnhanvo/psevn-astro` (`github` DEV → PR → `master` source).
- Backend: `ngocnhanvo/psevn-php` master, **không chỉnh PHP trong lượt G4 này**.
- Automation: `ngocnhanvo/psevn-actions` main.
- Chế độ: `auto-build` (chỉ build Astro thông qua WordPress/PHP Build Website).

## Hoàn tất mã nguồn

- PR #24 **đã được chủ dự án merge**: `8bc650c854b36eb357ee00e437c8cf97cde096a2`. Không chạy lại.
- Fast-forward Astro `github` về đúng merge #24 trước khi sửa G4, không force.
- G4 PR #25: https://github.com/ngocnhanvo/psevn-astro/pull/25
- PR #25 **tự merge** bằng GitHub, SHA `d9ec4edc54695b620afa963403e62a60252af22d`.
- Scope G4: bỏ các thẻ bài liên quan legacy ở chi tiết PostDetails của PSE, giữ nguyên các site/action khác; chỉ một tiêu đề H1 chính, các H1 trong CMS body thành H2 giữ nội dung/HTML; thêm thẻ `<time datetime>`.
- Files: `src/astro/pages/PostDetails.astro`, `src/lib/seo/psePostHeadings.ts`, `src/lib/seo/psePostHeadings.test.ts`.
- **CODE MERGED**; 3 kiểm tra logic helper bằng Node độc lập PASS; **không đồng nghĩa** full Astro CI hay browser PASS.

## Đã yêu cầu kiểm thử/phát hành

- Marker CI **no-build**: `psevn-actions/main` commit `46eb3cac57af49a716e9192a6c3852aba81ccead` vào `.pse-template-source-neutral-check`.
- Marker đề nghị **một build bình thường**: `psevn-actions/main` commit `405d5ed572a202489e681713a4720f9a7bf59eb5` vào `.pse-wordpress-build-request`.
- Workflow đã đọc và xác minh: `.github/workflows/pse-wordpress-build-request.yml` chạy helper `imported-eduresearch/scripts/wordpress-build-trigger-e2e.mjs` qua WordPress Admin; không gọi Astro Actions trực tiếp. Helper kiểm `build_active`, `pending_count > 0`, không có ép build. Workflow concurrency không hủy build trước.
- **Chưa lấy được run ID/kết quả CI và deploy từ GitHub connector phiên này**. Trạng thái chính xác: `CI_REQUESTED / BUILD_REQUESTED / DEPLOY_NOT_VERIFIED`; không ghi PASS hoặc deploy thành công trước log thật.

## Bước tiếp theo không được lặp

1. Kiểm tra **một** workflow hiện hữu cho CI marker và một workflow WordPress Build marker, đọc job/log. **Không gửi lại các marker này** nếu run đã khởi chạy hoặc có kết quả. Nếu PHP báo không có pending thay đổi, tôn trọng gate, không tạo CMS edit giả/không force.
2. Nếu PHP thực sự bắt đầu build và signed FTPS PASS, chạy **read-only** Playwright/G5 cho ít nhất 1 bài PSE có CMS H1, một bài có PDF/ảnh, hai viewport 1440 và 390: HTTP 200, H1=1, `<time>`, không hiển thị “Các bài viết khác”, không sidebar/tràn ngang, ảnh/PDF đúng nguồn.
3. Kiểm tra archive `/tin-tuc-su-kien`, các category có slug xác minh, liên kết SSR, canonical và redirect Joomla; không chạy lại importer/batch hoặc G2 QA đã PASS.
4. Khi có chứng cứ, cập nhật checkpoint trong FE `docs/design/PSE_2026_SUBPAGES_IMPLEMENTATION_PLAN.md` bằng run IDs và trạng thái thật. Dữ liệu Joomla parity vẫn riêng biệt.

**Không động tới queue Joomla đang chạy, không thay cấu trúc build/cache hay quyền WordPress.**
