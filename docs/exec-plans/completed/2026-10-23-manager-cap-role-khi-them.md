# 23/10/2026 — Manager / Admin cấp role khi thêm thành viên workspace (ADR-045)

Sửa M4 / M5 của [M1–M5](2026-10-23-manager-workspace-thanh-vien.md) theo yêu cầu người dùng: tài khoản tự đăng ký là EXPERIENCER, nên khi
thêm vào workspace Manager / Admin chọn luôn role cho người đó. Quyết định và lý do: [ADR-045](../../adr/ADR-045-manager-cap-role-khi-them-thanh-vien.md).

## Việc làm

- **Schema:** `workspace_members.granted_role ENUM('ENGINEER','REVIEWER') NULL` (`01_schema.sql`, migration
  `010_2026-10-23_manager-cap-role-khi-them.sql`, entity `WorkspaceMember`, `database-schema.md`). Dòng cũ đều NULL.
- **API:** `POST /workspaces/{id}/members` nhận `{"user_id", "role"}` (thiếu `role` → 400); `GET …/member-candidates` chỉ trả EXPERIENCER;
  `DELETE …/members/{userId}` trả thêm `role_reverted`.
- **`WorkspaceService`:**
  - Thêm: role phải là ENGINEER / REVIEWER; tài khoản phải đang hoạt động, chưa là thành viên, đang là EXPERIENCER.
    `setRole` rồi `addMember(…, grantedRole)` trong một transaction; thông báo `MEMBER_ADDED` ghi vai trò và nhắc đăng nhập lại.
  - Bớt: đọc `granted_role` trước khi xoá dòng; trả về EXPERIENCER khi `granted_role` khác NULL, không còn workspace nào và role hiện tại
    vẫn là role đã cấp (Admin đổi khác thì giữ).
- **Frontend `/workspace/[id]`:** nút "+ Thêm thành viên" trên khung Thành viên mở ô tìm ngay trên bảng; mỗi người có thẻ "Experiencer",
  ô chọn vai trò (Kỹ sư / Người duyệt) và nút Thêm khoá tới khi chọn; bớt thì báo "tài khoản trở lại Experiencer".

## Kiểm chứng (23/10/2026)

- `WorkspaceServiceTest`: cấp ENGINEER / REVIEWER (đổi role trước khi thêm dòng, thông báo có vai trò); role cấp lạ / thiếu → 400;
  ADMIN / MANAGER / ENGINEER / REVIEWER không thêm được; bớt khỏi workspace cuối → về EXPERIENCER; còn workspace khác hoặc Admin đã đổi
  role → giữ; role Admin cấp (NULL) → giữ. `WorkspaceSecurityTest`: body thiếu `role` → 400.
- Chạy thật (backend động học, MySQL docker đã chạy migration 010), Python `urllib`:
  ô tìm chỉ ra exp1 / exp2 (EXPERIENCER); thiếu role / role ADMIN / người đã là thành viên → 400; Manager thêm exp1 làm REVIEWER → 201,
  DB đổi REVIEWER, exp1 nhận thông báo "với vai trò Người duyệt"; Manager 2 thêm exp1 vào workspace 2 → 400 "đã là REVIEWER";
  bớt exp1 → `role_reverted: true`, DB về EXPERIENCER; Admin thêm / bớt exp2 tương tự; bớt rev1 (role Admin cấp) → giữ REVIEWER.
- UI (Playwright + Edge, tài khoản ADMIN, không mock API): ENGINEER sẵn có không hiện ở ô tìm; nút Thêm khoá khi chưa chọn vai trò;
  chọn Người duyệt → thêm, bảng hiện "Người duyệt"; bớt → thông báo trở lại Experiencer, tìm lại thấy exp1. Không có lỗi JS.

## Giới hạn

- Một người chỉ vào được một workspace qua đường này (sau khi thêm đã không còn là EXPERIENCER). Cần nhiều workspace thì phải có ADR khác.
- Frontend của người được nâng role giữ role cũ tới khi đăng nhập lại (API đã theo role mới ngay).
- ENGINEER / REVIEWER do Admin cấp (vd. tài khoản dev `eng3@example.com`) không thêm được qua màn này.
