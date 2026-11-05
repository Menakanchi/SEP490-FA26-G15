# Admin đợt 7 — Audit Logs / System Settings

Trạng thái: hoàn tất audit đợt 7; không có UI/API Audit Logs hoặc System Settings Admin để redesign. Nhánh chuvv; Git đầu đợt sạch.
Nguồn: yêu cầu tiếp đợt 7; yêu cầu gốc quy định
“Chỉ thực hiện những chức năng tồn tại.”
Dừng trước đợt 8.

## Kết luận phạm vi

Có cơ chế ghi audit vào logger, nhưng chưa có module đọc log cho Admin.
Không có trang/API đọc-ghi hoặc bảng cấu hình dành cho module System Settings Admin.
Vì chưa có UI/API tương ứng để redesign, đợt 7 chỉ audit, kiểm chứng logger hiện có và ghi bàn giao.
Không tạo backend mới, đọc log runtime/dữ liệu cá nhân, hoặc dựng màn log/settings giả.

## Nguồn đã đối chiếu

- AGENTS.md, CLAUDE.md, frontend/AGENTS.md, yêu cầu gốc và
  [bàn giao đợt 6](../completed/2026-11-04-admin-roles-permissions-dot-6.md).
- [Audit Admin đợt 1](../../vehicsim/audit-redesign-admin-2026-11-04.md): đã ghi không có
  audit-log read API/System Settings; đây là audit cập nhật, không coi ghi logger là có UI.
- AuditLog.java, AuditLogTest.java; lời gọi AuditLog ở AuthService, AdminService,
  ReviewDecisionService và ScenarioController; không mở log vận hành.
- AdminController, adminApi và AdminShell; toàn bộ route frontend/src/app/admin,
  các controller/repository và bảng CREATE TABLE trong 01_schema.sql.
- SystemController, SystemViewService, HealthController, VehicSimConfig, VehicSimProperties;
  NotificationController, API client và các route lịch sử regression.
- Tìm source controller/service client cho audit/settings/configuration; không đọc .env,
  secret, DB thật hoặc artifact run để suy chức năng.

## Mapping chức năng thực tế

| Hạng mục | Bằng chứng | Quyết định |
|---|---|---|
| Ghi audit | AuditLog.event dùng SLF4J logger tên audit; AdminService ghi admin.* với actor/record_id | KEEP, đã có logging |
| Định dạng log | event/outcome + cặp key/value; bỏ null, thay ký tự điều khiển, quote/escape, giới hạn 200 ký tự | Giữ formatter và test hiện có |
| Dữ liệu nhạy cảm | Caller chọn từng field; formatter không phải bộ tự phát hiện/redact password/token/secret | Không đưa log thô lên UI, không tuyên bố tự động ẩn mọi dữ liệu nhạy cảm |
| Audit reader | Không có route list/detail/filter/pagination/export audit, repository reader hoặc bảng audit trong schema | Gap chức năng đọc log, không bổ sung backend trong tác vụ UI |
| Admin navigation/API | Chỉ overview/users/workspaces/tech-references; resource allowlist chỉ users/workspaces/tech-references | Không thêm navigation hoặc endpoint audit/settings |
| GET /api/v1/vehicsim/context | Ngữ cảnh project/workspace/xe/AEB/family/parameter và simulator cho run mới | Dữ liệu dùng chung, không phải API quản trị cấu hình |
| POST /api/v1/vehicsim/bootstrap | Khởi tạo dữ liệu mặc định, chỉ ADMIN | Giữ API, không gọi QA, không đưa thành nút Settings |
| GET /health và alias | Trả status/service/message/timestamp | Health check hiện có, không phải dashboard vận hành Admin |
| Config Java | ConfigurationProperties + executor/run recovery trong VehicSimConfig | Cấu hình triển khai, không API cập nhật từ Admin |
| Notifications | Thông báo theo user, list/mark read | Giữ NotificationBell; không coi là audit toàn hệ thống |
| Lịch sử regression | Endpoint lịch sử quyết định gắn regression test | Nghiệp vụ kiểm chứng hiện có, không chuyển thành audit Admin |
| Hồ sơ/mật khẩu | Trang /profile dùng auth API | Cài đặt tài khoản cá nhân, không System Settings |
| Tài liệu kỹ thuật | Module thật tại /admin/tech-references | Không đổi tên thành Settings hoặc âm thầm gộp redesign vào đợt 7 |

Chưa có backend reader/settings là giới hạn phạm vi, không phải quyền bị ẩn bởi UI.
Không tự thêm audit storage, retention/export, restart, sửa DB, điều khiển CARLA hoặc config writer.
Không sửa logger/authorization/JWT/quota/API/schema hay nghiệp vụ module khác.

## Các bước

1. [x] Git, bàn giao đợt 6 và điều kiện phạm vi gốc.
2. [x] Audit route/API/schema, phân biệt logging với log reader và context với settings.
3. [x] AuditLogTest và RepoDocsTest; không thêm test trùng implementation.
4. [x] Diff, bằng chứng, chuyển completed và dừng trước đợt 8.

## Kiểm chứng và giới hạn

- .\mvnw.cmd -B '-Dtest=AuditLogTest,RepoDocsTest' test: PASS 12 tests,
  0 failures/errors/skipped (7 logger formatter + 5 repo docs).
- AuditLogTest kiểm dòng key/value, bỏ null, chặn ký tự xuống dòng giả sự kiện,
  escape dấu quote, cắt chuỗi dài, giá trị rỗng và lỗi số lượng key/value lẻ.
  Đây là unit tests formatter, không phải kiểm log sink/retention/reader hay deployment thật.
- RepoDocsTest chạy lại sau khi chuyển completed để kiểm link và quy tắc tài liệu.
- git diff --check: PASS; diff frontend/src/database/worker rỗng.
  Không sửa hoặc thêm test, không nới assertions để hợp thức hóa kết quả.
- Chỉ thêm tài liệu nên không chạy lại frontend lint/TypeScript/build/browser/ảnh.
  Bằng chứng UI các đợt trước không được trình bày như kết quả mới.
- Không E2E backend/DB/log deployment thật hoặc đối chiếu Figma trong đợt này.
- Không cần migration, dependency hay thay cấu hình máy. Không git add/commit/push.

## File changes và Git

Modified: không. Deleted: không.
Added: docs/exec-plans/completed/2026-11-04-admin-audit-settings-dot-7.md.
Nhánh chuvv, đầu đợt sạch; cuối đợt chỉ một file tài liệu mới, chưa stage/commit/push.
Commit gợi ý: docs(admin): audit logging and system settings scope.

## Bàn giao tiếp theo

Đợt 8 — UI Consistency & Regression: rà soát nhất quán, routing, accessibility,
responsive và checks của các màn Admin thực có; chưa bắt đầu ở lượt này.
Tài liệu kỹ thuật vẫn dùng bảng/form chung hiện có, chưa được redesign riêng trong đợt 7;
không coi hoàn tất audit này là đã redesign toàn bộ màn Admin còn lại.
