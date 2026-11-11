# ADR-051 — Hiệu chuẩn phanh CARLA bằng mô-men phanh của xe; `.xosc` v5 và identity `-xosc5`

**Trạng thái:** Accepted 08/11/2026 — chủ dự án duyệt phương án (mức đích phanh 100% = `max_brake_decel_mps2` của xe).
**Liên quan:** giải phần lớn TD-17; bổ sung [ADR-042](ADR-042-loi-aeb-mo-phong-cham-diem-chuyen-sang-java.md) (một lõi, `.xosc` là đầu vào
CARLA) và [ADR-050](ADR-050-mo-category-xe-phia-truoc-bo-dong-hoc.md) (CCR trên CARLA).

## Bối cảnh

Trên CARLA 0.9.16, e-tron phanh 100% chỉ được ~4,6 m/s², trong khi xe trong DB (`max_brake_decel_mps2` = 9,5) và AEB (`MAX_DECELERATION`
= 8) giả định ~8–9,5 m/s². Cùng một biến thể, CARLA và bộ động học vì vậy cho kết quả khác nhau do xe chứ không do AEB: CCRb 50/50 km/h,
cách 12 m, xe trước phanh −6 m/s² va chạm 30,6 km/h ở bộ động học nhưng 39 km/h ở CARLA.

DB đã có cột `carla_vehicle_models.max_brake_torque_nm`, worker (`carla_physics.apply_physics_overrides`) đã ép được `physics.wheels`,
nhưng đường dữ liệu đứt ở giữa: `RunService.carlaVehicle` bỏ cột này, `XoscExport` / `Xosc.read` không mang thông số bánh. Ép
`physics.wheels` trong bundle vì thế bị bỏ lặng lẽ — CARLA vẫn chạy 1000 N·m.

Đo 08/11/2026 (`worker/vehicle_study.py`, `worker/measure_brake.py`, Town04 road 40, đồng bộ 0,01 s): mô-men phanh là tham số quyết định;
ma sát lốp gần như không ảnh hưởng (×2, ×3 không đổi quãng dừng; ×3 mô-men cho 13 m/s², vượt 1 g — lốp CARLA không giới hạn lực phanh).

## Quyết định

1. **Nối đường dữ liệu.** `RunService.carlaVehicle` đưa `max_brake_torque_nm` vào `physics.wheels = {max_brake_torque}` (một giá trị cho
   mọi bánh; trống = mô-men mặc định của blueprint, bundle như cũ). `XoscExport` ghi `vs_physics_wheel_max_brake_torque` **chỉ khi có**,
   `Xosc.read` đọc lại thành `physics.wheels`. `physics.wheels` dạng danh sách theo bánh hoặc có trường bánh khác bị bộ xuất **từ chối**
   thay vì bỏ lặng lẽ. `CarlaSession.physicsCheck` so mô-men đã yêu cầu với từng bánh CARLA đọc lại (trường ép, như khối lượng).
   Cố ý **không** truyền `tire_friction`: e-tron trong DB ghi 1,0 trong khi CARLA mặc định 3,5, truyền vào sẽ âm thầm đổi mọi run CARLA
   mà không giúp phanh.
2. **Số hiệu chuẩn của e-tron** (migration 014, seed `01_schema.sql`, `BootstrapService`): `max_brake_torque_nm` = 1800,
   `carla_full_brake_decel_mps2` = 9,13. Phanh 100% ở 2100 kg: 10,64 / 9,46 / 9,04 / 8,89 m/s² tại 40 / 50 / 60 / 70 km/h (trung bình
   ≈ 9,5). Bàn đạp gần tuyến tính: 0,5 / 0,7 / 0,85 cho 0,44–0,46 / 0,65–0,68 / 0,83–0,84 lần phanh 100% ở 50–70 km/h; khâu bù
   `0,05·(lệnh − đo)` của `DecelMeter.brakePedal` lo phần lệch. 4 xe của migration 011 đã có `max_brake_torque_nm` bằng mặc định của
   blueprint nên CARLA chạy chúng như cũ.
3. **`.xosc` v5, identity `carla-<x.y.z>-xosc5`.** Xe đã hiệu chuẩn phanh khác hẳn trước, nên regression không được ghép run phanh cũ với
   run phanh mới. v5 ghi XML giống v4 trừ `vs_format` khi xe chưa hiệu chuẩn. v4 thành `PREVIOUS_FORMAT` (`-xosc4`), v3 giữ `V3_FORMAT`:
   `run_xosc.py` vẫn chạy file cũ ngoài web với identity của nó; backend từ chối chạy lại run `-xosc1`…`-xosc4` (báo tạo lượt mới), như
   tiền lệ `-xosc3` ở TD-47.
4. **Công cụ đo.** `measure_brake.py` thêm `--brake-torque` (ép như backend) và `--pedals` (kiểm độ tuyến tính, ghi `pedal_linearity`).

## Kiểm chứng trên CARLA thật (08/11/2026)

Bundle dựng như backend sinh cho e-tron đã hiệu chuẩn (CARLA 0.9.16 Windows, ScenarioRunner, AEB Java); `physics_check.forced_ok` = true,
CARLA đọc lại 1800 N·m ở mọi bánh.

| Ca | Bộ động học | CARLA trước (1000 N·m) | CARLA sau (1800 N·m) |
|---|---|---|---|
| CCRs 40 km/h, cách 40 m | dừng, cách 4,00 m | dừng, cách 2,71 m | dừng, cách 6,08 m |
| CCRm 50/20 km/h, cách 30 m | dừng, cách 4,04 m | dừng, cách 1,74 m | dừng, cách 4,20 m |
| CCRb 50/50 km/h, cách 12 m, −6 m/s² | va chạm 30,6 km/h | va chạm 39,0 km/h (phanh tối đa 4,8) | va chạm 31,8 km/h (phanh tối đa 8,0) |
| Người đi bộ 40 km/h, 25 m, 1,5 m/s | dừng, cách 3,70 m | dừng, cách 3,25 m | dừng, cách 6,39 m |

CCRb — ca nhạy nhất với mức phanh — giờ lệch bộ động học 1,2 km/h thay vì 8,4 km/h. Ca dừng được thì CARLA nay dừng xa hơn bộ động học
2–3 m: dưới ~6 m/s CARLA vẫn dừng gần như tức thì (giảm tốc trung bình cả pha phanh 6,6–6,9 m/s² so với 8 của bộ động học).

## Hệ quả

- Run CARLA mới (người đi bộ lẫn CCR) phanh gần đúng xe trong DB; số CARLA vẫn chỉ để quan sát / đối chiếu, chưa thành bằng chứng
  regression chính thức (TD-01: perception vẫn từ ground truth).
- Run `-xosc4` cũ giữ nguyên, không ghép với `-xosc5`; baseline CARLA cần chạy lại bằng `-xosc5` nếu muốn so.
- Bộ động học và golden người đi bộ không đổi (`cp-crossing.xosc` chỉ đổi `vs_format`).
- Còn lại của TD-17: dừng tức thì dưới ~6 m/s, ma sát lốp / mưa chưa giới hạn lực phanh, mức phanh còn đổi theo tốc độ (10,6 → 8,9 m/s²
  từ 40 → 70 km/h), 4 xe khác chưa hiệu chuẩn.

Kiểm thử: `XoscExportTest` (khứ hồi mô-men phanh, từ chối `wheels` theo bánh / trường khác, đọc v3/v4 với identity riêng), `XoscReadParityTest`
(fixture Python đổi `vs_format`, ca `export 5` có `wheels` bị từ chối), `CarlaSessionLogicTest` (mô-men không tới bánh → `forced_ok` false),
`CarlaWebTest` (bundle có `wheels` chỉ khi xe có mô-men; identity `-xosc5`), `worker/tests/test_measure_brake.py`.
