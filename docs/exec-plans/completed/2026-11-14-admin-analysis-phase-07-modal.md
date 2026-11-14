# Admin & Analysis — Phase 07/20: Admin Modal Editor UX & Accessibility

Ngày thực hiện: 14/11/2026. Hoàn thành Phase 7, chờ review.
Nhánh ban đầu `chuvv`, HEAD `d8f0fe0` (`refactor(admin): standardize user form validation`).
Working tree ban đầu sạch; Phase 6 đã commit. Chỉ thực hiện Phase 7.
Không stage/commit/push, không sửa main, không triển khai Phase 8.

## Nguồn và hiện trạng

Đã đọc AGENTS.md, DESIGN.md, CLAUDE.md, frontend/AGENTS.md, frontend/CLAUDE.md,
kiến trúc frontend, các báo cáo
[Phase 1](2026-11-13-admin-analysis-phase-01-admin-ui-audit.md),
[Phase 2](2026-11-13-admin-analysis-phase-02-layout.md),
[Phase 3](2026-11-13-admin-analysis-phase-03-user-table.md),
[Phase 4](2026-11-13-admin-analysis-phase-04-user-search.md),
[Phase 6](2026-11-14-admin-analysis-phase-06-user-form.md).
Không thấy báo cáo Phase 5 cùng chuỗi; tài liệu refinement ngày 07/11 thuộc lịch sử khác.
Đọc guide accessibility của Next đang cài, hook, ba editor, tables/callback success,
API client, CSS modal/shell/tokens và harness Playwright hiện có.

Cả ba editor dùng native `<dialog>`/`showModal()` qua `useAdminDialog`,
không portal/thư viện modal. Native modality giữ background inert;
hook có boundary Tab/Shift+Tab và chuyển Escape cho editor quyết định.
Review/discard là các phase trong cùng dialog, không mở dialog xác nhận lồng nhau.

| Modal thực tế / trigger | Initial focus / trạng thái đã đối chiếu |
|---|---|
| Tạo tài khoản / Thêm mới | Email; validation focus lỗi đầu; review focus Quay lại; discard focus Tiếp tục chỉnh sửa |
| Sửa tài khoản / Chỉnh sửa từng dòng | Email; giữ self role/status disabled, review role/lock/unlock/email và draft |
| Tạo Workspace / Thêm mới | Tên workspace; Manager tải riêng; review/discard cùng native dialog |
| Sửa Workspace / Chỉnh sửa từng dòng | Tên workspace; giữ Manager selection, before/after và busy guard |
| Workspace archived / Chi tiết | Nút Đóng; read-only, không tải Manager hoặc mutation |
| Tạo/sửa tài liệu / Thêm mới hoặc Chỉnh sửa từng dòng | Mã tài liệu; review/discard/error chuyển focus trong dialog, giữ decimal và fields |

Nguồn inventory: `AdminUserEditor.tsx:48,70–89,123`,
`AdminWorkspaceEditor.tsx:16,45–49,65–66,93`,
`AdminReferenceEditor.tsx:24,33–41,83` trong `frontend/src/components/admin/`.
NotificationBell là popup không modal dùng chung, ngoài phạm vi sửa lần này.

## Hai lỗi có bằng chứng và cách sửa

| Mức độ / vị trí | Trước sửa / nguyên nhân | Sau sửa |
|---|---|---|
| P2 — [useAdminDialog.ts](../../../frontend/src/components/admin/useAdminDialog.ts):8–28 | Native inert chặn tương tác nhưng hook không khóa cuộn. Wheel trên backdrop ở 375px khiến window.scrollY từ 0 thành 400 trên cả users/workspaces/tech-references. Regression baseline exit 1. | Khóa overflow của root khi Admin modal đầu tiên mở; giữ scrollbar gutter hoặc bù padding nếu trình duyệt không hỗ trợ. Đóng/unmount cuối khôi phục inline styles, priorities và vị trí cuộn. |
| P2 — [useAdminDialog.ts](../../../frontend/src/components/admin/useAdminDialog.ts):33–43 | Cleanup cũ chỉ focus opener nếu còn connected. Lưu reference làm bản ghi rời bộ lọc hiện tại, opener bị unmount, activeElement rơi về BODY. Assertion baseline expected admin-content nhưng nhận chuỗi rỗng, exit 1. | Nếu opener còn connected, hiển thị và không disabled thì trả focus; nếu không, dùng vùng #admin-content có tabIndex=-1 và tên từ tiêu đề. focus preventScroll không kéo trang khỏi vị trí đã phục hồi. |

Lock dùng bộ đếm cho các instance cùng hook; không mở khóa khi còn instance khác.
Inline overflow/padding-right/scrollbar-gutter và !important cũ được lưu/khôi phục.
Không thêm event listener toàn cục. Fallback được lấy trong Admin frame lúc mở,
kiểm connected trước khi focus nên không focus node đã tháo khi rời Admin.

## File thay đổi và phần giữ nguyên

| File | Lý do |
|---|---|
| [useAdminDialog.ts](../../../frontend/src/components/admin/useAdminDialog.ts) | Hai sửa lỗi lifecycle dùng chung, 36 dòng thêm/thay đổi; không thay keyboard/dirty/busy rules của editor |
| [admin-redesign.mjs](../../../frontend/tests/admin-redesign.mjs) | Mở rộng harness cũ: mouse/Enter, focus, wheel backdrop, restore window/table scroll, content width, prior lock, unmount; thêm viewport/modal semantics checks |
| [admin-consistency.mjs](../../../frontend/tests/admin-consistency.mjs):126 | Regression focus fallback sau reference save rời filter; giữ assertion payload/refetch và API failure cũ |
| Tài liệu này | Chuyển active plan sang completed kèm inventory, bằng chứng và validation |

Giữ nguyên native modal, backdrop không light-dismiss, ARIA/title/description/nút đóng,
focus boundary hiện hữu, CSS/tokens/kích thước/spacing/typography Phase 2,
validation/quyền/draft/review/saveLock/feedback Phase 6, query/pagination và API contracts.
Không sửa TSX editor, backend/database, role khác, Analysis/CARLA/AEB, không thêm dependency.
Hash 132 file frontend/src đã chụp trước sửa: chỉ useAdminDialog.ts thay đổi.

## Regression 15 nhóm yêu cầu

| # | Case | Kết quả thực chạy |
|---|---|---|
| 1 | Mở bằng chuột | Cả ba editor native dialog mở, aria-modal=true; initial focus ở bên trong |
| 2 | Mở bằng bàn phím | Enter trên Thêm mới mở cả ba editor, không mutation |
| 3 | Initial/validation focus | Field đầu, lỗi đầu, review/discard/error focus theo editor; titles/descriptions tồn tại |
| 4 | Tab/Shift+Tab | Boundary wrap trong dialog, cả sau chuyển review/discard; query focusable tính lại khi nhấn Tab, bỏ disabled/hidden |
| 5 | Escape pristine | Đóng không cảnh báo/không write, trả focus opener |
| 6 | Escape dirty | Vào xác nhận bỏ, Escape tại discard trở về form còn draft |
| 7 | Cancel dirty | Không bỏ ngay dữ liệu; chọn tiếp tục giữ values |
| 8 | Xác nhận hủy/mở lại | Bỏ thay đổi đóng, trả focus; mở lại không giữ draft đã hủy |
| 9 | Restore focus | Opener hiện hữu nhận focus; reference rời filter nhận admin-content; success feedback của users/workspaces giữ behavior cũ |
| 10 | Nội dung dài | Cuộn form và dùng Tab tới field/actions, review/discard ở cả ba editor |
| 11 | Responsive | Modal ở 375/390/768/1024/1440px không vượt viewport/overflow ngang; low-height 320x256, 667x375, 1280x480 vẫn tới được field/actions |
| 12 | Background scroll | Wheel backdrop không đổi window.scrollY; đóng giữ table.scrollLeft=80; failed save + discard giữ scrollY đang ở bảng; h1 x/width không nhảy lúc mở |
| 13 | Busy/double-submit | Suite forms/workspaces/references giữ ref lock, không đóng bằng Escape khi đang lưu, không gửi double write |
| 14 | API failure | Các error fixture giữ modal/draft, alert/retry; chỉ success mới đóng/refetch |
| 15 | Cleanup | Unmount cưỡng bức qua client navigation dọn dialog/root styles; pre-existing lock/padding/gutter và priorities được giữ nguyên |

Unmount navigation được kích hoạt bằng script vì background link vốn inert khi dialog mở;
đây là kiểm lifecycle, không mô tả một thao tác người dùng bình thường.
Không có nested editor đồng thời trong product flow; đã kiểm prior outer lock,
chưa chạy UI test hai instance cùng hook mở đồng thời hoặc overlay bên thứ ba đổi lock sau đó.
Không kết luận đã kiểm mọi hệ thống overlay từ bộ đếm hoặc prior-lock fixture.

## Browser QA và trước/sau

Production app `http://127.0.0.1:3119`, Edge headless qua Playwright hiện có,
đăng nhập bằng form với HTTP fixtures, không dùng tài khoản thật/ghi DB thật.

Đã xem ảnh trước/sau wheel backdrop 375px: modal giữ nguyên, nền trước sửa dịch 400px.
Sau sửa backgroundIssues là []; baseline có ba entries 0→400.
Đã xem ảnh modal desktop/tablet/mobile, danh sách 1440/1024 và low-height field/submit.
21 ảnh danh sách (3 trang × 7 widths: 1920/1440/1366/1024/768/390/375)
giống hệt byte với baseline Phase 7. Không dùng ảnh nền khác vị trí để suy ra redesign.
Ở low-height, header/footer có thể nằm ngoài vùng đang nhìn nhưng tới được bằng cuộn/Tab;
không tuyên bố chúng luôn sticky trong viewport.

Artifacts local gitignore, không commit:
`data/admin-phase7-2026-11-14/`:

- `before-layout/modal-scroll-observations.json` và ảnh baseline ba modal.
- `before-references/` lưu ảnh baseline reference; result.json cũ trong thư mục này
  là lượt harness trước khi thêm assertion, không dùng nó làm chứng cứ RED/PASS cuối.
- `layout/`: 102 ảnh và backgroundIssues=[].
- `references/`, `forms/`, `users-table/`, `workspaces/`, `search/`, `entry/`:
  kết quả sau sửa; tổng bảy suite 200 ảnh.
- `source-hashes.json` và `verification-summary.json`: đối chiếu nguồn/ảnh và kết quả.

## Validation thực thi

Frontend chạy từ `frontend`; `npm.cmd`/`npx.cmd` vì PowerShell policy chặn npm.ps1.
Các suite dùng `ADMIN_UI_URL=http://127.0.0.1:3119`,
`ADMIN_UI_OUTPUT=data/admin-phase7-2026-11-14/<suite>`.

| Lệnh | Kết quả |
|---|---|
| `npm.cmd run lint` | PASS exit 0; sau bổ sung responsive assertions, eslint hai file test cũng PASS exit 0 |
| `npx.cmd tsc --noEmit` | PASS exit 0 |
| `npm.cmd run build` | PASS exit 0, Next 16.4.1 production |
| `node tests/admin-redesign.mjs` | PASS exit 0, 102 ảnh |
| `node tests/admin-consistency.mjs` | PASS, 15 ảnh |
| `node tests/admin-user-forms.mjs` | PASS, 22 ảnh |
| `node tests/admin-users-table.mjs` | PASS, 21 ảnh |
| `node tests/admin-workspaces.mjs` | PASS, 23 ảnh |
| `node tests/admin-user-search.mjs` | PASS, 7 ảnh |
| `node tests/admin-dashboard.mjs` | PASS, 10 ảnh; chỉ kiểm entry/redirect hiện có, không khôi phục Dashboard |
| Root: `.\mvnw.cmd -B -Dtest=RepoDocsTest test` | PASS exit 0, 5 tests, không failure/error/skip |
| `git diff --check`, conflict markers/unmerged paths | PASS; diff --check exit 0, không unmerged path/marker trong phần kiểm |

PASS trên trình duyệt thật với HTTP fixture không đồng nghĩa tích hợp backend/auth/DB thật.
Không chạy lại business tests backend vì không thay backend/API/validation.

## Giới hạn và rủi ro

Chưa đối chiếu Figma Admin vì không có thiết kế truy cập được trong phiên.
Chưa kiểm screen reader thật, Safari/Firefox, touch/bàn phím ảo trên máy thật,
browser zoom/text scaling native. Low CSS viewport không thay thế các kiểm tra đó.
Không tuyên bố WCAG toàn diện hoặc API/auth/DB deployment thật đã được kiểm.

Bộ đếm chỉ phối hợp các instance useAdminDialog trong cùng client module;
prior-lock restoration không phải cơ chế khóa toàn cục cho overlay bên thứ ba.
Nhánh CSS scrollbar-gutter/fallback padding cần xác minh thêm trên engine khác Chromium.
ADM-03 chỉ sửa phần focus sau opener mất; thông báo success tài liệu hiện hành giữ nguyên.
Các nợ audit khác như notification popup/filtered chips ngoài phạm vi Phase 7.

Commit đề xuất: `fix(admin): improve modal accessibility and scroll behavior`.
Dừng tại Phase 7 để người dùng review, commit và push thủ công.
