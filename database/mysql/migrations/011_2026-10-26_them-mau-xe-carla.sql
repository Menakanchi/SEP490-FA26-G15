-- =====================================================================
-- Migration 011 — 26/10/2026: thêm 4 mẫu xe CARLA vào danh mục (29 bảng, không đổi số bảng).
-- Chi tiết: docs/exec-plans/completed/2026-10-26-danh-muc-mau-xe-carla.md
--
-- 1. ck_cvm_wheels nhận thêm 6 bánh (xe tải vehicle.carlamotors.european_hgv).
-- 2. Thêm Tesla Model 3, Nissan Patrol 2021, Mercedes Sprinter, CarlaMotors European HGV. Thông số đọc từ physics mặc định
--    của CARLA 0.9.16 bằng worker/vehicle_catalog.py; carla_full_brake_decel_mps2 = giảm tốc phanh 100% đo bằng
--    worker/vehicle_study.py (26/10, trùng số đo 22/10). max_brake_decel_mps2 = 9,5 như e-tron (giới hạn phanh của bộ động
--    học, quyết định của nhóm — CARLA phanh yếu hơn xe thật, TD-17). Xe tải is_supported = FALSE: 9,5 m/s² không đúng với
--    xe tải, chỉ để xem.
-- Không sửa dòng e-tron hay run cũ; blueprint đã có thì bỏ qua (chạy lại không sao). DB tạo mới từ 01_schema.sql hiện tại
-- thì KHÔNG cần chạy file này.
--
-- Chạy một lần (giữ dữ liệu):
--   docker compose exec -T mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim' \
--     < database/mysql/migrations/011_2026-10-26_them-mau-xe-carla.sql
-- =====================================================================
ALTER TABLE carla_vehicle_models DROP CHECK ck_cvm_wheels;
ALTER TABLE carla_vehicle_models ADD CONSTRAINT ck_cvm_wheels CHECK (num_wheels IN (2, 4, 6));

INSERT INTO carla_vehicle_models (carla_blueprint_id, display_name, length_m, width_m, height_m, num_wheels, mass_kg, drag_coefficient, center_of_mass_x_m, center_of_mass_y_m, center_of_mass_z_m, tire_friction, max_brake_torque_nm, wheelbase_m, max_speed_mps, max_brake_decel_mps2, carla_full_brake_decel_mps2, is_supported)
SELECT * FROM (
  SELECT 'vehicle.tesla.model3' AS carla_blueprint_id, 'Tesla Model 3' AS display_name, 4.792 AS length_m, 2.163 AS width_m, 1.488 AS height_m, 4 AS num_wheels, 1845.0 AS mass_kg, 0.15 AS drag_coefficient, 0.45 AS center_of_mass_x_m, 0.0 AS center_of_mass_y_m, -0.3 AS center_of_mass_z_m, 3.5 AS tire_friction, 700.0 AS max_brake_torque_nm, 3.002 AS wheelbase_m, NULL AS max_speed_mps, 9.5 AS max_brake_decel_mps2, 3.56 AS carla_full_brake_decel_mps2, TRUE AS is_supported
  UNION ALL SELECT 'vehicle.nissan.patrol_2021' AS carla_blueprint_id, 'Nissan Patrol 2021' AS display_name, 5.566 AS length_m, 2.15 AS width_m, 2.045 AS height_m, 4 AS num_wheels, 2355.0 AS mass_kg, 0.3 AS drag_coefficient, 0.6 AS center_of_mass_x_m, 0.0 AS center_of_mass_y_m, -0.5 AS center_of_mass_z_m, 3.5 AS tire_friction, 1500.0 AS max_brake_torque_nm, 3.276 AS wheelbase_m, NULL AS max_speed_mps, 9.5 AS max_brake_decel_mps2, 6.01 AS carla_full_brake_decel_mps2, TRUE AS is_supported
  UNION ALL SELECT 'vehicle.mercedes.sprinter' AS carla_blueprint_id, 'Mercedes Sprinter' AS display_name, 5.915 AS length_m, 1.988 AS width_m, 2.561 AS height_m, 4 AS num_wheels, 3000.0 AS mass_kg, 0.5 AS drag_coefficient, 0.6 AS center_of_mass_x_m, 0.0 AS center_of_mass_y_m, -0.8 AS center_of_mass_z_m, 3.5 AS tire_friction, 1500.0 AS max_brake_torque_nm, 3.658 AS wheelbase_m, NULL AS max_speed_mps, 9.5 AS max_brake_decel_mps2, 5.69 AS carla_full_brake_decel_mps2, TRUE AS is_supported
  UNION ALL SELECT 'vehicle.carlamotors.european_hgv' AS carla_blueprint_id, 'CarlaMotors European HGV' AS display_name, 7.936 AS length_m, 2.891 AS width_m, 3.462 AS height_m, 6 AS num_wheels, 7000.0 AS mass_kg, 0.3 AS drag_coefficient, 0.8 AS center_of_mass_x_m, 0.0 AS center_of_mass_y_m, -1.2 AS center_of_mass_z_m, 3.5 AS tire_friction, 1500.0 AS max_brake_torque_nm, 3.823 AS wheelbase_m, NULL AS max_speed_mps, 9.5 AS max_brake_decel_mps2, 1.77 AS carla_full_brake_decel_mps2, FALSE AS is_supported
) AS v
WHERE v.carla_blueprint_id NOT IN (SELECT carla_blueprint_id FROM (SELECT carla_blueprint_id FROM carla_vehicle_models) AS existing);
