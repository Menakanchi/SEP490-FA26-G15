# 02/11/2026 — Reviewer chạy regression để kiểm tra

## Yêu cầu và phạm vi

Người dùng chốt Reviewer được đọc, duyệt và chạy regression để kiểm tra candidate. Mở riêng quyền tạo regression trong project thuộc workspace mình còn là thành viên; không mở quyền sửa kịch bản, tạo candidate hay chạy baseline độc lập. Giữ luật không tự duyệt, lý do/xác nhận, test PASSED và baseline hiện hành khi Accept.

## Thực hiện

1. Tái hiện POST regression của Reviewer bị 403 bằng kiểm thử quyền.
2. Dùng cùng RegressionService/RunService, kiểm project tường minh và membership/trạng thái ACTIVE trong transaction tạo test; giữ hạn mức.
3. Mở nút/form regression qua quyền riêng ở frontend; cập nhật ADR và hướng dẫn hiện hành.
4. Chạy kiểm thử quyền, nghiệp vụ, frontend và kiểm tra app trên dữ liệu QA tách biệt. Ghi rõ giới hạn Figma nếu không truy cập được thiết kế.

## Nghiệm thu

- Reviewer tạo regression được trong project ACTIVE/workspace ACTIVE của mình, với header project tường minh.
- Ngoài phạm vi, thiếu header, project/workspace lưu trữ hoặc vượt hạn mức thì không tạo/chạy test.
- Reviewer vẫn bị chặn ghi kịch bản/candidate/baseline độc lập; Manager không được chạy regression.
- Người tạo khuyến nghị không tự duyệt được, kể cả Reviewer tạo regression.
- Không đổi schema, không áp migration 013 hay sửa DB dev.

## Bằng chứng

- Trước sửa: test HTTP mới mong đợi 201 nhưng Reviewer nhận 403.
- Sau sửa: 48 test tập trung (quyền, scope, ghép cặp, duyệt) qua. `mvnw.cmd -B test`: 434 test, 0 failure/error, 1 parity tùy chọn bỏ qua; gồm RepoDocsTest và ArchitectureRulesTest.
- TypeScript và lint các file frontend đã đổi qua; `next build` qua trên bản sao 103 file frontend tracked cùng lockfile, cấu hình API QA. Phiên Next dev đang có của người dùng không bị dừng.
- QA dùng database `vehicsim_reviewer_run_58a7edeb`, user/Redis riêng và backend :18002; không áp migration 013 hoặc thay dữ liệu DB dev. API thật kiểm 9 trường hợp: thiếu header 400, ngoài membership 404, Manager 403, project/workspace lưu trữ 400, Reviewer chạy động học PASSED, cùng seed/xe/simulator, không mở baseline/candidate độc lập, chặn tự duyệt và Reviewer khác Accept với lịch sử được lưu.
- UI tại :13002: đăng nhập QA Runner (REVIEWER), bấm nút chạy từ trang chủ, mở form có nút chạy và cảnh báo không tự duyệt, tạo RT-002 và nhận Đạt. Ảnh `reviewer-regression-passed.jpg` lưu trong thư mục visualization của chat. Chưa đối chiếu Figma; dùng lại các thành phần UI hiện có.
- `npm run lint` toàn frontend và 3 test Node của API client qua. Backend, Redis, database/user QA đã dọn; phiên dev có sẵn vẫn chạy. Công cụ kiểm duyệt chặn xóa thư mục tạm `vsos-reviewer-run-58a7edeb` (`blocked by policy`), nên thư mục frontend/build QA còn trong TEMP; bằng chứng API/ảnh đã lưu riêng.

## Bàn giao

API giữ nguyên endpoint/body; thêm quyền riêng `requireRegressionRunner` / `canRunRegression` và đường vào service kiểm scope trong transaction. Quyết định quyền ghi ở ADR-049; các chặn duyệt không thay đổi. Không có schema/migration mới. Kết quả Pareto và bảng công việc chung workspace từ lượt review trước nằm ngoài thay đổi quyền chạy regression này.
