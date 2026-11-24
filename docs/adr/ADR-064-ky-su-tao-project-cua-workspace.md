# ADR-064 — Kỹ sư tạo project của workspace và làm việc theo project của workspace mình thuộc về

**Trạng thái:** Accepted 24/11/2026 — theo yêu cầu trực tiếp của người dùng: Kỹ sư (ENGINEER) tạo được project.
**Thay thế một phần:** phần "Kỹ sư chạy trên một project chung" của [ADR-034](ADR-034-role-he-thong-va-role-trong-workspace.md) và [ADR-035](ADR-035-nam-role-he-thong-bo-cau-hinh-xe-va-meomeo.md) (TD-30); mở rộng cách chọn project theo workspace của [ADR-048](ADR-048-pham-vi-workspace-reviewer.md) sang Kỹ sư.

## Bối cảnh

Project của workspace chỉ có một: project nhóm do `POST /bootstrap` tạo. Chỉ Experiencer tạo được project (cá nhân). Trang workspace và tài liệu thiết kế (UC-70) đã mô tả "Kỹ sư trong workspace tự tạo project; Quản lý không tạo project", nhưng API chưa có.

## Quyết định

- `POST /api/v1/vehicsim/projects` nhận thêm `workspace_id`. **Experiencer** để trống (project cá nhân, như cũ; gửi `workspace_id` bị từ chối `PERSONAL_HAS_NO_WORKSPACE`). **Kỹ sư** bắt buộc gửi `workspace_id` của một workspace **đang hoạt động mà mình là thành viên** (`WORKSPACE_REQUIRED`, `WORKSPACE_NOT_MEMBER`). ADMIN, MANAGER, REVIEWER không tạo được project (`CREATE_ROLE_NOT_ALLOWED`).
- Project của workspace dùng cùng bộ khởi tạo với project cá nhân: xe được hỗ trợ, baseline AEB v1.0 (TTC 1,5 s). Tên là duy nhất **trong workspace** (`NAME_DUPLICATE_WORKSPACE`); người tạo ghi ở `created_by_user_id`, không thêm dòng `project_members`.
- Kỹ sư chọn project như Reviewer: `ProjectAccess` đọc header `X-VehicSim-Project` trong các project thuộc workspace mình là thành viên (`ReviewerScope`), không còn rơi về project nhóm chung. Không thuộc workspace nào thì báo "cần được Quản lý thêm vào workspace". `GET /vehicsim/reviewer/projects` mở cho cả Kỹ sư để lập danh sách chọn.
- Chưa mở cho Kỹ sư: sửa, lưu trữ, xoá, `adopt` project (vẫn chỉ chủ project cá nhân là Experiencer). ADMIN và MANAGER vẫn dùng project nhóm chung (TD-30 còn cho hai role này).

## Hệ quả và kiểm chứng

Frontend: trang `/workspace/{id}` có nút "+ Tạo project" cho Kỹ sư là thành viên (tên, mô tả, xe); tạo xong mở ngay project đó. Thanh bên hiện ô chọn project cho Kỹ sư khi có hơn một project. Không đổi schema, không cần migration.

`ProjectServiceEngineerCreateTest` (tạo trong workspace của mình, trùng tên theo workspace, thiếu hoặc sai workspace, role khác bị từ chối, Experiencer không chọn workspace), `ProjectSecurityTest#onlyExperiencersAndEngineersCreateProjects`, `ProjectSecurityTest#theCreatorRoleReachesTheServiceTogetherWithTheWorkspaceChoice`, `ReviewerScopeTest#engineerWorksInTheProjectsOfItsOwnWorkspacesAndNeverFallsBackToTheTeamProject`, `VehicSimSecurityTest#onlyReviewerAndEngineerCanDiscoverTheirWorkspaceProjectsWithoutResolvingTheSelectedProject`. Kiểm thật trên app ngày 24/11: tạo qua API và qua giao diện bằng tài khoản Kỹ sư của workspace QA.
