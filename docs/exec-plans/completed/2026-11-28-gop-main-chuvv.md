# Gộp main-chuvvV1 vào trungdam

Ngày 28/11/2026, gộp `origin/main-chuvvV1` tại `dc21bd58` vào `trungdam` tại `5c468a66`. Hai nhánh gộp sạch bằng Git; thay đổi local được gộp thử riêng để giữ lại mà không đưa vào commit.

- Đối chiếu thủ công quyền xóa project, dọn `fa_json_*`, transaction/khóa, hàng đợi retry và hai marker; giữ các sửa của `trungdam`. Danh sách project kỹ sư theo membership workspace từ nhánh mới được giữ, phù hợp ADR-064.
- Test Failure Analysis MySQL thất bại vì các test trước giữ thêm run và báo cáo partial trong collection fixture. Cách ly các bản ghi fixture trong test explorer; không đổi ngân sách đầu vào hoặc code nghiệp vụ. Chạy lại đạt 12/12 trên MySQL demo. `MainFlowMysqlTest` đạt 1/1 với MySQL và Redis demo; container và volume thử nghiệm đã dọn.
- Backend `mvnw -B test` đạt 1581 test, 56 bỏ qua; frontend lint, TypeScript, build và `npm audit --omit=dev --audit-level=high` đạt. Node trên máy là 24, khác Node 22 của CI. Fixture browser cho scenario delete, MOBO và analysis results đạt; cập nhật một assertion để khớp câu chữ đã đổi trong code nhánh mới. Không thao tác dữ liệu backend thật hoặc CARLA.
- Bản thử gộp thay đổi local giải quyết tám file trùng, qua lint và TypeScript. @Browser và đối chiếu Figma không được kiểm chứng trong lượt này; các fixture browser dùng dữ liệu giả.

Đã đọc AGENTS.md, CLAUDE.md, frontend/AGENTS.md, ADR-064, tài liệu schema và kế hoạch dọn project trước đó. `CLAUDE.md` có mô tả profile CARLA v15 cũ, còn code hiện hành v16; không đổi CARLA.
