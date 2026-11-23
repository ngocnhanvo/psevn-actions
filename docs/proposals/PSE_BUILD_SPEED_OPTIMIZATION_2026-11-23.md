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


## Checkpoint tiếp tục — 23/11/2026 (redirect prefetch, runner Chrome, warm-scorecard)

**Đã xác minh trong lượt thực thi tiếp theo:**

- **Astro `master` [`23b468a9`](https://github.com/ngocnhanvo/psevn-astro/commit/23b468a93fffd8177a2a38c88b743f24dab784c6)**: cho phép `loadRedirects()` bắt đầu ngay trước Info/Pages, kết quả lỗi/success được đóng thành outcome và không bỏ qua lỗi, Products/Categories/Menu vẫn phụ thuộc Pages như cũ; Vitest + kiểm tra thứ tự prefetch [CI #45089083157](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45089083157) **PASS**. Production [#45089261813](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45089261813) **SUCCESS**, Astro 18,655s so với 21,616s trên lượt #45088287779, tải nguồn song song sau Pages 2,364s so với 4,659s; redirect đủ 848/848, `0 changed, logs`. Tổng 114s vì FTPS 25,914s (ZIP vẫn 2,032 MB).
- **WordPress owner-request workflow** dùng Chrome cài sẵn trong GitHub runner thay container Playwright. Helper giữ `/wp-admin/` login, CAPTCHA, quyền admin và nonce Build Website, kiểm tra trạng thái/pending/lock, và `vcs_trigger_build` duy nhất. Nhánh thử nhảy thẳng vào trang Build Website ban đầu **FAILED QA #45089674510**, đã quay lại dashboard login có kiểm tra quyền và nhánh fallback được kiểm thử; [read-only Chrome & container QA #45090049885](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090049885) **PASS** (không dispatch). Helper [`31fb1128`](https://github.com/ngocnhanvo/psevn-actions/commit/31fb11281a513ac383d4e4b21b66a87704481b34); production owner-request Chrome [#45090187008](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090187008) **SUCCESS 33s**, benchmark yêu cầu trước container [#45089166884](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45089166884) **56s**, giảm **23s ≈ 41%** trên mẫu tương ứng. Phân rã Chrome request: auth+admin 14,203s; WP status 0,446s; dispatch 0,936s.
- **Production #45090240402** chạy chính đường `wp_trigger_build` của #45090187008, nguồn Astro `23b468a9`, **SUCCESS** từ 00:41:23 đến 00:43:25 UTC ngày 23/11 = **122s**. Astro 23,116s; FTPS **38,138s**, riêng STOR **34,105s** cho ZIP **2.032.400 bytes**; signed unzip thành công, `/api/user/info`/homepage/robots smoke PASS. Đo end-to-end GitHub owner request 00:40:49 → production complete 00:43:25 UTC = **156s**. Delta reuse 901 ảnh + 134 static, **1.035 file/63.497.825 bytes**.
- **Đo biến động FTPS:** cùng ZIP khoảng 2,03 MB, ba lượt thực tế: [#45088287779](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45088287779) 10,490s (STOR ~7,459s), [#45089261813](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45089261813) 25,914s (STOR ~21,970s), [#45090240402](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090240402) 38,138s (STOR ~34,105s). **Không có bằng chứng giảm kích thước ZIP tiếp sẽ khắc phục jitter mạng/server**. Không tự bỏ TLS/verify SHA/staging hoặc đổi giao thức. Giữ một benchmark transport có kiểm soát trước khi quyết định sửa uploader.
- **Read-only 12-run scorecard**: [`pse-build-scorecard.py`](../../scripts/pse-build-scorecard.py), [unit tests](../../tests/test_pse_build_scorecard.py), [workflow](../../.github/workflows/pse-build-speed-scorecard.yml). Chạy tự động sau production hoàn tất, chỉ nhận mẫu warm khi cả pnpm store và Astro `.cache` được restore, cả 8 stage PASS, cùng SHA Astro. Không tính failed/cancelled hoặc trộn revision; chỉ tính p50/p90 khi đủ 12. Báo throughput FTPS hiệu dụng và stage chậm nhất, cảnh báo upload >30s nhưng **không** block deploy. Test [#45090628415](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090628415) **PASS**, báo cáo lần gần nhất [#45090439952](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090439952) ghi đúng **2/12** lượt warm tại cùng SHA `23b468a9`. Không chạy production lặp để lấy số mẫu không có CMS delta thật.
- **Read-only QA sau deploy**: [#45090440055](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090440055) homepage và SSR tìm kiếm **PASS**; [#45090440097](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090440097) album **PASS** với 4 album/464 ảnh gốc, 2 viewport, 8 hàng kiểm tra, 12 GET ảnh thật và 2 trang listing; [#45090440078](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090440078) 7 bài Joomla **PASS** với 46 ảnh gốc, 14 hàng kiểm tra và 18 GET ảnh gốc. Trước đó QA #45089454970 timeout mạng ở attempt1, **rerun chính attempt2 SUCCESS**, không bỏ nội dung kiểm tra.

**Nghiệm thu:** code/production smoke/QA Joomla 4 album + 7 bài + homepage/search sau deploy **DONE**. 12 lượt warm cùng SHA hiện mới **2/12**; mục tiêu p50≤90s/p90<120s, thử cold/media change và benchmark throughput FTPS theo nhiều thời điểm **PARTIAL — chưa hoàn tất**. Đã tạo lịch giám sát điều kiện mỗi ngày trong ChatGPT (ID `6b038d0fddc88191adc06bca8185bf7f`), chỉ đọc kết quả Actions thật, không tạo build giả, không gửi thông báo khi chưa đủ bằng chứng. Chỉ chốt khi có đủ bằng chứng từ build cần thiết thực tế.


## Checkpoint đo FTPS độc lập — 23/11/2026 (không build website)

### Chẩn đoán đã thực thi

- Repo đích: `ngocnhanvo/psevn-actions/main`; Astro production `ngocnhanvo/psevn-astro/master` vẫn SHA `23b468a93fffd8177a2a38c88b743f24dab784c6`, PHP `master` vẫn `5a3bfaa9d4f0a63a09311ac27aecc0fdda226b65`. Không kích hoạt thêm production run để lấy mẫu.
- [FTPS benchmark #45091264058](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45091264058) **SUCCESS**: workflow hiện hữu `pse-ftps-transfer-profile.yml` chạy qua push với commit message one-shot được khóa chính xác; `PSE_BENCHMARK_ENABLED=1`, TLS kiểm chứng, cùng dữ liệu ngẫu nhiên **2.097.152 B** cho hai client, temp name theo GitHub run ID và xác minh xóa cả hai file sau thử nghiệm. `PSE_FTPS_PROBES_REMOVED=PASS count=2`; **NO_ASTRO_BUILD, NO_DEPLOY**. Commit script [`50a1adc0`](https://github.com/ngocnhanvo/psevn-actions/commit/50a1adc07f721aa53eeabdaa2a0cd2f9d6b2824f), workflow/trigger [`3fcb210d`](https://github.com/ngocnhanvo/psevn-actions/commit/3fcb210d391d5493f2ac19c68d5145829316bc39).
- TLS+login/chdir **2,70s**; Python `FTP_TLS.storbinary` **12,17s = 0,16 MiB/s**; lftp `ssl:verify-certificate=yes` và buffer 4 MiB **22,77s = 0,09 MiB/s** cho cùng payload. **Python nhanh hơn khoảng 46,6% trong phép đo tuần tự này**, nhưng tốc độ máy chủ/mạng thay đổi lớn nên không khẳng định hơn hẳn mọi thời điểm. **Giữ uploader Python và chế độ TLS hiện hữu**; chưa có đủ chứng cứ thay transport.
- Read-only kiểm kê `.cache` từ run thực #45090240402 trong chính benchmark: **901 ảnh/56.170.883 bytes**, 12 file dữ liệu khác/2.738.233 bytes; nén ảnh như một ZIP giả lập khoảng **56.025.278 bytes**. Cơ chế image delta đã reuse cả 901 ảnh thay vì upload lại ~56 MB mỗi lượt. Truy xuất `pse-astro.zip` ngay sau activation trả FTP **550/not-present**, vì vậy **không có dữ liệu ZIP composition mới từ phép đọc FTP**; số byte ZIP sản xuất vẫn lấy từ stage telemetry của run #45090240402 (**2.032.400 bytes**).
- Production đang dùng ZIP lệnh `zip -q -r ../upload/pse-astro.zip .`, package thời gian `0,555–0,779s` ở hai lượt cùng SHA gần nhất. Nâng mức nén là thay đổi cần benchmark có cùng input, chưa có bằng chứng tổng thời gian package+transfer tốt hơn; **không chỉnh compression/FTP/TLS hoặc PHP activation chỉ dựa vào một run**.

### Trạng thái nghiệm thu mới nhất

- Chính xác **2/12** warm builds `master` SHA `23b468a9`: [#45089261813](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45089261813) **114s**, [#45090240402](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090240402) **122s**; không đánh đồng hai mẫu với p50/p90 đã nghiệm thu. [Scorecard #45090628415](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090628415) PASS.
- Sau latest signed deploy, QA homepage/search [#45090440055](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090440055), 7 bài Joomla [#45090440078](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090440078), 4 album/464 ảnh [#45090440097](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45090440097) đều **PASS**.
- Lượt test FTPS là phép đo riêng **không được tính là production sample**. Bộ 12-run scorecard và automation hằng ngày đã có vẫn theo dõi phát hành thật; không tạo build/CMS delta giả, không đổi SHA Astro chỉ để đo. Bước tiếp theo: đợi đủ mẫu warm thực tế cùng SHA, nghiệm thu p50 ≤90s/p90 <120s, tách cold/media-change; chỉ thử phương án network/hosting mới khi có chốt bảo mật + rollback.

**Phạm vi code/FTP probe & QA: DONE; nghiệm thu toàn bộ mục tiêu p50/p90 12 mẫu: PARTIAL — chưa hoàn tất.**


### Xác thực phân nhóm warm/media trong scorecard

- [`pse-build-scorecard.py`](../../scripts/pse-build-scorecard.py) nay bắt buộc đồng thời: production run success, đủ 8 phase success, restore cả pnpm store + Astro `.cache`, **cùng Astro SHA** và log `PSE_IMAGE_DELTA=ENABLED total=N reuse=N` (không phát sinh ảnh mới). Nếu `reuse < total`, tách sang nhóm `media changed`; thiếu/mâu thuẫn marker thì `unknown`, không được tính ngầm vào 12 warm/no-new-media samples. **Lượt thay ảnh mới và cache lạnh không được gộp với lượt warm thường**.
- [Unit CI #45091554305](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45091554305) **PASS** với các ca có media mới, marker thiếu/sai, source SHA khác, cache lạnh, thiếu bước, stage fail và mẫu hợp lệ. Lượt [#45091537507](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45091537507) **FAILED trước đó** vì thay logic parser khi test fixture chưa được đồng bộ, đã cập nhật fixture và chạy lại CI PASS; chưa có sản xuất/deploy liên quan.
- Đối chiếu lại cả hai production run hiện tại: **2/12 warm/no-new-media cùng SHA `23b468a9`**, `media_changed=0`, `media_unknown=0` [report #45091554305](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45091554305). Đây vẫn **không** phải nghiệm thu p50/p90 đầy đủ.


## Checkpoint tiếp tục — 23/11/2026 (Pages image queue 8 workers, signed deploy)

**Source/tuyến phát hành đã được thực thi:**

- **Astro `master` [`7af6eab4`](https://github.com/ngocnhanvo/psevn-astro/commit/7af6eab4f4cf06367d207f155251c12c9f24befa)**: Pages image resolver trước đây chạy `Promise.all` theo từng batch 8 ảnh; nếu một ảnh trong batch chậm, các slot khác phải chờ. Thay bằng `runBoundedTasks` với **tối đa 8 worker** — vẫn đúng cache nguồn và thứ tự URL, slot rảnh nhận URL tiếp theo, chờ các request đang chạy settle trước khi throw lỗi ảnh bắt buộc. Không đổi API, WordPress content, SSR, image quality, lock/deploy pipeline.
- Test của worker: 4 ca về dùng slot rảnh khi ảnh khác bị chậm, giới hạn concurrency, trả kết quả đúng thứ tự, fail-closed và drain inflight; tích hợp vào read-only Astro CI với redirect regression. [CI #45092140698](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45092140698) **SUCCESS**, **14/14 Vitest**, workflow offline PHP/delta cũng PASS. Ảnh mới thực chưa phát sinh ở production sample này, nên **không thể suy ra tiết kiệm thời gian cold/media từ warm run**.
- Owner request lần đầu [#45092236771](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45092236771) **FAILED trước dispatch** vì `page.evaluate: TypeError: Failed to fetch` từ endpoint chỉ đọc WordPress `vcs_check_build_status`, login/admin OK. Chưa có Astro build, FTP hay WP mutation. Sửa helper bằng retry chỉ với status *read-only* cho network, HTTP429/5xx, timeout 12s mỗi request và tối đa ba lượt, vẫn fail closed khi nonce/quyền/lock sai; **không retry POST dispatch non-idempotent**. Helper [`dbbc086a`](https://github.com/ngocnhanvo/psevn-actions/commit/dbbc086a20208dfa6e3438bb5e632e408847f760). [Read-only auth #45092401891](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45092401891) **PASS cả system Chrome và container**, status `idle`, không có dispatch.
- Retry đúng owner-approved WordPress Build Website [#45092518002](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45092518002) **SUCCESS 35s**, tạo đúng một official `repository_dispatch` production [#45092574062](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45092574062) **SUCCESS 106s** (01:05:49–01:07:35 UTC). Source SHA `7af6eab4` verify, signed PHP activation + homepage, SSR user API, robots smoke PASS. Stage: `install 5.284s`, `astro 19.009s`, `package 0.572s`, `FTPS 21.365s` (connect 2.281s, transfer 17.812s for 2.032.851 B), `runtime_env 6.598s`, `activate 8.099s`, `smoke 6.108s`. Redirect logs **848 rules/0 changed/5.315s**, Pages **2.242s**, Products processed-cache **1.999s**. ZIP **2.032.851 B**; signed image/static delta reused **901 images +134 static =1.035 files, 63.497.825 B**.
- Trước đó same SHA `23b468a9` warm runs 114/122s; run mới 106s nhưng FTPS giảm từ 38.138s → 21.365s so với lượt sát nhất. **Không nhận chênh lệch 16s là lợi ích của worker pool**, vì không có media mới và độ biến động mạng lớn.
- Sau deploy: homepage/search QA [#45092745514](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45092745514) **SUCCESS**, four Joomla album/464-photo QA [#45092745524](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45092745524) **SUCCESS**; image-aware scorecard [#45092745511](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45092745511) **SUCCESS**, cohort `7af6eab4` **1/12 warm/no-new-media**, không gộp cohort `23b468a9` 2/12. Bản thân 765 native 301 và đủ 804/804 original Joomla routes đã có independent live PASS #45043136174 và #45052157873 trước thay đổi này, không cần chạy lại 1.500+ GET khi không có source/CMS redirect change.
- Seven Joomla source-Post QA [#45092745546](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45092745546) **attempt 1 FAILED** khi image pixel decode source Post #229 index 0, sau 3 Post đầu (#205/#226/#227) đều PASS; thuộc kiểm tra browser ảnh thật, **không được đánh dấu QA PASS**. Đã rerun **failed QA job trong cùng run** attempt 2, không build/deploy lại. Cần theo dõi kết luận, nếu lỗi lặp lại điều tra HTTP/image response và không nới điều kiện decode.

**Trạng thái:** source implementation + production signed deploy + homepage/album QA DONE. Full post-image QA attempt2 và 12-run scorecard + cold/media-change measurement **PARTIAL — chưa hoàn tất**.
