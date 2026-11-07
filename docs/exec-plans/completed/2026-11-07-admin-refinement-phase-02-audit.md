# Admin refinement — Phase 02: Admin Audit & UX Strategy

Ngày: 07/11/2026. Nhánh: chuvv. HEAD: cd205a1. Git ban đầu sạch.
Trạng thái: hoàn thành audit, chờ review; chưa triển khai quyết định UX.

## 1. Nguồn và mức độ xác nhận

Đọc [Phase 01](../completed/2026-11-07-admin-refinement-phase-01-cleanup.md),
[audit cũ](../../vehicsim/audit-redesign-admin-2026-11-04.md),
[bàn giao Admin gốc](../completed/2026-11-02-admin-role.md), các bàn giao UI đợt 2–8;
[ADR-035](../../adr/ADR-035-nam-role-he-thong-bo-cau-hinh-xe-va-meomeo.md),
[ADR-038](../../adr/ADR-038-bo-phien-ban-xe-admin-tao-workspace.md),
[ADR-045](../../adr/ADR-045-manager-cap-role-khi-them-thanh-vien.md),
[database-schema](../../vehicsim/database-schema.md),
[schema](../../../database/mysql/01_schema.sql) và
[migration 012](../../../database/mysql/migrations/012_2026-11-02_admin-integrity.sql).

Đối chiếu AdminController → AdminService → AdminRepository, AdminRequests,
SecurityConfig/VehicSimAccess, WorkspaceController, RegressionController;
frontend routes, AdminDashboard/Shell, ba table/editor, query helpers, adminApi,
AuthGate/AuthContext/API client, workspaceAccess và NotificationBell.
Stack thực tế: Spring Boot 3.5.16/Java 21, JDBC/JPA, MySQL/Redis,
Next.js 16.4.1/React 19.2.8/TypeScript (pom.xml và frontend/package.json).

**Chưa có Final Report/SRS/Actors/BR/FR/Use Case Specifications/permission matrix
gốc trong repo; tìm tên Final/SRS/Requirement và DOCX/PDF không thấy tài liệu đó.**
Document Control không có phiên Word đang kết nối. Hai tài liệu report7-baseline
chỉ mô tả baseline. Vì vậy, UC và trách nhiệm dưới đây truy từ bàn giao + code,
chưa chứng nhận khớp đặc tả gốc. Không tự đặt BR/FR ID hoặc coi ADR Proposed là Accepted.
Không có Figma Admin để đối chiếu; audit này dựa trên source, không phải usability study.

Điểm truy vết: [Dashboard](../../../frontend/src/components/admin/AdminDashboard.tsx),
[Shell](../../../frontend/src/components/admin/AdminShell.tsx),
[Controller](../../../src/main/java/com/vsos/backend/controller/system/AdminController.java),
[Service](../../../src/main/java/com/vsos/backend/service/system/AdminService.java),
[Repository](../../../src/main/java/com/vsos/backend/repository/common/AdminRepository.java),
[DTO](../../../src/main/java/com/vsos/backend/dto/auth/AdminRequests.java).

## 2. Trách nhiệm và bản đồ chức năng hiện có

Đối tượng chính: ADMIN quản trị tài khoản, giao workspace cho Manager và duy trì
danh mục tài liệu kỹ thuật. API Admin chỉ nhận role ADMIN; các thao tác ghi qua
limitWrites. Mỗi người một role hệ thống cố định; Admin không chỉnh mô hình quyền.

| UC theo bàn giao | UI và API thực tế | Dữ liệu/luật chính | Trạng thái từ source |
|---|---|---|---|
| 08 — danh sách tài khoản | /admin/users; GET /admin/users | users JOIN roles; tên/email/role/active; tìm/lọc/sort/page | Có UI/API |
| 09 — tạo tài khoản | UserEditor; POST /admin/users | Họ/tên/email, role, mật khẩu BCrypt; kiểm trùng và 72 byte UTF-8 | Có UI/API |
| 10 — sửa tài khoản | GET/PUT /admin/users/{id} | Email/tên/role/is_active; self/dependency guards; thu hồi phiên khi đổi email/role/active | Có UI/API/review |
| 11 — danh sách tài liệu | /admin/tech-references; GET cùng resource | tech_references; tìm mã/tên, lọc loại/trạng thái, sort/page | Có UI/API |
| 12 — tạo tài liệu | ReferenceEditor; POST cùng resource | 6 loại, metadata nguồn; CONSTANT bắt buộc số; tạo luôn bật | Có UI/API |
| 13 — sửa/bật/tắt tài liệu | GET/PUT cùng resource/{id} | UQ mã và loại+tên; DECIMAL(30,12) trả chuỗi; giữ bản ghi khi tắt | Có UI/API/review |
| 15 — danh sách workspace | /admin/workspaces; GET cùng resource | workspace/Manager; count thành viên/project thật; lọc/sort/page | Có UI/API |
| 16 — tạo/giao workspace | WorkspaceEditor; POST cùng resource | name/description/manager_id; MANAGER active; thông báo cùng transaction | Có UI/API/review |
| 17 — sửa/giao lại workspace | GET/PUT cùng resource/{id} | Chỉ ACTIVE; đổi Manager mới thông báo; ARCHIVED xem chi tiết | Có UI/API/review |
| Auth/profile dùng chung | /login, /profile, /forgot-password; /api/v1/auth/* | Đăng nhập, hồ sơ, đổi/quên mật khẩu | Có code, không audit lại toàn bộ auth |
| Thông báo cá nhân | Chuông trên header; notifications API | Đọc/đánh dấu đã đọc theo user; polling khi tab visible | Có, không phải audit hệ thống |

API bảng trên rút gọn: tiền tố đầy đủ /api/v1/vehicsim/admin.
List nhận q≤100, status, role, page 1–100000, page_size 1–100, sort newest/oldest/name;
role ở references là ref_type. Trả {items,total,page,page_size}, COUNT + LIMIT/OFFSET.
Sort name của users thực tế là email ASC; UI đang gọi “Email A–Z”.
UI dùng page size 10/20/50/100, query URL, GET detail trước edit, review trước ghi,
dirty-close, busy lock và giữ draft khi lỗi. Đây là kiểm tra code, chưa chạy E2E mới.

| Ranh giới cần giữ | Căn cứ hiện hành |
|---|---|
| Không DELETE ba resource; không archive/restore workspace | AdminController không route DELETE; WorkspaceRequest không status |
| Không tự đổi role/khóa mình; không reset password hộ user | AdminService + UserEditor; mật khẩu sửa qua auth |
| Chuyển Manager trước khi khóa/đổi role nếu còn workspace, kể cả archived | managesWorkspaces không lọc status; role đổi còn kiểm membership/project/task |
| Không thêm/bớt thành viên cho Admin | WorkspaceController gọi requireMemberManager; workspaceAccess chỉ MANAGER |
| Không Accept/Reject khuyến nghị cho Admin | requireReviewer chỉ REVIEWER |
| Không trang Roles/Permissions độc lập | 5 enum role, không REST role/permission CRUD |
| Không Audit Logs/System Settings UI | AuditLog chỉ SLF4J writer; SystemController chỉ context/bootstrap |
| Không coi bootstrap/context/health là Settings hoặc cảnh báo vận hành | Không có cấu hình writer/hàng đợi xử lý tương ứng |

## 3. Audit dashboard hiện tại và độ ưu tiên

AdminDashboard gọi ba list API page=1/page_size=1/sort=newest, chỉ lấy total;
không suy từ items.length, không chart, không polling. Mỗi nguồn có loading/error/0
và refresh; ba request độc lập không phải snapshot giao dịch hay chỉ báo sức khỏe.
Có ba link danh mục và hướng dẫn Manager → workspace với hai link lặp menu.
Đăng nhập ADMIN hiện tới /admin/users, không tới dashboard.

Bảng sau đánh giá từng khối hiện có và đề xuất thường gặp. Tần suất là giả thuyết
từ công việc, chưa có analytics; không dùng giả thuyết này làm dữ liệu sản phẩm.
P0 = cần hoàn thành việc Admin; P1 = hữu ích nhưng không mặc định xây trên Overview;
P2 = tùy chọn; Reject = thiếu nguồn/quyền/nhu cầu hoặc trùng chức năng.

| Thành phần | Người dùng/nhu cầu | Quyết định hoặc hành động hỗ trợ | Tần suất dự kiến | Nguồn thực tế | Mức / vị trí / quyết định |
|---|---|---|---|---|---|---|
| Tổng tài khoản | Admin biết quy mô | Chưa xác định hành động theo tổng mọi trạng thái | Khi kiểm kê | users.total | P1; Move về kết quả list, Remove KPI Overview |
| Tổng workspace | Admin kiểm kê không gian | Tổng gồm archived không nói workspace nào cần xử lý | Khi kiểm kê | workspaces.total | P1; Move về list theo filter, Remove KPI Overview |
| Tổng tài liệu | Admin kiểm kê danh mục | Tổng gồm đã tắt không nói nguồn nào thiếu/sai | Khi kiểm kê | tech-references.total | P1; Move về list, Remove KPI Overview |
| Refresh/loading/error của ba KPI | Admin tải lại số tổng | Phục vụ chính widget bị đề xuất bỏ | Mỗi lần mở/lỗi | Ba GET list | Remove cùng KPI; Keep states ở tác vụ P0 |
| Ba card “Quản lý…” | Admin chuyển danh mục | Lặp đúng menu hiện có, không rút bước CRUD | Mỗi phiên | Route đã có | Reject như khối riêng; Keep navigation P0 ở shell |
| Hướng dẫn thiết lập workspace + 2 quick link | Admin cần Manager hợp lệ | Đúng nghiệp vụ nhưng lặp menu; không hành động trên bản ghi | Lúc tạo/giao lần đầu | requireManager + editor | P1; Move hướng dẫn ngắn vào workspace editor, đã có hint; Remove khối Overview |
| Sidebar/mobile nav, h1/breadcrumb, lối về app/đăng xuất | Admin định vị và chuyển việc | Đến đúng ba workflow, thoát phiên | Mỗi phiên | Session + route | P0; Keep shell, không thêm menu song song |
| Search/filter/sort/page/total theo filter | Admin tìm đúng đối tượng | Mở bản ghi và xử lý đúng mục tiêu | Mỗi tác vụ tra cứu | List API theo query | P0; Keep trang quản lý; total phục vụ kết quả/page |
| Thêm/sửa, xác nhận tác động, lỗi và thành công | Admin hoàn tất tác vụ | Ghi đúng đối tượng, hiểu quyền/phiên/Manager bị đổi | Theo yêu cầu vận hành | GET detail + POST/PUT | P0; Keep editor/list, không thêm create trên Overview |
| Hồ sơ/mật khẩu | Admin quản lý tài khoản mình | Đổi thông tin/mật khẩu qua auth có sẵn | Thỉnh thoảng | auth/me + password API | P0 về khả năng truy cập; Keep header /profile |
| Chuông thông báo cá nhân | Người đang đăng nhập đọc tin của mình | Đọc/đánh dấu đã đọc; không phải công việc bắt buộc của mọi Admin | Khi có tin, chưa đo | notifications theo user | P1; Keep component sẵn ở header để giữ luồng; không nhân thành activity feed |
| Bảng quyền đọc tham khảo độc lập | Admin hiểu vai trò | Nội dung đã ở role help/review | Khi đổi role | Enum + guards, không permission API | P2; không Add; dùng help ở UserEditor |
| “Việc cần xử lý”, user/workspace chờ duyệt | Admin xử lý ngoại lệ | Không có trạng thái pending/định nghĩa queue trong workflow này | Chưa xác định | Không có API/BR queue | Reject; không biến INACTIVE/ARCHIVED thành lỗi |
| Chart tăng trưởng, active user, sức khỏe CARLA, hiệu quả AEB | Chưa có nhu cầu Admin được xác nhận | Tổng bản ghi không cung cấp trend/telemetry/quyết định này | Chưa xác định | Không có Admin metrics contract | Reject; không Add chart/số suy đoán |
| Recent activity/audit feed, Settings, role editor, duyệt regression | Không thuộc module/guard hiện có | Thiếu API hoặc sai quyền | Không áp dụng | Logger/context không thay thế API này | Reject trong scope; không Add |

## 4. Quyết định UX và Information Architecture đề xuất

**Không xác định được widget P0 riêng cho Overview.** Mặc định không dựng dashboard
mới chỉ để thay widget cũ. Đề xuất Phase 04: /admin là lối vào chuyển tới
/admin/users, danh sách này là màn làm việc mặc định vốn đã dùng sau login.
Giữ URL /admin cho bookmark; không đổi homeFor/auth/session và không nhân bản table.
Quyết định này chờ review; hiện /admin và dashboard vẫn nguyên trạng.

IA: shell có 3 mục Tài khoản → Workspace → Tài liệu kỹ thuật; brand/lối vào /admin
đến Tài khoản. Header giữ breadcrumb/hồ sơ/chuông; mobile dùng cùng navigation.
Bố cục màn đầu: h1 “Tài khoản” → search/filter + Thêm mới → bảng kết quả và row action
→ phân trang; thông báo lỗi/thành công nằm tại tác vụ liên quan. Không có hàng KPI.
Trong Phase 03 chỉ chỉnh foundation/layout; chuyển hướng và bỏ mục Overview thuộc
Phase 04 sau review, không thay hành vi dashboard khi làm design foundation.

| Quyết định | Phạm vi ở phase sau | Căn cứ |
|---|---|---|
| Keep | 3 workflow, fields, query URL, review/dirty/error, guards, API/schema | Hoàn thành 9 UC có code; không tạo cơ chế thứ hai |
| Remove | 3 KPI, refresh/status của KPI, quick cards và guide lặp menu trên Overview | Dữ liệu thật nhưng chưa hỗ trợ quyết định bắt buộc; P1/Reject |
| Move | Số lượng ở kết quả list; chỉ dẫn Manager tại workspace editor | Đúng thời điểm cần; đã có total và hint, tránh tạo thêm UI |
| Add | Không có widget/chart/API/trang mới trong đề xuất mặc định | Chưa có khoảng trống P0 có căn cứ cần thêm |
| Refine | Luồng tìm bản ghi → detail → sửa → review → lưu → feedback cùng query | Giữ ưu tiên thực hiện tác vụ; tận dụng implementation đã có |

Không có hàng đợi phê duyệt workspace bị thiếu: tạo workspace hiện gán Manager trực tiếp.
Schema seed roles.description còn ghi “duyệt workspace”, ADR-035 còn nói Manager tạo
workspace, ADR-045 còn nói Admin ghi thành viên; controller/service hiện không theo
các mô tả lịch sử đó. database-schema cũng còn bảng “chưa có code” đã lỗi thời.
Ghi nhận để nhóm đối chiếu đặc tả; không mở quyền hoặc sửa ADR/schema trong phase này.

## 5. Kiểm chứng, giới hạn và bàn giao

- Đã xong: Git/source/docs/schema/API audit → phân loại khối → IA/decisions → test docs/guards.
- Đã chạy `.\mvnw.cmd -B -Dtest=AdminSecurityTest,AdminServiceTest,RepoDocsTest`
  cùng 3 tham số logging.level.*=WARN và `test`: PASS 21 test, 0 failure/error/skip.
- Bộ test gồm 3 security + 13 service + 5 docs; MockMvc/unit tests, không phải live E2E.
- `git diff --check`: PASS; tracked/staged diff rỗng. File báo cáo mới kiểm UTF-8,
  không BOM/whitespace cuối dòng. Git chỉ có báo cáo Phase 02 chưa tracked.
- Không thay source nên không chạy frontend build/browser; không tuyên bố kiểm lại
  responsive/accessibility, live auth/DB, migration hoặc khả năng demo.
- Không có nghiên cứu người dùng/analytics để xác nhận tần suất; cần Final Report
  để xác nhận Actors/BR/FR/UC chính thức. Đây không phải lý do tạo thêm widget.
- API mới: không; thay đổi dữ liệu/migration: không; file sửa/xóa: không.
- File thêm duy nhất sau hoàn thành: docs/exec-plans/completed/2026-11-07-admin-refinement-phase-02-audit.md.
- Không sửa tài liệu/audit cũ hoặc thay đổi của thành viên khác; không stage/commit/push.
- Commit đề xuất: `docs: audit admin workflows and define dashboard UX strategy`.
- Bước tiếp theo chưa thực hiện: Phase 03 — Admin Design Foundation. Dừng chờ review.
