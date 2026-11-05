# Audit UI/UX Admin — 04/11/2026

Phạm vi: đợt 1, chỉ khung trang và điều hướng. Git đầu đợt sạch, nhánh `chuvv`.
Audit dựa trên source và tài liệu trong repo, không kết nối DB hoặc sửa dữ liệu thật.

## Nguồn đã đối chiếu

- `AGENTS.md`, `CLAUDE.md`, hướng dẫn frontend, hướng dẫn cập nhật gói Java và quy tắc đặt tên §7.
- `docs/vehicsim/architecture.md`, `database-schema.md`, `docs/exec-plans/tech-debt-tracker.md`.
- ADR-035, ADR-038, ADR-045; bàn giao `docs/exec-plans/completed/2026-11-02-admin-role.md`.
- `database/mysql/01_schema.sql`, migrations 004 và 012; entity User, Role, Workspace, TechReference.
- AdminManagement, ba page Admin, redirect /admin, adminApi, API client, AuthGate, AuthContext,
  AppLayoutWrapper, VehicSimShell, VehicSimSidebar, VehicSimContext, NotificationBell.
- AdminController → AdminService → AdminRepository; AdminRequests; SecurityConfig, VehicSimAccess;
  đối chiếu quyền ghi thành viên ở WorkspaceController; AuditLog và AdminSecurityTest/AdminServiceTest.
- Tài liệu Next cài tại `frontend/node_modules/next/dist/docs/`: layouts/pages, CSS, accessibility,
  metadata (Server Components, title/template). CSS mới dùng CSS Modules để tránh ảnh hưởng khi đổi route.

Không tìm thấy Final Report/SRS/permission matrix gốc dạng PDF/DOCX/XLSX trong repo.
Hai tài liệu `report7-*baseline*` chỉ nói màn baseline; không thay thế đặc tả Admin.
UC dưới đây lấy từ bàn giao Admin và đối chiếu code; chưa xác nhận với Report 7 gốc.
Không được cung cấp URL/key/snapshot Figma Admin nên chưa thể đối chiếu thiết kế đó.

## Truy vết chức năng đang có

Mọi API dưới đây có tiền tố `/api/v1/vehicsim/admin`. `adminApi` gọi API client có Bearer token.
GET danh sách nhận `q,status,role,page,page_size,sort`; trả `{items,total,page,page_size}`.
Repository dùng truy vấn tham số, COUNT + LIMIT/OFFSET; UI yêu cầu 20 dòng, không tải toàn DB.

| UC | Route/UI | Controller → Service → Repository | DB / hành vi | Phân loại |
|---|---|---|---|---|
|08|/admin/users, tìm/lọc/sắp xếp/phân trang|GET /users → list → list(users)|users JOIN roles, tên/email/role/active/ngày tạo|KEEP dữ liệu; REDESIGN bảng ở đợt sau|
|09|Dialog Thêm mới tài khoản|POST /users → createUser → createUser|normalize email, BCrypt, role cố định, active; password 8 ký tự–72 byte|KEEP; REDESIGN form đợt sau|
|10|Dialog Chỉnh sửa tài khoản|GET /users/{id} → detail → user; PUT → updateUser → updateUser|email/tên/role/is_active; kiểm self/dependencies; auth_version thu hồi phiên|KEEP; REDESIGN form/confirmation đợt sau|
|11|/admin/tech-references|GET /tech-references → list → list(tech-references)|tech_references; tìm mã/tên, lọc loại/bật tắt|KEEP; REDESIGN đợt tài liệu kỹ thuật|
|12|Dialog thêm tài liệu|POST /tech-references → createReference → createReference|mã/tên/loại, metadata nguồn; chỉ CONSTANT có giá trị; tạo luôn bật|KEEP; REDESIGN đợt sau|
|13|Dialog sửa tài liệu|GET /tech-references/{id} → detail → reference; PUT → updateReference → updateReference|bật/tắt, không xóa; DECIMAL(30,12) trả chuỗi giữ độ chính xác|KEEP; REDESIGN đợt sau|
|15|/admin/workspaces|GET /workspaces → list → list(workspaces)|workspaces JOIN manager; count workspace_members/projects thật|KEEP; REDESIGN đợt workspace|
|16|Dialog tạo workspace, tìm Manager|POST /workspaces → createWorkspace → createWorkspace|name/description/manager_id; Manager ACTIVE; notification trong transaction|KEEP; REDESIGN đợt workspace|
|17|Dialog sửa workspace|GET /workspaces/{id} → detail → workspace; PUT → updateWorkspace → updateWorkspace|chỉ ACTIVE; đổi Manager gửi thông báo; không sửa thành viên/project/task|KEEP; REDESIGN đợt workspace|
|Dùng lại auth/profile|/login, /profile, /forgot-password|/api/v1/auth/* qua AuthContext/API client|đăng nhập, hồ sơ, đổi/quên mật khẩu|KEEP; chỉ thêm lối điều hướng|
|Dùng lại thông báo|NotificationBell|GET notifications, thao tác đánh dấu đã đọc qua vehicsimApi|notifications theo user hiện tại|KEEP component và API|

## Phạm vi quyền và hành động nhạy cảm

- Mỗi user một role hệ thống: ADMIN/MANAGER/ENGINEER/REVIEWER/EXPERIENCER. Role là enum cố định,
  không có API cấu hình role/permission. Đổi role tài khoản ở user editor, không tạo module role mới.
- SecurityConfig chặn toàn bộ `/admin/**` API với role khác ADMIN; controller gọi requireAdmin.
  Các POST/PUT dùng limitWrites(actor,"admin"). Frontend có AuthGate; shell kiểm đăng nhập.
- User không tự đổi role/khóa mình. Backend chặn khóa/đổi role nếu còn quản lý workspace;
  đổi role còn kiểm workspace membership, project ownership, task chưa DONE.
  Đổi email/role/active làm tăng auth_version. Không có reset password trong Admin editor.
- Sửa có bước xác nhận, busy disable và lỗi giữ dữ liệu; chỉ thông báo thành công sau API trả thành công.
  Đợt 1 giữ nguyên toàn bộ prepare/save/edit/query/pagination/validation/confirmation.
- Admin quản trị workspace nhưng không thêm/bớt thành viên: WorkspaceController dùng requireMemberManager.
  `workspaceAccess.ts` giới hạn UI `/workspace` cho MANAGER dù API đọc còn cho ADMIN;
  sidebar Admin chỉ mở `/admin/workspaces`, không thêm link vào màn bị guard chặn.
- Chỉ REVIEWER quyết định recommendation; sidebar mới không cấp thêm quyền duyệt cho Admin.
- Không có DELETE Admin cho ba resource; workspace ARCHIVED không sửa; không có endpoint đổi trạng thái
  workspace trong AdminRequest. Không thêm nút xóa/lưu trữ/khôi phục.
- Không có KPI/dashboard Admin, audit-log read API hay system settings Admin. AuditLog ghi logger,
  không phải bảng hay module xem log. Không dựng chart, số đếm sidebar hoặc chức năng giả.

## Phân loại và cấu trúc UI

| Nhóm | Quyết định |
|---|---|
|KEEP|Ba resource, URL, API/DTO/DB, guards, form fields/handlers, filters/pagination, notification, auth/profile|
|REDESIGN (đợt 1)|Sidebar Admin riêng, mobile navigation, header/breadcrumb, h1/mô tả, container/spacing, focus styles|
|REFACTOR (đợt 1)|Tách header/nav khỏi AdminManagement sang AdminFrame chung ở nested layout; metadata tên từng route|
|FIX (đợt 1)|Mobile trước đây ẩn sidebar nên thiếu lối về app/đăng xuất; thêm các lối này và trạng thái active aria-current|
|OUT OF SCOPE|Redesign bảng/form, backend/schema/security, dashboard giả, role editor, audit/settings chưa có, Analysis/worker/CARLA|

UI cũ lặp điều hướng Admin ở sidebar toàn app và hàng nút trong nội dung; tiêu đề/header nằm trong
component chứa cả CRUD, không có breadcrumb/metadata riêng. Sidebar desktop chứa nhiều mục kỹ thuật
không phục vụ việc quản trị. Trên mobile sidebar bị ẩn, thiếu lối thoát khỏi khu Admin.

UI mới: sidebar chỉ ba resource, các lối về tổng quan và đăng xuất. Header chung
có breadcrumb, nhãn vai trò, hồ sơ và chuông hiện có; mỗi page có một h1 và mô tả phạm vi thực tế.
Dưới 1100px dùng menu details native (keyboard/Escape), cùng danh sách và lối ra; nội dung rộng hơn ở tablet.
Container giới hạn chiều rộng, bảng vẫn tự cuộn ngang ở vùng bảng, không đổi bảng/form.
Chỉ tài khoản Admin trên route Admin trong VehicSimShell dùng sidebar mới; tài khoản khác
truy cập URL Admin bị AuthGate chặn và vẫn giữ sidebar chung như trước. Các nhánh Analysis và trang khác giữ nguyên.
CSS Modules không dùng selector toàn cục. Layout mới vẫn nằm trong VehicSimShell.

## Khoảng trống / điểm cần kiểm tiếp

- Một số mô tả cũ trong architecture/database-schema và ADR-045 còn nói chưa có user API hoặc Admin ghi
  thành viên. Code Admin 02/11 và WorkspaceController hiện tại khác mô tả đó; ưu tiên code và bàn giao mới,
  không sửa quyết định/permission trong đợt UI.
- Confirmation hiện chỉ nói chung về lưu; cần hiển thị rõ bản ghi/ảnh hưởng trong đợt form.
- Manager picker giới hạn 100 kết quả và hỗ trợ tìm server; không tự tải tất cả user.
- Loading/error/empty hiện có; UX bảng, sort label user thực tế sắp theo email cần rà ở đợt bảng.
- Figma và E2E backend/DB thật chưa được xác minh trong đợt này. Không tái sử dụng dữ liệu QA cá nhân cũ.
- Đợt 2 theo kế hoạch gốc là Dashboard; vì không có dashboard/KPI Admin, chỉ xác định trang vào và đường tắt
  từ chức năng thật nếu tiếp tục. Không tạo thống kê. Các đợt role/audit/settings chỉ làm nếu có backend thật;
  nên dành một đợt riêng cho tài liệu kỹ thuật đã có thay vì thêm module giả.
