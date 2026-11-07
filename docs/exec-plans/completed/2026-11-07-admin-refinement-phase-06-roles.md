# Admin refinement — Phase 06: Roles & Access Control UX

Ngày 07/11/2026; nhánh `chuvv`; HEAD ban đầu `431eb80`.
Git sạch trước phase; không có thay đổi sẵn cần giữ ngoài phạm vi.
Trạng thái: hoàn thành triển khai và QA; dừng để review trước Phase 07.

## Căn cứ và quyết định UX

Đã đọc hướng dẫn repo/frontend, tài liệu accessibility của Next.js cài trong repo,
[Phase 05](2026-11-07-admin-refinement-phase-05-users.md) và audit roles trước đó.
Đối chiếu `RoleCode`, entity/repository, schema, `AdminService`/`UserRequest`,
`SecurityConfig`/`VehicSimAccess`, `WorkspaceController` và `workspaceAccess.ts`.

- Có 5 role cố định: ADMIN, MANAGER, ENGINEER, REVIEWER, EXPERIENCER;
  mỗi tài khoản có một role hệ thống. Repository role không phải API permission CRUD.
- Admin gán role trong form tài khoản. Không có chức năng quản trị permissions độc lập
  được xác nhận; tiếp tục cải thiện form hiện có, không thêm route hay trang permissions.
- ADMIN quản trị tài khoản/workspace/tài liệu và được ghi quy trình kỹ thuật;
  quyền duyệt thuộc REVIEWER, thêm/bớt thành viên workspace thuộc MANAGER.
- MANAGER quản lý thành viên/công việc trong workspace được giao, chỉ đọc phần kỹ thuật.
  ENGINEER và EXPERIENCER được tạo/chạy quy trình kỹ thuật theo hạn mức.
- REVIEWER chấp nhận/từ chối khuyến nghị, không chạy mô phỏng/tạo candidate.
  Mô tả dựa trên guard hiện hành; không suy quyền từ ghi chú/ADR Proposed cũ.
- Role hệ thống không đồng nghĩa cách ly dữ liệu hoàn chỉnh giữa workspace/project
  (TD-30). Không diễn giải các mô tả này thành cam kết cô lập dữ liệu.

## Thay đổi

1. `AdminUserEditor.tsx`: giải thích năng lực và giới hạn từng role tại select;
   nêu mỗi tài khoản có một role hệ thống. Giữ `aria-describedby` và thêm
   `aria-live="polite"` để cập nhật mô tả khi đổi lựa chọn.
2. Bước xác nhận tạo tài khoản/đổi role hiển thị quyền của role được chọn.
   Nếu trạng thái sau lưu là khóa, giải thích quyền chỉ dùng khi tài khoản hoạt động.
   Không thêm phần này vào xác nhận chỉ đổi họ tên/email/trạng thái.
3. Giải thích tác động role ở cấp hệ thống; giữ before/after, thu hồi phiên,
   self guard, cảnh báo phụ thuộc và xác nhận lưu.
4. Mở rộng harness form hiện có: 5 role/options, nội dung quyền, review tạo/đổi role,
   trạng thái khóa và self guard; đọc trợ giúp không phát sinh API request/save.

Không đổi backend, API, schema/migration, role codes, JWT, quota, payload hoặc validation.
Giữ guard không tự đổi role/khóa, phụ thuộc workspace/member/project/task và auth_version.
Không thêm dữ liệu giả vào sản phẩm, thư viện hoặc mô hình phân quyền mới.

## Validation

| Kiểm tra thực chạy | Kết quả |
|---|---|
| `npm.cmd run lint` trong frontend | PASS, không warning/error |
| `npx.cmd tsc --noEmit` trong frontend | PASS |
| `npx.cmd next build` trong frontend | PASS |
| `node --check frontend/tests/admin-user-forms.mjs` | PASS |
| Maven AdminSecurityTest, AdminServiceTest, WorkspaceSecurityTest, VehicSimSecurityTest, RepoDocsTest | PASS 35, không fail/error/skip |
| `admin-user-forms.mjs` | PASS, 16 ảnh |
| `admin-users-table.mjs` | PASS, 11 ảnh |
| `admin-redesign.mjs` | PASS, 19 ảnh |
| `git diff --check` | PASS |
| `RepoDocsTest` chạy lại sau chuyển báo cáo completed | PASS 5, không fail/error/skip |

Lệnh backend: `.\mvnw.cmd -B -Dtest=AdminSecurityTest,AdminServiceTest,WorkspaceSecurityTest,VehicSimSecurityTest,RepoDocsTest test`.
Các browser harness chạy trên production build ở `127.0.0.1:3100`, đăng nhập bằng
HTTP fixture, không gọi ghi API/DB thật. Hai harness bảng/layout ban đầu gặp Edge đóng
ngay khi khởi động; chạy lại tuần tự đều PASS, không sửa hoặc nới assertion.
Server QA đã dừng sau kiểm tra.

Artifact cục bộ bị gitignore: `data/admin-phase6-forms-ui`,
`data/admin-phase6-table-ui`, `data/admin-phase6-layout-ui`; tổng 46 ảnh và result.json.
Đã xem trực tiếp ảnh role help ADMIN/MANAGER desktop, review đổi role/khóa ở 1366 và 390 px:
nội dung xuống dòng trong modal, footer thao tác còn hiển thị, body cuộn dọc.

Giới hạn: browser fixture không chứng minh live auth/DB/integration.
Backend kiểm quyền bằng test hiện có, không thử tài khoản/ghi dữ liệu thật.
Chưa có thiết kế Figma Admin hoặc Final Report/SRS gốc để đối chiếu;
không tuyên bố đã nghiệm thu theo các nguồn này.

## Bàn giao

Sửa 2 file: `frontend/src/components/admin/AdminUserEditor.tsx` và
`frontend/tests/admin-user-forms.mjs`. Thêm báo cáo completed này; không xóa file.
Không stage, commit hoặc push. Không có migration hay thay đổi API/dữ liệu.

Commit đề xuất: `git commit -m "refactor(admin): clarify roles and access management UX"`.
Phase tiếp theo: 07 — Remaining Admin Workflows, chỉ workflow có thật;
chia theo workflow nếu cần. Chưa bắt đầu Phase 07.
