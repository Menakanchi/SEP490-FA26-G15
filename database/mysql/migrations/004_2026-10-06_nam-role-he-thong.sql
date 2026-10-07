-- =====================================================================
-- Migration 004 — 06/10/2026: 5 role hệ thống, mỗi người một role; bỏ cấu hình xe so sánh
-- và Meomeo Agent (36 → 32 bảng)
-- Chi tiết và lý do: docs/adr/ADR-035-nam-role-he-thong-bo-cau-hinh-xe-va-meomeo.md
--
-- Dành cho DB MySQL đã chạy migration 003 (36 bảng). DB tạo mới từ 01_schema.sql hiện tại
-- thì KHÔNG cần chạy. Chạy MỘT lần, từ thư mục gốc repo (luôn utf8mb4):
--   docker compose exec mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction vehicsim > /tmp/backup.sql'
--   docker compose cp database/mysql/migrations/004_2026-10-06_nam-role-he-thong.sql mysql:/tmp/004.sql
--   docker compose exec mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim < /tmp/004.sql'
--
-- Đổi dữ liệu: mỗi tài khoản giữ MỘT role — role cao nhất nó đang có theo thứ tự
-- ADMIN > MANAGER > EXPERIENCE; tài khoản không có role nào thành EXPERIENCE. Xoá hẳn
-- user_roles, vehicle_configurations, vehicle_comparisons (chưa có màn/API, 0 dòng trên DB dev)
-- và knowledge_chunks (dữ liệu dẫn xuất của Meomeo Agent). Có run purpose = VEHICLE_COMPARISON
-- thì bước 4 dừng lại — xoá các run đó trước.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. 5 role hệ thống
INSERT INTO roles (code, name, description) VALUES
  ('ENGINEER', 'Engineer', 'Làm toàn bộ quy trình kỹ thuật trong workspace: scenario, mô phỏng, tối ưu, regression'),
  ('REVIEWER', 'Reviewer', 'Xem kết quả và Accept / Reject Engineering Recommendation; không chạy mô phỏng');
UPDATE roles SET description = 'Quản trị toàn hệ thống và người dùng' WHERE code = 'ADMIN';
UPDATE roles SET description = 'Tạo workspace, thêm/bớt Engineer và Reviewer; không làm engineering, không duyệt'
WHERE code = 'MANAGER';
UPDATE roles
SET name = 'Experiencer',
    description = 'Người tự đăng ký: project cá nhân, mô phỏng, tối ưu, regression; không có recommendation / duyệt'
WHERE code = 'EXPERIENCE';

-- 2. Mỗi người đúng một role: users.role_id thay cho bảng user_roles
ALTER TABLE users
  ADD COLUMN role_id SMALLINT UNSIGNED NULL AFTER full_name,
  ADD COLUMN gender ENUM('MALE','FEMALE','OTHER') NULL AFTER role_id,
  ADD COLUMN date_of_birth DATE NULL AFTER gender,
  ADD COLUMN bio TEXT NULL AFTER date_of_birth;

UPDATE users u
JOIN (
  SELECT ur.user_id,
         MIN(CASE r.code WHEN 'ADMIN' THEN 1 WHEN 'MANAGER' THEN 2 WHEN 'REVIEWER' THEN 3
                         WHEN 'ENGINEER' THEN 4 ELSE 5 END) AS rank_no
  FROM user_roles ur JOIN roles r ON r.id = ur.role_id
  GROUP BY ur.user_id
) best ON best.user_id = u.id
JOIN roles r ON r.code = CASE best.rank_no WHEN 1 THEN 'ADMIN' WHEN 2 THEN 'MANAGER' WHEN 3 THEN 'REVIEWER'
                                           WHEN 4 THEN 'ENGINEER' ELSE 'EXPERIENCE' END
SET u.role_id = r.id;
UPDATE users SET role_id = (SELECT id FROM roles WHERE code = 'EXPERIENCE') WHERE role_id IS NULL;

ALTER TABLE users
  MODIFY role_id SMALLINT UNSIGNED NOT NULL,
  ADD KEY idx_users_role (role_id),
  ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE;
DROP TABLE user_roles;

-- 3. Thành viên workspace: vai trò lấy từ users.role_id
ALTER TABLE workspace_members DROP COLUMN member_role;

-- 4. Bỏ cấu hình xe để so sánh (ADR-033)
ALTER TABLE simulation_runs
  DROP CHECK ck_sr_vehicle_comparison,
  DROP CHECK ck_sr_main_vehicle;
ALTER TABLE simulation_runs
  DROP FOREIGN KEY fk_sr_vehicle_config,
  DROP FOREIGN KEY fk_sr_vehicle_comparison;
ALTER TABLE simulation_runs
  DROP KEY idx_sr_vehicle_config,
  DROP KEY idx_sr_vehicle_comparison,
  DROP COLUMN vehicle_configuration_id,
  DROP COLUMN vehicle_comparison_id,
  MODIFY purpose ENUM('MANUAL','BASELINE','OPTIMIZATION','REGRESSION','ROBUSTNESS') NOT NULL DEFAULT 'MANUAL';
DROP TABLE vehicle_comparisons;
DROP TABLE vehicle_configurations;

-- 5. Bỏ Meomeo Agent
DROP TABLE knowledge_chunks;

SET FOREIGN_KEY_CHECKS = 1;

-- 6. View truy vết không còn cột cấu hình xe
CREATE OR REPLACE VIEW v_simulation_traceability AS
SELECT
  sr.id                 AS simulation_run_id,
  p.id                  AS project_id,
  p.name                AS project_name,
  v.name                AS vehicle_name,
  sc.code               AS scenario_code,
  sv.version_number     AS scenario_version,
  asys.name             AS aeb_system,
  av.version_number     AS aeb_version,
  sr.random_seed,
  sr.status,
  sr.carla_version,
  sr.optimization_trial_id,
  ot.optimization_run_id,
  sr.regression_test_id,
  sr.baseline_run_id,
  sr.robustness_test_id
FROM simulation_runs sr
JOIN projects p           ON p.id  = sr.project_id
JOIN vehicles v           ON v.id  = sr.vehicle_id
JOIN scenario_versions sv ON sv.id = sr.scenario_version_id
JOIN scenarios sc         ON sc.id = sv.scenario_id
JOIN aeb_versions av      ON av.id = sr.aeb_version_id
JOIN aeb_systems asys     ON asys.id = av.aeb_system_id
LEFT JOIN optimization_trials ot ON ot.id = sr.optimization_trial_id;
