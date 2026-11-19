# Admin & Analysis — Phase 02/20: Standardize Admin Layout

Ngày thực hiện: 13/11/2026. Trạng thái: hoàn thành phạm vi Phase 2; chờ người dùng review.
Nhánh lúc bắt đầu: `chuvv`; HEAD `ef3f046`. Working tree ban đầu sạch.
Không stage, commit, push; không triển khai Phase 3.

## Nguồn đối chiếu và phạm vi

Đã đọc AGENTS.md, DESIGN.md, CLAUDE.md, frontend/AGENTS.md, frontend/CLAUDE.md,
hướng dẫn đổi package/quy tắc đặt tên, tài liệu kiến trúc và
[audit Phase 1](2026-11-13-admin-analysis-phase-01-admin-ui-audit.md).
Đọc hướng dẫn CSS Modules của Next đang cài trong `frontend/node_modules/next/dist/docs/`
trước khi sửa. Đối chiếu AdminShell, AdminTokens, AdminTable, AdminEditor, ba route Admin,
layout cha VehicSimShell và globals.css với code thực tế.

Chỉ sửa lỗi responsive layout ADM-01. Không khôi phục Overview/Dashboard Admin.
Giữ nguyên ba mục Tài khoản, Workspace, Tài liệu kỹ thuật và luồng nghiệp vụ hiện hành.
Không đổi backend, schema, AEB/CARLA, API, routing, thành phần TSX hoặc token dùng chung.

## Lỗi xác nhận trước khi sửa

| Vấn đề | Vị trí code | Bằng chứng và quyết định |
|---|---|---|
| ADM-01, P1: dialog cắt nội dung khi chiều cao viewport thấp | [AdminEditor.module.css](../../../frontend/src/components/admin/AdminEditor.module.css):1,3,4,10,44,56–65 | `overflow:hidden` ngoài cùng, shell có max-height, header/footer không shrink. Ở 320×256, body của cả ba editor chỉ còn 32px; field cao 44px bị clip; footer ban đầu ra ngoài dialog. Sửa trong Phase 2. |
| ADM-06, P2: hợp đồng metric Admin khác DESIGN | [AdminTokens.module.css](../../../frontend/src/components/admin/AdminTokens.module.css):33–48; [AdminShell.module.css](../../../frontend/src/components/admin/AdminShell.module.css):35,45,57–71 | Đây là quyết định thiết kế còn mở trong audit. Các kích thước hiện tại đã có regression; không đổi khi chưa có bằng chứng lỗi layout. |

Baseline 320×256: dialog x=10, y=10, width=300, height=236, bottom=246.
Nút footer ban đầu chạm bottom 278.77px (Tài khoản), 330.86px (Workspace),
308.77px (Tài liệu kỹ thuật). Focus tự cuộn của trình duyệt có thể làm tâm field xuất hiện,
nhưng không làm toàn bộ field vừa trong body 32px.

Regression được chạy trên production build trước sửa và thất bại đúng tại
`users-short-320x256-field`: field top=147.15625, bottom=191.15625,
`clippedBy=["DIV.I_mUTW_body"]`, exit 1. Kiểm tra bao gồm clipping bởi tổ tiên;
chỉ kiểm bounding box của dialog hoặc `isVisible()` sẽ bỏ sót lỗi này.

## Sửa tối thiểu và phần giữ nguyên

| File | Thay đổi | Lý do |
|---|---|---|
| [AdminEditor.module.css](../../../frontend/src/components/admin/AdminEditor.module.css):67 | Thêm media query `max-height:480px`: dialog cuộn dọc và chặn cuộn lan; bỏ max-height shell; body trở về luồng nội dung không có vùng cuộn riêng. | Header/form/footer cùng cuộn khi chiều cao nhỏ, field và action tiếp cận được; không ép giảm cỡ chữ hoặc control. |
| [admin-redesign.mjs](../../../frontend/tests/admin-redesign.mjs):13,66,145,211 | Bổ sung ba viewport thấp cho cả ba editor, cuộn chuột, Tab/Shift+Tab, kiểm clipping đầy đủ và focus outline, review/discard/Escape/return-focus; kiểm form sau lỗi PUT ở 320×256. | Ngăn tái phát lỗi thực tế; giữ các kiểm tra menu, navigation, phân quyền, trạng thái và payload trước đó. |
| Tài liệu này | Ghi phạm vi, bằng chứng và kết quả thực thi; chuyển kế hoạch active sang completed. | Bàn giao đúng một phase. |

Giữ nguyên sidebar 248px, content max-width 1480px, topbar min-height 80px,
padding/spacing theo token Admin, modal title 20px, field 14px, control 40/44px,
palette và font hiện hành. Không sửa AdminShell, AdminTokens, AdminTable, globals.css
hoặc các trang Admin đã đáp ứng layout. Hover/active/outline và menu mobile giữ nguyên.

Ở chiều cao ≤480px, header/footer dialog cùng cuộn với form, không ghim tại cạnh trên/dưới.
Ở chiều cao >480px giữ cơ chế body cuộn với header/footer hiện tại.
Đây là thay đổi cần thiết để giữ nguyên kích thước đã kiểm mà vẫn tiếp cận toàn bộ nội dung.

## So sánh trước/sau trên browser

Dùng Edge headless qua Playwright, app production `127.0.0.1:3115`.
Đăng nhập qua form thật với HTTP response fixture; không dùng tài khoản hoặc dữ liệu thật.
Build trước sửa khớp source sản phẩm của HEAD (Phase 1 chỉ thêm tài liệu).

| Kiểm tra | Trước | Sau |
|---|---|---|
| Dialog cả ba trang ở 320×256 | Body chỉ 32px; field bị tổ tiên cắt, footer bị cắt ở trạng thái ban đầu | Body theo chiều dài nội dung; dialog cuộn; field, nút tạo/xác nhận/bỏ thay đổi hiển thị đầy đủ khi tiếp cận |
| 320×256, 667×375, 1280×480 | Regression mới thất bại tại 320×256 trên code cũ | Cả ba editor: cuộn chuột, Tab/Shift+Tab vòng trong dialog, review, Escape giữ draft, discard và trả focus về nút mở đều qua |
| Form sau lỗi lưu 409 ở 320×256 | Chưa có regression layout riêng | Draft giữ nguyên; field và nút lưu tiếp cận được; không báo thành công giả |
| 31 cặp ảnh desktop/tablet/mobile/trạng thái | Baseline trước sửa | 28 cặp SHA-256 giống hệt; chỉ 3 ảnh dialog 320×256 khác |
| 9 snapshot geometry dialog ở chiều cao thường | Desktop 1366×768, mobile 390×844 và 320×568 | Geometry giống hệt cho cả ba editor |
| Overflow ngang cấp trang | Không phát hiện trong baseline | Không phát hiện trong probe và các viewport regression; bảng vẫn cuộn trong vùng riêng |
| Sidebar/header/menu | Ba mục, active nav, breadcrumb, focus và menu mobile đã có | Giữ nguyên; desktop 1920/1366, tablet 768, mobile 390 được regression kiểm tra |

Đã xem trực tiếp ảnh desktop Tài khoản, tablet Workspace, mobile Tài liệu kỹ thuật,
ảnh dialog thấp trước/sau, field Workspace và action xác nhận Tài liệu kỹ thuật.
Không tuyên bố đối chiếu Figma vì không có thiết kế Admin truy cập được.

Bằng chứng local, nằm trong `data/` đã gitignore, không đưa artifact vào commit:

- `data/admin-phase2-2026-11-13/before/` và `after/`: mỗi bên 31 ảnh, probe script, geometry/axe JSON.
- `data/admin-phase2-2026-11-13/red-full-control/users-short-320x256-field.png`: lỗi tái hiện trước sửa.
- `data/admin-phase2-2026-11-13/layout/`: 69 ảnh và `result.json`, gồm field/submit/review/discard ở ba viewport thấp.
- `data/admin-phase2-2026-11-13/comparison.json`: SHA-256 ảnh và so sánh geometry/overflow/axe.
- `data/admin-phase2-2026-11-13/source-comparison.json`: hash source chứng minh chỉ một file sản phẩm AdminEditor.module.css đổi.
- Các thư mục `user-forms/`, `workspaces/`, `references/`, `users-table/`, `entry/`: kết quả của các suite còn lại.

## Kiểm chứng thực thi

Chạy từ `frontend`, dùng `npm.cmd`/`npx.cmd` vì PowerShell chặn npm.ps1:

| Lệnh/kiểm tra | Kết quả |
|---|---|
| `npm.cmd run lint` | PASS, exit 0 |
| `npx.cmd tsc --noEmit` | PASS, exit 0 |
| `npm.cmd run build` | PASS, exit 0; production build Next 16.4.1 |
| `node tests/admin-redesign.mjs` | PASS, 69 ảnh; regression layout mới và các kiểm tra hiện có |
| `node tests/admin-user-forms.mjs` | PASS, 16 ảnh |
| `node tests/admin-workspaces.mjs` | PASS, 23 ảnh |
| `node tests/admin-consistency.mjs` | PASS, 15 ảnh |
| `node tests/admin-users-table.mjs` | PASS, 11 ảnh |
| `node tests/admin-dashboard.mjs` | PASS, 10 ảnh; suite kiểm redirect/entry hiện hành, không khôi phục Dashboard |
| Probe trước/sau | Exit 0, mỗi bên 31 snapshot; đây là quan sát, không phải chứng nhận accessibility |
| Từ gốc repo: `.\mvnw.cmd -B -Dtest=RepoDocsTest test` | PASS, 5 tests; chỉ kiểm tài liệu |
| `git diff --check` | PASS, exit 0 |

Mỗi suite browser dùng `ADMIN_UI_URL=http://127.0.0.1:3115`,
`ADMIN_UI_OUTPUT=data/admin-phase2-2026-11-13/<suite>`. Tổng sáu suite: 144 ảnh.
Không có API thật hoặc DB bị ghi; các mutation test được intercept trong browser.

## Rủi ro và giới hạn còn lại

Axe 4.14.0 chạy 11 snapshot trước và sau: sáu snapshot list/dialog không lọc không có
violation; năm snapshot có chip lọc vẫn gặp `label-content-name-mismatch` như Phase 1.
Không phát hiện rule violation mới trong các snapshot này; không gọi toàn bộ accessibility PASS.
ADM-02 (chip), ADM-03 (focus sau lưu tài liệu), ADM-04 (NotificationBell Escape),
ADM-05 (guard archived Manager) và quyết định thiết kế ADM-06 giữ nguyên ngoài sửa layout này.

Chỉ kiểm browser Edge trên máy hiện tại, CSS viewport thấp và bàn phím/cuộn chuột;
chưa kiểm thiết bị cảm ứng thật, Safari/Firefox, bàn phím ảo, screen reader hoặc zoom browser 400%.
Chưa kiểm live auth/backend/DB, Figma Admin. Không có thay đổi nghiệp vụ cần migration.
Artifacts `data/` chỉ có local; người review chạy suite để tái tạo bằng chứng.

Đề xuất commit thủ công: `fix(admin): keep dialogs usable in short viewports`.
Dừng tại Phase 2, không tự commit/push hoặc chuyển phase.
