# Gộp main vào trungdam qua nhánh merge

Ngày 28/11/2026. Gộp `merge/main-into-trungdam` vào `trungdam`, giữ các commit của cả hai nhánh và dữ liệu local.

- Giữ checklist Reviewer có kiểm tra ID lượt chạy hợp lệ; bổ sung đường quay lại màn duyệt sau playback. Cập nhật fixture theo hợp đồng context và URL sau gộp.
- Giữ ADR-074: Kỹ sư được tạo, xem và chọn project trong workspace; không sửa hoặc xóa project qua API quản lý. Cơ chế xóa project và hàng đợi dọn file không đổi.
- Chạy trên worktree tạm tách biệt, không kết nối dữ liệu project hiện có: `mvnw -B clean test` đạt 1.613 test, 58 bỏ qua; `npm run lint`, `npx tsc --noEmit`, `npm run build` và `npm audit --omit=dev --audit-level=high` đạt. Các test quyền project, Reviewer, tạo project của Kỹ sư và quản trị đều đạt. Test tích hợp MySQL về xóa, retry và ghi đồng thời nằm trong các test bị bỏ qua.
- Kiểm thử UI giả lập API: xóa project tại 320 và 1440 px, các trạng thái lỗi; Reviewer, playback, xem trước regression, danh sách project, tìm thành viên workspace và luồng MOBO. Không đối chiếu Figma và không chạy CARLA hay MySQL thật trong lần gộp này.
- Giới hạn TD-30: ADMIN dùng project nhóm mặc định. Nếu workspace của project đó lưu trữ, thao tác ghi bị 409; không tự chuyển sang project khác vì có thể ghi nhầm dữ liệu.

Đã đọc AGENTS.md, CLAUDE.md, frontend/AGENTS.md, hướng dẫn đổi tên gói, ADR-040, ADR-044, ADR-055, kế hoạch 20/10, ADR-074 và hướng dẫn Next.js Link. ADR-040 và kế hoạch 20/10 mô tả một số module Python cũ; code hiện tại dùng lõi Java và ADR-055 chốt chỉ số mới hơn.
