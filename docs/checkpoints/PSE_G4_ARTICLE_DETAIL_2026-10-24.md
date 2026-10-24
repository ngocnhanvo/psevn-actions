# PSE trang con — checkpoint G4 (24/10/2026)

## Phạm vi

- Knowledge: `ngocnhanvo/knowledge` main (đã đọc trước khi thực hiện).
- Astro: `ngocnhanvo/psevn-astro` (`github` DEV → PR → `master` source).
- Backend: `ngocnhanvo/psevn-php` master, **không chỉnh PHP trong lượt G4 này**.
- Automation: `ngocnhanvo/psevn-actions` main.
- Chế độ: `auto-build` (chỉ build Astro thông qua WordPress/PHP Build Website).

## Hoàn tất mã nguồn

- PR #24 **đã được chủ dự án merge**: `8bc650c854b36eb357ee00e437c8cf97cde096a2`. Không chạy lại.
- Fast-forward Astro `github` về đúng merge #24 trước khi sửa G4, không force.
- G4 PR #25: https://github.com/ngocnhanvo/psevn-astro/pull/25
- PR #25 **tự merge** bằng GitHub, SHA `d9ec4edc54695b620afa963403e62a60252af22d`.
- Scope G4: bỏ các thẻ bài liên quan legacy ở chi tiết PostDetails của PSE, giữ nguyên các site/action khác; chỉ một tiêu đề H1 chính, các H1 trong CMS body thành H2 giữ nội dung/HTML; thêm thẻ `<time datetime>`.
- Files: `src/astro/pages/PostDetails.astro`, `src/lib/seo/psePostHeadings.ts`, `src/lib/seo/psePostHeadings.test.ts`.
- **CODE MERGED**; 3 kiểm tra logic helper bằng Node độc lập PASS; **không đồng nghĩa** full Astro CI hay browser PASS.

## Đã yêu cầu kiểm thử/phát hành

- Marker CI **no-build**: `psevn-actions/main` commit `46eb3cac57af49a716e9192a6c3852aba81ccead` vào `.pse-template-source-neutral-check`.
- Marker đề nghị **một build bình thường**: `psevn-actions/main` commit `405d5ed572a202489e681713a4720f9a7bf59eb5` vào `.pse-wordpress-build-request`.
- Workflow đã đọc và xác minh: `.github/workflows/pse-wordpress-build-request.yml` chạy helper `imported-eduresearch/scripts/wordpress-build-trigger-e2e.mjs` qua WordPress Admin; không gọi Astro Actions trực tiếp. Helper kiểm `build_active`, `pending_count > 0`, không có ép build. Workflow concurrency không hủy build trước.
- **Chưa lấy được run ID/kết quả CI và deploy từ GitHub connector phiên này**. Trạng thái chính xác: `CI_REQUESTED / BUILD_REQUESTED / DEPLOY_NOT_VERIFIED`; không ghi PASS hoặc deploy thành công trước log thật.

## Bước tiếp theo không được lặp

1. Kiểm tra **một** workflow hiện hữu cho CI marker và một workflow WordPress Build marker, đọc job/log. **Không gửi lại các marker này** nếu run đã khởi chạy hoặc có kết quả. Nếu PHP báo không có pending thay đổi, tôn trọng gate, không tạo CMS edit giả/không force.
2. Nếu PHP thực sự bắt đầu build và signed FTPS PASS, chạy **read-only** Playwright/G5 cho ít nhất 1 bài PSE có CMS H1, một bài có PDF/ảnh, hai viewport 1440 và 390: HTTP 200, H1=1, `<time>`, không hiển thị “Các bài viết khác”, không sidebar/tràn ngang, ảnh/PDF đúng nguồn.
3. Kiểm tra archive `/tin-tuc-su-kien`, các category có slug xác minh, liên kết SSR, canonical và redirect Joomla; không chạy lại importer/batch hoặc G2 QA đã PASS.
4. Khi có chứng cứ, cập nhật checkpoint trong FE `docs/design/PSE_2026_SUBPAGES_IMPLEMENTATION_PLAN.md` bằng run IDs và trạng thái thật. Dữ liệu Joomla parity vẫn riêng biệt.

**Không động tới queue Joomla đang chạy, không thay cấu trúc build/cache hay quyền WordPress.**

## 8. Kiểm chứng thực tế sau khi tra cứu Actions REST (24/10/2026, 09:02 UTC)

- CI lần đầu: run #40079457884 attempt 1 FAIL, 349/350 PASS. Nguyên nhân **duy nhất** là assert nguyên văn `currentPage.content = prepareArticleContentImages(...)` trong `src/lib/wordpress/articleImages.test.ts` không còn khớp cách dữ liệu được lưu vào biến `prepared`. Không phải regression xử lý ảnh.
- Đã chỉnh chính test theo luồng dữ liệu thực trên Astro `github`. CI **rerun failed jobs trên run cũ** #40079457884 attempt 2 **SUCCESS**, 350/350 PASS (77/77 test files), Astro parser PASS, không build/FTP. Không chạy lại test này khi không có code mới.
- PR #26 tự merge PASS: `b8a8d3d645e6545331a4abf85f5dd4690c7ad797`. Astro `github`/`master` đồng bộ đúng SHA.
- Build PHP qua workflow #40079788784: **FAIL có chủ đích vì WordPress idle, pending_count=0, exit code 2**. Signed preflight PASS, nhưng **không phát lệnh Astro build, không upload bản G4**. Không force/không sửa CMS giả để vượt gate.
- Bản deploy thành công gần nhất đã xác minh: run #40077565399, mã nguồn `f9c1fd9474f40e8f7ee1d3b4db1a347355f351d0`, FTPS PASS. Đây là code **trước G4** (`d9ec4ed` và `b8a8d3d`), nên **DEPLOYED_G4 = NO**, không được tuyên bố live H1/related cards đã thay.
- Read-only corporate + G3 QA #40075519363 chạy **trước** deploy #40077565399: doanh nghiệp 20/20 PASS, archive 0/12 (HTTP 404). Chưa có bằng chứng read-only G3 QA **sau** deploy mới; cần kiểm tra nhưng không tự nói PASS.
- Không gọi `fetch_commit_workflow_runs` để kết luận không có job: tool này chỉ trả **workflow run liên kết PR**, không liệt kê push runs. **Phải dùng GitHub fetch REST** `https://api.github.com/repos/ngocnhanvo/psevn-actions/actions/runs?per_page=20` rồi gọi `fetch_workflow_run_jobs` và `fetch_workflow_job_logs` theo ID. Đây là nguyên nhân phiên trước bỏ sót 2 lỗi.
- QA read-only mới chưa kích hoạt trong lượt điều tra này vì thao tác cập nhật marker workflow bị chặn ở tool. Không tìm đường vòng trái phép. Nếu tiếp tục, rà trạng thái workflow trước khi khởi tạo, tránh trùng.
- **Cửa tiếp tục phát hành G4:** chỉ khi WordPress thật sự có `pending_count>0`, dùng Build Website chính thức với lock idle, rồi xác minh signed FTPS/SSR/Playwright. Nếu không có pending, cần yêu cầu chủ dự án chỉ đạo build ngoại lệ theo Knowledge; không tự force.

**Chế độ code: auto-build.**


## G2: Xác minh liên kết menu PVFCCo-PSE (24/10/2026)

- Nguồn: 10 corporate WordPress Pages đã publish và native menu items 76985–76994 đã bind, nhưng WordPress Menu Manager vẫn giữ metadata `_esc_menu_link_type=custom`. Playwright run #40084793921 xác nhận cả Astro menu và WordPress `esc-api/v1/menus` lúc đó đều hiển thị liên kết Joomla cũ.
- Trên Actions `main`, script `scripts/pse-corporate-menu-native-binding.mjs` dùng WordPress Admin native Menu Manager, xác thực 10 item Page IDs, sau đó Save Menu có readback. Run #40085525993 PASS: saved 10, `linkMode=page`, `linkType=internal`, `menu_dirty=true`. Không sửa PHP/DB hay gán cứng URL Astro.
- WordPress PHP Build Website run #40085624269 PASS với `pending_count=1` và mode normal; Astro signed FTPS run #40085688546 PASS, source master `b8a8d3d645e6545331a4abf85f5dd4690c7ad797`; logs: WordPress Header `1 changed, wordpress`, signed unzip SUCCESS và GET homepage/API PASS.
- Kiểm thử **nhấp thật** 10 dropdown entries desktop (1440px) + mobile (390px): [Actions #40085955883](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40085955883) **20/20 PASS**, links `/<slug>`, GET HTTP 200, đúng H1 Page, không tràn ngang. Không tái chạy hoặc lưu menu/build nếu không có yêu cầu thay đổi mới.
- Hạng mục riêng ngoài yêu cầu menu này: search route `/tim-kiem` vẫn cần khắc phục regression được ghi ở checkpoint cũ; không nhầm với thành công menu/trang con.
