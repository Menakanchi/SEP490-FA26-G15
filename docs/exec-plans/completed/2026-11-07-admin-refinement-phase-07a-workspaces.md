# Admin refinement — Phase 07A: Workspace administration

Ngày 07/11/2026; nhánh `chuvv`; HEAD ban đầu `9a819f1`.
Git ban đầu sạch; thay đổi trong báo cáo đều thuộc Phase 07A.
Trạng thái: hoàn thành triển khai, QA và kiểm tra tài liệu; dừng để review workflow workspace.

## Phạm vi và căn cứ

Theo yêu cầu Phase 07, chia mỗi workflow thành một phần để review độc lập.
Phần này chỉ cải thiện quản trị workspace hiện có, không triển khai workflow khác.

Đọc AGENTS/CLAUDE, frontend AGENTS, hướng dẫn đổi gói và mục 7 quy tắc đặt tên,
[Phase 02 audit](2026-11-07-admin-refinement-phase-02-audit.md),
[Phase 06](2026-11-07-admin-refinement-phase-06-roles.md), Next accessibility/CSS
cài trong repo. Đối chiếu table/editor/query và harness workspace với
AdminController, AdminService, AdminRepository, WorkspaceRequest.

- Workflow thực: tra cứu, tạo/giao Manager, sửa/giao lại Manager; archived chỉ xem.
- Mọi API Admin yêu cầu ADMIN; ghi qua limitWrites. Manager được giao phải có
  role MANAGER và hoạt động, server kiểm lại dưới transaction/lock.
- Tạo workspace và đổi Manager mới gửi thông báo; đổi tên/mô tả không gửi.
  UPDATE chỉ sửa name/description/manager_id, không sửa thành viên/project hiện có.
- Không có API Admin archive/restore/delete, settings hay đọc audit log để thêm UI.
  Quản trị tài liệu kỹ thuật là workflow khác, chưa sửa trong phần này.

## UX Decisions và triển khai

| Thay đổi | Giá trị cho tác vụ Admin |
|---|---|
| Bảng từ 7 xuống 5 cột: Workspace, Manager phụ trách, Thành viên / Project, Trạng thái, Thao tác | Giữ nhận diện, người chịu trách nhiệm và quy mô thật; giảm số cột phải quét |
| Gộp hai count thành hai dòng có nhãn trong một ô | Giữ cả hai số đếm backend, không thay bằng KPI hoặc số giả |
| Bỏ ngày tạo khỏi bảng; giữ ngày tạo/cập nhật trong chi tiết active/archived hiện có | Chi tiết thời gian vẫn truy cập được khi cần, bảng ưu tiên tìm và giao Manager |
| Thông báo lưu nêu tên workspace và giải thích bộ lọc giữ nguyên | Biết đúng đối tượng đã lưu khi đổi tên/Manager làm bản ghi rời kết quả |
| Focus/đưa thông báo vào giữa viewport sau khi list refetch kết thúc | Tránh focus về nút đã bị tháo khỏi DOM và giúp thấy kết quả trên mobile |
| Xác nhận giao lại Manager nói rõ thành viên/project hiện có giữ nguyên | Hiểu tác động trước PUT, đúng SQL hiện hành |

Bề rộng tối thiểu bảng riêng workspace từ 1050 xuống 880 px; giữ scroll region,
thao tác sticky, thiết kế/tokens chung. Không sửa shared CSS hoặc module khác.
Callback `onSaved(name)` chỉ chạy sau save API thành công; không báo thành công khi lỗi.
Thông báo dùng `role="status"`, có focus ring và xuống dòng cho tên dài.

QA ảnh ban đầu phát hiện focus đã vào thông báo nhưng thông báo còn dưới viewport.
Bổ sung assertion vị trí thật; sửa focus sau refetch và bỏ ảnh hưởng cuộn mượt toàn cục.
Kiểm tra tiếp phát hiện mép dưới còn bị cắt do vị trí sát cạnh; chuyển cuộn tức thì
đến giữa viewport. Giữ assertion toàn bộ bounds trong viewport, không nới điều kiện;
harness cuối đã PASS và ảnh xác nhận nội dung/viền focus đều thấy rõ.

## Bất biến giữ nguyên

Giữ URL/search/status/sort/page, filter sau lưu, Manager search/paging quá 100,
selection ngoài kết quả hiện tại, eligibility/quota/duplicate-name,
payload POST/PUT đầy đủ `name, description, manager_id`, archived read-only,
notification, dirty/review/busy/double-submit/error/stale/detail guards.
Không đổi API/backend/schema/migration/security model, không ghi dữ liệu thật,
không thêm thư viện hoặc quyền quản lý thành viên cho Admin.

## Validation

| Lệnh/kiểm tra thực chạy | Kết quả |
|---|---|
| `npm.cmd run lint` trong frontend, bản cuối | PASS, không warning/error |
| `npx.cmd tsc --noEmit` trong frontend | PASS; build cuối cũng kiểm TypeScript |
| `npx.cmd next build` trong frontend, bản cuối | PASS |
| `node --check frontend/tests/admin-workspaces.mjs` | PASS |
| `.\mvnw.cmd -B -Dtest=AdminSecurityTest,AdminServiceTest,WorkspaceSecurityTest,RepoDocsTest test` | PASS 26, không fail/error/skip |
| `node tests/admin-workspaces.mjs` trong frontend, bản cuối | PASS, 23 ảnh |
| `node tests/admin-redesign.mjs` trong frontend, bản cuối | PASS, 19 ảnh |
| `git diff --check` sau code cuối | PASS |
| `RepoDocsTest` sau chuyển completed | PASS 5, không fail/error/skip |

Browser chạy tuần tự trên production frontend `127.0.0.1:3100`, đăng nhập qua HTTP
fixture; không gọi ghi API/DB thật. Harness giữ test create/reassign, errors, focus,
archived, paging, stale requests, payload, 4 role bị từ chối và 401/guest.
Backend dùng test hiện có (MockMvc/service mocks), không xác minh deployment sống.
Server QA đã dừng sau vòng kiểm cuối.

Artifact cục bộ gitignore: `data/admin-phase7a-workspaces-ui` (23 ảnh, result.json),
`data/admin-phase7a-layout-ui` (19 ảnh, result.json).
Đã xem trực tiếp bảng desktop/mobile, xác nhận giao Manager mobile và thông báo
create/reassign mobile/desktop. Không có overflow ngang toàn trang trong harness.

Giới hạn: chưa xác minh live auth/DB/API integration. Chưa có Figma Admin hoặc
Final Report/SRS gốc để đối chiếu; không tuyên bố đã nghiệm thu theo các nguồn này.

## Files Changed và bàn giao

Sửa 4 file:
- `frontend/src/components/admin/AdminWorkspacesTable.tsx`
- `frontend/src/components/admin/AdminWorkspaceEditor.tsx`
- `frontend/src/components/admin/AdminWorkspaces.module.css`
- `frontend/tests/admin-workspaces.mjs`

Thêm báo cáo completed này, không xóa file. Không stage/commit/push.
Không có API/dữ liệu/migration thay đổi.

Commit đề xuất: `git commit -m "refactor(admin): streamline workspace administration workflow"`.
Next: Phase 07B — quản trị tài liệu kỹ thuật, chỉ sau yêu cầu tiếp theo.
Chưa bắt đầu Phase 07B hoặc Phase 08.
