# Tăng cường bảo mật theo tài liệu người dùng

> Cập nhật 29/11/2026: trạng thái TD-66/67/68 ở cuối tài liệu là thời điểm 28/11. Các thay đổi tiếp theo được ghi ở kế hoạch MFA và [hướng dẫn xác thực](../../vehicsim/auth-security.md).

Ngày 28/11/2026. Phạm vi: giảm rủi ro xác thực, cấu hình mạng mặc định và tính toàn vẹn bằng chứng telemetry; không đổi phân quyền, schema, dữ liệu cũ hay điều khiển AEB.

## Đối chiếu tài liệu

- `How_Cyber_Security_can_be_improved_today.docx`: đào tạo, rà soát lỗ hổng và xác thực mạnh; OTP đăng ký/khôi phục hiện không phải MFA đăng nhập.
- `Innovative_Strategies_for_Enhancing_Cybersecurity_.pdf`: phòng thủ nhiều lớp, zero trust và mô hình phát hiện trong dữ liệu UNSW-NB15. Độ chính xác của nghiên cứu không thể chuyển trực tiếp thành hiệu quả trên VehicSim.
- `3495534.pdf` (Kang & Shen, DOI 10.1145/3495534): mô hình ABS dùng tốc độ bánh, lực phanh và ước lượng ma sát để xét tấn công cảm biến/CAN; hạn chế nêu trong bài là không xử lý tấn công đồng thời hai loại.
- `applsci-09-00082-v2.pdf` (Shin và cộng sự, DOI 10.3390/app9010082): RNN và hợp nhất bốn cảm biến tốc độ bánh, cần dữ liệu huấn luyện và kiểm chứng theo điều kiện xe/đường. Telemetry hiện tại không có bốn tốc độ bánh và thông điệp CAN tương đương; không suy ra xác suất tấn công hay tự hiệu chỉnh dữ liệu/phanh từ các bài này.
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html): tránh ghi OTP/token, giới hạn và làm sạch dữ liệu trong nhật ký. Code hiện tại có `AuditLog` làm sạch giá trị; thay đổi lần này không ghi mã hoặc hash mới vào log.

## Thay đổi và bằng chứng

- OTP: Redis Lua ghi hash kèm TTL, kiểm mã/đếm lỗi/tiêu thụ mã nguyên tử. Tái hiện được mã cũ thành công và xóa mã mới khi hai thao tác xen nhau trên code cũ; test Redis demo xác nhận bản sửa từ chối mã cũ và giữ mã mới. Test khác kiểm thời hạn, giới hạn sai, 16 lần thử sai đồng thời, 16 lần dùng mã đúng đồng thời chỉ một lần thắng và lỗi tách thao tác lưu/TTL.
- Rate limit: tăng bộ đếm và gắn thời hạn nguyên tử; tự khôi phục TTL nếu key cũ thiếu TTL; giá trị lỗi hoặc không nhận được kết quả tăng không cho phép yêu cầu tiếp tục. Key Redis và API vẫn tương thích, không thêm dữ liệu nhạy cảm.
- Telemetry: kiểm frame giảm theo từng actor và chuẩn hóa ID thập phân để phát hiện bản ghi trùng mâu thuẫn; nguồn lỗi bị chặn ở các phép phân tích yêu cầu nguồn đó. Report chứa `FRAME_ID_NON_MONOTONIC` và source ref, không kết luận nguyên nhân hay ghi đè số AEB. Kết quả phân tích cũ được giữ; core fingerprint thay đổi khi phân tích lại.
- Compose: MySQL/Redis mặc định chỉ bind localhost, hỗ trợ `MYSQL_BIND_HOST`/`REDIS_BIND_HOST` cho cấu hình có chủ đích; Redis mẫu không có xác thực. `docker compose config` xác nhận cả mặc định và override. Container hiện có vẫn dùng cấu hình cũ cho đến khi người vận hành thay thế chúng; không tự khởi động lại hoặc xóa volume.
- Kiểm thử trên worktree và MySQL/Redis demo tmpfs tách biệt: `mvnw -B clean test` 1.626 test, 0 lỗi, 59 bỏ qua; 6 test Redis tích hợp đều chạy và đạt. Test phân tích lệch frame đã thất bại trước sửa rồi đạt; `git diff --check` đạt. Scanner mẫu báo 6 dấu `exec` đều là regex hoặc hàm test `ProcessBuilder`, và script inline tĩnh cần tiếp tục xem xét CSP (TD-46), không kết luận từ mẫu quét đơn lẻ.

## Giới hạn và việc còn lại

- TD-66: các lần đăng nhập sai đồng thời từ nhiều IP có thể cùng vượt qua bước đọc hạn mức tài khoản trước khi số lỗi được tăng. TD-67: đăng xuất hiện chỉ xóa JWT ở máy khách. TD-68: chưa có MFA đăng nhập. Các thay đổi này cần thiết kế tương thích phiên và khôi phục tài khoản.
- Không có mô hình RNN, phân loại tấn công CAN/ABS hay bằng chứng xe thật. Thứ tự frame không chứng minh được tấn công. Chưa kiểm thử xâm nhập bên ngoài, S3, CARLA thật hoặc toàn bộ mối đe dọa; không gán trạng thái an toàn chỉ vì không phát hiện bất thường.
- Backend đang chạy chưa tự nạp code vừa sửa. Không thay `.env`, database, volume, tài khoản, project hoặc các thay đổi local khác.

Đã đọc `AGENTS.md`, `CLAUDE.md`, ADR index, hợp đồng chỉ số phân tích, ADR-055, code auth/telemetry và bốn tài liệu người dùng. ADR-055 mô tả định danh radar ở thời điểm chốt, trong khi code hiện hành dùng profile mới hơn; không sửa simulator identity hay kết quả lịch sử.
