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


## Checkpoint triển khai PSE — 23/10/2026 (sau WordPress SEO Save)

Đây là kết quả mới nhất, thay thế phần "Bước còn cần thực hiện" mang tính lịch sử phía trên; **không chạy lại các job đã PASS**.

- **WordPress sitemap:** [#39934880780](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39934880780) PASS. Lưu qua form admin có nonce, giữ sitemap public hiện có (1 URL homepage), chuyển manual, tăng Save revision và REST read-after-write PASS. Không kích hoạt build tại bước Save.
- **Nguyên nhân lỗi PHP preflight:** các lượt yêu cầu build #39935116201 và #39935286196 trả HTTP 403 `PSE site identity failed`, trước khi Astro build; không phải lỗi FTP/công cụ sitemap. Sửa đúng nguồn `ngocnhanvo/psevn-php/master` commit `372f58dc414644b5cc75f686df7206a86930fe34`: bỏ điều kiện gán cứng DB/repo, yêu cầu danh tính owner/repo/database cấu hình hợp lệ trong WordPress, giữ HMAC + domain/target/rollback checks. CI kiến trúc [#39935787081](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39935787081) PASS.
- **PHP FTPS:** [#39935861920](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39935861920) PASS, `pse-unzip.php` mới checksum PASS, 5 file còn lại unchanged, không build Astro.
- **wp-config build destination:** [#39935929040](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39935929040) PASS: FTP checksum/readback, token và DB không đổi; `SIGNED_UNZIP_PREFLIGHT_OK` và PSE identity PASS.
- **Kích hoạt build đúng cửa ngõ:** [#39936052168](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39936052168) PASS: WordPress/PHP Build Website qua authenticated session; không gọi trực tiếp workflow Astro/force.
- **Astro production:** [#39936199056](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39936199056) **SUCCESS** lấy `ngocnhanvo/psevn-astro/master` SHA `86ab8a5feb9e10baed81374f02ac881866830471`: pnpm/Astro build PASS, Save revision mới được nhận và sitemap XML được đóng gói, FTPS upload PASS, ký/giải nén kích hoạt PASS, HTTP GET homepage/API user SSR/robots PASS.
- **Playwright trên website public sau deploy:** [#39936557554](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39936557554) PASS (`DESKTOP_SMOKE=PASS`, `MOBILE_SMOKE=PASS`) bằng `knowledge-actions`.
- **Phân loại:** `ASTRO_BUILD=PASS`, `SIGNED_FTPS_DEPLOY=PASS`, `LIVE_SSR_SMOKE=PASS`, `CHROMIUM_SMOKE=PASS`, `SITEMAP_SAVE_AND_PACKAGE=PASS`. **Chưa xác nhận:** trực tiếp GET và parse sitemap XML sau deploy bằng test độc lập; tỷ lệ khớp thiết kế/screenshot chi tiết; parity toàn bộ legacy news/PDF, bởi browser smoke không xác nhận nội dung. Tránh phát biểu homepage đã đạt nghiệm thu thiết kế chỉ từ các test khói.
- **Tiếp theo:** chỉ triển khai tiếp các vấn đề giao diện/nội dung thật còn chưa đạt khi có bằng chứng; không chạy lại deployment thành công nếu không có thay đổi mới. Với sitemap, nếu cần thêm bảo đảm có thể kiểm tra GET `/sitemap.xml` read-only và so với revision Save, không sửa lại nội dung/force build.

- **Bổ sung xác minh XML sau deploy:** [#39936901768](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39936901768) PASS, chỉ dùng GET: live `/`, `/api/user/info`, `/robots.txt`, `/sitemap.xml` cùng HTTP 200; XML namespace `urlset` hợp lệ, chứa URL trang chủ, không trùng. Workflow độc lập `pse-postdeploy-verify.yml` đã được bổ sung phép kiểm tra này, không thêm chặn vào pipeline build gốc.
- **Lưu ý tiến độ homepage không thuộc lần sửa sitemap:** [#39936581494](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39936581494) là một job WordPress homepage cutover riêng, đã FAIL trước thao tác lưu vì guard `Existing public homepage contains unexpected nonlegacy blocks; safe cutover refused: []`. Không đánh đồng build/SSR/sitemap PASS với việc cập nhật thành công bố cục WordPress public homepage; cần kiểm tra page ID 248 thực tế và sửa guard có bảo toàn/rollback trước khi chạy cutover lại, không tự bỏ guard.

- **Homepage cutover attempt tiếp theo:** [#39936948367](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39936948367) FAIL tại `WP REST token unavailable` khi truy cập WordPress, trước khi lưu Page 248. Cần xác minh nonce/REST bootstrap trong phiên editor hợp lệ; không xóa bỏ auth/nonce guard và không gọi lại khi chưa sửa vấn đề. Tách hoàn toàn với thành công sitemap/build/FTP/SSR ở trên.

## 2026-10-23 — Hoàn tất trang chủ PSE đã xuất bản, build và QA live

**Mốc hoàn tất thay thế checkpoint lỗi về Page 248.** Các run lỗi #39936581494 (shortcode guard), #39936948367 (REST nonce), #39937209517 (nút Insert Code), #39937495823 (form Save chưa đợi điều hướng) đều đã được khắc phục; không chạy lại.

| Mốc | Kết quả và bằng chứng |
| --- | --- |
| Xuất bản CMS trang chủ | **PASS** — [#39938240675](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39938240675) WordPress ESC Table Quicktags Insert Code lưu Page 248 (trang-chu, key=home, action=HomePage, status=publish) với 4 section pse_00_vi, pse_01_vi, pse_02_vi, pse_03_vi đúng thứ tự; REST read-after-write PASS. SHA-256 nội dung mới b7520b0bbcd59dbca46850d35b151965129213f9d8282cf00823966c297d1abf. |
| Bảo toàn phiên bản trước | **PASS** — WordPress revision 76938, SHA-256 nội dung cũ 1d7d4718f75092eed900bc34c6f31c20c4b073dbbd3ad0542c33d983169149d0; artifact pse-homepage-precutover-wordpress-revision ID 12493814012 ở #39938240675. |
| Kích hoạt Astro chuẩn | **PASS** — [#39938527815](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39938527815) normal Build Website qua PHP/WordPress sau khi cập nhật Page 248. Không direct Actions dispatch và không force build. |
| Build / FTP / activate | **PASS** — [#39938628650](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39938628650): Astro psevn-astro/master SHA 86ab8a5feb9e10baed81374f02ac881866830471; build PASS; FTPS upload PASS; signed unzip PASS; SSR homepage, user API và robots GET PASS. |
| Sitemap revision | **PASS** — #39938628650 xác nhận không có lượt Lưu sitemap mới: SITEMAP UNCHANGED, XML không có trong ZIP và được giữ trên host, không so sánh nội dung. Trước đó #39936901768 GET XML public PASS. |
| Chromium QA live | **PASS** — [#39939049622](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39939049622) trên website đã deploy, Playwright read-only ở 375, 390, 768, 1440, 1920px: bốn section hero/news/promise/utilities đúng thứ tự, duy nhất 1 H1, ba news lanes, không tràn ngang, không ảnh section lỗi. Artifact 5 PNG pse-live-homepage-five-viewports ID 12493934771 ([mở tại Actions](https://github.com/ngocnhanvo/psevn-actions/actions/runs/39939049622/artifacts/12493934771)). |

**Trạng thái nghiệm thu:** CODE_READY=PASS; WP_PUBLIC_HOME_CUTOVER=PASS; WORDPRESS_CONTROLLED_BUILD=PASS; SIGNED_FTPS_DEPLOY=PASS; LIVE_RESPONSIVE_QA=PASS. Production frontend https://pse.webnvn.com/; CMS https://admin-pse.webnvn.com/. Không đồng nhất với di chuyển đủ toàn bộ bài viết.

**Còn lại độc lập:** Ba bài tin gốc ID 76975, 76976, 76977 vẫn ở trạng thái draft mặc dù ngày xuất bản gốc, media và PDF được kiểm chứng. Page archive/search 77030 vẫn draft. DATA_PARITY_LEGACY_SITE=PARTIAL; còn các bài gốc/URL chưa chuyển, visitor counter chưa có dữ liệu chính thức; news cards trống tương ứng dữ liệu published posts hiện tại. Không giả lập tin, ngày, tài liệu hoặc thống kê để lấp nội dung.

**Tiếp tục không lặp:** Đọc checkpoint, HEAD/runs hiện tại trước mọi thao tác; không lặp lại CMS cutover, WordPress media upload, screenshot 5 viewport hoặc build đã PASS nếu dữ liệu liên quan không đổi. Nếu có thay đổi nội dung thực và cần Astro rebuild, chỉ sử dụng PHP/WordPress Build Website trong chế độ auto-build, kiểm tra pending count/lock, signed FTPS và rollback. Chuyển dữ liệu, publish ba bài gốc, archive/search public, visitor stats và URL redirects là các bước dữ liệu/nghiệp vụ riêng, cần kiểm tra quyền, nguồn, revision và bằng chứng.
