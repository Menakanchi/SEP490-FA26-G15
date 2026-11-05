# Admin đợt 6 — Audit Roles & Permissions

Trạng thái: hoàn tất audit đợt 6; không áp dụng redesign module độc lập. Nhánh chuvv; Git đầu đợt sạch.
Nguồn: yêu cầu tiếp tục đợt 6; yêu cầu gốc quy định
“Chỉ thực hiện nếu module thực sự tồn tại.”
Không tự làm đợt 7.

## Kết luận phạm vi

Không có module Roles & Permissions riêng để redesign. Không tạo trang, API, permission matrix
có thể chỉnh sửa hoặc bộ cấu hình role mới. Phần gán role thật trong form tài khoản đã được
redesign ở [đợt 4](../completed/2026-11-04-admin-user-forms-dot-4.md);
giao Manager workspace đã làm ở [đợt 5](../completed/2026-11-04-admin-workspaces-dot-5.md).
Đợt 6 chỉ audit lại ranh giới quyền, kiểm chứng code hiện có và ghi bàn giao; không sửa UI/backend.

## Nguồn đã đọc và bằng chứng

- AGENTS.md, CLAUDE.md, frontend/AGENTS.md; yêu cầu gốc đợt 6 và bàn giao đợt 5.
- [Audit Admin](../../vehicsim/audit-redesign-admin-2026-11-04.md),
  [ADR-035](../../adr/ADR-035-nam-role-he-thong-bo-cau-hinh-xe-va-meomeo.md),
  [ADR-045](../../adr/ADR-045-manager-cap-role-khi-them-thanh-vien.md).
  Hai ADR đang Proposed, có mô tả lịch sử khác code; không suy quyền từ mô tả cũ.
- RoleCode.java, Role.java, RoleRepository.java, 01_schema.sql; SecurityConfig,
  VehicSimAccess, AdminController/Service, WorkspaceController/Service và workspaceAccess.ts.
- Các route frontend/src/app/admin, AdminShell, AdminUserEditor, adminUsersQuery.
- AdminSecurityTest, AdminServiceTest, WorkspaceSecurityTest; test quyền kỹ thuật hiện có.

| Hạng mục | Bằng chứng từ code | Quyết định |
|---|---|---|
| Role list | RoleCode và roles.code ENUM gồm ADMIN/MANAGER/ENGINEER/REVIEWER/EXPERIENCER; users.role_id NOT NULL FK | 5 role cố định, mỗi tài khoản một role; không CRUD role |
| Admin routes | /admin, /admin/users, /admin/workspaces, /admin/tech-references và layout | Không có trang roles/permissions |
| Admin API | AdminController chỉ users/workspaces/tech-references; service/client cùng allowlist | Không có GET/POST/PUT roles/permissions hoặc API chỉnh quyền tùy ý |
| Schema quyền | roles là danh mục, users.role_id; không permissions/role_permissions/user_permissions trong schema hiện tại | Không dựng permission editor từ tên bảng roles hoặc JpaRepository |
| Gán role tài khoản | POST /admin/users và PUT /admin/users/{id}, UserRequest.role enum | Giữ form gán role hiện có; không tạo luồng song song |
| Xác nhận đổi role | AdminUserEditor review trước/sau/target, cảnh báo thu hồi phiên, self disabled, busy/ref lock, server error giữ draft | Đã có từ đợt 4, giữ nguyên |
| Phụ thuộc | AdminService chặn tự đổi role/khóa, Manager còn workspace, membership/project/task; auth_version tăng khi role/email/active đổi | Giữ backend là nguồn quyết định, không mở thêm quyền |
| Admin guard | SecurityConfig hasRole ADMIN, requireAdmin, AuthGate admin; writes qua limitWrites | Giữ nguyên authorization, JWT và quota |
| Thành viên workspace | WorkspaceController add/remove gọi requireMemberManager: chỉ MANAGER; workspaceAccess chỉ MANAGER | Không thêm thao tác thành viên cho Admin hoặc chuyển luồng Manager sang Admin |
| Gán role khi thêm thành viên | WorkspaceService chỉ nâng EXPERIENCER sang ENGINEER/REVIEWER, ghi granted_role | Nghiệp vụ Manager hiện có, ngoài đợt Admin |
| Giao Manager workspace | AdminService requireManager active; create/update hiện có | Đã redesign đợt 5 |
| Quyền kỹ thuật/duyệt | requireEngineer: ADMIN/ENGINEER/EXPERIENCER; requireReviewer chỉ REVIEWER | Admin không nhận quyền Accept/Reject qua UI |

RoleRepository kế thừa JpaRepository không đồng nghĩa có REST CRUD role.
Không dùng mô tả “Admin thêm/bớt thành viên” trong ADR-045/service comment để vượt
requireMemberManager hiện hành. Khác biệt mô tả/code đã được ghi ở audit Admin đợt 1;
đợt này không đổi security hoặc quyết định nghiệp vụ.

## Các bước

1. [x] Git sạch và đối chiếu tài liệu/source/schema/route thực tế.
2. [x] Xác định module độc lập không tồn tại, gán role đã có và đã redesign.
3. [x] Chạy checks quyền/luật nghiệp vụ hiện có và RepoDocsTest.
4. [x] Kiểm diff, bổ sung kết quả, chuyển completed và dừng trước đợt 7.

## Kiểm chứng và kết quả

- Đã chạy .\mvnw.cmd -B
  '-Dtest=AdminSecurityTest,AdminServiceTest,WorkspaceSecurityTest,VehicSimSecurityTest,RepoDocsTest'
  '-Dlogging.level.root=WARN' '-Dlogging.level.com.vsos.backend=WARN'
  '-Dlogging.level.org.springframework=WARN' test.
  PASS: 35 tests, 0 failures/errors/skipped (3 Admin security, 13 Admin service,
  5 workspace security, 9 quyền kỹ thuật, 5 repo docs).
- Không sửa hoặc thêm test. MockMvc dùng filter/guard thật với service mock;
  service unit tests mock repository, không gọi MySQL/Redis/provider thật.
- AdminSecurityTest đối chiếu cả 5 role với list/detail/create/update ba resource,
  guest 401/non-Admin 403; WorkspaceSecurityTest giữ chặn Admin ghi thành viên;
  VehicSimSecurityTest giữ chỉ Reviewer quyết định và hạn mức ghi.
- AdminServiceTest giữ self/dependency guard, thu hồi phiên khi role/email/status đổi,
  kiểm Manager active và workspace đã lưu trữ. Không suy kết quả unit test thành E2E.
- RepoDocsTest PASS trước chuyển plan và được chạy lại sau chuyển completed.
- git diff --check và đối chiếu diff frontend/src/database/worker: PASS, không có thay đổi code.
- Không sửa frontend nên không chạy lại lint/TypeScript/build/browser/ảnh ở đợt này.
  Kết quả UI đợt 4/5 là bằng chứng lịch sử, không trình bày như lần chạy mới.
- Không kiểm E2E auth/backend/DB thật hoặc đối chiếu Figma. Không có dữ liệu cá nhân/API ghi thật.

Chỉ thêm file bàn giao này; không migration/dependency/cấu hình máy.
Không git add/commit/push.

## File changes và Git

Modified: không. Deleted: không.
Added: docs/exec-plans/completed/2026-11-04-admin-roles-permissions-dot-6.md.
Git đầu đợt sạch; nhánh chuvv; cuối đợt chỉ có file bàn giao mới, chưa stage.
Không commit/push hoặc chuyển sang đợt tiếp theo.
Commit gợi ý: docs(admin): audit roles and permissions scope.

## Đợt tiếp theo

Đợt 7 — Audit Logs / System Settings, tiếp tục điều kiện chỉ làm chức năng thực sự tồn tại.
Chưa audit/triển khai đợt 7 trong lượt này; không gộp tài liệu kỹ thuật hoặc module khác vào đợt 6.
