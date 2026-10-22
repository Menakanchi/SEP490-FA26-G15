# Cấu hình xe để so sánh, DB lái thông số xe vào CARLA (04/10/2026)

**Yêu cầu (TrungDQ):** thêm "vehicle configuration" để kỹ sư so sánh và nhìn khách quan nếu xe khác thông
số thì sao; hỏi CARLA có ép được theo DB không. **Chốt:** cấu hình **chỉ để so sánh** (không thay xe chính);
lần này làm thiết kế + DB + chạy run, màn hình sau. **Quyết định:**
[ADR-033](../../adr/ADR-033-cau-hinh-xe-de-so-sanh.md).

## Đã làm

1. [x] Đọc hiện trạng: bộ động học dùng 3 cột xe; runner CARLA bỏ qua DB (spawn `--blueprint`, DB ghi
   `tesla.model3` còn runner dùng `audi.etron`). Liệt kê trường `VehiclePhysicsControl` /
   `WheelPhysicsControl` trên CARLA 0.9.16 máy dev — không trường nào đổi kích thước.
2. [x] Schema: bảng `vehicle_configurations`, `vehicle_comparisons`; `simulation_runs` +
   `vehicle_configuration_id`, `vehicle_comparison_id`, purpose `VEHICLE_COMPARISON`, 2 FK ghép, 2 CHECK
   (`ck_sr_vehicle_comparison`, `ck_sr_main_vehicle`); view truy vết thêm cấu hình xe.
3. [x] Migration `002_2026-10-04_cau-hinh-xe.sql` (36 → 38 bảng; đổi blueprint xe seed sang `audi.etron`).
4. [x] Code: `tables.py`; `runs.create_runs` nhận cấu hình, `spec_for_run` đọc cấu hình khi run mang nó,
   `runs.carla_vehicle` dựng khối `vehicle.carla`; `bundle` đọc/kiểm khối đó (trường lạ bị từ chối);
   `regression` không bao giờ lấy run mang cấu hình làm baseline; `bootstrap` dùng `audi.etron`.
5. [x] Runner CARLA: blueprint từ bundle (`--blueprint` vẫn thắng), ép vật lý bằng `apply_physics_control`
   trước khi xe tiếp đất, đọc lại, ghi `case.carla.vehicle_check` và in dòng lệch ra console.
6. [x] Tài liệu: ADR-033, mục lục ADR, ghi chú ở ADR-031, database-schema.md (bảng mới, bảng "thông số nào
   có tác dụng ở bộ mô phỏng nào", JSON `physics_overrides`, migration), architecture.md, tech-debt (TD-29
   mới, TD-26 thêm 002), số bảng ở AGENTS/README/docker-compose.

## Kiểm chứng

| Kiểm | Kết quả |
|---|---|
| DB dựng mới từ `01_schema.sql` so với bản sao DB dev + migration 002 (cột, index, FK, CHECK, bảng/view) | 0 khác biệt — 38 bảng, 474 cột, 103 FK, 19 CHECK, 175 index |
| Ràng buộc trên bản sao (MySQL 8.4) | 11/11 đúng: run so sánh hợp lệ vào được; baseline mang cấu hình, run so sánh thiếu cặp / khác seed / khác AEB / thiếu cấu hình, cấu hình của xe không tồn tại, khối lượng 0, trùng số thứ tự, xoá cấu hình đang dùng đều bị chặn |
| Chạy lại 002 | dừng ngay ở lệnh đầu (`Table already exists`), không đổi dữ liệu |
| Tên tiếng Việt | "Chở đủ tải (+300 kg)" lưu và đọc lại nguyên vẹn (utf8mb4) |
| DB dev máy TrungDQ | sao lưu rồi nâng: 38 bảng, 1.188 run giữ nguyên (0 run mang cấu hình), xe seed `vehicle.audi.etron`; bundle của run thật đọc lại khớp |
| Backend `ruff` + `pytest` | sạch; 279 passed, 1 skipped (thêm 12 test: bundle mang xe chính, run so sánh dùng cấu hình + cùng seed + không thành baseline, kiểm khối `vehicle.carla`, ép vật lý + bảng đối chiếu, số bánh sai; còn lại là test link tài liệu mới) |
| CARLA thật | **chưa chạy** — phần gọi CARLA (`apply_physics_control`, đọc lại) mới kiểm bằng đối tượng giả; cần một lần chạy trên máy có server để xác nhận trường đọc lại khớp |

## Còn lại

- TD-29: service + API + màn cấu hình xe và màn so sánh.
- Chạy một run CARLA thật để xác nhận đọc lại vật lý (dòng cuối bảng trên).
- TD-17 vẫn mở: ép `tire_friction` / `max_brake_torque` chưa chứng minh có tác dụng.
