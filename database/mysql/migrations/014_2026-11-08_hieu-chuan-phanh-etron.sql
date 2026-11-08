-- =====================================================================
-- Migration 014 — 08/11/2026: hiệu chuẩn phanh CARLA cho Audi e-tron (ADR-051, TD-17). Không đổi số bảng, không đổi cột.
--
-- max_brake_torque_nm = 1800 N·m mọi bánh (mặc định blueprint 1000 N·m chỉ cho ~4,6 m/s²): đo bằng
--   worker/measure_brake.py --mass 2100 --brake-torque 1800 --speeds 40 50 60 70 --pedals 0.3 0.5 0.7 0.85 1.0
--   trên CARLA 0.9.16 Windows, Town04 road 40: phanh 100% được 10,64 / 9,46 / 9,04 / 8,89 m/s² ở 40 / 50 / 60 / 70 km/h,
--   trung bình ≈ max_brake_decel_mps2 = 9,5 của xe.
-- carla_full_brake_decel_mps2 = 9,13: đề xuất của công cụ (trung bình 50–70 km/h; 40 km/h bị loại vì dải đo < 0,5 s). Controller
--   đổi giảm tốc AEB ra bàn đạp theo số này; bàn đạp 0,5–0,85 cho 0,44–0,84 lần phanh 100% ở 50–70 km/h (gần tuyến tính).
--
-- Run CARLA mới dùng identity -xosc5 (bộ xuất .xosc v5 mang mô-men phanh); run -xosc4 cũ giữ nguyên, không ghép với -xosc5.
-- Bộ động học không đọc hai cột này nên kết quả động học không đổi. 4 xe của migration 011 đã có max_brake_torque_nm bằng
-- mặc định của blueprint nên CARLA chạy chúng như cũ. DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG cần chạy file này.
--
-- Chạy một lần (giữ dữ liệu):
--   docker compose exec -T mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim' \
--     < database/mysql/migrations/014_2026-11-08_hieu-chuan-phanh-etron.sql
-- =====================================================================
UPDATE carla_vehicle_models
   SET max_brake_torque_nm = 1800.00, carla_full_brake_decel_mps2 = 9.13
 WHERE carla_blueprint_id = 'vehicle.audi.etron';
