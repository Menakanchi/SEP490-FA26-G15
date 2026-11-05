# Admin đợt 4 — User Management: Details & Forms

Trạng thái: hoàn tất đợt 4. Nhánh chuvv; Git đầu đợt sạch.
Nguồn: yêu cầu tiếp tục đợt 4; không làm workspace đợt 5.

## Audit trước khi sửa

Đã đọc hướng dẫn repo/frontend, [bàn giao đợt 3](../completed/2026-11-04-admin-users-table-dot-3.md),
yêu cầu gốc đợt 4, AdminManagement/Editor, AdminUsersTable/query, adminApi/API client,
AdminRequests.UserRequest, AdminService.createUser/updateUser và ApiExceptionHandler.
Đối chiếu tài liệu Next cài sẵn về layouts/pages, CSS Modules và accessibility.

- Form users hiện dùng Editor chung, xác nhận lưu chưa chỉ rõ tài khoản hoặc từng thay đổi.
  Thông báo mọi thay đổi làm hết phiên chưa đúng: service chỉ tăng auth_version khi email/role/active đổi.
- POST /api/v1/vehicsim/admin/users tạo bằng email/tên/role/password/is_active;
  PUT /users/{id} cập nhật đầy đủ, không đổi mật khẩu. GET /users/{id} cung cấp chi tiết có sẵn.
- Email trim/lowercase, 255 ký tự; họ/tên bắt buộc tối đa 80, tên đệm tùy chọn tối đa 80;
  password tạo mới tối thiểu 8 ký tự và tối đa 72 byte UTF-8, không trim.
- Role là 5 enum cố định. UI cũ tạo mặc định MANAGER/active=true. Self không đổi role hoặc khóa chính mình.
  Backend kiểm workspace Manager, membership/project/task dependencies và uniqueness; UI không có dữ liệu
  để giả định có/không có phụ thuộc, vẫn hiển thị lỗi server nguyên nghĩa.
- ApiExceptionHandler trả detail string tổng hợp, không có field-error map: lỗi server hiển thị banner,
  không bịa mapping field. Không đổi API/DTO/auth/JWT/quota/DB.
- Native dialog hiện có focus trap, nhưng Escape/Hủy đang bỏ input ngay. Detail GET có thể về sau
  thao tác Thêm mới, làm thay editor; cần khóa tạo mới khi đang mở detail và kiểm đúng target ID/scope.

## Phạm vi

- User Editor riêng, tái sử dụng adminApi; giữ Editor workspace/reference nguyên văn.
- Summary nhận diện tài khoản/ID/role/status/ngày tạo từ dữ liệu thật; không tạo route/field backend mới.
- Nhóm thông tin/tên/email, role/status, password chỉ khi tạo; required/inline validation và helper hợp lệ.
- Review trước tạo/lưu, trước/sau từng thay đổi; không đưa password vào review hoặc lưu storage/log.
- Cảnh báo có điều kiện khi khóa, đổi role/email, đặc biệt tự đổi email làm hết phiên hiện tại.
- Confirm bỏ draft khi Hủy/Escape; native modal, focus an toàn, khóa khi lưu và ref chống submit lặp.
- Lỗi API giữ input, chỉ thành công khi API trả thành công rồi refetch đúng query; không optimistic update.

## Các bước

1. [x] Audit Git, frontend/backend contracts và phạm vi.
2. [x] Tách user Editor, UI details/form/review/discard/focus và bảo toàn target khi mở detail.
3. [x] Lint/TypeScript/build + Java checks phù hợp.
4. [x] Browser fixtures: create/update/validation/review/error/dirty close/focus/busy/role/race,
   ảnh 1920×1080, 1366×768, 768×1024, thêm 390×844; hồi quy các đợt trước.
5. [x] Diff, ghi bằng chứng, chuyển completed và dừng trước đợt 5.

Chưa có Figma Admin/Report 7 gốc. Browser dùng HTTP fixtures, không dữ liệu cá nhân/API ghi thật.
Không git add/commit/push. Không thay security service, password hash hoặc schema.

## Kết quả triển khai

- Thêm AdminUserEditor và CSS Modules riêng cho users. Chỉ đổi nhánh users trong AdminManagement;
  toàn bộ từ function Management đến cuối file, bao gồm Editor workspace/reference, khớp HEAD nguyên văn.
- Header nhận diện tài khoản/email/ID, summary role/trạng thái/ngày tạo thật từ GET detail.
  Không thêm route user detail, field DB, API reset password, xóa hay khóa nhanh.
- Form nhóm thông tin tài khoản và role/trạng thái; label/required/error theo từng trường,
  role helper theo quyền thật. Tạo giữ MANAGER và active=true; sửa không nhận/gửi password.
- Validation khớp hợp đồng email/tên và giới hạn 72 byte UTF-8 của BCrypt. Password không trim,
  có nút hiện/ẩn và byte counter; không đưa password vào review, storage, ảnh hay log.
- Review tạo mới và cập nhật: chỉ ra target và các giá trị trước/sau thật sự thay đổi.
  Chỉ cảnh báo thu hồi phiên khi email/role/status đổi; họ tên đơn thuần không có cảnh báo này.
  Phân biệt khóa, mở lại, đổi role và tự đổi email khiến phiên hiện tại hết hiệu lực.
- Giữ self role/status disabled, submit guard và kiểm dependencies/uniqueness/quota ở backend.
  Banner hiển thị detail string thật; 409/400/403/429/network không xóa input hoặc giả thành công.
  Chỉ API thành công mới đóng form, thông báo và refetch theo scope URL hiện có.
- Native dialog giữ nền inert, header/footer cố định và body cuộn. Escape review quay lại form,
  Escape/Hủy draft hỏi giữ/bỏ; click backdrop không đóng. Khi lưu khóa nút đóng/quay lại,
  chặn Escape và ref chống hai sự kiện submit trước React render.
- Bổ sung vòng Tab/Shift+Tab rõ ràng: native dialog trên Edge có thể đưa focus ra browser chrome
  sau phần tử cuối. Ghi nhận nút mở trước request detail để trả focus sau Hủy/Bỏ thay đổi;
  nút này bị disabled khi tải nên không thể chỉ lấy activeElement lúc dialog mount.
- Detail response được kiểm đúng ID, field/role/status và request scope/sequence.
  Bỏ response sai tài khoản hoặc đến muộn sau đổi filter/unmount. Thêm mới bị khóa khi đang tải detail.

## Kiểm chứng

- npm.cmd run lint: PASS trên source cuối, không tắt rule hoặc thêm eslint-disable.
- npx.cmd tsc --noEmit: PASS trên source cuối.
- npx.cmd next build: PASS, TypeScript và mọi route hiện có build được.
- .\mvnw.cmd -B '-Dtest=AdminSecurityTest,AdminServiceTest,RepoDocsTest' test:
  PASS, 21 tests (3 security + 13 service + 5 docs), 0 failures/errors/skipped.
  Không sửa source hoặc test backend. RepoDocsTest được chạy lại sau khi chuyển plan.
- node tests/admin-user-forms.mjs: PASS, 13 ảnh ở data/admin-batch4-ui và result.json,
  đều gitignored. HTTP fixtures thực hiện login, create/update và lỗi; không gọi API ghi thật.
  Kiểm đủ required/default, 74 byte bị từ chối và 72 byte được nhận, password giữ khi lỗi nhưng
  không hiện review, payload create chuẩn hóa và PUT không password, review trước/sau,
  name-only/role/lock/unlock/self-email, dirty close/keep/discard, focus return, vòng Tab,
  busy Escape và double submit, lỗi dependency/409/403/429/network, success/refetch,
  detail sai ID/đến muộn và bốn role không phải Admin bị chặn.
- node tests/admin-users-table.mjs: PASS (10 ảnh), hồi quy query/history/filter/pagination/race
  và lưu theo scope; không sửa harness này.
- node tests/admin-redesign.mjs: PASS (19 ảnh), hồi quy Admin đợt 1.
  Chỉ sửa fixture detail trả đúng ID được yêu cầu và thêm xác nhận bỏ draft sau Hủy.
- node tests/admin-dashboard.mjs: PASS (9 ảnh), hồi quy dashboard đợt 2.
- node tests/analysis-redesign.mjs: PASS; không sửa source/test Analysis.
- Browser production build ở 1920×1080, 1366×768, 768×1024 và 390×844.
  Đã xem ảnh create/review/error/edit/self-email desktop và mobile; modal nằm trong viewport,
  không tràn ngang document, body cuộn còn footer và nút xác nhận dùng được.
- git diff --check: PASS trước bàn giao. Đã đối chiếu generic Management/Editor nguyên văn HEAD.
  adminApi/AuthContext/guards, backend/security/DB/worker/Analysis và global layout không đổi.

## Giới hạn và bàn giao

Browser dùng HTTP fixtures, không kiểm E2E auth/backend/DB/CARLA thật. 401 sau tự đổi email là
fixture mô phỏng auth_version; luật tăng auth_version được đối chiếu service/test Java hiện có.
Không có Figma Admin/Report 7 gốc để đối chiếu, không tuyên bố đã đối chiếu thiết kế.
Không có lỗi còn biết trong phạm vi đã kiểm; không suy rộng kết quả fixture thành xác minh hệ thống thật.
Không thêm dependency. Dữ liệu/ảnh thử dùng địa chỉ example.invalid và nằm trong data/ gitignored.

Modified (4):
- frontend/src/components/admin/AdminManagement.tsx
- frontend/src/components/admin/AdminUsersTable.tsx
- frontend/src/components/admin/AdminUsersTable.module.css
- frontend/tests/admin-redesign.mjs

Added (4):
- frontend/src/components/admin/AdminUserEditor.tsx
- frontend/src/components/admin/AdminUserEditor.module.css
- frontend/tests/admin-user-forms.mjs
- docs/exec-plans/completed/2026-11-04-admin-user-forms-dot-4.md

Deleted: không. Nhánh chuvv, Git đầu đợt sạch; 4 modified + 4 untracked ở cuối đợt.
Không git add/commit/push, không ghi đè thay đổi có sẵn.
Commit gợi ý: refactor(admin): redesign user forms and confirmations.

Đợt tiếp theo: đợt 5 — Workspace Management, chỉ các list/detail/forms/actions/search/filter/pagination
đã có backend hỗ trợ. Chưa triển khai đợt 5; dừng sau bàn giao đợt 4.
