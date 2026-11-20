# CHỐT NGHIỆM THU — Báo cáo tài chính PSE, 20/11/2026

> **FINAL: SOURCE / WORDPRESS DATA PARITY PASS; SEO TITLE PASS.** Các mục “đang chạy”, “chưa hoàn tất”, hoặc 67/72 bài ở bên dưới là **lịch sử các lượt sửa trước đó**, không phải trạng thái hiện hành. Không chạy lại importer/PDF sideload đã PASS.

## Bằng chứng nghiệm thu cuối, độc lập

- **Nguồn Joomla:** 76 bài, có ID, slug và thứ tự thu thập độc lập trên `https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh.html`. 76 bài này được xuất bản đúng trong WordPress category **1754** (parent **1744**); không thừa, không thiếu, không trùng slug, **không sai thứ tự**.
- **Tài liệu:** **96/96 liên kết tài liệu gốc** có liên kết tương ứng ở WordPress (theo provenance của checkpoint hoặc SHA đối chứng); **0 thiếu, 0 chưa xác minh, 0 thừa**. **93 URL file local độc nhất** được kiểm tra hoạt động; không có 403/404/410 hay hotlink tài liệu về domain PSE cũ. Bằng chứng: [final media + SSR PASS run 44726497421](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44726497421); artifact `pse-financial-final-media`, status `PASS_CANDIDATE` với **errors: []**.
- **Ngoại lệ đúng như nguồn:** Joomla #1137 không chứa PDF/đoạn thông tin BCTC, WordPress không bịa PDF; Joomla #298 chứa link MediaFire của bên thứ ba, WordPress bảo toàn link ngoài đó. Bài #1590 năm 2024 có một anchor PDF 2023 **rỗng nhãn trên nguồn**: đã gắn lại file đã tồn tại ở WP Media **77456**, thêm nhãn dễ hiểu, không tải trùng, giữ nguyên toàn bộ ngày đăng; nguồn hiện thực tế có ba link PDF.
- **Bài #1737:** hai tài liệu từ Joomla và WordPress có tên file khác nhau nhưng **SHA-256 và byte length khớp tuyệt đối**. Media WP **77045**, **77046**; bằng chứng [44726181875](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44726181875), mapping lâu dài ở `docs/pse-finance-1737-verified-media-map.json`. Không đổi tên lại file hoặc upload trùng.
- **Thứ tự 76 bài:** đã ghi các rank theo nguồn thành metadata WordPress, **không sửa bất kỳ `post_date`** (đặc biệt #1292, #1284, #1282 là thứ tự nguồn có chứng cứ nhưng ngày Joomla chưa xác minh). PHP plugin vĩnh viễn `wp-content/mu-plugins/pse-finance-source-order.php` thuộc `psevn-php/master`; chỉ áp dụng bộ lọc sắp xếp cho REST category 1754. Bằng chứng [44724960228](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44724960228), `PSE_FINANCE_ARCHIVE_ORDER.matched=76`, `changedPublicationDates=0`.
- **SSR & giao diện:** URL `https://pse.webnvn.com/tin-tuc-su-kien/bao-cao-tai-chinh` và `/7` đều **HTTP 200**; 12 item/trang, 7 trang, trang cuối 4 item; kiểm tra desktop **1366×768** và mobile **390×844**, không tràn ngang. [Run 44723562119](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44723562119): `PSE_FINANCE_VISUAL_PARITY.status=PASS` cho cấu trúc/card/phân trang ở hai đầu; **không tuyên bố pixel-perfect so với giao diện Joomla cũ**, vì layout đã thiết kế mới.
- **Yoast SEO title:** nguồn 76/76 có `<title>`. Ban đầu 67 WordPress thiếu SEO title, 9 bài mới có title đúng. Bản vá chỉ điền 67 title đang trống, không thay đổi `post_title`, ngày, nội dung hoặc mô tả: [44726970147](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44726970147), `changed=67`, `already=9`, `errors=[]`. Kiểm tra độc lập [44727997665](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44727997665), **76/76 Yoast title khớp nguồn**, không có sai lệch.
- **SEO meta description:** Joomla **0/76** có meta description nguồn; WordPress vẫn có **67 mô tả đích** sau cập nhật. Chúng được **giữ nguyên, không tự sinh thêm, không xoá dữ liệu đích hợp lệ khi nguồn thiếu metadata**. Ba mô tả đã xác minh là tự sinh sai trong đợt nhập mới (IDs 82538, 82541, 82535) được làm sạch riêng bằng readback tại [44724326170](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44724326170).
- **Backup & thu hồi PHP:** trước các đợt nhập/sửa đã tạo nhiều DB-only UpdraftPlus backups có xác minh. **7 PDF dở dang** từ upload timeout trước đó được đưa ra khu vực cách ly **ngoài webroot, có khả năng rollback**, và WordPress Media đã chuyển trash; không xóa vĩnh viễn. Endpoint PHP tạm `pse-finance-temporary-sideload.php` đã **được gỡ khỏi hosting** và **xóa khỏi `psevn-php/master`**. Chốt cuối WordPress CMS chỉ dùng plugin nguồn-rank vĩnh viễn; không còn endpoint phục hồi mở.
- **Triển khai:** SSR Astro lấy dữ liệu từ WordPress theo REST và đã đọc lại HTTP 200. Không tạo workflow build/deploy Astro thứ hai; không cần build lại Astro để thay đổi Post Media/Yoast.

## Kết quả nghiệm thu theo scope

| Gate | Trạng thái |
|---|---|
| SOURCE_INVENTORY (76 bài Joomla) | PASS |
| DATA_PARITY (76 bài, 96 link tài liệu, taxonomy) | PASS |
| NAV_PARITY (thứ tự 76 bài & phân trang chuyên mục) | PASS |
| SSR / RESPONSIVE_STRUCTURAL_QA (desktop/mobile) | PASS |
| SEO_SOURCE_TITLE (76/76) | PASS |
| SEO_SOURCE_META_DESCRIPTION (nguồn thiếu 76/76; giữ đích có trước) | SOURCE_MISSING, preserved |
| PIXEL_DIFF so với giao diện Joomla | NOT_CLAIMED — ngoài phạm vi đồng bộ dữ liệu |

**Không có việc ghi production còn treo thuộc phạm vi đồng bộ báo cáo tài chính.** Mọi nguồn tải bên thứ ba và tình trạng trống của Joomla đã được giữ đúng, không bịa tài liệu hay đổi ngày bài. Nếu phát sinh bài mới từ nguồn, cần tạo snapshot/rank mới trước khi mở rộng nghiệm thu 76 lên 77+.

---

# PSE — đối chiếu & đồng bộ Báo cáo tài chính (20/11/2026)

## Cơ sở kiểm kê độc lập (đã PASS)
- Source: `https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh.html`; 76 bài có Joomla URL, 13 trang lưu trữ.
- WordPress: category `bao-cao-tai-chinh` = 1754, parent = 1744; 67 bài xuất bản tại thời điểm trước phục hồi.
- Astro SSR: `https://pse.webnvn.com/tin-tuc-su-kien/bao-cao-tai-chinh` = HTTP 200, dùng WP Posts; không hard-code danh sách.
- Đúng 9 ID còn thiếu trong category, không thấy bài trùng ở category khác: `1738, 1666, 1650, 1480, 1148, 1137, 337, 298, 199`.
- Checkpoint migration: 8 ID cũ quarantined, `1738` mới chưa tồn tại.
- Source của 9 ID đều HTTP 200; 11 asset references. Hai trường hợp chưa có tư liệu nhập nguyên vẹn: `1137` (thân bài không có file/nội dung sau khi bỏ bài liên quan), `298` (một link `http://www.mediafire.com/file/mn5v49y1db5me3h/scan0001.pdf` nằm ngoài nguồn PSE).
- Lưu ý: audit đầu tiên báo 116 file "missing by filename" vì các lần nhập cũ dùng tên hash; đây KHÔNG phải bằng chứng 116 file thật thiếu, phải so provenance URL/file bytes.

## Actions evidence
- Source=76, WP=67, diff=9 + SSR200: run [44712477709](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44712477709).
- Source/CMS fast diff + 8 quarantined: run [44712975170](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44712975170).
- 9 original source pages + attachments: run [44713298817](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44713298817).
- Scoped restore/backup+CMS writes: run [44713992575](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44713992575) — **đang chạy tại thời điểm tạo checkpoint này**.
- Workflow QA cuối (chưa chạy): `.github/workflows/pse-financial-media-reconcile.yml`. Cần thực thi sau lần nhập cuối, để kiểm chứng số bài, file PDF và SSR.

## Hợp đồng thực thi
- Không đụng `psevn-astro/master`, `psevn-php/master`; chỉ sửa `psevn-actions/main` để kiểm kê/khôi phục WP.
- Restore opt-in `PSE_FINANCE_RECOVERY_SCOPE=verified-nine-2026-11-20` trong `scripts/pse-legacy-migration-batch.mjs`. Không đụng bài ngoài 9 ID; cùng khóa single writer với legacy migration.
- Fresh DB backup bằng UpdraftPlus trước khi ghi; kiểm tra original PDF size/MIME/signature/origin, SHA256 sau lưu, chống trùng slug và tài nguyên; source filename metadata. Dừng/quarantine nếu không đủ bằng chứng.
- Khôi phục checkpoint thông qua `scripts/pse-legacy-migration-save.mjs`, có SHA lease; tự dispatch tiếp phạm vi tài chính qua `scripts/pse-finance-recovery-next.mjs`, tối đa 5 lượt.
- SSR đọc data realtime từ WordPress; không build Astro riêng chỉ vì đổi post.
- **Chưa được tuyên bố DONE** trước khi mọi bước ghi, readback và parity được xác minh.

## Bước tiếp theo bắt buộc
1. Đọc trạng thái run `44713992575`, bước importer và log các `PSE_LEGACY_POST`, `PSE_FINANCE_SOURCE_BIG_PDF`, `PSE_LEGACY_RECORD_ERROR`, `PSE_LEGACY_MEDIA`. Chỉ chốt bài tạo thành công theo post ID và readback.
2. Đọc run kế tiếp nếu `PSE_FINANCE_AUTO_NEXT=QUEUED`; tiếp tục giám sát đến khi không còn bản ghi actionable hoặc có blocker thật.
3. Fetch lại REST category 1754 và các file theo WordPress `/wp-json/wp/v2/posts`, xác minh list/SSR.
4. Chạy `pse-financial-media-reconcile.yml` sau nhập; dùng snapshot gốc trong run `44712477709`; phân loại thật/giả lỗi tên file.
5. Nếu `1137`, `298` vẫn thiếu: giữ nguyên nguồn, không sáng tác dữ liệu, báo chính xác trạng thái PARTIAL và chứng cứ cho chủ dự án.

## Cập nhật phục hồi sau đợt đầu
- Run [44713992575](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44713992575) **success**: mới xuất bản chính xác source **199 → WP 82535**, **1148 → WP 82538**, **337 → WP 82541**; media tương ứng được ghi/readback. Đây là 3 bài phục hồi thành công thực tế, không phải 9.
- Source **1738** upload timeout 80s; **1480** GET source file timeout 45s; **1666** upload PDF 31,725,319 bytes timeout 240s; **1650** upload PDF 29,305,039 bytes timeout 240s; source **1137** có phần thân thực rỗng và không tài liệu nên importer cũ từ chối; **298** chỉ tham chiếu bên thứ ba MediaFire.
- Quét giới hạn WP trước đây xác minh mức upload **64 MB** (run `44703791958`); việc 29–32 MB timeout không đủ bằng chứng lỗi kích cỡ. Không nâng giới hạn vô căn cứ.
- Run tiếp theo [44716701823](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44716701823) đang chạy lúc cập nhật checkpoint. Chỉ đọc log sau khi kết thúc rồi kiểm tra source IDs/WP REST.
- Bản sửa importer `90f019733dd94dd6398f406d681718b1bfa2414e`: ngoại lệ đúng nguồn #1137 (giữ trang trống, không tạo PDF) và #298 (giữ nguyên MediaFire, không tự tải tài nguyên thuộc bên thứ ba); không tạo SEO description khi nguồn Joomla thiếu meta; chỉ chạy khi `PSE_FINANCE_RECOVERY_SCOPE` đúng.
- **Chưa hoàn tất:** source 298 và 1137 chưa được ghi trước khi đợt tiếp nhận source mới chạy.

## Tối ưu tài liệu lớn có rollback và dọn endpoint
- PHP nguồn đã commit tại `psevn-php/master`, `49d0b99bb8d7f24a32defd5f5a7a340b93c26901`: `wp-content/mu-plugins/pse-finance-temporary-sideload.php`. Đây là một **endpoint tạm** và **chưa được triển khai ở thời điểm ghi checkpoint**; API chỉ dành cho quản trị WordPress, chỉ các URL/ID finance 1738/1666/1650/1480 đã xác thực, tự hết hạn sau 22/11/2026.
- FTPS Python có kiểm chứng SHA-256 và bước thu hồi endpoint ở `scripts/pse-finance-temporary-ftps.py`; REST runner `scripts/pse-finance-sideload-rest.mjs`; workflow `.github/workflows/pse-finance-server-sideload.yml`.
- Run sideload đầu `44717559598` bị **cancelled khi bị một workflow cùng concurrency group thay thế trong pending**, không được gọi là đã deploy.
- Lưu ý GitHub Actions concurrency chỉ cho **1 running + 1 pending** với cùng group; **không tự tạo workflow legacy migration/push importer** khi sideload chờ vì pending mới có thể hủy pending cũ.
- `scripts/pse-finance-recovery-next.mjs` `6df77148bcee63eb89539979d68a4e8c21392431` đã được sửa để không tự chạy lượt mới khi các PDF lớn chưa được sideload; đây là để tránh loop 240s liên tục (có hiệu lực khi runner checkout commit chứa sửa).
- Sau khi run `44716701823` và mọi runner legacy pending được giải phóng, kích hoạt lại `pse-finance-server-sideload.yml` **đúng một lần** (qua workflow_dispatch hoặc cập nhật workflow file). Cần xác minh job deploy → sideload → checkpoint SHA → **retire plugin FTPS**, không được bỏ bước retire khi fail. Chỉ khi tất cả PASS mới để workflow dispatch `pse-finance-recover.yml`.
- Môi trường **chưa có bằng chứng đã deploy temporary PHP**, không gọi đã deploy.
- Sau khi hoàn tất việc sideload và endpoint đã được gỡ khỏi hosting, cần xóa plugin tạm khỏi `psevn-php/master` để tránh deploy lại khi full PHP release.

## Tiêu chí còn thiếu
1. WordPress đúng **76/76 published** và source URLs/WP slugs tương ứng; bài thiếu media gốc phải được nêu đúng (không gán file giả).
2. Toàn bộ PDF source-owned được lưu trong WordPress và đường link chạy được; phân loại tài liệu đã đổi tên cũ bằng source URL/hash, không dùng sai 116 file mismatch.
3. Kiểm tra URL public bài mới, archive SSR trang 1 & cuối, desktop/mobile và metadata SEO theo knowledge.
4. Chỉ báo DONE khi source/doc/SSR QA đều PASS hoặc có ngoại lệ được chủ dự án phê duyệt rõ.

## Cập nhật bằng chứng 10:45 ngày 20/11/2026
- Run [44718269683](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44718269683): source `298 → WP 82548` và `1137 → WP 82550` **publish/readback PASS**. Tổng phục hồi đã xác nhận là **5/9**, WP archive 72/76; hai bài này giữ trung thực nguồn thiếu PDF hoặc MediaFire.
- Run [44719438751](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44719438751): source `CBTT_BCTC_ban_nien.pdf` 29.305.039 byte SHA `aba7bf51f204ab167dbef22b2c35fe262aab3f43b5a5308ff448b83453a4309d`; WordPress media `82544` 26.607.616 byte SHA `3ae1294f3ef586cb2f55ecbe61ccfa72260c9bb906f7d65bc877c3f1b32a1b81`. Không được đồng nhất hai binary.
- Run [44720199721](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44720199721): media `82544` tạo 20/11, post:null; 0 published Posts/Pages referencing source filename.
- Run [44720335077](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44720335077): bảy upload dở dang tạo bởi chính migration: media IDs `82533,82545,82547,82543,82546,82552,82544`, tất cả unattached, không có nội dung Posts/Pages tham chiếu. FTP sizes/SHA khác nguyên bản. Báo cáo artifact chứa đầy đủ filenames/SHA và timestamp.
- Run [44720920028](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44720920028): thử sideload đầu bị chặn do lỗi **một ký tự SHA** trong preflight; **không thao tác WordPress**. Đã sửa SHA source PHP + workflow ở `744bec3d8f5aa1f9eaac0c55e98795606523b8f7` và `65c7d485095b81c3a753d13d4f61312f48b118d9`.
- Run [44721188679](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44721188679): backup DB Updraft **PASS**; PHP kiểm chứng riêng 7 ID + toàn bộ SHA/không tham chiếu, di chuyển 7 file vào quarantine **ngoài webroot** (không xóa vĩnh viễn), Media status `trash` (có thể rollback). Bước server sideload 5 PDF bị **HTTP 500**, 0 file mới thành công; endpoint tạm đã **RETIRE VERIFIED**. Checkpoint đã lưu conflict resolution để lần sau không báo file lỗi tương đương bản gốc.
- Run [44721703892](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44721703892) và [44721803511](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44721803511): FTP `wp-content/debug.log` tồn tại, nhưng không có fatal mới, các fatal log cuối là 09/2026, không giải thích PHP 500 hiện tại.
- PHP source commit `df42512cc9088ea1fa42a12a884c388051792db8` đã bọc `Throwable` để chẩn đoán mã lỗi/line mà không trả credential/stack. Lượt thử chẩn đoán [44721920806](https://github.com/ngocnhanvo/psevn-actions/actions/runs/44721920806) **đang chạy khi cập nhật này**, chưa có kết quả.
- SEO: `psevn-php/master` commit `41b54231d9380c9dec3c25da7f48afc7a23a94d3` đã bổ sung WordPress REST field `pse_seo_title` cho _yoast_wpseo_title, **source only, chưa deploy**. Actions `scripts/pse-finance-seo-ftps.py`, `scripts/pse-finance-seo-sync.mjs`, `.github/workflows/pse-finance-seo-release.yml` được chuẩn bị, **chưa chạy**. Sau khi nội dung đủ mới phát hành riêng, không build Astro.
- Code PHP temp **đã retire khỏi webroot** ở run trước; source tạm còn trong Git để dùng cho chẩn đoán và **phải xóa khỏi PHP master sau khi xong**, tránh full PHP release tái đưa endpoint vào production.

**Bước tiếp:** Đọc kết quả PHP exception từ run `44721920806` (không rerun vô cớ). Sửa đúng lỗi PHP, retry có giới hạn dùng 7 file quarantine đã verified, không chạm lại/quarantine trùng. Lấy được 5 PDF source-owned -> importer source IDs `1738,1666,1650,1480` -> WP 76/76 -> source/target/document/SEO/SSR QA -> xóa PHP temp khỏi source. **DATA_PARITY chưa PASS**, không kết thúc.
