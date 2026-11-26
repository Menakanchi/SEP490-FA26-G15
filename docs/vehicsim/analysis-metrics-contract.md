# Hợp đồng chỉ số và tập phân tích — Người 3

Phiên bản tổng hợp: `adr040-stored-aggregation/1`. Người dùng chốt ngày 22/10/2026:
giữ công thức ADR-040 cho run cũ, chuẩn hóa tổng hợp và truy xuất. Không tái chấm run lịch sử.
Code dùng chung: [AnalysisMetrics](../../src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java).

## Số đo từng run và nguồn

| Nguồn | Pha/công thức hiện có | Cách sử dụng |
|---|---|---|
| SIMULATOR_RESULT / động học | Simulator.brakePhaseMetrics: từ brake_onset_t tới hết frames; jerk = Δa/dt, RMS = sqrt(mean(jerk²)); bước cũ 0,05 s, không thêm lọc | Dùng giá trị đã lưu; nguồn canonical cho snapshot. |
| SIMULATOR_RESULT / CARLA | Cùng lõi Java, profile simulator xác định; có dao động vật lý và gia tốc kẹp theo mô hình | Chỉ gộp cùng simulator identity/dt/xe/AEB; nhãn quan sát. E-tron xosc5 có hiệu chuẩn mô-men theo ADR-051; TD-17 còn mở, không tương đương xác minh vật lý ngoài đời. |
| SENSOR_RECOMPUTED / TelemetryMetricsService | Warmup 0,5 s; brake >0,05; cắt trước collision; ưu tiên imu_jerk_ms3, nếu thiếu dùng Δa/Δt | Đây là phép đo khác; không ghi đè objective đã lưu hoặc gộp vào SIMULATOR_RESULT. |

**Cập nhật 13/11/2026 ([ADR-055](../adr/ADR-055-chot-chi-so-va-che-do-aeb-tat-13-11.md)) — áp cho định danh mới, run cũ giữ số:**
- Impact (`impact_speed_mps`) là **vận tốc va chạm tương đối** (độ lớn hiệu hai vector, m/s) từ bộ động học `vehicsim-kinematic-1.1`/`1.2` và CARLA `-xosc9` trở đi (1.2 / `-xosc11`: hành lang AEB theo bề rộng xe, ADR-057; 1.3 / `-xosc12`: phanh đúng mốc, `stopping_distance_m` động học tính từ đầu bước phanh, ADR-058);
  tốc độ ego ở `ego_impact_speed_mps`. Run `1.0` / `≤ -xosc8`: impact legacy là tốc độ ego — không gộp hai định nghĩa (khác simulator identity).
- RMS jerk CARLA `-xosc9`: gia tốc lọc Euro NCAP (Butterworth 12-pole phaseless 10 Hz), cửa sổ từ T_AEB; số chưa lọc ở `rms_jerk_raw_mps3`.
  Bộ động học (bước 0,05 s) giữ công thức chưa lọc từ `brake_onset_t`.
- Run `aeb_mode = OFF` không vào tập phân tích/tối ưu/regression (chỉ số pha phanh NULL, chỉ để đối chiếu).

Không va chạm: giá trị số đo NULL, đóng góp objective 0 chỉ khi run hợp lệ.
Quãng phanh gồm quãng đã đi trong pha phanh và phần v²/(2a_available) khi run còn chạy.
Phần ngoại suy không được gọi là quãng dừng đã đo. RMS jerk và quãng phanh NULL khi không phanh.

## Tổng hợp

- RMS jerk: trung bình các run có phanh, m/s³.
- Impact: trung bình mọi run hợp lệ, không va chạm đóng góp 0, m/s.
- Quãng phanh: trung bình các run có phanh, gồm ca va chạm, m.
- Run hợp lệ: COMPLETED, có kết quả phân loại, không TIMEOUT/ERROR, trace có nguồn để truy xuất.
- Chưa biết có phanh, số âm/NaN/Infinity, thiếu impact khi va chạm hoặc thiếu metric khi phanh:
  missing, không thay bằng 0. Objective value NULL nếu có missing.
- Không phanh: RMS/quãng phanh NOT_APPLICABLE, có notApplicable count riêng.
- Ví dụ ba run: (jerk=2, impact=6, stop=10, có phanh), (4, không va chạm,20,có phanh),
  (không phanh,không va chạm). Kết quả: RMS=3, impact=2, quãng phanh=15.
- Dashboard chia nhóm theo baseline AEB + xe + simulator identity + dt. Không gộp động học/CARLA.

## Truy xuất và dữ liệu dẫn xuất

Chi tiết/playback dùng frame timestamp đã lưu. Jerk hiển thị là sai phân gia tốc theo dt thực;
không nối qua frame thiếu gia tốc, không dùng nó để ghi đè objective.
Khoảng cách đồ thị là khoảng tới vạch băng qua, không phải radar range tới người đi bộ.
Chỉ báo chuyển động dùng ngưỡng quan sát: |speed| <0,05 m/s đứng yên; a >0,1 nhanh dần,
a <-0,1 chậm dần; còn lại gần đều. Đây không phải luật điều khiển/chấm điểm.
TTC perception và GT độc lập; thiếu perception không lấy GT thế chỗ.
Chuỗi nguyên nhân là giả thuyết theo luật; số confidence không phải xác suất đã hiệu chuẩn.
UI hiển thị số đo có thật cho từng khâu và lý do không đủ dữ liệu.

## Khối `dataset` của `result.json` ([ADR-065](../adr/ADR-065-khoi-dataset-trong-result-json.md))

Run CARLA ghi thêm khóa `dataset` cạnh `outcome`/`evaluation`: `identity`, `config`, `objectives` (cả `outcome.metrics` lẫn `evaluation.aeb_result`),
`provenance` (hash từng file), `sensors`, `collisions` (tách khỏi cờ `collision`), `time_series` (nội dung frames và ground truth), `derived`, `status`.
Phân tích đọc `status.<mục>.state` (`OK`/`MISSING`/`INVALID`/`CONFLICTING`/`FLAGGED`) và coi `null` là `UNKNOWN`, không thay bằng 0.
Objective null đọc theo `objectives.<tên>.state`: chỉ `NOT_APPLICABLE` mới là "không áp dụng"; `MISSING` là thiếu số. Tính chỉ số từ chuỗi thời gian
thì bỏ các dòng trong `time_series.quality.*.masks` (khởi tạo, gia tốc phi lý, sau va chạm) như `TelemetryMetricsService` đang làm.
Nhiều run của một biến thể (ON/OFF, lần lặp): `GET /variants/{variantId}/collection` trả `vehicsim.run-collection/v1`, mỗi run giữ nguyên
`result.json`, so sánh chỉ trong cùng `groups[].key` (AEB version, xe, simulator, seed); phép gộp vẫn thuộc phần Phân tích.
`derived` (`d_*`, [RunDataset](../../src/main/java/com/vsos/core/evaluation/RunDataset.java)) là số tham khảo `REFERENCE_ONLY`: không thay công thức của lõi,
không làm objective. Cột cần nhiều run (AEB OFF − ON, thống kê lặp, candidate lỗi) thuộc Dataset v2 bên dưới, không thuộc một `result.json`.

## Dataset v2

`analysis_results` / BASELINE_DATASET / IMMUTABLE_SNAPSHOT, JSON `vehicsim.analysis-dataset/v2`.
Không sửa migration 009 đã có; JSON v2 không cần cột/bảng mới.

- Hai danh sách optimization_run_ids và validation_run_ids rõ ràng.
- Hai tập không trùng biến thể; mỗi tập giữ ca an toàn.
- Trong mỗi tập, mỗi biến thể/seed chỉ được chọn một run; có thể giữ nhiều seed khác nhau.
- Cùng họ, baseline còn hiệu lực, xe, simulator và dt. Chỉ GENERATED.
- Run lỗi/hủy/timeout/thiếu trace không được chốt. Tập tối ưu có đủ ba objective;
  tập xác minh có thể chứa run không phanh với NOT_APPLICABLE, không được thiếu số đo cần thiết.
- Gửi run_revisions để xác nhận đúng preview đã xem. Snapshot giữ run/seed, kết quả,
  config scenario, params và case thực ghi trong artifact; trường không ghi được giữ NULL.
  vehicle trong artifact legacy có thể không có: không suy ra physics thực từ ID xe.
- Artifact/config digest chuẩn hóa thứ tự khóa và biểu diễn số MySQL JSON.
- GET /analysis/datasets/{id} là đọc archive, không chọn lại run.
- GET /analysis/datasets/{id}/handoff kiểm baseline hiện tại, run và hash artifact/config;
  chặn v1, run đổi hoặc thiếu artifact. Không tự chạy MOBO/candidate.
- v1 vẫn đọc được để truy xuất, nhưng phải chốt lại hai tập trước khi bàn giao.
- Campaign nhận `dataset_id` + `dataset_digest` từ handoff đã kiểm; `objective_config_json.dataset_ref`
  giữ hai danh sách run nguồn. Mỗi trial chỉ chạy `optimization_run_ids`, cùng variant/seed/config/xe/simulator;
  GP nhận ba aggregate canonical từ các trial đã hoàn tất, không dùng nhãn nguyên nhân lỗi làm target.
- Chọn candidate tạo verification theo đúng `validation_run_ids`, không chọn lại baseline hoặc generation mới.
  Nhiều seed của cùng biến thể được giữ thành nhiều cặp run; database cũ cần migration 023 trước khi dùng.
  Handoff/checksum/source được kiểm lại khi tạo campaign, từng trial và trước verification; stale bị chặn.
- Đây là adapter cho dataset v2. Handoff chẩn đoán V3 `fa_json_handoffs` vẫn có policy/authority riêng;
  không được dùng `dispatch_allowed = false` như lệnh thực thi campaign.
- Cấu hình ràng buộc campaign/regression vẫn cần chốt TD-48; dataset không đồng nghĩa trial khả thi,
  regression PASSED hoặc đủ bằng chứng phê duyệt.

## API

- GET /analysis/runs: scenario_id, variant_id, aeb_version_id, vehicle_id, simulator,
  weather, time_of_day, status, failure_class, page, page_size. KPI và items dùng đúng cùng scope.
- GET /analysis/runs/{id}: trạng thái run + detail khi hoàn tất; run kỹ thuật không có kết quả AEB giả.
- POST /analysis/selections: scenario_id, baseline_id, optimization_run_ids,
  validation_run_ids, run_revisions. Quyền ghi và limitWrites.
- GET /analysis/datasets/{id}/handoff: xác nhận tập có thể bàn giao hiện tại.
- POST /optimizations: thêm `dataset_id`, `dataset_digest`; scenario/baseline/simulator phải khớp snapshot.
- POST /optimizations/{id}/select/{trialId}: trả `regression_test_id` của verification đúng partition;
  retry tái sử dụng cùng verification đang chạy/đã hoàn tất, không lấy test tùy ý cùng candidate.
