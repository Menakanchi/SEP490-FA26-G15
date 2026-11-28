# Dọn file bền vững khi xóa project

Ngày 28/11/2026. Mục tiêu: giữ công việc dọn file local khi commit thành công nhưng mất phản hồi, và bảo vệ kiểm tra trạng thái project trước ghi đồng thời.

- Ghi công việc dọn từng run cùng transaction xóa project. Worker thử lại khi khởi động và mỗi 30 giây, giữ công việc nếu file hoặc xác nhận DB lỗi. Marker data root và binding DB được kiểm trước và sau thao tác file; thiếu hoặc lệch thì không dọn.
- Khóa project, kiểm lại quyền và tên xác nhận, khóa các run, optimization và regression rồi kiểm trạng thái trước xóa. Transaction rollback cũng hủy các công việc dọn tương ứng.
- Migration 026 và hướng dẫn gắn storage trong `docs/vehicsim/database-schema.md` phải được thực hiện trên DB hiện có trước khi xóa project có run. Người vận hành xác minh mount và dành root riêng cho từng DB. Không tự áp migration hay thay đổi dữ liệu đang dùng. Chính sách giữ object S3 không đổi.
- MySQL 8.4 và filesystem demo: bộ kiểm 12/12 và kiểm cleanup mở rộng 7/7 đạt, gồm mất phản hồi sau commit, rollback, file bị khóa, marker thiếu/lệch/mất giữa chừng, run ID tái xuất hiện, hai worker và lỗi commit sau dọn file. Test hai kết nối kiểm ghi trước/sau khóa, cập nhật trạng thái và đổi tên/chủ, đồng thời giữ project khác. Migration được chạy hai lần trên DB demo; container, volume và thư mục demo đã được dọn.
- `mvnw -B test` đạt 1596 test, 52 bỏ qua; fixture UI bốn nhánh đạt ở 320 px; typecheck, ESLint và `git diff --check` đạt. Đây là fault injection, không phải ngắt mạng hoặc tháo mount thật.
- Giới hạn: phải xác minh data root thực sự chứa các run cũ; mount mất rồi phục hồi giữa hai lần kiểm chưa được loại trừ hoàn toàn. Khóa khoảng ID khi dọn có thể làm insert run khác chờ nếu cùng khoảng khóa. @Browser không khả dụng để chụp màn hình hoặc đối chiếu Figma.

Đã đọc `AGENTS.md`, `CLAUDE.md`, hướng dẫn đổi gói và quy tắc đặt tên, schema và tài liệu database, ADR index, exec plan, tech-debt và hướng dẫn lưu video CARLA. `CLAUDE.md` còn mô tả profile CARLA v15 cũ, trong khi code hiện hành v16; việc này không thay đổi profile.
