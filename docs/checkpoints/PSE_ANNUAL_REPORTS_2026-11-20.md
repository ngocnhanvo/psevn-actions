# CHỐT NGHIỆM THU — 18/18 Báo cáo thường niên PSE, 20/11/2026

> **FINAL: SOURCE → WORDPRESS → ASTRO SSR PARITY PASS, SEO TITLE PASS, DESKTOP/MOBILE PASS.** Các đoạn “PARTIAL”, “đang chạy”, 15/18 hoặc 16/18 ở bên dưới là **lịch sử các lượt sửa trước**, không phải trạng thái hiện tại. Không chạy lại các importer/media restoration đã PASS.

## Chốt bằng chứng nghiệm thu cuối

- **18/18 bài:** Joomla danh mục `https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-thuong-nien.html` có 18 ID nguồn, 16 bài ở trang 1, 2 bài trang 2. Tất cả 18 được xuất bản dưới WordPress category **1758** (parent **1744**) và hiển thị trên Astro SSR `https://pse.webnvn.com/tin-tuc-su-kien/bao-cao-thuong-nien`. **0 thiếu bài, 0 sai ID/slug/category/thứ tự**, số lượng SSR chính xác 12 bài trang 1 + 6 bài trang 2.
- **Thứ tự, ngày:** plugin PHP `psevn-php/master: wp-content/mu-plugins/pse-annual-source-order.php` sử dụng metadata rank của Joomla scoped riêng cho REST danh mục 1758, giữ ngày WordPress hiện có. [Run #44738204708](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44738204708): `PASS_SOURCE_18`, `ranked=18`, `missing=[]`, `changedDates=0`; trực tiếp đọc lại 12+6 card, HTTP 200.
- **Tập ảnh 2008 và 2010:** Joomla source **94 + 130 = 224 JPG**. WordPress phục hồi lần lượt #998 → Post **82794**, #1000 → Post **82796**. Từng ảnh mới/ảnh tìm lại từ lần lỗi được kiểm tra SHA-256 theo dữ liệu nguồn trước khi lưu vào checkpoint. [Run #44737782684](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44737782684): `PASS`, `mediaCreated=1`, `mediaReused=223` trong lượt chốt, `remaining=[]`, `errors=[]`, hai Post xuất bản, Astro 200. Các Media đã upload các lượt trước được dùng lại; không xóa/nhập trùng. 2008 có 94/94 ảnh; 2010 có 130/130 ảnh. WordPress bài viết dùng thư viện ảnh đã loại bỏ Joomla JavaScript/spam.
- **Báo cáo 2014:** Joomla #1092 có đường dẫn `/images/web/news/qhcd/ThongTinCongBo/BCTN2014` trả HTTP 404. Bản PDF Báo cáo thường niên PSE 2014 công bố HNX, lưu ở CafeF, **6.637.821 bytes**, đã nhập dưới WordPress Media **82776**, Post **82777** và gắn thông báo nguồn thay thế. SHA256 file local bằng bản HNX/CafeF; **không khẳng định trùng byte với tài liệu gốc bị thất lạc**. [Run #44735517705](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44735517705): `PASS`, bản PDF qua Astro `/api/files` HTTP 200. Bài có source-created Joomla day **2015-03-16**.
- **SEO Yoast title:** **18/18** giá trị chính xác như `<title>` Joomla; 15 bài gốc được điền từ trường trống, ba bài mới có metadata nguồn. [Run #44731016486](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44731016486) đã backup DB mới và readback 15/15; [final QA #44738556190](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44738556190) xác minh 18/18. **0 SEO meta description tự bịa trong 3 bài mới;** không ghi đè mô tả SEO đích của bài cũ khi nguồn thiếu.
- **SSR / responsive:** [final QA độc lập, chỉ đọc #44738556190](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44738556190), artifact `pse-annual-18-final-independent-parity` ID **14629497526**: `PASS_18_SOURCE_PARITY`, `original=18`, `wordpress=18`, `yoast=18`, `ranked=18`, `errors=[]`. Trang danh mục trang 1/2 và bài 2008/2010/2014 đều **HTTP 200**, chạy trên **desktop 1366×768** và **mobile 390×844**, **0 tràn ngang**; bài 2008/2010 trả đúng số ảnh, ảnh thật đầu tiên tải được trên hai kích cỡ, tài liệu 2014 PDF đọc được. Không có link ảnh/PDF còn hotlink Joomla, không có nội dung spam/JavaScript cũ; không phát hiện ảnh lỗi trong phạm vi QA. Không tuyên bố pixel-perfect so với layout Joomla.
- **An toàn:** nhiều bản sao lưu DB-only UpdraftPlus có xác nhận; 18 bài có ID, slug và ngày giữ nguyên theo bằng chứng, ngoại lệ các bài mới dùng Joomla com_search ngày *created*, không gán ngày theo năm báo cáo. Các lỗi cũ `Invalid URL` và `ECONNRESET` đã khắc phục bằng chuẩn hóa đường dẫn Media, tra cứu chính xác và retry GET; **không lặp importer đã hoàn tất**. Source ở `psevn-actions/main` và `psevn-php/master`, không cần deploy/build Astro vì SSR đọc WordPress.

## Chốt trạng thái

**COMPLETE — 18/18 Báo cáo thường niên gốc đối chiếu xong; 224/224 JPG; PDF HNX/CafeF 2014 có ghi rõ nguồn thay thế; 18/18 SEO title; SSR / responsive PASS.**

Chế độ code: auto-build · Cổng ghi source: bypass.

---

# CẬP NHẬT TIẾP TỤC — Báo cáo thường niên PSE, 20/11/2026

> **CHƯA HOÀN TẤT — 16/18 bài, còn hai booklet 2008 và 2010 đang nhập.** Không nhầm kết quả QA 16/18 với nghiệm thu cuối. Phần ghi nhận bên dưới là checkpoint lịch sử.

- **2014 hoàn tất:** [run #44735517705](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44735517705) PASS: Post **82777**, PDF WordPress Media **82776**, **6.637.821 bytes**, mirror HNX/CafeF, SHA-256 readback và public SSR PASS. Joomla gốc file 404, bài mới công khai nguồn mirror và *không nhận trùng byte* với file gốc đã mất. WordPress category lúc này **16/18**.
- **Ảnh 2008/2010, lượt đầu:** [run #44732363469](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44732363469) PARTIAL vì API Media trả đường dẫn **tương đối** `/wp-content/uploads/...`, kiểm tra cũ dùng `new URL(path)` nên lỗi `Invalid URL` dù WordPress đã nhận nhiều ảnh. Số media ghi nhận trong checkpoint cũ 0 không có nghĩa server không có file. Read-only [run #44735231273](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44735231273) xác nhận các ảnh đầu/cuối cả hai báo cáo đã lưu ở WP, chẳng hạn 2008 IDs **82568**, **82654** và 2010 IDs **82655**, **82775**.
- **Fix idempotency:** `scripts/pse-annual-early-booklet-import.mjs` chuẩn hóa Media URL tương đối bằng origin WordPress; tra cứu exact filename, kiểm SHA theo bytes nguồn trước khi tái sử dụng, không upload trùng. Bài nháp tra bằng `wp_id` trong checkpoint, tránh REST status unsupported. [Lượt nhập lại #44735533454](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44735533454) đang chạy.
- **Thứ tự 16 bài:** PHP order v2 đã triển khai, [run #44735804845](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44735804845) xác nhận `PASS_PUBLISHED_SUBSET`, 12+4 bài, ngày đăng không sửa; workflow kết thúc failure **đúng chủ ý** do yêu cầu chốt cuối phải đủ 18. Workflow v2 đã được đổi trigger theo kết quả **importer 2008/2010**, không theo 2014, để rank 18 và QA cuối sau khi đủ nội dung.
- Các bước SEO 15/15 và thứ tự 15 bài ban đầu đã PASS, **không chạy lại**. Không build Astro vì SSR đọc WordPress trực tiếp.

**Trạng thái: PARTIAL — đang đợi importer 2008/2010 hoàn thành; chỉ chốt FINAL khi QA 18/18 PASS.**

---

# PSE Báo cáo thường niên — đồng bộ 20/11/2026

## Quy tắc và dữ liệu nguồn
- Quy tắc: `ngocnhanvo/knowledge/main`, đọc `AGENTS.md`, `core/01..08`, `stacks/wordpress-content-migration.md`, `stacks/source-target-parity-migration.md`.
- Joomla: `https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-thuong-nien.html`.
- Astro SSR: `https://pse.webnvn.com/tin-tuc-su-kien/bao-cao-thuong-nien`.
- WordPress danh mục `1758`, parent `1744`, slug `bao-cao-thuong-nien`.
- Kiểm kê độc lập [run #44729950280](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44729950280): **18 bài gốc**, Joomla trang 1 có 16 bài và trang 2 có 2 bài. ID gốc đúng thứ tự: `1667,1625,1578,1546,1511,1412,1386,1353,1307,1259,1188,1092,1043,1042,1041,1000,999,998`. Web mới ban đầu xuất bản 15/18. Thiếu `998` (2008), `1000` (2010), `1092` (2014). Các bài đã xuất bản giữ nguyên nguồn, ID, slug, ngày và tài liệu.
- Trạng thái nguồn/Media/cursor chính: `docs/pse-legacy-migration-state.json`; tuyệt đối không thay đổi bằng nhiều writer song song.

## Đã hoàn tất và đối chứng
- **SEO 15/15 bài đã có**: lấy đúng `<title>` Joomla; 15 giá trị Yoast trước đó rỗng, không ghi đè SEO title của người biên tập, không sửa nội dung/ngày/slug, giữ các SEO descriptions đang có tại WordPress. UpdraftPlus fresh DB backup + readback 15/15 PASS tại [run #44731016486](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44731016486).
- **Thứ tự gốc cho 15 bài**: plugin riêng `psevn-php/master: wp-content/mu-plugins/pse-annual-source-order.php`, chỉ áp dụng REST posts cho danh mục 1758, thứ tự rank metadata từ Joomla, không thay đổi publication date; triển khai PHP hash/readback/DB backup + kiểm tra SSR PASS tại [run #44731649785](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44731649785).
- **Ngày tạo Joomla**: [run #44731533087](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44731533087) xác nhận `998=2013-12-11`, `1000=2013-12-11`, `1092=2015-03-16` từ com_search cùng ID và title. `1041=2014-06-18`, `1546=2023-03-18` xác minh ở [run #44730583187](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44730583187). Đây là ngày **created** Joomla, không bịa ngày năm báo cáo.
- **2012/2013/2015/2016**: 117 ảnh báo cáo + PDF 2016 từ đợt 27/10; QA desktop/mobile PASS 8/8 tại [run #40516129326](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40516129326).
- **2008/2010 nguồn:** 2008 có đúng 94 ảnh JPG/8,624,041 byte; 2010 có đúng 130 JPG/16,277,969 byte HEAD thành công cho 127, 3 HEAD lỗi kết nối ECONNRESET tạm thời; nguồn 130 URL không bị mất. Danh mục nguồn [run #44731405301](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44731405301). Công cụ nhập sẽ GET nội dung, kiểm tra JPEG binary, upload WP, readback SHA256; không coi socket reset là mất file.
- **2014:** Joomla còn thông báo nhưng file gốc `/images/web/news/qhcd/ThongTinCongBo/BCTN2014` trả 404. Đã xác định bản PSE Báo cáo thường niên 2014 PDF 31 trang công bố HNX ngày 18/03/2015, mirror CafeF `https://cafefnew.mediacdn.vn/download/180315/PSE_2015.3.18_9a1940e_18-_BCTN_2014.pdf`; **không được tuyên bố trùng binary** với file Joomla mất; nội dung WordPress mới phải ghi rõ đây là bản thay thế có nguồn độc lập.

## Quy trình bổ sung đang thực thi (không nhập trùng)
1. [run #44732363469](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44732363469): `scripts/pse-annual-early-booklet-import.mjs`, Updraft backup, import 224 ảnh thật (94+130) theo từng file có SHA readback, lưu state mỗi file, chỉ xuất bản khi tất cả trang ảnh tương ứng đã nhập. **Trạng thái kiểm tra cuối: in_progress; chưa thể đánh dấu PASS**.
2. [run #44732515147](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44732515147): `scripts/pse-annual-2014-hnx-restore.mjs`, xếp sau importer nhờ cùng concurrency group; kiểm chứng Joomla HTTP404, file HNX PDF, tải về WordPress, SHA readback, tạo WP bài 2014 và ghi nguồn. **Trạng thái cuối: pending, chưa thể đánh dấu PASS**.
3. `.github/workflows/pse-annual-source-order-v2.yml`: tự chạy sau workflow 2014 PASS; cập nhật plugin thứ tự từ 15 sang 18, giữ nguyên ngày xuất bản, so sánh REST ranks 18 với Joomla và SSR archive trang 1/2; hỗ trợ 15–18 báo cáo để các bài nhập thêm không làm mất xếp hạng. `psevn-php/master` plugin v2 commit `4ae5b4f6eddd366cb71957d6eb476bb51f25728d`; deploy dùng SHA-pinned rollback FTPS `scripts/pse-annual-order-ftps-v2.py`.
4. `.github/workflows/pse-annual-18-final-qa.yml`: tự kiểm tra sau workflow xếp thứ tự đủ 18 thành công; các tiêu chí gốc/đích 18, SEO title 18, local JPG 224, PDF thay thế 2014 có nguồn, thứ tự 18, 12+6 bài SSR, desktop và mobile, không có hotlink Joomla/spam.

## Chốt phạm vi
- Không rebuild Astro vì danh mục này SSR trực tiếp từ WordPress.
- Không xóa dữ liệu cũ hay PDF/JPG gốc, không sao chép Joomla JavaScript hoặc spam.
- Nếu một nguồn file bị lỗi/thiếu bytes, giữ bản nháp và checkpoint, chạy lại chỉ media còn thiếu. Không xuất bản báo cáo còn thiếu trang.
- **Trạng thái lúc ghi checkpoint: PARTIAL — đang nhập đủ 3 báo cáo thiếu**. Khi các run PASS cần bổ sung hash, ID WordPress, QA độc lập vào đây; không ghi DONE trước bằng chứng.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
