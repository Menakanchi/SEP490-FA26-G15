# ADR-023 — VehicSim MVP chạy trên simulator động học tất định, CARLA cắm vào sau

**Trạng thái:** Proposed 30/09/2026 (TrungDQ chốt cho nhánh `trungdam`; chờ nhóm duyệt)
**Phạm vi:** vòng MVP VehicSim (`src/services/vehicsim/`), không đụng Scenario Forge

## Bối cảnh

Kế hoạch MVP cần một vòng khép kín chạy được trước Demo 2 (15/11): chạy baseline,
phân tích lỗi, chạy lại candidate **cùng seed**, so sánh. Runner CARLA (slice 1 của
nhóm) chưa sẵn sàng; motif người đi bộ băng ngang cũng đã bị Forge loại vì
ScenarioRunner cho người đi bộ đi dọc làn (ADR-016). Vòng cần hàng trăm run mỗi
lần thử cấu hình, và phải lặp lại được tuyệt đối.

## Các lựa chọn

1. Chờ runner CARLA rồi mới làm vòng.
2. Giả lập kết quả (số ngẫu nhiên) cho UI.
3. Simulator động học tất định (ego + người đi bộ + chuỗi perception/decision/control/dynamics) sau một hợp đồng run.

## Quyết định

Chọn (3). `simulator.simulate(case, params, seed, vehicle)` là hàm thuần; mọi run đi
qua `runs.execute_run(run_id)` — hợp đồng mà runner CARLA sẽ thay vào. Seed mỗi biến
thể cố định (`48000 + id`); nhiễu perception chỉ đến từ RNG theo seed. Tên simulator
`vehicsim-kinematic-1.0` được ghi vào `simulation_runs.carla_version` để phân biệt với
run CARLA sau này.

## Lý do

- Tất định là điều kiện của regression cùng seed (ADR-025); giả lập ngẫu nhiên không
  cho so sánh cặp.
- Đo trên máy dev: 192 run (96 biến thể × 2 candidate) xong trong 18,5 s qua một
  worker Celery, đủ để kỹ sư thử nhiều candidate trong buổi demo.
- Chuỗi nguyên nhân (Perception → Decision → Control → Dynamics) cần tín hiệu nội bộ
  mà mô phỏng động học có sẵn; với CARLA sẽ lấy từ ground truth + perception log.

## Hệ quả

- Kết quả **không** phải bằng chứng vật lý; UI và khuyến nghị ghi rõ "simulator động
  học", các view cảm biến để mờ. Không dùng số của simulator này làm kết luận an toàn.
- Khi cắm CARLA: giữ nguyên bảng `simulation_runs/results/aeb_results`, đổi phần thân
  `execute_run`; simulator động học ở lại làm đường test nhanh (TD-01).
- Test tất định là máy kiểm: `test_same_seed_gives_identical_run`,
  `test_every_seeded_parameter_is_used_by_the_simulator`.
