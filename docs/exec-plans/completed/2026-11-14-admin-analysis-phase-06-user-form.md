# Admin & Analysis — Phase 06/20: Admin User Form & Validation Standardization

Ngày thực hiện: 14/11/2026. Hoàn thành phạm vi Phase 6, chờ review.
Nhánh bắt đầu `chuvv`, HEAD `86c270a`; working tree ban đầu sạch.
Phase 4 đã commit. Không thấy báo cáo Phase 5 cùng chuỗi Admin & Analysis trong repository;
các tài liệu refinement Phase 05 ngày 07/11 là lịch sử khác, không coi là Phase 5/20 đã thực hiện.
Chỉ làm Phase 6 theo yêu cầu mới; không stage/commit/push hoặc triển khai Phase 5/7.

## Nguồn đối chiếu và flow hiện tại

Đã đọc AGENTS.md, DESIGN.md, CLAUDE.md, frontend guides, kiến trúc frontend,
các báo cáo [Phase 1](2026-11-13-admin-analysis-phase-01-admin-ui-audit.md),
[Phase 2](2026-11-13-admin-analysis-phase-02-layout.md),
[Phase 3](2026-11-13-admin-analysis-phase-03-user-table.md),
[Phase 4](2026-11-13-admin-analysis-phase-04-user-search.md),
[ADR-049](../../adr/ADR-049-reviewer-chay-regression-de-kiem-tra.md).
Đọc guide forms/validation/pending của Next đang cài trong node_modules.
Đối chiếu AdminUsersTable, AdminUserEditor, useAdminDialog, AdminEditor CSS,
adminApi/types/apiRequest và các test form/table/search/layout/security.

Flow: mở detail hoặc create → form local values → validate khi submit → review pending payload →
xác nhận → saveLock/busy → API → success đóng/refetch hoặc error giữ values/trả về form.
Dirty dùng payload đã chuẩn hóa; Escape ở review/discard quay về form, Escape ở dirty form
hỏi bỏ thay đổi. Native modal giữ focus boundaries, trả focus về opener khi đóng.
Click backdrop không được thiết kế để đóng form, không bổ sung light-dismiss.

Backend đọc để xác minh, không sửa:
`src/main/java/com/vsos/backend/dto/auth/AdminRequests.java`,
`service/system/AdminService.java`, `controller/system/AdminController.java`,
các test AdminServiceTest/AdminSecurityTest trong src/test/java/com/vsos/backend.

## Hợp đồng validation và quyền được giữ nguyên

| Nhóm | Code/contract hiện tại |
|---|---|
| Email | Bắt buộc, định dạng email, tối đa 255; payload trim/lowercase; uniqueness do server quyết định |
| Họ / Tên | Bắt buộc sau trim, tối đa 80 |
| Tên đệm | Không bắt buộc, tối đa 80, chuỗi trim rỗng gửi null |
| Mật khẩu tạo mới | Tối thiểu 8 theo length hiện hành; tối đa 72 byte UTF-8 và giới hạn DTO 72; không hiện lại trong review |
| Mật khẩu cập nhật | Không có field/payload password; đổi qua luồng tài khoản/quên mật khẩu hiện có |
| Vai trò | Giữ 5 giá trị ADMIN/MANAGER/ENGINEER/REVIEWER/EXPERIENCER, help và quyền Reviewer theo ADR-049 |
| Trạng thái | Giữ create mặc định active và checkbox disabled hiện hành; edit có review hệ quả lock/unlock |
| Tự quản trị | Không tự đổi role/khóa chính mình; thay email khiến phiên cũ hết hiệu lực theo cơ chế hiện có |
| Phụ thuộc | Giữ guard workspace kể cả archived, membership/project/task; server kiểm, form giữ nguyên lý do lỗi |
| Thời điểm lỗi | Không báo hàng loạt khi mới mở; submit sinh inline errors và focus lỗi đầu; sửa field cập nhật aria-invalid/errors |
| Submit | Pristine edit không lưu; dirty có xác nhận; ref lock chặn double submit; busy chặn đóng/quay lại; lỗi không reset draft |

Không tìm thấy bằng chứng cần đổi các quy tắc này trong phạm vi audit/test.
Không đặt thêm regex email, độ dài, quyền hoặc autosave.

## Lỗi thực tế được chọn và bằng chứng RED

P2, tại [AdminUserEditor.tsx](../../../frontend/src/components/admin/AdminUserEditor.tsx):119
(dòng 110 trước sửa): catch hiển thị trực tiếp Error.message, không phân loại lỗi lưu.

Regression mở rộng chạy trên production baseline trước sửa, exit 1, ghi nhận:

| Fixture failure | Thông báo trước sửa |
|---|---|
| Network bị ngắt | Failed to fetch |
| JSON lỗi HTTP 500 | java.sql.SQLException: sensitive-fixture-only diagnostic |
| HTML lỗi proxy HTTP 502 | Toàn bộ HTML chẩn đoán |
| HTTP 200 nhưng JSON không đọc được | Unexpected token… is not valid JSON, có một phần nội dung response |

Các chuỗi kỹ thuật trên là dữ liệu fixture có chủ đích, không phải bằng chứng backend thật
đang lộ SQL/secret. Chúng xác nhận form render nguyên thông báo nếu upstream trả như vậy.
Lỗi 403/429/400 dependency/409 conflict được kiểm riêng và vẫn có lý do nghiệp vụ rõ.

## Thay đổi tối thiểu và trước/sau

| File | Thay đổi và lý do |
|---|---|
| [AdminUserEditor.tsx](../../../frontend/src/components/admin/AdminUserEditor.tsx):6,39–46,119 | Dùng ApiError hiện có để phân biệt HTTP với lỗi fetch/decode. Giữ message nghiệp vụ 4xx; 5xx dùng thông báo server tiếng Việt; TypeError fetch dùng hướng dẫn kiểm mạng; lỗi decode/không xác nhận được hướng dẫn tải lại danh sách kiểm tra trước khi thử lại. Không render raw diagnostic từ các trường hợp mới kiểm. |
| [admin-user-forms.mjs](../../../frontend/tests/admin-user-forms.mjs):51–53,87,122–142,197–218 | Mở rộng suite hiện có: pristine Cancel/X/Escape/backdrop, invalid email/whitespace/length caps/focus, refetch giữ dirty draft, phân loại 6 failure modes và kiểm retry controls/draft/alert/no success. Không tạo suite trùng lặp. |
| Tài liệu này | Chuyển active plan sang completed, ghi audit/contract và kết quả. |

Sau lỗi mạng/5xx: form vẫn mở, values giữ nguyên, pending được bỏ, saveLock được giải phóng,
alert có focus, không báo success; thông báo tiếng Việt nêu cách phục hồi.
Nếu không đọc được kết quả lưu, UI yêu cầu kiểm tra danh sách trước khi thử lại vì
không thể kết luận server chưa ghi từ việc giải mã response thất bại.

Giữ nguyên callback success/refetch, payload, validation, permissions, modal layout,
CSS/tokens/typography/spacing, sidebar và search/pagination Phase 4.
Không sửa ApiError/apiRequest toàn cục, backend, database, CARLA/AEB hoặc Analysis.

## Regression 15 nhóm yêu cầu

| # | Case | Bằng chứng thực chạy |
|---|---|---|
| 1 | Create hợp lệ | POST đúng normalized payload, password boundary 72 byte, success/refetch/feedback |
| 2 | Edit hợp lệ | PUT đầy đủ, không password; review có target/before-after |
| 3 | Rỗng/whitespace | Inline errors, không API write, dữ liệu không bị xóa, lỗi đầu nhận focus |
| 4 | Email sai | aria-invalid=true, aria-describedby trỏ đúng lỗi; sửa email hợp lệ xóa invalid |
| 5 | Giới hạn backend | Email maxlength 255; tên 80; nhập 81 bị cap 80, review chấp nhận đúng 80; 74 byte mật khẩu bị từ chối, 72 byte được nhận |
| 6 | Double-click Save | Ref lock chỉ cho một mutation dù click hai lần trước busy render |
| 7 | API error | Network, 500 JSON, 502 HTML, malformed JSON: thông báo đúng nhóm, không raw diagnostic |
| 8 | Permission/conflict/dependency | 403/429/409/400 giữ reason nghiệp vụ, không hiển thị success |
| 9 | Draft sau thất bại | Email/role/status và password create giữ nguyên; alert có focus, nút lưu hoạt động lại |
| 10 | Dirty cancel | Escape/Cancel → xác nhận bỏ/tiếp tục; tiếp tục giữ dữ liệu, bỏ trả focus |
| 11 | Pristine | Cancel/X/Escape đóng không cảnh báo/không write; mở chưa có lỗi |
| 12 | Refresh sau success | Chỉ server success đóng/refetch; feedback có email/focus; refetch nền khi dirty không đè role/status/focus |
| 13 | Keyboard/focus | Tab/Shift+Tab trong dialog, first invalid field, review/discard/error focus, opener khi đóng |
| 14 | Role/dependency | Cả 5 role/help, Reviewer mới, lock/unlock, workspace dependency và hạn chế current session |
| 15 | Field bị hạn chế | Self role/status disabled, create active disabled, edit không có password; 4 role ngoài Admin không mở form |

Các cases đã có được giữ nguyên, chỉ thêm coverage ở những khoảng trống.
Một lượt QA đầu có assertion autofocus chạy sau click backdrop do thứ tự setup test;
đã chuyển kiểm backdrop vào case riêng, giữ assertion autofocus ban đầu và không sửa production
để kéo focus sau click ngoài. Suite cuối qua đầy đủ.

## Browser QA và so sánh

App production `127.0.0.1:3118`; Edge headless/Playwright; login form với HTTP fixtures.
Đã xem trực tiếp ảnh trước/sau lỗi 500 và lỗi mạng trên mobile 390px,
ảnh edit desktop và các ảnh baseline create/review.
Không có tài khoản thật hoặc API/DB thật bị ghi.

Bốn ảnh create 1920/1366/768/390 và ảnh review 390 có SHA-256 giống hệt Phase 4.
Ảnh full edit desktop khác vị trí nền phía sau modal; xem trực tiếp không thấy thay đổi
layout/nội dung modal. Không coi khác hash ảnh nền là bằng chứng đã redesign.
Layout suite vẫn qua cả các viewport thấp của Phase 2 và kiểm không overflow ngang.

Artifacts local, gitignore, không đưa vào commit:

- `data/admin-phase6-2026-11-14/before/`: ảnh RED và save-error-observations.json với 4 failure messages.
- `data/admin-phase6-2026-11-14/forms/`: 22 ảnh, result.json, observations sau sửa không còn sai khác kỳ vọng.
- `data/admin-phase6-2026-11-14/comparison.json`: hash source và ảnh đối chiếu.
- `users-table/`, `search/`, `layout/`, `workspaces/`, `references/`, `entry/` trong cùng thư mục: 6 suite còn lại.

Hash frontend/src xác nhận chỉ AdminUserEditor.tsx đổi; CSS/shared shell/search không đổi.

## Validation thực thi

Các lệnh frontend chạy từ frontend với npm.cmd/npx.cmd:

| Kiểm tra | Kết quả |
|---|---|
| `npm.cmd run lint` | PASS, exit 0; kiểm thêm eslint file test sau bổ sung refetch cũng exit 0 |
| `npx.cmd tsc --noEmit` | PASS, exit 0 |
| `npm.cmd run build` | PASS, exit 0, Next 16.4.1 production |
| `node tests/admin-user-forms.mjs` | PASS, 22 ảnh |
| `node tests/admin-users-table.mjs` | PASS, 21 ảnh |
| `node tests/admin-user-search.mjs` | PASS, 7 ảnh |
| `node tests/admin-redesign.mjs` | PASS, 69 ảnh |
| `node tests/admin-workspaces.mjs` | PASS, 23 ảnh |
| `node tests/admin-consistency.mjs` | PASS, 15 ảnh |
| `node tests/admin-dashboard.mjs` | PASS, 10 ảnh, entry/redirect hiện có |
| Root: `.\mvnw.cmd -B '-Dtest=AdminServiceTest,AdminSecurityTest' test` | PASS 16 (13 service + 3 security), không fail/error/skip |
| `git diff --check` | PASS, exit 0 |
| Root: `.\mvnw.cmd -B -Dtest=RepoDocsTest test` | PASS 5, không fail/error/skip |

Browser suites dùng `ADMIN_UI_URL=http://127.0.0.1:3118` và
`ADMIN_UI_OUTPUT=data/admin-phase6-2026-11-14/<suite>`. Tổng 167 ảnh/bảy suite.
Java service tests dùng mock repository, security dùng MockMvc/mock service;
không coi là tích hợp backend/DB thật.

## Giới hạn và việc ngoài scope

Chưa kiểm live deployment/auth/DB/SMTP, Safari/Firefox, thiết bị touch/bàn phím ảo,
screen reader thật hoặc đối chiếu Figma Admin. Không tuyên bố toàn bộ accessibility đạt chuẩn.
Thông báo business 4xx tiếp tục theo contract backend, không thay bộ xử lý lỗi API toàn cục.
Kết quả ghi chưa xác nhận do response lỗi decode cần kiểm tra danh sách, không tự retry/autosave.

ADM-05 về workspace archived vẫn là vấn đề quy trình/guard đã ghi ở Phase 1;
không tự mở chuyển archived hoặc đổi authorization. Các nợ khác của audit vẫn ngoài Phase 6.
Không có lý do thay validation/quyền/backend để làm test xanh.

Commit đề xuất: `fix(admin): standardize user form save error feedback`.
Dừng tại Phase 6 để người dùng review và commit/push thủ công.
