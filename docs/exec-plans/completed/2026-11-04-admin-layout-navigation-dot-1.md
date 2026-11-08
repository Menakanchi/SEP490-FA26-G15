# Admin đợt 1 — Layout & Navigation

Trạng thái: hoàn tất đợt 1. Nhánh chuvv; working tree đầu đợt sạch.
Nguồn: yêu cầu redesign Admin theo từng đợt, chỉ triển khai đợt 1.

## Phạm vi

Audit đã hoàn tất trước khi sửa UI, xem [bản audit](../../vehicsim/audit-redesign-admin-2026-11-04.md).
Giữ CRUD users/workspaces/tech-references. Tạo AdminFrame, sidebar riêng và menu mobile;
header/breadcrumb/metadata/spacing. Đổi duy nhất nhánh Admin ở VehicSimShell.
Không sửa handlers, API, backend, schema, auth hoặc Analysis.

## Các bước

1. [x] Git, hướng dẫn, audit tài liệu/frontend/backend/schema/quyền.
2. [x] Tách frame/nav và gắn ba route Admin.
3. [x] Lint, TypeScript, build; Java Admin/security/docs tests phù hợp.
4. [x] Browser HTTP fixtures: routes/nav/roles/states/keyboard/responsive; screenshot.
5. [x] Kiểm diff và hồi quy Analysis; ghi bằng chứng, chuyển completed, bàn giao rồi dừng.

## Giới hạn

Không có Figma Admin/Report 7 gốc. Browser dùng HTTP fixture riêng, không thay auth production,
không gọi API ghi dữ liệu thật hoặc tuyên bố E2E backend thật. Không git add/commit/push.

## Kết quả triển khai

- Thêm nested layout Admin dùng AuthGate hiện có; ba route khai báo metadata riêng.
- AdminShell gồm sidebar, header/breadcrumb, h1/mô tả, content container và mobile details menu.
  Điều hướng dùng ba resource thật, hồ sơ/mật khẩu, thông báo, tổng quan và đăng xuất hiện có.
- Nhánh Admin trong VehicSimShell chỉ thay sidebar khi role admin; role khác bị từ chối vẫn giữ
  sidebar chung như trước. Các nhánh Analysis và trang khác không đổi.
- AdminManagement bỏ header/nav cũ, giữ nguyên từ Card đầu tiên đến cuối file. Đã so sánh với HEAD:
  state/fetch/query/actions trước return và toàn bộ table/editor/validation/save/confirmation khớp nguyên văn.
- CSS Modules; active state có aria-current, focus-visible, skip link tới section nội dung,
  menu dùng Enter/Escape và tự đóng khi chọn link. Dưới 1100px sidebar chuyển thành menu native.
  Popup thông báo được giới hạn theo viewport trong phạm vi header Admin.

## Kiểm chứng

- `npm.cmd run lint`: PASS (cả script test mới).
- `npx.cmd tsc --noEmit`: PASS; build production cuối cũng chạy TypeScript thành công.
- `npm.cmd run build`: PASS, ba page Admin và redirect /admin giữ URL.
- `.\mvnw.cmd -B '-Dtest=AdminSecurityTest,AdminServiceTest,WorkspaceSecurityTest,RepoDocsTest' test`:
  PASS, 26 tests, 0 failure/error/skipped. Lần gọi đầu thiếu quote quanh danh sách test bị PowerShell
  từ chối trước khi chạy Maven; đã sửa cú pháp và chạy thành công, không đổi code để né test.
- `node tests/admin-redesign.mjs`: PASS trên build cuối, 19 ảnh tại
  `data/admin-batch1-ui/`, kết quả `result.json` (gitignored).
  Đã kiểm login qua HTTP fixture, /admin redirect, ba route/title/breadcrumb/nav, browser Back,
  keyboard/Escape/skip focus, hồ sơ và khôi phục shell chung, responsive không tràn trang,
  chuông thông báo, search/pagination gửi server, editor mở/hủy/xác nhận, PUT lỗi giữ input,
  loading/empty/503/403/retry, bốn role không được phép × ba route không gọi Admin API,
  token hết hạn, chưa đăng nhập và logout mobile.
- Viewport: 1920×1080, 1366×768, 768×1024, thêm 390×844.
  Đã xem trực tiếp ảnh users desktop, workspace tablet, menu tài liệu mobile và popup thông báo mobile.
- Browser fixture chặn toàn bộ `/api/v1/**`; một PUT chủ ý trả 409 để kiểm lỗi form.
  Không gọi ghi API thật, không kết nối/sửa DB. Đây không phải E2E auth/backend/DB thật.
- Harness dùng Playwright/Edge đã có sẵn trên máy; không thêm dependency/package lock.
- `node tests/analysis-redesign.mjs`: PASS trên build cuối, toàn bộ hồi quy Analysis đợt 1–8;
  kết quả `data/analysis-batch8-ui/result.json`. Không sửa source/test Analysis.
- `git diff --check`: PASS; artifact browser nằm trong data/ đã gitignore.

## Giới hạn và bàn giao

- Không có Report 7/SRS gốc hoặc thiết kế Figma Admin để đối chiếu. Chưa chạy backend/DB thật,
  chưa test SMTP/CARLA; không cần cho thay đổi presentation này. Không migration.
- Bảng/form/confirmation hiện có còn các điểm UX ghi trong audit, chủ động để các đợt tương ứng.
  Không có dashboard/KPI Admin hoặc API role/audit/settings; không suy ra từ schema/tên tài liệu.
- Đợt kế tiếp dự kiến: Dashboard/điểm vào Admin, chỉ chức năng thật; xác định lại phạm vi theo audit,
  không thêm số liệu giả hoặc backend mới. Chưa bắt đầu đợt 2.
- Không git add/commit/push. Commit gợi ý: `refactor(admin): unify layout and navigation`.

## File thay đổi

Modified (5):
- frontend/src/app/admin/users/page.tsx
- frontend/src/app/admin/workspaces/page.tsx
- frontend/src/app/admin/tech-references/page.tsx
- frontend/src/components/VehicSimShell.tsx
- frontend/src/components/admin/AdminManagement.tsx

Added (6):
- frontend/src/app/admin/layout.tsx
- frontend/src/components/admin/AdminShell.tsx
- frontend/src/components/admin/AdminShell.module.css
- frontend/tests/admin-redesign.mjs
- docs/vehicsim/audit-redesign-admin-2026-11-04.md
- docs/exec-plans/completed/2026-11-04-admin-layout-navigation-dot-1.md

Deleted: không. Working tree đầu đợt sạch, không có thay đổi thành viên khác cần giữ lại.
Git cuối đợt: nhánh chuvv; 5 modified + 6 untracked do đợt này, không staged/commit/push.
