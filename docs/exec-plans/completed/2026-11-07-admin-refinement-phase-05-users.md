# Admin refinement — Phase 05: User Management UX

Ngày 07/11/2026; nhánh chuvv; HEAD trước thay đổi 6b34d0d; Git ban đầu sạch.
Trạng thái: hoàn thành Phase 05, dừng chờ review.

## Audit và ranh giới

Đọc hướng dẫn repo/frontend, [Phase 04](../completed/2026-11-07-admin-refinement-phase-04-overview.md),
[audit Phase 02](../completed/2026-11-07-admin-refinement-phase-02-audit.md), tài liệu
Next cài sẵn về CSS Modules/accessibility; đối chiếu AdminRequests.UserRequest,
AdminService, VehicSimAccess và luồng frontend thực tế.

Search/filter/email sort/server pagination/query URL/detail/review/validation,
dirty-close, self guard và busy/double-submit đã có: giữ lại, không tạo luồng mới.
Admin có quyền quản trị users; role enum cố định; các phụ thuộc do backend quyết định.
Không thêm DELETE/reset password/bulk lock hoặc quyền vượt hiện tại.

## Thay đổi và lý do UX

| Điểm | Trước | Sau |
|---|---|---|
| Cột dữ liệu | Tên/email, vai trò, trạng thái, ngày tạo, thao tác | Giữ 4 cột phục vụ nhận diện và quản lý; ngày tạo vẫn có trong chi tiết |
| Độ rộng bảng | min-width 850px của CSS chung | User-only min-width 680px, giảm nhu cầu cuộn ngang ở tablet; sticky action giữ nguyên |
| Thành công | Chỉ “Đã lưu thành công.” | Nêu email chuẩn hóa của tài khoản vừa lưu, sau khi API thành công |
| Filter sau save | Giữ filter nhưng bản ghi có thể biến mất mà không giải thích | Giữ query và giải thích bản ghi không khớp sẽ không nằm trong kết quả |
| Focus sau save | Opener bị gỡ khi list refetch; không có đích focus ổn định | Focus tới feedback có tabindex=-1 và outline rõ, tiếp tục dùng bàn phím từ đó |
| Hủy/error | Trả focus opener / giữ draft trong form | Giữ nguyên; không dùng success feedback cho request thất bại |

Editor chỉ chuyển pending.email qua callback onSaved sau await API; email dùng từ
payload đã trim/lowercase. Không thay request body, validation hoặc response contract.
Focus effect không tạo request và không thêm state vào URL/storage.
CSS mới dùng token foundation, chỉ gắn trên table/feedback users; không sửa CSS chung.

## Bằng chứng tái hiện và kiểm chứng

Trước khi sửa source, mở production baseline và thêm assertion vào harness users-table:
lưu tài khoản đang lọc ACTIVE thành inactive → bản ghi rời kết quả → assertion focus
thất bại (actual false, expected true, exit 1). Bằng chứng ảnh baseline ở
data/admin-phase5-baseline-ui; không có result PASS cho lần này.
Sau sửa, chính assertion đó PASS, đồng thời kiểm đúng email, giải thích filter,
URL không đổi và row đã lưu thực sự rời danh sách theo fixture.

- npm.cmd run lint: PASS, không warning/error.
- npx.cmd tsc --noEmit: PASS.
- npx.cmd next build: PASS, TypeScript và các routes hiện có hoàn tất.
- node --check cho hai harness sửa và git diff --check: PASS.
- .\mvnw.cmd -B -Dtest=AdminSecurityTest,AdminServiceTest,RepoDocsTest test:
  PASS 21 tests (3 security + 13 service + 5 docs), 0 failure/error/skip.
  Đây là MockMvc/unit tests, không phải live backend/MySQL.

Chạy frontend production 127.0.0.1:3100, đăng nhập qua form thật bằng fixture;
intercept toàn bộ /api/v1/** trong browser, không ghi backend/DB thật.
ADMIN_UI_URL dùng địa chỉ này; ADMIN_UI_OUTPUT giữ riêng bằng chứng Phase 05.

| Harness trong frontend | Kết quả / bằng chứng local gitignored |
|---|---|
| node tests/admin-users-table.mjs | PASS; 11 ảnh + result.json ở data/admin-phase5-table-ui |
| node tests/admin-user-forms.mjs | PASS; 14 ảnh + result.json ở data/admin-phase5-forms-ui |
| node tests/admin-redesign.mjs | PASS; 19 ảnh + result.json ở data/admin-phase5-layout-ui |

Giữ toàn bộ test cũ; thêm kiểm 4 cột, ngày tạo trong detail, success email/focus
sau create và update bị lọc ra. Tests hiện có còn kiểm search/filter/sort/page/reload/
Back/Forward, response race, loading/empty/error/retry, Tab/Escape/dirty-close,
password UTF-8/redaction/payload, review, dependency/403/429/network, self role/lock,
session revoked và các role không phải Admin.
Đã xem ảnh desktop/tablet, feedback sau filtered save và create trên mobile;
viewport 1920/1366/768/390, không tràn document, action vẫn sticky khi cần cuộn ngang.
RepoDocsTest chạy lại trên báo cáo cuối ở completed: PASS 5/5, không failure/error/skip.

## Files Changed / Git

Modified (4):
- frontend/src/components/admin/AdminUsersTable.tsx
- frontend/src/components/admin/AdminUserEditor.tsx
- frontend/tests/admin-users-table.mjs
- frontend/tests/admin-user-forms.mjs

Added (2):
- frontend/src/components/admin/AdminUsers.module.css
- docs/exec-plans/completed/2026-11-07-admin-refinement-phase-05-users.md

Deleted: không. Git chỉ có thay đổi phase này; không stage/commit/push.
API/DB/schema/migration/guards/JWT/quota và role model không đổi.
Không thay workspace/references, shell/dashboard, API client/AuthContext hoặc Analysis.
Server QA do phiên này khởi động đã được dừng trước bàn giao.

## Giới hạn và tiếp theo

Chưa có Final Report/SRS và Figma Admin gốc; không tuyên bố đã đối chiếu thiết kế,
xác nhận live auth/backend/MySQL hay chứng nhận accessibility.
Không chạy lại full backend/worker suite vì không thay code các phần đó.

Commit đề xuất: `refactor(admin): improve user management experience`.
Next Phase: Phase 06 — Roles & Access Control UX, chỉ trong quyền/module đã có.
Dừng sau Phase 05, chưa triển khai Phase 06.
