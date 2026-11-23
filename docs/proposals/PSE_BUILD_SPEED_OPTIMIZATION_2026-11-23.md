# Kế hoạch tối ưu tốc độ build và deploy PSE

Ngày 23/11/2026 theo giờ Việt Nam. Phạm vi triển khai dự kiến gồm workflow PSE trong `psevn-actions/main` và các phần trực tiếp tạo hoặc chuyển bản build ở `psevn-astro/master`, `psevn-php/master`. Các mốc dưới đây dùng để đánh giá sau khi thực hiện.

## Mục tiêu

- **Production dùng cache, nội dung thay đổi thông thường** — trung vị (`p50`) **≤ 90 giây**, `p90` **< 120 giây**, tính từ khi GitHub tạo production run đến khi run kết thúc. Truy nguyên mọi lượt vượt **180 giây** theo bước chậm nhất.
- **Từ yêu cầu tự động tới website sẵn sàng** — đo thêm thời gian chờ của workflow yêu cầu build, tới lúc production smoke thành công. Ngân sách cho đoạn trước khi GitHub tạo production run là **≤ 30 giây trung vị** nếu rút gọn được helper WordPress.
- **Build cache lạnh và đợt nhiều media** — đo thành nhóm riêng, ghi số byte và số ảnh mới. So sánh trước/sau theo cùng loại thay đổi và xác minh đường tải lại đầy đủ, deploy và QA đều đạt.

Ngân sách tham chiếu cho mốc 90 giây là **22 s** cho xếp hàng, chuẩn bị và dọn dẹp, **31 s** cho cài đặt, Astro và xác minh output, **20 s** cho ZIP và FTPS, **17 s** cho env, kích hoạt và smoke. Điều chỉnh phân bổ theo phép đo thực tế và nghiệm thu bằng tổng thời gian từng run.

## Số đo trước tối ưu

12 lượt production liên tiếp đều thành công, từ 12:33 ngày 22/11 đến 00:55 ngày 23/11 (UTC+7). Dùng `updated_at - created_at` cho cả workflow và `completed_at - started_at` của từng step. `p90` dùng hạng `ceil(0,9 × n)`. Số liệu nền gồm các loại cập nhật đã chạy trong khoảng này. [Workflow production](../../.github/workflows/pse-production-deploy.yml)

| Lượt production | Tổng | Cài và build Astro¹ | Đóng gói | Upload Python FTPS |
| --- | ---: | ---: | ---: | ---: |
| [#45051898907](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45051898907) | 154 s | 48 s | 1 s | 58 s |
| [#45049550363](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45049550363) | 149 s | 56 s | 1 s | 45 s |
| [#45047656628](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45047656628) | 211 s | 117 s | 0 s | 36 s |
| [#45045194727](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45045194727) | 109 s | 41 s | 1 s | 17 s |
| [#45041558507](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45041558507) | 174 s | 76 s | 1 s | 49 s |
| [#45038949216](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45038949216) | 151 s | 66 s | 1 s | 32 s |
| [#45024581291](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45024581291) | 167 s | 66 s | 1 s | 51 s |
| [#44995644585](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44995644585) | 140 s | 68 s | 1 s | 19 s |
| [#44993791364](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44993791364) | 168 s | 41 s | 0 s | 79 s |
| [#44991814710](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44991814710) | 146 s | 67 s | 0 s | 31 s |
| [#44990670112](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44990670112) | 178 s | 43 s | 0 s | 82 s |
| [#44989925533](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44989925533) | 147 s | 63 s | 1 s | 38 s |
| **Trung vị** | **152,5 s** | **64,5 s** | **1 s** | **41,5 s** |
| **P90** | **178 s** | **76 s** | **1 s** | **79 s** |

¹ Step hiện gồm `pnpm install`, `pnpm run build-git` và kiểm tra output. Mốc 0 s do GitHub ghi thời điểm step theo giây. Mốc lịch sử **301 giây** ngày 20/11 gồm **184 giây** ở step cài và build, **75 giây** upload. PSE từng đạt **87 giây** sau khi áp dụng delta ảnh, trên mẫu có bộ ảnh nhỏ hơn hiện tại. [Run 301 s](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44669545403) · [Checkpoint 87 s](../checkpoints/PSE_BUILD_SPEED_2026-10-25.md)

- **WordPress redirect** chiếm **27,3–29,1 giây** ở hai lượt mới nhất và **43,1 giây** ở #45041558507. Nhánh đối soát nhẹ mất **7,9 giây** ở #45045194727. Astro đọc danh sách `id,modified` rồi có thể tải lại từng trang dữ liệu đầy đủ. Payload log PHP chưa mang giá trị `modified` từ REST, còn nhánh áp log ở Astro chưa chuyển trường này vào `sourceModified`. Rule vừa cập nhật vì thế có thể bị xem là lệch phiên bản ngay khi dữ liệu đã khớp. [PHP redirect log](https://github.com/ngocnhanvo/psevn-php/blob/05b21fb0487e7ce1ed0d8af44085b1f3205bc180/wp-content/plugins/github-trigger/redirects/endpoint.php) · [Đối soát của Astro](https://github.com/ngocnhanvo/psevn-astro/blob/db3a97688b21e3823ce137e2a901d6366d64cc67/src/lib/wordpress/redirects/index.ts)
- **FTPS** mất **17–82 giây** với các ZIP xấp xỉ **5 MB** ở #45045194727, #44993791364 và #44990670112. Các lượt 79–82 giây đều xong ở lần upload thật đầu tiên, dữ liệu log trước `FTPS_TRANSFER_START` đến từ unit test. Ở #45051898907, delta tái sử dụng **901/901 tệp ảnh và 85/86 tệp tĩnh**. Cần ưu tiên kiểm tra thời gian truyền thực và thành phần còn lại của ZIP. [Job 82 s](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44990670112/job/137110812125) · [Job mới nhất](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45051898907/job/137298623913) · [Checkpoint delta tĩnh](../checkpoints/PSE_STATIC_DELTA_2026-10-25.md)
- **Ảnh WordPress mới** kéo thời gian Pages lên **51,3 giây** ở #45047656628. Có 19 lần xử lý ảnh được log. Lần fetch lâu nhất là **30,64 giây**, còn Sharp tối đa **0,07 giây** mỗi ảnh trong mẫu. `pnpm install` chỉ mất **5,3–7,9 giây** trong các job hiện hành đã đọc log. [Job build chậm do Pages và redirect](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45047656628/job/137285666685)
- **Yêu cầu build tự động** cộng thêm **60–66 giây** trước hai production run mới nhất. Riêng khởi tạo container **20–22 giây**, luồng gọi WordPress **20–28 giây**. Hai chuỗi tự động gần nhất mất tổng **214–215 giây** tính tới lúc production run kết thúc. [Yêu cầu #45051804029](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45051804029) · [Yêu cầu #45049450036](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45049450036)

## Thứ tự thực hiện

### 1. Đo riêng từng công đoạn trong production workflow

Vị trí chính là [`pse-production-deploy.yml`](../../.github/workflows/pse-production-deploy.yml) và [`pse-ftps-upload.py`](../../scripts/pse-ftps-upload.py).

- [ ] Tách step hiện tại thành cài pnpm dependencies, chạy Astro và xác minh output. Ghi thời gian chờ runner, preflight, cache pnpm và `.cache`, thời gian WordPress theo nhóm dữ liệu, build, ZIP, FTPS, env, kích hoạt, smoke và bước lưu cache. Đặt timeout riêng cho cài đặt, build và upload dựa trên mẫu đo, có dư địa cho cache lạnh và đợt media lớn.
- [ ] Ghi trong job summary số giây, trạng thái cache, SHA của source, run/attempt, số trang và redirect, ảnh được tạo lại, ZIP byte, byte tái sử dụng và số lần retry. Tách FTPS kết nối/TLS, truyền dữ liệu, xác minh kích thước và chuyển tên tệp. Dùng đồng hồ monotonic cho từng công đoạn. Dữ liệu công khai chỉ gồm số đo và định danh release đã được phép công bố.
- [ ] Kiểm tra trên fixture cache hit/miss, build timeout và upload gián đoạn. Báo bước lỗi kèm run. Luồng theo dõi giữ cùng một run/attempt, báo riêng `BUILD_SUCCESS`, `DEPLOY_READY` và `QA_PASS`.

### 2. Giảm full refresh của redirect WordPress

Vị trí chính là `src/lib/wordpress/redirects/index.ts` và các test `redirects/registry*.test.ts` của Astro, cùng `wp-content/plugins/github-trigger/redirects/endpoint.php` của WordPress. [Hợp đồng kiểm tra redirect](https://github.com/ngocnhanvo/psevn-astro/blob/db3a97688b21e3823ce137e2a901d6366d64cc67/src/lib/wordpress/redirects/registry.test.ts)

- [ ] Bổ sung `redirect.modified` cho log của rule publish theo đúng giá trị REST `wp/v2/chuyen-huong-link` rồi truyền vào `sourceModified` khi áp log. Đọc được payload cũ và chạy nhánh đối soát đầy đủ khi phiên bản thiếu hoặc không khớp. Xác minh WordPress REST, cập nhật ACF và quy tắc enable/disable trả cùng trạng thái với dữ liệu deploy.
- [ ] Đo lại số request và thời gian với cache ấm ở ba ca thêm/sửa một rule có log, thay đổi thiếu log và tải lại toàn bộ. Nếu full refresh vẫn là nút thắt, thử tải các trang độc lập với giới hạn **2 rồi 4 request đồng thời** sau khi biết số trang. Kiểm tra tính nhất quán của snapshot và thứ tự ưu tiên rule. Khi dữ liệu thay đổi giữa các trang, thử lại hữu hạn hoặc dừng ở trạng thái lỗi dữ liệu. Chỉ xem xét API snapshot/revision gọn khi hai thay đổi trên chưa đạt ngân sách.
- [ ] Test đối chiếu tập rule với snapshot REST độc lập cho tạo, sửa, disable, trash, thay đổi ACF, số rule giữ nguyên nhưng ID đổi, log schema cũ và snapshot thiếu trang. Xác minh 301 Joomla, Rewrite bài SSR và ưu tiên/điều kiện của rule. Mục tiêu cho cập nhật ít rule là lấy redirect **≤ 10 giây trung vị** và kết quả route khớp hoàn toàn.

Kiểm tra tại Astro bằng `pnpm exec vitest run src/lib/wordpress/redirects/registry.test.ts src/lib/wordpress/redirects/registry.bounded-concurrency.test.ts`.

### 3. Giảm thời gian gửi ZIP

Vị trí chính là [workflow production](../../.github/workflows/pse-production-deploy.yml), [script upload hiện hành](../../scripts/pse-ftps-upload.py) và [script đo FTPS](../../scripts/pse-ftps-transfer-profile.py).

- [ ] Đếm byte nén theo `server/`, `client/_astro/`, `client/data/`, ảnh mới và metadata trên ZIP ngay ở runner. So sánh mức nén mặc định và mức nén cao hơn trên cùng output. Chọn theo tổng thời gian **đóng gói + truyền**, đối chiếu checksum của tệp sau giải nén. Giữ bản đầy đủ của SSR và `client/index.html`, dùng lại cơ chế delta đã có cho ảnh và tệp tĩnh.
- [ ] Đo throughput lặp lại với cùng cỡ tải khoảng 5 MB ở nhiều thời điểm. Dùng probe sẵn có trên đích benchmark được phép, ghi số lần thử và xác minh xóa file probe. Nếu payload ổn định mà upload vẫn biến động, so cùng tải với runner ở mạng gần hosting hơn. Giữ Python FTPS, xác thực chứng chỉ và pipeline hiện tại trong phép so sánh. Mốc để chọn thay đổi là **≤ 20 giây trung vị và ≤ 30 giây p90** cho payload cỡ hiện tại, kèm số đo trước/sau.
- [ ] Chạy lại test resume đúng offset, upload trùng, timeout, sai kích thước/SHA, delta thiếu inventory, ZIP đầy đủ và rollback. Nếu chuyển vị trí runner có lợi rõ, đánh giá quyền/secrets, chi phí và vận hành trước khi thay hạ tầng. Production sử dụng đúng cơ chế ký, xác thực checksum và kích hoạt staging hiện tại. [Test FTPS](../../tests/test_pse_ftps_upload.py) · [Test delta tĩnh](../../tests/pse-static-delta-package.test.py)

Kiểm tra tại Actions bằng `python3 -m unittest discover -s tests -p test_pse_ftps_upload.py` và workflow [image/delta contract CI](../../.github/workflows/pse-image-delta-contract-ci.yml).

### 4. Rút ngắn fetch ảnh và dữ liệu trong lượt cache lạnh

Vị trí chính là `src/lib/wordpress/pages/getData.ts`, `src/lib/wordpress/imageProcessor.ts` và `src/lib/wordpress/cache.ts` của Astro. [Cache và thứ tự tải dữ liệu](https://github.com/ngocnhanvo/psevn-astro/blob/db3a97688b21e3823ce137e2a901d6366d64cc67/src/lib/wordpress/cache.ts) · [Bộ xử lý ảnh](https://github.com/ngocnhanvo/psevn-astro/blob/db3a97688b21e3823ce137e2a901d6366d64cc67/src/lib/wordpress/imageProcessor.ts)

- [ ] Log số ảnh trúng cache, hàng chờ, thời gian tải từ WordPress, retry và thời gian Sharp. Tận dụng cache promise và `.cache/images` hiện có. Kiểm tra cùng ảnh được tham chiếu nhiều lần, thay nội dung tại cùng URL, ảnh khác kích thước và phiên bản bộ xử lý thay đổi.
- [ ] Thử giới hạn **2, 4, 6** lượt fetch ảnh đồng thời trên cùng bộ media, so thời gian Pages, tổng request, tỷ lệ timeout và tải PHP. Giữ mức thấp nhất đạt tốc độ mục tiêu. Sau khi xác minh nguồn, thử cho `loadRedirects()` và phần tải menu chạy sớm cùng Info/Pages, có giới hạn tổng request. Tiếp tục đợi Pages trước xử lý Product theo route và đợi đủ dữ liệu trước TablePress. Giữ cơ chế fail build với ảnh bắt buộc lỗi.
- [ ] Kiểm tra một build cache ấm, một build lạnh trên fixture và một đợt cập nhật ảnh thật. So kết quả số ảnh, kích thước, hash khi phù hợp, shortcode ESC Table, menu và SSR. Đưa tối ưu Vite hoặc thay đổi nén ảnh vào thử nghiệm tiếp theo khi số đo cho thấy thời gian CPU hoặc byte ảnh thực sự chi phối.

### 5. Giảm thời gian từ yêu cầu WordPress đến production run

Vị trí chính là [workflow yêu cầu build](../../.github/workflows/pse-wordpress-build-request.yml), [helper hiện có](../../imported-eduresearch/scripts/wordpress-build-trigger-e2e.mjs) và `wp-content/plugins/github-trigger/vcs-build-trigger.php` của WordPress.

- [ ] Đo độc lập phần khởi tạo Playwright, đăng nhập, trang kiểm tra phiên, lấy nonce/trạng thái và chấp nhận dispatch. Ưu tiên bỏ lượt điều hướng wp-admin dư thừa khi trang Build Website đã xác minh được phiên đăng nhập và quyền. So chi phí container hiện tại với đường gọi PHP hiện có bằng client nhẹ nếu hợp đồng xác thực hỗ trợ. Giữ kiểm tra CMS job `apply`, quyền WordPress, nonce, pending, build lock và xác nhận đúng workflow/run.
- [ ] Kiểm thử nhánh không có pending, lock đang giữ, lỗi auth, dispatch không ra run, trùng trigger và một lần thay đổi hợp lệ. Xác minh mỗi yêu cầu hợp lệ tạo đúng một production run. Với cùng một lô cập nhật được duyệt, gom các thay đổi tương thích trước khi kích hoạt Build Website một lần.
- [ ] Nếu phần chuẩn bị và dọn dẹp của production vẫn lớn sau các bước trên, đo thêm chi phí cache restore/save, signed preflight và readiness. Tối ưu các thao tác đọc thật sự độc lập và giữ preflight đúng thứ tự. Chỉ retry readiness tạm thời trong deadline. Lỗi nội dung sau khi bản mới sẵn sàng phải báo ngay phép kiểm tra bị lỗi.

## Nghiệm thu và quay lui

- [ ] So từng thay đổi riêng trước khi gộp. Dùng cùng Node 24, pnpm 9.15.9 và lockfile cho phép đo đối chứng. Ghi SHA, revision CMS và runner, đồng thời phân nhóm cache ấm, cache lạnh, có media mới hoặc full ZIP. Đo ít nhất **12 lượt cache ấm hợp lệ** trước khi kết luận theo `p50`/`p90`. Báo thêm số lượt fail/cancel và chi phí retry. Dùng các lượt build cần thiết của dự án để thu số liệu production.
- [ ] Giữ chuỗi WordPress Build Website → `wp_trigger_build` → `psevn-astro/master` → `pnpm run build-git` → Python FTPS → signed PHP staging/rollback → smoke. Xác minh branch/SHA đã kích hoạt, homepage, `/api/user/info`, robots/llms, sitemap theo revision Lưu, trang tin SSR và các URL Joomla đại diện bằng oracle độc lập. Giữ QA chức năng trong workflow kiểm thử hiện có.
- [ ] Chỉ nhận thay đổi khi đúng dữ liệu và đạt lợi ích sau đo. Nếu sai redirect/ảnh, env, marker/SHA hoặc smoke, quay về commit gần nhất đã đạt và dùng quy trình rollback hiện hữu cho lần phát hành lỗi. Nếu cơ chế delta không tương thích, dùng đường ZIP đầy đủ hiện có. Ghi từng commit, run/attempt, thời gian trước/sau và nhóm mẫu vào kế hoạch khi thực hiện.

Nguồn quy tắc và cấu hình đã đối chiếu ngày 23/11/2026. [Knowledge](https://github.com/ngocnhanvo/knowledge/tree/1b5aab9e2f8b2fccb42947a74a48df6d9761570f) · [Actions](https://github.com/ngocnhanvo/psevn-actions/tree/2e3fdace4522b0f5c501585d6c6213beff86b030) · [Astro](https://github.com/ngocnhanvo/psevn-astro/tree/db3a97688b21e3823ce137e2a901d6366d64cc67) · [PHP](https://github.com/ngocnhanvo/psevn-php/tree/05b21fb0487e7ce1ed0d8af44085b1f3205bc180)


## Checkpoint triển khai và benchmark 23/11/2026

### Phần đã triển khai production

- **Redirect incremental:** `psevn-astro/master` SHA `69093b80818bcd8d905ef7f83ba3292f21cacb56` đọc `redirect.modified` từ PHP log vào `sourceModified`; log cũ, sai/thiếu stamp hoặc snapshot không khớp sẽ full-refresh. PHP endpoint nguồn `a26a35a40618ecc86a3f0e9117955c307295ae09` được phát hành qua FTPS SHA256 (chỉ một file) tại [PHP #45087126728](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45087126728). [Vitest/CI #45087163199](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45087163199) **PASS**.
- **Stage profiling:** tách `pnpm install` / Astro build / compiled verify / ZIP package / Python FTPS / protected `.env` / signed activate / smoke. Đo monotonic, exit status, ZIP segments, byte reuse, SHA, run/attempt trong summary, FTPS TLS/transfer/rename riêng. Unit test offline và timeout từng bước. [Architecture #45086990973](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45086990973) **PASS** với Python `FTP_TLS` thực tế (thay check lftp cũ).
- **Static/media ZIP delta v2:** chỉ tái sử dụng file `client/` không đổi và được PHP ký inventory, SHA256/size match, path allowlist, chống symlink/traversal, giới hạn byte; mở rộng font, SVG, PNG, JPEG, GIF, WebP, AVIF, ICO, PDF. `client/images/` giữ image delta; `client/index.html` và toàn bộ `server/` luôn trong ZIP mới; `.env` không nằm trong ZIP. PHP nguồn SHA `5a3bfaa9d4f0a63a09311ac27aecc0fdda226b65` phát hành có rollback, hai file PHP, [release #45087794475](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45087794475) PHP + QA **PASS**. Client chấp nhận `exclude-images-v1` và `exclude-images-v2-media` bằng allowlist riêng; schema lạ fail-closed. [CI #45088111917](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45088111917), [architecture #45088097601](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45088097601) **PASS**.
- **Không đổi kiến trúc release:** WordPress Build Website → `wp_trigger_build` → Astro `master` → Actions `main` → Python FTPS TLS → signed PHP staging/rollback → smoke. Chứng chỉ, chữ ký, checksum, `.env` HTTP deny và WordPress CMS source đều còn nguyên.

### Bằng chứng thời gian và byte từ production

| Đợt | Run/attempt | Tổng workflow | ZIP | FTPS | Astro build | Redirect |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Trước nâng cấp gần nhất | [#45051898907](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45051898907) | 154s | Chưa đo | Chưa đo | Chưa đo | Chưa đo |
| Sau redirect/stage telemetry | [#45087354321](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45087354321), attempt 1 | 109s | 4.954.099 B | 23,855s | 25,742s | 6,826s (848 rules, 0 changed, logs) |
| Sau static/media v2 | [#45088287779](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45088287779), attempt 1 | **90s** | **2.032.324 B** | **10,490s** | **21,616s** | **4,651s (848 rules, 0 changed, logs)** |

Kết quả: tổng workflow so với lượt trước nâng cấp gần nhất **-64s (~41,6%)**; ZIP so với giai đoạn telemetry đầu **-2.921.775 B (~59%)**, FTPS **-13,365s (~56%)**. Media v2 reuse: static **134/134 file, 7.326.942 B**, ảnh **901/901, 56.170.883 B**; tổng **1.035 file, 63.497.825 B** không chuyển lại qua ZIP.

Lượt [#45088009728](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45088009728) **FAILED trước build/FTP** do preflight không chấp nhận static scope v2 mới. Không có deploy trên lượt đó. Đã sửa validator versioned, bổ sung test negative, CI PASS và production tiếp theo **#45088287779 SUCCESS**. Tuyệt đối không tính lượt fail này là thành công.

**Phân biệt trạng thái:** `BUILD_SUCCESS=PASS`, `DEPLOY_READY=PASS` và `QA_PASS=PASS` đối với *ba smoke probes bắt buộc* (homepage, `/api/user/info` SSR, robots) của #45088287779. QA sâu cho URL Joomla, tin SSR, thay đổi ACF/redirect và sitemap cần đối chiếu riêng, không được suy ra từ smoke.

### Chưa hoàn tất / cách nghiệm thu

- Baseline 12 lượt: **p50 152,5s, p90 178s**. Mục tiêu warm **p50 ≤90s, p90 <120s**: đã quan sát **một lượt đạt đúng 90s**, **chưa có đủ 12 mẫu warm mới** để kết luận p50/p90. Tiếp tục thu mẫu theo nhu cầu build thật; phân nhóm warm/cold/media changes/runner/retry, không tự tạo nhiều lần production vô ích.
- Đo cache hit/miss, ảnh fetch/Sharp/concurrency 2/4/6, Page/Product/TablePress, CMS Playwright login/nonce/lock/dispatch và chi phí runner preflight; benchmark nén ZIP trên cùng output trước khi đổi compression.
- QA redirect create/modify/disable/trash, ACF, snapshot REST/live 301 Joomla, SSR news, sitemap revision; trường hợp sai dữ liệu hoặc nghi ngờ an toàn phải fail-closed và rollback theo quy trình signed production hiện hữu.

**Checkpoint:** triển khai bảo toàn release + production smoke **DONE**; đo đủ 12-run p50/p90 và QA chức năng mở rộng **PARTIAL — chưa hoàn tất**.
