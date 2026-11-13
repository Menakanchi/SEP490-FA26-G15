# 01/11/2026 — Sửa các điểm còn lại sau review Reviewer

## Quyết định của người dùng

Giữ recommendation_decisions để nhóm duyệt sau; không áp migration 013 vào DB dev. Không tự đổi ADR-047 sang Accepted, không commit khi chưa có yêu cầu.

## Phạm vi

- Đổi mật khẩu chỉ xoay token, giữ project đang chọn; đăng nhập tài khoản mới/đăng xuất vẫn bỏ lựa chọn cũ.
- Lỗi context giữ dữ liệu tốt gần nhất của role khác, khóa duyệt khi lỗi; Chọn lại project chỉ hiện cho Reviewer còn project có thể chọn.
- Trang chủ báo rõ lỗi số liệu; đóng/mở form báo cáo giữ nháp; nút Nộp báo cáo ở trang chủ mở sẵn form.
- Task gắn project lưu trữ không cập nhật tiến độ, kiểm cả service và câu UPDATE có điều kiện.
- Repository không import service; chuẩn hóa docs/ERD/nhóm bảng và ghi ADR phạm vi Reviewer cùng UC-62/63.

## Kiểm chứng

- Backend `mvnw.cmd -B test`: 430 test, 0 failure/error, 1 parity tùy chọn bỏ qua như trước. Có ca mới cho project discovery độc lập lựa chọn, chỉ Reviewer gọi được, và task project lưu trữ không ghi được. Repository bị cấm import service bằng ArchitectureRulesTest.
- Frontend: lint, TypeScript, build và 3 test Node của API client qua. Test token rotation giữ project cho JSON/POST/tải file, đăng nhập khác và đăng xuất xóa lựa chọn. Sau QA dựng lại artifact theo cấu hình thường.
- API thật với backend :18001, frontend :13000, DB `vehicsim_reviewer_final_20261101` và Redis riêng: migration 013 chạy hai lần idempotent, schema 30 bảng; regression động học PASSED; project không xe vẫn đọc/duyệt; header giữ project khi mặc định đổi; thiếu header/archived từ chối quyết định; lịch sử giữ REQUEST_MORE_TESTS rồi ACCEPT; task archived trả 400, active cập nhật thành công; discovery trả 403 cho Admin, hoạt động khi ID chọn sai, trả rỗng khi không membership.
- UI đăng nhập Reviewer: nút trang chủ mở sẵn form; nhập nháp, đóng/mở giữ nội dung; sửa task two=43, one=62 rồi lưu one giữ two=43 với nút Lưu; task project archived không có điều khiển tiến độ và nút báo cáo disabled. Thu hồi membership của project đang chọn không tự chuyển, có nút chọn lại khi còn project B; bấm nút khôi phục project B. Reviewer không có project không thấy nút chọn lại.
- Tạm đổi tên bảng lịch sử trong DB QA để gây lỗi tải: trang chủ báo lỗi, hai ô quyết định hiện dấu gạch và “không tải được”; đã khôi phục bảng ngay sau kiểm. Khối quyết định gần đây cũng dùng trạng thái lỗi thay cho dấu chờ.
- Ảnh `reviewer-final-qa.jpg` trong thư mục visualization của chat ghi form giữ nháp sau lưu task. Không truy cập được Figma, không tuyên bố đã đối chiếu thiết kế. Nhánh giữ context tốt gần nhất cho role khác khi refresh lỗi được đối chiếu code; không dùng QA để thay đổi dữ liệu dev.
- Đã dọn backend/frontend, DB/user QA và Redis riêng; kiểm read-only DB dev vẫn không có recommendation_decisions. Không restart dịch vụ dev, không commit.

## Hợp đồng và tài liệu

Thêm GET `/api/v1/vehicsim/reviewer/projects` dành riêng REVIEWER, trả `id`, `name`, `workspace_name`, `can_decide`; không cần project đang chọn hợp lệ. Không thêm schema ngoài migration 013 có sẵn. Repository trả mã decision từ DB, service ánh xạ trạng thái nghiệp vụ khi ghi.

Đã cập nhật architecture, ERD, nhóm bảng/từ điển schema, số bảng mục 8 và kế hoạch Reviewer cũ; bổ sung ADR-048 Proposed cho phạm vi membership và ghi UC-62/UC-63 ở trang chủ, duyệt và scope. ADR-047 vẫn Proposed, giữ bảng chờ nhóm duyệt; DB dev chưa áp 012 nên backend nhánh mới chưa được triển khai lên DB đó.
