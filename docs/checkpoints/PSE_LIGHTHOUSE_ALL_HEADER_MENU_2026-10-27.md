# PSE — Lighthouse toàn bộ Header Menu (2026-10-27)
## Phạm vi / kết quả
- **Nguồn URL:** các liên kết trên Header desktop/mobile của frontend `https://pse.webnvn.com/trang-chu` (78 anchor DOM, **39 đường dẫn duy nhất**), KHÔNG crawl trang chi tiết bài viết bên trong các trang menu, không đo PDF/file download hoặc website ngoài.
- **Đã đo đủ:** 39 URL × mobile + desktop = **78/78 kết quả**; Chrome trong container Playwright, Lighthouse **13.0.1**, mỗi phép đo một lần thành công (ngoại trừ 3 phép đo phải retry do NO_NAVSTART).
- **Chỉ đọc:** không sửa CMS, không build/deploy, không can thiệp cache/SEO; điểm Performance có thể dao động theo thời điểm/runner.
- **Workflow gốc:** [40542508873](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40542508873). Có 75 đo thành công và 3 lỗi trace tạm thời làm kết luận workflow failure.
- **Retry chỉ 3 phép đo lỗi:** [40543523329](https://github.com/ngocnhanvo/psevn-actions/actions/runs/40543523329) thành công 3/3; không lặp lại 75 phép đo PASS.

## Thống kê
- **mobile:** 39 URL; trung bình P 97.4, A 99.3, BP 100.0, SEO 98.6; dưới 90 Performance: không có.
- **desktop:** 39 URL; trung bình P 96.9, A 99.3, BP 100.0, SEO 98.6; dưới 90 Performance: /so-do-to-chuc (88).

## 39 trang — bảng điểm 4 nhóm
**Thứ tự trong mỗi cột điểm:** Performance / Accessibility / Best Practices / SEO (0–100). **M** = Mobile, **D** = Desktop.

| # | Trang trong Header | Mobile (P/A/BP/SEO) | Desktop (P/A/BP/SEO) | Vấn đề cần chú ý |
|---:|---|---|---|---|
| 1 | [TRANG CHỦ](https://pse.webnvn.com/trang-chu) | 99 / 100 / 100 / 100 | 98 / 100 / 100 / 100 | — |
| 2 | [Ban Giám Đốc](https://pse.webnvn.com/ban-giam-doc) | 99 / 96 / 100 / 100 | 99 / 96 / 100 / 100 | Tương phản chữ |
| 3 | [Ban kiểm soát](https://pse.webnvn.com/ban-kiem-soat) | 100 / 96 / 100 / 100 | 100 / 96 / 100 / 100 | Tương phản chữ |
| 4 | [Định hướng phát triển](https://pse.webnvn.com/dinh-huong-phat-trien) | 99 / 97 / 100 / 100 | 99 / 97 / 100 / 100 | Tương phản chữ; Thiếu tiêu đề bảng |
| 5 | [Đường dây nóng](https://pse.webnvn.com/duong-day-nong) | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 | — |
| 6 | [Hỏi đáp](https://pse.webnvn.com/hoi-dap) | 99 / 100 / 100 / 100 | 100 / 100 / 100 / 100 | — |
| 7 | [Hội đồng quản trị](https://pse.webnvn.com/hoi-dong-quan-tri) | 100 / 96 / 100 / 100 | 100 / 96 / 100 / 100 | Tương phản chữ |
| 8 | [Kênh phân phối](https://pse.webnvn.com/kenh-phan-phoi) | 99 / 100 / 100 / 100 | 99 / 100 / 100 / 100 | — |
| 9 | [LIÊN HỆ](https://pse.webnvn.com/lien-he) | 99 / 96 / 100 / 100 | 90 / 96 / 100 / 100 | Tương phản chữ |
| 10 | [Ngành nghề kinh doanh](https://pse.webnvn.com/nganh-nghe-kinh-doanh) | 100 / 100 / 100 / 100 | 99 / 100 / 100 / 100 | — |
| 11 | [Quá trình hình thành – phát triển](https://pse.webnvn.com/qua-trinh-hinh-thanh-phat-trien) | 100 / 100 / 100 / 100 | 95 / 100 / 100 / 100 | — |
| 12 | [Đạm Phú Mỹ](https://pse.webnvn.com/san-pham/dam-phu-my) | 100 / 100 / 100 / 92 | 100 / 100 / 100 / 92 | Thiếu mô tả SEO |
| 13 | [Hữu cơ Phú Mỹ](https://pse.webnvn.com/san-pham/huu-co-phu-my) | 98 / 100 / 100 / 92 | 100 / 100 / 100 / 92 | Thiếu mô tả SEO |
| 14 | [Nhóm phân đơn và phân phức hợp Phú Mỹ](https://pse.webnvn.com/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my) | 100 / 100 / 100 / 92 | 99 / 100 / 100 / 92 | Thiếu mô tả SEO |
| 15 | [Nhóm phân hỗn hợp NPK Phú Mỹ](https://pse.webnvn.com/san-pham/nhom-phan-hon-hop-npk-phu-my) | 99 / 100 / 100 / 92 | 99 / 100 / 100 / 92 | Thiếu mô tả SEO |
| 16 | [Nhóm sản phẩm ure nguyên liệu cho sản xuất công nghiệp](https://pse.webnvn.com/san-pham/nhom-san-pham-ure-nguyen-lieu-cho-san-xuat-cong-nghiep) | 99 / 100 / 100 / 92 | 100 / 100 / 100 / 92 | Thiếu mô tả SEO |
| 17 | [Phân bón sinh học](https://pse.webnvn.com/san-pham/phan-bon-sinh-hoc) | 100 / 100 / 100 / 92 | 100 / 100 / 100 / 92 | Thiếu mô tả SEO |
| 18 | [Sơ đồ tổ chức](https://pse.webnvn.com/so-do-to-chuc) | 99 / 100 / 100 / 92 | 88 / 100 / 100 / 92 | Thiếu mô tả SEO; Performance thấp / CLS |
| 19 | [Hướng dẫn sử dụng phân bón](https://pse.webnvn.com/tai-lieu-huong-dan-su-dung-phan-bon) | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 | — |
| 20 | [Tầm nhìn, sứ mệnh](https://pse.webnvn.com/tam-nhin-su-menh) | 99 / 98 / 100 / 100 | 99 / 98 / 100 / 100 | Thứ tự heading |
| 21 | [Thành tựu](https://pse.webnvn.com/thanh-tuu) | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 | — |
| 22 | [Thông điệp](https://pse.webnvn.com/thong-diep) | 99 / 100 / 100 / 100 | 99 / 100 / 100 / 100 | — |
| 23 | [Thông tin tài chính](https://pse.webnvn.com/thong-tin-tai-chinh) | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 | — |
| 24 | [Ảnh](https://pse.webnvn.com/tin-tuc-su-kien/anh) | 93 / 100 / 100 / 100 | 93 / 100 / 100 / 100 | — |
| 25 | [Bản công bố thông tin](https://pse.webnvn.com/tin-tuc-su-kien/ban-cong-bo-thong-tin) | 95 / 100 / 100 / 100 | 95 / 100 / 100 / 100 | — |
| 26 | [Báo cáo tài chính](https://pse.webnvn.com/tin-tuc-su-kien/bao-cao-tai-chinh) | 94 / 100 / 100 / 100 | 94 / 100 / 100 / 100 | — |
| 27 | [Báo cáo thường niên](https://pse.webnvn.com/tin-tuc-su-kien/bao-cao-thuong-nien) | 95 / 100 / 100 / 100 | 95 / 100 / 100 / 100 | — |
| 28 | [Đảng ủy](https://pse.webnvn.com/tin-tuc-su-kien/dang-uy) | 93 / 100 / 100 / 100 | 94 / 100 / 100 / 100 | — |
| 29 | [Hoạt động Chi bộ – HĐQT – BKS](https://pse.webnvn.com/tin-tuc-su-kien/hoat-dong-chi-bo-hdqt-bks) | 93 / 100 / 100 / 100 | 94 / 100 / 100 / 100 | — |
| 30 | [Hoạt động Công đoàn – Đoàn TN – Nữ công](https://pse.webnvn.com/tin-tuc-su-kien/hoat-dong-cong-doan-doan-tn-nu-cong) | 92 / 100 / 100 / 100 | 93 / 100 / 100 / 100 | — |
| 31 | [Hướng dẫn sử dụng phân bón](https://pse.webnvn.com/tin-tuc-su-kien/huong-dan-su-dung-phan-bon) | 96 / 100 / 100 / 100 | 95 / 100 / 100 / 100 | — |
| 32 | [Phân biệt và chọn mua phân bón](https://pse.webnvn.com/tin-tuc-su-kien/phan-biet-va-chon-mua-phan-bon) | 95 / 100 / 100 / 100 | 95 / 100 / 100 / 100 | — |
| 33 | [Tài liệu quản trị công ty](https://pse.webnvn.com/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty) | 96 / 100 / 100 / 100 | 95 / 100 / 100 / 100 | — |
| 34 | [Tất cả](https://pse.webnvn.com/tin-tuc-su-kien/thong-tin-co-dong) | 94 / 100 / 100 / 100 | 94 / 100 / 100 / 100 | — |
| 35 | [Thông tin Quản trị](https://pse.webnvn.com/tin-tuc-su-kien/thong-tin-quan-tri) | 95 / 100 / 100 / 100 | 95 / 100 / 100 / 100 | — |
| 36 | [Thông tin thị trường](https://pse.webnvn.com/tin-tuc-su-kien/thong-tin-thi-truong) | 94 / 100 / 100 / 100 | 95 / 100 / 100 / 100 | — |
| 37 | [Tin tổng hợp](https://pse.webnvn.com/tin-tuc-su-kien/tin-tong-hop) | 93 / 100 / 100 / 100 | 94 / 100 / 100 / 100 | — |
| 38 | [Video](https://pse.webnvn.com/tin-tuc-su-kien/video) | 96 / 100 / 100 / 100 | 95 / 100 / 100 / 100 | — |
| 39 | [Xử lý khiếu nại - Ý kiến khách hàng](https://pse.webnvn.com/xu-ly-khieu-nai-y-kien-khach-hang) | 99 / 93 / 100 / 100 | 99 / 93 / 100 / 100 | ARIA sai; Tương phản chữ |

## Các phát hiện có thể xử lý
- **Meta description thiếu:** 7 trang — /san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my, /san-pham/nhom-phan-hon-hop-npk-phu-my, /san-pham/nhom-san-pham-ure-nguyen-lieu-cho-san-xuat-cong-nghiep, /san-pham/phan-bon-sinh-hoc, /san-pham/dam-phu-my, /so-do-to-chuc, /san-pham/huu-co-phu-my.
- **Tương phản văn bản không đạt:** 6 trang — /ban-giam-doc, /ban-kiem-soat, /lien-he, /dinh-huong-phat-trien, /xu-ly-khieu-nai-y-kien-khach-hang, /hoi-dong-quan-tri.
- **ARIA không hợp lệ:** 1 trang — /xu-ly-khieu-nai-y-kien-khach-hang.
- **Thứ tự heading chưa đúng:** 1 trang — /tam-nhin-su-menh.
- **Thiếu header cho bảng:** 1 trang — /dinh-huong-phat-trien.
- **Performance thấp nhất:** `/so-do-to-chuc` desktop P=88, CLS≈0.225; cần đánh giá bằng nhiều lần đo và kiểm tra dịch chuyển layout thực tế trước khi can thiệp.
- **Best Practices:** tất cả kết quả được đo đạt 100.
- **Các cảnh báo khác:** bf-cache có thể xuất hiện trong failed binary audit nhưng không phải mặc nhiên lỗi Accessibility có trọng số.

## Theo dõi
- Tập trung xử lý metadata SEO tại nguồn CMS/template chính xác; sửa contrast/ARIA/heading/bảng ở đúng component và kiểm tra sau thay đổi, không hack Lighthouse.
- Không khởi động Astro build từ Actions. Mọi build/deploy frontend chỉ được khởi phát từ WordPress/PHP Build Website theo mode `auto-build`.
- CSV/JSON và danh sách URL của 6 shard nằm trong Artifacts của workflow gốc (14 ngày); 3 retry nằm trong Artifacts workflow retry.
- **CODE MODE:** auto-build. **Trạng thái:** AUDIT_COMPLETE 78/78; READ_ONLY; không yêu cầu fix/deploy trong nhiệm vụ này.
