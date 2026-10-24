# Đề xuất kỹ thuật — FTPS delta ảnh giữ rollback (chưa triển khai)

**Dự án:** PSE · **Ngày:** 2026-10-25 · **Trạng thái:** `PROPOSAL — ARCHITECTURE APPROVAL REQUIRED`

## Bằng chứng hiện tại

- Build production sau tối ưu [#40135974794](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40135974794) = **129 giây** (21:50:23–21:52:32 UTC ngày 24/10), `pse-astro.zip` **22,140,603 bytes**, upload FTPS **54 giây**, **0.39 MiB/s**. Signed deploy & SSR smoke PASS.
- Run [#40134437874](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40134437874) = **122 giây**, upload **52 giây**, tốc độ **0.41 MiB/s**.
- Bài kiểm tra FTPS độc lập [#40136422393](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40136422393): cùng runner, dữ liệu ngẫu nhiên 6 MiB, Python FTPS/TLS verified **15.68s = 0.38 MiB/s**; `lftp` buffer 4 MiB **18.09s = 0.33 MiB/s**. File thử nghiệm đã xóa; không build/deploy.
- Cache WordPress production được khôi phục [#40136637928](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40136637928): **350 ảnh, 16,806,102 raw bytes**, kích thước nếu ZIP riêng **16,848,095 bytes**; dữ liệu khác 12 file / 372,646 bytes. Không build/deploy. **Chưa đo ảnh nào thực sự thay đổi qua hai bản deploy**; đây là tổng ảnh cache, KHÔNG phải số byte chắc chắn tiết kiệm.
- **Đã bổ sung đối chiếu thực tế** bằng [run #40137717136](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40137717136): hai cache production từ #40134437874 và #40135974794 có **350/350 ảnh khớp đường dẫn, kích thước và SHA-256**, tổng **16.806.102 byte không đổi**; thêm mới 0, thay đổi 0, bị xóa 0. Đây là bằng chứng chắc chắn cho hai snapshot cache này, nhưng chưa phải phép kiểm tra trực tiếp ZIP trên hosting và không dự đoán các build có ảnh mới. Workflow đọc-only, không build/FTP/deploy.
- Kết luận: buffer / thay FTPS client đơn thuần không thể bảo đảm mục tiêu **90 giây**. Đường truyền có thông lượng khoảng 0.3–0.4 MiB/s.

## Thay đổi dự kiến (cần chủ sở hữu phê duyệt kiến trúc trước khi sửa)

Giữ nguyên **WordPress/PHP Build Website → Actions → Astro `pnpm run build-git` + WordPress cache → FTPS/TLS → signed PHP atomic activation → HTTP smoke**.

Thay đổi **cách đóng gói và kích hoạt artifact**:

1. Runner build ra **đầy đủ** `dist` như cũ. Không thay đổi dữ liệu WordPress/cache/image processor/routes.
2. Runner lấy **manifest ảnh đã triển khai** thông qua hành động PHP xác thực HMAC có phạm vi cố định `client/images/`, không có URL/path đầu vào tùy ý. Manifest gồm tên tương đối chuẩn hóa, kích thước và SHA-256.
3. So sánh với ảnh có thật trong `dist/client/images/`, đóng ZIP **chỉ chứa phần JS/CSS/SSR/metadata + ảnh mới hoặc thay đổi**. Thêm manifest tái sử dụng ảnh cũ, có hash cho từng ảnh phải kế thừa; ZIP/manifest không có `.env`, token hay config riêng tư.
4. Signed PHP chỉ chấp nhận giao thức `delta` sau khi kiểm tra branch/target/host, HMAC, SHA-256 archive; giải nén vào **thư mục staging mới**; từ thư mục client/images đang triển khai, **xác thực từng file hiện hữu và SHA-256 trước khi copy** qua staging. Từ chối symlink, `../`, đường dẫn ngoài image root, file thiếu/khác hash hoặc danh sách chưa được chuẩn hóa. Nếu bất kỳ file nào lỗi, **không activate**.
5. Khi staging đã đủ mọi ảnh, mã server/client và metadata, giữ nguyên atomic rename + backup/rollback và postdeploy smoke theo cơ chế hiện tại. Không đổi WordPress nonce/build lock, FTP_TLS certificate verification, sitemap Save token, PM2 hoặc tên hosting.
6. **Cold-cache/không tương thích:** tự chọn ZIP đầy đủ trên cùng lần build nếu manifest server không có hoặc không khớp; rollback/fail-closed nếu không thể bảo đảm staging đầy đủ. Không ép WordPress pending/force build.

## Ước tính sơ bộ, chưa phải KPI đạt

Nếu hầu hết 16.85MB ảnh không đổi, ZIP còn cỡ 5–6MB, FTPS lý thuyết khoảng 13–18 giây thay vì 54 giây. Workflow 129 giây có thể tiến gần **90 giây**, nhưng phải trừ/đo thêm công xử lý manifest/verify/copy và băng thông biến động. Tốc độ chỉ PASS khi ít nhất một **build thật** thông qua PHP, ký/giải nén/rollback/smoke PASS và tổng thời gian <=90s; nhiều lần mẫu sẽ đáng tin hơn.

## Kiểm thử và rollback trước phát hành

- Unit/test source ZIP delta/fallback/path traversal/symlink/missing image/bad SHA, hậu kiểm đủ image paths, checksum từng item, sitemap revisions.
- Dry-run read-only so manifest cũ/mới, đo **số byte tái sử dụng** trước khi kích hoạt.
- Kiểm thử trên target PSE đã xác minh bằng WordPress Build Website có pending thật và khóa build rảnh, không repository_dispatch riêng.
- Rollback: revert thay đổi packaging + PHP unpack và bật lại **full ZIP** chuẩn. PHP phải hỗ trợ backward-compatible full ZIP cho đến khi delta xác minh thành công.
- Không đụng repo khác, không hardcode tên miền/DB, không thay đổi quyền chủ sở hữu.

**Gate:** Đây là thay đổi kiến trúc deploy, không được triển khai/merge/FTP trước khi có phê duyệt cụ thể của chủ sở hữu theo Knowledge `core/01`, `core/05`, `stacks/astro-wordpress-build.md`.
