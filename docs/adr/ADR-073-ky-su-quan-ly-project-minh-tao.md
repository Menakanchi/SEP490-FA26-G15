# ADR-073 — Kỹ sư quản lý project workspace do mình tạo

**Trạng thái:** Accepted 28/11/2026 theo yêu cầu của người dùng. Thay thế phần hạn chế sửa, lưu trữ và xóa project của [ADR-064](ADR-064-ky-su-tao-project-cua-workspace.md).

Kỹ sư được sửa thông tin và xe, lưu trữ, mở lại hoặc xóa project workspace do chính mình tạo khi vẫn là thành viên của workspace đang hoạt động. Tên vẫn duy nhất trong workspace; xe không đổi được sau khi có lượt chạy; lưu trữ/xóa vẫn kiểm tra công việc đang chạy và xác nhận xóa. Không cấp quyền quản lý project của thành viên khác hoặc project cá nhân khi đã đổi vai trò. Quyền adopt baseline của project cá nhân không thay đổi.

Project hoặc workspace đã lưu trữ vẫn được thành viên xem lịch sử, nhưng các thao tác ghi kỹ thuật trong project bị từ chối. Mở lại project chỉ được phép khi workspace còn hoạt động. Không đổi schema; kiểm chứng bằng ProjectSecurityTest, ProjectServiceEngineerCreateTest và ReviewerScopeTest.
