# 21/10/2026 — Người 5: tái cấu trúc code theo tầng

Tiếp nối [đợt 2](2026-10-21-nguoi-5-dot-2.md). Mục tiêu: tách SQL khỏi nghiệp vụ, thay payload `Map` bằng record có kiểu, tách lỗi theo
nghiệp vụ và đưa code của màn 5 ra khỏi file dùng chung — **không đổi hành vi**: API, JSON, DB, verdict giữ nguyên.

## Cấu trúc mới

| Tầng | File | Vai trò |
|---|---|---|
| controller | `RegressionController` | 12 route của màn 5 (URL giữ nguyên), chuyển ra từ `VehicSimController` |
| service | `RegressionService` | Tạo test, xem trước, ghép cặp, chốt kết quả khi run xong |
| service | `ReviewDecisionService` | Reviewer Accept / Reject / Request more tests (tách từ `decide`) |
| service | `RegressionReportService` | Gói JSON/CSV, lịch sử quyết định, nguồn candidate |
| service | `RegressionViewService` | Payload các màn danh sách / chi tiết / khuyến nghị (chuyển ra từ `ViewsService`) |
| service | `RegressionSummarizer`, `RegressionCriteria`, `RegressionCodes` | Hàm thuần: so cặp + verdict; tiêu chí + độ tin cậy; mã và trạng thái hiển thị |
| repository | `RegressionRepository` | Toàn bộ SQL của màn 5 (SQL thuần qua `Db`, text block, mỗi thao tác một hàm) |
| dto | `RegressionRequests`, `RegressionResponses`, `RegressionRecords` | Request; response record (`@JsonNaming` snake_case); dòng DB nội bộ |
| exception | `RegressionExceptions` | `InvalidScenarioSetException`, `InvalidCriteriaException`, `InvalidCandidateException`, `TestNotFinishedException`, `DecisionNotAllowedException` — lớp con của `Vs.InvalidRequestException`, vẫn 400 |
| vehicsim | `VehicSimAccess` | Luật role / hạn mức dùng chung cho `VehicSimController` và `RegressionController` |

Không dùng JPA cho repository: phần còn lại của VehicSim dùng `Db`, và màn 5 có cột JSON, `FOR UPDATE`, UPDATE có điều kiện trạng thái.
Bảng của phần khác (aeb_versions, scenarios, run baseline) vẫn trả `Row` vì `RunService.createRuns` nhận `Row`.

## Thay đổi ở file của người khác

- `VehicSimController`: bỏ route màn 5; `userId` / `roleOf` / `requireEngineer` / `limitWrites` / `projectId` giữ tên, chỉ chuyển tiếp
  sang `VehicSimAccess`; `csvCell` thành `public`.
- `ViewsService`: bỏ phần payload regression / khuyến nghị; `families()` vẫn gọi `RegressionService.criticalVariantIds` (đổi import).
- `RunService`: `isCarla`, `seedFor` thành `public`.
- `HardeningTest`: gọi `RegressionCriteria.merge` thay `RegressionService.mergeCriteria`.
- `docs/vehicsim/ke-hoach-sua-theo-pdf-va-quyet-dinh-2026-10-20.md`: sửa đường dẫn link tới `RegressionService` (file đã chuyển;
  `RepoDocsTest` chặn link chết) — chỗ duy nhất sửa dòng tài liệu có sẵn.
- Nhánh tối ưu (MOBO) gọi `RegressionService.createTest`: chữ ký giữ nguyên, khi merge chỉ cần đổi import sang `com.vehicsim.service`.

## Kiểm chứng

- `.\mvnw.cmd -B clean test` (JDK 21): 161 test, 0 lỗi. Test mới: `RegressionRepositoryTest` (10), `RegressionJsonShapeTest` (4).
  `RegressionDecisionTest`, `RegressionPairingTest`, `RegressionReportServiceTest` chuyển sang gói `com.vehicsim.service`, giữ tên test
  mà tài liệu nhắc tới; test quyết định / gói xuất mock `RegressionRepository`, test ghép cặp dùng repository thật trên `Db` giả
  (luật ghép cặp nằm trong SQL).
- So phản hồi API trước / sau trên MySQL local (backend thật, bộ động học): 28 phản hồi — danh sách, chi tiết RT-001/006/007, xem trước
  (thường / chọn tay / danh sách biến thể), khuyến nghị, gói JSON/CSV, lịch sử, `/families`, `/context` và các lỗi 400 / 403 / 404 —
  **giống hệt**, so cả kiểu số (bỏ `exported_at`).
- Tạo RT-008 bằng code mới (`variant_ids` [7, 8]): chạy xong, PASSED, ghi 2 cặp và khuyến nghị MEDIUM; `pass_criteria_json` cùng khoá
  với RT-007 tạo bằng code cũ.
- Không đổi frontend, worker hay schema nên không chạy lại cổng frontend / worker cho bước này.

## Sửa lỗi sau khi tái cấu trúc (bước riêng)

Danh sách khuyến nghị hiện "Bị chặn" cho khuyến nghị của test trượt kể cả khi Reviewer đã quyết định (REC-006 đã Reject vẫn ghi
BLOCKED, ô đếm "Từ chối" = 0). `RegressionCodes.recommendationStatus` nay hiện quyết định đã có trước; chỉ chưa ai quyết định mà test
trượt mới là BLOCKED. Máy kiểm `RegressionCodesTest` (5 test). Backend: 166 test, 0 lỗi. Trên API thật chỉ REC-006 đổi
`BLOCKED` → `REJECT` (`Blocked` → `Rejected`); các khác biệt khác của lần so sau là do RT-008 vừa tạo để kiểm.

## Nhật ký

- 21/10/2026: người dùng chọn xếp theo tầng (không gói `regression/` riêng, không thư mục con), tách `RegressionController` + `VehicSimAccess`.
  Lỗi hiển thị "Bị chặn" của khuyến nghị đã có quyết định làm thành bước riêng sau khi so trước/sau xong.
