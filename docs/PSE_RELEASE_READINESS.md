# PSE Astro — cấu hình build kế thừa EduResearch (không thêm secrets/variables)

**Chốt kiến trúc:** Giữ luồng WordPress PHP Build Website → `repository_dispatch: wp_trigger_build` của `psevn-actions` → lấy `psevn-astro/master` → `pnpm run build-git` + `.cache` → FTPS PSE → signed unzip v2 PSE. Không tự xây thêm hệ thống release hay tự chạy build từ GitHub Actions.

## Secrets có sẵn, không phát sinh key/variable mới

Repo `ngocnhanvo/psevn-actions` dùng đúng 5 secrets của cơ chế nguồn:

- `ENV_FILE`: bao gồm `WC_URL` (WordPress PSE), `WC_URL_CLIENT` (frontend PSE).
- `SOURCE_REPO_PAT`: checkout nguồn và ký HMAC unzip v2 theo đúng giao thức EduResearch.
- `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`: FTPS riêng của PSE.

**Không cần** `PSE_ASTRO_UNZIP_SIGNING_KEY`, `PSE_ASTRO_FTP_TARGET`, `PSE_BUILD_ENABLED`, `PSE_ASTRO_DEPLOY_READY`, `PSE_ASTRO_DEPLOY_TARGET` hay `PSE_GITHUB_ACTIONS_TOKEN`. Các yêu cầu đó do lần chuyển đổi trước tự thêm và đã được rút khỏi mã nguồn.

Thư mục FTP được suy ra tự động từ `WC_URL_CLIENT` dưới dạng `/domains/<frontend-host>/public_html/` và đối chiếu với domain mà nút Build Website gửi từ **Thông tin chung WordPress**. Đây không phải điều kiện hardcode hostname vào PHP. Nếu đổi domain, kiểm tra và cập nhật `WC_URL_CLIENT` và trường domain của WordPress.

## Token ký giải nén: kế thừa, không bỏ chữ ký

- WordPress PSE dùng `VCS_GH_ACTIONS_TOKEN` trong cấu hình GitHub Trigger hiện hữu. Plugin hỗ trợ `VCS_GH_TOKEN` cho GitHub API theo cách cũ.
- PHP `pse-unzip.php` dùng `VCS_GH_ACTIONS_TOKEN` để xác minh HMAC signed unzip v2; runner dùng `SOURCE_REPO_PAT` để ký. **Hai giá trị phải khớp**, như cơ chế source EduResearch. Nếu không khớp, preflight tự từ chối, không deploy.
- Khóa không được in trong log hay commit. Việc nhiều dự án chia sẻ PAT là lựa chọn vận hành sẵn có, song quyền của token cần được kiểm soát vì rủi ro ảnh hưởng chéo.

## Những phần đã xác minh

- Frontend PSE truy cập được đúng thư mục FTP và thử STOR/RETR/SHA256/DELE thành công: [#39632993155](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39632993155).
- PSE Astro `master` được kiểm tra offline 12 nhóm test PASS: [#39642245691](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39642245691).
- Pipeline PSE riêng dùng repo `psevn-astro` và `psevn-actions`, không chạy `nghiencuukhoahoc-actions`.

## Bước còn cần thực hiện

1. Đồng bộ **mã PHP PSE mới** từ `psevn-php/master` lên hosting PSE theo chế độ thao tác được phép, gồm plugin GitHub Trigger, MU-plugin, `pse-unzip.php` và `pse-unzip-v2.ready`. Không upload sang hosting EduResearch.
2. Xác minh marker `GET <WC_URL>/pse-unzip-v2.ready` trả về `PSE_ASTRO_UNZIP_PROTOCOL=2`. Nguồn gốc EduResearch cũng sử dụng marker protocol v2; đây là file endpoint, không phải key mới.
3. Xác minh token GitHub Trigger hiện hữu ở WordPress PSE hoạt động và có cùng giá trị ký với `SOURCE_REPO_PAT` của PSE Actions bằng **preflight chữ ký**, không công khai token.
4. Kiểm tra domain quản lý bởi WordPress khớp `WC_URL_CLIENT`, sau đó thử **Build Website từ WordPress** khi được người dùng cho phép. Không dùng dispatch thủ công để thay thế nút Build.

**Bảo toàn tối ưu nguồn:** pnpm store + `.cache`, `build-git`, sitemap XML chỉ truyền khi có lượt Lưu mới. Preflight vẫn từ chối source khác, token không đúng, path không khớp và ZIP không có metadata/SSR.

**Giới hạn:** Những thay đổi trong GitHub không đồng nghĩa đã triển khai WordPress hosting. Chưa chạy build/deploy production trong lần điều chỉnh này.
