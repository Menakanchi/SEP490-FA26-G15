# Audit và redesign module Phân tích — 03/11/2026

## Phạm vi và mức xác minh

Nâng cấp UI/UX của Người 3 trong source đang có. Không xây lại kiến trúc, backend,
worker, database hoặc thuật toán. Working tree sạch trước khi bắt đầu.
Báo cáo phân biệt kiểm chứng bằng source, kiểm thử trình duyệt với fixture và runtime thật.
Chưa nghiệm thu toàn luồng với DB/CARLA/Figma; không coi fixture là dữ liệu vận hành.

### Tài liệu và source đã kiểm tra

- AGENTS.md, CLAUDE.md; frontend/AGENTS.md và frontend/CLAUDE.md.
- [Phân công năm thành viên](phan-chia-cong-viec-5-thanh-vien.md), trọng tâm §5 và điểm bàn giao §9–10.
- Các phần bản đồ module/API/dữ liệu của [kiến trúc](architecture.md),
  phần chuỗi run/FK của [schema documentation](database-schema.md),
  [hợp đồng chỉ số](analysis-metrics-contract.md), ADR-040/042.
- Hai kế hoạch phần 3 ngày 22/10 và các mục TD-37/39/49/50/51 trong tech-debt tracker.
- Route Analysis, chi tiết và playback; BaselineAnalysisDashboard, LegacyFailureCases,
  AnalysisSelectionSummary, AnalysisDatasetPanel, TelemetryChart, MotionTelemetryChart,
  ScenarioMap và các điểm tích hợp shell/sidebar/context/page/flow/API/types/auth.
- Nội dung AnalysisService, các phương thức liên quan của ViewsService/VehicSimController,
  AnalysisMetrics; truy vết RecordedTelemetry, TelemetryMetricsService, runner, tối ưu,
  regression, quyền và các test phân tích. Kiểm kê thư mục backend/entity/enums/repository/config.
- Schema: kiểm kê CREATE TABLE/FK/unique/index của 01_schema.sql, đọc chi tiết
  simulation_runs, failures, root_causes, analysis_results; đối chiếu migration 009 và danh sách migration.
- Đọc hướng dẫn Next.js đang cài về Link, useSearchParams, CSS và Native History API.
- Không tìm thấy PDF/DOCX trong danh sách file khảo sát. Không có URL Figma trong tài liệu được tìm kiếm.

Đây là khảo sát toàn cấu trúc và audit sâu luồng Người 3; không khẳng định đã đọc
mọi dòng của toàn bộ repo hoặc đã kiểm tra dữ liệu DB runtime.

## Đối chiếu chức năng

API trong bảng dùng tiền tố `/api/v1/vehicsim`. Requirement lấy từ §5 tài liệu phân công;
không tự đặt mã use case/SRS khi chưa có nguồn.

| Chức năng / yêu cầu | Route | Component | API | Service / dữ liệu | Phân loại |
|---|---|---|---|---|---|
| Tổng hợp an toàn, va chạm, phanh oan | /analysis/failures?view=overview | BaselineAnalysisDashboard | GET /analysis/runs | AnalysisService.dashboard; simulation_runs + scenario_versions; AnalysisMetrics | REDESIGN |
| Tra cứu mọi run baseline, điều kiện, seed | /analysis/failures?view=runs | BaselineAnalysisDashboard, AnalysisPager | GET /analysis/runs với filter/page/page_size | AnalysisService; scalar projection của simulation_runs | REDESIGN / REFACTOR |
| Chi tiết run, đơn vị và cấu hình | /analysis/failures/[runId] | FailureDetailPage | GET /analysis/runs/{id} | AnalysisService.inspection → ViewsService.failureDetail; run + AEB/config | REDESIGN |
| Time series và động học | chi tiết, section=telemetry | TelemetryChart, MotionTelemetryChart | nằm trong detail/playback | telemetry_json → RecordedTelemetry; metric scalar đã lưu | KEEP nguồn, REDESIGN trình bày |
| Playback timestamp/sự kiện | /analysis/failures/[runId]/playback | PlaybackPage, ScenarioMap | GET /runs/{id}/playback | ViewsService.playback; frames/events đã ghi | KEEP cơ chế, REDESIGN controls |
| Ca lỗi, CSV, lọc môi trường/khâu | /analysis/failures?view=failures | LegacyFailureCases | GET /failures, GET /failures.csv | ViewsService.failureList; failures/root_causes/run | REFACTOR bảng/URL/trạng thái |
| Nhận định nguyên nhân và bằng chứng | chi tiết, section=evidence | StageCard + stage_evidence | nằm trong detail | Chuỗi chain đã ghi, dữ liệu từng khâu; giả thuyết theo luật | KEEP thuật toán, REDESIGN |
| Chọn hai tập độc lập, giữ safe | /analysis/failures?view=dataset | BaselineAnalysisDashboard | POST /analysis/selections | AnalysisService.freeze; analysis_results JSON v2 | KEEP mutation, REDESIGN workflow |
| Đọc snapshot, bàn giao ID | view=dataset&dataset_id=... → /aeb?dataset_id=... | AnalysisSelectionSummary | GET /analysis/datasets/{id}; GET /analysis/datasets/{id}/handoff | Archive bất biến; kiểm baseline/revision/digest | KEEP contract, FIX khôi phục UI |
| Sinh kịch bản, chạy/hủy, MOBO, regression, auth/admin | các route ngoài phạm vi trên | component/service hiện có | API hiện có | phần Người 1/2/4/5 | OUT OF SCOPE |

### Nguồn dữ liệu và ý nghĩa

- **Đã lưu:** simulation_runs giữ trạng thái, seed, xe/AEB/simulator/dt, scalar metrics và telemetry_json;
  failures/root_causes giữ phân loại/nhận định; analysis_results giữ snapshot hai tập trong JSON v2.
- **Backend tính:** counts, outcome và objective_groups theo scope; phân loại không tính lại ở frontend.
  RecordedTelemetry chiếu frame đã ghi sang tín hiệu phân tích; không ghi đè objective.
- **Frontend nhận:** AnalysisDashboardData, AnalysisRun, FailureDetail, Playback, AnalysisSelection.
  Bảng/biểu đồ đọc các trường này; chỉ đổi định dạng, màu, bố cục và trạng thái hiển thị.
- **Frontend dẫn xuất hiển thị:** tỷ lệ từ counts, tìm/sắp xếp trong trang, page count,
  checklist gợi ý và kiểm tra trùng selection. Server tiếp tục quyết định eligibility cuối cùng.
- **Fixture:** chỉ trong tests/analysis-redesign.mjs; đọc kinematic.json.gz đã có.
  API bị chặn ở browser test, không có mock trong production component/API client.
- Không tạo nguồn sensor/metrics mới. Khoảng cách tới vạch không gọi là radar range.
  Quãng phanh có thể ngoại suy; confidence theo luật không phải xác suất hiệu chuẩn.

## Vấn đề được xác định

1. Trang cũ trộn 12 KPI, nhiều nhóm objective, bộ lọc và chốt tập thành trang dài.
2. Bộ lọc xóa lựa chọn; mở chi tiết/quay lại mất page và state. Tab cũ chỉ ở React state.
3. Bảng run chưa hiện ba metric dù API đã trả; không có page size/search/sort trong UI.
4. Failure list dùng các div cố định chiều rộng; khó đọc trên tablet, thiếu loading rõ ràng,
   còn checkbox chỉ phục vụ nút tối ưu bị vô hiệu hóa. Load cũ có thể ghi đè request mới.
5. Run detail gộp cấu hình, cảnh, chain, chart và bằng chứng; nhiều khối ngang cố định.
6. PillButton chung bỏ qua disabled khi có href. Tại detail, thay bằng nhánh link/button
   để nút playback thiếu trace không điều hướng được; không sửa component chung.
7. Timestamp phát hiện/kích hoạt NULL chưa phân biệt được không đo với không xảy ra.
8. Danh sách related_runs chỉ giới hạn biến thể/trạng thái, chưa bảo đảm seed/xe/simulator.
   UI đổi tên hành động sang mở run liên quan; không tuyên bố phép so sánh hợp lệ.

### Chênh lệch tài liệu / giới hạn backend chưa sửa

- AGENTS/tài liệu cũ ghi chưa có hủy hoặc MOBO; source có cancelRun và OptimizationService
  dùng core.mobo.MoboEngine. Sự có mặt source không phải bằng chứng runtime đã nghiệm thu.
- Baseline dashboard nạp scalar rows của cả scope ở server trước khi skip/limit.
  Frontend chỉ tải trang và summary, không fetch toàn bộ telemetry; quy mô server vẫn cần theo dõi.
- API baseline chưa có text search/sort toàn tập. UI ghi rõ tìm/sắp xếp **trong trang**;
  lọc server theo những trường đã có, không tải tất cả run để giả lập tìm kiếm toàn tập.
- related_runs chưa trả identity đầy đủ để frontend xác nhận so sánh tương đương.
- Không thay các vấn đề này trong đợt UI; ghi nhận riêng để nhóm xem xét.

## Kiến trúc UI sau thay đổi

Giữ route cũ; thêm query view thay vì tạo năm route mới:

`Tổng quan → Lượt chạy → Chi tiết (Tổng quan / Telemetry / Bằng chứng) ↔ Playback → Tập bàn giao → Tối ưu AEB`

- Tổng quan: bốn KPI chính, phân bố counts thật, mục tiêu theo identity riêng.
- Lượt chạy: bộ lọc chính + điều kiện nâng cao thu gọn; bảng semantic có đơn vị/seed/identity;
  page size 10/20/30/50, previous/next và tổng số; tìm/sắp xếp phạm vi trang ghi rõ.
- Ca lỗi: KPI, phân bố theo khâu, bộ lọc API hiện có, semantic table và CSV.
  Bỏ checkbox/nút tối ưu không có tác dụng; việc chọn tập tập trung ở Lượt chạy.
- Tập bàn giao: danh sách đã chọn có phân trang; checklist điều kiện; chốt snapshot;
  hiển thị riêng mục tiêu tối ưu/xác minh, rồi kiểm handoff trước khi chuyển /aeb.
- URL giữ filter/page/search/sort/view; query f_* tách filter riêng của tra cứu ca lỗi.
- sessionStorage giữ draft theo user ID và project ID trong cùng phiên/tab; giữ revision cũ
  để backend từ chối preview thay đổi. Không tự gửi mutation khi khôi phục draft.
- dataset_id giữ archive đã chốt khi reload; server kiểm lại khi bàn giao.
- returnTo chỉ nhận đường dẫn nội bộ /analysis/failures?...; detail/playback giữ ngữ cảnh danh sách.
- Chart có nguồn/đơn vị; motion chart đọc số đo frame khi di chuột; giữ timestamp và segment thiếu.
- Playback vẫn dùng frame/sự kiện thật trả từ API; thêm trạng thái nút, nhãn tốc độ/layer
  và bố cục thích ứng, không biến cảnh 2D thành video sensor giả.
- Reuse VehicSimPage/Shell/StatCard/PillButton, token và SVG chart hiện có; không thêm UI framework.
  CSS nằm trong layout riêng của failures, selector giới hạn dưới analysis-workspace.

## Thay đổi và tính tương thích

- Chỉ sửa frontend và thêm tài liệu/test. Không xóa file production.
- Thêm analysisUi.tsx, failures/layout.tsx, failures/analysis.css và browser regression test.
- Refactor BaselineAnalysisDashboard/LegacyFailureCases; sửa ba page Analysis, hai chart,
  summary snapshot, tên mục sidebar và test smoke cũ để theo navigation mới.
- API client chỉ nhận thêm pageSize tùy chọn (mặc định 30) cho endpoint đã hỗ trợ page_size.
- AnalysisSelectionSummary được dùng ở /aeb: đổi hiển thị/nhãn/phân trang, không đổi props bắt buộc
  hoặc cách /aeb tải/kiểm tập dữ liệu. returnTo là prop tùy chọn mới.
- Không đổi schema/migration, công thức AEB/objective, ngưỡng phân loại, thuật toán root cause,
  baseline, API response/request body, authorization, quotas hoặc worker.
- UI checklist không thay thế validation của backend; run_revisions và handoff check giữ nguyên.

### Danh sách file bàn giao

File mới:

- `frontend/src/components/analysisUi.tsx`
- `frontend/src/app/analysis/failures/layout.tsx`
- `frontend/src/app/analysis/failures/analysis.css`
- `frontend/tests/analysis-redesign.mjs`
- `docs/vehicsim/audit-redesign-analysis-2026-11-03.md`
- `docs/exec-plans/active/2026-11-03-redesign-analysis-ui.md`

File sửa:

- `frontend/src/app/analysis/failures/page.tsx`
- `frontend/src/app/analysis/failures/[runId]/page.tsx`
- `frontend/src/app/analysis/failures/[runId]/playback/page.tsx`
- `frontend/src/components/BaselineAnalysisDashboard.tsx`
- `frontend/src/components/LegacyFailureCases.tsx`
- `frontend/src/components/AnalysisSelectionSummary.tsx`
- `frontend/src/components/MotionTelemetryChart.tsx`
- `frontend/src/components/TelemetryChart.tsx`
- `frontend/src/components/VehicSimSidebar.tsx`
- `frontend/src/services/vehicsim.ts`
- `frontend/tests/analysis-ui-smoke.mjs`
- `docs/exec-plans/tech-debt-tracker.md` (TD-53/54)

Không xóa file. Không có migration. Artifact ảnh và result.json không nằm trong git.

## Kiểm thử và giới hạn nghiệm thu

Kết quả lệnh, ảnh và giới hạn cuối cùng ghi trong
[kế hoạch thực thi](../exec-plans/active/2026-11-03-redesign-analysis-ui.md).
Bằng chứng browser nằm ở data/analysis-redesign-ui/ (gitignored), có result.json
và ảnh cho overview/explorer/detail/playback/dataset cùng các trạng thái.

**Chưa xác minh:** đăng nhập API thật, DB hiện hữu, tạo/chốt/handoff snapshot qua backend thật,
CARLA, so sánh Figma và toàn bộ module ngoài phạm vi. Docker Engine chưa chạy; không tự sửa
cấu hình máy hoặc dữ liệu của người dùng. Giữ kế hoạch active để theo dõi phần nghiệm thu này.
