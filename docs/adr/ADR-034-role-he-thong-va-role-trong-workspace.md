# ADR-034 — Role hệ thống (ADMIN / MANAGER / EXPERIENCE) và role trong workspace (ENGINEER / REVIEWER); bỏ forum

**⛔ Superseded by [ADR-035](ADR-035-nam-role-he-thong-bo-cau-hinh-xe-va-meomeo.md) (06/10/2026)** — 5 role hệ thống, mỗi người một role.
**Trạng thái:** Proposed 05/10/2026 (TrungDQ, nhánh `trungdam`; DB đã làm, phân quyền theo workspace chưa — TD-30)
**Phạm vi:** FE-01, FE-02, FE-04, FE-14. **Thay** ADR-030 (role ADMIN/EXPERT/ENGINEER và forum AEB).

## Bối cảnh

TrungDQ vẽ lại sơ đồ role (05/10) và chốt:

- **EXPERIENCE** ("EXP" trên sơ đồ — *Experience*, **không phải** Expert/chuyên gia của ADR-030) là người dùng
  thường: ai tự đăng ký cũng là EXPERIENCE. EXPERIENCE tạo được project nhưng **không** tạo
  được workspace; project EXPERIENCE tạo **không thuộc workspace nào**.
- **MANAGER** do Admin cấp: tạo workspace, quản lý người (thêm vào workspace).
- **ENGINEER** và **REVIEWER** là vai trò **trong một workspace**, do Manager giao. Engineer tạo project và
  làm việc kỹ thuật; Reviewer chỉ duyệt — chính là người Accept/Reject candidate AEB ở bước 6. Ra khỏi
  workspace thì người đó làm việc bình thường như EXPERIENCE.
- Một người được ở nhiều workspace, nhưng trong **một** workspace chỉ có **một** role.
- **Admin** như cũ.
- **Không làm forum nữa.**

Trước đó (ADR-030): role hệ thống ADMIN / EXPERT / ENGINEER, tự đăng ký = ENGINEER, ENGINEER tự Accept/Reject,
forum AEB 2 bảng, `project_members` (OWNER/ENGINEER/EXPERIENCE, chưa có code). App chạy trên **một** project
(`views.current_project` lấy project ACTIVE đầu tiên).

## Lựa chọn

1. Giữ ENGINEER/REVIEWER là role hệ thống — loại: không diễn đạt được "Engineer ở workspace A, Reviewer ở
   workspace B", và "ra khỏi workspace thì làm bình thường".
2. Gắn role theo **project** (`project_members`) — loại: Manager quản lý người theo workspace; gán từng
   project nhân số dòng và dễ lệch.
3. **Role hệ thống ADMIN/MANAGER/EXPERIENCE + role trong workspace ENGINEER/REVIEWER (`workspace_members`)** — chọn.

## Quyết định

| Ai | Role | Ai cấp | Được làm |
|---|---|---|---|
| Admin | hệ thống `ADMIN` | script trên máy chủ | Quản trị toàn hệ thống, cấp MANAGER |
| Manager | hệ thống `MANAGER` | Admin (`scripts/create_admin.py --role MANAGER`) | Tạo workspace, thêm/bớt ENGINEER/REVIEWER |
| Experience | hệ thống `EXPERIENCE` | tự đăng ký | Project cá nhân: tạo, chạy, kiểm thử, tự quyết định; không tạo workspace |
| Engineer | `ENGINEER` trong workspace | Manager | Trong workspace: tạo project, chạy, tạo candidate, tạo regression |
| Reviewer | `REVIEWER` trong workspace | Manager | Trong workspace: chỉ Accept / Reject / yêu cầu kiểm thêm |

DB (migration 003, 38 → 36 bảng):

- `roles` seed ADMIN / MANAGER / EXPERIENCE; tài khoản ENGINEER cũ chuyển sang EXPERIENCE; xoá role ENGINEER.
- `workspace_members (workspace_id, user_id, member_role ENUM('ENGINEER','REVIEWER'), added_by)` — khoá chính
  (workspace, user) ép một role mỗi người trong một workspace. Manager là `workspaces.owner_id`.
- `projects.workspace_id` cho phép NULL = project cá nhân; cột sinh `personal_owner_key` + UNIQUE chặn một
  người có hai project cá nhân trùng tên.
- Xoá `project_members`, `forum_posts`, `forum_comments`; `notifications.type` bỏ loại forum, thêm
  `WORKSPACE_MEMBER_ADDED` / `WORKSPACE_MEMBER_REMOVED`.

Luật phải ép ở API khi làm TD-30 (DB không ép được vì phụ thuộc role):

- chỉ MANAGER/ADMIN tạo workspace và thêm thành viên;
- trong project thuộc workspace: chỉ ENGINEER tạo/chạy/tạo candidate, chỉ REVIEWER quyết định; người không
  phải thành viên thì không thấy project;
- project cá nhân: chỉ người tạo thấy và làm mọi bước, kể cả quyết định;
- ra khỏi workspace (xoá dòng `workspace_members`) là mất quyền trong mọi project của workspace đó.

## Hệ quả

- **Tạm thời (đến khi xong TD-30):** app vẫn chạy trên một project; `WRITE_ROLES = {ADMIN, EXPERIENCE}` — người tự
  đăng ký làm được cả vòng như trước, tài khoản chỉ mang MANAGER thì chỉ đọc. Phân tách Engineer/Reviewer chưa
  có hiệu lực: luật "không bao giờ tự Accept" vẫn giữ (cần lý do + xác nhận), nhưng chưa bắt người khác duyệt.
- TD-30 là việc lớn: chuyển app sang nhiều project (mọi API nhận project, kiểm quyền theo workspace), API
  workspace/thành viên cho Manager, màn chọn workspace/project ở frontend.
- FE-02 (TD-28) gồm thêm: Admin cấp/thu hồi MANAGER; Manager quản lý thành viên workspace.
- Mất forum: FE-14 "knowledge base" chỉ còn Meomeo Agent (`knowledge_chunks`).

## Kiểm chứng (05/10)

[Exec plan](../exec-plans/completed/2026-10-05-role-theo-workspace.md).
