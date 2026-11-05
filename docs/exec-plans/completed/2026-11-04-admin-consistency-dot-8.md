# Admin đợt 8 — UI Consistency & Regression

Trạng thái: hoàn tất đợt 8. Nhánh chuvv.
Git đầu đợt chỉ có file đợt 7 chưa tracked; giữ nguyên, không nhận là thay đổi đợt 8.
SHA256 file đợt 7: 4AA8E1F2712DBB4FEE4B63DF9E709833F6B6E053419B6BCF7E03E241110CE633.

## Audit và phạm vi

Đọc hướng dẫn repo/frontend, bàn giao đợt 7, audit Admin và yêu cầu gốc đợt 8;
đối chiếu AdminManagement, User/Workspace tables/editors, Dashboard/Shell và CSS;
AdminRequests.ReferenceRequest, AdminService, adminApi. Đọc Next cài sẵn về CSS Modules,
native history, useSearchParams/Suspense và accessibility.

- Hai bảng/editor đang chia sẻ CSS nhưng tên file gắn với users; keydown/focus modal lặp.
  Đợt này đưa CSS/keyboard handler thành nền chung Admin, không đổi global UI.
- Tài liệu kỹ thuật là màn Admin thực có còn dùng generic Editor cũ: query không giữ URL,
  sort label chưa đúng, không focus-return/dirty confirm/ref submit lock như các màn khác.
  Đồng bộ bảng/form hiện có; không thêm chức năng ngoài backend.
- References GET/POST/PUT /api/v1/vehicsim/admin/tech-references; q mã/tên, role=ref_type,
  ACTIVE/INACTIVE, sort name=ref_name A–Z, page/page_size theo API hiện có.
- 6 loại cố định, chỉ CONSTANT có ref_value; DECIMAL(30,12) API trả chuỗi.
  Giữ chuỗi tới POST/PUT, không Number/parseFloat, kể cả 0 và scientific notation hợp lệ.
  Tạo luôn active=true, update bật/tắt; không DELETE. Mọi field nguồn/metadata giữ nguyên.
- Không sửa backend/API/auth/JWT/quota/DB/worker/Analysis. Không dựng role/log/settings chưa có.
- Chưa có Figma Admin; chỉ kiểm UI thật với browser HTTP fixtures, không dữ liệu/API ghi thật.

## Các bước

1. [x] Git/bàn giao/source/contracts/Next docs và ghi nhận file có sẵn.
2. [x] Foundation CSS/tokens và dialog keyboard/focus dùng chung.
3. [x] Đồng bộ references list/form/query/review/error, gỡ generic code không còn được gọi.
4. [x] Lint/TypeScript/build, Java phù hợp và toàn bộ browser regression Admin/Analysis.
5. [x] Ảnh desktop/tablet/mobile, diff, xác minh file đợt 7 nguyên trạng, hoàn tất bàn giao.

Không git add/commit/push; dừng sau đợt 8, không tự triển khai hạng mục khác.

## Kết quả triển khai

- CSS bảng/editor đổi tên thành AdminTable.module.css / AdminEditor.module.css và dùng chung
  cho cả ba resource. AdminTokens.module.css chỉ gắn scope tại frame/sidebar Admin;
  tập trung màu surface/text/muted/line/focus/primary/danger và radius control, không sửa globals.
- useAdminDialog giữ vòng đời showModal/close, trả focus và Escape/Tab/Shift+Tab tại một chỗ,
  bao gồm textarea/link. Mỗi editor vẫn giữ luật dirty/review/busy và ref chống double-submit.
  Dialog có aria-busy; textarea có focus indicator. Các tests user/workspace giữ đủ kiểm trước đây.
- AdminManagement chỉ chọn component đúng resource dưới AuthGate/Suspense.
  Gỡ generic Management/Editor không còn được gọi sau khi có ba component riêng;
  không gỡ use case, field hay API của user/workspace/reference.
- References: bảng row header tên/mã/ID, loại, nguyên giá trị/đơn vị, trạng thái có chữ, cập nhật;
  sticky action có tên target, vùng cuộn ngang có nhãn/keyboard, empty/error/retry/loading rõ scope.
- Query q/status/role=ref_type/sort/page/page_size lưu URL. Tìm/sort/phân trang ở server thật,
  size 10/20/50/100, page clamp; Back/Forward/reload và điều hướng giữa ba màn giữ query đúng.
  Thêm kiểm pathname tại ba bảng để URL writes/response không cập nhật màn khác.
- Form reference chia Thông tin / Nguồn tham khảo, giữ đủ 14 field theo static diff với HEAD;
  payload gồm 14 field + is_active. Mã/tên bắt buộc và max length, năm integer 1–9999,
  URL http/https, CONSTANT có số; server tiếp tục kiểm precision/digits/uniqueness.
- ref_value dùng input text/inputMode decimal, giữ nguyên chuỗi kể cả 0/scientific notation;
  tuyệt đối không Number/parseFloat. Loại khác gửi null, không làm mất giá trị draft khi đổi loại.
  Mọi metadata nguồn, mô tả, DOI, năm/trang/URL/đơn vị còn nguyên; không thêm schema.
- Tạo luôn bật, sửa có bật/tắt; cả tạo/sửa có review target và trước/sau.
  Tắt có thông báo bản ghi vẫn giữ. Lỗi API giữ input; chỉ success mới đóng/refetch đúng query,
  tài liệu đổi loại/trạng thái rời filter theo response server. Không DELETE hoặc optimistic update.
- Detail validate target/loại/trạng thái/string value; stale detail/list bỏ qua,
  Thêm mới khóa khi mở detail. Không thêm API endpoint/quota/auth/role/log/settings mới.

## Kiểm chứng

- npm.cmd run lint: PASS cuối, gồm harness mới; không thêm eslint-disable hoặc nới rule.
- npx.cmd tsc --noEmit: PASS cuối.
- npx.cmd next build: PASS trên source cuối, mọi route hiện có build được.
- .\mvnw.cmd -B '-Dtest=AdminSecurityTest,AdminServiceTest,RepoDocsTest' test:
  PASS 21 tests, 0 failures/errors/skipped. Không sửa Java hoặc test Java.
  RepoDocsTest chạy lại sau chuyển completed.
- node tests/admin-consistency.mjs: PASS, 15 ảnh + result.json ở data/admin-batch8-ui.
  Dataset riêng 61 reference, HTTP fixture thực hiện search/type/status/name sort/count/pagination;
  đối chiếu row IDs đúng scope, URL canonical/clamp/Back/Forward giữa cả ba resource.
  Kiểm loading/error/network/malformed/retry/late responses và target detail sai/đến muộn.
  Tạo đủ metadata, normalize payload 15 key, chuỗi 18 chữ số nguyên + 12 thập phân giữ chính xác,
  giá trị 0 gửi string, scientific notation giữ trong review, non-CONSTANT gửi null.
  Required/URL/year/number validation, review/status, dirty keep/discard, Tab/ShiftTab/focus return,
  busy Escape/aria-busy/ref double-click; 409/400/403/429/network không mất draft,
  success refetch cùng query rồi row rời filter; 4 role nonAdmin denied, 401/guest.
- node tests/admin-user-forms.mjs: PASS (13 ảnh), node tests/admin-workspaces.mjs: PASS (20 ảnh).
  Hai harness này không sửa; kiểm refactor shared dialog/CSS bảo toàn các luồng đã có.
- node tests/admin-redesign.mjs: PASS (19 ảnh). Chỉ đổi nhãn empty reference trong harness;
  vẫn giữ navigation/profile/logout/guard/error/review/input preservation.
- node tests/admin-users-table.mjs: PASS (10 ảnh); node tests/admin-dashboard.mjs: PASS (9 ảnh).
- node tests/analysis-redesign.mjs: PASS; không sửa source/test Analysis.
- Đã xem ảnh reference list desktop/tablet/mobile, form mobile, create/error review và tắt tài liệu.
  Bốn viewport 1920×1080, 1366×768, 768×1024, 390×844, document không tràn ngang,
  dialog trong viewport, body cuộn/footer cố định, bảng có scroll region/sticky actions.
- git diff --check: PASS. Static đối chiếu HEAD: đủ 14 field reference.
  SHA256 file đợt 7 có sẵn khớp ban đầu, không sửa/gộp vào thay đổi đợt 8.
- Không thêm dependency hoặc dữ liệu cá nhân/API ghi thật. Artifacts data/ gitignored.

## Tổng kết các đợt

| Đợt | Kết quả |
|---|---|
| [1](2026-11-04-admin-layout-navigation-dot-1.md) | Khung/nav/breadcrumb/metadata Admin |
| [2](2026-11-04-admin-dashboard-dot-2.md) | Overview dùng total từ API, shortcut và trạng thái từng resource |
| [3](2026-11-04-admin-users-table-dot-3.md) | Bảng user/query URL/server pagination |
| [4](2026-11-04-admin-user-forms-dot-4.md) | Form user/review/quyền-trạng thái/focus/errors |
| [5](2026-11-04-admin-workspaces-dot-5.md) | Workspace list/form/archived detail/Manager picker |
| [6](2026-11-04-admin-roles-permissions-dot-6.md) | Audit: role cố định, assignment đã có; không module permission editor |
| [7](2026-11-04-admin-audit-settings-dot-7.md) | Audit: có logger, chưa có Audit reader/System Settings Admin |
| 8 | Nền styles/dialog chung, đồng bộ references và hồi quy toàn bộ |

Browser là HTTP fixture, chưa E2E auth/backend/DB/CARLA thật và chưa có Figma Admin để đối chiếu.
Không suy kết quả unit/browser fixture thành xác minh deployment hoặc quyền dựa trên DB thật.
Không có lỗi còn biết trong phạm vi đã kiểm; các giới hạn backend hiện hữu vẫn giữ nguyên.
Sort/page theo API hiện có; role/log/settings chưa có không được dựng giả ở UI.
Không tuyên bố hoàn thành module mới hoặc công việc nghiệp vụ của thành viên khác.

## File changes

Modified (10):
- frontend/src/components/admin/AdminDashboard.module.css
- frontend/src/components/admin/AdminManagement.tsx
- frontend/src/components/admin/AdminShell.module.css
- frontend/src/components/admin/AdminShell.tsx
- frontend/src/components/admin/AdminUserEditor.tsx
- frontend/src/components/admin/AdminUsersTable.tsx
- frontend/src/components/admin/AdminWorkspaceEditor.tsx
- frontend/src/components/admin/AdminWorkspaces.module.css
- frontend/src/components/admin/AdminWorkspacesTable.tsx
- frontend/tests/admin-redesign.mjs

Renamed/shared (2, Git chưa stage biểu diễn thành delete + untracked):
- AdminUsersTable.module.css → AdminTable.module.css (trong frontend/src/components/admin)
- AdminUserEditor.module.css → AdminEditor.module.css (cùng thư mục)

Added ngoài rename (8):
- frontend/src/components/admin/AdminTokens.module.css
- frontend/src/components/admin/useAdminDialog.ts
- frontend/src/components/admin/AdminReferencesTable.tsx
- frontend/src/components/admin/AdminReferenceEditor.tsx
- frontend/src/components/admin/AdminReferences.module.css
- frontend/src/components/admin/adminReferences.ts
- frontend/tests/admin-consistency.mjs
- docs/exec-plans/completed/2026-11-04-admin-consistency-dot-8.md

Không xóa chức năng. Không sửa backend/API client/auth/global layout/schema/worker/Analysis.
File có sẵn: docs/exec-plans/completed/2026-11-04-admin-audit-settings-dot-7.md giữ nguyên SHA256,
không tính là phần thêm của đợt 8. Chưa stage/commit/push.
Commit gợi ý: refactor(admin): unify UI foundations and complete regression checks.

Đợt 8 kết thúc; không tự mở đợt 9 hoặc công việc ngoài phạm vi.
