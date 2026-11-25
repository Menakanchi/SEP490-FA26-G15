# Cửa sổ cảm biến và thử luồng CARLA — 25/11/2026

## Phạm vi

- Mở cửa sổ xem video, chỉ số và các tệp của đúng lượt chạy khi chọn Xem cảm biến; giữ dữ liệu thật và quyền hiện có.
- Khởi động CARLA local và thử luồng module 2 với số lượng biến thể nhỏ; kiểm tra các tab và chức năng xem, tải dữ liệu.
- Không thay đổi lõi mô phỏng, hợp đồng API hoặc schema; giữ các dữ liệu và thay đổi có sẵn.

## Tài liệu

- Đã đọc AGENTS.md, frontend/AGENTS.md, CLAUDE.md, DESIGN.md, hướng dẫn Next.js, carla-local.md, ADR-043, ADR-055 và kế hoạch chạy baseline.
- Ưu tiên cập nhật mới và profile hiện hành `carla-0.9.16-xosc15`; phần lịch sử trong tài liệu mô tả các profile cũ.

## Kết quả kiểm chứng

- Tạo họ PX2 (ID 35), một biến thể người đi bộ; CARLA 0.9.16 kết nối với profile `carla-0.9.16-xosc15`. Baseline #2569 (AEB bật) và #2570 (AEB tắt) hoàn thành, đều có video và dữ liệu cảm biến.
- Trình duyệt: mở popup #2568 và #2569, phát video, kiểm tra số đo, đóng popup bằng Escape và nút Đóng. Tải `2569-frames.csv` thành công; SHA-256 khớp tệp gốc của run.
- Đã mở bốn tab; tab Nộp kết quả và Đánh giá cảm biến được kiểm tra giao diện và trạng thái ban đầu, chưa thử nộp `result.json` hay tính lại từ CSV qua biểu mẫu.
- ESLint và TypeScript frontend, kiểm tra diff và RepoDocsTest được chạy; không đổi API, schema hoặc lõi mô phỏng. Chưa đối chiếu Figma vì không có thiết kế.
