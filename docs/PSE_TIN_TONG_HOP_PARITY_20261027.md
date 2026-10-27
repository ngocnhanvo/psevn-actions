# PSE — Tin tổng hợp: đối chiếu Joomla cũ với WordPress mới (2026-10-27)

## Bằng chứng READ ONLY
- Workflow: https://github.com/ngocnhanvo/psevn-actions/actions/runs/40459485013 — PASS.
- URL cũ: https://pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop.html
- URL mới: https://pse.webnvn.com/tin-tuc-su-kien/tin-tong-hop
- Trang Joomla cũ báo `Page 1 of 56`; 4 liên kết bài trực tiếp tìm thấy trên trang đầu, tất cả 4 cùng slug với WordPress.
- WordPress category `tin-tong-hop` ID **1746**, parent **1742**, có đúng **4** bài publish.
- WordPress category mẹ `tin-cong-ty` ID **1742** có **346** bài publish. **342** bài thuộc mẹ nhưng chưa gán `tin-tong-hop`. Không được giả định toàn bộ 342 bài đều thuộc chuyên mục con.
- Tổng Posts WordPress publish: **654** (tại thời điểm audit).
- Astro trả HTTP 200 và hiển thị **4 cards**, thông tin phân trang `Trang 1 / 1 (Tổng 4 bài viết)`.
- Crawler/mapping hiện tại trong `scripts/pse-news-subcategories-assign.mjs` chỉ gọi `goto` URL category đầu tiên, thu thập liên kết trong `.blog`; **không duyệt trang phân trang**. Đây là một nguyên nhân trực tiếp khiến chỉ bốn slug được gán danh mục con.
- Có queue migration Joomla riêng `pse-legacy-article-import-queue.yml` chạy tiếp trong lúc audit; hiện trạng migration khác với phân loại, không giả định mọi bài từ Joomla đã import.

## Hành động sửa đúng, chưa tự thực thi
1. Crawl toàn bộ 56 trang danh mục cũ, lấy `Joomla ID, canonical URL, slug, tiêu đề` của từng bài và chống trùng; ghi manifest/danh sách URL đã quét.
2. Đối chiếu với danh sách WordPress publish + draft theo permalink/slug và migration provenance; phân loại chính xác: (a) có bài nhưng thiếu category 1746, (b) chưa import, (c) ambiguities/collision.
3. Với (a), chỉ gán bổ sung category ID 1746 vào Posts đã xác minh thuộc tin tổng hợp (giữ category mẹ, id, ngày, SEO, nội dung), kiểm tra read-after-write; các trường hợp (b) đi qua migration queue có backup/quarantine. Không tự gán cả 342 bài của parent.
4. So sánh số lượng và mapping giữa nguồn cũ, WP Posts, và Astro public; test pagination, SEO/canonical, không bỏ lỡ ảnh; build Astro chỉ qua nút WordPress/PHP Build Website theo Knowledge.

## An toàn
Audit này chỉ đọc, không sửa WordPress Posts/Categories, không chạy build, không deploy.
