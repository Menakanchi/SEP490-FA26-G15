# Admin đợt 5 — Workspace Management

Trạng thái: hoàn tất đợt 5. Nhánh chuvv; Git đầu đợt sạch.
Nguồn: yêu cầu tiếp đợt 5, dừng trước đợt 6.

## Audit và hợp đồng

Đã đọc AGENTS/CLAUDE/frontend, bàn giao đợt 4, audit Admin, ADR-038 (Proposed),
ADR-034 (đã supersede, không dùng quyền lịch sử), AdminManagement/Editor, adminApi,
AdminController/Service/Repository/Requests, schema/migration 012 và AdminServiceTest.
Đọc lại Next cài sẵn: native history/useSearchParams/Suspense, CSS Modules, accessibility.

- UC-15 list GET /api/v1/vehicsim/admin/workspaces: q tên workspace/tên/email Manager (100),
  status ACTIVE/ARCHIVED, sort newest/oldest/name (name A–Z + ID DESC), page 1–100000,
  page_size 1–100, COUNT + LIMIT/OFFSET. Không role filter workspace.
- GET /workspaces/{id}: name/description/manager_id/name/email/status/date/count thật.
  ARCHIVED được xem, không sửa. Không liên kết sang màn /workspace bị guard Manager chặn Admin.
- POST/PUT nhận đúng name (bắt buộc, max150), description (optional, max10000), manager_id
  (positive). Trim strings, description trống thành null. Server kiểm tên trùng và Manager active,
  khóa row đồng bộ đổi quyền; PUT chặn ARCHIVED. Không đổi status/children/membership/role.
- Notification WORKSPACE_ASSIGNED khi tạo/giao Manager mới; không gửi nếu chỉ đổi name/description.
  API Admin có requireAdmin và limitWrites; giữ nguyên mọi security/quota/API/DB.
- Picker cũ chỉ 100 Manager đầu, query không giữ URL, confirmation chung, Escape bỏ draft;
  detail/search Manager có response muộn, loading/error có thể hiển thị dữ liệu cũ.

## Phạm vi

- Nhánh workspace riêng, list/toolbar/count/pagination/URL/history đồng bộ user table.
- Reuse CSS Modules bảng/form đã có; CSS bổ sung chỉ workspace, không sửa style user/global.
- Form/summary và archived read-only detail; Manager search + server pagination, giữ lựa chọn
  ngoài trang, không tải tất cả user hoặc cho nhập ID tùy ý. Backend tái kiểm khi lưu.
- Review trước tạo/lưu, Manager trước/sau và thông báo có điều kiện; dirty close/focus/busy/ref lock.
- Loading/error/empty/retry, malformed/late responses; giữ draft khi API lỗi; success mới refetch.
- Giữ generic Management/Editor cho tài liệu nguyên văn; không làm đợt role/permission, Analysis.

## Các bước

1. [x] Audit Git/source/contracts/schema/quyền và tài liệu Next.
2. [x] Bảng/query và form/detail/picker/confirmation.
3. [x] Lint/TypeScript/build và Java checks phù hợp.
4. [x] Browser fixture, ảnh bốn viewport, hồi quy Admin/Analysis; không API ghi thật.
5. [x] Diff, bằng chứng, chuyển completed, bàn giao và dừng đợt 5.

Chưa có Figma Admin/Report 7 gốc; ghi rõ giới hạn đối chiếu.
Không git add/commit/push hoặc thay cấu hình/dữ liệu thật.

## Kết quả triển khai

- Chỉ nhánh workspace dùng AdminWorkspacesTable mới trong AuthGate/Suspense. Generic Management
  và Editor tài liệu từ function Management tới cuối file khớp HEAD nguyên văn.
- Tái sử dụng nguyên CSS Modules của bảng/form tài khoản, thêm CSS chỉ workspace; không sửa
  User Editor/Table, shared shell/global CSS, backend/API/auth/DB hoặc Analysis.
- Bảng nhóm workspace/ID và Manager/tên/email; giữ count thành viên/project thật, status có chữ,
  ngày tạo lỗi/null hiện —. Row ACTIVE mở form, ARCHIVED mở chi tiết chỉ đọc qua GET có sẵn.
  Không thêm endpoint, route detail, link Manager-only, nút xóa/lưu trữ/khôi phục hoặc quản lý thành viên.
- Query URL là nguồn cho q/status/sort/page/page_size; native history theo Next docs, canonicalize
  giá trị sai và bỏ role không hợp lệ với workspace. Search chỉ submit, trim/max100; lọc/sort/size
  về trang 1. 10/20/50/100 dòng, COUNT thật, page clamp khi hết dữ liệu; không tải toàn DB.
- Loading/error không giữ rows/count/actions cũ. List/detail bỏ response đến muộn, detail kiểm
  đúng target/manager/status; khóa Thêm mới khi detail đang tải, không để response ghi đè draft.
- Summary và archived detail dùng name/ID/manager/description/status/count/date từ API thật.
  Form giữ đúng name/description/manager_id, required/độ dài/positive ID; whitelist ba field,
  trim strings và description rỗng thành null; không gửi status hoặc dữ liệu con.
- Picker chỉ gọi users role=MANAGER,status=ACTIVE,sort=name, page_size=20; có search, page,
  total, loading/empty/error/retry. Lựa chọn tách khỏi kết quả để không mất khi chuyển trang/tìm.
  Không cho nhập ID tùy ý. Kiểm response role/active/ID/DTO, bỏ response cũ khi query đổi/unmount.
  Thông tin hiện tại chưa đủ chứng minh Manager còn active, nên server tái kiểm khi lưu.
- Review cả tạo/sửa: target và bảng trước/sau; chỉ tạo/giao Manager khác mới báo notification.
  Tên/mô tả đơn thuần nói rõ Manager giữ nguyên. Backend notification/transaction không thay đổi.
- Native modal dùng vòng Tab/Shift+Tab, Escape review quay lại, Escape/Hủy dirty có giữ/bỏ,
  trả focus về nút mở, body cuộn/header-footer cố định. ref khóa double submit trước render;
  khi chờ API không đóng/quay lại/Escape. Server từ chối giữ draft/Manager, không optimistic update.
  Chỉ API thành công mới đóng và refetch query; đổi Manager có thể làm workspace rời bộ lọc.

## Kiểm chứng

- npm.cmd run lint: PASS sau thay đổi harness cuối; không thêm eslint-disable/tắt rule.
- npx.cmd tsc --noEmit: PASS.
- npx.cmd next build: PASS trên source cuối, mọi route hiện có build được với Suspense.
- .\mvnw.cmd -B '-Dtest=AdminSecurityTest,AdminServiceTest,RepoDocsTest' test:
  PASS 21 tests, 0 failures/errors/skipped. Luật Manager active/name unique/ARCHIVED và notification
  tạo/giao lại/giữ nguyên được test Java hiện có bao phủ; không sửa test/backend.
  RepoDocsTest được chạy lại sau chuyển completed.
- node tests/admin-workspaces.mjs: PASS trên production build, 20 ảnh + result.json ở
  data/admin-batch5-ui (gitignored). Dataset riêng 61 workspace/121 Manager, toàn HTTP fixture.
  Đối chiếu row IDs/count/query thật trong fixture: tìm workspace/tên/email Manager, status,
  sort name, size 10/20/50/100, pagination/reload/sidebar return/Back/Forward/chip reset,
  canonical URL, page 999/empty, loading/503/403/network/malformed/retry và response lỗi cũ.
  Archived chỉ xem, không fetch Manager hoặc ghi. Tạo validate/normalize/payload đúng ba field,
  chọn Manager trang 7 (ngoài 100 đầu), 409 giữ draft, busy Escape/ref chống double click.
  Dirty keep/discard/focus, vòng Tab, picker search/page/selection ngoài kết quả,
  loading/error/empty/malformed/race, review Manager trước/sau/thông báo có điều kiện,
  Manager mất hiệu lực/workspace vừa archived/403/429/network đều giữ input, thành công mới PUT/refetch.
  Sau đổi Manager, workspace rời bộ lọc email Manager cũ nhưng URL q/status/sort/page_size giữ nguyên.
  Detail sai ID/lỗi/đến muộn, bốn role không Admin bị chặn, 401/guest.
- node tests/admin-redesign.mjs: PASS (19 ảnh). Fixture picker trả đúng Manager active,
  đợi radiogroup mới và nhãn empty workspace mới; giữ toàn bộ checks quyền/navigation/error.
- node tests/admin-users-table.mjs: PASS (10 ảnh) sau sửa đợi đúng vùng bảng workspace khi
  điều hướng; chờ table chung có thể nhận nhầm bảng user cũ rồi Back trước khi route xong.
  Không bỏ assertion, không tăng timeout; toàn bộ checks query/history/save/role giữ nguyên.
- node tests/admin-user-forms.mjs: PASS (13 ảnh); node tests/admin-dashboard.mjs: PASS (9 ảnh).
- node tests/analysis-redesign.mjs: PASS; source/test Analysis không thay đổi.
- Đã mở/xem ảnh bảng/form desktop/mobile, create review/error, archived và giao Manager trước/sau.
  Viewport 1920×1080, 1366×768, 768×1024, 390×844; modal trong viewport, document không tràn ngang,
  vùng bảng cuộn bằng phím, actions sticky vẫn dùng được. Nội dung dài xuống dòng, footer giữ được.
- git diff --check: PASS. So generic Management/Editor với HEAD: PASS.
  Không thêm dependency, dữ liệu cá nhân, API ghi thật hoặc cấu hình máy vào Git.

## Giới hạn / bàn giao

Browser dùng HTTP fixtures, chưa E2E auth/backend/DB/CARLA thật. Notification chỉ đối chiếu
UI với service/test Java, không gửi thông báo thật trong QA. Không có Figma Admin/Report 7 gốc;
không tuyên bố đối chiếu thiết kế. Không có lỗi còn biết trong phạm vi đã kiểm.
Giữ nguyên limit page 100000 theo API. Không suy ra khả năng thay status/thành viên từ schema.

Modified (3):
- frontend/src/components/admin/AdminManagement.tsx
- frontend/tests/admin-redesign.mjs
- frontend/tests/admin-users-table.mjs

Added (6):
- frontend/src/components/admin/AdminWorkspacesTable.tsx
- frontend/src/components/admin/AdminWorkspaceEditor.tsx
- frontend/src/components/admin/AdminWorkspaces.module.css
- frontend/src/components/admin/adminWorkspacesQuery.ts
- frontend/tests/admin-workspaces.mjs
- docs/exec-plans/completed/2026-11-04-admin-workspaces-dot-5.md

Deleted: không. Nhánh chuvv, đầu đợt sạch; cuối đợt 3 modified + 6 untracked.
Không git add/commit/push hoặc ghi đè thay đổi có sẵn.
Commit gợi ý: refactor(admin): redesign workspace management and manager assignment.

Đợt tiếp theo: đợt 6 — Roles & Permissions, chỉ phần quyền thực sự tồn tại.
Audit hiện có chỉ xác nhận role enum cố định và assignment trong form tài khoản, không có API
CRUD role/permission tùy ý. Không tự dựng module phân quyền. Chưa triển khai đợt 6.
