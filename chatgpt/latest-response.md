# PSE — latest response (2026-11-25 ~19:20 Asia/Ho_Chi_Minh)

Project: pse.vn. Knowledge main `34310f05`. Astro master/production `bf9aebabce63aabbdf9d7d2c5fb35746d1056962`. PHP master/production plugin pin `2bfe169e82912dad898affa13689085358760ab4`. Actions main canonical checkpoint `docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md`, written at commit `5797ae256af2f21d88fee2a463fd56720cd3c46b`. Source transport bypass; auto-build.

## Planned user-visible response (entire result)

**Đã tiếp tục và phát hành tính năng ẩn/hiện section theo đúng nguồn WordPress Page, đồng thời khôi phục nguyên tắc Preview chưa chọn giống production.** Section ẩn không hiện placeholder sẵn trên website/Preview. Nếu Page có section đang ẩn, nút tìm section ẩn nằm trên thanh chọn Page của WordPress, kể cả khi mọi section đều đã bị ẩn; nhấp mới hiện vị trí nguồn trong Preview. Chỉ bật chỉnh sửa khi nguồn/phiên bản/phạm vi an toàn được WordPress và Astro xác thực.

- Astro production: `bf9aebab`, signed deploy [#45611037516](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45611037516) SUCCESS (build/FTPS/SIGNED_UNZIP_SUCCESS/activate).
- PHP production: `2bfe169e`, guarded FTPS [#45611282689](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45611282689) SUCCESS (1 file changed, 20 checked, cleanup_pending=0, no CMS writes).
- Source-only CI [#45610696037](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45610696037) SUCCESS (29/29 files, 167/167 Vitest tests; PHP native tests/JS/actual Astro JSX parser/Tailwind). Early source CI #45610378999 failed because a test harness accidentally evaluated unrelated Inspector DOM listeners and was fixed (not runtime PHP failure).
- Authenticated responsive Preview/Public Playwright [#45611553550](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45611553550) SUCCESS: hidden-section recovery toolbar source-only PASS, clean unselected Preview, homepage 1440/1024/390, FAQ 15, Hotline 3, History 6, History responsive 1024/390.
- Authenticated no-write section/item lifecycle Playwright [#45611575656](https://github.com/ngocnhanvo/psevn-actions/actions/runs/45611575656) SUCCESS: Page section ẩn/hiện dry_run eligible=1 and source version unchanged; section swap, shared insertion/clone, remove preflight + Cancel; 6 physical item swaps + Cancel; unsafe FAQ/Vision clones refused, no CMS write.
- Checkpoint source and QA recorded: [PSE Visual Builder Source Compliance 2026-11-25](https://github.com/ngocnhanvo/psevn-actions/blob/main/docs/checkpoints/PSE_VISUAL_BUILDER_SOURCE_COMPLIANCE_2026-11-25.md), commit `5797ae2`.

**Phần còn để DONE toàn bộ:** Chưa thực hiện một vòng Save thật trên Page + ESC Table thử riêng được ủy quyền và đã cô lập (`Save → REST readback → reload Builder → signed public → rollback`). S2–S4 manual reference và S5 local query chưa có cohort nguồn thật phù hợp trên published PSE; clone section có TablePress nguồn độc lập, nested ESC parent/child và một số HTML wrapper ẩn có thể cần adapter/fixture. Không tự tạo/sửa dữ liệu kinh doanh production để lấy bằng chứng. Vì thế **đợt sửa và deploy này đã nghiệm thu PASS**, nhưng **toàn bộ Visual Builder vẫn PARTIAL**.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
