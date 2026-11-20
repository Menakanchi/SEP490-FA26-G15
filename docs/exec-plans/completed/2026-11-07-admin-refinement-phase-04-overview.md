# Admin refinement — Phase 04: Admin Overview Redesign

Ngày 07/11/2026, nhánh chuvv, HEAD trước thay đổi 530e17a; Git ban đầu sạch.
Trạng thái: hoàn thành Phase 04; dừng chờ review.

## Phạm vi và quyết định UX

Theo [audit Phase 02](../completed/2026-11-07-admin-refinement-phase-02-audit.md):
không có widget Overview đạt P0. Dùng Tài khoản làm màn làm việc mặc định,
giữ /admin làm điểm vào cho bookmark cũ. Không thêm dashboard rỗng hoặc widget P1.
Đã đọc hướng dẫn repo/frontend, tài liệu redirect của Next cài sẵn và
[bàn giao Phase 03](../completed/2026-11-07-admin-refinement-phase-03-foundation.md).

- /admin/page.tsx dùng redirect("/admin/users") trong Server Component.
- Giữ homeFor của login, AuthGate/layout và API guards; không thêm cơ chế auth.
- Sidebar Admin desktop/mobile và mục Admin trong sidebar chung còn 3 mục:
  Tài khoản, Workspace, Tài liệu kỹ thuật. Không đổi menu dành role khác.
- Brand/breadcrumb vẫn dùng /admin; redirect đưa ADMIN tới cùng màn Tài khoản.
- Gỡ 3 KPI tổng, refresh/feedback của KPI, 3 card quản lý và guide/quick links lặp menu.
- Không còn 3 request tổng page_size=1. Danh sách Tài khoản vẫn tải trang 20 dòng
  qua API thật hiện có; total theo filter phục vụ kết quả và pagination.
- Gỡ AdminDashboard.tsx và CSS sau khi kiểm không còn source caller/import.
- Cập nhật 1 liên kết source trong Phase 02 sang entrypoint hiện tại; giữ nguyên
  kết luận và mô tả audit lịch sử, không viết lại bằng chứng các đợt trước.
- Không cần thêm UI states: dùng loading/empty/error/retry/permission sẵn ở
  workflow Tài khoản, kiểm lại từ URL /admin trong browser.

Không đổi fields/CRUD/query URL, quota, JWT, session, vai trò, API/DTO/schema,
migration hoặc dữ liệu. Không thêm biểu đồ, task queue hay quyền Admin mới.

## Kiểm chứng

- npm.cmd run lint: PASS trên bản cuối, không warning/error.
- npx.cmd tsc --noEmit: PASS.
- npx.cmd next build: PASS, 22 static pages cùng dynamic routes hiện có.
- node --check cho admin-dashboard.mjs và admin-redesign.mjs: PASS.
- git diff --check: PASS. Không thay package/lockfile hoặc CSS nền tảng Phase 03.
- Production frontend 127.0.0.1:3100; đăng nhập qua form với HTTP fixture.
  Browser intercept toàn bộ /api/v1/**; không đọc/ghi backend/DB thật.

| Lệnh trong frontend | Kết quả và bằng chứng local gitignored |
|---|---|
| node tests/admin-dashboard.mjs | PASS; 10 ảnh + result.json ở data/admin-phase4-ui |
| node tests/admin-redesign.mjs | PASS; 19 ảnh + result.json ở data/admin-phase4-layout-ui |
| node tests/analysis-redesign.mjs | PASS; result.json và ảnh ở data/analysis-batch8-ui |

Harness dashboard giữ tên file để lệnh QA cũ vẫn chạy, nhưng chuyển nội dung sang
regression điểm vào: redirect ADMIN, chỉ một list users mặc định và không có KPI
request; navigation 3 mục/active/brand/breadcrumb/Back/reload/skip link; mở form;
loading/empty/503/403/network/malformed/retry; response muộn không thay resource;
4 role khác bị chặn trước API reads; hết phiên/guest về login; không API ghi Admin.
Harness layout giữ kiểm CRUD/validation/error/permission cũ, chỉ đổi kỳ vọng
Overview thành entry users và 4 mục thành 3. Analysis chạy lại vì sidebar chung đổi.

Lần đầu harness entry sai giả định role bị chặn cũng phải redirect tới /admin/users:
AuthGate có thể không render child chứa streamed redirect, nên vẫn ở /admin và
hiện denial. Đã sửa test đợi denial/no Admin API reads; không sửa code bảo mật.
Đây là hành vi guard được giữ lại, không phải quyền truy cập mới.
Theo tài liệu Next, redirect có thể được phát qua streaming; không giả định
mọi phiên đều có HTTP 307 trước khi UI kiểm role.

Viewport 1920/1366/768/390px; browser assertion không tràn document.
Đã xem ảnh màn đầu desktop, menu mobile 3 mục, màn Tài khoản mobile và lỗi 503.
`.\mvnw.cmd -B -Dtest=RepoDocsTest test`: PASS 5/5, không failure/error/skip.

## Files Changed và Git

Modified (6):
- frontend/src/app/admin/page.tsx
- frontend/src/components/admin/AdminShell.tsx
- frontend/src/components/VehicSimSidebar.tsx
- frontend/tests/admin-dashboard.mjs
- frontend/tests/admin-redesign.mjs
- docs/exec-plans/completed/2026-11-07-admin-refinement-phase-02-audit.md (chỉ liên kết)

Deleted (2): frontend/src/components/admin/AdminDashboard.tsx,
frontend/src/components/admin/AdminDashboard.module.css.
Added (1): docs/exec-plans/completed/2026-11-07-admin-refinement-phase-04-overview.md.
Git chỉ có thay đổi phase này; không stage/commit/push.
Diff backend/database/worker/API client/AuthContext/Analysis code rỗng.
Server QA do phiên này khởi động đã được dừng trước bàn giao.

## Giới hạn và bước tiếp theo

Chưa có Final Report/SRS hoặc Figma Admin gốc; không tuyên bố đã đối chiếu thiết kế,
xác nhận live auth/backend/MySQL, CARLA hoặc độ sẵn sàng demo.
Không chạy lại backend/worker full suite vì không thay code các phần đó.
Không làm Phase 05 hoặc chỉnh thêm bảng/form trong phase này.

Commit đề xuất: `feat(admin): redesign overview around essential admin tasks`.
Next Phase: Phase 05 — User Management UX; tiếp tục sau review.
