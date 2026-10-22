# ADR-036 — Schema 29 bảng: khớp nghiệp vụ 13 FE, ép regression đúng xe + đúng bộ mô phỏng, field theo CARLA

**Trạng thái:** Proposed 07/10/2026 (TrungDQ, nhánh `trungdam`; schema + migration 005 + code đã chuyển)
**Phạm vi:** toàn bộ database (FE-01 → FE-13 theo tài liệu nhóm 06/10). **Thay** phần schema của ADR-031
(36 bảng) và ADR-035 (32 bảng); giữ nguyên quyết định role / quyền của ADR-035.

## Bối cảnh

Tài liệu nghiệp vụ của nhóm (06/10) gom lại thành 13 FE và có thêm cộng tác workspace (chat, task, báo cáo),
duyệt workspace, phiên bản xe + trạng thái hiệu chuẩn, khuyến nghị tách khỏi regression, tri thức kỹ thuật.
DB repo 32 bảng thiếu những thứ đó nhưng lại tách nhỏ chỗ không cần (`aeb_systems`, `simulation_results` +
`aeb_results`, `scenario_objects` / `_environments` / `_parameters`). TrungDQ chọn rút gọn còn ít bảng nhất
mà vẫn khớp nghiệp vụ (chốt 28, thêm `tech_references` thành 29), bảng `users` theo mẫu của nhóm, cột
`created_date` thống nhất. Sau đó rà từng field cho khớp CARLA và để làm tối ưu / mô phỏng.

## Lựa chọn

1. Giữ 32 bảng, thêm bảng cho phần còn thiếu (≈ 40 bảng) — loại: nhiều bảng 1:1 không có màn riêng.
2. **29 bảng, gộp bảng 1:1 vào bảng cha, ép bất biến bằng FK ghép + CHECK** — chọn.

## Quyết định

- **Gộp:**
  - `simulation_results` + `aeb_results` → cột kết quả của `simulation_runs`.
  - `scenario_objects` / `_environments` / `_parameters` → cột lọc của biến thể trong `scenario_versions`.
  - `aeb_systems` → bỏ (một hệ AEB mỗi project, `aeb_versions.project_id`).
  - `robustness_tests` + `sensitivity_*` → `analysis_results`.
  - Bỏ `system_settings` (dùng `.env`) và `audit_logs` (dùng file log).
- **Thêm:**
  - `vehicle_versions` + `carla_vehicle_models`: Digital Twin có phiên bản và trạng thái hiệu chuẩn (ai, khi nào).
  - `engineering_recommendations`: một khuyến nghị mỗi regression, Reviewer duyệt.
  - `regression_test_items`: từng cặp run.
  - Cộng tác: `workspace_messages`, `workspace_tasks`, `workspace_task_reports`.
  - `tech_references`.
- **Ép regression ở DB:** `simulation_runs.simulator_version` (thay `carla_version`, ghi cả bộ động học)
  và `vehicle_version_id` nằm trong `fk_sr_baseline` / `fk_sr_regression`. `regression_tests` chốt
  `vehicle_version_id` + `simulator_version`. MySQL từ chối ghép động học với CARLA, khác phiên bản CARLA,
  khác phiên bản bộ động học hay khác xe — trước đây chỉ code canh (TD-20).
- **Field theo CARLA 0.9.16:**
  - `vehicle_versions`: `center_of_mass_x/y/z_m`, `carla_full_brake_decel_mps2` (hệ số đổi giảm tốc → bàn đạp).
  - `sensors.carla_blueprint_id`, cùng các loại cảm biến concept cần (semantic LiDAR, obstacle, lane invasion).
  - `simulation_runs`: `map_name` (map thực nạp), `fixed_delta_seconds` (synchronous mode).
  - `collision_events.normal_impulse_*`.
- **Field cho mô phỏng / tối ưu:**
  - Kết quả FCW + phát hiện (`fcw_activated`, `fcw_time_s`, `first_detection_time_s`, `first_detection_distance_m`),
    cùng `mean_deceleration_mps2` và `simulated_duration_s`.
  - `optimization_runs`: cố định `vehicle_version_id` + `simulator_version`; thêm `search_space_json`,
    `acquisition_function`, `n_initial_points`.
  - `optimization_trials`: ba mục tiêu của Pareto (`collision_rate_pct`, `false_activation_rate_pct`,
    `comfort_max_jerk_mps3`) và `constraint_violated`.
  - `analysis_results.config_json`: đầu vào, ví dụ nhiễu robustness.
- **Giữ tính năng đang chạy:** `aeb_versions.notes`, `engineering_recommendations.review_conditions`,
  `failures.failure_type` có `INSUFFICIENT_STOPPING_DISTANCE`.
- **API giữ nguyên dạng JSON:** trạng thái regression hiển thị suy từ `execution_status` + `verdict`, quyết định
  lấy từ `engineering_recommendations`. Bảng tổng hợp regression không lưu mà tính lại từ các run đã xong.
  Role tự đăng ký đổi mã `EXPERIENCE` → `EXPERIENCER`.
- **Migration 005** chuyển DB đang chạy và giữ dữ liệu: bảng cũ chuyển sang schema tạm `vehicsim_pre005`
  rồi chép bằng `INSERT … SELECT`, giữ nguyên id.

## Hệ quả

- (+) Mỗi bảng là một thực thể có màn hình; truy vấn kết quả run không phải join ba bảng.
- (+) Bất biến regression (cùng seed / biến thể / xe / bộ mô phỏng) có máy kiểm ở cả DB lẫn test.
- (+) Đủ cột để vẽ Pareto, làm SHAP trên đặc trưng kịch bản + tham số AEB, và tái lập run CARLA.
- (−) Mất `cg_height_m` cũ (không đổi được sang `center_of_mass`), mất các cột kết quả chưa ai đọc
  (`total_frames`, `ego_final_speed_mps`… vẫn còn trong `telemetry_json`).
- (−) Regression có run hỏng không có khuyến nghị nên không Reject được — phải chạy lại.
- (−) `carla_full_brake_decel_mps2` có cột nhưng bundle chưa chở sang runner (TD-32).

## Kiểm chứng

- Dựng `01_schema.sql` trên MySQL 8.4.11 (DB tạm): 29 bảng, 386 cột, 79 khoá ngoại, 30 CHECK. Bộ thử
  nghiệp vụ 63/63: 16 luồng đúng chạy được, 47 dữ liệu sai bị chặn. Chi tiết ở
  [exec plan](../exec-plans/completed/2026-10-07-schema-29-bang.md).
- Migration 005 trên bản sao DB dev: giữ đủ 2 user, 7 AEB version, 646 phiên bản kịch bản, 1188 run, 758 ca lỗi;
  sinh 384 cặp regression và 4 khuyến nghị; không có liên kết mồ côi.
- `pytest` toàn bộ backend xanh.
