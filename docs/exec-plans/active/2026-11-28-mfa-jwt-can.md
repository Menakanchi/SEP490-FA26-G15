# MFA, phiên đăng nhập và tính toàn vẹn cảm biến

Ngày 28/11/2026. Mục tiêu: TOTP tự nguyện, thu hồi JWT khi đăng xuất, hạn mức đăng nhập đồng thời và tăng tính toàn vẹn cảm biến/CAN theo dữ liệu có thật.

- Bảo toàn các thay đổi local, role, dữ liệu cũ; chỉ migration mở rộng trên môi trường demo, không tự nâng DB đang dùng.
- TOTP: khóa mã hóa riêng, xác thực trước khi bật/tắt, chống phát lại, giới hạn thử, phương án khôi phục an toàn; mô tả rollout và giới hạn mixed-version.
- JWT: thu hồi phiên hiện tại, tương thích token cũ, fail-closed khi lưu trữ thu hồi lỗi; UI không báo thành công khi server chưa xác nhận.
- Login đồng thời: giới hạn atomic, không bỏ qua bảo vệ theo IP và không lộ email, kiểm cả thành công/xen thất bại.
- Cảm biến/CAN: chỉ kết luận dựa trên bằng chứng sẵn có; thiếu tín hiệu CAN/bánh xe phải thể hiện chưa kiểm chứng, không đổi AEB hoặc dữ liệu run.
- Kiểm thử tự động, Redis/MySQL demo, desktop/mobile nếu đổi UI; dọn đúng tài nguyên, chia commit, push.

## Cập nhật 29/11/2026

- TOTP tự nguyện, mã khôi phục dùng một lần/tạo lại, thu hồi JWT theo phiên, hạn mức các yêu cầu đăng nhập đồng thời và kiểm frame đã triển khai. Không đặt trần số phiên thiết bị hiện hoạt. Chi tiết triển khai, rollback, API và khóa tại [auth-security.md](../../vehicsim/auth-security.md).
- `mvnw -B clean test` trong bản sao cách ly: 1.635 test, 0 lỗi, 59 bỏ qua. Có test HTTP thật với MySQL/Redis demo, hai yêu cầu cùng dùng mã khôi phục, thiếu khóa, cập nhật auth version đồng thời, tài khoản khác, OTP Redis và token bị thu hồi. Migration 027/028 thử hai lần trên MySQL demo, giữ dòng fixture có sẵn. Frontend lint, TypeScript và build webpack đạt.
- @Browser báo không có truy cập trình duyệt trong chat; chưa xem trực quan giao diện mới trên desktop/mobile hoặc đối chiếu Figma. Cần kiểm thủ công trước nghiệm thu UI.
- CAN/ABS chưa có nguồn dữ liệu thực tương đương nghiên cứu (TD-69), chưa phát hiện/phân loại tấn công hoặc kiểm CARLA thật; frame sai chỉ là bằng chứng chất lượng dữ liệu. Các mục này tiếp tục mở, không suy ra trạng thái an toàn.
- Đã đọc `AGENTS.md`, `CLAUDE.md`, quy tắc tên gói, `database-schema.md`, `01_schema.sql`, hướng dẫn frontend, ADR index và bốn tài liệu người dùng. Schema cũ được mô tả 34 bảng trong chỉ dẫn bàn giao, trong khi code sau migration 026 có 36 bảng; sau 027/028 là 39. Không tự nâng database hoặc khởi động lại backend đang dùng.
- Đã xóa hai container demo và dữ liệu tmpfs; junction đến `frontend/node_modules` đã tháo an toàn. Bản sao kiểm thử trong thư mục temp còn lại vì lệnh xóa đệ quy bị kiểm duyệt tự động từ chối `blocked by policy`; cần người vận hành tự xử lý theo chính sách máy.
