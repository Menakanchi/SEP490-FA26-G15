# Hoàn thiện phần 3 — báo cáo và bàn giao 22/10/2026

Trạng thái: hoàn thành chức năng theo hợp đồng legacy đã được người dùng chốt.
Giới hạn: chưa chạy CARLA/đối chiếu Figma; DB có sẵn trên máy không được truy cập/sửa.
Kiểm thử DB dùng MySQL 8.0.46 và Redis riêng do phiên làm việc tạo.

## Quyết định có hiệu lực

Người dùng chọn giữ công thức ADR-040, chuẩn hóa tổng hợp và truy xuất.
Không đổi AebStack/Simulator, bộ lọc/pha phanh/impact lịch sử, không sửa runner/worker/MOBO/RegressionService.
Không tự khởi chạy tối ưu, tạo candidate hoặc quyết định Reviewer.

## Audit trước thay đổi
- Snapshot v1 lưu được nhưng cho bàn giao cả NOT_RUN; thiếu chia tập và guard hợp lệ.
- Dashboard chỉ đếm ca lỗi; KPI chưa theo hết bộ lọc.
- Có chi tiết/playback, thiếu cursor chung, nguồn jerk và bằng chứng cho từng nhận định.
- Bộ động học và số sensor tính lại có cửa sổ/nguồn khác nhau, chưa có mô tả hợp đồng rõ.
- Màn kịch bản chỉ link Failures khi có lỗi, không truyền scenario_id.
- Kế thừa thay đổi chưa commit từ đợt trước, không reset/ghi đè thay đổi ngoài phạm vi.

## Checklist chức năng

| Mục | Trạng thái | Kết quả |
|---|---|---|
| Dashboard baseline | DONE | Mọi trạng thái, KPI cùng scope, lọc họ/variant/baseline/xe/simulator/môi trường/khâu lỗi/trạng thái, phân trang. |
| Chi tiết | DONE | Run/seed/xe/AEB/simulator, chỉ số có đơn vị, jerk dẫn xuất, cự ly tới vạch, metadata và run kỹ thuật chưa có kết quả. |
| Playback/nguyên nhân | DONE | Phát/dừng/tua, cursor chung với chart; bằng chứng từng khâu và nhãn giả thuyết theo luật. |
| Bộ chỉ số | DONE theo lựa chọn legacy | AnalysisMetrics JDK-only dùng chung, version adr040-stored-aggregation/1, NULL/NOT_APPLICABLE/missing tách khỏi zero objective. |
| Dataset | DONE | v2 chia hai tập không trùng variant, giữ safe, nhiều seed khác nhau, cấm lặp variant/seed, khóa identity và revision/digest. |
| Bàn giao 2→3→4 | DONE | Link scenario_id kể cả họ an toàn; chốt dataset_id, revalidate trước chuyển và tại /aeb. |
| Protocol CARLA mới | NOT DONE / ngoài quyết định lần này | Nguồn gia tốc, phaseless Butterworth, impact vector còn mở, TD-51. |
| Kiểm chứng CARLA/Figma | BLOCKED bởi môi trường | CARLA không lắng nghe cổng 2000; chưa có kênh truy cập thiết kế Figma. |

## Hợp đồng và API

Chi tiết: [hợp đồng chỉ số](../../vehicsim/analysis-metrics-contract.md).
- GET /analysis/runs: KPI/items/objective groups cùng bộ lọc; không tải telemetry toàn bảng.
- GET /analysis/runs/{id}: trạng thái run và detail; không sinh kết quả AEB cho run kỹ thuật.
- POST /analysis/selections: hai tập + run_revisions; role ghi và limitWrites.
- GET /analysis/datasets/{id}: archive bất biến.
- GET /analysis/datasets/{id}/handoff: baseline hiện tại, identity, source và digest artifact/config.
- v1 vẫn đọc/lưu archive được; handoff yêu cầu v2 hợp lệ.
- UI giữ tab tra cứu ca lỗi/CSV cũ. Sửa tối thiểu link frontend/scenarios; không sửa cơ chế chạy của người 2.

## Database

- Vẫn 29 bảng; thêm loại BASELINE_DATASET trong migration 009 từ đợt 1.
- Không sửa migration 009 sau khi áp trong DB test; v2 dùng JSON hiện có nên không thêm migration mới.
- Đã nạp schema với enum trước 009, áp 009 thành công, kiểm enum và 29 bảng.
- Đã ghi/đọc snapshot qua backend thật, chạy lại baseline mà tập cũ giữ nguyên run/seed.
- DB mysql-container có sẵn từ chối kết nối root không mật khẩu; không đọc mật khẩu, không chỉnh DB này.
- MySQL/Redis test cô lập tên vehicsim-analysis-*-test, cổng 13316/16380; dữ liệu chỉ là tài khoản test-domain.
- Không có DROP/TRUNCATE/reset DB có sẵn. Các thay đổi fixture kỹ thuật chỉ diễn ra trong DB test.

## Kiểm chứng thực tế

- mvnw.cmd -B clean test: 252 test qua, 1 bỏ qua parity mở rộng.
- Sau bổ sung hai test handoff: mvnw.cmd -B test: 254 test, 0 lỗi, 1 bỏ qua.
- npm.cmd run lint: sạch. npx.cmd tsc --noEmit: qua. npm.cmd run build: qua.
- Audit production đã chạy trong phiên: 0 lỗ hổng; package.json/package-lock.json không đổi.
- python scripts/test_analysis_integration.py: PASS trên backend :8101/MySQL riêng.
  18 baseline chạy qua lõi Java thật: 11 SAFE, 2 COLLISION, 1 FALSE_BRAKING, 2 NEAR_MISS, 2 TIMEOUT.
  Kiểm metric từ số đo lưu, seed/snapshot sau run mới, revision cũ, duplicate variant/seed,
  chuỗi nguyên nhân collision, nguồn thiếu artifact và lifecycle fixture riêng.
- node tests/analysis-ui-smoke.mjs: PASS trên Edge headless, đăng nhập backend thật, không mock API.
  Kiểm chọn họ từ màn 2, KPI/bộ lọc, lựa chọn qua trang, chốt và bàn giao ID,
  jerk/bằng chứng, seek/play/pause và cursor chung. Không có request tự tạo candidate/optimizer.
- Ảnh đã xem: data/analysis-integration/ui/ (gitignored), gồm dashboard, handoff, detail và playback.
- Bằng chứng máy đọc: data/analysis-integration/evidence.json, sample-playback.json, mysql-snapshot.json.
  Đây là mô phỏng động học thực thi thật và fixture lỗi có nhãn, không phải thử xe vật lý/CARLA.
- Không báo PASS cho CARLA/Figma hay DB cá nhân chưa kiểm chứng.

## Phụ thuộc và giới hạn
- Người 2: sensor/GT, physics hiệu chuẩn, hành vi dừng ở lề và protocol mới nếu tiếp tục.
- Người 4: tiêu thụ optimization_run_ids + evaluation, gọi runner chung; không suy ra Pareto từ dataset.
- Người 5: tiêu thụ validation_run_ids, seed và identity; nối RegressionService theo hợp đồng khi làm phần 5.
- Phần 4/5 thống nhất ràng buộc TD-48; không tự đổi 5 điểm % thành 0,5 điểm % hoặc ngược lại.
- Dataset legacy có thể thiếu physics thực trong artifact; giữ NULL/source ID, không bịa số đo.
- Hệ thống vẫn dùng project chung theo TD-30; không tuyên bố cách ly workspace đã hoàn thiện.

## Danh sách file làm việc

Danh sách tổng hợp phần kế thừa và phần hoàn thiện; chưa tạo commit.
- [AGENTS.md](../../../AGENTS.md)
- [database/mysql/01_schema.sql](../../../database/mysql/01_schema.sql)
- [database/mysql/migrations/009_2026-10-22_analysis-dataset.sql](../../../database/mysql/migrations/009_2026-10-22_analysis-dataset.sql)
- [docs/exec-plans/completed/2026-10-22-hoan-thien-phan-3.md](2026-10-22-hoan-thien-phan-3.md)
- [docs/exec-plans/completed/2026-10-22-phan-tich-va-tap-baseline.md](2026-10-22-phan-tich-va-tap-baseline.md)
- [docs/exec-plans/tech-debt-tracker.md](../tech-debt-tracker.md)
- [docs/vehicsim/analysis-metrics-contract.md](../../vehicsim/analysis-metrics-contract.md)
- [docs/vehicsim/architecture.md](../../vehicsim/architecture.md)
- [docs/vehicsim/database-schema.md](../../vehicsim/database-schema.md)
- [frontend/src/app/aeb/page.tsx](../../../frontend/src/app/aeb/page.tsx)
- [frontend/src/app/analysis/failures/[runId]/page.tsx](../../../frontend/src/app/analysis/failures/[runId]/page.tsx)
- [frontend/src/app/analysis/failures/[runId]/playback/page.tsx](../../../frontend/src/app/analysis/failures/[runId]/playback/page.tsx)
- [frontend/src/app/analysis/failures/page.tsx](../../../frontend/src/app/analysis/failures/page.tsx)
- [frontend/src/app/scenarios/page.tsx](../../../frontend/src/app/scenarios/page.tsx)
- [frontend/src/components/AnalysisDatasetPanel.tsx](../../../frontend/src/components/AnalysisDatasetPanel.tsx)
- [frontend/src/components/AnalysisSelectionSummary.tsx](../../../frontend/src/components/AnalysisSelectionSummary.tsx)
- [frontend/src/components/BaselineAnalysisDashboard.tsx](../../../frontend/src/components/BaselineAnalysisDashboard.tsx)
- [frontend/src/components/LegacyFailureCases.tsx](../../../frontend/src/components/LegacyFailureCases.tsx)
- [frontend/src/components/MotionTelemetryChart.tsx](../../../frontend/src/components/MotionTelemetryChart.tsx)
- [frontend/src/components/TelemetryChart.tsx](../../../frontend/src/components/TelemetryChart.tsx)
- [frontend/src/components/vehicsimI18n.ts](../../../frontend/src/components/vehicsimI18n.ts)
- [frontend/src/services/vehicsim.ts](../../../frontend/src/services/vehicsim.ts)
- [frontend/src/types/vehicsim.ts](../../../frontend/src/types/vehicsim.ts)
- [frontend/tests/analysis-ui-smoke.mjs](../../../frontend/tests/analysis-ui-smoke.mjs)
- [scripts/IntegrationSmoke.java](../../../scripts/IntegrationSmoke.java) (chế độ `analysis`; bản Python `test_analysis_integration.py` đã port sang Java ngày 26/10)
- [src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java](../../../src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java)
- [src/main/java/com/vsos/core/simulation/RecordedTelemetry.java](../../../src/main/java/com/vsos/core/simulation/RecordedTelemetry.java)
- [src/main/java/com/vsos/backend/entity/enums/AnalysisType.java](../../../src/main/java/com/vsos/backend/entity/enums/AnalysisType.java)
- [src/main/java/com/vsos/backend/service/analysis/AnalysisService.java](../../../src/main/java/com/vsos/backend/service/analysis/AnalysisService.java)
- [src/main/java/com/vsos/backend/service/simulation/TelemetryMetricsService.java](../../../src/main/java/com/vsos/backend/service/simulation/TelemetryMetricsService.java)
- [src/main/java/com/vsos/backend/controller/simulation/SimulationController.java](../../../src/main/java/com/vsos/backend/controller/simulation/SimulationController.java)
- [src/main/java/com/vsos/backend/service/analysis/AnalysisViewService.java](../../../src/main/java/com/vsos/backend/service/analysis/AnalysisViewService.java)
- [src/test/java/com/vsos/core/evaluation/AnalysisMetricsTest.java](../../../src/test/java/com/vsos/core/evaluation/AnalysisMetricsTest.java)
- [src/test/java/com/vsos/backend/service/analysis/AnalysisDatasetTest.java](../../../src/test/java/com/vsos/backend/service/analysis/AnalysisDatasetTest.java)
- [src/test/java/com/vsos/backend/service/analysis/AnalysisServiceTest.java](../../../src/test/java/com/vsos/backend/service/analysis/AnalysisServiceTest.java)
- [src/test/java/com/vsos/backend/service/analysis/AnalysisSnapshotTest.java](../../../src/test/java/com/vsos/backend/service/analysis/AnalysisSnapshotTest.java)
- [src/test/java/com/vsos/backend/security/VehicSimSecurityTest.java](../../../src/test/java/com/vsos/backend/security/VehicSimSecurityTest.java)
