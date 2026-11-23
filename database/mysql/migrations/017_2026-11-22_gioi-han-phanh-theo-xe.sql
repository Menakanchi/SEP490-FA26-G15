-- =====================================================================
-- Migration 017 — 22/11/2026: giới hạn phanh (max_brake_decel_mps2) theo từng mẫu xe thay cho 9,5 m/s² chung (migration 011).
-- Không đổi số bảng, không đổi cột.
--
-- Quy tắc: giới hạn = min(phanh của xe thật, phanh 100% đo trên CARLA của đúng xe đó). AEB không bao giờ yêu cầu quá giới hạn này, nên:
--   ≤ CARLA   → mọi mức AEB yêu cầu xe CARLA đều làm được, CARLA khớp bộ động học (trial tối ưu chấm bằng CARLA);
--   ≤ xe thật → kết quả tối ưu không lạc quan hơn xe thật.
--
--   Xe                 Xe thật (a = v²/2d, quãng phanh đo công khai)               CARLA (carla_full_brake_decel_mps2)   Giới hạn
--   Audi e-tron        chưa có nguồn đáng tin cho đúng mẫu                           9,13 (1800 N·m, migration 014)         9,13 (CARLA)
--   Tesla Model 3      9,13: Car and Driver 2018, 70–0 mph trung bình 176 ft         9,87 (1750 N·m, migration 016)         9,10 (xe thật)
--   Nissan Patrol 2021 8,87: Armada (cùng xe ở Mỹ), Consumer Reports 2021,           9,90 (2250 N·m, migration 016)         8,80 (xe thật)
--                      60–0 mph 133 ft; Car and Driver 2017, 70–0 182 ft → 8,83
--   Mercedes Sprinter  8,55: Edmunds 2013 Sprinter 2500, 60–0 mph 138 ft             8,91 (2250 N·m, migration 016)         8,50 (xe thật)
--   European HGV       ~5,0: FMVSS 121 đầu kéo, 60 mph ≤ 250 ft tải đủ / 235 ft nhẹ  1,77 (mặc định, chưa hiệu chuẩn được)   1,77 (CARLA)
--   Số xe thật là giảm tốc trung bình từ lúc phanh tới khi dừng (gồm pha tăng lực) nên hơi thấp hơn đỉnh — thiên về an toàn.
--   HGV giữ is_supported = FALSE: CARLA không phanh được như xe tải thật.
--
-- Ảnh hưởng: bộ động học và AEB dùng min(MAX_DECELERATION của phiên bản AEB, giới hạn của xe, μ·g). Với MAX_DECELERATION mặc định 8 m/s² chỉ HGV
--   đổi kết quả; các xe khác đổi khi phiên bản AEB đặt MAX_DECELERATION trên 8,5–9,13 (dải tối ưu tới 10). Run của 5 xe này tạo trước migration
--   dùng giới hạn 9,5; không ghép với run mới của cùng xe (đổi dữ liệu xe, không đổi định danh). Đổi mô-men phanh của một xe về sau thì đo lại
--   carla_full_brake_decel_mps2 và tính lại giới hạn theo quy tắc trên.
-- DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG cần chạy file này.
--
-- Chạy một lần (giữ dữ liệu):
--   docker compose exec -T mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim' \
--     < database/mysql/migrations/017_2026-11-22_gioi-han-phanh-theo-xe.sql
-- =====================================================================
UPDATE carla_vehicle_models SET max_brake_decel_mps2 = 9.13 WHERE carla_blueprint_id = 'vehicle.audi.etron';
UPDATE carla_vehicle_models SET max_brake_decel_mps2 = 9.10 WHERE carla_blueprint_id = 'vehicle.tesla.model3';
UPDATE carla_vehicle_models SET max_brake_decel_mps2 = 8.80 WHERE carla_blueprint_id = 'vehicle.nissan.patrol_2021';
UPDATE carla_vehicle_models SET max_brake_decel_mps2 = 8.50 WHERE carla_blueprint_id = 'vehicle.mercedes.sprinter';
UPDATE carla_vehicle_models SET max_brake_decel_mps2 = 1.77 WHERE carla_blueprint_id = 'vehicle.carlamotors.european_hgv';
