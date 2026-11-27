# Lưu video CARLA trên object storage

> **Cập nhật 26/11/2026:** video của run mới được xóa local sau upload thành công và sau commit metadata; nếu upload hoặc transaction lỗi thì giữ lại. Không tự quét/xóa các video cũ.

> **Kiểm chứng bổ sung 26/11/2026:** CARLA thật đã tải video run #2584 và #2586 lên R2; video #2584 đã phát qua giao diện, object #2586 được kiểm tra tồn tại và bản MP4 local đã được xóa. Các ghi chú bên dưới về việc chưa có bucket và chưa kiểm tra browser/CARLA là tình trạng tại thời điểm kiểm thử trước đó. Chưa chứng minh khả năng vận hành nhiều máy hoặc production.

- Giữ video và dữ liệu cũ trên ổ đĩa; chỉ video mới được tải lên bucket S3 riêng tư khi cấu hình.
- Chỉ cấp URL có thời hạn sau khi kiểm tra quyền project và run; frontend phát trực tiếp, local vẫn dùng cách hiện tại.
- Không thay đổi dữ liệu cảm biến, result.json, lõi AEB hoặc danh tính bộ mô phỏng.
- Kiểm chứng upload, cấp URL, cách ly project, fallback local, cấu hình và frontend; ghi rõ giới hạn chạy nhiều máy và vận hành.

## Bằng chứng 26/11/2026

- `CarlaVideoStorageIntegrationTest` chạy riêng với Moto S3 loopback: PUT MP4, tạo URL ký và GET Range 206 đúng byte. Đây là giả lập, chưa chứng minh bucket nhà cung cấp thật.
- Bộ backend `mvnw.cmd -B test`: 1477 test, 0 lỗi, 32 bỏ qua (trong đó test S3 giả lập đã chạy riêng). Sau thay đổi cuối: 47 test video và RepoDocsTest đều đạt.
- Frontend: `npm run lint`, `npx tsc --noEmit`, `npx next build` thành công. Chưa kiểm tra giao diện bằng browser vì backend/DB và CARLA đang tắt; chưa đối chiếu Figma.
- Chưa có bucket thật, chưa kiểm tra upload bằng CARLA thật sau thay đổi. Cách cài đặt và các giới hạn production trong `docs/vehicsim/carla-video-object-storage.md`.
- Đã đọc AGENTS.md, CLAUDE.md, carla-local.md, ADR-043, ADR-055, exec plan baseline thành viên 2 và hướng dẫn đổi tên package. `carla-local.md` còn mô tả phạm vi category cũ; phạm vi hiện hành theo ADR-050 và code.
