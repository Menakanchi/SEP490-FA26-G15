# Admin & Analysis — Phase 08/20: Admin Workspace Management Refinement

Ngày thực hiện: 14/11/2026. Hoàn thành phạm vi Phase 8, chờ review.
Nhánh ban đầu `chuvv`, HEAD `f421416` (Phase 7 đã commit), working tree sạch.
Chỉ Phase 8; không stage/commit/push, đổi main hoặc triển khai Phase 9.

## Nguồn đối chiếu

Đã đọc AGENTS.md, DESIGN.md, CLAUDE.md, frontend guides, kiến trúc/phân quyền Workspace,
báo cáo [Phase 1](2026-11-13-admin-analysis-phase-01-admin-ui-audit.md),
[Phase 2](2026-11-13-admin-analysis-phase-02-layout.md),
[Phase 3](2026-11-13-admin-analysis-phase-03-user-table.md),
[Phase 4](2026-11-13-admin-analysis-phase-04-user-search.md),
[Phase 6](2026-11-14-admin-analysis-phase-06-user-form.md),
[Phase 7](2026-11-14-admin-analysis-phase-07-modal.md).
Không thấy Phase 5 cùng chuỗi; các báo cáo refinement ngày 07/11 là lịch sử khác.
Đọc guide accessibility của Next cài trong repo, AdminManagement, Shell/Tokens/Table CSS,
AdminWorkspacesTable, query helpers, WorkspaceEditor, useAdminDialog, adminApi/apiRequest và harness.

Backend/ADR chỉ đọc, không sửa:
`controller/system/AdminController.java`, `service/system/AdminService.java`,
`repository/common/AdminRepository.java`, `controller/workspace/WorkspaceController.java`,
`service/workspace/WorkspaceService.java`, `security/VehicSimAccess.java` dưới `src/main/java/com/vsos/backend/`;
[ADR-045](../../adr/ADR-045-manager-cap-role-khi-them-thanh-vien.md) là tài liệu Proposed lịch sử.
Khi tài liệu nói Manager/Admin thêm thành viên nhưng code mới giới hạn Manager,
ưu tiên code và [kiến trúc hiện hành](../../vehicsim/architecture.md):359–377.

## Audit luồng và contract thực tế

| Luồng | Hành vi/nguồn thực tế | Kết luận |
|---|---|---|
| Danh sách | GET /admin/workspaces với q/status/sort/page/page_size; tìm tên workspace, tên/email Manager qua LOCATE ở AdminRepository | Giữ contract, không lọc danh sách chỉ trong browser |
| Bảng | 5 cột; min-width 880px, table region cuộn riêng, sticky actions; tên dài wrap; member/project counts do SQL COUNT trả về | Không có bằng chứng cần đổi cột, CSS hoặc kích thước |
| Dữ liệu thiếu | workspaceCount chỉ format số nguyên an toàn không âm, dữ liệu khác hiện —; tên/Manager có fallback; unknown status hiện Chưa rõ, detail có guard | Giữ fallback và validation hiện hành, không thêm số đếm giả |
| Tạo | Chọn Manager ACTIVE, review → POST → success mới đóng/refetch; dirty/busy/ref lock | Đã có, không thêm nghiệp vụ |
| Xem/sửa | Detail trước edit, guard ID/Manager/status; PUT đủ name/description/manager_id; archived read-only | Giữ nguyên, không thêm archive/restore/delete |
| Giao Manager | Backend kiểm role MANAGER và active, khóa user để tránh race với đổi role; đổi Manager mới notify/disconnect | Giữ quyền, notification và dependencies |
| Tìm Manager | GET /admin/users role=MANAGER,status=ACTIVE,sort=name,page_size=20, q theo tên/email, có phân trang | Đây là Admin Manager picker, không phải tìm thành viên |
| Thành viên | Admin không có UI/API membership; /workspaces/{id}/members và member-candidates thuộc khu Manager | Không thêm member UI cho Admin hoặc mở rộng quyền |
| Tìm thành viên | Backend member-candidates chỉ exact-email, EXPERIENCER active chưa là member, Manager-only | Giữ nguyên, không chuyển partial-email hoặc sao chép search này sang Admin |
| Query/refresh | Canonical URL, page clamp, no stale rows on pending/error, query/live guards; editor opening sequence chống detail cũ | Giữ cơ chế đã có; thêm regression quanh những lỗi search dưới đây |
| Save/refresh lỗi | Save được backend xác nhận rồi mới success; refresh lỗi ẩn bảng và hiện alert/retry | Regression mới xác nhận không biểu diễn bảng cũ như đã đồng bộ |

Global role nằm trên tài khoản; việc Manager thêm EXPERIENCER kèm cấp ENGINEER/REVIEWER
thuộc luồng riêng và transaction backend, không phải một role mới chỉ có hiệu lực trong Workspace.
Không có thao tác đổi membership role độc lập trong Admin để triển khai/test ở phase này.

## Ba lỗi đã xác nhận và sửa

| Mức độ / vị trí | Bằng chứng RED và nguyên nhân | Sau sửa |
|---|---|---|
| P1 — [AdminWorkspacesTable.tsx](../../../frontend/src/components/admin/AdminWorkspacesTable.tsx):13–18,88 | SearchForm dùng key=query.q. Enter q mới làm node input bị thay và focus rơi về BODY. | Bỏ remount; giữ applied/draft trong state, chỉ đồng bộ khi q từ URL đổi. Enter giữ DOM/focus; refresh cùng q giữ draft/con trỏ. |
| P2 — cùng file:65–67 | q=Lab,status=ACTIVE,sort=name,page=3,page_size=10; Enter với “  Lab  ” làm mất page=3 và GET tăng 2→3. Callback cũ luôn đặt page=1. | So q trim với q chuẩn hóa từ URL; chỉ đổi q/page khi từ khóa thực sự khác. Cùng q không tạo history/request hoặc mất trang. |
| P2 — cùng file:92, phần Workspace của ADM-02 | Chip nhìn thấy Hoạt động/Đã lưu trữ nhưng aria-label đều chỉ “Bỏ lọc trạng thái”. | Accessible name thành “Bỏ lọc trạng thái: <giá trị hiển thị>”; giữ nhãn, style và hành vi gỡ chip. |

Harness mở rộng chạy trên production baseline Phase 7: exit 1, ghi sáu observations
(page reset, GET dư, remount, mất focus, tên của hai chip).
Sau sửa cùng assertions cho searchIssues=[].
Không sửa assertion để bỏ qua lỗi: ready helper nhận diện chip bằng prefix để dùng được
cả baseline/sau sửa, còn assertion mới kiểm chính xác toàn bộ tên gồm giá trị từng trạng thái.

Pattern applied/draft và q no-op đã có tại bảng Tài khoản Phase 4;
áp dụng cục bộ vài dòng theo cùng cách, không đổi User code hoặc tạo hook dùng chung tăng coupling.
Không thêm debounce vì search hiện chỉ gửi khi Enter/nút Tìm; không có request theo từng lần gõ.

## File thay đổi và trước/sau

| File | Thay đổi |
|---|---|
| [AdminWorkspacesTable.tsx](../../../frontend/src/components/admin/AdminWorkspacesTable.tsx) | Search state/submit handler và tên truy cập chip; chỉ file production này thay đổi |
| [admin-workspaces.mjs](../../../frontend/tests/admin-workspaces.mjs) | Mở rộng harness hiện có: RED observations, DOM/focus/page/no-op, draft/caret/history/chips, thêm viewports, save-confirmed + failed refresh + retry |
| Tài liệu này | Active plan chuyển completed, ghi audit/quyền/validation và giới hạn |

Giữ nguyên Shell, Tokens, Table/Workspace/Editor CSS, min-width 880px, 5 cột,
create/edit/read-only/validation/Manager picker, payload/API, permissions/quota,
dirty/review/ref lock và focus/scroll lifecycle Phase 7.
Không sửa User Management, role khác, backend/database, Analysis/CARLA/AEB hoặc dependency.

## Regression theo 16 nhóm yêu cầu

| # | Yêu cầu | Kết quả / phạm vi thực tế |
|---|---|---|
| 1 | Danh sách | 61 fixture, 20 dòng đầu, 5 headers, server sort/filter/page sizes và counts đúng fixture |
| 2 | Tên dài | Fixture tên Workspace dài hiện nguyên nội dung/wrap, không document overflow |
| 3 | Bảng responsive | 1920/1440/1366/1024/768/375/390; region keyboard ArrowRight và sticky actions ở mobile |
| 4 | Loading/empty | Pending bỏ rows/actions cũ; empty không lọc khác không tìm thấy; có role=status |
| 5 | API error | 503/403/network/malformed có alert/retry, không bảng cũ hoặc empty giả |
| 6 | Member search | N/A cho Admin; xác minh exact-email route Manager trong code; picker Manager thực chạy partial name/email đúng Admin API |
| 7 | Response cũ | List error, Manager search error và detail cũ không thay query/editor hiện tại; giữ guard hiện hữu |
| 8 | Thêm thành viên | N/A: không có thao tác Admin này, không gọi API Manager-only để tạo PASS |
| 9 | Thành viên trùng | N/A: không có mutation membership; workspace name conflict 409 vẫn kiểm giữ draft |
| 10 | Quyền | Bốn role ngoài Admin không đọc Admin list; 403/401/guest và invalid Manager/archive/quota vẫn kiểm |
| 11 | Xóa thành viên | N/A: không có thao tác Admin; không thêm nút xóa hoặc đổi quyền |
| 12 | Double-click | Create ref lock chỉ một POST dù click xác nhận hai lần; busy chặn Escape/nút đóng |
| 13 | Refresh mutation | POST/PUT success mới đóng/refetch; PUT confirmed nhưng list 503 hiện alert, không stale rows/empty; retry không gửi PUT lần nữa |
| 14 | Giữ filter/page | Enter cùng q giữ page=3/no extra GET; q mới reset page, giữ status/sort/page_size; Back/Forward/canonical/page clamp và mutation giữ scope |
| 15 | Focus | Enter tìm giữ cùng input; chip gỡ bằng Enter; modal cancel/discard trả opener; success có target và focus feedback; Phase 7 fallback/lock vẫn qua |
| 16 | Mobile/tablet | List bảy widths, modal shared 375/390/768/1024/1440 và low-height 320x256/667x375/1280x480 |

Save thành công + refresh thất bại vẫn hiển thị xác nhận đã lưu, đó là kết quả mutation backend đã trả success;
đồng thời list hiện alert, bảng không tồn tại. Không coi thông báo này là bằng chứng list đã đồng bộ.
Retry chỉ GET, sau thành công vẫn giữ query và Manager mới/counts đúng fixture.

## Browser QA và so sánh

Production app `http://127.0.0.1:3120`, Edge headless qua Playwright hiện có.
Đăng nhập qua form với HTTP fixture; không dùng tài khoản thật hoặc ghi DB.
Đã xem trực tiếp ảnh Enter trước/sau (sau có focus ring), danh sách desktop 1440/mobile 375,
modal Workspace 375 và low-height action, save + failed refresh ở 390.
Bảy ảnh danh sách bảy widths giống hệt byte baseline; không redesign layout.
Hash 132 file frontend/src trước/sau: chỉ AdminWorkspacesTable.tsx đổi.

Artifacts local gitignore trong `data/admin-phase8-2026-11-14/`, không commit:

- `before/search-observations.json`: sáu observations RED và ảnh baseline.
- `workspaces/`: 28 ảnh, searchIssues=[], result.json PASS.
- `layout/`: 102 ảnh và shared modal/scroll/focus checks.
- `users-table/` (21), `references/` (15), `search/` (7).
- `source-hashes.json`, `verification-summary.json`: nguồn, hash ảnh và năm suite.
- Tổng năm suite 173 ảnh; số ảnh không đồng nghĩa số test cases độc lập.

## Validation thực thi

Frontend chạy từ `frontend`, dùng `npm.cmd`/`npx.cmd`;
suites dùng `ADMIN_UI_URL=http://127.0.0.1:3120` và
`ADMIN_UI_OUTPUT=data/admin-phase8-2026-11-14/<suite>`.

| Lệnh | Kết quả |
|---|---|
| `npm.cmd run lint` | PASS exit 0; eslint Workspace harness sau bổ sung refresh case cũng PASS exit 0 |
| `npx.cmd tsc --noEmit` | PASS exit 0 |
| `npm.cmd run build` | PASS exit 0, Next 16.4.1 production |
| `node tests/admin-workspaces.mjs` | PASS exit 0, 28 ảnh |
| `node tests/admin-redesign.mjs` | PASS exit 0, 102 ảnh, bao gồm behavior Phase 7 |
| `node tests/admin-users-table.mjs` | PASS exit 0, 21 ảnh |
| `node tests/admin-consistency.mjs` | PASS exit 0, 15 ảnh |
| `node tests/admin-user-search.mjs` | PASS exit 0, 7 ảnh |
| Root: `.\mvnw.cmd -B -Dtest=RepoDocsTest test` | PASS exit 0, 5 tests, không failure/error/skip |
| `git diff --check` | PASS exit 0 |

Không chạy lại business/security tests Java: backend/API/permission không thay đổi.
Fixture assertions và source audit không thay thế kiểm quyền với backend triển khai thật.

## Giới hạn và rủi ro còn lại

Chưa kiểm live auth/API/DB, Figma Admin (không có thiết kế truy cập được trong phiên),
Safari/Firefox, screen reader, thiết bị touch/bàn phím ảo, zoom/text scaling native.
Không tuyên bố WCAG toàn diện hoặc tích hợp backend thật PASS.

Membership exact-email/add/remove/role không thuộc Admin UI hiện hành; nếu cần mở cho Admin,
phải chốt quyền/API riêng, không dùng ADR Proposed cũ để tự mở rộng.
ADM-05 về Manager còn archived Workspace vẫn giữ guard hiện hành; không thêm đường vượt quyền.
ADM-02 chỉ xử lý chip Workspace; phần Tài liệu kỹ thuật còn ngoài phạm vi.
Thông báo API lỗi Workspace vẫn theo helper Error.message hiện hữu; phase này không chuẩn hóa
toàn bộ pipeline thông báo lỗi hoặc thay apiRequest dùng chung.

Commit đề xuất: `fix(admin): refine workspace management UI and interactions`.
Dừng tại Phase 8 để người dùng review, commit và push thủ công.
