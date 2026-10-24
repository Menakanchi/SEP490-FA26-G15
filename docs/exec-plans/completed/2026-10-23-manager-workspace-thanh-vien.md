# 23/10/2026 — Manager: xem workspace và quản lý thành viên (M1–M5)

Phần đầu của nhóm việc Manager trong TD-30 (ADR-035, ADR-038). Không đổi schema MySQL: các bảng `workspaces`, `workspace_members`,
`project_members` đã có từ migration 005/006. Không chạm `VehicSimController`, `Queries`, `ViewsService` hay luồng 5 màn kỹ thuật.

## Việc làm

| Mã | Chức năng | API (`/api/v1/vehicsim`) |
|---|---|---|
| M1 | Danh sách workspace tôi quản lý (ADMIN: mọi workspace) | `GET /workspaces` |
| M2 | Chi tiết workspace + project bên trong | `GET /workspaces/{id}` |
| M3 | Thành viên workspace | `GET /workspaces/{id}/members` |
| M4 | Tìm tài khoản thêm được, thêm thành viên | `GET /workspaces/{id}/member-candidates?q=`, `POST /workspaces/{id}/members` |
| M5 | Bớt thành viên (tự rời mọi project của workspace) | `DELETE /workspaces/{id}/members/{userId}` |

Code tách tầng như phần 5: `controller/WorkspaceController`, `service/WorkspaceService`, `repository/WorkspaceRepository`,
`dto/WorkspaceDtos`; quyền MANAGER / ADMIN ở `VehicSimAccess.requireWorkspaceManager`. Frontend: `/workspace`, `/workspace/[workspaceId]`,
mục sidebar "Workspace" chỉ hiện với MANAGER / ADMIN.

## Luật đã chốt trong code

- Chỉ MANAGER / ADMIN gọi được; role khác 403. Manager chỉ thấy workspace có `manager_id` của mình; workspace của Manager khác trả 404
  (như project khác, không lộ là có tồn tại). ADMIN thấy và thao tác mọi workspace (ADR-034: "chỉ MANAGER/ADMIN … thêm thành viên").
- Chỉ thêm tài khoản **ENGINEER / REVIEWER đang hoạt động**, chưa là thành viên (ADR-035). Ô tìm chỉ liệt kê những người đó, tối đa 20.
- Workspace `ARCHIVED`: vẫn xem được, không thêm / bớt.
- Bớt thành viên xoá `workspace_members`; `project_members` của người đó trong workspace xoá theo FK CASCADE (ADR-037).
- **Người đang làm chủ project trong workspace chưa bớt được** (chọn của lần này): chưa có luồng chuyển chủ project, bớt đi sẽ để project
  thuộc workspace mà chủ không còn ở đó. Cần nhóm xác nhận; nếu muốn cho bớt thì phải định nghĩa project đó đi đâu.
- Thêm / bớt chịu hạn mức ghi (`limitWrites`, bucket `workspace_member`) và ghi audit `workspace.member_add` / `workspace.member_remove`.

## Ngoài phạm vi (còn trong TD-30)

- Thành viên workspace **chưa giới hạn dữ liệu người đó thấy**: app vẫn chạy trên một project chung. Trang chi tiết có ghi chú này.
- Admin tạo workspace / gán Manager: chưa có API. Seed `BootstrapService` gán `manager_id` = người chạy seed (ADMIN), nên muốn thử bằng
  tài khoản MANAGER phải đổi `manager_id` (máy dev: `UPDATE workspaces SET manager_id = <id manager>`).
- Giao task, duyệt báo cáo, thông báo `MEMBER_ADDED` (M6–M10): đợt sau.

## Kiểm chứng (23/10/2026)

- `.\mvnw.cmd -B clean test` (JDK 21): 338 test, 0 lỗi, 1 skip có sẵn, `BUILD SUCCESS`. Mới: `WorkspaceServiceTest` (12 test: phạm vi
  Manager/ADMIN, 404 workspace người khác, role được thêm, tài khoản khoá, trùng, ARCHIVED, chủ project, bớt người không phải thành viên),
  `WorkspaceSecurityTest` (3 test: 401 khi chưa đăng nhập, 403 cho ENGINEER / REVIEWER / EXPERIENCER ở mọi route, 400 body thiếu, 429 hạn mức).
- Trong `frontend`: `npm run lint`, `npx tsc --noEmit`, `npx next build` qua.
- Chạy thật: MySQL 8.4 + Redis của docker compose (đổi cổng sang 3307 / 6380 bằng file override cục bộ vì máy có sẵn MySQL80 và Memurai),
  backend `spring-boot:run`, `next dev`. Tài khoản `@example.com` tạo bằng `scripts/create_admin.py`.
  - API (curl): Manager 1 thấy 1 workspace, ADMIN thấy 2; ENGINEER 403; Manager 2 đọc / thêm vào workspace của Manager 1 → 404;
    thêm ENGINEER, REVIEWER → 201; thêm lại → 400 "đã là thành viên"; thêm EXPERIENCER → 400; bớt chủ project → 400 kèm tên project;
    bớt người ở 1 project → `removed_project_memberships: 1` và `project_members` còn 0 dòng của người đó.
  - UI (Playwright + Edge, không mock API): Manager thấy mục Workspace, danh sách không có workspace của Manager 2, chi tiết có nút "Bớt"
    khoá ở dòng chủ project, bớt rồi tìm và thêm lại được; ENGINEER không có mục Workspace, vào thẳng `/workspace` thấy thông báo chặn;
    ADMIN thấy cả hai workspace. Không có lỗi JS trên trang. Chưa đối chiếu Figma: repo không có frame cho màn Manager.
