# Đồng bộ theme Hồ sơ thử nghiệm trên frontend

- [x] Đưa Hồ sơ cá nhân, biểu mẫu mật khẩu và hộp cắt ảnh vào hệ thống thành phần chung.
- [x] Đồng bộ bề mặt, lựa chọn, nút, bảng và hộp thoại. Giữ màu ngữ nghĩa cho trạng thái và màu chuyên biệt của dữ liệu mô phỏng.
- [x] Chạy lint, build production có kiểm tra kiểu và thử giao diện ở desktop, mobile. Cập nhật frontend ở cổng 3000.

Kiểm tra ngày 10/11/2026: `npm run lint`, `npm run build`, 6 kiểm thử Node hiện có và `git diff --check` đạt. Backend ở cổng 8001 trả `UP`, trang đăng nhập ở cổng 3000 trả HTTP 200.

Playwright mở 38 route trên bản production qua dữ liệu kiểm thử cho năm vai trò. Đã thử cắt ảnh, lưu hồ sơ, kiểm tra xác nhận mật khẩu, nhận token mới và cuộn tới cột thao tác của bảng task trên mobile. Kiểm tra này không xác nhận kết quả chạy CARLA. Đối chiếu trực quan với theme C trong code và DESIGN.md. Chưa có bản Figma để đối chiếu trực tiếp.
