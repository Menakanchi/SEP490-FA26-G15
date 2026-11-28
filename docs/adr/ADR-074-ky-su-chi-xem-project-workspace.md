# ADR-074 — Kỹ sư chỉ xem và chọn project của workspace

**Trạng thái:** Accepted 28/11/2026 theo yêu cầu của người dùng. Thay thế [ADR-073](ADR-073-ky-su-quan-ly-project-minh-tao.md); khôi phục hạn chế của [ADR-064](ADR-064-ky-su-tao-project-cua-workspace.md).

Kỹ sư được thấy và chọn project của workspace mình là thành viên, và tạo project mới trong workspace đó (ADR-064). Kỹ sư **không** sửa, lưu trữ, mở lại, xóa hoặc adopt project qua API quản lý project; các thao tác này dành cho Experiencer trong project cá nhân. Trang cài đặt project cá nhân cũ của kỹ sư chỉ xem, không có form sửa hay nút xóa.

Lý do: hợp nhất nhánh `trungdam` (xóa project có hàng đợi dọn file bền vững, ADR chưa có số) với `main`; hai nhánh mâu thuẫn về quyền của Kỹ sư và người dùng chọn giữ cách của `trungdam`. Hệ quả: tính năng ADR-073 trên production bị bỏ khi triển khai bản hợp nhất. Không đổi schema. Kiểm chứng bằng ProjectSecurityTest và ProjectServiceEngineerCreateTest.
