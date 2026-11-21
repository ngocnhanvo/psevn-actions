# PSE — Tin tổng hợp: parity, kết quả và dữ liệu nguồn còn thiếu (21/11/2026)

## Cập nhật 21/11/2026 20:29 VN — dữ liệu toàn site sau phục hồi

> **Đính chính phạm vi:** Bảng bên dưới là *snapshot lịch sử của riêng chuyên mục Tin tổng hợp*, không còn là danh sách toàn site mới nhất. Mục #204 trong bảng đã được khôi phục hoàn toàn và kiểm chứng HTTP 301; các mục #205/#226/#227/#229/#240 cũng đã có các đợt phục hồi thành công trong ngày. Không chạy lại importer theo danh sách cũ.

- **Baseline toàn site được xác minh:** [804 danh tính Joomla so với WordPress](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44905770735) cho thấy 757 Posts xuất bản, 53 Woo Products, 25 Pages và 15/16 album ảnh, taxonomy mismatch 0. Bài #204 đã có WP Post #83499, 3 ảnh gốc và chuyển hướng 301 native URL Joomla → canonical Astro ([QA #44906045306](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44906045306)).
- **13 bài Joomla thuộc nhiều nhóm nội dung còn chưa xuất bản:** `114, 121, 127, 178, 186, 196, 198, 202, 237, 379, 382, 341, 1090`. Nhóm này không đồng nghĩa 13 bản ghi trong bảng snapshot cũ. Đối chiếu trực tiếp `docs/checkpoints/PSE_SOURCE_CONTENT_PARITY_2026-11-21.md` trước khi sửa.
- **Bài #341:** Joomla bản live và 3 bản lưu trữ đúng URL (2024–2026) không còn `articleBody` thực (0 ký tự), vùng xung quanh có liên kết rác. [#44907801086](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44907801086) chỉ đọc, 0 bài nhập.
- **Bài #382:** 3 ảnh gốc `Áo_2.JPG`, `Ba_Lan.JPG`, `Mỏ_muối_Wieliczka_...JPG` trả lỗi ở thumbnail và full-path; 12 biến thể kiểm chỉ đọc từ Wayback CDX, 0 ảnh nguồn xác minh. [#44909006809](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44909006809) PASS phép thử, **không** có ảnh để nhập.
- **Bài #379:** WP nháp #82119 chỉ chờ bằng chứng ngày tạo/phát hành gốc, không thay ngày bằng thời điểm kiểm thử. **Bài #202:** nguồn có ngày tạo xác minh 2011-08-17, nhưng ảnh `congty.jpg` từ nhà phát hành chưa tìm được exact bytes, [#44906180285](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44906180285).
- **Album #975:** đã có 110/110 media WP nhưng 7 snapshot Joomla không có ngày xuất bản xác minh ([#44908124489](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44908124489)); không xuất bản với ngày đoán. **4 alias sản phẩm lịch sử** #1425/#1426/#1434/#1678 cần đối chiếu ngữ nghĩa với Woo Products/Category, không tự 301 về biến thể gần giống. #1434 có 19/20 ảnh exact nguồn; thumbnail nhà phát hành còn lại HTTP404 và archive không có exact capture ([#44908497036](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44908497036)).
- **Blocker tồn tại thật:** thiếu file ảnh gốc/bản sao lưu Joomla hoặc timestamp xuất bản gốc. Kiểm kê cây Git của `psevn-actions@main`, `psevn-astro@master`, `psevn-php@master` không tìm thấy backup `.sql/.zip/.tar/.gz/.7z/.rar/.bak` cho dữ liệu Joomla; nguồn WordPress Updraft là backup **WP mới**, không phải bản sao Joomla nguồn. Không tự phát minh ảnh/ngày hoặc đổi source-of-truth sang Astro.
- **Chỉ mở lại write scope khi có evidence mới:** tải bytes gốc/mapping ngày đúng source ID → sao lưu WordPress hiện tại → áp dụng idempotent native CMS → readback → SSR/Playwright parity; chỉ build/deploy production theo pipeline PSE khi có thay đổi thực và đủ quyền.

---


## Đối chiếu cuối trên production

- Nguồn Joomla: https://pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop.html
- Trang Astro SSR: https://pse.webnvn.com/tin-tuc-su-kien/tin-tong-hop
- Bằng chứng 324 bài thuộc nhánh Joomla trong `docs/pse-legacy-migration-state.json`, trong đó **311 có WordPress ID**, **13 cách ly do ảnh/tài nguyên**, **1 bản nháp WordPress chưa có ngày gốc** và **310 bài đã xuất bản vào đúng chuyên mục** (lần đối chiếu live REST #44837011865; QA Astro sau cập nhật ở #44837083584).
- Checkpoint nhập bài lưu `draft_needs_date` cho 67 bản ghi nhưng **66 đã được xuất bản thực** theo checkpoint ngày riêng và live WP. Chỉ **#379 (WP #82119)** chưa xác minh ngày. Không lấy trạng thái nhập bài cũ làm số bài đang ẩn.
- 6 bài mới được nhập với đầy đủ 24 ảnh gốc, và 6 bài WP tồn tại được bổ sung đúng chuyên mục; không chỉnh cứng Astro. Không cần Astro build vì SSR lấy WP trực tiếp.
- Bằng chứng: [kiểm kê nguồn/mapped/live #44837011865](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44837011865), [kiểm tải 24 ảnh #44835819195](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44835819195), [đồng bộ bài gốc #1363 #44835371027](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44835371027), [sửa taxonomy bài #1159 #44836727645](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44836727645).

## 13 bài chưa có bộ ảnh bắt buộc, không được bỏ ảnh để xuất bản

| Joomla ID | Hỏng khi kiểm chứng nguồn ngày 21/11 | Trang nguồn |
|---|---|---|
| 186 | images.danviet.vn: HTTP 403 | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/186-npk-phu-my-se-day-lui-hang-kem-chat-luong.html) |
| 196 | library.petrotimes.vn: DNS không phân giải | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/196-pvfcco-se-dong-hanh-cung-mua-he-xanh.html) |
| 198 | dpm.vn: HTTP 404 | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/198-nha-may-dam-phu-my-don-tan-san-pham-ure-thu-5-trieu.html) |
| 202 | baobinhphuoc.com.vn: chứng chỉ HTTPS hết hạn | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/202-hoi-thao-gioi-thieu-npk-phu-my-tai-binh-phuoc.html) |
| 204 | binhphuoc.gov.vn: từ chối kết nối | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/204-npk-phu-my-16-16-8-13s-co-mat-tai-binh-phuoc.html) |
| 205 | pse.vn: HTTP 404 | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/205-pvfcco-se-to-chuc-ngay-hoi-truyen-thong.html) |
| 226 | pse.vn: HTTP 404 | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/226-thay-doi-thiet-ke-bao-bi-50kg-urea-phu-my.html) |
| 227 | pse.vn: HTTP 404 | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/227-pvfcco-se-voi-cac-hoat-dong-chao-mung-ngay-truyen-thong-tong-cong-ty-21092004-21092011.html) |
| 229 | pse.vn: HTTP 404 | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/229-pvfcco-se-to-chuc-le-ky-niem-81-nam-ngay-phu-nu-viet-nam-2010.html) |
| 237 | dpm.vn: HTTP 404 | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/237-pvfcco-se-tang-qua-tet-cho-ho-ngheo-tai-lam-dong-va-dak-nong.html) |
| 240 | pse.vn: HTTP 404 | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/240-pvfcco-se-to-chuc-khoa-hoc-van-hoa-doanh-nghiep.html) |
| 382 | pse.vn: HTTP 404 (2 ảnh trong mẫu) | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/382-pvfcco-se-to-chuc-thanh-cong-chuyen-du-lich-chau-au-cho-khach-hang-tieu-bieu-cua-cong-ty.html) |
| 1090 | dpm.vn: HTTP 404 | [Joomla](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/1090-pvfcco-to-chuc-thanh-cong-chuong-trinh-hoi-mua-phu-my-va-cham-soc-khach-hang-khu-vuc-tay-nguyen.html) |

Các URL/media này đã được kiểm tra bằng Playwright và HEAD/GET ở [run #44833855640](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44833855640); 7 ảnh tiêu biểu tra Wayback không thấy snapshot usable ở [run #44835575094](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44835575094). Cần file **ảnh gốc có nguồn gốc được xác minh**, bản sao lưu Joomla hoặc media archive phù hợp để tiếp tục. Không thay ảnh tương tự/placeholder, không bỏ tài nguyên chỉ để xuất bản.

## 1 bài thiếu ngày tạo được chứng minh

- Joomla #379: [PVFCCo SE tổ chức thăm quan Phòng truyền thống PVFCCo](https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/379-pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco.html), WP nháp #82119.
- Date checkpoint: `review`, `attempts=2`, `No exact Joomla ID/title created day evidence`. Nguồn Joomla com_search không xác minh được ngày; không được gán ngày ước đoán hoặc xuất bản nháp bằng ngày hiện tại. Tham chiếu [date backfill #44781587195](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44781587195).

## Điều kiện đóng toàn bộ parity

1. Chủ sở hữu cung cấp bộ ảnh gốc/backup được xác minh cho 13 bài (đủ 100% ảnh và tài liệu cần thiết), hoặc nguồn truy xuất lại được chính các file gốc.
2. Tìm được ngày tạo chính xác cho bài #379 từ Joomla hoặc bản backup có bằng chứng.
3. Import các mục còn thiếu vào WordPress theo chuỗi backup → source read → write tối thiểu → read-back; đối chiếu đủ 324 danh tính bài, văn bản, ảnh/tài liệu và ngày, test Astro SSR + mobile.
4. Chỉ khi các bước này PASS mới ghi `SOURCE_TO_TARGET_PARITY_PASS` và `Trạng thái: DONE`.

Trạng thái nguồn → WordPress: **PARTIAL, cần dữ liệu gốc không còn truy xuất được**.
