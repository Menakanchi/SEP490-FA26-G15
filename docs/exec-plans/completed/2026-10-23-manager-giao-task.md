# 23/10/2026 — Manager: giao và theo dõi task (M6–M7)

Tiếp nối [M1–M5](2026-10-23-manager-workspace-thanh-vien.md). Dùng bảng `workspace_tasks` có sẵn (FE-03-07), không đổi schema.
Không chạm luồng 5 màn kỹ thuật hay file dùng chung ngoài `WorkspaceController` / `VehicSimSidebar` của đợt trước.

## Việc làm

| Mã | Chức năng | API (`/api/v1/vehicsim/workspaces/{id}`) |
|---|---|---|
| M6 | Giao task: tên, mô tả, người nhận, project, hạn, độ ưu tiên | `POST /tasks` |
| M7 | Danh sách + lọc trạng thái / người nhận (`assignee_id=0` = chưa giao) | `GET /tasks` |
| M7 | Sửa task, đổi trạng thái `TODO → IN_PROGRESS → REVIEW → DONE`, tiến độ | `PUT /tasks/{taskId}` |
| M7 | Xoá task chưa có báo cáo | `DELETE /tasks/{taskId}` (trả `{"task_id": …}`, vì client chung luôn đọc JSON) |

Code: `service/WorkspaceTaskService`, `repository/WorkspaceTaskRepository`, DTO `TaskRequest` / `TaskItem` trong `WorkspaceDtos`; route thêm vào
`WorkspaceController` (cùng quyền MANAGER / ADMIN, hạn mức ghi bucket `workspace_task`). Frontend: `/workspace/[workspaceId]/tasks`
(thống kê, lọc, form giao / sửa, đổi trạng thái ngay trên dòng); trang chi tiết workspace có nút sang task và cột "Task mở".

## Luật đã chốt trong code

- Chỉ giao cho **thành viên workspace** có tài khoản đang hoạt động; để trống = chưa giao.
- Project (nếu gắn) phải **thuộc workspace và ACTIVE**; hạn mới **không ở quá khứ** (hôm nay được).
- `DONE` thì tiến độ ghi 100 %. Đổi trạng thái tự do theo cả hai chiều (Manager mở lại task được).
- **Task đã có báo cáo không xoá được** (`fk_tr_task` ON DELETE CASCADE sẽ xoá luôn báo cáo) và **không đổi project được**
  (FK ghép `task_reports(task_id, project_id)` ON UPDATE RESTRICT) — service báo lỗi rõ thay vì để DB xoá ngầm hoặc trả 409.
- Giá trị giữ nguyên không bị kiểm lại: task gắn project nay đã lưu trữ, đã quá hạn hoặc người nhận nay bị khoá vẫn sửa được trường khác.
- **Bớt thành viên (M5)**: task chưa DONE của họ về "chưa giao"; task DONE giữ tên người làm để còn lịch sử. Kết quả M5 có `unassigned_tasks`.
- "Quá hạn" = có hạn, hạn trước `CURDATE()` của MySQL và chưa DONE. Sắp xếp: chưa xong trước, ưu tiên cao trước, hạn gần trước.
- Workspace ARCHIVED chỉ xem; workspace của Manager khác 404 (như M1–M5).

## Ngoài phạm vi

- Người được giao tự cập nhật trạng thái / tiến độ trên màn của họ (UC của Engineer / Reviewer) — hiện chỉ Manager sửa.
- Thông báo `TASK_ASSIGNED` (M10), nộp và duyệt báo cáo (M8–M9).

## Kiểm chứng (23/10/2026)

- `bash scripts/pre_push_check.sh`: `mvnw clean test` 353 test, 0 lỗi, 1 skip có sẵn; ruff qua; pytest worker 52 qua; eslint và `next build` qua.
  Mới: `WorkspaceTaskServiceTest` (14 test), thêm test task vào `WorkspaceSecurityTest` (body sai 400, hạn mức 429, 403 cho role khác ở cả 4 route
  task) và `WorkspaceServiceTest` (bớt thành viên gỡ task mở).
- Chạy thật (MySQL / Redis docker compose, backend `spring-boot:run`, `next dev`, tài khoản `@example.com`):
  - API (Python `urllib`, UTF-8): giao task 201; giao cho EXPERIENCER ngoài workspace / hạn quá khứ / project lạ / ưu tiên lạ → 400;
    ENGINEER 403; Manager 2 → 404; DONE với tiến độ 30 lưu 100; lọc TODO và chưa giao đúng; task có báo cáo (chèn bằng SQL) đổi project / xoá
    → 400; xoá task thường 200, xoá lại 404; bớt REVIEWER có 1 task mở → `unassigned_tasks: 1`, task DONE vẫn giữ người làm.
  - UI (Playwright + Edge, không mock API): task quá hạn tô đỏ, nút Xoá khoá ở task có báo cáo; giao task qua form; đổi trạng thái trên dòng
    lên 100 %; sửa người nhận / trạng thái; lỗi "Hạn hoàn thành không được ở quá khứ" hiện đúng; xoá task; lọc DONE; ENGINEER vào URL bị chặn.
    Không có lỗi JS. Chưa đối chiếu Figma: repo không có frame cho màn Manager.
- Gặp lại bẫy CLAUDE.md §4: IDE ghi `.class` lỗi vào `target/` (`Unresolved compilation problem`) khi đang sửa; `mvnw clean compile` là hết.
