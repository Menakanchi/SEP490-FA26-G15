-- =====================================================================
-- Migration 017 — 22/11/2026: giới hạn phanh (max_brake_decel_mps2) theo từng mẫu xe thay cho 9,5 m/s² chung (migration 011).
-- Không đổi số bảng, không đổi cột.
--
-- Số = giảm tốc trung bình a = v² / (2·d) từ quãng phanh đo công khai (từ lúc phanh tới khi dừng, gồm cả pha tăng lực nên thấp hơn đỉnh):
--   Tesla Model 3      9,1  Car and Driver 2018, 70–0 mph trung bình 176 ft (6 lần) → 9,13 m/s².
--   Nissan Patrol 2021 8,8  Cùng xe bán ở Mỹ là Nissan Armada: Consumer Reports 2021, 60–0 mph khô 133 ft → 8,87; Car and Driver 2017, 70–0 182 ft → 8,83.
--   Mercedes Sprinter  8,5  Edmunds track test 2013 Sprinter 2500, 60–0 mph 138 ft → 8,55.
--   European HGV       5,0  Đầu kéo theo FMVSS 121 (sửa 2009): dừng từ 60 mph trong ≤ 250 ft khi chở đủ tải (4,72), ≤ 235 ft khi tải nhẹ (5,02).
--                           Là mức tối thiểu theo quy chuẩn, không phải số đo một xe cụ thể. Xe vẫn is_supported = FALSE.
--   Audi e-tron        giữ 9,5 (chưa có số đo công khai đáng tin cho đúng mẫu xe).
--
-- Ảnh hưởng: bộ động học và AEB dùng min(MAX_DECELERATION của phiên bản AEB, giới hạn của xe, μ·g). Với MAX_DECELERATION mặc định 8 m/s², chỉ
--   HGV đổi kết quả; Model 3 / Patrol / Sprinter đổi khi phiên bản AEB đặt MAX_DECELERATION trên 8,5–9,1 (dải tối ưu tới 10). Trên CARLA, mô-men
--   đã hiệu chuẩn (migration 016) cho phanh 100% 9,87 / 9,90 / 8,91 m/s², đều ≥ giới hạn mới nên AEB không yêu cầu quá sức xe; không cần hiệu
--   chuẩn lại. Run của 4 xe này tạo trước migration dùng giới hạn cũ; không ghép với run mới của cùng xe (đổi dữ liệu xe, không đổi định danh).
-- DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG cần chạy file này.
--
-- Chạy một lần (giữ dữ liệu):
--   docker compose exec -T mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim' \
--     < database/mysql/migrations/017_2026-11-22_gioi-han-phanh-theo-xe.sql
-- =====================================================================
UPDATE carla_vehicle_models SET max_brake_decel_mps2 = 9.10 WHERE carla_blueprint_id = 'vehicle.tesla.model3';
UPDATE carla_vehicle_models SET max_brake_decel_mps2 = 8.80 WHERE carla_blueprint_id = 'vehicle.nissan.patrol_2021';
UPDATE carla_vehicle_models SET max_brake_decel_mps2 = 8.50 WHERE carla_blueprint_id = 'vehicle.mercedes.sprinter';
UPDATE carla_vehicle_models SET max_brake_decel_mps2 = 5.00 WHERE carla_blueprint_id = 'vehicle.carlamotors.european_hgv';
