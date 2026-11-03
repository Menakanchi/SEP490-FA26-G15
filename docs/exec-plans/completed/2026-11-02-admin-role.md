# Hoàn thiện Admin — 02/11/2026

Trạng thái: hoàn tất triển khai 9/9 luồng Admin và kiểm thử trên QA riêng; các giới hạn đối chiếu/triển khai DB nằm ở cuối tài liệu.
Phạm vi: UC-08,09,10,11,12,13,15,16,17; dùng lại UC-01,03–07.
Nhánh ban đầu: refactor/package-naming; git ban đầu sạch. Không commit/push.

## Nguồn và discovery

- Nguồn yêu cầu: tệp đính kèm “TASK: IMPLEMENT COMPLETE ADMIN ROLE”.
- Đã tìm trong repo và F:/CodeVipChu, không tìm thấy Report 7 DOCX. Không sửa tài liệu Word gốc; không tuyên bố đã đọc/đối chiếu bảng BR/UC chưa được cung cấp.
- Đã đọc hướng dẫn repo/frontend, đổi gói com.vsos, cấu trúc backend/frontend, migrations 001–011, schema, entity, auth/JWT/security, exception handler, WorkspaceService/repository/controller, notification, sidebar/shell/auth context và API client.
- Stack xác minh từ source: Spring Boot 3.5.16/Java 21, JPA + JDBC, Next.js 16.4.1/React 19, MySQL/Redis.
- Ban đầu thiếu .env và Docker chưa chạy. Sau khi khởi động Docker, đọc metadata DB hiện có: 29 bảng; lưu metadata tại target/admin-qa/existing-schema-metadata.tsv. Không sửa DB hiện có.
- Không có Figma URL hoặc snapshot thiết kế Admin trong workspace được cung cấp. Dùng token/component/khung VehicSim sẵn có; đã xem ảnh browser thật, chưa đối chiếu Figma.

## Bảng kiểm kê TRƯỚC thay đổi

| UC ID | Requirement | Existing Backend | Existing Frontend | Database Support | Missing / trạng thái | Files to Modify |
|---|---|---|---|---|---|---|
|08|List users|auth/me, chưa list Admin|chưa có|users/roles|MISSING: search/filter/page/sort|AdminController/Service/Repository, AdminManagement|
|09|Add user nội bộ|public signup chỉ EXPERIENCER|register|users/roles, email UQ|MISSING: tạo Manager/nội bộ|AdminRequests + Admin stack|
|10|Edit user|chỉ profile|profile|is_active, role_id, workspace FK|MISSING: role/lock/dependency/revoke|Admin stack, User, JwtService|
|11|List references|entity + seed|chưa có|tech_references|MISSING: list/filter/search|Admin stack|
|12|Add reference|chưa có|chưa có|code UQ; chưa kind/name UQ|MISSING: metadata/validation/unique name|Admin stack, migration 012|
|13|Edit reference|chưa có|chưa có|is_active|MISSING: edit/enable/disable|Admin stack|
|15|List workspace|WorkspaceService.listAll|/workspace (Manager)|workspaces/members/projects|PARTIAL: thiếu Admin search/filter/edit|Admin stack, sidebar|
|16|Add workspace|chỉ BootstrapService, gán người seed làm Manager|chưa có|manager_id required|MISSING: Manager selector + notification|Admin stack, NotificationService dùng lại|
|17|Edit workspace|chưa có|chưa có|ACTIVE/ARCHIVED|MISSING: update/reassign/transaction|Admin stack|
|01,03–07|Auth/profile chung|AuthService/JWT/OTP|login/profile/forgot-password|users, Redis|PARTIAL: có code/test, cần regression|giữ auth, bổ sung test|

## Kết quả truy vết SAU thay đổi

Mỗi hàng Admin dưới đây đã được kiểm tra bằng HTTP thật/MySQL thật và browser trong môi trường QA riêng.

| UC ID | Frontend | Backend | Database | Test / bằng chứng |
|---|---|---|---|---|
|08|/admin/users, search/role/status/page/sort|AdminController.list → AdminService.list → AdminRepository.list|users JOIN roles, chỉ select field an toàn|AdminSecurityTest, TestAdminIntegration, browser list/search|
|09|Tạo mới từ /admin/users|createUser; BCrypt, email normalize/UQ, role enum|INSERT users, role_id|AdminServiceTest, HTTP create/duplicate/invalid role, browser create|
|10|Chỉnh sửa từ /admin/users; xác nhận lưu|updateUser; self/dependency guard; auth_version revoke|UPDATE users, đọc ownership/membership/task|AdminServiceTest, JwtServiceTest, HTTP role/lock/unlock, browser edit/refresh|
|11|/admin/tech-references, search/type/status/page/sort|list tech-references|tech_references|HTTP filter, browser data thật|
|12|Tạo mới tài liệu + metadata nguồn|createReference; decimal/type/url/unique validation|INSERT tech_references; UQ code, kind/name|AdminServiceTest, AdminSecurityTest, HTTP và browser create|
|13|Chỉnh sửa + checkbox bật/tắt, xác nhận|updateReference; không có hard delete|UPDATE tech_references|HTTP invalid numeric/disable/no-delete; browser edit/disable, đọc/sửa đủ 30 chữ số|
|15|/admin/workspaces, search/status/page/sort, counts|list workspaces|counts thực từ workspace_members/projects|HTTP tìm Manager/status, browser list|
|16|Tạo mới workspace, chọn/tìm Manager|createWorkspace; khóa row Manager, notification cùng transaction|INSERT workspaces + notifications|HTTP invalid Manager/duplicate/rollback/concurrent; browser create + form error|
|17|Chỉnh sửa workspace, chọn lại Manager|updateWorkspace; ACTIVE guard; không sửa bảng con|UPDATE name/description/manager_id; notification cho Manager mới|HTTP giữ members/projects/tasks, archived guard, browser edit|
|01|/login → /admin/users|AuthService.login dùng lại|users/Redis|Java auth/security tests + đăng nhập browser thật|
|03|/profile|AuthService.changePassword dùng lại|password_hash, JWT pwv|HTTP Admin đổi password; token cũ 401, token mới 200|
|04,05|/forgot-password (luồng hiện có)|OTP/forgot/reset dùng lại|Redis OTP hash, users|Java auth/OTP/password tests; chưa gửi SMTP thật|
|06,07|/profile|GET/PUT auth/me dùng lại|users|HTTP Admin view/update profile; role giữ ADMIN|

## API thực tế

Tiền tố /api/v1/vehicsim/admin; chỉ ADMIN:

| Method | Path | Hành vi |
|---|---|---|
|GET|/users, /workspaces, /tech-references|Danh sách {items,total,page,page_size}|
|GET|/users/{id}, /workspaces/{id}, /tech-references/{id}|Chi tiết|
|POST|/users, /workspaces, /tech-references|Tạo, trả 201|
|PUT|/users/{id}, /workspaces/{id}, /tech-references/{id}|Cập nhật đầy đủ, trả 200|

Query: q (tối đa 100), status, role (users: role code; references: ref_type), page, page_size (1–100), sort (newest/oldest/name). Trang mặc định 1, 20 dòng, mới nhất trước.
Status workspace: ACTIVE/ARCHIVED; user/reference: ACTIVE/INACTIVE ánh xạ is_active.
Reference ref_value trả chuỗi thập phân chính xác (hoặc null), tránh làm tròn DECIMAL(30,12) qua JavaScript number.
Không có DELETE. Chưa đăng nhập/token sai 401; role khác 403 trước validation body.
Ghi Admin qua VehicSimAccess.limitWrites. POST/DELETE /workspaces/{id}/members chỉ MANAGER; ADMIN bị 403.
Auth/profile giữ /api/v1/auth/*.

## Quyết định và xung đột được xử lý

- Giữ enum PRINCIPLE/THEORY/CONSTANT/DEFINITION/UNIT/STANDARD và is_active hiện hành. UI tiếng Việt ánh xạ bật/tắt. Chỉ CONSTANT có ref_value theo CHECK; CONSTANT mới yêu cầu giá trị số. Không tự đặt biên vật lý cho hằng số.
- Workspace không có general_configuration: chỉ name/description/manager_id. Không thêm field giả.
- Tên workspace unique toàn hệ thống theo yêu cầu mới; schema cũ chỉ unique(manager_id,name). Thêm UQ(name), giữ UQ cũ. Tên reference unique(ref_type,ref_name) theo BR-11 trong yêu cầu. Migration không tự sửa dữ liệu trùng.
- ADMIN không thêm/bớt/cấp role thành viên theo yêu cầu mới; phạm vi Manager ở ADR-045 cũ đã bao gồm Admin. Endpoint ghi thành viên nay kiểm riêng MANAGER. Giữ API đọc workspace và luồng task/report hiện có.
- Không tự sửa workspace bootstrap đã gán Admin làm Manager. Khi chỉnh sửa phải chọn Manager hợp lệ; giữ nguyên mọi dữ liệu cũ.
- Không tự đổi role/khóa chính mình. Chặn đổi role/khóa tài khoản còn quản lý workspace kể cả ARCHIVED. Chặn đổi role khi còn workspace membership/project sở hữu/task mở; cần xử lý các phụ thuộc trước, không tự chuyển/xóa dữ liệu.
- Khóa row users khi gán Manager và thay role; kiểm race trên MySQL thật. Manager thêm thành viên cũng đọc user FOR UPDATE.
- auth_version tăng khi Admin đổi email/role/active hoặc Manager cấp/trả role. JWT av phải khớp DB; token cũ thiếu av được coi là 0. Khóa rồi mở lại không làm token cũ sống lại. Không đưa password_hash/auth_version ra Admin user API.
- Chưa có bằng chứng nguồn gốc Report 7: cần đối chiếu lại BR chi tiết khi được cung cấp. Các lựa chọn trên giữ API/enum đang hoạt động và không tạo dữ liệu giả.

## Migration và dữ liệu

Migration mới: database/mysql/migrations/012_2026-11-02_admin-integrity.sql.
users.auth_version BIGINT UNSIGNED DEFAULT 0; UQ workspaces.name; UQ tech_references(ref_type,ref_name).
Đã đồng bộ schema mới, entity User/Workspace/TechReference và database-schema.md.
Đã chạy trên DB QA mới và DB QA từ schema HEAD trước thay đổi, có dữ liệu users/workspaces/members/projects/tasks.
Preflight chặn tên workspace trùng, rồi chặn tên reference trùng theo kind; khi xử lý trùng trong bản sao QA thì migration qua, dữ liệu con giữ nguyên.
MySQL DDL tự commit: nếu chạy bị gián đoạn sau ALTER, kiểm SHOW CREATE TABLE trước khi tiếp tục. Không chạy lại mù quáng.
**Chưa áp dụng migration lên DB dự án hiện có. Phải sao lưu, kiểm trùng và áp dụng 012 trước khi khởi động backend mới với DB đó.**

## Kiểm chứng đã chạy

- .\mvnw.cmd -B -DskipTests compile: PASS.
- .\mvnw.cmd -B test: PASS, 423 tests, 0 failures/errors, 1 skipped (KinematicParityFullTest, fixture đầy đủ tùy chọn). Log target/admin-qa/java-tests.log.
- Frontend npx.cmd tsc --noEmit: PASS; npm.cmd run lint: PASS; npm.cmd run build: PASS (gồm typecheck).
- node scripts/TestAdminIntegration.mjs: PASS, 101 kiểm tra HTTP/MySQL/Redis thật. Có rollback khi notification lỗi, race tạo trùng và race gán Manager/đổi role; không mock API.
- node scripts/TestAdminMigration.mjs: PASS, 10 kiểm tra trên schema cũ có dữ liệu.
- node scripts/TestAdminBrowser.mjs: PASS, đăng nhập thật, list/search/create/edit/refresh user; Manager selector/create/edit/error giữ form workspace; create/edit/disable reference; non-Admin guard.
- Browser desktop 1440px và mobile 390px. document.scrollWidth = innerWidth = 390. Đã xem ảnh users-desktop, reference-form, references-mobile; sửa chồng lấn filter trên mobile rồi kiểm lại.
- Browser không có lỗi API bất ngờ; một HTTP 400 được tạo chủ ý khi nhập trùng workspace và được kiểm feedback/giữ form.
- git diff --check: PASS. Không sửa mô phỏng/optimization/worker, không chạy CARLA.

Artifacts chỉ ở target/admin-qa (gitignore): api-result.json, migration-result.json, browser-result.json, ảnh users-desktop/workspaces-desktop/workspace-form/references-desktop/reference-form/references-mobile/manager-denied.png.
config.json/state.json chứa mật khẩu/token ngẫu nhiên của QA; không commit hoặc đưa nội dung ra báo cáo.

## File tạo/sửa

Backend mới: controller/system/AdminController.java; dto/auth/AdminRequests.java; repository/common/AdminRepository.java; service/system/AdminService.java.
Backend sửa: config/SecurityConfig.java; security/VehicSimAccess.java, JwtService.java; entity/user/User.java, entity/workspace/Workspace.java, entity/system/TechReference.java; controller/workspace/WorkspaceController.java; repository/workspace/WorkspaceRepository.java; service/notification/NotificationService.java (cập nhật mô tả WORKSPACE_ASSIGNED).
Frontend mới: services/admin.ts; components/admin/AdminManagement.tsx; app/admin/page.tsx; app/admin/users/page.tsx; app/admin/workspaces/page.tsx; app/admin/tech-references/page.tsx.
Frontend sửa: components/VehicSimSidebar.tsx, VehicSimShell.tsx, VehicSimContext.tsx, workspaceAccess.ts; context/AuthContext.tsx; app/workspace/page.tsx, app/workspace/[workspaceId]/page.tsx, app/workspace/[workspaceId]/tasks/page.tsx, app/workspace/[workspaceId]/reports/page.tsx (thông báo phân quyền).
Tests mới: AdminServiceTest.java, AdminSecurityTest.java; scripts/TestAdminIntegration.mjs, TestAdminMigration.mjs, TestAdminBrowser.mjs.
Tests sửa: JwtServiceTest.java, WorkspaceSecurityTest.java.
Dữ liệu/tài liệu: schema, migration 012, database-schema.md, tech-debt-tracker.md và bản bàn giao này.

## Chạy và nghiệm thu thủ công

1. DB mới dùng schema hiện tại. DB đã có dữ liệu: sao lưu, đọc điều kiện migration 012, kiểm trùng rồi áp dụng 012; không reset volume.
2. Dùng cấu hình cá nhân theo CLAUDE.md, chạy scripts/dev-up.cmd (không cần CARLA cho Admin).
3. Tài khoản Admin bootstrap theo scripts/CreateAdmin.java và hướng dẫn repo; không đăng ký công khai role ADMIN.
4. Đăng nhập Admin → /admin/users. Tạo Manager bằng mật khẩu tự nhập; thử email trùng và đổi role/khóa chính mình.
5. /admin/workspaces: tạo workspace với Manager đang hoạt động; reload; đổi Manager và kiểm tra chuông thông báo tài khoản được giao. Workspace ARCHIVED không chỉnh sửa được.
6. /admin/tech-references: tạo CONSTANT với số hợp lệ và metadata nguồn; thử mã/tên trùng; sửa và bật/tắt qua xác nhận. Không có xóa.
7. /profile: xem/sửa tên và đổi mật khẩu. Token trước đổi mật khẩu hoặc trước đổi quyền/khóa phải bị từ chối.
8. Đăng nhập Manager/Engineer/Reviewer/Experiencer: không thấy mục Quản trị; mở thẳng /admin/users bị chặn; gọi Admin API trả 403.

## Giới hạn còn lại

- Không có báo cáo Word gốc và thiết kế Figma Admin để đối chiếu trực tiếp.
- SMTP gửi mail thật cho forgot/reset chưa chạy; chỉ chạy test độc lập hiện có, không gọi provider thật.
- Migration chưa áp dụng vào DB dự án hiện có; dữ liệu cũ trùng tên cần chủ dữ liệu quyết định đổi tên trước.
- TD-30 vẫn còn: Admin quản lý workspace không hoàn thiện cách ly project/workspace cho mô phỏng, project membership, task cập nhật bởi assignee hay nộp báo cáo. Không tuyên bố đã giải quyết cách ly dữ liệu.
- Test đầy đủ parity tùy chọn của core vẫn skipped; không thuộc thay đổi Admin.