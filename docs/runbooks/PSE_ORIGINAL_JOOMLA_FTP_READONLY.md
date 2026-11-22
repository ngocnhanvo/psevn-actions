# PSE — kết nối FTP gốc Joomla chỉ đọc (22/11/2026)

Mục tiêu: truy tìm dữ liệu còn thiếu của **website gốc `pse.vn`**, **không** truy cập nhầm tài khoản triển khai `pse.webnvn.com`.

## Đã chuẩn bị

- Script `scripts/pse-original-ftp-readonly.py` (không ghi, xóa, đổi tên hoặc tải file).
- Workflow `.github/workflows/pse-original-ftp-readonly.yml` có `workflow_dispatch` và trigger marker thông điệp chính xác `audit(pse): inspect connected original Joomla source FTP`.
- Syntax check [#45022672353](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45022672353) **PASS**; bước kết nối FTP thực tế **SKIPPED**, vì commit hiện tại chỉ thêm code chuẩn bị, chưa có marker/dispatch có cấp tài khoản.
- Source filename correlation [script 27e16f3f](https://github.com/ngocnhanvo/psevn-actions/commit/27e16f3f1478b02e7375108859325e45b1d2a3c1) parses the current original-media handover; reports per Joomla Post ID only how many exact basenames *might* exist under FTP media paths. Filename equality **is not image identity, original SHA, or permission to publish**. #382 and #1090 additionally use exact known filenames from audited source. No file contents, credentials or raw image paths in artifact.
- Offline mocked FTP boundary test [script 22412413](https://github.com/ngocnhanvo/psevn-actions/commit/2241241389be5b553cd00727c06b50efadadd69a), [CI #45023266291](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45023266291) **PASS** (Python compile + tests for source root, exact expected basenames, no download/write/delete, credential fail-closed). Inspect **SKIPPED by guard**. This is not original source FTP access.

- Bảo mật: FTPS explicit TLS kiểm chứng CA hệ thống; SFTP kiểm chứng host key ghim sẵn (không `AutoAddPolicy`), không chấp nhận FTP plaintext. Giới hạn tối đa 6.000 entries, 450 directories, quét các khu vực `images`, `media`, `backup`, `backups` và `administrator/components/com_akeeba/backup`. Không đọc nội dung `configuration.php` hoặc bất cứ file SQL/archive nào. File báo cáo không chứa host, user, mật khẩu, tên file gốc hay đường dẫn đầy đủ; chỉ metadata tổng hợp và SHA256 của đường dẫn backup.

## Chủ sở hữu cấp quyền an toàn

Tại [GitHub Actions secrets](https://github.com/ngocnhanvo/psevn-actions/settings/secrets/actions) đặt **secrets mới riêng cho pse.vn cũ**, không thay các secret `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` đang phục vụ website mới:

- `PSE_SOURCE_FTP_HOST`: hostname hoặc `ftps://hostname:21` hay `sftp://hostname:22`.
- `PSE_SOURCE_FTP_USERNAME`: tài khoản **read-only** của web gốc (nếu server hỗ trợ).
- `PSE_SOURCE_FTP_PASSWORD`: mật khẩu tài khoản nguồn.
- `PSE_SOURCE_SFTP_KNOWN_HOSTS`: **chỉ cần SFTP**; dòng known_hosts đã kiểm chứng fingerprint bằng một kênh tin cậy, không tự chấp nhận key mới.

Dùng tab **Actions → PSE original Joomla source secure FTP inventory (READ ONLY) → Run workflow**. Chọn `protocol` FTPS hoặc SFTP và `root` là thư mục public_html thực tế, ví dụ `/domains/pse.vn/public_html`, hoặc `/` nếu tài khoản đã chroot vào webroot. Nếu dùng marker theo git, đặt tương ứng repo variable `PSE_SOURCE_FTP_PROTOCOL` và `PSE_SOURCE_FTP_ROOT`.

## Diễn giải

Kết quả `source_webroot_probable=true` chỉ cho biết đã thấy dấu hiệu cấu trúc Joomla ở directory đang được phép xem. Các `backup_candidate_sizes` chỉ là kích thước ứng viên; **chưa chứng minh bên trong là database đúng hoặc dữ liệu đủ**. Không giả định ảnh báo chí bên ngoài hiện diện trên FTP Joomla. Nếu cần đọc/tải bản backup để khôi phục, phải làm giai đoạn riêng có giới hạn file, kiểm chứng nguồn, cất giữ không công khai, không lộ mật khẩu trong artifact/log, và **chỉ sau khi có nguồn thực tế**.

Phạm vi còn cần chứng cứ theo checkpoint: Joomla Posts #114, #121, #127, #178, #186, #196, #202, #237, #341, #382, #1090; gallery #975 có 110 Media nhưng thiếu ngày phát hành chính xác; liên kết mô tả sản phẩm lịch sử còn cần nhận diện ngữ nghĩa; ảnh ngoài site của Post #225; thumbnail gốc #1434. Workflow crawl cũ [#45009563704](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45009563704) báo `NO_PENDING; discovered=804` (không phải 804/804 đã xong). Không tự tạo Post rỗng hoặc ảnh giả.

Chỉ chạy kiểm kê từ **tài khoản pse.vn gốc đã xác minh**. Không xem cú pháp PASS là đã kết nối được server.

## Actual connectivity diagnostic — 22/11/2026 VN

- First explicit read-only source probe [#45023401261](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45023401261) failed before directory inspection; no source data read.
- Sanitized diagnostic fix [0e6ade63](https://github.com/ngocnhanvo/psevn-actions/commit/0e6ade63b6980d4fd79562de33cefc7e71264626), offline tests PASS [#45023453710](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45023453710).
- Second actual source probe [#45023498334](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45023498334) failed with exact **`SOURCE_HOST_NOT_CONFIGURED`**, i.e. `PSE_SOURCE_FTP_HOST` is not available in this workflow. It did **not** attempt a remote FTP connection, did **not** enumerate Joomla files, and did **not** modify anything.
- **Do not repeat this probe without a new secret configuration.** Configure the distinct original `pse.vn` FTPS/SFTP host and remaining credentials in GitHub Actions Secrets, then explicitly run the guarded workflow once. Existing production-deploy credentials are unrelated and must not be reused without source ownership proof.
