# PSE — kiểm tra và chuẩn bị phát hành Astro

**Trạng thái: đang khóa build và deploy production.** Không bật chỉ vì các unit test đều PASS.

## Đã kiểm chứng

- 11 file PSE được đồng bộ về nội dung giữa `psevn-astro/github` (DEV) và `master` (PROD), dù lịch sử commit hai nhánh có thể khác nhau.
- [PSE master isolation CI #39642245691](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39642245691): 12 nhóm Vitest PASS, chặn runtime EduResearch, không build hoặc FTP.
- [PSE release boundary CI #39639152254](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39639152254): kiểm thử cú pháp và cấu trúc workflow PASS, không build.
- [FTPS one-file permission #39632993155](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39632993155): kết nối FTPS đã xác minh, ghi/đọc/hash/xóa **một file thử nghiệm** ở thư mục frontend PSE PASS.
- [PSE release config audit #39642844620](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39642844620): các secret FTP và `ENV_FILE` có mặt, không có URL của source project, nhưng phát hành chưa sẵn sàng. Endpoint `pse-unzip-v2.ready` chưa xác minh được qua HTTPS GET.

## Cần cấu hình trước khi được phép chạy build

Tại **ngocnhanvo/psevn-actions → Settings → Secrets and variables → Actions**:

1. **Secret `PSE_ASTRO_UNZIP_SIGNING_KEY`**: còn thiếu. Tạo một khóa ngẫu nhiên riêng cho PSE, dài ít nhất 32 ký tự (nên sinh bằng `openssl rand -hex 32` trên máy tin cậy). Thiết lập **cùng giá trị khóa** vào WordPress PSE, qua hằng số `PSE_ASTRO_UNZIP_SIGNING_KEY` trong cấu hình hosting không được commit. Tuyệt đối không dùng `SOURCE_REPO_PAT` hoặc khóa của EduResearch, không đưa khóa vào file `.env` public, GitHub log hay bình luận.
2. **Variable `PSE_ASTRO_FTP_TARGET`**: còn thiếu. Đường dẫn đã được FTPS kiểm chứng với frontend hiện tại là `/domains/pse.webnvn.com/public_html/`. Workflow sẽ từ chối phát hành nếu biến này không khớp với domain frontend lấy từ `WC_URL_CLIENT` trong `ENV_FILE`. Khi đổi domain, cập nhật URL và target trong **cấu hình dự án**, không sửa hằng số hostname trong PHP.
3. **Variable `PSE_BUILD_ENABLED`**: để **`false`** trong giai đoạn chuẩn bị (hiện đang thiếu và tương đương khóa). Chỉ đặt thành `true` sau khi các điều kiện còn lại PASS và chủ dự án duyệt phát hành.

Tại **WordPress PSE / hosting**:

4. Kiểm tra `pse-unzip.php` và file đánh dấu `pse-unzip-v2.ready` đã được triển khai trên WordPress PSE từ đúng repo `psevn-php/master`. Dấu hiệu thành công: `GET https://<WordPress origin>/pse-unzip-v2.ready` trả đúng `PSE_ASTRO_UNZIP_PROTOCOL=2`. Audit trước đó chưa xác minh được, không khẳng định file thiếu chỉ từ một lần GET lỗi.
5. `PSE_GITHUB_ACTIONS_TOKEN` phải là token riêng dành cho việc dispatch `psevn-actions`. `VCS_GH_REPO` phải là `psevn-actions`. Chỉ bật `PSE_ASTRO_DEPLOY_READY=true` sau khi cấu hình ký/đích FTP/endpoint hoạt động và được kiểm thử. Không mang secrets source project sang.
6. Đồng bộ các thay đổi PHP mới vào WordPress PSE theo **chế độ code được phép** trước khi thao tác thực tế trong giao diện Build Website. Code-mode `normal` không tự FTP upload PHP hoặc kích hoạt build.

## Kiểm tra lại theo thứ tự

1. Chạy workflow `PSE release configuration readiness (NO BUILD)` để xác minh secrets/vars, origin/target và marker bằng GET. **Audit job PASS không đồng nghĩa đủ điều kiện deploy**; đọc `PSE_RELEASE_PREREQUISITES`.
2. Chạy `PSE release architecture verification (NO BUILD)` để xác minh cú pháp, guards, signed unzip v2 và SEO Save-token.
3. Chạy `PSE Astro master isolation verification (NO BUILD)` nếu có sửa mã Astro production; không cần lặp lại khi không đổi mã.
4. Bật các khóa **chỉ sau khi được duyệt** và thực hiện build thực tế **qua nút Build Website của WordPress/PHP**. Không phát lệnh `repository_dispatch` trực tiếp chỉ để thử.

Luồng build dự kiến dùng `psevn-astro/master`, pnpm store + `.cache`, `build-git` kế thừa, giữ nguyên logic chỉ chuyển `sitemap.xml` khi người dùng bấm Lưu. Deploy ZIP tới đúng thư mục frontend PSE và kích hoạt bằng giao thức signed unzip v2. Không đẩy build sang EduResearch.

## Những gì chưa được làm

Không có build Astro production, không upload ZIP, chưa triển khai PHP production, chưa ký lệnh unzip, chưa bật `PSE_BUILD_ENABLED` hoặc `PSE_ASTRO_DEPLOY_READY`. Các việc này đòi hỏi cấu hình hợp lệ, kiểm thử tiếp và phê duyệt tương ứng.
