# Đối chiếu dữ liệu baseline sang phân tích

- Đọc hợp đồng chỉ số và ADR liên quan, đối chiếu dữ liệu đã lưu với đường đọc của module phân tích.
- Tái hiện các sai lệch có bằng chứng, sửa tại điểm nối và giữ nguyên dữ liệu lịch sử.
- Chạy kiểm thử liên quan, ghi giới hạn và bằng chứng trước khi bàn giao.

## Kết quả

- DB hiện có 204 lượt CARLA hoàn tất; chỉ 5 nguồn producer đã lưu tương ứng #2584–#2588. Ví dụ #2582/#2583 có file nhưng không có nguồn producer; ADR-067 và README V3 yêu cầu chạy lại, không tự đọc file hoặc backfill.
- Khi không ghi được file dataset, lưu bytes đã bổ sung từ producer vào DB và không đăng ký nhầm file cũ; không thay kết quả lịch sử hay thay đổi trạng thái run. Nộp JSON ngoài thiếu dataset vẫn bị V3 chặn và được báo rõ.
- Sửa lọc không va chạm, hiển thị nguyên nhân nguồn không đọc được. Giữ giới hạn nguồn DB của V3 là CARLA hoàn tất theo ADR-067; dashboard tổng hợp vẫn hỗ trợ động học.
- Đọc hợp đồng chỉ số, ADR-055, ADR-067 và README Failure Analysis V3. Kiểm thử backend `mvnw -B clean test`: 1520 bài, 37 bỏ qua. Browser dùng API giả lập, không chứng minh CARLA thật; chưa đối chiếu Figma.
- Frontend build, lint, TypeScript và `npm run test:analysis -- --browser` đạt (78 unit, 6 bộ browser); 7 bộ browser legacy không chạy vì giao diện hiện tại không còn điều khiển tương ứng.
