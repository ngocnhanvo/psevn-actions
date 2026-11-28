# PSE — WordPress Post `origin_page_id` census (2026-11-28)

## Read-only production evidence

- Audit run: https://github.com/ngocnhanvo/psevn-actions/actions/runs/46097644036 — **SUCCESS**.
- Examined WordPress native Post records via authenticated `/wp-json/wp/v2/posts?context=edit&status=any`, all 8 pages, **792/792 returned**. `trash` is empty. ACF field `origin_page_id` present in **792/792**. Every returned Post has `status=publish`.
- **744** posts have empty `origin_page_id`, including **4** represented as empty ACF arrays in REST.
- **48** posts have nonempty, numeric `origin_page_id` values. All **48** are VI (`product_lang=vi`), published, without a separate `pse_joomla_source_id`. Their `origin_page_id` points to an ID that is **404 as both a WordPress Post and Page** using authenticated REST. No valid WordPress parent was found among these 48.
- Interpretation: **48 high-confidence misused-origin candidates**, consistent with Joomla source IDs erroneously assigned as WordPress translation parents. Confirmation of the exact Joomla source row is advisable before any write. They are hidden from the root-only WordPress Admin list filter.
- **NO CMS writes, NO deploy, NO build**, and no content or metadata was modified by this audit.

## Suspected original Posts with invalid translation-parent IDs

| WP Post | `origin_page_id` | Title (original VI) | WordPress admin edit |
| ---: | ---: | --- | --- |
| 83318 | 980 | Công trình DTN kho chứa Đồng Nai | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83318&action=edit) |
| 83136 | 990 | Đại hội chi đoàn 2010 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83136&action=edit) |
| 83036 | 1053 | Ngày Hội Truyền Thống 2014 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83036&action=edit) |
| 82865 | 989 | Hội đồng cổ đông, lễ ra mắt và đón nhận ISO | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=82865&action=edit) |
| 83696 | 1741 | Phú Mỹ Đông Nam Bộ tổ chức Lễ công bố và trao quyết định về công tác cán bộ | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83696&action=edit) |
| 83698 | 1739 | PHÚ MỸ ĐÔNG NAM BỘ: MỘT NGÀY THỨ BẢY ĐẦY Ý NGHĨA | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83698&action=edit) |
| 81628 | 985 | Hình ảnh Marketing 2010 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=81628&action=edit) |
| 81296 | 988 | Đoàn thanh niên 2011 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=81296&action=edit) |
| 81175 | 986 | Hội thảo tổng kết vườn thực nghiệm ngày 3/6/2013 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=81175&action=edit) |
| 81137 | 993 | Ngày truyền thống | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=81137&action=edit) |
| 81124 | 997 | Trường Sa | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=81124&action=edit) |
| 81115 | 996 | Học văn hóa doanh nghiệp | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=81115&action=edit) |
| 81106 | 992 | Mẫu bao bì | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=81106&action=edit) |
| 81102 | 987 | Khai trương cửa hàng ngày 3/6 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=81102&action=edit) |
| 81090 | 991 | Ngày Hội Truyền Thống 2011 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=81090&action=edit) |
| 81077 | 995 | Phụ nữ Việt Nam | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=81077&action=edit) |
| 81064 | 994 | Nhà đại đoàn kết | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=81064&action=edit) |
| 83794 | 1657 | Phú Mỹ Đông Nam Bộ tổ chức thành công Đại hội Đại biểu Công đoàn lần thứ VI, nhiệm kỳ 2025 – 2030 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83794&action=edit) |
| 83796 | 1644 | Trồng rừng giữ nước mùa mưa | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83796&action=edit) |
| 83798 | 1643 | Chào mừng Ngày Quốc tế Thiếu nhi 01/06/2025 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83798&action=edit) |
| 83471 | 1640 | Những giai điệu đẹp về Đông Nam Bộ | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83471&action=edit) |
| 83800 | 1633 | Trương Thanh Lương: Người “gieo” niềm tin trên vùng đất đỏ Tây Nguyên | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83800&action=edit) |
| 83802 | 1632 | Gặp mặt khách hàng kinh doanh Phân bón Phú Mỹ tiêu biểu khu vực Lâm Đồng năm 2025 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83802&action=edit) |
| 83804 | 1607 | Chương trình “Xuân yêu thương-Tết sẻ chia” tại Đắk Mil | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83804&action=edit) |
| 83806 | 1605 | Di Linh :Trao tặng 150 phần quà Tết cho người dân xã Sơn Điền | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83806&action=edit) |
| 83808 | 1589 | PVFCCo-PSE tổ chức chương trình “Bữa cơm Công đoàn” | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83808&action=edit) |
| 83810 | 1588 | PVFCCo-PSE: Chuỗi hoạt động ý nghĩa kỷ niệm 16 năm thành lập Công ty (18/08/2008 – 18/08/2024) | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83810&action=edit) |
| 83812 | 1569 | PVFCCo-PSE tổ chức các hoạt động kỷ niệm Ngày Phụ nữ Việt Nam 20/10 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83812&action=edit) |
| 83814 | 1557 | PVFCCo-PSE tổ chức thành công phiên họp Đại hội đồng cổ đông thường niên năm 2023 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83814&action=edit) |
| 83816 | 1538 | Phân bón Phú Mỹ ra mắt dòng sản phẩm chuyên dùng cho nông nghiệp đô thị | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83816&action=edit) |
| 83818 | 1530 | PVFCCo SE: Nhiều hoạt động ý nghĩa kỷ niệm 14 năm thành lập Công ty (18/8/2008 – 18/8/2022) | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83818&action=edit) |
| 83820 | 1517 | PVFCCo SE tổ chức Hội nghị Gặp mặt khách hàng kinh doanh phân bón Phú Mỹ năm 2022. | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83820&action=edit) |
| 83822 | 1494 | PVFCCo SE tổ chức Hội nghị tổng kết công tác Đảng, hoạt động kinh doanh năm 2021, triển khai kế hoạch công tác năm 2022 và Hội nghị người lao động năm 2022 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83822&action=edit) |
| 83480 | 1085 | PVFCCo SE thông báo về ngày đăng ký cuối cùng để thực hiện quyền tham dự Đại hội đồng cổ đông thường niên 2015 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83480&action=edit) |
| 83489 | 370 | Triển vọng cây mắc ca | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83489&action=edit) |
| 83486 | 348 | Phân bón giả hại nhà nông | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83486&action=edit) |
| 83483 | 344 | Vì sao măng cụt ra trái cách năm? | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83483&action=edit) |
| 83476 | 338 | PVFCCo SE chốt danh sách cổ đông để thực hiện quyền tham dự Đại hội đồng cổ đông thường niên 2013 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83476&action=edit) |
| 83438 | 321 | Đoàn Thanh niên PVFCCo SE tham gia cuộc thi tìm hiểu về biển đảo | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83438&action=edit) |
| 83436 | 240 | PVFCCo-SE tổ chức khóa học Văn hóa Doanh nghiệp | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83436&action=edit) |
| 83434 | 230 | Chi đoàn PVFCCo-SE với Chương trình “Mỗi tin nhắn, một viên đá xây Trường Sa” | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83434&action=edit) |
| 83442 | 229 | PVFCCo-SE: Tổ chức Lễ kỷ niệm 81 năm Ngày Phụ nữ Việt Nam 20/10 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83442&action=edit) |
| 83440 | 227 | PVFCCo-SE với các hoạt động chào mừng Ngày truyền thống Tổng Công ty (21/09/2004 – 21/09/2011) | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83440&action=edit) |
| 83432 | 226 | Thay đổi thiết kế bao bì 50kg Urea Phú Mỹ | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83432&action=edit) |
| 83430 | 205 | PVFCCO-SE tổ chức Ngày hội truyền thống | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83430&action=edit) |
| 83499 | 204 | NPK Phú Mỹ (16-16-8-13S) có mặt tại Bình Phước | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83499&action=edit) |
| 83516 | 198 | Nhà máy Đạm Phú Mỹ đón tấn sản phẩm urê thứ 5 triệu | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83516&action=edit) |
| 83638 | 975 | Đại hội công đoàn nhiệm kỳ II 10/2013 | [Open](https://admin-pse.webnvn.com/wp-admin/post.php?post=83638&action=edit) |

## Recommended repair guardrails (not executed)

1. Confirm each historical `origin_page_id` against the independent Joomla content ID/alias and title; do not overwrite real WordPress translation links.
2. Take an independent DB-only backup; use an allowlist of these 48 exact WordPress Post IDs and read-before-write checks for title, locale, status and current `origin_page_id`.
3. Transfer confirmed Joomla IDs to immutable `pse_joomla_source_id`; remove only their misused `origin_page_id` metadata or set it to a genuinely empty root value. Avoid ACF empty serialization drift.
4. Verify 48/48 by REST and native WordPress Admin search, preserving title, HTML content, dates, categories, URLs, featured media, and their public Astro behavior.

**Audit status:** COMPLETE for WordPress Post REST data at run time. **Repair status:** NOT STARTED.
