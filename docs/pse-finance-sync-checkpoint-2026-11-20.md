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
