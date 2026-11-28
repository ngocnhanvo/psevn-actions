# PSE — phản hồi ngày 28/11/2026 (Asia/Ho_Chi_Minh)

Project: pse.vn
Repository: ngocnhanvo/psevn-actions
Branch: main
Scope: Full readonly census of WordPress Post origin_page_id and classification of original vs translation metadata.
Evidence: 48 suspect / 792 Posts; run 46097644036 SUCCESS; report b8787366.
CMS changes: NONE.

## Nguyên văn phản hồi cuối dự định gửi

## Rà soát origin_page_id — PSE.vn

Mình đã xác nhận quy tắc trong mã nguồn WordPress:
- Bài viết gốc: origin_page_id phải rỗng, 0 hoặc giá trị ACF rỗng a:0:{}.
- Bài viết dịch: origin_page_id phải tham chiếu đến ID WordPress của bài gốc tương ứng.
- Bài nhập từ Joomla: ID bài Joomla phải lưu ở pse_joomla_source_id, không được dùng origin_page_id.
Bốn bài WordPress 83843, 83845, 83847, 83849 đã được sửa và xác minh trong đợt trước.

### Kết quả quét trực tiếp WordPress (28/11/2026)

**Có: 48 bài viết đang có origin_page_id khác rỗng dù không có WordPress Post/Page gốc tương ứng.**

- Đã quét đủ 792/792 WordPress Post (8 trang API), tất cả đang publish; không có Post trong thùng rác.
- 744 bài có origin_page_id rỗng/hợp lệ, trong đó 4 trường hợp ACF mảng rỗng.
- 48 bài có origin_page_id là số dương, đều vi, có phe_joomla_source_id trống, và mọi ID liên kết đều trả 404 cho cả Post và Page. Không phát hiện bản dịch hợp lệ trong nhóm 48.
- Đây là 48 ứng viên rất đáng nghi bị dùng nhầm Joomla source ID làm WordPress translation origin; cần kiểm tra hàng Joomla gốc trước khi sửa.

Ví dụ:
| WordPress ID | origin_page_id | Bài viết |
| ---: | ---: | --- |
| 83696 | 1741 | Phú Mỹ Đông Nam Bộ tổ chức Lễ công bố và trao quyết định về công tác cán bộ |
| 83698 | 1739 | Phú Mỹ Đông Nam Bộ: Một ngày thứ Bảy đầy ý nghĩa |
| 83794 | 1657 | Đại hội Công đoàn lần thứ VI |
| 83808 | 1589 | Bữa cơm Công đoàn |
| 83810 | 1588 | Chuỗi hoạt động kỷ niệm 16 năm |
| 83814 | 1557 | Đại hội đồng cổ đông 2023 |
| 83318 | 980 | Công trình DTN kho chứa Đồng Nai |
| 83036 | 1053 | Ngày Hội Truyền Thống 2014 |

Báo cáo đầy đủ 48 bài: https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/reports/PSE_ORIGIN_PAGE_ID_POST_CENSUS_2026-11-28.md
Workflow đã SUCCESS: https://github.com/ngocnhanvo/psevn-actions/actions/runs/46097644036

**Chưa sửa database hoặc deploy**; đây là kết quả kiểm kê theo đúng yêu cầu. Khi sửa cần sao lưu, xác thực ID Joomla rồi chuyển sang pse_joomla_source_id và gỡ origin_page_id sai, cuối cùng kiểm tra lại Admin và REST.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: DONE — hoàn tất
