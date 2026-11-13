# Admin & Analysis — Phase 04/20: Admin User Search Optimization

Ngày thực hiện: 13/11/2026. Hoàn thành phạm vi Phase 4, chờ review.
Nhánh bắt đầu `chuvv`, HEAD `60286d0`; Phase 3 đã commit, working tree ban đầu sạch.
Không stage/commit/push, đổi main hoặc chuyển Phase 5.

## Nguồn đối chiếu

Đã đọc AGENTS.md, DESIGN.md, CLAUDE.md, frontend/AGENTS.md, frontend/CLAUDE.md,
phần kiến trúc frontend và báo cáo
[Phase 1](2026-11-13-admin-analysis-phase-01-admin-ui-audit.md),
[Phase 2](2026-11-13-admin-analysis-phase-02-layout.md),
[Phase 3](2026-11-13-admin-analysis-phase-03-user-table.md).
Đối chiếu AdminManagement/AuthGate, AdminUsersTable, query, editor/useAdminDialog,
adminApi/types/apiRequest, AuthContext và regression tests liên quan đã đọc trong chuỗi phase.
Đọc thêm hướng dẫn Native History API của Next cài trong repo trước khi sửa đồng bộ URL.

Nguồn thực tế backend được đọc để xác minh phạm vi, không sửa:

- `src/main/java/com/vsos/backend/controller/system/AdminController.java`:19–26.
- `src/main/java/com/vsos/backend/repository/common/AdminRepository.java`:27–43.

## Search flow ban đầu và phần đã đúng

Input có local draft → Enter hoặc nút Tìm → trim → change → Native History API →
useSearchParams/readUserQuery → adminApi.list → response có key → bảng.
Tìm kiếm **server-side**, không gọi API theo từng lần gõ.
API nhận q/status/role/sort/page/page_size; q tối đa 100 ký tự, tìm theo email hoặc
CONCAT_WS họ/tên đệm/tên. Không mở rộng search sang trường khác.

URL là nguồn của bộ lọc/trang đang áp dụng; draft chưa submit chỉ nằm trong SearchForm.
Chuẩn hóa query, phân trang, filter/sort, loading/error/empty, refresh sau save đã có.
apiRequest gom GET đang bay theo token/project/path; adminApi.list không nhận signal riêng.
Effect list dùng live flag + kiểm pathname/query hiện tại và result key, cleanup đánh dấu
không còn live. Không phát hiện lý do thay cơ chế đó; regression mới kiểm cả stale success/error.

Không thêm debounce vì input vốn chỉ submit có chủ đích. Không thêm AbortController,
thư viện, API option hoặc cơ chế request thứ hai khi cleanup hiện tại đã đáp ứng phạm vi.

## Lỗi đã xác nhận trước khi sửa

| Ưu tiên | Vị trí | Nguyên nhân và bằng chứng |
|---|---|---|
| P1: Enter search mất focus, khó tiếp tục gõ bằng bàn phím | [AdminUsersTable.tsx](../../../frontend/src/components/admin/AdminUsersTable.tsx):17–24,103 (dòng 98 trước sửa) | SearchForm có key=query.q. Khi q đổi, cả form/input bị remount. Browser xác nhận node cũ disconnected và activeElement không còn input. |
| P2: submit cùng từ khóa làm mất trang hiện tại và có request dư | [AdminUsersTable.tsx](../../../frontend/src/components/admin/AdminUsersTable.tsx):81–83,103 | Callback cũ luôn change({q,page:1}). Tại q=Fixture&page=3, Enter cùng q làm URL về q=Fixture; số GET list từ 3 lên 4. |

Chạy regression mới trên production build trước sửa: exit 1, ghi bốn quan sát:
input bị remount; mất focus; page 3 → 1; có thêm request không cần thiết.
Đây là hai lỗi thực tế, không gán race condition cho code đã có guard.

## Giải pháp và file sửa

| File | Thay đổi |
|---|---|
| [AdminUsersTable.tsx](../../../frontend/src/components/admin/AdminUsersTable.tsx):17–24 | Bỏ remount form bằng query key. Giữ một state object gồm draft và snapshot q đã áp dụng; chỉ đồng bộ khi q từ URL thực sự đổi. Conditional update có guard giúp đồng bộ history mà không dùng effect ghi state hoặc làm mất DOM/focus. Refresh cùng q không đè draft/con trỏ. |
| [AdminUsersTable.tsx](../../../frontend/src/components/admin/AdminUsersTable.tsx):81–83,103 | Hàm search đối chiếu q sau trim với q chuẩn hóa từ URL. Chỉ change({q,page:1}) khi q khác; cùng q là no-op. |
| [admin-user-search.mjs](../../../frontend/tests/admin-user-search.mjs) | Thêm suite browser HTTP fixtures, kiểm đủ nhóm 10 cases yêu cầu và tích hợp modal/create/edit/role/status. Theo cấu trúc harness hiện có; không thêm dependency. |
| Tài liệu này | Chuyển kế hoạch active sang completed, ghi bằng chứng và giới hạn. |

Giữ nguyên CSS/tokens/layout Phase 2–3, 4 cột, nhãn chip/fallback identity Phase 3,
API contract, payload, validation, quyền, xác nhận, quota, backend/DB/CARLA/AEB.
Không sửa logic Workspace hoặc Tài liệu kỹ thuật.
Không thay đổi thiết kế phân trang tổng thể thuộc Phase 5.

## Hành vi trước/sau

| Tình huống | Trước | Sau |
|---|---|---|
| Enter với q mới | Input bị tạo lại, mất focus | Cùng node DOM, giữ focus; kết quả mới đúng q |
| Cùng q tại page 3 | Về page 1, thêm một GET | Giữ page 3, URL và số GET không đổi |
| q chỉ khác khoảng trắng đầu/cuối | Có thể về page 1 do callback luôn reset | So sánh q sau trim; giữ trang, không request dư |
| q khác khi ở page 3 | Reset page 1 | Giữ hành vi đúng; giữ status/sort/page_size |
| Refresh khi đang gõ draft chưa submit | Giữ draft nếu q không đổi | Vẫn giữ draft/focus/vị trí con trỏ sau response refresh |
| Back/Forward thay q | Remount input để sync | Sync draft theo URL nhưng giữ DOM hiện tại |
| Xóa q | Xóa nội dung rồi submit hoặc gỡ chip | Giữ cơ chế hiện hành; các filter khác được giữ |
| Escape trong search trên Edge | Native search xóa draft | Vẫn chỉ xóa draft; chưa submit thì không đổi q áp dụng hoặc gửi GET |
| Save/create/edit/role/status | Refetch có revision, giữ query/page | Giữ cơ chế; regression xác nhận page 3 và q không mất, row không khớp biến mất đúng filter |

Không ép focus về input khi người dùng chủ động chuyển sang control khác.
Search chỉ giữ focus hiện tại, không thêm effect focus mỗi lần response về.

## Regression theo yêu cầu

| # | Case thực thi | Kết quả |
|---|---|---|
| 1 | Gõ nhanh từng ký tự, trim, con trỏ; không request đến khi Enter | PASS; bốn viewport, đúng một GET khi submit q mới |
| 2 | A thành công chậm → B thành công trước → A về sau | PASS; B vẫn có đúng row/query, không bị loading hoặc dữ liệu A thay thế |
| 3 | A lỗi 503 chậm → B thành công → A lỗi về sau | PASS; B giữ nguyên, không hiện alert cũ |
| 4 | Xóa draft + Enter, gỡ chip tìm kiếm; Escape chỉ xóa draft | PASS; phục hồi list theo filter còn áp dụng |
| 5 | q thực sự khác tại page 3 | PASS; về page 1, giữ status/sort/page_size |
| 6 | Chuyển trang, submit lại q, Back/Forward | PASS; giữ q khi paging, history đồng bộ input; no-op không reset page |
| 7 | q không khớp bản ghi | PASS; Không có dữ liệu phù hợp., không dùng Chưa có tài khoản |
| 8 | API lỗi rồi retry | PASS; alert rõ, không giả làm empty, không giữ row cũ |
| 9 | Mở/đóng modal; confirmed create/edit/role/status | PASS; q/sort/page 3 giữ nguyên sau create/edit; lock làm row rời filter; chỉ 3 mutation fixture có xác nhận |
| 10 | Rời sang Workspace trước khi A success hoặc error về | PASS; callback cũ bị bỏ qua, không có GET users mới sau unmount hoặc alert lạc trang |

Request cũ đang bay vẫn có thể hoàn tất; không tuyên bố đã hủy network.
Kiểm #10 xác nhận cleanup bỏ qua kết quả an toàn theo pattern hiện hành.
Fixture chụp response trước khi gate, cho phép đảo thứ tự thật trong browser.
Không chỉ kiểm payload tĩnh hoặc nới assertion cho xanh test.

## Browser, ảnh và artifact

Dùng production frontend `127.0.0.1:3117` và Edge headless/Playwright,
login qua form với HTTP fixtures. Không dùng tài khoản thật hoặc ghi backend/DB thật.
Đã xem ảnh trước/sau Enter ở desktop và ảnh search giữ focus mobile.
Regression chạy 1366×768, 768×1024, 390×844, 320×568; không có document overflow ngang.
Năm ảnh bảng ban đầu 1920/1366/768/390/320 của suite hiện có có hash PNG giống hệt Phase 3.

Artifact local nằm trong `data/` đã gitignore, không đưa vào commit:

- `data/admin-phase4-2026-11-13/before/`: 2 ảnh + baseline-observations.json, bốn dấu hiệu lỗi trước sửa.
- `data/admin-phase4-2026-11-13/search/`: 7 ảnh + baseline-observations.json/result.json; quan sát lỗi sau sửa rỗng, GET cùng q giữ 3 → 3 thay vì 3 → 4.
- `data/admin-phase4-2026-11-13/comparison.json`: hash source và năm ảnh bảng so với Phase 3.
- `users-table/`, `user-forms/`, `layout/`, `workspaces/`, `references/`, `entry/` dưới cùng thư mục: kết quả sáu suite hiện có.

Hash source xác nhận chỉ AdminUsersTable.tsx thay đổi trong frontend/src.
Không đối chiếu Figma Admin; không suy ra fidelity từ screenshot fixtures.

## Validation thực thi

Lệnh frontend chạy từ `frontend` với npm.cmd/npx.cmd:

| Lệnh | Kết quả |
|---|---|
| `npm.cmd run lint` | PASS, exit 0, lượt cuối không warning |
| `npx.cmd tsc --noEmit` | PASS, exit 0 |
| `npm.cmd run build` | PASS, exit 0; Next 16.4.1 production |
| `node tests/admin-user-search.mjs` | PASS, 7 ảnh, 10 nhóm case ở trên |
| `node tests/admin-users-table.mjs` | PASS, 21 ảnh |
| `node tests/admin-user-forms.mjs` | PASS, 16 ảnh |
| `node tests/admin-redesign.mjs` | PASS, 69 ảnh |
| `node tests/admin-workspaces.mjs` | PASS, 23 ảnh |
| `node tests/admin-consistency.mjs` | PASS, 15 ảnh |
| `node tests/admin-dashboard.mjs` | PASS, 10 ảnh; kiểm entry/redirect hiện tại |
| `git diff --check` | PASS, exit 0 |
| Từ root: `.\mvnw.cmd -B -Dtest=RepoDocsTest test` | PASS, 5 tests, không fail/error/skip |

Browser suites dùng `ADMIN_UI_URL=http://127.0.0.1:3117` và
`ADMIN_UI_OUTPUT=data/admin-phase4-2026-11-13/<suite>`. Tổng 161 ảnh/bảy suite.

## Giới hạn và bàn giao

Kiểm bằng HTTP fixtures; chưa xác minh deployment/backend/auth/DB thật.
Không chạy provider/CARLA hoặc thêm dữ liệu sản phẩm.
Chưa kiểm Firefox/Safari, thiết bị touch/bàn phím ảo thật, screen reader/voice control,
IME thực tế hoặc Figma Admin. Escape nêu trên được quan sát trên Edge, không tuyên bố mọi browser giống nhau.
Không có regression mới được ghi nhận trong phạm vi kiểm; các nợ khác trong audit Phase 1
và giới hạn Phase 3 vẫn giữ nguyên, không tự chuyển sang sửa chức năng khác.

Commit đề xuất: `fix(admin): preserve user search focus and unchanged query pages`.
Dừng tại Phase 4 để người dùng review và commit/push thủ công.
