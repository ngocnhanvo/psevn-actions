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
