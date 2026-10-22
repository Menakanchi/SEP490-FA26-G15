# Role hệ thống + role trong workspace, bỏ forum (05/10/2026)

**Yêu cầu (TrungDQ):** đổi role theo sơ đồ mới — Admin như cũ; Manager (Admin cấp) tạo workspace và quản lý
người; Engineer / Reviewer là vai trò trong workspace do Manager thêm; EXPERIENCE là người tự đăng ký, tạo project
cá nhân (không thuộc workspace), không tạo workspace; một người nhiều workspace nhưng một role mỗi workspace;
Reviewer là người Accept/Reject; không làm forum. **Chốt phạm vi:** thiết kế + DB trước; phân quyền theo
workspace và nhiều project làm sau (TD-30). **Quyết định:**
[ADR-034](../../adr/ADR-034-role-he-thong-va-role-trong-workspace.md) (thay ADR-030).

## Đã làm

1. [x] Schema: `roles` seed ADMIN / MANAGER / EXPERIENCE; bảng `workspace_members` (ENGINEER / REVIEWER, khoá chính
   workspace + user); `projects.workspace_id` cho phép NULL + `personal_owner_key` (UNIQUE tên project cá nhân);
   xoá `project_members`, `forum_posts`, `forum_comments`; `notifications.type` bỏ loại forum, thêm loại
   workspace. 38 → 36 bảng.
2. [x] Migration `003_2026-10-05_role-theo-workspace.sql`: chuyển tài khoản ENGINEER sang EXPERIENCE rồi xoá role
   ENGINEER.
3. [x] Code: tự đăng ký = EXPERIENCE (`users.DEFAULT_ROLE_CODE`); `create_admin.py --role {ADMIN,MANAGER}`;
   `WRITE_ROLES = {ADMIN, EXPERIENCE}` (tạm, TD-30); `tables.py` (`projects.workspace_id` NULL được).
4. [x] Frontend: `Role` = admin / manager / experience / guest; nhãn role; quyền ghi; Trợ lý cho EXPERIENCE hỏi (trước
   chỉ ENGINEER/ADMIN — EXPERIENCE bị chặn nhầm ở giao diện dù backend cho phép).
5. [x] Test: fixture `engineer` là tài khoản tự đăng ký (EXPERIENCE), thêm fixture `manager`; test mới
   `test_registered_experience_user_can_run_but_manager_only_cannot` thay test cũ "EXPERT chạy được như ENGINEER".
6. [x] Tài liệu: ADR-034, ADR-030 đánh dấu superseded, mục lục ADR, database-schema.md (bảng quyền, bảng mới,
   bỏ §forum, migration), architecture.md, AGENTS.md (luật cứng 3), tech-debt (TD-30 mới), README.

## Kiểm chứng

| Kiểm | Kết quả |
|---|---|
| DB dựng mới từ `01_schema.sql` so với bản sao DB dev + migration 003 (cột, index, FK, CHECK, bảng, **nội dung bảng `roles`**) | 0 khác biệt — 36 bảng, 448 cột, 97 FK, 18 CHECK, 166 index |
| Dữ liệu | role trước: ADMIN 1, ENGINEER 1 → sau: ADMIN 1, EXPERIENCE 1, MANAGER 0; 2/2 tài khoản vẫn có role; 1.188 run giữ nguyên |
| Ràng buộc (MySQL 8.4) | 9/9: project cá nhân tạo được; trùng tên project cá nhân cùng chủ bị chặn, khác chủ thì được; thêm ENGINEER được; role thứ hai trong cùng workspace bị chặn; role lạ bị chặn; workspace không tồn tại bị chặn; cùng người ở workspace khác với role khác được; bảng forum không còn |
| Chạy lại 003 | dừng ngay ở lệnh đầu (`Duplicate entry 'MANAGER'`) |
| Backend `ruff` + `pytest` | sạch; 281 passed, 1 skipped |
| Frontend `eslint`, `tsc --noEmit` | sạch |

## Còn lại

- **TD-30** — phân quyền theo workspace và nhiều project (API, màn workspace/thành viên, chọn project).
- TD-28 (FE-02) giờ gồm cả cấp/thu hồi MANAGER và quản lý thành viên workspace.
