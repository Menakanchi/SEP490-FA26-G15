-- =====================================================================
-- Migration 016 — 22/11/2026: hiệu chuẩn phanh CARLA cho Tesla Model 3, Nissan Patrol 2021, Mercedes Sprinter theo đúng cách
-- ADR-051 đã làm với e-tron (migration 014). Không đổi số bảng, không đổi cột.
--
-- Số đo: carla-ped-bench đợt 2, nhóm X1 (20/11/2026, CARLA 0.9.16 Windows, Town04 road 40, phanh 100% cố định, 205/205 run hợp lệ;
--   repo công cụ, nhánh phutro, runs/2026-11-20_2217). Mỗi xe quét mô-men × 1,0 / 1,5 / 2,0 / 2,5 / 3,0 ở 40 / 50 / 60 / 70 km/h;
--   chọn đúng mức đã đo gần max_brake_decel_mps2 = 9,5 nhất, không nội suy. carla_full_brake_decel_mps2 = trung bình 50–70 km/h
--   (40 km/h bỏ vì dải đo ngắn), như migration 014.
--     Model 3  : 700 → 1750 N·m (× 2,5): 10,01 / 9,83 / 9,77 m/s² ở 50 / 60 / 70 km/h → 9,87 (trước 3,56).
--     Patrol   : 1500 → 2250 N·m (× 1,5): 11,53 / 9,51 / 8,66 → 9,90 (trước 6,01). Đổi mạnh theo tốc độ (± 1,5 m/s²).
--     Sprinter : 1500 → 2250 N·m (× 1,5): 9,96 / 8,49 / 8,28 → 8,91 (trước 5,69). × 2,0 cho 11,13, xa 9,5 hơn.
--   Giảm tốc không tỉ lệ thuận với mô-men ở Patrol và Sprinter, nên không ngoại suy từ số mặc định.
-- Xe tải European HGV giữ nguyên (is_supported = FALSE): × 3,0 (4500 N·m) mới được 9,63 / 7,18 / 6,77 m/s², chưa hiệu chuẩn được bằng
--   một mô-men.
--
-- Ảnh hưởng: run CARLA của 3 xe này tạo trước migration chạy với mô-men cũ; không ghép chúng với run mới của cùng xe (đổi physics xe,
--   không đổi định danh simulator). Bộ động học không đọc hai cột này nên kết quả động học không đổi. Bảng bàn đạp theo tốc độ
--   (ADR-054) vẫn chỉ cho e-tron; 3 xe này dùng giả định bàn đạp tuyến tính với carla_full_brake_decel_mps2 mới.
-- DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG cần chạy file này.
--
-- Chạy một lần (giữ dữ liệu):
--   docker compose exec -T mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim' \
--     < database/mysql/migrations/016_2026-11-22_hieu-chuan-phanh-3-xe.sql
-- =====================================================================
UPDATE carla_vehicle_models SET max_brake_torque_nm = 1750.00, carla_full_brake_decel_mps2 = 9.87
 WHERE carla_blueprint_id = 'vehicle.tesla.model3';
UPDATE carla_vehicle_models SET max_brake_torque_nm = 2250.00, carla_full_brake_decel_mps2 = 9.90
 WHERE carla_blueprint_id = 'vehicle.nissan.patrol_2021';
UPDATE carla_vehicle_models SET max_brake_torque_nm = 2250.00, carla_full_brake_decel_mps2 = 8.91
 WHERE carla_blueprint_id = 'vehicle.mercedes.sprinter';
