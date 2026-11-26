# Tinh gọn giao diện module 2 — 25/11/2026

## Phạm vi

- Sắp xếp lại màn chạy baseline, làm rõ họ kịch bản, cấu hình, tiến độ và hành động theo trạng thái.
- Tách thao tác chính, lượt chạy và các công cụ dữ liệu CARLA; giữ nguyên quyền, dữ liệu và hợp đồng API.
- Dùng hệ thống giao diện VehicSim hiện có, giữ các trạng thái và phân quyền sẵn có.

## Kiểm chứng

- Đã xem hai màn trong trình duyệt bằng tài khoản kỹ sư và dữ liệu project thực; thử phóng to giao diện 200% và 400%.
- Đã mở thông số, quản lý họ, xem cảm biến và công cụ dữ liệu mà không khởi chạy hoặc xóa dữ liệu.
- TypeScript và kiểm tra định dạng diff đạt; kiểm tra ESLint được chạy trên frontend.
- Chưa đối chiếu Figma vì không có bản thiết kế. Phóng to trình duyệt không thay thế kiểm thử trên thiết bị di động thực.

## Tài liệu và thay đổi

- Đã đọc hướng dẫn dự án, hướng dẫn frontend, CLAUDE.md, DESIGN.md và tài liệu liên quan tới CARLA.
- Không đổi API, dữ liệu hay schema trong phần chỉnh giao diện này.
