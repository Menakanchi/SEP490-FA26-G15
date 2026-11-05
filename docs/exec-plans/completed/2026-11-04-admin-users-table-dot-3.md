# Admin đợt 3 — User Management: Table

Trạng thái: hoàn tất đợt 3. Nhánh chuvv; Git đầu đợt sạch.
Nguồn: yêu cầu tiếp tục đợt 3; không triển khai redesign details/forms của đợt 4.

## Audit trước khi sửa

Đối chiếu hướng dẫn repo/frontend, [audit Admin](../../vehicsim/audit-redesign-admin-2026-11-04.md),
[bàn giao đợt 2](../completed/2026-11-04-admin-dashboard-dot-2.md), yêu cầu gốc đợt 3,
AdminManagement/Editor, adminApi, trang users và browser tests. Truy lại AdminController.list,
AdminService.list và AdminRepository.list; đọc tài liệu Next cài sẵn về native history,
useSearchParams/Suspense và CSS Modules (đã dùng từ đợt 1).

| Chức năng | API / nguồn thật | Quyết định |
|---|---|---|
|Danh sách|GET /api/v1/vehicsim/admin/users|KEEP DTO/authorization, REDESIGN riêng UI users|
|Tìm|q tối đa 100, tìm tên/email bằng LOCATE|Gửi server khi submit; URL lưu từ khóa đã áp dụng|
|Lọc|role: 5 role cố định; status ACTIVE/INACTIVE|Giữ đúng code API, nhãn user rõ nghĩa|
|Sort|newest: ID DESC; oldest: ID ASC; name: EMAIL ASC + ID DESC|Đổi nhãn name thành Email A–Z; không tự sort trang cục bộ|
|Phân trang|page 1–100000; page_size 1–100; total COUNT trước LIMIT/OFFSET|Giữ server pagination, chọn 10/20/50/100; clamp trang hết dữ liệu|
|Row action|GET /users/{id}, mở Editor hiện có|Chỉ Chỉnh sửa, không thêm khóa/xóa/bulk/reset-password ngoài API|
|Tạo/sửa/lưu|Editor gọi adminApi.save; tự khóa/đổi role bị chặn, server kiểm dependencies|Giữ Editor/validation/confirmation nguyên văn; không redesign form|

Hiện bảng user dùng layout chung với workspace/reference; query chỉ ở state component nên reload/back mất.
Cột email/name dễ khó đọc trên màn nhỏ; row action chung tên, nhãn active là Đang bật và sort Tên/Email không chính xác.
Chưa có API standalone user detail route, delete hoặc row lock toggle; không tự thêm.

## Phạm vi và cách làm

- Nhánh users dùng component bảng riêng, nhận renderEditor từ AdminManagement để giữ nguyên Editor.
- URL là nguồn query; native pushState/replaceState theo tài liệu Next, useSearchParams trong Suspense.
  Không lưu query/danh sách vào localStorage. Canonicalize URL không hợp lệ trước khi gửi API.
- Tìm/lọc/sort/đổi số dòng về trang 1. Reload/Back/Forward và đóng/lưu editor giữ scope URL.
- Không hiển thị dữ liệu cũ khi request mới đang tải/lỗi; bỏ response cũ khi thay query/unmount.
- Bảng có row header nhận diện tài khoản, role/status có chữ, ngày tạo, sticky actions,
  vùng cuộn ngang đặt tên và nhận focus bàn phím; filter chips/reset, loading/error/retry/empty.
- Không sửa workspace/reference, dashboard, Analysis, backend/auth/schema hoặc API contracts.

## Các bước

1. [x] Audit Git, code/API/quyền, nguồn query và Next docs.
2. [x] Triển khai bảng users, query URL, reuse Editor nguyên trạng.
3. [x] Lint/TypeScript/build và checks phù hợp.
4. [x] Browser fixtures: query/history/server pagination, race/error/empty, row/editor,
   role/session và responsive ở 1920×1080, 1366×768, 768×1024, thêm mobile.
5. [x] Kiểm diff, ghi bằng chứng, chuyển completed và dừng trước đợt 4.

Không có thiết kế Figma Admin/Report 7 gốc để đối chiếu. Browser dùng HTTP fixture, không dữ liệu thật;
không gọi API ghi thật hoặc tuyên bố E2E backend/DB. Không git add/commit/push.

## Kết quả triển khai

- Thêm AdminUsersTable + CSS Modules riêng, nhánh users trong AdminManagement được bọc Suspense.
  Component nhận renderEditor để dùng lại Editor nguyên trạng. Đã so sánh với HEAD: toàn bộ từ
  `function Management` tới cuối file khớp nguyên văn (bao gồm bảng workspace/reference và Editor).
- Nhóm tên/email trong row header nhận diện tài khoản, hiển thị đầy đủ role, trạng thái có chữ,
  ngày và giờ tạo; dữ liệu ngày không hợp lệ là —. Tài khoản hiện tại có nhãn Bạn.
  Không xóa field nghiệp vụ; không thêm chỉ số hoặc field/API không có.
- Row action chỉ Chỉnh sửa, tên truy cập gồm email; disable các nút trong lúc tải detail,
  có Đang mở… đúng dòng. GET detail lỗi giữ nguyên bảng và báo lỗi, không làm sai kết quả list.
- Toolbar riêng users: tìm tên/email có submit, role/status filters, sort đúng Email A–Z,
  chip bộ lọc đã áp dụng và reset. Draft search không tự gửi API mỗi lần gõ.
- Query URL gồm q/status/role/sort/page/page_size; mặc định rút gọn, trim/max 100 cho q,
  allowlist role/status/sort/page size và biên page 1–100000. URL không hợp lệ được replace bằng
  canonical URL trước khi gửi API; không lưu danh sách/query vào localStorage.
- Native history tích hợp Next giữ reload/Back/Forward, return từ sidebar và scope khi đóng/lưu Editor.
  Đổi tìm/lọc/sort/số dòng về trang 1. Xóa bộ lọc giữ sort và page size đã chọn.
- Phân trang server bằng total thật, chọn 10/20/50/100 dòng; không tải toàn DB để chia trang/sort.
  Trang vượt kết quả hiện tại được replace về trang cuối rồi tải lại, cả trường hợp total=0.
- Đang tải hoặc lỗi thì không giữ row/action/count của request cũ. Request đến muộn khi query đổi
  hoặc component unmount bị bỏ qua. Response sai DTO/count/page/ID được báo lỗi thay vì tạo số liệu giả.
- Bảng có vùng cuộn ngang đặt tên, focus bàn phím và sticky actions; hướng dẫn cuộn trên màn nhỏ,
  tên/email dài tự xuống dòng; các select có aria-labelledby riêng, không lẫn nhãn với option.
- Giữ mọi xác nhận/lưu/validation của Editor: chỉ thành công sau API xác nhận, lỗi giữ input;
  sau lưu tải lại đúng query, tài khoản đổi trạng thái không còn khớp filter sẽ rời danh sách theo server.

## Kiểm chứng

- `npm.cmd run lint`: PASS (gồm harness cuối).
- `npx.cmd tsc --noEmit`: PASS; build cuối cũng kiểm TypeScript PASS.
- `npm.cmd run build`: PASS, mọi route hiện có build được, không thiếu Suspense.
- `.\mvnw.cmd -B '-Dtest=AdminSecurityTest,AdminServiceTest,RepoDocsTest' test`:
  PASS, 21 tests, 0 failures/errors/skipped. Không sửa tests hoặc logic backend.
- `node tests/admin-users-table.mjs`: PASS trên production build cuối. 10 ảnh tại
  `data/admin-batch3-ui`, kết quả `result.json` (gitignored).
  HTTP fixture thực hiện search/filter/email sort/LIMIT-OFFSET trên dataset riêng 61 user;
  test đối chiếu đúng rows/count/query thay vì chỉ thấy request hoặc URL đổi.
  Kiểm draft chưa submit, trim, role/status, đổi sort/số dòng về trang 1, 10/20/50/100,
  reload/sidebar return/Back/Forward/chip reset, URL invalid, trang 999 và scope rỗng,
  old response lỗi đến sau response mới, loading/503/403/network/malformed/empty/retry,
  detail opening/error/target email, Editor cancel/confirmation/rejected save/input giữ nguyên,
  server save thành công rồi refetch cùng scope, self role/status guard, bốn role bị chặn,
  401 và guest không fetch. Hai PUT duy nhất là fixture chủ ý (409 rồi 200); không ghi API thật.
- `node tests/admin-redesign.mjs`: PASS trên build cuối, giữ đủ kiểm hồi quy Admin đợt 1.
  Chỉ cập nhật selector row action có tên đối tượng và empty state user riêng; không bỏ test nghiệp vụ.
- `node tests/admin-dashboard.mjs`: PASS trên build cuối; số liệu, shortcut, history và role đợt 2 giữ được.
- `node tests/analysis-redesign.mjs`: PASS, toàn bộ hồi quy Analysis hiện có; không sửa source/test Analysis.
- Viewport 1920×1080, 1366×768, 768×1024, thêm 390×844. Đã xem ảnh desktop/tablet/mobile,
  tên/email dài, sticky actions và trạng thái lỗi. Không tràn ngang document; vùng bảng cuộn được bằng phím.
- Đã phát hiện và sửa accessible name select bị lẫn option trong vòng browser đầu.
  Editor cũ vẫn giữ nguyên; test self guard tìm combobox theo tên hiện có. Harness đợi nội dung
  và scope đã render, tránh nhầm URL native vừa đổi với kết quả React đã tải xong.
- `git diff --check`: PASS. Đối chiếu diff: adminApi/AuthContext/VehicSimShell/AdminShell/dashboard
  không đổi; không sửa backend/database/worker/Analysis. Artifact data/ được gitignore.

## Giới hạn / bàn giao

Browser là HTTP fixture, không E2E auth/backend/DB thật; không dùng dữ liệu cá nhân hoặc API ghi thật.
Chưa có Figma Admin/Report 7 gốc. Harness dùng Playwright/Edge đã có, không thêm package/dependency.
Sort/page giới hạn theo API hiện có; tối đa page 100000. Không thêm sort tên, last-login, khóa nhanh,
DELETE, bulk action hoặc route detail khi backend/source chưa hỗ trợ.
Editor/confirmation/nhãn của form cũ chưa redesign; dành đợt 4, không tự mở rộng ở đợt này.

## File thay đổi

Modified (2):
- frontend/src/components/admin/AdminManagement.tsx
- frontend/tests/admin-redesign.mjs

Added (5):
- frontend/src/components/admin/AdminUsersTable.tsx
- frontend/src/components/admin/AdminUsersTable.module.css
- frontend/src/components/admin/adminUsersQuery.ts
- frontend/tests/admin-users-table.mjs
- docs/exec-plans/completed/2026-11-04-admin-users-table-dot-3.md

Deleted: không. Git đầu đợt sạch; nhánh chuvv. Cuối đợt 2 modified + 5 untracked,
không staged/commit/push và không ghi đè thay đổi của thành viên khác.
Commit gợi ý: `refactor(admin): redesign users table and persist query in URL`.

Đợt tiếp theo: Đợt 4 — User Management: Details & Forms, tập trung form/role/status,
confirmation rõ đối tượng/hậu quả, validation/error/focus và chống submit lặp; giữ API/quyền/DB.
Chưa bắt đầu đợt 4. Dừng sau bàn giao đợt 3.
