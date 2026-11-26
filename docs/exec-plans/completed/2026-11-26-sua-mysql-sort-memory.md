# Sửa lỗi bộ nhớ sắp xếp MySQL

- MySQL 8.4 với dữ liệu project thực tái hiện lỗi 1038 ở truy vấn dashboard cũ; truy vấn không sắp xếp hàng rộng trong MySQL chạy thành công.
- Dashboard, lựa chọn snapshot, manifest và baseline tối ưu giữ thứ tự bằng Java. Collection CARLA xếp hạng theo cột hẹp trong MySQL trước khi lấy hàng đầy đủ; đối chiếu thứ tự với dữ liệu thực.
- Backend đã khởi động lại; trang phân tích hiển thị tổng quan và 12 run, phân trang 10 + 2 đúng thứ tự.
- `mvnw.cmd -B test`: 1505 test, 0 lỗi, 35 bỏ qua. `git diff --check` đạt. Các test tích hợp MySQL cần cấu hình riêng bị bỏ qua; SQL đã kiểm trực tiếp trên DB hiện có, không thay đổi dữ liệu.
- Đã đọc `CLAUDE.md`, hợp đồng chỉ số phân tích, ADR-040/043/044/055, kế hoạch 20/10, tài liệu CARLA và hướng dẫn đổi tên package. Tài liệu lịch sử có các định danh simulator cũ; bản sửa không thay đổi định danh hay kết quả đo.
- Dashboard vẫn gom toàn bộ run phù hợp trong bộ nhớ Java để tính tổng quan và phân trang theo hành vi hiện tại; cần đánh giá lại khi dữ liệu tăng lớn.
