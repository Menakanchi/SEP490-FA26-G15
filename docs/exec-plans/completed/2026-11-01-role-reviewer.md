# 01/11/2026 — Role Reviewer: trang chủ, nhiệm vụ & báo cáo, lịch sử quyết định

Phân công họp nhóm: TrungDQ code role REVIEWER. Trước thay đổi này Reviewer đăng nhập thấy trang chủ của kỹ sư, không có task
hay báo cáo của mình (API task / báo cáo chỉ cho MANAGER), và lịch sử quyết định chỉ là một khối nhỏ cuối màn Khuyến nghị.
Giai đoạn ban đầu không đổi schema hay quyền ghi kịch bản/regression. Trạng thái tích hợp hiện tại có lịch sử sự kiện và migration 012 theo [ADR-046](../../adr/ADR-046-lich-su-quyet-dinh-reviewer.md) Proposed: giữ trên nhánh chờ nhóm duyệt, chưa áp DB dev. Phạm vi Reviewer theo [ADR-047](../../adr/ADR-047-pham-vi-workspace-reviewer.md), liên quan các luồng UC-62/UC-63.

## Đã làm

- **Trang chủ Reviewer** (`/` khi role REVIEWER, `components/reviewer/ReviewerHome.tsx`, theo Figma "Reviewer" `6:1435`):
  - hàng đợi khuyến nghị chờ lâu nhất trước, nút "Duyệt khuyến nghị tiếp theo";
  - số đã chấp nhận / từ chối 30 ngày, số hồi quy không đạt;
  - so sánh từng cặp run theo đúng cách `RegressionSummarizer` đếm (tốt lên, xấu đi, không đổi, va chạm mới);
  - task của tôi, 4 luật duyệt backend kiểm thật, quyết định gần đây.

  Role khác giữ trang vòng MVP.
- **Nhiệm vụ & báo cáo** cho ENGINEER / REVIEWER (UC-21, UC-64, UC-66, UC-68):
  - Backend: `MemberWorkController` + `MemberWorkService`, quyền `VehicSimAccess.requireWorkspaceMember`.
    - `GET /api/v1/vehicsim/my/work`: task được giao ở các workspace còn là thành viên, báo cáo đã nộp, project nộp được báo cáo.
    - `PUT /my/tasks/{id}/progress`: chỉ người được giao; TODO / IN_PROGRESS / REVIEW. DONE để Manager xác nhận; task DONE thì khoá.
      Chuyển sang REVIEW thì báo Manager.
    - `POST /my/reports`: chỉ project ACTIVE của workspace ACTIVE mình là thành viên. Task gắn kèm phải của mình và cùng project
      (FK ghép `task_reports(task_id, project_id)`). Đính kèm chỉ http(s). Thông báo `REPORT_SUBMITTED` cho Manager.
    - Ghi chịu hạn mức `limitWrites`.
    - Task của người khác trả 404, không lộ là có.
  - Frontend: màn `/my-work` (sửa trạng thái / tiến độ tại dòng, nộp báo cáo từ dòng task hoặc nút chung, xem kết quả duyệt và nhận xét);
    mục sidebar "Nhiệm vụ & báo cáo" chỉ hiện với ENGINEER / REVIEWER.
- **Lịch sử quyết định** `/validation/decisions`: lọc theo quyết định, tìm theo mã / phiên bản / người duyệt / lý do, chuỗi bản cơ sở.
  Dùng API `GET /decisions` có sẵn. Thêm mục con trong sidebar Kiểm định.

## Kiểm chứng giai đoạn đầu (trước các bản sửa tích hợp)

- `MemberWorkServiceTest`: luật người được giao, DONE, task người khác, workspace lưu trữ, đua với Manager, project / task / đính kèm.
- `MemberWorkSecurityTest`: 401 khi chưa đăng nhập; chỉ ENGINEER / REVIEWER; body sai 400; hạn mức 429.
- `npm run lint`, `npx tsc --noEmit` sạch.
- Chạy app thật (MySQL dev, backend nhánh này, Edge):
  - Tài khoản `qa.reviewer` trong một workspace demo tạm thời có 3 task.
  - Reviewer chuyển task sang "Chờ kiểm tra" 100 %, rồi nộp báo cáo; đường dẫn `javascript:` bị từ chối.
  - Manager nhận `REPORT_SUBMITTED` và thông báo task chờ kiểm tra, rồi duyệt; Reviewer thấy "Đã duyệt" kèm nhận xét.
  - API trả 400 khi thành viên đặt DONE; Engineer khác sửa task của Reviewer bị 404; Manager mở `/my-work` thấy thông báo không có quyền.
  - Dữ liệu demo đã xoá sau khi chạy.

## Reviewer chỉ duyệt trong workspace của mình (bổ sung cùng ngày)

Yêu cầu của TrungDQ: Reviewer của workspace chỉ duyệt yêu cầu của workspace đó. Đã chốt hai điểm:

- Chặn theo **project của regression**: project phải thuộc workspace mà Reviewer là thành viên.
  Không xét thêm người tạo regression.
- **Ẩn luôn**: danh sách khuyến nghị / regression và lịch sử quyết định trả rỗng. Chi tiết, tải gói và quyết định trả 404,
  không lộ là có regression.

Cách làm:

- `ProjectAccess` request scope resolve một lần qua `ReviewerScope.project`, kiểm `projects.workspace_id` ↔ `workspace_members`; không dựng toàn bộ context hay kiểm membership lần hai. Project cá nhân nằm ngoài phạm vi Reviewer; project chưa có xe vẫn đọc/duyệt được.
- Reviewer chọn project bằng header; frontend chốt ID từ context trước khi tải màn con. POST quyết định bắt buộc project tường minh; membership/trạng thái kiểm lại trong transaction. Role khác giữ phạm vi hiện tại (TD-30); `Queries` không đọc HTTP/security.
- `RegressionController` dùng cùng project cho list, chi tiết, tải và quyết định. Không có project thì list rỗng, chi tiết/tải/quyết định 404.
- Trang chủ báo lỗi context; không tự đổi project. Chỉ hiện nút chọn lại cho Reviewer còn project thuộc membership. Workspace/project lưu trữ chỉ đọc.

Kiểm chứng:

- Test hiện tại: `ReviewerScopeTest`, `VehicSimSecurityTest`, `SystemViewServiceTest` (Reviewer ngoài workspace: list rỗng, chi tiết/tải/quyết định 404; project không xe; resolve một lần; discovery độc lập lựa chọn).
- Chạy app thật với `qa.reviewer`:
  - Chưa là thành viên "AEB Pedestrian" (workspace của project hiện hành): mọi danh sách rỗng, chi tiết 404, quyết định 404;
    Engineer vẫn thấy đủ.
  - Thêm tạm vào workspace thì thấy và mở được khuyến nghị, có nút Duyệt; đã gỡ ngay sau khi kiểm.

Hệ quả trên dữ liệu dev: workspace "AEB Pedestrian" hiện chưa có thành viên, nên chưa Reviewer nào duyệt được khuyến nghị đang chờ.
Quản lý workspace cần thêm Reviewer vào. Màn thêm thành viên chỉ nhận tài khoản tự đăng ký (EXPERIENCER), theo ADR-045.

## Còn lại

- UC-59 ghi "Engineer, Reviewer" cấu hình regression, nhưng bất biến 3 và `VehicSimAccess` cho Reviewer chỉ đọc + duyệt. Muốn Reviewer
  tạo regression thì cần ADR mới và nhóm đồng ý; chưa đổi.
- Kênh trao đổi workspace (UC-20) chưa có màn và API.
- Thông báo trong Figma có thêm thẻ "Kênh trao đổi"; chưa vẽ vì chưa có tính năng.
