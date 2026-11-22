# PSE — bản đối chiếu dữ liệu bài viết Joomla từ SQL người quản trị (22/11/2026)

**Tài liệu chỉ chứa metadata bài công khai** được trích xuất trực tiếp từ file SQL.gz người quản trị cung cấp trong cuộc trò chuyện. Không đăng toàn bộ SQL.gz, bảng users, credential, email, mật khẩu, session hoặc nội dung backup trong GitHub. Bản gốc đang được giữ trong upload của cuộc trò chuyện.

SQL dump đọc được, MySQL 5.7, tiền tố bảng `ckiv4_`, bảng `ckiv4_content` chứa 1.033 bản ghi, đủ **11/11** bài Joomla thuộc danh sách chưa đồng bộ công khai. Các bản ghi `state=1`, `created=publish_up` trong source DB, **không** khẳng định WordPress đã xuất bản.

| ID gốc | Tiêu đề nguồn | Joomla catid | Ngày tạo/publish_up (theo SQL) | Số ảnh IMG nhúng |
|---:|---|---:|---|---:|
| 114 | Phòng trừ bệnh vàng lùn và lùn xoắn lá | 75 | 2011-07-11 03:00:01 | 2 |
| 121 | Nguyên nhân và biện pháp khắc phục bệnh vàng và rụng lá cà phê | 75 | 2011-07-11 03:00:01 | 3 |
| 127 | Kỹ thuật trồng và chăm sóc cây cao su | 75 | 2011-07-11 02:56:40 | 1 |
| 178 | Kỹ thuật trồng và thâm canh điều | 75 | 2011-07-11 02:56:40 | 5 |
| 186 | NPK Phú Mỹ sẽ đẩy lùi hàng kém chất lượng | 101 | 2011-07-12 05:49:12 | 2 |
| 196 | PVFCCo-SE: Đồng hành cùng Mùa hè xanh | 101 | 2011-08-08 07:11:57 | 6 (5 URL riêng) |
| 202 | Hội thảo giới thiệu NPK Phú Mỹ tại Bình Phước | 101 | 2011-08-17 08:40:09 | 1 |
| 237 | PVFCCo SE Tặng quà tết cho hộ nghèo tại Lâm Đồng và Đắk Nông | 101 | 2012-01-20 06:29:33 | 11 |
| 341 | Đủ nước tưới cho 633.000 ha lúa Xuân 2013 | 93 | 2013-03-13 09:42:44 | 1 |
| 382 | PVFCCo SE tổ chức thành công chuyến du lịch châu Âu cho khách hàng tiêu biểu của Công ty | 101 | 2013-09-05 09:13:25 | 3 |
| 1090 | PVFCCo tổ chức thành công chương trình Hội mùa Phú Mỹ và chăm sóc khách hàng khu vực Tây Nguyên | 101 | 2015-03-14 02:51:41 | 24 |

## Phát hiện bổ sung
- **#341:** có `introtext` 259 ký tự và `fulltext` **2.277 ký tự** trong SQL, là nội dung tin tức thật (trang Joomla live trước đó không hiển thị trọn vẹn). Nhà xuất bản gốc có bài cùng nội dung [Báo Điện tử Chính phủ](https://baochinhphu.vn/du-nuoc-tuoi-cho-633000-ha-lua-xuan-2013-102139394.htm), ngày publisher 06/03/2013 khác Joomla source created 13/03/2013. Ảnh trong SQL là một hotlink `Resize of lua xaun.jpg`; cần kiểm tra xác thực ảnh trước xuất bản, không thay ảnh tương tự tùy ý.
- **#382:** SQL xác nhận ba original URLs dưới `images/web`. FTPS chính thức của pse.vn kiểm tra đọc 3 đường dẫn [#45028217936](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45028217936), **1/3 file `Ba_Lan.JPG` verified** (163.574 bytes, SHA-256 `f2587f776be8f888ae78cae1de5c0c5767855d2e01309245182d62cb1d3c1fe3`); `Áo_2.JPG` và `Mỏ_muối_Wieliczka_dưới_mặt_đất_135m_-_Ba_lan.JPG` chưa có ở đúng đường dẫn source. Không publish khi còn thiếu media.
- **#379:** SQL có cùng ngày `2013-07-03 02:10:17` với chứng cứ RSS trước. **Đã hoàn thành từ trước**: WordPress Post82119, redirect rule83503, QA [#44912815053](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44912815053). Không nhập trùng.
- **Album #975:** SQL row `created=publish_up=2011-03-06 04:53:14` trong khi title có `10/2013`. DB không tự giải quyết mâu thuẫn nguồn, 110 ảnh đã có WP Media; không tự ý đoán ngày công bố.
- Các ảnh ngoài pse.vn thuộc publisher khác **không nằm trong database Joomla**; dữ liệu SQL lưu *URL hotlink*, không lưu binary. Database giải quyết source title/body/date nhưng chưa tự giải quyết phần media.

## Hợp đồng tiếp tục
Chỉ cập nhật CMS WordPress native, không hardcode Astro; đối chiếu source ID/category/date/HTML/media; importer idempotent + fresh DB backup + readback; khi đủ ảnh/đối chiếu mới publish/301 và QA live. Các ảnh chưa đủ bản gốc vẫn ở quarantine, status sitewide `PARTIAL`. Bộ 11 bài HTML công khai đã được tách khỏi SQL trên môi trường cuộc trò chuyện, không copy dữ liệu private SQL vào repository.

## 341 — độc lập xác minh ảnh từ trang nhà xuất bản chính thức

Từ bản SQL upload, ảnh Joomla có tên `Resize of lua xaun.jpg`, hotlink cũ `baodientu.chinhphu.vn`. Workflow Playwright read-only [#45028728852](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45028728852) **PASS** xác nhận cùng bài Báo Điện tử Chính phủ và có **hai file nguồn publisher cùng tên** hiện tải được:
- `bcp.cdnchinhphu.vn`: JPEG 777×488, 73.412 bytes, SHA-256 `4ba6832aad7fab3799c93d56bb24a02795c5486ff8151153ffe7674c451d74b4`.
- `bcp2.cdnchinhphu.vn`: JPEG 1200×630, 119.712 bytes, SHA-256 `d0ccf5f1153d51b63232b113ec310a71167dc85aaea157833b97c0e2db16ad12`.

**HTTPS tới đúng đường dẫn ảnh lịch sử trả HTTP404**. Do đó đây là hai phiên bản ảnh có provenance mạnh từ trang nhà xuất bản, **chưa chứng minh byte-equal** với asset đã mất từ URL năm 2013. Không đồng nhất ảnh thumbnail 777×488 với bản 1200×630, không tự dùng phiên bản lớn làm original và không khai strict `original_media_sha_pass`. Script [88800899](https://github.com/ngocnhanvo/psevn-actions/commit/88800899867491bebb6b40b837581e6ce125be88) đã phân biệt rõ source publisher name-match và historical bytes.
