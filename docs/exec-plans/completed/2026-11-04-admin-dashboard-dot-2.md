# Admin đợt 2 — Dashboard / điểm vào quản trị

Trạng thái: hoàn tất đợt 2. Nhánh chuvv; Git đầu đợt sạch.
Nguồn: yêu cầu tiếp tục đợt 2; giữ phạm vi dashboard, không làm bảng/form đợt 3–4.

## Audit bổ sung trước khi sửa

Đã đọc lại hướng dẫn repo/frontend, [audit đợt 1](../../vehicsim/audit-redesign-admin-2026-11-04.md),
[bàn giao đợt 1](../completed/2026-11-04-admin-layout-navigation-dot-1.md), yêu cầu gốc đợt 2,
AdminShell/CSS, /admin redirect/layout, ba route resource, adminApi, AuthGate/AuthContext,
sidebar chung, AdminManagement và test browser hiện có; tài liệu Next cài sẵn layouts/pages và CSS Modules.
Đã truy lại AdminController.list → AdminService.list → AdminRepository.list.

Không có endpoint dashboard chuyên biệt. Tuy nhiên API danh sách đã có `total` từ COUNT toàn bộ
kết quả trước LIMIT/OFFSET (không phải số dòng của trang). `page_size=1` hợp lệ (1–100).
Đợt 1 chưa khai thác hợp đồng này; đợt 2 dùng lại ba GET sẵn có để hiển thị tổng số bản ghi:

| Thẻ | API và query | Ý nghĩa |
|---|---|---|
|Tài khoản|GET /api/v1/vehicsim/admin/users?page=1&page_size=1&sort=newest|Mọi role/trạng thái, không lọc|
|Workspace|GET /api/v1/vehicsim/admin/workspaces?page=1&page_size=1&sort=newest|Bao gồm ACTIVE và ARCHIVED|
|Tài liệu kỹ thuật|GET /api/v1/vehicsim/admin/tech-references?page=1&page_size=1&sort=newest|Bao gồm bật/tắt|

Mỗi response mang tối đa một bản ghi; UI chỉ dùng total, không render/lưu các field user hoặc metadata.
Không suy ra tài khoản hoạt động, trend, sự cố, lịch sử audit hay system health từ các số đếm này.
Không thêm backend/schema/DTO, không lấy toàn DB, không lấy context kỹ thuật để làm số liệu Admin.
Ba response độc lập, không phải snapshot DB trong một transaction; không tính tỷ lệ/tổng ghép.

## Phạm vi triển khai

- /admin thành trang tổng quan trong AuthGate/layout hiện có; giữ URL ba danh sách.
- Thẻ tổng số có nhãn/phạm vi, trạng thái tải, rỗng thật, lỗi từng nguồn, làm mới và shortcut.
- Sidebar Admin thêm Tổng quan; mục Quản trị trong sidebar chung thêm link /admin cho ADMIN.
- Giữ nguyên điểm đến đăng nhập /admin/users và toàn bộ auth/permissions/CRUD hiện có.
- CSS Modules riêng cho dashboard, không sửa Analysis hoặc giao diện bảng/form.

## Các bước

1. [x] Git, hướng dẫn và audit hợp đồng total/quyền/phạm vi.
2. [x] Triển khai dashboard, metadata và điều hướng.
3. [x] Lint, TypeScript, production build và kiểm thử phù hợp.
4. [x] Browser fixtures: dữ liệu thật theo hợp đồng, partial/error/zero/loading/retry/race,
   số lớn/malformed, role/session/navigation, keyboard và ảnh các viewport yêu cầu.
5. [x] Diff, bàn giao, chuyển completed, dừng trước đợt 3.

## Giới hạn

Không có Figma Admin hoặc Report 7 gốc. Browser dùng fixture HTTP riêng, không dữ liệu/tài khoản thật.
Không tuyên bố đã kiểm chứng E2E backend/DB; không git add/commit/push.

## Kết quả

- /admin hiện là Tổng quan quản trị thay cho redirect sang danh sách tài khoản; metadata riêng
  `Tổng quan quản trị | Quản trị VehicSim`. Ba danh sách, form, route/API cũ giữ nguyên.
- Ba thẻ hiển thị total của toàn hệ thống, định dạng vi-VN, ghi rõ bao gồm các trạng thái.
  Không hiển thị bản ghi trả kèm hoặc lấy items.length làm tổng. Không có trend/biểu đồ/health giả.
- Mỗi nguồn xử lý riêng: loading là dấu —, lỗi cũng là — kèm lý do; 0 chỉ xuất hiện khi API trả 0 hợp lệ.
  Response thiếu/null/string/âm/số lẻ/vượt safe integer được coi là lỗi, không fallback về 0.
  Thẻ còn lại vẫn hiện khi một nguồn lỗi/chậm; các lối vào danh sách luôn dùng được.
- Nút làm mới vô hiệu khi đang tải; không polling/cache số liệu. Cleanup effect bỏ response muộn sau unmount.
  Làm mới xóa số cũ khỏi màn hình, tránh gán số liệu cũ cho request lỗi.
- Có đường tắt ba danh sách và hướng dẫn hai bước chuẩn bị Manager → phân công workspace,
  chỉ mở UI đã có, không tự tạo/sửa hoặc thêm query/action mà backend chưa hỗ trợ.
- Sidebar Admin thêm Tổng quan; sidebar chung chỉ đổi mục dành ADMIN. Điểm đến sau đăng nhập
  vẫn /admin/users; auth/profile/password/role/quota/session không đổi.
- Sửa lỗi phát hiện qua browser: skip link native tạo hash khiến Back đổi URL mà không khôi phục
  nội dung dashboard trong Next. Skip link giữ href fallback, khi có JS chỉ focus section nội dung,
  không đẩy history. Test kiểm skip focus → mở danh sách → Back cho cả ba resource.
- CSS Modules riêng cho dashboard; không sửa style toàn cục, bảng/form hoặc Analysis.

## Kiểm chứng và bằng chứng

- `npm.cmd run lint`: PASS.
- `npx.cmd tsc --noEmit`: PASS; production build cuối cũng kiểm TypeScript PASS.
- `npm.cmd run build`: PASS, /admin và các route cũ đều build được.
- `.\mvnw.cmd -B '-Dtest=AdminSecurityTest,AdminServiceTest,RepoDocsTest' test`: PASS,
  21 tests, 0 failures/errors/skipped. Dùng tests hiện có, không sửa test backend/DB.
- `node tests/admin-dashboard.mjs`: PASS trên build cuối. 9 ảnh kiểm chứng tại
  `data/admin-batch2-ui/`, kết quả `result.json` (gitignored).
  Kiểm tổng khác items.length, đúng ba request page_size=1 không filter; dữ liệu bản ghi không render;
  metadata, active menu, shortcut/Back/reload, keyboard/Escape/skip focus, dữ liệu 0 thật,
  partial loading/error, toàn bộ 503, 403, mất mạng, retry, số sai định dạng/số lớn,
  response sau unmount, bốn role bị chặn trước fetch, 401/guest và không phát sinh API ghi.
- `node tests/admin-redesign.mjs`: PASS trên build cuối, toàn bộ hồi quy layout/bảng/form Admin đợt 1,
  19 ảnh tại data/admin-batch1-ui. Chỉ điều chỉnh kỳ vọng /admin thành dashboard và nav có bốn link;
  không bỏ kiểm auth/CRUD/error/keyboard/responsive cũ.
- `node tests/analysis-redesign.mjs`: PASS sau thay đổi mục Admin trong sidebar chung; full hồi quy Analysis.
  Các sửa tiếp theo chỉ thuộc metadata /admin, skip link Admin và harness dashboard, không ảnh hưởng Analysis.
- Viewport: 1920×1080, 1366×768, 768×1024, thêm 390×844; không tràn ngang cả với safe integer lớn nhất.
  Đã xem trực tiếp desktop/tablet/mobile, zero, partial error và số lớn. Ảnh chụp từ đầu trang để ghi đúng
  trạng thái sidebar sticky, tránh artifact full-page khi trang còn ở vị trí cuộn sau navigation.
- Lần test đầu phát hiện title template không áp dụng cho page cùng segment layout (đối chiếu tài liệu
  Next metadata cài sẵn), đã sửa title.absolute. Các vòng sau phát hiện và sửa lỗi skip link/Back nói trên.
  Harness cũng được sửa để không tự nạp lại token fixture sau 401; không đổi auth production để vượt test.
- Đã kiểm diff xác nhận AdminManagement/adminApi/AuthContext/VehicSimShell không thay đổi;
  không file backend/schema/worker/Analysis thay đổi. `git diff --check`: PASS.

## Giới hạn

Browser chỉ dùng HTTP fixtures, toàn bộ /api/v1/** được chặn tại test. Không dùng dữ liệu/tài khoản thật,
không gọi API ghi thật hoặc sửa DB. Chưa xác minh E2E backend/DB, Report 7 gốc hoặc Figma Admin.
Harness sử dụng Playwright và Edge đã có sẵn; không thêm dependency/package lock.
Ba nguồn tải độc lập và không auto refresh; số liệu là kết quả mỗi lần GET, không phải snapshot giao dịch
hoặc giám sát realtime. Không tuyên bố hệ thống khỏe/an toàn dựa trên số bản ghi.
Cải thiện bảng user, query state, form/confirmation vẫn để đợt 3–4, chưa triển khai ở đây.

## File thay đổi

Modified (4):
- frontend/src/app/admin/page.tsx
- frontend/src/components/admin/AdminShell.tsx
- frontend/src/components/VehicSimSidebar.tsx
- frontend/tests/admin-redesign.mjs

Added (4):
- frontend/src/components/admin/AdminDashboard.tsx
- frontend/src/components/admin/AdminDashboard.module.css
- frontend/tests/admin-dashboard.mjs
- docs/exec-plans/completed/2026-11-04-admin-dashboard-dot-2.md

Deleted: không. Nhánh chuvv; Git đầu đợt sạch, không thay đổi có sẵn phải bảo vệ.
Git cuối đợt: 4 modified + 4 untracked của đợt này; không staged/commit/push.
Commit gợi ý: `feat(admin): add overview using existing list totals`.

Đợt tiếp theo: Đợt 3 — User Management: Table. Phạm vi dự kiến: danh sách user, tìm/lọc/sort,
phân trang, status/role, row actions, responsive và giữ query khi điều hướng; giữ API/quyền/validation.
Dừng sau đợt 2, chưa bắt đầu đợt 3.
