# PSE — phản hồi cuối 2026-11-25 ~22:19 ICT

Project: pse.vn
Repository: ngocnhanvo/psevn-actions
Branch: main
Knowledge: ngocnhanvo/knowledge@main 34310f05a3b76c1dfd3f4bdecb27550342549f13
PHP production: ngocnhanvo/psevn-php@master 86d811bc29ed6712d76d7fe00e75337ccd9546d6
Astro production: ngocnhanvo/psevn-astro@master a5a84dc435eb8a48fbed48f25b87a798c46b6d91
Actions checkpoint: 0a81b79913b37fc4bfd316637c85765c005e6560
Source CI: 45640601935 SUCCESS
Disposable real WordPress REST: 45643346180 SUCCESS (S1-S6), 45640809119 SUCCESS (section exact inverse)
PHP guarded FTPS: 45641023067 SUCCESS
Production no-write Preview UI: 45641350302 SUCCESS
Production public-vs-Preview parity: 45643219128 SUCCESS
Status: PARTIAL — chưa hoàn tất. No production CMS data writes.

## Nguyên văn phản hồi
## Đã sửa và kiểm thử mã nguồn

Mình đã sửa cơ chế nhân bản section dùng chung ESC Table để không tự chèn ký tự xuống dòng ngoài phần nội dung cần sao chép.

- **PHP commit:** [`86d811b`](https://github.com/ngocnhanvo/psevn-php/commit/86d811bc29ed6712d76d7fe00e75337ccd9546d6)
- **CI mã nguồn:** [#45640601935](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45640601935) — **PASS**.
- Kiểm thử PHP bao gồm nhân bản/gỡ section, bảo toàn bảng gốc và khôi phục chính xác nội dung Page.

Mình chưa triển khai bản mới lên production vì còn phải xác nhận Save/readback/rollback bằng WordPress thật trên database cô lập.

## WordPress thật trên môi trường cô lập: PASS

[Workflow #45640809119](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45640809119) đã **SUCCESS**.

Kết quả xác nhận nhân bản rồi gỡ section **khôi phục Page đúng từng byte bằng chính các REST API của Builder**, không còn cần bước dọn nội dung thủ công. Cả trường hợp shortcode thuần và wrapper an toàn đều đạt; dữ liệu ESC Table gốc không thay đổi.

Các phép thử Save/readback/rollback S1–S5 và hoán đổi hai section cũng tiếp tục PASS. Workflow đã vượt qua bước kiểm tra WP-CLI mới.

## Đã triển khai lên production

[FTPS #45641023067](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45641023067) — **SUCCESS**.

Log xác nhận đúng PHP commit `86d811b`, chỉ một file `includes/section-order.php` thay đổi, SHA-256 khớp, `changed=1`, `checked=20`, `cleanup_pending=0`.

Không ghi dữ liệu WordPress, không build lại Astro và không thay đổi các plugin khác. Mình tiếp tục đối chiếu hành vi Preview production để kiểm tra hồi quy sau triển khai.

## Playwright production sau triển khai: PASS

[Workflow #45641350302](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45641350302) — **SUCCESS**.

Kiểm thử xác nhận hoán đổi section trực tiếp, thao tác bàn phím, sáu nhóm item (Promise, Hero, Hotline, FAQ, History, Vision), nhân bản dùng chung nguồn và gỡ section ở chế độ dry-run đều hoạt động theo phạm vi được hỗ trợ. Các wrapper không an toàn tiếp tục bị từ chối.

**Không có WordPress Save hoặc thay đổi dữ liệu CMS.** Bản sửa đã qua cả kiểm thử ghi/hoàn tác trên WordPress cô lập và kiểm thử Preview production không ghi dữ liệu.

## Bổ sung nghiệm thu nguồn S6

[Workflow #45642273372](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45642273372) — **SUCCESS**.

Mình đã xác minh sửa văn bản HTML trong WordPress Page bằng REST thật: Save, đọc lại dữ liệu, từ chối phiên bản cũ và hoàn tác chính xác. Các shortcode liền kề và dữ liệu ESC Table được giữ nguyên.

Đây là bằng chứng cho **S6 – văn bản Page HTML** trên môi trường cô lập; chưa bao gồm toàn bộ ảnh, media và các loại nội dung khác của S6.

[Workflow #45642515195](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45642515195) tiếp tục **PASS** cho S6 – ảnh và ALT trong WordPress Page: lưu ALT, đọc lại, từ chối phiên bản cũ và hoàn tác nguyên nội dung Page. URL ảnh, HTML xung quanh và dữ liệu ESC Table không bị thay đổi.

Như vậy, phạm vi kiểm thử WordPress cô lập hiện đã có bằng chứng ghi thật cho **S1–S6**, cùng thao tác hoán đổi và nhân bản/gỡ section dùng chung nguồn.

[Workflow #45643346180](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45643346180) — **SUCCESS**.

Phép thử đã dùng hai ảnh được tạo trong WordPress Media của môi trường cô lập, đổi ảnh A → B qua REST, đọc lại URL và phiên bản, kiểm tra xung đột rồi đổi B → A. HTML của Page được khôi phục chính xác; dữ liệu ESC Table không thay đổi.

Như vậy, S6 đã có bằng chứng ghi và hoàn tác cho **văn bản, ALT và thay ảnh bằng WordPress Media thật**.

## Public và Visual Builder sau triển khai: PASS

[Playwright #45643219128](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45643219128) xác nhận giao diện public và Preview khớp các tiêu chí kiểm thử hiện có tại **1440, 1024 và 390 px**.

Trang chủ đạt 5/5 vùng so sánh ở cả ba độ rộng. FAQ đạt 15 mục, Hotline 3 mục, History 6 mục; History cũng đạt kiểm tra bố cục ở 1024 và 390 px. Các công cụ chỉnh sửa tiếp tục chỉ xuất hiện đúng ngữ cảnh, không làm thay đổi giao diện mặc định.

Đây là kiểm thử **chỉ đọc**, không ghi WordPress và không build lại Astro.

**Checkpoint cuối của lượt này:** [PSE Visual Builder — 25/11/2026](https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md), cập nhật tại commit [`0a81b79`](https://github.com/ngocnhanvo/psevn-actions/commit/0a81b79913b37fc4bfd316637c85765c005e6560).

**Còn chưa nghiệm thu:** luồng ghi trên Page/ESC Table thử nghiệm đã xuất bản ở chính PSE production → REST → Preview mới → signed build/public → rollback; nhân bản section với **ESC Table nguồn độc lập** (khác với nhân bản dùng chung nguồn); các wrapper chưa hỗ trợ và một số luồng S7–S9. Không tạo dữ liệu kinh doanh giả trên production để lấy PASS.

**Kết luận:** phần sửa mã nguồn, FTPS và kiểm thử WordPress cô lập S1–S6 của đợt này hoàn tất; toàn bộ dự án Visual Builder chưa đủ bằng chứng để báo DONE.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
