# Giới hạn timeout JDBC và thử lại cleanup

Ngày 28/11/2026. Xử lý TD-65: Connector/J mặc định chờ đọc vô hạn; Hikari `connection-timeout` chỉ giới hạn chờ lấy connection từ pool.

- Cấu hình Hikari đặt timeout kết nối 10.000 ms và đọc socket 60.000 ms; hai biến `VSOS_JDBC_CONNECT_TIMEOUT_MS` và `VSOS_JDBC_SOCKET_TIMEOUT_MS` cho phép điều chỉnh. Thuộc tính Hikari ưu tiên hơn tham số cùng tên trong URL JDBC. Đây là timeout cho toàn bộ datasource, không giới hạn tổng thời gian transaction hoặc file I/O. Timeout đọc có thể ảnh hưởng query dài; chọn giá trị theo tải thực tế. Khi phản hồi COMMIT bị mất, phải xác minh trạng thái trước khi thử lại ghi.
- `JdbcTimeoutConfigurationTest`: 2/2 đạt cho mặc định, URL riêng và cấu hình ghi đè; test thất bại trước khi thêm cấu hình. `ProjectCleanupNetworkMysqlTest#mysqlDriverUsesConfiguredTimeouts` đạt trên Connector/J và MySQL thật với URL cố đặt cả hai timeout bằng 0, xác nhận giá trị Hikari có hiệu lực.
- Dùng MySQL 8.4, Redis, network, data root và database demo riêng, không gắn volume người dùng. Khi ngắt Docker network thật với URL không chứa timeout và mặc định ứng dụng, MySQL vẫn có project B và job A trong lúc ngắt; sau timeout, kết nối phục hồi, job được retry và file A được dọn, B giữ nguyên. Toàn test mất mạng tính cả khởi động và phục hồi mất 99,51 giây.
- Bộ MySQL 19/19 đạt với timeout demo rút ngắn, gồm HTTP xóa project với file bị khóa, rollback, mất phản hồi commit qua proxy và bốn ca ghi đồng thời; kiểm tra độc lập xác nhận project A bị xóa, project B, run B và nguồn FA còn, hàng đợi trống. Proxy nhận OK COMMIT rồi ngắt phản hồi, không mô phỏng ngắt mạng vật lý đúng thời điểm commit.
- `mvnw -B clean test` đạt 1.616 test, 59 bỏ qua; datasource và Redis trỏ demo. Các test MySQL opt-in đã chạy riêng như trên. Đã dọn container/network mới và data root của các test thành công. Chưa kiểm S3, NFS hoặc ngắt nguồn vật lý; chưa thử tải thật có query kéo dài hơn 60 giây.
- Còn worktree và data root của lần thử bị ngắt trước đó cùng log: hệ thống tiếp tục từ chối lệnh dọn với `blocked by policy`. Không thay đổi container, volume, tài khoản hoặc dữ liệu hiện có.

Đã đọc `AGENTS.md`, `CLAUDE.md`, hướng dẫn đổi gói, schema và tài liệu database, các kế hoạch cleanup bền vững, mất mạng/mount và kiểm MySQL demo trước đó. `CLAUDE.md` còn mô tả profile CARLA v15 cũ, code hiện hành v16; không thay đổi CARLA.
