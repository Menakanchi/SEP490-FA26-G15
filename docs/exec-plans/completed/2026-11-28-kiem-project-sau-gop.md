# Kiểm thử project sau khi gộp

Ngày 28/11/2026. Kiểm bản sau merge `main-chuvvV1` bằng Spring Boot, HTTP/JWT, schema đầy đủ, MySQL 8.4, Redis và data root demo cách ly. Không dùng database, Redis, tài khoản hoặc file hiện có.

- `ProjectDeleteHttpMysqlTest`: thiếu marker `runs` trả 409 và giữ project/file. Khi file run A bị khóa thật trên Windows, DELETE trả 200 với ID chưa dọn; project A đã xóa, job còn. Mở khóa, scheduler tự retry và dọn job/file. Project B, run B, nguồn `fa_json_sources` và file B còn nguyên. Dữ liệu CARLA là fixture, không phải lượt mô phỏng thực.
- `EngineerProjectPermissionsMysqlTest`: kỹ sư thành viên thấy và chọn được project workspace; outsider không thấy hoặc vào được. Kỹ sư tạo project workspace nhưng PATCH, archive, DELETE và adopt đều bị từ chối, kể cả với project mình tạo. Project cá nhân cũ chỉ xem, không xóa; bốn project demo còn nguyên.
- Mỗi test HTTP đạt 1/1 trên MySQL và Redis demo riêng; test chỉ bật khi cung cấp URL loopback và database demo rỗng, cùng cổng Redis demo. Test xóa khóa file chỉ chạy trên Windows. Container, volume và data root demo đã dọn. `mvnw -B test` đạt 1603 test, 58 bỏ qua (bao gồm hai test demo khi không đặt biến môi trường).
- Chính sách S3 và schema không đổi. Chưa kiểm thử bucket thật, ngắt nguồn, CARLA thật hoặc giao diện trực tiếp; giới hạn mount của `2026-11-28-project-cleanup-network-mount.md` vẫn áp dụng.

Đã đọc `AGENTS.md`, `CLAUDE.md`, ADR-064 và các kế hoạch dọn project/mất mạng trước đó. `CLAUDE.md` còn mô tả profile CARLA v15 cũ, trong khi code hiện hành v16; công việc này không đổi CARLA.
