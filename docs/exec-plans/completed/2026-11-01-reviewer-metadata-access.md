# 01/11/2026 — Sửa metadata và quyền Reviewer

## Phạm vi và nghiệm thu

- Reviewer chỉ tải context, preview và bằng chứng của project trong workspace mình còn là thành viên; chọn được project khác của mình.
- Role khác giữ cơ chế project mặc định (TD-30). Header chọn project không cấp thêm quyền.
- Workspace/project lưu trữ được đọc lịch sử nhưng không ra quyết định; UI dùng trạng thái từ backend.
- Mỗi lần quyết định có bản ghi lịch sử riêng, cùng transaction với baseline/candidate và trạng thái khuyến nghị.
- Migration bổ sung, giữ dữ liệu cũ; chỉ nhập quyết định gần nhất còn trong DB, không dựng lại lịch sử đã mất.

## Thực hiện

1. Sửa chọn project và kiểm quyền tại điểm dùng chung; thêm test ngoài workspace, chọn project và metadata.
2. Thêm bảng lịch sử, migration 013 và kiểm trạng thái workspace/project trong transaction duyệt.
3. Thêm chọn project Reviewer, dùng quyền đọc/ghi backend và khóa ổn định cho từng dòng lịch sử.
4. Chạy backend test, lint, TypeScript, build; kiểm migration và UI bằng dữ liệu QA riêng nếu môi trường cho phép.

## Triển khai và rollback

Dừng backend trước khi chạy migration 013 trên DB hiện hữu đã sao lưu, rồi khởi động code mới; không chạy migration lịch sử trên DB mới tạo từ schema hiện tại.
Rollback ứng dụng giữ nguyên bảng lịch sử, không xóa bản ghi. Khi nâng lại sau rollback, chạy lại phần backfill idempotent để giữ quyết định mới nhất mà code cũ đã ghi.
Không hỗ trợ chạy đồng thời backend cũ/mới trong cửa sổ migration; không tự áp migration vào DB của thành viên khác.

## Bằng chứng hoàn tất

- `mvnw.cmd -B test`: 424 test, 0 failure/error, 1 skip (bộ parity đầy đủ vốn opt-in). `RepoDocsTest` chạy lại sau cập nhật tài liệu: 5/5 pass.
- Frontend: `npm run lint`, `npx tsc --noEmit`, `npx next build` pass. Build QA dùng API :18001; đây chỉ là cấu hình tiến trình kiểm thử.
- MySQL QA riêng `vehicsim_reviewer_qa_20261101`, backend :18001, Redis QA :16379, frontend :13000; không áp migration vào DB dev `vehicsim`.
- API thật: Reviewer chỉ thuộc workspace B nhận context project 2 dù project 1 là mặc định toàn cục; header project ngoài workspace và Reviewer không có membership nhận 404; header sai định dạng 400; preview và bundle ngoài scope nhận 404. Role Admin vẫn dùng project mặc định.
- Dựng hai biến thể và chạy regression bằng bộ động học thật. Reviewer chưa có membership bị chặn quyết định; thêm membership QA rồi REQUEST_MORE_TESTS → ACCEPT giữ hai event riêng, cùng test, ID riêng và tên chụp lúc quyết định.
- Workspace lưu trữ giữ context / lịch sử, `reviewer_can_decide=false`; POST quyết định trả 400. Migration chạy lại không trùng event; snapshot cũ giữ `confirmed=NULL`, có nhãn LEGACY_SNAPSHOT; đổi tên tài khoản không đổi tên đã chụp.
- Cố ý làm UPDATE khuyến nghị lỗi trong DB QA: API 500 và transaction rollback cả event mới lẫn thay đổi baseline/candidate. Trigger QA được gỡ ngay sau kiểm.
- UI IAB: đăng nhập Reviewer QA, đổi giữa project B và project 1 lưu trữ, thấy dữ liệu đổi đúng; lịch sử hiện đủ yêu cầu thêm test và Accept; không báo nhầm mất membership. Bảng lịch sử cuộn ngang ở cửa sổ nhỏ để đọc lý do. Console không có error.
- Ảnh bằng chứng ở thư mục visualization của chat: `reviewer-history-qa.jpg`. Không có nguồn Figma truy cập được trong phiên nên chưa đối chiếu Figma; không tuyên bố khớp thiết kế.

## Hợp đồng và giới hạn

Context thêm `reviewer_projects` và `reviewer_can_decide`; client gửi `X-VehicSim-Project` cho JSON và tải file, cache GET phân biệt project. Chọn project bỏ dữ liệu màn trước; lựa chọn cũ bị thu hồi được bỏ để tải lại project còn quyền. Quyền ghi được kiểm lại dưới khoá trong transaction.

`GET /decisions` trả từng event với `id`, `reviewed_by_user_id`, `source`; key React dùng event ID. Trạng thái mới nhất vẫn ở `engineering_recommendations`, đảm bảo các màn chi tiết giữ hợp đồng cũ. Bảng mới `recommendation_decisions` giữ thêm tên người duyệt, lý do, điều kiện, xác nhận và nguồn snapshot.

REQUEST_MORE_TESTS vẫn là trạng thái mở như trước; không bổ sung luật bắt buộc chạy test mới trước lần quyết định sau. Cách ly các role khác và project cá nhân vẫn là TD-30. Lịch sử đã bị ghi đè trước migration không thể khôi phục.

Trước khi chạy code mới trên DB hiện hữu: dừng backend, sao lưu và chạy migration 013. Schema mới đã gồm bảng lịch sử, không chạy lại toàn bộ migration lịch sử trên DB mới.



## Review bổ sung

Review sau đó phát hiện context/xe bị dùng để kiểm membership và frontend chưa chốt mặc định. Các điểm này đã được xử lý tiếp ở [kế hoạch follow-up](2026-11-01-reviewer-scope-followup.md); bằng chứng ban đầu phía trên không bao phủ hai ca đó. Bảng lịch sử thuộc [ADR-047 Proposed](../../adr/ADR-047-lich-su-quyet-dinh-reviewer.md), chờ nhóm chốt, không phải quyết định đã Accepted.
