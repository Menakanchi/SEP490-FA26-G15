# Kiểm tra UI xóa project và quyền kỹ sư

Ngày 28/11/2026. Đã kiểm tra trực tiếp bằng @Browser trên desktop 1440 px và mobile 320 px với frontend, backend, MySQL, Redis, tài khoản và data root demo cách ly.

- Kỹ sư vào thẳng cài đặt project cá nhân cũ: trước sửa vẫn thấy form và nút xóa dù API cấm. Sau sửa trang chỉ hiển thị thông tin và lý do chỉ xem; không đổi quyền backend.
- Chủ project xóa hai project demo khi file run bị khóa: thông báo desktop/mobile hiển thị đúng ID đang chờ retry. Sau khi mở khóa, scheduler tự dọn hai job/thư mục; project đối chứng, run, nguồn FA JSON và file còn nguyên. Xóa project rỗng cuối cùng qua mobile cho thấy thông báo thành công vẫn hiện trên Welcome.
- Làm rõ file cục bộ được dọn và video lưu ngoài vẫn được giữ theo chính sách; bảo đảm tên dài không gây tràn breadcrumb, ngữ cảnh, thẻ nhóm, form tìm kiếm hoặc hộp xác nhận. Giữ thông báo khi xóa project cuối.
- Fixture API trên bản HEAD sạch cộng các hunk dự kiến commit đạt 12/12 ở 320/1440 px: busy, partial, success, tên dài, engineer và engineer tên dài; bộ xóa cũ đạt 4/4 (mất mạng, 503, 409, partial). Frontend lint, TypeScript, build và RepoDocsTest đạt; detector Impeccable không báo lỗi. Backend thực dùng dữ liệu fixture, không chạy CARLA hay bucket S3 thật; chưa đối chiếu Figma.
- Đã dừng frontend/backend và xóa container, volume MySQL/Redis cùng tài khoản demo. **Còn cần dọn:** thư mục file demo và worktree thử nghiệm; hệ thống tự động từ chối lệnh xóa với `blocked by policy`. Không xóa vòng bằng cách khác. Dữ liệu đang dùng và thay đổi local được giữ.

Đã đọc AGENTS.md, CLAUDE.md, frontend/AGENTS.md, ADR-064, tài liệu dọn project và lưu video. `CLAUDE.md` còn profile CARLA v15 cũ trong khi code hiện hành v16; không thay đổi CARLA.
