# Hợp đồng chỉ số và tập phân tích — Người 3

Phiên bản tổng hợp: `adr040-stored-aggregation/1`. Người dùng chốt ngày 22/10/2026:
giữ công thức ADR-040 cho run cũ, chuẩn hóa tổng hợp và truy xuất. Không tái chấm run lịch sử.
Code dùng chung: [AnalysisMetrics](../../src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java).

## Số đo từng run và nguồn

| Nguồn | Pha/công thức hiện có | Cách sử dụng |
|---|---|---|
| SIMULATOR_RESULT / động học | Simulator.brakePhaseMetrics: từ brake_onset_t tới hết frames; jerk = Δa/dt, RMS = sqrt(mean(jerk²)); bước cũ 0,05 s, không thêm lọc | Dùng giá trị đã lưu; nguồn canonical cho snapshot. |
| SIMULATOR_RESULT / CARLA | Cùng lõi Java, profile simulator xác định; có dao động vật lý và gia tốc kẹp theo mô hình | Chỉ gộp cùng simulator identity/dt/xe/AEB; nhãn quan sát, chưa hiệu chuẩn phanh. |
| SENSOR_RECOMPUTED / TelemetryMetricsService | Warmup 0,5 s; brake >0,05; cắt trước collision; ưu tiên imu_jerk_ms3, nếu thiếu dùng Δa/Δt | Đây là phép đo khác; không ghi đè objective đã lưu hoặc gộp vào SIMULATOR_RESULT. |

Impact legacy là tốc độ ego tại va chạm, đơn vị m/s, không phải vận tốc tương đối vector.
Không va chạm: giá trị số đo NULL, đóng góp objective 0 chỉ khi run hợp lệ.
Quãng phanh legacy gồm quãng đã đi trong pha phanh và phần v²/(2a_available) khi run còn chạy.
Phần ngoại suy không được gọi là quãng dừng đã đo. RMS jerk và quãng phanh NULL khi không phanh.
Các chi tiết lọc Butterworth mới, T_AEB và impact vector trong kế hoạch 20/10 còn mở;
không khẳng định đã đạt protocol đo mới.

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
- Thành viên 4 dùng optimization_run_ids, thành viên 5 dùng validation_run_ids và cùng hợp đồng.
  Việc nối RegressionService/optimizer thực thi theo dataset thuộc phần 4/5, chưa được triển khai ở phần 3.
- Cấu hình ràng buộc campaign/regression vẫn cần chốt TD-48; dataset không đồng nghĩa trial khả thi,
  regression PASSED hoặc đủ bằng chứng phê duyệt.

## API

- GET /analysis/runs: scenario_id, variant_id, aeb_version_id, vehicle_id, simulator,
  weather, time_of_day, status, failure_class, page, page_size. KPI và items dùng đúng cùng scope.
- GET /analysis/runs/{id}: trạng thái run + detail khi hoàn tất; run kỹ thuật không có kết quả AEB giả.
- POST /analysis/selections: scenario_id, baseline_id, optimization_run_ids,
  validation_run_ids, run_revisions. Quyền ghi và limitWrites.
- GET /analysis/datasets/{id}/handoff: xác nhận tập có thể bàn giao hiện tại.
