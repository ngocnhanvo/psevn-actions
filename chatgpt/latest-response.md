# Phản hồi mới nhất — PSE, 21/11/2026 khoảng 23:28 (Asia/Ho_Chi_Minh)

**Project:** pse.vn
**Repository:** ngocnhanvo/psevn-actions
**Branch:** main
**Checkpoint:** docs/checkpoints/PSE_SOURCE_CONTENT_PARITY_2026-11-21.md
**Overall status:** PARTIAL — chưa hoàn tất

## Kết quả mới: kiểm tra ảnh trong 758 bài viết

[GitHub Actions #44922876914](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44922876914) SUCCESS: 758 native WP Posts, 3.408 thẻ IMG, 3.243 URL ảnh duy nhất, trong đó 2.901 WordPress Uploads, 341 Astro /api/files, 1 ảnh bên ngoài là Tuổi Trẻ Joomla #225. Kiểm tra mẫu phân bố **420/3.242 URL nội bộ**, 420 HEAD hợp lệ, 0 lỗi; **2.822 URL chưa kiểm tra**. Đây không phải bằng chứng ảnh gốc Joomla bằng byte.

## QA thực tế của 5 danh sách

[GitHub Actions #44923133641](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44923133641) SUCCESS: 5 trang tin/tài liệu x 390px/1440px = 10/10 PASS, 120 card, 40 ảnh browser decode, HTTP200/canonical/H1/no overflow. Code Astro đã có logic lấy ảnh đầu tiên trong nội dung nếu bài không có Featured Image, ưu tiên ảnh thật; có FileText document tile cho PDF icon.

## Phát hiện 34 bài có PDF thật nhưng hiển thị ảnh mặc định và sửa Astro master

[GitHub Actions #44923393587](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44923393587) SUCCESS: 36 investor card trên 3 chuyên mục matched chính xác từng slug sang WordPress Post. **35 no-image placeholders; 34 có actual .pdf href** (12 disclosure, 10 annual, 12 governance); **1 thật sự không có PDF**, giữ fallback. Có thêm 1 original PDF tile nên dự kiến sau fix 35 PDF tiles trên 36 card.

Astro/master code commit [3759f7f4](https://github.com/ngocnhanvo/psevn-astro/commit/3759f7f430e37930f0ddd9c6f9a0ef980de7e4bd), final tests master [db3a9768](https://github.com/ngocnhanvo/psevn-astro/commit/db3a97688b21e3823ce137e2a901d6366d64cc67): postThumbnail.ts thêm fallback khi nội dung có liên kết PDF thật và không có ảnh phù hợp; ưu tiên ảnh thật, không gán icon PDF cho docx, link giả, text. No WordPress writes, no Astro hardcoded CMS content. Full source QA [#44923728636](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44923728636) SUCCESS: **590/590 tests / 131 test files**, Astro master isolation PASS.

## Deploy bị chặn — KHÔNG được báo live

Original WordPress PHP Build Website owner-approved one-time exception for PDF cards [#44923876478](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44923876478) SUCCESS (pending_count=0 because only Astro source changed, no dummy WP save). Official signed production [#44923979017](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44923979017):
- Attempt 1 FAIL: Astro build PASS, Python FTPS staging ZIP 4.963.633 byte PASS, nhưng HTTP deny check của private public_html .env trả URLError khi kiểm tra qua frontend HTTPS. Fail-closed trước activation.
- Attempt 2 (GitHub rerun_failed_workflow_run_jobs trên chính run ID, không tạo pipeline riêng) FAIL sớm hơn: signed unzip endpoint HTTPS TLS handshake timeout (_ssl.c:1063). Không build lại/không kích hoạt release ở attempt2.
- Không có bước signed activate thành công, **Astro master db3a9768 CHƯA xác nhận live**, QA production 35 PDF tile CHƯA chạy. Không thử bỏ qua quyền bảo mật, không đọc .env, không FTP thủ công, không tạo pipeline khác hoặc retry vô hạn. Bản signed deployment trước đó là [#44919348861](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44919348861) SUCCESS tại source e213d006; không kết luận nó còn hiển thị công khai sau sự cố TLS nếu không có browser evidence.

Prepared exact after-release read-only workflow .github/workflows/pse-investor-pdf-card-live-release.yml, gated marker .pse-investor-pdf-postrelease-request exact commit message 'test(pse): verify 35 native investor PDF tiles on production'. Khi HTTPS signed unzip hoạt động trở lại, dùng DUY NHẤT production pipeline hiện có và SHA db3a9768, kiểm tra deploy SUCCESS rồi kích marker QA: 35 source-backed PDF tile / 36 investor cards, 1 no-document fallback, 390/1440 10/10, canonical, no overflow. Không trigger QA trước release.

## Sitewide PSE content parity vẫn PARTIAL

12 bài Joomla lịch sử thiếu ảnh/body verified; album #975 đã có 110/110 ảnh JPG gốc EXIF camera 2010-09-11 nhưng Joomla date 2011 và title 2013 vẫn mâu thuẫn; 4 old Product description aliases chưa có đích duy nhất xác minh; ảnh Tuổi Trẻ #225 chưa có source bytes; Joomla origin thời gian gần đây timeout. Không suy luận ngày/mượn ảnh để đăng sai nguồn. Hoàn tất độc lập trước đây: nguồn báo cáo tài chính 2012 Joomla #298 → WP #82548 Media #83504 signed Astro deploy + responsive SHA QA PASS #44919560360, không làm lại.

**Checkpoint:** https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/checkpoints/PSE_SOURCE_CONTENT_PARITY_2026-11-21.md

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
