# 23/10/2026 — Manager: xem và duyệt báo cáo công việc (M8–M9)

Tiếp nối [M1–M5](2026-10-23-manager-workspace-thanh-vien.md) và [M6–M7](2026-10-23-manager-giao-task.md). Dùng bảng `task_reports` có sẵn
(ADR-038: báo cáo gửi theo project, Manager của workspace duyệt), không đổi schema.

## Việc làm

| Mã | Chức năng | API (`/api/v1/vehicsim/workspaces/{id}`) |
|---|---|---|
| M8 | Báo cáo của các project trong workspace, lọc theo trạng thái / project; chờ duyệt xếp trước | `GET /reports` |
| M9 | Duyệt (APPROVED) hoặc từ chối (REJECTED) kèm nhận xét | `POST /reports/{reportId}/decision` |

Code: `service/WorkspaceReportService`, `repository/WorkspaceReportRepository`, DTO `ReportItem` / `ReportDecisionRequest` / `TaskRef`;
route trong `WorkspaceController` (MANAGER / ADMIN, hạn mức ghi bucket `workspace_report`). `WorkspaceSummary` thêm `pending_report_count`.
Frontend: `/workspace/[workspaceId]/reports` (thống kê, lọc, mở từng báo cáo, nhận xét, Duyệt / Từ chối có xác nhận); trang danh sách workspace
có cột "Báo cáo chờ duyệt", trang chi tiết có nút "Báo cáo (n chờ duyệt)".

## Luật đã chốt trong code

- Chỉ báo cáo `SUBMITTED` duyệt được, **một lần** — quyết định là cuối, giống quyết định của Reviewer ở màn 5.
- **Từ chối bắt buộc nhận xét**; duyệt thì nhận xét tuỳ chọn.
- `UPDATE … WHERE status = 'SUBMITTED'`: hai người duyệt cùng lúc thì đúng một người thắng, người sau nhận lỗi "vừa được người khác duyệt".
  Ghi `reviewed_by_user_id` + `reviewed_at` cùng một câu nên luôn thoả `ck_tr_review`.
- Workspace ARCHIVED chỉ xem; workspace / báo cáo của Manager khác → 404.
- Giao diện chỉ biến `attachment_url` thành link khi là `http(s)://` (mở tab mới, `rel="noopener noreferrer"`); giá trị khác (vd. `javascript:`)
  hiện như chữ, không bấm được — DB không ràng buộc định dạng cột này.

## Ngoài phạm vi

- **Nộp báo cáo** (Engineer / Reviewer gửi báo cáo cho project, kiểm "thành viên hoặc chủ project"): UC của role khác, chưa có. Khi kiểm thử phải
  chèn báo cáo bằng SQL. Không có luồng này thì màn duyệt luôn rỗng trên dữ liệu thật.
- Thông báo `REPORT_SUBMITTED` và kết quả duyệt cho người nộp (M10).

## Kiểm chứng (23/10/2026)

- `bash scripts/pre_push_check.sh`: `mvnw clean test` 362 test, 0 lỗi, 1 skip có sẵn; ruff qua; pytest worker 52 qua; eslint và `next build` qua.
  Mới: `WorkspaceReportServiceTest` (8 test: duyệt có / không nhận xét, từ chối thiếu nhận xét, quyết định lạ, duyệt lại, cuộc đua hai người duyệt,
  báo cáo ngoài workspace, workspace người khác / lưu trữ, lọc) và thêm route báo cáo vào `WorkspaceSecurityTest` (403 role khác, 400 body, 429).
- Chạy thật (MySQL / Redis docker compose, backend `spring-boot:run`, `next dev`, tài khoản `@example.com`, báo cáo chèn bằng SQL):
  - API (Python `urllib`): danh sách xếp chờ duyệt trước, có task / người nộp; lọc trạng thái + project; ENGINEER 403; Manager 2 404; ADMIN 200;
    `pending_report_count` khớp; từ chối không nhận xét / quyết định lạ → 400; duyệt có nhận xét lưu người duyệt + lúc duyệt; duyệt lại → 400;
    báo cáo không tồn tại → 404; **hai request duyệt đồng thời (Manager + ADMIN) → một 200, một 400**.
  - UI (Playwright + Edge, không mock API): nút "Báo cáo (3 chờ duyệt)" ở chi tiết; mặc định lọc chờ duyệt; đính kèm `javascript:` không có thẻ
    `<a>`, đính kèm `https` có link `noopener`; từ chối thiếu nhận xét bị chặn; từ chối / duyệt thành công; lọc "Tất cả" hiện người duyệt + nhận xét,
    không còn nút duyệt; ENGINEER vào URL bị chặn. Không có lỗi JS. Chưa đối chiếu Figma: repo không có frame cho màn Manager.
