# ADR-072 — Manager xem danh mục phương tiện

**Trạng thái:** Accepted 28/11/2026 — theo yêu cầu người dùng.
**Thay thế một phần:** phần cấm MANAGER xem phương tiện trong [ADR-071](ADR-071-manager-quan-ly-workspace.md).

## Bối cảnh và quyết định

MANAGER cần mở chức năng Phương tiện & Cấu hình từ sidebar. Danh mục mẫu xe và thông số của xe là dữ liệu chung, chỉ đọc theo ADR-038.

- MANAGER được xem danh sách và chi tiết danh mục xe, gồm thông số và cảm biến, qua các API GET tương ứng.
- Danh mục được trả không gắn với project: không cho MANAGER xem xe đang dùng, số lượt chạy hay lịch sử của project nhóm mặc định. Header chọn project không làm thay đổi phạm vi này.
- MANAGER tiếp tục quản lý workspace được giao và không được ghi cấu hình xe hoặc truy cập các chức năng kỹ thuật khác. Quyền của các role khác không đổi.

Không thay đổi schema. Các kiểm thử phân quyền phải kiểm tra cả gọi API trực tiếp và điều hướng trên giao diện.
