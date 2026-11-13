# Admin & Analysis — Phase 03/20: Admin User Table Refinement

Ngày thực hiện: 13/11/2026. Trạng thái: hoàn thành phạm vi Phase 3, chờ người dùng review.
Nhánh bắt đầu `chuvv`; HEAD `ff2ecd1` (Phase 2 đã commit). Working tree ban đầu sạch.
Không stage, commit, push, đổi main hoặc chuyển Phase 4.

## Đọc và đối chiếu hiện trạng

Đã đọc AGENTS.md, DESIGN.md, CLAUDE.md, frontend/AGENTS.md, frontend/CLAUDE.md,
kiến trúc phần frontend, hướng dẫn cập nhật package/quy tắc đặt tên,
[audit Phase 1](2026-11-13-admin-analysis-phase-01-admin-ui-audit.md) và
[báo cáo Phase 2](2026-11-13-admin-analysis-phase-02-layout.md).
Đọc hướng dẫn CSS Modules trong Next cài tại `frontend/node_modules/next/dist/docs/`.

Đối chiếu code đang chạy: AdminManagement/AuthGate → AdminUsersTable → AdminUserEditor,
AdminTable/AdminUsers/AdminTokens CSS, adminUsersQuery, adminApi/apiRequest/AuthContext,
useAdminDialog, các regression bảng/form/layout và các component Admin sử dụng CSS chung.
Không suy ra khả năng từ tên file hay kế hoạch cũ.

## Audit bảng và quyết định phạm vi

| Mức độ | Vị trí | Bằng chứng trước sửa | Xử lý |
|---|---|---|---|
| P1 / ADM-02 phần Tài khoản: tên truy cập chip thiếu nhãn nhìn thấy | [AdminUsersTable.tsx](../../../frontend/src/components/admin/AdminUsersTable.tsx):105–106 | Lọc role=ENGINEER, status=ACTIVE: visible Kỹ sư/Đang hoạt động nhưng aria-label chỉ Bỏ lọc vai trò/Bỏ lọc trạng thái. Axe 4.14.0 báo label-content-name-mismatch, impact serious, 2 nút. Regression mới exit 1, actual Bỏ lọc vai trò, expected Bỏ lọc vai trò: Kỹ sư. | Sửa cục bộ trong Phase 3. |
| P2: thiếu email làm tên action không xác định tài khoản; identity chỉ khoảng trắng không có fallback | [AdminUsersTable.tsx](../../../frontend/src/components/admin/AdminUsersTable.tsx):119–126 | Email null → Chỉnh sửa tài khoản —, nhiều email null có cùng tên action. Full name/email chỉ khoảng trắng → dòng tên trống, không dùng ID; full name trống nhưng có email chưa dùng email làm tên. Fixture ID 902 làm regression exit 1: rowheader chỉ U, thiếu Tài khoản #902. | Sửa fallback hiển thị và tên action. |
| Đã đáp ứng, giữ nguyên | [AdminTable.module.css](../../../frontend/src/components/admin/AdminTable.module.css):27–48; [AdminUsers.module.css](../../../frontend/src/components/admin/AdminUsers.module.css):1 | 4 cột: Tài khoản (tên + email), Vai trò, Trạng thái, Thao tác. Table min-width 680px; identity 230–360px; tên/email overflow-wrap:anywhere; action sticky bên phải. Không phát hiện tràn ngang cấp trang ở các viewport đã chạy. | Không thêm cột, không chỉnh width/font/spacing hoặc shared CSS. |
| Đã đáp ứng, tăng coverage chỗ thiếu | [AdminUsersTable.tsx](../../../frontend/src/components/admin/AdminUsersTable.tsx):54–90,113–137 | Query/URL/paging, tải/lỗi/trống, detail guard, pending edit, xác nhận/success đã có. Test bảng cũ chưa có identity null/whitespace và empty không lọc riêng. | Giữ handler; thêm regression dữ liệu thiếu, empty không lọc và pending action. |

Dữ liệu thiếu là tình huống HTTP fixture được type AdminRow cho phép và list guard hiện tại
chấp nhận; không khẳng định DB/deployment thật đang có tên hoặc email null.
Chỉ đổi trình bày, không sửa dữ liệu, API contract hoặc nới guard mở editor.

## File thay đổi và hành vi trước/sau

| File | Thay đổi thực tế |
|---|---|
| [AdminUsersTable.tsx](../../../frontend/src/components/admin/AdminUsersTable.tsx):105,119 | aria-label role/status chứa giá trị tiếng Việt đang hiển thị; tên/email dạng string được trim khi hiển thị; tên rỗng dùng email, sau đó Tài khoản #ID; email thiếu hiển thị —; tên action thiếu email dùng #ID. |
| [admin-users-table.mjs](../../../frontend/tests/admin-users-table.mjs):11,108,120,152,170,205 | Fixture null/whitespace; thêm viewport 320px, chuỗi không có dấu cách 120 ký tự, empty không lọc, identity/action ID, guard detail thiếu dữ liệu, focus/keyboard chip và table, đủ 5 role/2 status, trạng thái chờ mở editor. Ready helper nhận tên chip có ngữ cảnh mới, vẫn kiểm query/data/row count. |
| [admin-user-forms.mjs](../../../frontend/tests/admin-user-forms.mjs):179 | Cập nhật đúng tên chip mới Người duyệt; giữ nguyên kiểm stale detail và toàn bộ guard/form/save. |
| Tài liệu này | Chuyển plan active sang completed, ghi audit, scope, kết quả và giới hạn. |

Ví dụ sau sửa: tên rỗng + email fallback@example.invalid → tên hiển thị email;
tên/email null hoặc chỉ khoảng trắng → Tài khoản #901 / Tài khoản #902, email —,
action Chỉnh sửa tài khoản #901 / #902. Vai trò/trạng thái null vẫn là Chưa rõ.
Click action vẫn tải đúng ID; detail thiếu dữ liệu bị từ chối trước khi mở editor.

Giữ nguyên toàn bộ layout Phase 2, CSS/tokens chung, typography, màu, radius và 4 cột.
Giữ một nút sửa mỗi dòng, trạng thái Đang mở…, disabled khi mở detail, Add, search,
filter, sort, paging 10/20/50/100, URL/reload/history, self guard, quyền truy cập,
review/confirm, lỗi giữ draft, success theo response thật và focus feedback.
Không thêm badge/card/icon/chức năng mới. Không đổi backend/database/AEB/CARLA,
service API, payload lưu hoặc migration.

## Ma trận kiểm chứng bảng

| Nhóm | Kết quả thực chạy |
|---|---|
| Căn cột/tên dài/email dài | 1920×1080, 1366×768, 768×1024, 390×844, 320×568; tên có thêm chuỗi 120 ký tự liền nhau vẫn wrap trong table. |
| Responsive/focus/action | Không có document horizontal overflow ở các viewport kiểm. Region nhận focus outline 3px; ArrowRight cuộn vùng bảng; action đầu tiên nằm trong viewport 320px và có outline 3px. |
| Null/whitespace | Desktop/tablet/mobile 1366/768/320: 3 fixture giữ ID/tên fallback, email placeholder, role/status Chưa rõ, tên action phân biệt. Detail thiếu dữ liệu không mở dialog hoặc gửi mutation. |
| Loading/list refresh | Pending query không giữ row/action cũ; response lỗi cũ không thay kết quả query mới; refresh có trạng thái tải. |
| Empty / không tìm thấy | Empty không lọc Chưa có tài khoản; filtered empty Không có dữ liệu phù hợp.; không tạo dòng giả; page ngoài phạm vi được clamp. |
| Error/retry | 503/403/network/malformed response: bỏ rows và tổng cũ; retry giữ query và tải lại. |
| Nhiều bản ghi | 61 fixture; page sizes 10/20/50/100, số dòng và tổng đúng, search/sort/filter phía server fixture. |
| Pending edit | Add và các nút sửa bị disabled; đúng nút có Đang mở…; chưa mở dialog trước response detail. |
| Xác nhận/quyền | Không mutation trước confirm; rejected PUT giữ dữ liệu; success mới refetch, giữ filter/focus; tự đổi role/status bị chặn; 4 role khác Admin/401/guest giữ guard. |
| Chip filter | Đủ 5 role, 2 status: tên truy cập chứa đúng nhãn; Enter gỡ role/status, giữ query khác và Back/Forward. |
| Các Admin khác / Phase 2 | Workspace/reference suites và layout suite qua, gồm dialog thấp, mouse wheel, Tab/Shift+Tab, review/discard, menu mobile; không đổi CSS dùng chung. |

## Browser và bằng chứng trước/sau

Chạy app production tại `127.0.0.1:3116`, Edge headless/Playwright.
Dùng form login với HTTP fixture, không dùng tài khoản thật hoặc ghi DB.
Production build baseline khớp source Phase 2 đã commit; chỉ sửa component bảng Tài khoản.

Probe trước/sau mỗi bên 33 snapshot; 31 cặp PNG có SHA-256 giống hệt.
Hai ảnh khác: users-missing-1366 có fallback mới; users-dialog-320x256 khác nền bên ngoài,
phần trong dialog không đổi (đối chiếu pixel bằng System.Drawing và xem trực tiếp).
Geometry của toàn bộ dialog trong probe giống hệt trước/sau.
Ảnh viewport mobile missing-data ban đầu chỉ thấy toolbar; dùng ảnh full-page trong
suite users-table/incomplete-320.png để kiểm chính các dòng và action.

Axe 4.14.0: mỗi bên 13 scan. Trước sửa 5 snapshot có rule ADM-02; sau sửa còn 4,
đều là Workspace/Tài liệu kỹ thuật hoặc ngữ cảnh lặp của chúng.
Snapshot users-filtered sau sửa không còn violation; không suy ra toàn Admin đạt WCAG.
Axe có incomplete checks và không thay thế kiểm screen reader/giọng nói thật.

Artifact local đã gitignore, không thêm vào commit:

- `data/admin-phase3-2026-11-13/before/` và `after/`: probe script, axe và 33 ảnh/geometry mỗi bên.
- `data/admin-phase3-2026-11-13/comparison.json`: hash ảnh, geometry, overflow, axe và source.
- `data/admin-phase3-2026-11-13/dialog-pixel-comparison.json`: vùng trong dialog kiểm không có pixel khác.
- `data/admin-phase3-2026-11-13/red-chips/` và `red-identity/`: ảnh từ hai lần regression thất bại trên code cũ.
- `data/admin-phase3-2026-11-13/users-table/`: 21 ảnh + result.json, gồm null/whitespace/empty/5 role/long data.
- `user-forms/`, `workspaces/`, `references/`, `layout/`, `entry/` dưới cùng thư mục: kết quả các suite khác.

Đã xem ảnh trước/sau thiếu dữ liệu desktop, bảng dài/mobile 320px, bảng null/mobile,
dialog thấp và các snapshot Admin khác. Không đối chiếu Figma Admin.
Phân tích pixel thử bằng Pillow không chạy do thiếu module PIL; dùng System.Drawing
có sẵn trên Windows để hoàn tất đối chiếu, không thêm dependency.

## Validation thực thi

Lệnh frontend chạy từ `frontend`; PowerShell dùng `npm.cmd`/`npx.cmd`:

| Lệnh/kiểm tra | Kết quả |
|---|---|
| `npm.cmd run lint` | PASS, exit 0, gồm các test sau cập nhật cuối |
| `npx.cmd tsc --noEmit` | PASS, exit 0 |
| `npm.cmd run build` | PASS, exit 0; Next 16.4.1 production |
| `node tests/admin-users-table.mjs` | PASS, 21 ảnh |
| `node tests/admin-user-forms.mjs` | PASS, 16 ảnh |
| `node tests/admin-workspaces.mjs` | PASS, 23 ảnh |
| `node tests/admin-consistency.mjs` | PASS, 15 ảnh |
| `node tests/admin-redesign.mjs` | PASS, 69 ảnh |
| `node tests/admin-dashboard.mjs` | PASS, 10 ảnh; chỉ kiểm entry/redirect hiện tại |
| Probe trước/sau | Exit 0, 33 snapshot mỗi bên; kết quả phát hiện lỗi riêng như trên |
| `git diff --check` | PASS, exit 0 |
| Từ root: `.\mvnw.cmd -B -Dtest=RepoDocsTest test` | PASS, 5 tests, không fail/error/skip |

Browser suites dùng `ADMIN_UI_URL=http://127.0.0.1:3116` và
`ADMIN_UI_OUTPUT=data/admin-phase3-2026-11-13/<suite>`. Tổng 154 ảnh/sáu suite.
Không gọi API backend thật; mutation fixture chỉ xảy ra trong browser interception.

## Rủi ro và việc giữ ngoài phạm vi

Chưa kiểm deployment/live auth/backend/DB, Figma Admin, Safari/Firefox, thiết bị touch thật,
screen reader/voice control thật hoặc bàn phím ảo. Kiểm tên truy cập bằng DOM/axe và keyboard
không chứng nhận toàn bộ accessibility. Dữ liệu thiếu được tái hiện bằng fixture có chủ đích.

ADM-02 trên Workspace/Tài liệu kỹ thuật, ADM-03 focus sau lưu tài liệu,
ADM-04 NotificationBell Escape, ADM-05 guard archived Manager, ADM-06 hợp đồng metric
vẫn theo audit Phase 1; không mở rộng Phase 3 sang các phần này.
Hash source xác nhận chỉ AdminUsersTable.tsx thay đổi trong frontend/src; CSS hoàn toàn giữ nguyên.

Commit đề xuất: `fix(admin): clarify user table filters and missing identities`.
Dừng để người dùng review và commit/push thủ công; không tự sang Phase 4.
