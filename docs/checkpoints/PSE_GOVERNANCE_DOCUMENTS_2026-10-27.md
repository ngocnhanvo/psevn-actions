# PSE — Tài liệu quản trị công ty — Checkpoint ngày 27/10/2026

## Nguồn, đích và phạm vi
- Joomla: `https://pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty.html`
- Astro công khai: `https://pse.webnvn.com/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty`
- WordPress taxonomy có thật: slug `tai-lieu-quan-tri-cong-ty`, ID `1759`, parent `1744`.
- Repo thực thi: `ngocnhanvo/psevn-actions` branch `main`; frontend `ngocnhanvo/psevn-astro` `github` dev / `master` production; backend `ngocnhanvo/psevn-php` `master`; Knowledge `ngocnhanvo/knowledge` `main`.
- **Chế độ code: auto-build**, nhưng tác vụ là dữ liệu WordPress thuần: không sửa Astro/PHP, không FTP, không ép build. Quy trình Build Website PHP/WordPress được bảo toàn.
- Source of truth for migration: `docs/pse-legacy-migration-state.json`, chỉ worker `.github/workflows/pse-legacy-article-import-queue.yml` ghi theo SHA lease. **Không ghi đè trạng thái bằng run artifact cũ**.

## Kết quả đã kiểm tra hoàn tất
1. Đối chiếu **đủ cả 6 trang Joomla** của chuyên mục, `?start=0,5,10,15,20,25`. Tổng **24 source IDs độc nhất**: log `PSE_GOV_SOURCE_ALL_PAGES` tại [run #40524136555](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40524136555) và [#40524872807](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40524872807). Crawler cũ bỏ sót ID **hai chữ số** `90,91,92`, nay đã được bổ sung đúng source URL đã tồn tại trong checkpoint `seen`; không bịa nguồn.
2. Trong **18 WordPress posts có sẵn** của manifest ban đầu, 17 đã gắn danh mục 1759, chỉ source `1184` / WP `79439` thiếu nhãn. Job [#40521982802](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40521982802) PASS: thêm đúng category cho một bài, **không sửa nội dung, ngày, trạng thái, tài liệu, không duplicate**. Lưu ý các bản ghi từng bị checkpoint cũ gắn `draft_needs_date` đã được WordPress xuất bản bởi date worker khác; dùng dữ liệu WP live làm căn cứ trạng thái thực thay vì ép về nháp.
3. Hai PDF bị cách ly chỉ vì mặc định importer giới hạn 24MB được khôi phục chính xác, đối chiếu origin / byte-size / MIME / header `%PDF-`:
   - Joomla `1649`: PDF **28.360.845 bytes**, WordPress post `82428`, published, original Joomla created day `2025-07-29`.
   - Joomla `1664`: PDF **39.702.837 bytes**, WordPress post `82425`, published, original Joomla created day `2026-01-29`.
   - [Run #40521659022](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40521659022) PASS, migration batch `227`. **Không xóa PDF vì tưởng ảnh lỗi.**
4. Joomla `1184` / WP `79439` có percent-encoded WP slug dẫn đến mọi biến thể public URL trả 404. Audit [#40523214271](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40523214271) và exact authorized apply [#40523509473](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40523509473) PASS. Đã đổi **chỉ slug** thành `nghi-quyet-ve-viec-chap-thuan-kh-kd-2016`; giữ WP ID, text, PDF, category, date, publish state. Canonical public HTTP200.
5. Ba nguồn hai chữ số bị bỏ sót được rà soát độc lập tại [run #40524872807](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40524872807): nguồn 90 có 1 PDF 2016, nguồn 91 có PDF và ảnh, nguồn 92 có PDF Điều lệ 2013. Tất cả nguồn HTTP200, PDF HEAD200, không foreign spam và không WP slug collision. Bộ nhập liệu chống trùng tạo ba bản ghi:
   - Joomla `90` → WP `82437`, **publish**, tài nguyên 2, source Joomla CREATED day `2011-06-20` (không ngộ nhận là ngày phát hành chính bản PDF).
   - Joomla `91` → WP `82434`, **publish**, tài nguyên 2, source CREATED day `2011-06-20`.
   - Joomla `92` → WP `82431`, **DRAFT**, một PDF gốc, thiếu ngày đăng có bằng chứng độc lập. **Không ép publish, không bịa ngày**.
   - [Run #40525601974](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40525601974) PASS, batch `228`, REST đọc lại sau khi tạo.
6. Joomla `376` là một ghi chú byline ngắn `H.H` với **ảnh văn bản nghị quyết**. Tuyệt đối không xóa như ảnh trang trí. Nguồn `106-nq-nb.jpg` được kiểm tra JPEG signature/mime/same original host và đúng 153.555 bytes. [Run #40526369573](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40526369573) PASS: WordPress post `82440`, publish, ảnh scan và text H.H giữ nguyên, Joomla CREATED day `2013-06-29`. Migration batch `229`.
7. **Toàn bộ 24 bài Joomla đã có 24 bản ghi WordPress xác minh nguồn, không duplicate:** `23 publish / 1 draft` (source 92). Full source parity of record IDs achieved; full public article parity remains `23/24` until original publication date is verified for draft.
8. **Live public Playwright QA** at [run #40526864143](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40526864143) **PASS**: 24 source records covered, **23/23 published pages HTTP200**, một source 92 đúng nháp, **0 ảnh lỗi**, 0 article body missing, 0 tested Joomla spam strings, source 1184 canonical published URL accessible, all public article images checked by browser `naturalWidth`. Không ảnh nào cần xoá, tất cả chữ, PDF và ảnh scan được giữ.
9. Tool sources: `scripts/pse-governance-documents-repair.mjs` (taxonomy/source audits); `scripts/pse-governance-encoded-slug-repair.mjs`; `scripts/pse-governance-public-images-audit.mjs`; guarded serialized importer `scripts/pse-legacy-migration-batch.mjs`. Latest taxonomy auditor now supports **two-digit IDs and exactly 24 entries** (commit `4b43007a7ca3c32373da2e65a26ab4bde35cf569`). Do not repeat completed source migrations or test runs without new changes.

## Điều cần làm nếu tiếp tục
- Chỉ còn Joomla `92` / WP `82431` **draft_needs_date**. WordPress phải giữ nháp cho tới khi ngày đăng bài nguồn được chứng minh độc lập qua source metadata hoặc `com_search`. **Ngày thông qua Điều lệ 15/04/2013 không đồng nghĩa ngày bài Joomla được xuất bản**.
- Ưu tiên tiếp tục date backfill của hệ thống hiện có nếu xác minh được ngày. Không tạo bản sao WordPress, không ép publish và không tự đặt ngày.
- Nếu sau này phát hiện ảnh thực sự hỏng: chỉ bỏ ảnh *tùy chọn* đã chứng minh hỏng, **luôn giữ văn bản và PDF**, không xóa scan nghị quyết chính là nội dung.
- Check current Actions jobs and SHA-leased migration checkpoint before every new step. Tests are read-only, Astro builds only triggered by WordPress/PHP Build Website if genuinely needed.

**Trạng thái cuối:** `SOURCE_IDS_PARITY_PASS=24/24`, `WORDPRESS_RECORD_PARITY_PASS=24/24`, `PUBLIC_PUBLISHED_QA_PASS=23/23`, `DRAFT_PENDING_VERIFIED_DATE=1`, `BROKEN_IMAGES=0`, `DOCUMENTS_PRESERVED=true`, `ASTRO_BUILD_NOT_REQUIRED`.
