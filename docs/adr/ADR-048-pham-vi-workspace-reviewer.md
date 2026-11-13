# ADR-048 — Phạm vi project của Reviewer theo workspace

**Trạng thái:** Proposed 01/11/2026 — đã triển khai theo yêu cầu người dùng trên nhánh, chờ nhóm duyệt.
**Phạm vi đề xuất thay thế:** phần đọc dữ liệu kỹ thuật chung của REVIEWER trong ADR-035; không thay phạm vi role khác (TD-30). Quyền tạo/chạy regression được bổ sung theo [ADR-049](ADR-049-reviewer-chay-regression-de-kiem-tra.md) ngày 02/11.

## Vấn đề

Role REVIEWER chỉ quy định loại thao tác, chưa giới hạn workspace. Người duyệt có thể thấy khuyến nghị của workspace mình không tham gia. Cần thống nhất trang chủ, lịch sử, chi tiết và quyết định (các luồng UC-62/UC-63).

## Quy tắc đã triển khai để nhóm review

- Reviewer chỉ đọc và duyệt regression của project thuộc workspace mình còn là thành viên. Không xét người tạo regression hay `project_members`; project cá nhân không nằm trong phạm vi Reviewer.
- Chọn project qua header `X-VehicSim-Project`. GET không có header chọn mặc định trong phạm vi membership, ưu tiên project/workspace ACTIVE. Frontend chốt ID từ context trước khi tải màn con và giữ ID khi xoay token đổi mật khẩu.
- Quyết định bắt buộc header project tường minh; kiểm membership, project/workspace ACTIVE trong transaction. Project/workspace ARCHIVED vẫn đọc được nhưng không duyệt. Luật không tự duyệt, lý do/xác nhận và baseline mới nhất giữ nguyên.
- Ngoài phạm vi trả danh sách rỗng, chi tiết/tải/quyết định trả 404. Context không phụ thuộc project đã chọn xe hay chưa. `GET /reviewer/projects` chỉ dành cho Reviewer, trả danh sách membership để khôi phục lựa chọn lỗi mà không cần resolve project cũ.
- Lỗi context không tự chuyển project. Chỉ hiện Chọn lại project khi Reviewer còn project trong phạm vi. Role khác giữ context tốt gần nhất khi refresh lỗi.

`ProjectAccess` request scope giữ cùng project cho mọi kiểm quyền/view trong một request; `ReviewerScope` chỉ truy vấn membership. Repository `Queries` không đọc HTTP/security. Job nền nhận ID tường minh.

## Hệ quả và kiểm chứng

Không thay schema; độc lập ADR-047 về lưu sự kiện quyết định. Không tuyên bố cách ly dữ liệu toàn hệ thống: ADMIN/ENGINEER/EXPERIENCER/MANAGER vẫn theo TD-30.

`ReviewerScopeTest`, `VehicSimSecurityTest`, `SystemViewServiceTest` kiểm membership, resolve một lần, project chưa có xe, route chọn lại và ẩn dữ liệu. Kiểm API/UI tích hợp dùng DB QA riêng, không sửa DB dev.
