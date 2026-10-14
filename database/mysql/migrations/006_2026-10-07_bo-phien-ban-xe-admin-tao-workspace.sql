-- =====================================================================
-- Migration 006 — 07/10/2026: bỏ phiên bản xe, Admin tạo workspace + gán Manager, báo cáo theo project
-- (30 → 29 bảng). Chi tiết và lý do: docs/adr/ADR-038-bo-phien-ban-xe-admin-tao-workspace.md
--
-- Dành cho DB MySQL đã chạy migration 005 (30 bảng). DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG
-- cần chạy. Chạy MỘT lần, từ thư mục gốc repo (luôn utf8mb4), SAU KHI sao lưu:
--   docker compose exec mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction vehicsim > /tmp/backup.sql'
--   docker compose cp database/mysql/migrations/006_2026-10-07_bo-phien-ban-xe-admin-tao-workspace.sql mysql:/tmp/006.sql
--   docker compose exec mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim < /tmp/006.sql'
--
-- Đổi dữ liệu:
--   - Thông số vật lý của phiên bản xe đang dùng (is_active; không có thì bản mới nhất) chép sang mẫu xe
--     carla_vehicle_models. Nếu nhiều project dùng cùng một mẫu xe với thông số khác nhau, lấy bản của
--     project có id nhỏ nhất. Mẫu xe chưa có phiên bản nào thì bị xoá (không có thông số, không ai dùng).
--   - projects.carla_vehicle_model_id = mẫu xe của phiên bản đang dùng.
--   - simulation_runs / regression_tests / optimization_runs / sensors: vehicle_version_id → mẫu xe của
--     phiên bản đó. Khoá ngoại ghép của regression (fk_sr_baseline, fk_sr_regression) dựng lại trên mẫu xe
--     và được MySQL kiểm lại trên toàn bộ dữ liệu cũ khi thêm.
--   - workspaces: created_by_user_id = người duyệt, không có thì người xin, không có thì manager.
--     PENDING_APPROVAL / REJECTED → ARCHIVED (Admin mở lại nếu cần).
--   - workspace_task_reports → task_reports, project_id lấy từ task. Báo cáo của task không gắn project
--     không chép được (bảng chưa có code ghi nên đang rỗng).
--   - notifications WORKSPACE_REQUESTED / WORKSPACE_DECIDED → SYSTEM; thêm loại WORKSPACE_ASSIGNED.
-- =====================================================================
SET NAMES utf8mb4;

-- 1. Thông số xe → danh mục mẫu xe
ALTER TABLE carla_vehicle_models
  ADD COLUMN mass_kg                     DECIMAL(8,2) NULL COMMENT 'VehiclePhysicsControl.mass' AFTER num_wheels,
  ADD COLUMN drag_coefficient            DECIMAL(4,3) NULL COMMENT 'VehiclePhysicsControl.drag_coefficient' AFTER mass_kg,
  ADD COLUMN center_of_mass_x_m          DECIMAL(6,3) NULL COMMENT 'VehiclePhysicsControl.center_of_mass (m, so với gốc actor); đủ x/y/z hoặc để trống cả ba' AFTER drag_coefficient,
  ADD COLUMN center_of_mass_y_m          DECIMAL(6,3) NULL AFTER center_of_mass_x_m,
  ADD COLUMN center_of_mass_z_m          DECIMAL(6,3) NULL AFTER center_of_mass_y_m,
  ADD COLUMN tire_friction               DECIMAL(4,2) NULL COMMENT 'WheelPhysicsControl.tire_friction, mọi bánh (ma sát mặt đường thuộc kịch bản)' AFTER center_of_mass_z_m,
  ADD COLUMN max_brake_torque_nm         DECIMAL(8,2) NULL COMMENT 'WheelPhysicsControl.max_brake_torque, mọi bánh' AFTER tire_friction,
  ADD COLUMN wheelbase_m                 DECIMAL(5,3) NULL COMMENT 'Đối chiếu với vị trí bánh của blueprint' AFTER max_brake_torque_nm,
  ADD COLUMN max_speed_mps               DECIMAL(6,2) NULL AFTER wheelbase_m,
  ADD COLUMN max_brake_decel_mps2        DECIMAL(5,2) NULL COMMENT 'Giới hạn phanh của xe — bộ động học dùng; AEB không xin quá mức này' AFTER max_speed_mps,
  ADD COLUMN carla_full_brake_decel_mps2 DECIMAL(5,2) NULL COMMENT 'Đo trên CARLA: giảm tốc khi phanh 100% — runner đổi giảm tốc AEB ra bàn đạp (TD-17)' AFTER max_brake_decel_mps2;

-- Phiên bản đại diện cho mỗi mẫu xe: đang dùng trước, rồi project id nhỏ nhất, rồi bản mới nhất.
UPDATE carla_vehicle_models m
JOIN (
  SELECT vv.*, ROW_NUMBER() OVER (PARTITION BY vv.carla_vehicle_model_id
                                  ORDER BY vv.is_active DESC, vv.project_id, vv.version_no DESC) AS rn
  FROM vehicle_versions vv
) v ON v.carla_vehicle_model_id = m.id AND v.rn = 1
SET m.mass_kg = v.mass_kg, m.drag_coefficient = v.drag_coefficient,
    m.center_of_mass_x_m = v.center_of_mass_x_m, m.center_of_mass_y_m = v.center_of_mass_y_m,
    m.center_of_mass_z_m = v.center_of_mass_z_m, m.tire_friction = v.tire_friction,
    m.max_brake_torque_nm = v.max_brake_torque_nm, m.wheelbase_m = v.wheelbase_m,
    m.max_speed_mps = v.max_speed_mps, m.max_brake_decel_mps2 = v.max_brake_decel_mps2,
    m.carla_full_brake_decel_mps2 = v.carla_full_brake_decel_mps2;
DELETE FROM carla_vehicle_models WHERE mass_kg IS NULL;

ALTER TABLE carla_vehicle_models
  MODIFY mass_kg DECIMAL(8,2) NOT NULL COMMENT 'VehiclePhysicsControl.mass',
  MODIFY max_brake_decel_mps2 DECIMAL(5,2) NOT NULL COMMENT 'Giới hạn phanh của xe — bộ động học dùng; AEB không xin quá mức này',
  ADD CONSTRAINT ck_cvm_physics CHECK (mass_kg > 0 AND max_brake_decel_mps2 > 0
                                   AND (max_speed_mps IS NULL OR max_speed_mps > 0)
                                   AND (max_brake_torque_nm IS NULL OR max_brake_torque_nm > 0)
                                   AND (carla_full_brake_decel_mps2 IS NULL OR carla_full_brake_decel_mps2 > 0)
                                   AND (drag_coefficient IS NULL OR drag_coefficient > 0)
                                   AND (tire_friction IS NULL OR tire_friction > 0)),
  ADD CONSTRAINT ck_cvm_center_of_mass CHECK ((center_of_mass_x_m IS NULL) = (center_of_mass_y_m IS NULL)
                                          AND (center_of_mass_y_m IS NULL) = (center_of_mass_z_m IS NULL));

-- 2. Cột mẫu xe mới, điền từ phiên bản xe cũ
ALTER TABLE projects ADD COLUMN carla_vehicle_model_id BIGINT UNSIGNED NULL
  COMMENT 'Xe project đang dùng cho run mới (UC-23); đổi xe thì run cũ giữ xe của nó' AFTER created_by_user_id;
UPDATE projects p
JOIN vehicle_versions vv ON vv.project_id = p.id AND vv.is_active = 1
SET p.carla_vehicle_model_id = vv.carla_vehicle_model_id;

ALTER TABLE simulation_runs  ADD COLUMN carla_vehicle_model_id BIGINT UNSIGNED NULL AFTER scenario_version_id;
ALTER TABLE regression_tests ADD COLUMN carla_vehicle_model_id BIGINT UNSIGNED NULL
  COMMENT 'Mọi cặp run chạy đúng xe này' AFTER candidate_aeb_version_id;
ALTER TABLE optimization_runs ADD COLUMN carla_vehicle_model_id BIGINT UNSIGNED NULL AFTER base_aeb_version_id;
ALTER TABLE sensors ADD COLUMN carla_vehicle_model_id BIGINT UNSIGNED NULL AFTER id;

UPDATE simulation_runs r  JOIN vehicle_versions vv ON vv.id = r.vehicle_version_id SET r.carla_vehicle_model_id = vv.carla_vehicle_model_id;
UPDATE regression_tests r JOIN vehicle_versions vv ON vv.id = r.vehicle_version_id SET r.carla_vehicle_model_id = vv.carla_vehicle_model_id;
UPDATE optimization_runs r JOIN vehicle_versions vv ON vv.id = r.vehicle_version_id SET r.carla_vehicle_model_id = vv.carla_vehicle_model_id;
UPDATE sensors s          JOIN vehicle_versions vv ON vv.id = s.vehicle_version_id SET s.carla_vehicle_model_id = vv.carla_vehicle_model_id;

-- 3. Gỡ khoá cũ trên phiên bản xe (FK trước, rồi khoá mà FK đang dựa vào)
ALTER TABLE simulation_runs
  DROP FOREIGN KEY fk_sr_vehicle, DROP FOREIGN KEY fk_sr_baseline, DROP FOREIGN KEY fk_sr_regression;
ALTER TABLE regression_tests DROP FOREIGN KEY fk_rt_vehicle;
ALTER TABLE optimization_runs DROP FOREIGN KEY fk_or_vehicle;
ALTER TABLE sensors DROP FOREIGN KEY fk_sensors_version;

ALTER TABLE simulation_runs
  DROP INDEX uq_sr_replay, DROP INDEX idx_sr_vehicle, DROP INDEX idx_sr_baseline, DROP INDEX idx_sr_regression,
  DROP COLUMN vehicle_version_id,
  MODIFY carla_vehicle_model_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE regression_tests
  DROP INDEX uq_rt_run_scope, DROP INDEX idx_rt_vehicle,
  DROP COLUMN vehicle_version_id,
  MODIFY carla_vehicle_model_id BIGINT UNSIGNED NOT NULL COMMENT 'Mọi cặp run chạy đúng xe này';
ALTER TABLE optimization_runs
  DROP INDEX idx_or_vehicle,
  DROP COLUMN vehicle_version_id,
  MODIFY carla_vehicle_model_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE sensors
  DROP INDEX uq_sensors_version_name,
  DROP COLUMN vehicle_version_id,
  MODIFY carla_vehicle_model_id BIGINT UNSIGNED NOT NULL;

DROP TABLE vehicle_versions;

-- 4. Khoá mới trên mẫu xe (MySQL kiểm lại toàn bộ dữ liệu cũ khi thêm FK)
ALTER TABLE regression_tests
  ADD UNIQUE KEY uq_rt_run_scope (id, candidate_aeb_version_id, carla_vehicle_model_id, simulator_version),
  ADD KEY idx_rt_vehicle (carla_vehicle_model_id),
  ADD CONSTRAINT fk_rt_vehicle FOREIGN KEY (carla_vehicle_model_id) REFERENCES carla_vehicle_models(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE simulation_runs
  ADD UNIQUE KEY uq_sr_replay (id, scenario_version_id, random_seed, simulator_version, carla_vehicle_model_id),
  ADD KEY idx_sr_vehicle (carla_vehicle_model_id),
  ADD KEY idx_sr_baseline (baseline_run_id, scenario_version_id, random_seed, simulator_version, carla_vehicle_model_id),
  ADD KEY idx_sr_regression (regression_test_id, aeb_version_id, carla_vehicle_model_id, simulator_version);
-- Tách câu: FK tự tham chiếu cần khoá uq_sr_replay đã tồn tại.
ALTER TABLE simulation_runs
  ADD CONSTRAINT fk_sr_vehicle FOREIGN KEY (carla_vehicle_model_id) REFERENCES carla_vehicle_models(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_sr_baseline FOREIGN KEY (baseline_run_id, scenario_version_id, random_seed, simulator_version, carla_vehicle_model_id)
    REFERENCES simulation_runs(id, scenario_version_id, random_seed, simulator_version, carla_vehicle_model_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_sr_regression FOREIGN KEY (regression_test_id, aeb_version_id, carla_vehicle_model_id, simulator_version)
    REFERENCES regression_tests(id, candidate_aeb_version_id, carla_vehicle_model_id, simulator_version) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE optimization_runs
  ADD KEY idx_or_vehicle (carla_vehicle_model_id),
  ADD CONSTRAINT fk_or_vehicle FOREIGN KEY (carla_vehicle_model_id) REFERENCES carla_vehicle_models(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE sensors
  ADD UNIQUE KEY uq_sensors_model_name (carla_vehicle_model_id, name),
  ADD CONSTRAINT fk_sensors_model FOREIGN KEY (carla_vehicle_model_id) REFERENCES carla_vehicle_models(id) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE projects
  ADD KEY idx_projects_vehicle (carla_vehicle_model_id),
  ADD CONSTRAINT fk_projects_vehicle FOREIGN KEY (carla_vehicle_model_id) REFERENCES carla_vehicle_models(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- 5. Workspace: Admin tạo và gán Manager, bỏ xin / duyệt
ALTER TABLE workspaces ADD COLUMN created_by_user_id BIGINT UNSIGNED NULL COMMENT 'Admin tạo workspace' AFTER status;
UPDATE workspaces SET created_by_user_id = COALESCE(approved_by_user_id, requested_by_user_id, manager_id);
UPDATE workspaces SET status = 'ARCHIVED' WHERE status IN ('PENDING_APPROVAL', 'REJECTED');
ALTER TABLE workspaces
  DROP CHECK ck_workspaces_approval, DROP CHECK ck_workspaces_reject_note,
  DROP FOREIGN KEY fk_workspaces_requester, DROP FOREIGN KEY fk_workspaces_approver;
ALTER TABLE workspaces
  DROP INDEX idx_workspaces_requester, DROP INDEX idx_workspaces_approver,
  DROP COLUMN requested_by_user_id, DROP COLUMN approved_by_user_id, DROP COLUMN approved_at, DROP COLUMN review_note,
  MODIFY manager_id BIGINT UNSIGNED NOT NULL COMMENT 'MANAGER do Admin gán (service kiểm role)',
  MODIFY status ENUM('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  MODIFY created_by_user_id BIGINT UNSIGNED NOT NULL COMMENT 'Admin tạo workspace',
  ADD KEY idx_workspaces_creator (created_by_user_id),
  ADD CONSTRAINT fk_workspaces_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

UPDATE notifications SET type = 'SYSTEM' WHERE type IN ('WORKSPACE_REQUESTED', 'WORKSPACE_DECIDED');
ALTER TABLE notifications MODIFY type
  ENUM('SIMULATION_DONE','SIMULATION_FAILED','REGRESSION_DONE','RECOMMENDATION_PENDING',
       'RECOMMENDATION_DECIDED','TASK_ASSIGNED','REPORT_SUBMITTED','WORKSPACE_ASSIGNED',
       'MEMBER_ADDED','FAILURE_DETECTED','CANDIDATE_CREATED','SYSTEM') NOT NULL;

-- 6. Báo cáo công việc theo project, Manager duyệt
ALTER TABLE workspace_tasks ADD UNIQUE KEY uq_wt_id_project (id, project_id);

CREATE TABLE task_reports (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id           BIGINT UNSIGNED NOT NULL,
  task_id              BIGINT UNSIGNED NULL,
  submitted_by_user_id BIGINT UNSIGNED NOT NULL,
  report_title         VARCHAR(255)  NOT NULL,
  report_content       TEXT          NOT NULL,
  attachment_url       VARCHAR(1024) NULL,
  status               ENUM('SUBMITTED','APPROVED','REJECTED') NOT NULL DEFAULT 'SUBMITTED',
  reviewed_by_user_id  BIGINT UNSIGNED NULL COMMENT 'Manager duyệt',
  reviewed_at          DATETIME NULL,
  review_note          TEXT NULL,
  created_date         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tr_project_status (project_id, status),
  KEY idx_tr_task (task_id, project_id),
  KEY idx_tr_submitter (submitted_by_user_id),
  KEY idx_tr_reviewer (reviewed_by_user_id),
  CONSTRAINT fk_tr_project   FOREIGN KEY (project_id)           REFERENCES projects(id)                    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tr_task      FOREIGN KEY (task_id, project_id)  REFERENCES workspace_tasks(id, project_id) ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_tr_submitter FOREIGN KEY (submitted_by_user_id) REFERENCES users(id)                       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tr_reviewer  FOREIGN KEY (reviewed_by_user_id)  REFERENCES users(id)                       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_tr_review CHECK ((status = 'SUBMITTED') = (reviewed_by_user_id IS NULL AND reviewed_at IS NULL))
) ENGINE=InnoDB;

INSERT INTO task_reports (id, project_id, task_id, submitted_by_user_id, report_title, report_content, attachment_url,
                          status, reviewed_by_user_id, reviewed_at, review_note, created_date)
SELECT r.id, t.project_id, r.task_id, r.submitted_by_user_id, r.report_title, r.report_content, r.attachment_url,
       r.status, r.reviewed_by_user_id, r.reviewed_at, r.review_note, r.created_date
FROM workspace_task_reports r
JOIN workspace_tasks t ON t.id = r.task_id
WHERE t.project_id IS NOT NULL;

DROP TABLE workspace_task_reports;
