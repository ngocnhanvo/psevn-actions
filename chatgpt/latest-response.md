# Phản hồi mới nhất — PSE, 21/11/2026 khoảng 23:58 (Asia/Ho_Chi_Minh)

**Project:** pse.vn
**Repository:** ngocnhanvo/psevn-actions
**Branch:** main
**Checkpoint:** docs/checkpoints/PSE_SOURCE_CONTENT_PARITY_2026-11-21.md
**Status:** PARTIAL — chưa hoàn tất

## 1. Đã khôi phục đúng checkpoint PSE

Đã đọc Knowledge/main và checkpoint thực tế, khóa nguồn chính xác: knowledge/main `1b5aab9e`, psevn-astro/master `db3a9768`, psevn-php/master `05b21fb0`. Actions/main đã tiến từ `7b732c77` lên `04ebc142` sau các bước chẩn đoán, release và lưu checkpoint. Không import lại hoặc ghi đè các bài đã đồng bộ.

## 2. Kiểm tra HTTPS frontend mới nhất — PASS

Read-only GET-only production SSR/SEO run [#44926847589](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44926847589) **SUCCESS**: homepage HTTP200, `/api/user/info` HTTP200 và JSON hợp lệ, `robots.txt` HTTP200, `sitemap.xml` HTTP200 + XML hợp lệ. Trigger read-only marker commit `75bd15ac`. Đây chỉ là kiểm tra frontend HTTPS, không thay guard signed backend.

## 3. Signed production release — SUCCESS

[Official run #44923979017, attempt 3](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44923979017) đã **SUCCESS**, sau khi hai attempt trước fail-closed vì TLS. Đây là retry qua cùng workflow production; không thêm pipeline hoặc FTP thủ công. Exact source Astro/master `db3a9768`: signed unzip preflight PASS; Astro build PASS; ZIP + Python FTPS PASS; private `.env` HTTP deny PASS; `SIGNED_UNZIP_SUCCESS` kích hoạt staging an toàn; homepage / WordPress SSR / robots smoke PASS.

## 4. QA 35 icon PDF investor đã live — PASS

Gated marker `.pse-investor-pdf-postrelease-request` commit `c5bffead`, read-only [#44927155937](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44927155937) **SUCCESS**: 36 card matched từng bài WordPress, PDF source-backed 35/36: công bố thông tin 12/12; báo cáo thường niên 11/12; quản trị công ty 12/12. Một card không có PDF gốc nên giữ fallback đúng. Responsive trên 390px/1440px: 10/10 PASS, HTTP200/canonical/không tràn ngang. Astro PDF presentation **DONE, CODE+DEPLOY+QA**. Homepage utilities/search after-build [#44927116549](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44927116549) **SUCCESS**.

## 5. Tồn tại của đồng bộ toàn site

Regression 4 album [#44927116566](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44927116566) **FAILED** vì nguồn Joomla album #1053 GET Timeout 60s, chưa đủ chứng cứ kết luận sai mới. Regression 7 bài lịch sử [#44927116541](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44927116541) **FAILED** do nguồn Joomla bài #205 timeout cả 3 retry; không phải lỗi đã xác định trên Astro.

Vẫn còn 12 bài Joomla lịch sử không có đủ nguồn xác minh body/ảnh, album #975 có đủ 110/110 JPEG nhưng metadata năm 2010/2011/2013 mâu thuẫn, bốn alias Product lịch sử #1425/#1426/#1434/#1678 chưa có đích duy nhất, ảnh Tuổi Trẻ bài #225 chưa có bytes thật. Audit ảnh 758 bài WordPress mới HEAD 420 URL nội bộ PASS, còn 2.822 chưa kiểm; không báo 100% image parity.

## 6. Checkpoint đã lưu

Đã cập nhật [PSE_SOURCE_CONTENT_PARITY_2026-11-21.md](https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/checkpoints/PSE_SOURCE_CONTENT_PARITY_2026-11-21.md) tại commit [04ebc142](https://github.com/ngocnhanvo/psevn-actions/commit/04ebc142708f68062562091fdd789c175f90ad49).

Bước tiếp theo: khi có bản sao lưu cơ sở dữ liệu Joomla gốc, media/file gốc hoặc bằng chứng lưu trữ nhà xuất bản, giải quyết đúng 12 bài và album #975, xác minh 4 URL Product, sau đó import/readback/QA từng record có nguồn thật. Chỉ lặp source-side QA #205 và #1053 khi host Joomla phục hồi. Không tự đặt ngày, thêm ảnh thay thế, tạo bản ghi thử hoặc build lặp.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
