# Sửa baseline và kiểm tra CARLA — 25/11/2026

## Phạm vix

- Tách tiến độ baseline theo biến thể, xe, bản AEB và phiên bản mô phỏng; giữ trường thống kê cũ cho màn khác.
- Làm rõ và giới hạn thao tác hủy/xóa trên màn CARLA; bảo vệ project và workspace lưu trữ ở các API module 2.
- Kiểm tra chế độ AEB của kết quả trước khi lưu. Không đổi hợp đồng bàn giao hoặc logic phân tích của module 3.
- Theo yêu cầu riêng của người dùng, cho phép nhập 2 trial trên màn tạo đợt tối ưu để chạy thử nhanh.

## Kết quả kiểm chứng

- Nhóm kiểm thử Java tập trung cho CARLA, quyền, nhập kết quả và xóa: 76/76 đạt; bộ `RunResultDeleteTest` bổ sung 13/13 đạt. Frontend qua lint và kiểm tra kiểu TypeScript. SQL khóa quyền và tổng hợp được kiểm tra trên MySQL.
- Chạy CARLA 0.9.16, simulator `carla-0.9.16-xosc15`, trên project workspace với họ PX gồm hai biến thể: baseline #2561 và #2562 hoàn thành, có video và telemetry. Phân tích báo một ca va chạm và một ca phanh oan.
- Đợt tối ưu #8 hoàn thành hai trial khởi tạo và bốn lượt mô phỏng CARLA #2563–#2566. Chọn trial 1 để thử hồi quy; RT-015 chạy #2567–#2568 với cùng seed baseline, kết quả PASSED trên hai cặp. Đây chỉ là kiểm tra luồng với mẫu nhỏ; chưa chứng minh bước Bayesian/qEHVI, chưa đủ ca an toàn theo phân loại màn phân tích và không thay thế nghiệm thu hoặc phê duyệt.
- Màn tối ưu hiển thị nhầm Kinematic do API chi tiết đợt chưa trả `simulator_version`, dù bản ghi và các lượt thực tế dùng CARLA. Phần này thuộc module 4 và chưa sửa trong phạm vi công việc.
- Dataset module 3 chưa được truyền trực tiếp vào tối ưu toàn họ; không kết luận luồng bàn giao dataset đã thông. Hủy/xóa theo họ commit từng lượt nên có thể hoàn tất một phần khi project bị lưu trữ giữa chừng; các job đã khởi chạy có thể hoàn thành sau khi lưu trữ.
- Không có thay đổi schema hoặc migration. Backend, frontend và CARLA được để chạy; ảnh chụp giao diện thực tế đã kiểm tra, chưa có Figma để đối chiếu.

## Tài liệu đã đọc

`AGENTS.md`, `CLAUDE.md`, `frontend/AGENTS.md`, hướng dẫn đổi package, quy tắc đặt tên, tài liệu CARLA và hợp đồng metrics, ADR-043, ADR-049, ADR-055, ADR-064 và ADR-065. Một số mô tả tiến độ trong tài liệu gốc chưa phản ánh code tối ưu đang có; đối chiếu code thực tế khi chạy.
