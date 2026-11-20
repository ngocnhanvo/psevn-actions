# Checkpoint PSE — Bản vá chữ trắng trong bảng kỹ thuật Đạm Phú Mỹ

Ngày 2026-11-20 (Asia/Ho_Chi_Minh). Phạm vi: https://pse.webnvn.com/san-pham/dam-phu-my.
Repo Astro production: ngocnhanvo/psevn-astro@master, source commit `532fb8af7cc74e6cc87787f3878027baed693bed`.

## Vấn đề và bản vá
- Người dùng gửi ảnh: một số ô tiêu đề bảng có chữ trắng gần như vô hình trên nền xanh rất nhạt.
- Nguyên nhân: HTML nguồn WordPress/Joomla có màu inline trắng từ bố cục cũ; sau lần cải thiện nền bảng trong Astro, màu chữ nguồn vẫn tồn tại trên các thẻ con.
- Bản vá nhỏ ở `src/astro/pages/ProductsSSRPage.astro`: chỉ áp dụng màu chữ có tương phản cho `th`, `td` và phần tử con trong `.pse-category-editorial` bằng `!important`. Giữ màu cam/đỏ và các văn bản ngoài bảng, không sửa dữ liệu WordPress hay HTML gốc.
- Source regression updated `src/lib/seo/pseProductSsrCategoryLayout.test.ts`; độc lập QA Chromium được tăng điều kiện computed text color cho bảng ở desktop/mobile.

## Evidence và trạng thái
- Source commit: https://github.com/ngocnhanvo/psevn-astro/commit/532fb8af7cc74e6cc87787f3878027baed693bed
- CI Astro full regression: https://github.com/ngocnhanvo/psevn-actions/actions/runs/44767523113 — SUCCESS, 131/131 test files, 588/588 tests.
- Authenticated WP Build Website trigger: https://github.com/ngocnhanvo/psevn-actions/actions/runs/44767679071 — SUCCESS, verified pending_count=0, owner-approved code-only exception.
- Signed production build, FTP-TLS, PHP staging activation + smoke: https://github.com/ngocnhanvo/psevn-actions/actions/runs/44767861619 — SUCCESS and exact Astro commit `532fb8af...`.
- Independent read-only Chromium browser QA: https://github.com/ngocnhanvo/psevn-actions/actions/runs/44768300194 — PASS. Checks `technical_table_text_contrast_1366`, `technical_table_text_contrast_390`, 10/10 technical tables exact Joomla content/order, 4 product cards, no horizontal page overflow, native WP editor accessible; no WP saves.
- Browser screenshots/report artifact: https://github.com/ngocnhanvo/psevn-actions/actions/runs/44768300194/artifacts/14645962222
- Work DONE: no need to rebuild/reimport/restyle again for this issue absent new actual findings.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
