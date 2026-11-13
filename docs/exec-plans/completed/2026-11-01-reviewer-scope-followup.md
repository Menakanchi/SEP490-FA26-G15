# 01/11/2026 — Sửa tiếp Reviewer sau review

## Phạm vi

- Tách việc xác định project HTTP khỏi Queries; resolve một lần mỗi request, không dựng context/xe chỉ để kiểm quyền.
- Bỏ canSee kiểm membership lần hai. Thread/job ngoài HTTP không được âm thầm chọn project mặc định.
- Frontend chốt project từ context trước khi tải màn; luôn gửi project đó, không tự chuyển khi refresh lỗi. Quyết định cần project tường minh.
- Giữ bản nháp task khác khi lưu; chặn Báo cáo cho project lưu trữ; tên người nộp báo cáo null/rỗng có chữ thay thế.
- Sửa vị trí bảng lịch sử trong schema; ghi đề xuất ADR chờ nhóm, không áp migration 013 vào DB dev.

## Kiểm chứng

Chạy test liên quan trước/sau, thêm ca project chưa có xe và project bị lưu trữ giữa các request; kiểm hai task còn nháp trên UI. Chạy các cổng backend/frontend bị ảnh hưởng và ghi giới hạn Figma. Các test DB chỉ dùng môi trường QA riêng.

## Quyết định còn chờ

Giữ hay bỏ recommendation_decisions do nhóm chốt; ADR-036/038 hiện ghi Proposed trong repo. Không đổi trạng thái ADR cũ, không tự coi đề xuất mới là Accepted và không chạy migration vào DB dev.


## Kết quả

- 41 test liên quan trước sửa pass. Sau sửa: toàn bộ backend 427 test, 0 failure/error, 1 skip (parity đầy đủ opt-in); 60 test tập trung đã pass trước cổng toàn bộ.
- Thêm test project không có xe; cache resolve đúng một lần/request; project được chốt không đổi khi mặc định đổi; POST không chốt project bị từ chối; repository không import HTTP/security; thông báo tên null/rỗng có thay thế.
- Frontend lint, TypeScript và build pass; `node --test tests/reviewer-project.test.mjs`: 2/2 pass (JSON/POST/download giữ header, lỗi refresh không làm mất lựa chọn, storage bị chặn vẫn giữ ID trong bộ nhớ).
- API thật trên DB/Redis QA riêng: regression động học PASSED; xóa lựa chọn xe của project sau run vẫn tải context/list/detail và duyệt REQUEST_MORE_TESTS → ACCEPT được. Lưu trữ workspace làm mặc định chuyển sang project 2 nhưng header project 1 vẫn giữ project 1, chặn ghi đúng; POST thiếu header trả 400. Project lưu trữ bị loại khỏi danh sách nộp báo cáo.
- UI đăng nhập QA: thấy project không có xe; sửa task one=60 và task two=70, lưu one thì two vẫn 70 với nút Lưu. DB kiểm one=60, two=20 để xác nhận two vẫn là nháp. Báo cáo của task project lưu trữ bị disabled.
- Reload sau khi workspace 1 lưu trữ vẫn chọn project 1; khi thu hồi membership project 1, UI hiện lỗi và Chọn lại project, không tự nhảy sang project 2. Bấm Chọn lại mới chuyển sang project 2. Ảnh `reviewer-task-drafts-qa.jpg` trong visualization của chat. Không truy cập được Figma để đối chiếu.
- Migration 013 chỉ chạy trên DB QA riêng, không áp DB dev. ADR-047 Proposed để nhóm chốt giữ/bỏ bảng; bảng đã chuyển về đúng nhóm regression trong schema.

## Hợp đồng thay đổi

Các view/service HTTP nhận ProjectAccess qua constructor; Queries trở lại chỉ truy vấn dữ liệu. Trạng thái chọn project có phạm vi request và dùng lại trong toàn request. Ngoài request HTTP, proxy không hoạt động; không có đường fallback ngầm cho job.

Frontend chờ context trước khi mount các màn, giữ ID cho đến khi người dùng chọn lại; nút Chọn lại là thao tác tường minh. Lưu task chỉ cập nhật dòng trả về, bỏ đúng nháp đã gửi, giữ nháp sửa tiếp và nháp task khác. Không thay schema/API của task/báo cáo.

Môi trường QA (backend/frontend, DB, tài khoản DB và Redis riêng) đã dọn sau kiểm. Các dịch vụ và DB dev giữ nguyên. Artifact build frontend được dựng lại theo cấu hình thường sau QA.
