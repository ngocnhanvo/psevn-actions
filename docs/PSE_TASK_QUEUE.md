# PSE Task Queue

GitHub Issues trên ngocnhanvo/psevn-actions là nguồn trạng thái. GitHub Actions chạy dispatcher khi Issue thay đổi và 10 phút/lần, khóa một dispatcher bằng concurrency.

## Trạng thái
WAITING: chờ phụ thuộc. RUNNING: phiên trước đang làm. READY: điều kiện hoàn tất đã được chứng minh. DISPATCHED: coding agent đã được gọi. NEEDS_AGENT: thiếu quyền hoặc chưa có agent. DONE: sau code/QA/build thực tế.

Metadata (một dòng trong issue owner tạo): HTML comment PSE_QUEUE_V1 với JSON fields version=1, mode=manual|copilot, target_repo, base_branch, depends_on=[số issue], priority=50, evidence nếu là task hoàn tất.

- manual: target_repo=ngocnhanvo/psevn-actions, base_branch=main; dùng đại diện cho phiên chat đã chạy.
- copilot: target_repo=ngocnhanvo/psevn-astro, base_branch=github; dispatch chỉ khi tất cả dependencies CLOSED + pse-queue:done + evidence.
- evidence: qa_run phải là link GitHub Actions run PSE, commit phải SHA 40 ký tự, build là verified-wordpress-build hoặc not-required. Cần kiểm tra chứng cứ thật trước khi đóng issue; validate cấu trúc không tự chứng minh kết quả test.
- SOURCE_REPO_PAT cần quyền issue trên Astro và tài khoản Copilot cloud agent được bật. Không có thì NEEDS_AGENT, không báo đã thực thi.
- Dispatcher tạo một issue Astro có marker PSE_QUEUE_ORIGIN, tránh tạo trùng khi retry. Copilot mở PR; việc merge, QA/WordPress build và đánh dấu DONE cần agent/ChatGPT phụ trách nghiệm thu.
- Task Queue không biết cửa sổ ChatGPT nào kết thúc và không thể khóa các phiên không đăng ký queue; tác vụ tiền nhiệm phải cập nhật issue khi thật sự hoàn tất.
- TUYỆT ĐỐI KHÔNG dùng Task Queue để bypass WordPress/PHP Build Website, sửa trực tiếp master hoặc công bố production khi chưa được phép.
