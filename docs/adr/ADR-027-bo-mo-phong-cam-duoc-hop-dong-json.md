# ADR-027 — Bộ mô phỏng cắm được: một hợp đồng JSON, một AEB dùng chung, CARLA chạy bằng tiến trình con

**Trạng thái:** Proposed 01/10/2026 (TrungDQ, nhánh `trungdam`; chờ nhóm duyệt)
**Phạm vi:** vòng MVP VehicSim — bổ sung ADR-023 (không thay thế: bộ động học vẫn là đường mặc định)

## Bối cảnh

ADR-023 để CARLA "cắm vào sau" hợp đồng `execute_run`. Luồng MVP chốt trong buổi
trao đổi ngày 01/10 cần thêm: (1) **file JSON xuất từ kịch bản phải chạy được trên
CARLA** để kỹ sư xem tận mắt; (2) batch chạy được trên CARLA bằng worker; (3) tầng
web/API/DB không phải biết bên dưới là CARLA hay mô hình động học; (4) không bao giờ
đem kết quả động học so với kết quả CARLA.

Ràng buộc: `src/` không được `import carla` (`test_src_never_imports_carla`); venv
CARLA là Python 3.10 riêng, chỉ có gói `carla`.

## Các lựa chọn

1. Đổi biến thể sang `.xosc` rồi chạy ScenarioRunner như Forge.
2. Viết lại AEB trong một runner CARLA riêng.
3. Một hợp đồng JSON chung (`vehicsim.variant/v1` vào, `vehicsim.result/v1` ra); tách
   AEB cần kiểm thử ra `aeb_stack.py`; hai CLI cùng giao diện: `worker/kinematic_sim.py`
   và `worker/run_variant.py` (CARLA Python API trực tiếp).

## Quyết định

Chọn (3).

- **Lõi chỉ dùng thư viện chuẩn, cú pháp 3.10:** `aeb_stack.py` (AEB), `simulator.py`
  (thế giới động học + `make_frame`/`MotionStats`/`build_outcome`), `evaluation.py`
  (luật chấm), `bundle.py` (định dạng file). Venv CARLA import thẳng các file này.
- **Một AEB:** cả hai bộ mô phỏng dựng AEB bằng `new_aeb_stack` và gọi `AebStack.step`
  mỗi tick. Refactor không đổi một bit kết quả động học (6.912 lượt, cùng hash).
- **Nút "Tải JSON chạy CARLA"** = `GET /runs/{id}/bundle` = đúng `spec_for_run` mà
  backend đưa cho bộ mô phỏng. Màn "Sinh từ mô tả" tải được Scenario IR trần; CLI nhận
  cả hai (IR trần dùng AEB v1.0 và xe mặc định).
- **Batch trên CARLA:** `VEHICSIM_SIMULATOR=carla` + `VEHICSIM_CARLA_COMMAND`. Worker gọi
  CLI như **tiến trình con có timeout**, mỗi run một thư mục
  `VEHICSIM_DATA_ROOT/runs/<id>/` (bundle, result, log, video), ghi `simulation_artifacts`.
  CARLA treo/crash thì chỉ run đó FAILED.
- **Danh tính bộ mô phỏng** nằm ở `simulation_runs.carla_version`
  (`vehicsim-kinematic-1.0` / `carla-<phiên bản server>`). Run regression chép đúng giá
  trị này từ run baseline; baseline chỉ được lấy từ bộ mô phỏng đang cấu hình; server
  báo phiên bản khác `VEHICSIM_CARLA_VERSION` thì run FAILED. Không đổi schema.

## Lý do

- (1) không kiểm thử được AEB của ta: ScenarioRunner tự lái ego. (2) đẻ ra hai AEB
  trôi khỏi nhau — đúng điều regression phải tránh.
- CLI dùng chung giao diện nên kiểm được toàn bộ đường tiến trình con của backend
  bằng một CLI giả (`tests/test_vehicsim/fake_carla_cli.py`), không cần GPU trong CI.
- Đã chạy thật trên CARLA 0.9.16 (Windows, GPU tích hợp): JSON tải từ web chạy được,
  ra `result.json` cùng định dạng, chấm bằng cùng luật (exec plan 2026-10-01).

## Hệ quả

- Perception trong CARLA vẫn là mô hình tổng hợp trên ground truth; khác biệt giữa hai
  bộ mô phỏng nằm ở vật lý xe/người đi bộ/va chạm. Không gọi kết quả CARLA là
  "perception thật".
- Phanh xe CARLA chưa hiệu chuẩn, mưa chưa vào vật lý (TD-17). Số CARLA dùng để quan
  sát và đối chiếu, chưa làm bằng chứng regression chính thức.
- Máy kiểm: `test_sim_core_is_stdlib_only_and_python310`,
  `test_kinematic_cli_writes_the_same_result_as_the_backend`,
  `test_exported_bundle_reproduces_the_stored_run`,
  `test_carla_runs_go_through_the_simulator_subprocess`,
  `test_regression_never_pairs_kinematic_with_carla`,
  `test_runner_reuses_the_kinematic_aeb_and_result_builders`.
