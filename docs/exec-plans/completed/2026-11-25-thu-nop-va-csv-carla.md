# Thử nộp kết quả và tính CSV CARLA — 25/11/2026

## Phạm vi

- Bỏ dải thông báo đầu trang theo yêu cầu; giữ cách trình bày rõ nguồn số liệu tại các kết quả cảm biến.
- Kiểm tra nhập `result.json` và tính lại từ tệp cảm biến của các lượt CARLA thật.
- Không sửa thuật toán, schema hoặc dữ liệu của lượt đã hoàn thành.

## Kiểm tra đã thực hiện

- Đọc AGENTS.md, frontend/AGENTS.md, CLAUDE.md, DESIGN.md, carla-local.md, ADR-043, ADR-055 và hướng dẫn Next.js đã cài; lưu ý tài liệu CARLA có các đoạn lịch sử về profile và bộ lọc.
- Lượt #2569: CSV tính lại RMS jerk 8,335 m/s³; quãng phanh 21,034 m khi dùng 4,6 m/s², khớp popup. Giá trị 18,470 m ứng với mặc định 8 m/s².
- Lượt #2570: nhập cả frames.csv và collisions.json; nhận 1 sự kiện va chạm, tốc độ tương đối 11,13 m/s. AEB tắt nên số đo pha phanh không áp dụng.
- Kết quả mô phỏng #2569 ghi COLLISION trong khi tệp sự kiện cảm biến trống; hai nguồn có cơ chế phát hiện khác nhau. UI đã ghi rõ không có sự kiện cảm biến không chứng minh không có va chạm.
- Thử nộp lại `result.json` vào #2569 đã hoàn thành: hệ thống từ chối đúng quy tắc. Tạo riêng #2571 khi CARLA tạm dừng để có run FAILED, bật CARLA lại và chạy `.xosc` của chính run bằng ScenarioRunner; nộp `result.json` thật thành công, tải lại thấy #2571 Hoàn thành. Nhập kết quả ngoài không tự nhập video/cảm biến.
- Đã xác nhận dải thông báo đã biến mất trên trình duyệt và giao diện ghi rõ nguồn sự kiện cảm biến. CARLA tiếp tục chạy.
