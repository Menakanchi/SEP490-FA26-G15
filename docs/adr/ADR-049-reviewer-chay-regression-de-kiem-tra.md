# ADR-049 — Reviewer được chạy regression để kiểm tra candidate

**Trạng thái:** Accepted 02/11/2026 — theo quyết định trực tiếp của người dùng: Reviewer được đọc, duyệt và chạy regression để kiểm tra.
**Thay thế một phần:** quyền REVIEWER không chạy mô phỏng trong [ADR-035](ADR-035-nam-role-he-thong-bo-cau-hinh-xe-va-meomeo.md); bổ sung quyền chạy regression cho phạm vi workspace của [ADR-048](ADR-048-pham-vi-workspace-reviewer.md).

## Bối cảnh

UC-59 cho Reviewer cấu hình/chạy regression, nhưng backend và frontend trước đây chỉ cho ADMIN/ENGINEER/EXPERIENCER tạo test. Reviewer cần tự chạy kiểm tra một candidate trước khi đưa ra nhận định.

## Quyết định

- Reviewer được tạo/chạy regression bằng cùng POST `/api/v1/vehicsim/regression`, RegressionService và RunService hiện có; không có cơ chế mô phỏng/chấm điểm riêng.
- Reviewer bắt buộc chọn project tường minh qua `X-VehicSim-Project`. Project phải thuộc workspace mình còn membership; project và workspace đều ACTIVE. Kiểm và giữ khoá membership/trạng thái trong transaction tạo test và run.
- Giữ `limitWrites` và hạn mức run đang hoạt động. Regression vẫn ghép cùng biến thể, xe, simulator và seed; baseline còn thiếu được chạy như một phần của test.
- Quyền này không mở tạo/sửa kịch bản, tạo candidate, tối ưu hay chạy baseline độc lập. Manager vẫn chỉ đọc phần kỹ thuật.
- Giữ toàn bộ điều kiện duyệt: không tự duyệt khuyến nghị do mình tạo, lý do/xác nhận, test PASSED và baseline hiện hành khi Accept. Vì người tạo regression cũng là người tạo khuyến nghị, test do Reviewer chạy phải do Reviewer khác duyệt.

## Hệ quả và kiểm chứng

Frontend có quyền riêng `canRunRegression`, dùng ở trang chủ Reviewer, danh sách và form tạo test; `canWrite` không thay đổi. Project/workspace lưu trữ chỉ đọc. Không đổi schema hoặc áp migration 013 vào DB dev.

`VehicSimSecurityTest#reviewerCanRunRegressionWithoutGainingScenarioOrCandidateWrites`, `VehicSimSecurityTest#reviewerRegressionRequiresAnExplicitProjectAndHonoursWriteQuota` kiểm role/header/hạn mức; `RegressionPairingTest#reviewerRegressionUsesTheSamePairingAndDispatchAfterCheckingActiveMembership`, `RegressionPairingTest#reviewerRegressionCannotStartWithoutMembershipOrInArchivedProjectsAndWorkspaces` kiểm phạm vi và dùng chung cơ chế chạy. Luật không tự duyệt tiếp tục được giữ bởi `RegressionDecisionTest#theAuthorOfTheRecommendationCannotApproveIt`.
