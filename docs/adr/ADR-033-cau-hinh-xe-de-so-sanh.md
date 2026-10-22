# ADR-033 — Cấu hình xe để so sánh; DB lái thông số xe vào CARLA

**⛔ Superseded by [ADR-035](ADR-035-nam-role-he-thong-bo-cau-hinh-xe-va-meomeo.md) (06/10/2026)** — bỏ cấu hình xe; việc ép xe chính vào CARLA vẫn giữ.
**Trạng thái:** Proposed 04/10/2026 (TrungDQ, nhánh `trungdam`; DB + chạy run đã làm, màn hình chưa)
**Phạm vi:** FE-05. Bổ sung ADR-031 (không thay quyết định "một xe, không phiên bản"); bổ sung ADR-027
(hợp đồng JSON thêm khối `vehicle.carla`).

## Bối cảnh

TrungDQ muốn có **vehicle configuration** để kỹ sư so sánh thông số xe một cách khách quan: nếu xe khác
thông số (nặng hơn, phanh yếu hơn…) thì AEB đổi ra sao, và hỏi CARLA có ép được theo DB không.

Hiện trạng đo trong code (04/10):

- Bộ động học chỉ đọc 3 cột của `vehicles`: `length_m`, `width_m`, `max_brake_decel_mps2`.
- Runner CARLA **không đọc DB**: spawn blueprint theo `--blueprint` (mặc định `vehicle.audi.etron`) trong khi
  DB ghi `vehicle.tesla.model3`; không ép khối lượng hay vật lý nào.
- `apply_physics_control` của CARLA 0.9.16 ghi được (đã liệt kê trường trên máy dev):
  `VehiclePhysicsControl` — `mass`, `drag_coefficient`, `center_of_mass`, `max_rpm`, `moi`, `final_ratio`,
  hộp số, đường cong mô-men/lái, `wheels`; `WheelPhysicsControl` — `tire_friction`, `max_brake_torque`,
  `radius`, `max_steer_angle`, độ cứng lốp…
- **Không** trường nào đổi được kích thước: dài/rộng/cao/chiều dài cơ sở gắn với mesh của blueprint.
- TD-17 (01/10): đổi `tire_friction`, `max_brake_torque` không làm quãng phanh đổi; xe CARLA phanh hết cỡ chỉ
  ~4,6 m/s².

## Lựa chọn

1. **Phiên bản xe** (vehicle versions, có baseline xe) — loại: phạm vi 03/10 đã chốt một xe không phiên
   bản; thêm một luồng duyệt nữa song song với duyệt baseline AEB.
2. **Sửa thẳng dòng `vehicles`** — loại: 1.188 run đã chạy; xuất lại run cũ sẽ mang thông số mới, regression
   so hai lần chạy khác xe.
3. **Cấu hình xe chỉ để so sánh** — chọn (TrungDQ chốt 04/10).

## Quyết định

- **`vehicle_configurations`**: bộ thông số đầy đủ khác của cùng xe (blueprint, khối lượng, kích thước, phanh,
  hệ số cản, `physics_overrides` JSON, nguồn gốc từng số). Xe chính **vẫn là dòng `vehicles`**.
- **`vehicle_comparisons`**: một phép so sánh = cùng họ kịch bản, cùng AEB version, cùng seed, cùng bộ mô
  phỏng, chỉ khác thông số xe. Không có tiêu chí đạt/trượt, không Accept — khảo sát, không phải cổng duyệt.
- **`simulation_runs`** thêm `vehicle_configuration_id` (NULL = xe chính), `vehicle_comparison_id`, purpose
  `VEHICLE_COMPARISON`. DB ép:
  - `ck_sr_main_vehicle`: chỉ run so sánh được mang cấu hình — baseline/regression luôn dùng xe chính, nên
    luồng duyệt baseline AEB (ADR-025) không đổi;
  - `ck_sr_vehicle_comparison` + `fk_sr_baseline_run` + `fk_sr_vehicle_comparison`: run so sánh ghép với một
    run baseline cùng biến thể + seed, dùng đúng cấu hình và đúng AEB của phép so sánh.
- **DB lái CARLA** (`runs.carla_vehicle` → bundle `vehicle.carla` → `worker/run_variant.py`): spawn đúng
  `carla_blueprint`; ép `mass`, `drag_coefficient`, `physics_overrides`; đọc lại sau khi xe tiếp đất; ghi
  bảng đối chiếu vào `raw_metrics.case.carla.vehicle_check`:

  | Trạng thái | Nghĩa |
  |---|---|
  | `MATCH` | CARLA khớp sẵn (kích thước trong 5 cm, blueprint) |
  | `APPLIED` / `NOT_APPLIED` | đã ép, đọc lại khớp / không khớp |
  | `MISMATCH` | khác và không ép được (kích thước ↔ mesh) |
  | `CONTROLLER_CAP` | phanh tối đa ép bằng bộ điều khiển: AEB không xin quá mức này |
  | `UNREACHABLE` | cấu hình đòi phanh mạnh hơn CARLA làm được (~4,6 m/s²) |
  | `CLI_OVERRIDE` | `--blueprint` trên dòng lệnh thắng DB |

  `--blueprint` vẫn thắng để thử nhanh. Trường lạ trong `vehicle.carla` bị `read_spec` từ chối.
- **Migration 002** đổi blueprint xe seed `vehicle.tesla.model3` → `vehicle.audi.etron`: chính chiếc runner đã
  dùng và đã đo (TD-17), nên CARLA không đổi xe; bộ động học không đọc cột này.

## Hệ quả

- So sánh có ý nghĩa **khác nhau theo bộ mô phỏng**, và kỹ sư phải thấy điều đó: bộ động học chỉ phản ánh
  kích thước + phanh tối đa (khối lượng không vào mô hình điểm khối); CARLA phản ánh khối lượng, hệ số cản,
  vật lý bánh, nhưng không đổi kích thước và không phanh mạnh hơn sức xe. Bảng đối chiếu từng thông số ở
  [database-schema.md §6.2](../vehicsim/database-schema.md).
- 38 bảng (36 + 2). Màn List/Add/Edit/View cấu hình và màn so sánh, cùng service tạo/chốt phép so sánh, chưa
  làm (TD-29); `runs.create_runs` / `spec_for_run` đã chạy được run mang cấu hình.
- Từ nay run CARLA của xe chính mang khối lượng DB (2.100 kg) thay vì mặc định của blueprint — DB dev chưa có
  run CARLA nào nên không có cặp nào bị trộn.
- Ép `tire_friction` / `max_brake_torque` vẫn chưa chứng minh có tác dụng (TD-17) — bảng đối chiếu ghi chú rõ.

## Kiểm chứng (04/10)

[Exec plan](../exec-plans/completed/2026-10-04-cau-hinh-xe.md).
