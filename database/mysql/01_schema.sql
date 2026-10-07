-- =====================================================================
-- VehicSim — MySQL 8.4 schema (30 bảng) — bản rút gọn, đủ 13 FE (ADR-036, ADR-037)
-- Từ điển dữ liệu (nghĩa từng cột, ai ghi, JSON): docs/vehicsim/database-schema.md
-- DB đã tạo từ bản cũ hơn: chạy các file trong database/mysql/migrations/ theo thứ tự
-- Backend: FastAPI (Python 3.11) + Celery / Redis · Simulator: CARLA 0.9.16 + bộ động học
-- Charset: utf8mb4 / utf8mb4_0900_ai_ci · Yêu cầu MySQL >= 8.0.16 (CHECK có hiệu lực)
--
-- Ngoài MySQL (không có bảng):
--   - OTP đăng ký / quên mật khẩu, rate limit: Redis có TTL (FE-01-05/06).
--   - Cấu hình hệ thống (LLM key, CARLA host): .env / Pydantic Settings.
--   - Nhật ký thao tác: file log của backend.
--   - Quyền theo role: kiểm ở FastAPI (role nào được ghi / duyệt).
--
-- Quy ước: khoá ngoại ghép (project_id, …) ép mọi dữ liệu kỹ thuật của một run / regression /
-- tối ưu thuộc CÙNG một project. Cột nằm trong CHECK thì FK của nó RESTRICT cả hai chiều
-- (MySQL ERROR 3823). Cột sinh dùng VIRTUAL.
-- =====================================================================
SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS vehicsim CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE vehicsim;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. TÀI KHOẢN (FE-01, FE-02)  — 2 bảng
-- ---------------------------------------------------------------------
CREATE TABLE roles (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        ENUM('ADMIN','MANAGER','ENGINEER','REVIEWER','EXPERIENCER') NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(500) NULL,
  created_date  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB;

-- Mỗi người đúng MỘT role (role_id). Tự đăng ký = EXPERIENCER; role khác do Admin cấp.
CREATE TABLE users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(255)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  role_id       INT UNSIGNED  NOT NULL COMMENT 'Mỗi người đúng 1 role; tự đăng ký = EXPERIENCER',
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE COMMENT 'ADMIN khóa/mở user; không xóa cứng để giữ lịch sử',
  last_login_at DATETIME      NULL,
  last_name     VARCHAR(80)   NOT NULL,
  middle_name   VARCHAR(80)   NULL,
  first_name    VARCHAR(80)   NOT NULL,
  date_of_birth DATE          NULL,
  gender        ENUM('MALE','FEMALE','OTHER') NULL,
  phone_number  VARCHAR(30)   NULL,
  address       VARCHAR(500)  NULL,
  bio           TEXT          NULL,
  avatar_url    VARCHAR(2048) NULL,
  created_date  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone_number),
  KEY idx_users_role (role_id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. WORKSPACE, CỘNG TÁC, TASK (FE-03, FE-13)  — 6 bảng
-- ---------------------------------------------------------------------
-- FE-03-03: Admin tạo (ACTIVE, có người duyệt) hoặc Manager xin (PENDING_APPROVAL) → Admin duyệt / từ chối.
CREATE TABLE workspaces (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                 VARCHAR(150) NOT NULL,
  description          TEXT         NULL,
  manager_id           BIGINT UNSIGNED NOT NULL,
  status               ENUM('PENDING_APPROVAL','ACTIVE','ARCHIVED','REJECTED') NOT NULL DEFAULT 'PENDING_APPROVAL',
  requested_by_user_id BIGINT UNSIGNED NULL,
  approved_by_user_id  BIGINT UNSIGNED NULL,
  approved_at          DATETIME NULL,
  review_note          TEXT NULL COMMENT 'Ghi chú khi Admin duyệt; bắt buộc khi REJECTED (lý do từ chối)',
  created_date           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_workspaces_manager_name (manager_id, name),
  KEY idx_workspaces_status (status),
  KEY idx_workspaces_requester (requested_by_user_id),
  KEY idx_workspaces_approver (approved_by_user_id),
  CONSTRAINT fk_workspaces_manager   FOREIGN KEY (manager_id)           REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_workspaces_requester FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_workspaces_approver  FOREIGN KEY (approved_by_user_id)  REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_workspaces_approval CHECK (
    (status = 'PENDING_APPROVAL' AND approved_by_user_id IS NULL AND approved_at IS NULL)
    OR (status IN ('ACTIVE','REJECTED') AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL)
    OR status = 'ARCHIVED'),
  CONSTRAINT ck_workspaces_reject_note CHECK (status <> 'REJECTED' OR review_note IS NOT NULL)
) ENGINE=InnoDB;

-- Manager thêm Engineer / Reviewer (service kiểm role).
CREATE TABLE workspace_members (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id     BIGINT UNSIGNED NOT NULL,
  user_id          BIGINT UNSIGNED NOT NULL,
  added_by_user_id BIGINT UNSIGNED NULL,
  joined_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_workspace_members (workspace_id, user_id),
  KEY idx_wm_user (user_id),
  KEY idx_wm_added_by (added_by_user_id),
  CONSTRAINT fk_wm_workspace FOREIGN KEY (workspace_id)     REFERENCES workspaces(id) ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_wm_user      FOREIGN KEY (user_id)          REFERENCES users(id)      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_wm_added_by  FOREIGN KEY (added_by_user_id) REFERENCES users(id)      ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- FE-03-06: kênh chat của workspace.
CREATE TABLE workspace_messages (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id BIGINT UNSIGNED NOT NULL,
  sender_id    BIGINT UNSIGNED NOT NULL,
  message_text TEXT NOT NULL,
  created_date   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at    DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_wmsg_workspace_time (workspace_id, created_date),
  KEY idx_wmsg_sender (sender_id),
  CONSTRAINT fk_wmsg_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_wmsg_sender    FOREIGN KEY (sender_id)    REFERENCES users(id)      ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- FE-03-08: thông báo cho từng người.
CREATE TABLE notifications (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        BIGINT UNSIGNED NOT NULL,
  workspace_id   BIGINT UNSIGNED NULL,
  type           ENUM('SIMULATION_DONE','SIMULATION_FAILED','REGRESSION_DONE','RECOMMENDATION_PENDING',
                      'RECOMMENDATION_DECIDED','TASK_ASSIGNED','REPORT_SUBMITTED','WORKSPACE_REQUESTED',
                      'WORKSPACE_DECIDED','MEMBER_ADDED','FAILURE_DETECTED','CANDIDATE_CREATED',
                      'SYSTEM') NOT NULL,
  title          VARCHAR(255) NOT NULL,
  content        TEXT NOT NULL,
  reference_type VARCHAR(50)  NULL COMMENT 'SIMULATION_RUN, TASK, RECOMMENDATION, WORKSPACE…',
  reference_id   BIGINT UNSIGNED NULL,
  is_read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_date     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user_read (user_id, is_read),
  KEY idx_notif_workspace (workspace_id),
  KEY idx_notif_reference (reference_type, reference_id),
  CONSTRAINT fk_notif_user      FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_notif_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- FE-03-07, FE-13-01/02: task; Manager giao, Engineer / Reviewer làm.
CREATE TABLE workspace_tasks (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id        BIGINT UNSIGNED NOT NULL,
  project_id          BIGINT UNSIGNED NULL,
  title               VARCHAR(255) NOT NULL,
  description         TEXT NULL,
  priority            ENUM('LOW','MEDIUM','HIGH','URGENT') NOT NULL DEFAULT 'MEDIUM',
  status              ENUM('TODO','IN_PROGRESS','REVIEW','DONE') NOT NULL DEFAULT 'TODO',
  progress_pct        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  assigned_to_user_id BIGINT UNSIGNED NULL,
  created_by_user_id  BIGINT UNSIGNED NOT NULL,
  due_date            DATE NULL,
  created_date          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wt_workspace_status (workspace_id, status),
  KEY idx_wt_project (project_id),
  KEY idx_wt_assignee (assigned_to_user_id),
  KEY idx_wt_creator (created_by_user_id),
  CONSTRAINT fk_wt_workspace FOREIGN KEY (workspace_id)        REFERENCES workspaces(id) ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_wt_project   FOREIGN KEY (project_id)          REFERENCES projects(id)   ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_wt_assignee  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)      ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_wt_creator   FOREIGN KEY (created_by_user_id)  REFERENCES users(id)      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_wt_progress CHECK (progress_pct <= 100)
) ENGINE=InnoDB;

-- FE-13-03/04: báo cáo kết quả công việc của task; Manager duyệt.
CREATE TABLE workspace_task_reports (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id              BIGINT UNSIGNED NOT NULL,
  submitted_by_user_id BIGINT UNSIGNED NOT NULL,
  report_title         VARCHAR(255)  NOT NULL,
  report_content       TEXT          NOT NULL,
  attachment_url       VARCHAR(1024) NULL,
  status               ENUM('SUBMITTED','APPROVED','REJECTED') NOT NULL DEFAULT 'SUBMITTED',
  reviewed_by_user_id  BIGINT UNSIGNED NULL,
  reviewed_at          DATETIME NULL,
  review_note          TEXT NULL,
  created_date           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wtr_task (task_id),
  KEY idx_wtr_submitter (submitted_by_user_id),
  KEY idx_wtr_reviewer (reviewed_by_user_id),
  CONSTRAINT fk_wtr_task      FOREIGN KEY (task_id)              REFERENCES workspace_tasks(id) ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_wtr_submitter FOREIGN KEY (submitted_by_user_id) REFERENCES users(id)           ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_wtr_reviewer  FOREIGN KEY (reviewed_by_user_id)  REFERENCES users(id)           ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_wtr_review CHECK ((status = 'SUBMITTED') = (reviewed_by_user_id IS NULL AND reviewed_at IS NULL))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. PROJECT & VEHICLE DIGITAL TWIN (FE-04)  — 5 bảng
-- ---------------------------------------------------------------------
-- Người dùng tự tạo project: Workspace Project (workspace_id có giá trị, ENGINEER tạo) / Personal Project
-- (NULL, EXPERIENCER tạo). Người tạo là owner; thành viên khác nằm ở project_members (ADR-037).
-- Project đã có run thì chỉ ARCHIVED, không xoá (FK RESTRICT ở các bảng con).
CREATE TABLE projects (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id       BIGINT UNSIGNED NULL,
  name               VARCHAR(150) NOT NULL,
  description        TEXT NULL,
  status             ENUM('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  -- = người tạo khi là project cá nhân, NULL khi thuộc workspace: UNIQUE chặn trùng tên project cá nhân.
  personal_owner_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(workspace_id IS NULL, created_by_user_id, NULL)) VIRTUAL,
  created_date         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_projects_ws_name (workspace_id, name),
  UNIQUE KEY uq_projects_personal_name (personal_owner_key, name),
  UNIQUE KEY uq_projects_id_ws (id, workspace_id),
  KEY idx_projects_creator (created_by_user_id),
  CONSTRAINT fk_projects_workspace FOREIGN KEY (workspace_id)       REFERENCES workspaces(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_projects_creator   FOREIGN KEY (created_by_user_id) REFERENCES users(id)      ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- UC-72/73/74: thành viên project (thêm / xoá / xem). Chỉ project thuộc workspace mới có thành viên, và thành
-- viên phải đang ở workspace đó: FK ghép (project_id, workspace_id) -> projects, (workspace_id, user_id) ->
-- workspace_members. Rời workspace thì tự rời mọi project của workspace (CASCADE). Owner (người tạo) không cần
-- dòng ở đây. Không có cột role: mỗi người một role hệ thống (users.role_id, ADR-035/037).
CREATE TABLE project_members (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id       BIGINT UNSIGNED NOT NULL,
  workspace_id     BIGINT UNSIGNED NOT NULL COMMENT 'Bằng projects.workspace_id; project cá nhân không có thành viên',
  user_id          BIGINT UNSIGNED NOT NULL,
  added_by_user_id BIGINT UNSIGNED NULL,
  joined_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_members (project_id, user_id),
  KEY idx_pm_project_ws (project_id, workspace_id),
  KEY idx_pm_ws_user (workspace_id, user_id),
  KEY idx_pm_user (user_id),
  KEY idx_pm_added_by (added_by_user_id),
  CONSTRAINT fk_pm_project   FOREIGN KEY (project_id, workspace_id) REFERENCES projects(id, workspace_id)                    ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_pm_ws_member FOREIGN KEY (workspace_id, user_id)    REFERENCES workspace_members(workspace_id, user_id)    ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_pm_user      FOREIGN KEY (user_id)                  REFERENCES users(id)                                   ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_pm_added_by  FOREIGN KEY (added_by_user_id)         REFERENCES users(id)                                   ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- FE-04-01: danh mục blueprint CARLA; kích thước đọc từ bounding box (CARLA không cho đổi).
CREATE TABLE carla_vehicle_models (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  carla_blueprint_id VARCHAR(100) NOT NULL,
  display_name       VARCHAR(150) NULL,
  length_m           DECIMAL(6,3) NOT NULL,
  width_m            DECIMAL(6,3) NOT NULL,
  height_m           DECIMAL(6,3) NOT NULL,
  num_wheels         TINYINT UNSIGNED NOT NULL DEFAULT 4,
  is_supported       BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cvm_blueprint (carla_blueprint_id),
  CONSTRAINT ck_cvm_dims   CHECK (length_m > 0 AND width_m > 0 AND height_m > 0),
  CONSTRAINT ck_cvm_wheels CHECK (num_wheels IN (2, 4))
) ENGINE=InnoDB;

-- FE-04-02/03: xe của project = các phiên bản Digital Twin. Đúng MỘT version đang dùng mỗi project
-- ("một project dùng một xe tại một thời điểm"). Version đã có run thì không sửa — tạo version mới.
CREATE TABLE vehicle_versions (
  id                         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id                 BIGINT UNSIGNED NOT NULL,
  carla_vehicle_model_id     BIGINT UNSIGNED NOT NULL,
  version_no                 INT UNSIGNED NOT NULL,
  name                       VARCHAR(100) NOT NULL DEFAULT 'Ego Vehicle',
  -- Ép vào CARLA bằng apply_physics_control (VehiclePhysicsControl / WheelPhysicsControl, 0.9.16).
  mass_kg                    DECIMAL(8,2) NOT NULL COMMENT 'VehiclePhysicsControl.mass',
  drag_coefficient           DECIMAL(4,3) NULL COMMENT 'VehiclePhysicsControl.drag_coefficient',
  center_of_mass_x_m         DECIMAL(6,3) NULL COMMENT 'VehiclePhysicsControl.center_of_mass (m, so với gốc actor); đủ x/y/z hoặc để trống cả ba',
  center_of_mass_y_m         DECIMAL(6,3) NULL,
  center_of_mass_z_m         DECIMAL(6,3) NULL,
  tire_friction              DECIMAL(4,2) NULL COMMENT 'WheelPhysicsControl.tire_friction, mọi bánh (ma sát mặt đường thuộc kịch bản)',
  max_brake_torque_nm        DECIMAL(8,2) NULL COMMENT 'WheelPhysicsControl.max_brake_torque, mọi bánh',
  -- Chỉ đối chiếu / bộ động học dùng: CARLA lấy từ mesh hoặc từ vật lý, không ép được.
  wheelbase_m                DECIMAL(5,3) NULL COMMENT 'Đối chiếu với vị trí bánh của blueprint',
  max_speed_mps              DECIMAL(6,2) NULL,
  max_brake_decel_mps2       DECIMAL(5,2) NOT NULL COMMENT 'Giới hạn phanh của xe — bộ động học dùng; AEB không xin quá mức này',
  carla_full_brake_decel_mps2 DECIMAL(5,2) NULL COMMENT 'Đo trên CARLA: giảm tốc khi phanh 100% — runner đổi giảm tốc AEB ra bàn đạp (TD-17)',
  calibration_status         ENUM('UNVERIFIED','CALIBRATED','VERIFIED') NOT NULL DEFAULT 'UNVERIFIED',
  calibration_notes          TEXT NULL,
  calibrated_by_user_id      BIGINT UNSIGNED NULL COMMENT 'Người xác nhận CALIBRATED / VERIFIED',
  calibrated_at              DATETIME NULL,
  is_active                 BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Version đang dùng cho run mới',
  active_project_key         BIGINT UNSIGNED GENERATED ALWAYS AS (IF(is_active, project_id, NULL)) VIRTUAL,
  created_by_user_id         BIGINT UNSIGNED NOT NULL,
  created_date                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vv_project_version (project_id, version_no),
  UNIQUE KEY uq_vv_project_id (project_id, id),
  UNIQUE KEY uq_vv_one_active (active_project_key),
  KEY idx_vv_model (carla_vehicle_model_id),
  KEY idx_vv_creator (created_by_user_id),
  KEY idx_vv_calibrator (calibrated_by_user_id),
  CONSTRAINT fk_vv_project FOREIGN KEY (project_id)             REFERENCES projects(id)             ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_vv_model   FOREIGN KEY (carla_vehicle_model_id) REFERENCES carla_vehicle_models(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_vv_creator FOREIGN KEY (created_by_user_id)     REFERENCES users(id)                ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_vv_calibrator FOREIGN KEY (calibrated_by_user_id) REFERENCES users(id)              ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- UNVERIFIED thì chưa ai xác nhận; CALIBRATED / VERIFIED phải ghi người và thời điểm.
  CONSTRAINT ck_vv_calibration CHECK ((calibration_status = 'UNVERIFIED') = (calibrated_by_user_id IS NULL AND calibrated_at IS NULL)),
  CONSTRAINT ck_vv_physics CHECK (mass_kg > 0 AND max_brake_decel_mps2 > 0
                                  AND (max_speed_mps IS NULL OR max_speed_mps > 0)
                                  AND (max_brake_torque_nm IS NULL OR max_brake_torque_nm > 0)
                                  AND (carla_full_brake_decel_mps2 IS NULL OR carla_full_brake_decel_mps2 > 0)
                                  AND (drag_coefficient IS NULL OR drag_coefficient > 0)
                                  AND (tire_friction IS NULL OR tire_friction > 0)),
  CONSTRAINT ck_vv_center_of_mass CHECK ((center_of_mass_x_m IS NULL) = (center_of_mass_y_m IS NULL)
                                         AND (center_of_mass_y_m IS NULL) = (center_of_mass_z_m IS NULL))
) ENGINE=InnoDB;

-- FE-04, FE-08-03: cảm biến gắn trên một phiên bản xe (vị trí tương đối với xe).
CREATE TABLE sensors (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_version_id BIGINT UNSIGNED NOT NULL,
  name               VARCHAR(100) NOT NULL,
  sensor_type        ENUM('RGB_CAMERA','DEPTH_CAMERA','SEMANTIC_SEGMENTATION','INSTANCE_SEGMENTATION',
                          'LIDAR','SEMANTIC_LIDAR','RADAR','COLLISION','OBSTACLE','LANE_INVASION') NOT NULL,
  carla_blueprint_id VARCHAR(100) NOT NULL COMMENT 'vd: sensor.camera.rgb, sensor.lidar.ray_cast, sensor.other.radar',
  location_x_m       DECIMAL(7,3) NOT NULL DEFAULT 0,
  location_y_m       DECIMAL(7,3) NOT NULL DEFAULT 0,
  location_z_m       DECIMAL(7,3) NOT NULL DEFAULT 0,
  rotation_pitch_deg DECIMAL(7,3) NOT NULL DEFAULT 0,
  rotation_yaw_deg   DECIMAL(7,3) NOT NULL DEFAULT 0,
  rotation_roll_deg  DECIMAL(7,3) NOT NULL DEFAULT 0,
  attributes_json    JSON NULL COMMENT 'Attribute đúng tên blueprint CARLA (image_size_x, fov, range, sensor_tick…)',
  is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sensors_version_name (vehicle_version_id, name),
  CONSTRAINT fk_sensors_version FOREIGN KEY (vehicle_version_id) REFERENCES vehicle_versions(id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. AEB (FE-09)  — 3 bảng  (một hệ AEB mỗi project)
-- ---------------------------------------------------------------------
CREATE TABLE aeb_parameters (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(50)   NOT NULL,
  name          VARCHAR(100)  NOT NULL,
  category      ENUM('PERCEPTION','DECISION','CONTROL','VEHICLE_DYNAMICS') NOT NULL,
  unit          VARCHAR(20)   NOT NULL,
  min_value     DECIMAL(14,6) NOT NULL COMMENT 'Biên dưới — kiểm giá trị + không gian tìm kiếm của tối ưu',
  max_value     DECIMAL(14,6) NOT NULL,
  default_value DECIMAL(14,6) NOT NULL,
  description   TEXT          NULL,
  sort_order    TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aeb_parameters_code (code),
  UNIQUE KEY uq_aeb_parameters_sort (sort_order),
  CONSTRAINT ck_aeb_params_range CHECK (min_value < max_value AND default_value BETWEEN min_value AND max_value)
) ENGINE=InnoDB;

-- Đúng MỘT BASELINE mỗi project. Accept: hạ BASELINE cũ → ARCHIVED trước, rồi nâng candidate.
CREATE TABLE aeb_versions (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id           BIGINT UNSIGNED NOT NULL,
  version_no           INT UNSIGNED NOT NULL,
  label                VARCHAR(100) NULL COMMENT 'vd: v1.0, v1.1',
  status               ENUM('DRAFT','BASELINE','CANDIDATE','ACCEPTED','REJECTED','ARCHIVED') NOT NULL DEFAULT 'CANDIDATE',
  source               ENUM('MANUAL','OPTIMIZATION') NOT NULL DEFAULT 'MANUAL',
  parent_version_id    BIGINT UNSIGNED NULL,
  notes                TEXT NULL COMMENT 'Kỹ sư ghi vì sao tạo version này (vd: TTC 1,8 s phanh sớm hơn)',
  baseline_project_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'BASELINE', project_id, NULL)) VIRTUAL,
  created_by_user_id   BIGINT UNSIGNED NOT NULL,
  created_date           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aeb_versions_no (project_id, version_no),
  UNIQUE KEY uq_aeb_versions_project_id (project_id, id),
  UNIQUE KEY uq_aeb_versions_one_baseline (baseline_project_key),
  KEY idx_aeb_versions_parent (project_id, parent_version_id),
  KEY idx_aeb_versions_creator (created_by_user_id),
  CONSTRAINT fk_aeb_versions_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_aeb_versions_parent  FOREIGN KEY (project_id, parent_version_id) REFERENCES aeb_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_aeb_versions_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_aeb_versions_no CHECK (version_no > 0)
) ENGINE=InnoDB;

-- Mỗi version đủ 10 dòng; giá trị trong [min_value, max_value] — service kiểm (CHECK không so được bảng khác).
CREATE TABLE aeb_parameter_values (
  aeb_version_id BIGINT UNSIGNED NOT NULL,
  parameter_id   INT UNSIGNED NOT NULL,
  param_value    DECIMAL(14,6) NOT NULL,
  PRIMARY KEY (aeb_version_id, parameter_id),
  KEY idx_apv_param (parameter_id),
  CONSTRAINT fk_apv_version FOREIGN KEY (aeb_version_id) REFERENCES aeb_versions(id)   ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_apv_param   FOREIGN KEY (parameter_id)   REFERENCES aeb_parameters(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_apv_nonneg CHECK (param_value >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. KỊCH BẢN (FE-05, FE-06)  — 2 bảng
-- ---------------------------------------------------------------------
-- Một scenario = một họ kịch bản (Scenario Family).
CREATE TABLE scenarios (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id         BIGINT UNSIGNED NOT NULL,
  code               VARCHAR(30)  NOT NULL COMMENT 'S01, S02…',
  name               VARCHAR(150) NOT NULL,
  description        TEXT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_date         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scenarios_code (project_id, code),
  UNIQUE KEY uq_scenarios_name (project_id, name),
  UNIQUE KEY uq_scenarios_project_id (project_id, id),
  KEY idx_scenarios_creator (created_by_user_id),
  CONSTRAINT fk_scenarios_project FOREIGN KEY (project_id)         REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_scenarios_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- Bản gốc (NATURAL_LANGUAGE / MANUAL / IMPORTED_XOSC) + các biến thể GENERATED (parent = bản gốc CÙNG họ).
-- Cột ego_speed_kmh … road_friction là điểm của biến thể, để lọc ca lỗi (FE-10-06); bản gốc để NULL.
CREATE TABLE scenario_versions (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scenario_id            BIGINT UNSIGNED NOT NULL,
  version_no             INT UNSIGNED NOT NULL,
  source                 ENUM('NATURAL_LANGUAGE','MANUAL','IMPORTED_XOSC','GENERATED') NOT NULL,
  parent_version_id      BIGINT UNSIGNED NULL,
  natural_language_input TEXT NULL,
  llm_model              VARCHAR(100) NULL,
  scenario_ir_json       JSON NOT NULL COMMENT 'Bản gốc: không gian tham số; biến thể: một điểm của lưới',
  ego_speed_kmh          DECIMAL(6,2) NULL,
  trigger_distance_m     DECIMAL(6,2) NULL,
  pedestrian_speed_mps   DECIMAL(5,2) NULL,
  stops_at_curb          BOOLEAN NULL COMMENT 'Người đi bộ dừng ở lề — ca đo phanh oan',
  weather                ENUM('CLEAR','CLOUDY','RAIN','HEAVY_RAIN','FOG') NULL,
  time_of_day            ENUM('DAY','DUSK','NIGHT') NULL,
  road_friction          DECIMAL(4,2) NULL COMMENT 'μ mặt đường; bộ động học dùng. CARLA chưa ép được vào vật lý (TD-17), chỉ có hình ảnh mưa',
  openscenario_version   VARCHAR(20) NULL,
  openscenario_content   LONGTEXT NULL COMMENT 'Nội dung .xosc (FE-06-09)',
  opendrive_content      LONGTEXT NULL COMMENT 'NULL = map có sẵn của CARLA',
  map_name               VARCHAR(100) NULL COMMENT 'vd: Town10HD',
  validation_status      ENUM('NOT_VALIDATED','VALID','INVALID') NOT NULL DEFAULT 'NOT_VALIDATED',
  status_message         TEXT NULL,
  created_by_user_id     BIGINT UNSIGNED NOT NULL,
  created_date             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sv_no (scenario_id, version_no),
  UNIQUE KEY uq_sv_scenario_id (scenario_id, id),
  KEY idx_sv_parent (scenario_id, parent_version_id),
  KEY idx_sv_filter (weather, time_of_day, ego_speed_kmh),
  KEY idx_sv_creator (created_by_user_id),
  CONSTRAINT fk_sv_scenario FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sv_parent   FOREIGN KEY (scenario_id, parent_version_id) REFERENCES scenario_versions(scenario_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sv_creator  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_sv_generated CHECK ((source = 'GENERATED') = (parent_version_id IS NOT NULL))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. TỐI ƯU & REGRESSION (FE-11, FE-12) — tạo trước simulation_runs vì run trỏ tới
-- ---------------------------------------------------------------------
-- FE-11-01: tối ưu trên CẢ HỌ kịch bản (chống học vẹt một kịch bản), xuất phát từ một AEB version.
-- Mọi trial chạy cùng MỘT phiên bản xe và MỘT bộ mô phỏng — nếu không, điểm số các trial không so được.
CREATE TABLE optimization_runs (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id            BIGINT UNSIGNED NOT NULL,
  scenario_id           BIGINT UNSIGNED NOT NULL,
  base_aeb_version_id   BIGINT UNSIGNED NOT NULL,
  vehicle_version_id    BIGINT UNSIGNED NOT NULL,
  simulator_version     VARCHAR(30) NOT NULL COMMENT 'vd: vehicsim-kinematic-1.0, carla-0.9.16 — như simulation_runs',
  name                  VARCHAR(150) NOT NULL,
  algorithm             ENUM('BAYESIAN_OPTIMIZATION','NSGA_II','RANDOM_SEARCH') NOT NULL,
  acquisition_function  ENUM('EI','UCB','PI') NULL COMMENT 'Chỉ với BAYESIAN_OPTIMIZATION',
  n_initial_points      INT UNSIGNED NULL COMMENT 'Số điểm khởi tạo trước khi hàm thu nhận chọn điểm',
  search_space_json     JSON NOT NULL COMMENT 'Tham số AEB được tối ưu + biên, con của [min_value, max_value]; vd {"TTC_THRESHOLD":[1.2,2.5]}',
  objective_config_json JSON NOT NULL COMMENT 'Mục tiêu (va chạm, phanh oan, độ êm) + trọng số / ràng buộc',
  max_trials            INT UNSIGNED NOT NULL,
  random_seed           BIGINT UNSIGNED NULL,
  status                ENUM('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  error_message         TEXT NULL,
  created_by_user_id    BIGINT UNSIGNED NOT NULL,
  started_at            DATETIME NULL,
  finished_at           DATETIME NULL,
  created_date            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_or_project_id (project_id, id),
  KEY idx_or_scenario (project_id, scenario_id),
  KEY idx_or_base (project_id, base_aeb_version_id),
  KEY idx_or_vehicle (project_id, vehicle_version_id),
  KEY idx_or_creator (created_by_user_id),
  CONSTRAINT fk_or_project  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_or_scenario FOREIGN KEY (project_id, scenario_id) REFERENCES scenarios(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_or_base     FOREIGN KEY (project_id, base_aeb_version_id) REFERENCES aeb_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_or_vehicle  FOREIGN KEY (project_id, vehicle_version_id) REFERENCES vehicle_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_or_creator  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_or_trials CHECK (max_trials > 0 AND (n_initial_points IS NULL OR n_initial_points <= max_trials)),
  CONSTRAINT ck_or_acquisition CHECK (acquisition_function IS NULL OR algorithm = 'BAYESIAN_OPTIMIZATION')
) ENGINE=InnoDB;

-- FE-11-03/04: mỗi lần thử = một candidate AEB version (đem đi regression được).
CREATE TABLE optimization_trials (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id               BIGINT UNSIGNED NOT NULL,
  optimization_run_id      BIGINT UNSIGNED NOT NULL,
  trial_number             INT UNSIGNED NOT NULL,
  candidate_aeb_version_id BIGINT UNSIGNED NOT NULL,
  sampling_source          ENUM('INITIAL_DESIGN','ACQUISITION','ACTIVE_LEARNING','MANUAL') NOT NULL DEFAULT 'INITIAL_DESIGN',
  acquisition_value        DECIMAL(14,6) NULL COMMENT 'EI / UCB / PI lúc chọn điểm',
  -- Ba mục tiêu của concept (va chạm ↔ phanh oan ↔ độ êm), tổng hợp trên cả họ — trục của Pareto front.
  collision_rate_pct        DECIMAL(5,2) NULL,
  false_activation_rate_pct DECIMAL(5,2) NULL,
  comfort_max_jerk_mps3     DECIMAL(8,3) NULL COMMENT 'Trung bình max jerk các run có phanh',
  objective_values_json    JSON NULL COMMENT 'Mục tiêu phụ: min TTC trung vị, tốc độ va chạm…',
  score                    DECIMAL(18,6) NULL COMMENT 'Mục tiêu vô hướng (BO / Random); NSGA-II dùng ba cột trên',
  constraint_violated      BOOLEAN NOT NULL DEFAULT FALSE,
  is_pareto_optimal        BOOLEAN NOT NULL DEFAULT FALSE,
  status                   ENUM('PENDING','RUNNING','COMPLETED','FAILED','PRUNED') NOT NULL DEFAULT 'PENDING',
  created_date               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at             DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ot_run_trial (optimization_run_id, trial_number),
  UNIQUE KEY uq_ot_candidate (candidate_aeb_version_id),
  UNIQUE KEY uq_ot_id_candidate (id, candidate_aeb_version_id),
  KEY idx_ot_run (project_id, optimization_run_id),
  KEY idx_ot_cand (project_id, candidate_aeb_version_id),
  CONSTRAINT fk_ot_run       FOREIGN KEY (project_id, optimization_run_id) REFERENCES optimization_runs(project_id, id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_ot_candidate FOREIGN KEY (project_id, candidate_aeb_version_id) REFERENCES aeb_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_ot_rates CHECK ((collision_rate_pct IS NULL OR collision_rate_pct BETWEEN 0 AND 100)
                                AND (false_activation_rate_pct IS NULL OR false_activation_rate_pct BETWEEN 0 AND 100))
) ENGINE=InnoDB;

-- FE-12-01/02: so candidate với baseline trên cả họ kịch bản, cùng seed, cùng xe, cùng bộ mô phỏng.
-- execution_status = chạy xong chưa; verdict = kết luận kỹ thuật (chỉ có khi đã COMPLETED).
CREATE TABLE regression_tests (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id               BIGINT UNSIGNED NOT NULL,
  scenario_id              BIGINT UNSIGNED NOT NULL,
  baseline_aeb_version_id  BIGINT UNSIGNED NOT NULL,
  candidate_aeb_version_id BIGINT UNSIGNED NOT NULL,
  vehicle_version_id       BIGINT UNSIGNED NOT NULL COMMENT 'Mọi cặp run chạy đúng phiên bản xe này',
  simulator_version        VARCHAR(30) NOT NULL COMMENT 'Mọi cặp run chạy đúng bộ mô phỏng này (không trộn động học với CARLA)',
  name                     VARCHAR(150) NULL,
  description              TEXT NULL,
  pass_criteria_json       JSON NOT NULL COMMENT 'vd: không va chạm mới, phanh oan tăng ≤ 0,5 điểm %',
  execution_status         ENUM('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  verdict                  ENUM('PENDING','PASSED','REGRESSED','FAILED') NOT NULL DEFAULT 'PENDING'
                           COMMENT 'PASSED = đạt mọi tiêu chí; REGRESSED = có ca baseline đạt mà candidate trượt; FAILED = trượt tiêu chí khác',
  total_scenarios          INT UNSIGNED NOT NULL DEFAULT 0,
  fixed_scenarios          INT UNSIGNED NOT NULL DEFAULT 0,
  regressed_scenarios      INT UNSIGNED NOT NULL DEFAULT 0,
  created_by_user_id       BIGINT UNSIGNED NOT NULL,
  created_date               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at              DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rt_project_id (project_id, id),
  UNIQUE KEY uq_rt_id_candidate (id, candidate_aeb_version_id),
  UNIQUE KEY uq_rt_run_scope (id, candidate_aeb_version_id, vehicle_version_id, simulator_version),  -- đích của fk_sr_regression
  KEY idx_rt_scenario (project_id, scenario_id),
  KEY idx_rt_baseline (project_id, baseline_aeb_version_id),
  KEY idx_rt_candidate (project_id, candidate_aeb_version_id),
  KEY idx_rt_vehicle (project_id, vehicle_version_id),
  KEY idx_rt_creator (created_by_user_id),
  CONSTRAINT fk_rt_project   FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rt_vehicle   FOREIGN KEY (project_id, vehicle_version_id) REFERENCES vehicle_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rt_scenario  FOREIGN KEY (project_id, scenario_id) REFERENCES scenarios(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rt_baseline  FOREIGN KEY (project_id, baseline_aeb_version_id) REFERENCES aeb_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rt_candidate FOREIGN KEY (project_id, candidate_aeb_version_id) REFERENCES aeb_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rt_creator   FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_rt_distinct CHECK (baseline_aeb_version_id <> candidate_aeb_version_id),
  CONSTRAINT ck_rt_verdict  CHECK (verdict = 'PENDING' OR execution_status = 'COMPLETED')
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. MÔ PHỎNG, ĐÁNH GIÁ, LỖI (FE-07, FE-08, FE-09, FE-10)  — 5 bảng
-- ---------------------------------------------------------------------
-- Một lần chạy một biến thể với một phiên bản xe + một AEB version + một seed; gồm luôn kết quả đánh giá AEB.
CREATE TABLE simulation_runs (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id              BIGINT UNSIGNED NOT NULL,
  scenario_id             BIGINT UNSIGNED NOT NULL COMMENT 'lặp lại có chủ đích để FK ghép ép cùng project',
  scenario_version_id     BIGINT UNSIGNED NOT NULL,
  vehicle_version_id      BIGINT UNSIGNED NOT NULL,
  aeb_version_id          BIGINT UNSIGNED NOT NULL,
  simulator_type          ENUM('KINEMATIC','CARLA') NOT NULL,
  simulator_version       VARCHAR(30) NOT NULL COMMENT 'Danh tính bộ mô phỏng: vehicsim-kinematic-1.0 | carla-0.9.16; đổi logic động học thì đổi tên',
  map_name                VARCHAR(100) NULL COMMENT 'Map CARLA thực nạp (world.get_map().name); NULL với động học',
  fixed_delta_seconds     DECIMAL(6,4) NOT NULL DEFAULT 0.0500 COMMENT 'Bước mô phỏng, CARLA chạy synchronous_mode — cần để tái lập',
  max_duration_s          DECIMAL(8,2) NULL COMMENT 'Hết giờ mô phỏng thì end_reason = TIMEOUT',
  purpose                 ENUM('BASELINE','EVALUATION','OPTIMIZATION','REGRESSION','ROBUSTNESS') NOT NULL,
  status                  ENUM('PENDING','RUNNING','PAUSED','COMPLETED','FAILED','STOPPED') NOT NULL DEFAULT 'PENDING',
  random_seed             BIGINT UNSIGNED NOT NULL,
  baseline_run_id         BIGINT UNSIGNED NULL COMMENT 'Run REGRESSION chạy lại đúng biến thể + seed + bộ mô phỏng + xe của run này',
  regression_test_id      BIGINT UNSIGNED NULL,
  optimization_trial_id   BIGINT UNSIGNED NULL,
  analysis_result_id      BIGINT UNSIGNED NULL COMMENT 'Run ROBUSTNESS thuộc lần kiểm robustness nào (FE-11-05)',
  run_config_json         JSON NULL COMMENT 'Bản chụp tham số biến thể lúc chạy (+ nhiễu nếu ROBUSTNESS)',
  -- Kết quả chấm AEB/FCW (FE-09-05), có khi COMPLETED. Thời điểm tính từ đầu run (s).
  verdict                 ENUM('PASS','FAIL') NULL,
  end_reason              ENUM('TARGET_CLEARED','EGO_STOPPED','COLLISION','TIMEOUT','ERROR') NULL,
  simulated_duration_s    DECIMAL(9,3) NULL,
  collision_occurred      BOOLEAN NULL,
  first_detection_time_s  DECIMAL(8,3) NULL COMMENT 'Perception phát hiện người đi bộ lần đầu (độ trễ phát hiện)',
  first_detection_distance_m DECIMAL(8,3) NULL,
  fcw_activated           BOOLEAN NULL COMMENT 'FCW đã cảnh báo',
  fcw_time_s              DECIMAL(8,3) NULL,
  aeb_activated           BOOLEAN NULL,
  aeb_activation_time_s   DECIMAL(8,3) NULL,
  is_false_positive       BOOLEAN NULL COMMENT 'Phanh oan: an toàn mà vẫn phanh gấp',
  is_false_negative       BOOLEAN NULL COMMENT 'Bỏ sót: có nguy cơ mà không phanh',
  impact_speed_mps        DECIMAL(8,3) NULL,
  min_distance_m          DECIMAL(10,3) NULL,
  min_ttc_s               DECIMAL(8,3) NULL,
  braking_response_time_s DECIMAL(8,3) NULL COMMENT 'Từ lệnh AEB tới lúc phanh có tác dụng',
  max_deceleration_mps2   DECIMAL(8,3) NULL,
  mean_deceleration_mps2  DECIMAL(8,3) NULL,
  max_jerk_mps3           DECIMAL(8,3) NULL,
  stopping_distance_m     DECIMAL(8,3) NULL,
  telemetry_json          JSON NULL COMMENT 'Chuỗi khung (ego, người đi bộ, perception, TTC) cho biểu đồ / phát lại; CARLA thêm bảng đối chiếu xe',
  error_message           TEXT NULL,
  worker_host             VARCHAR(150) NULL,
  created_by_user_id      BIGINT UNSIGNED NOT NULL,
  queued_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at              DATETIME NULL,
  ended_at                DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sr_replay (id, scenario_version_id, random_seed, simulator_version, vehicle_version_id),
  UNIQUE KEY uq_sr_pair (id, baseline_run_id, regression_test_id, scenario_version_id),
  KEY idx_sr_project_status (project_id, status),
  KEY idx_sr_scenario (project_id, scenario_id),
  KEY idx_sr_variant (scenario_id, scenario_version_id),
  KEY idx_sr_vehicle (project_id, vehicle_version_id),
  KEY idx_sr_aeb (project_id, aeb_version_id),
  KEY idx_sr_baseline (baseline_run_id, scenario_version_id, random_seed, simulator_version, vehicle_version_id),
  KEY idx_sr_regression (regression_test_id, aeb_version_id, vehicle_version_id, simulator_version),
  KEY idx_sr_simulator (project_id, simulator_version),
  KEY idx_sr_trial (optimization_trial_id, aeb_version_id),
  KEY idx_sr_analysis (project_id, analysis_result_id, aeb_version_id),
  KEY idx_sr_purpose (purpose, status),
  KEY idx_sr_creator (created_by_user_id),
  CONSTRAINT fk_sr_project    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_scenario   FOREIGN KEY (project_id, scenario_id) REFERENCES scenarios(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_variant    FOREIGN KEY (scenario_id, scenario_version_id) REFERENCES scenario_versions(scenario_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_vehicle    FOREIGN KEY (project_id, vehicle_version_id) REFERENCES vehicle_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_aeb        FOREIGN KEY (project_id, aeb_version_id) REFERENCES aeb_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- Run REGRESSION chạy lại ĐÚNG biến thể + seed + bộ mô phỏng (cả phiên bản) + phiên bản xe của run baseline…
  CONSTRAINT fk_sr_baseline   FOREIGN KEY (baseline_run_id, scenario_version_id, random_seed, simulator_version, vehicle_version_id)
    REFERENCES simulation_runs(id, scenario_version_id, random_seed, simulator_version, vehicle_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- …với ĐÚNG candidate, xe và bộ mô phỏng mà regression test đã chốt.
  CONSTRAINT fk_sr_regression FOREIGN KEY (regression_test_id, aeb_version_id, vehicle_version_id, simulator_version)
    REFERENCES regression_tests(id, candidate_aeb_version_id, vehicle_version_id, simulator_version) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_trial      FOREIGN KEY (optimization_trial_id, aeb_version_id)
    REFERENCES optimization_trials(id, candidate_aeb_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- Run robustness phải cùng project và chạy ĐÚNG AEB version mà lần kiểm robustness đánh giá.
  CONSTRAINT fk_sr_analysis   FOREIGN KEY (project_id, analysis_result_id, aeb_version_id)
    REFERENCES analysis_results(project_id, id, aeb_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_creator   FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_sr_simulator  CHECK ((simulator_type = 'CARLA') = (simulator_version LIKE 'carla-%')
                                     AND (simulator_type = 'CARLA' OR map_name IS NULL)
                                     AND fixed_delta_seconds > 0),
  CONSTRAINT ck_sr_regression CHECK ((purpose = 'REGRESSION') = (regression_test_id IS NOT NULL AND baseline_run_id IS NOT NULL)),
  CONSTRAINT ck_sr_trial      CHECK ((purpose = 'OPTIMIZATION') = (optimization_trial_id IS NOT NULL)),
  CONSTRAINT ck_sr_robustness CHECK ((purpose = 'ROBUSTNESS') = (analysis_result_id IS NOT NULL)),
  CONSTRAINT ck_sr_result     CHECK (status <> 'COMPLETED' OR (verdict IS NOT NULL AND collision_occurred IS NOT NULL))
) ENGINE=InnoDB;

-- FE-08: file lớn của run (video, log, dữ liệu cảm biến, ground truth) — chỉ lưu đường dẫn.
CREATE TABLE simulation_artifacts (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  simulation_run_id BIGINT UNSIGNED NOT NULL,
  sensor_id         BIGINT UNSIGNED NULL COMMENT 'Cảm biến sinh ra file (SENSOR_OUTPUT)',
  artifact_type     ENUM('VIDEO_MP4','TELEMETRY','SENSOR_OUTPUT','GROUND_TRUTH','LOG','RESULT_FILE','XOSC') NOT NULL,
  file_name         VARCHAR(255)  NOT NULL,
  storage_url       VARCHAR(1024) NOT NULL,
  mime_type         VARCHAR(100)  NULL,
  file_size_bytes   BIGINT UNSIGNED NULL,
  created_date        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sa_run_type (simulation_run_id, artifact_type),
  KEY idx_sa_sensor (sensor_id),
  CONSTRAINT fk_sa_run    FOREIGN KEY (simulation_run_id) REFERENCES simulation_runs(id) ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_sa_sensor FOREIGN KEY (sensor_id)         REFERENCES sensors(id)         ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- Va chạm thô từ carla.CollisionEvent + số đã tính (động học cũng ghi được: frame = khung mô phỏng).
CREATE TABLE collision_events (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  simulation_run_id   BIGINT UNSIGNED NOT NULL,
  frame               INT UNSIGNED NOT NULL,
  simulation_time_s   DECIMAL(10,3) NOT NULL,
  other_actor_type_id VARCHAR(100) NULL COMMENT 'vd: walker.pedestrian.0001',
  collision_type      ENUM('FRONT','SIDE','REAR','OTHER') NOT NULL DEFAULT 'FRONT',
  impact_speed_mps    DECIMAL(8,3) NULL,
  normal_impulse_x    DECIMAL(12,4) NULL,
  normal_impulse_y    DECIMAL(12,4) NULL,
  normal_impulse_z    DECIMAL(12,4) NULL,
  location_x_m        DECIMAL(10,3) NULL,
  location_y_m        DECIMAL(10,3) NULL,
  location_z_m        DECIMAL(10,3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ce_run_frame (simulation_run_id, frame, other_actor_type_id),
  CONSTRAINT fk_ce_run FOREIGN KEY (simulation_run_id) REFERENCES simulation_runs(id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- FE-10-01/02: ca lỗi của một run, phân vào 4 khâu (category = khâu chính); kỹ sư sửa nhãn được.
CREATE TABLE failures (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  simulation_run_id  BIGINT UNSIGNED NOT NULL,
  -- NEAR_MISS: suýt va chạm mà không khâu nào sai (bộ chấm gán). INSUFFICIENT_STOPPING_DISTANCE: kỹ sư gán tay.
  failure_type       ENUM('COLLISION','NEAR_MISS','MISSED_BRAKING','LATE_BRAKING','FALSE_BRAKING','HIGH_IMPACT_SPEED',
                          'INSUFFICIENT_STOPPING_DISTANCE') NOT NULL,
  category           ENUM('PERCEPTION','DECISION','CONTROL','VEHICLE_DYNAMICS') NOT NULL,
  severity           ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
  description        TEXT NOT NULL,
  detected_by        ENUM('AUTO','MANUAL') NOT NULL DEFAULT 'AUTO',
  labeled_by_user_id BIGINT UNSIGNED NULL COMMENT 'Kỹ sư sửa nhãn',
  labeled_at         DATETIME NULL,
  created_date         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_failures_run_type (simulation_run_id, failure_type),
  KEY idx_failures_category (category, severity),
  KEY idx_failures_labeler (labeled_by_user_id),
  CONSTRAINT fk_failures_run     FOREIGN KEY (simulation_run_id)  REFERENCES simulation_runs(id) ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_failures_labeler FOREIGN KEY (labeled_by_user_id) REFERENCES users(id)           ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- FE-10-02: chuỗi nguyên nhân theo khâu, nối tới tham số AEB nghi ngờ (gợi ý cho tối ưu).
CREATE TABLE root_causes (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  failure_id       BIGINT UNSIGNED NOT NULL,
  category         ENUM('PERCEPTION','DECISION','CONTROL','VEHICLE_DYNAMICS') NOT NULL,
  cause_code       VARCHAR(64) NOT NULL COMMENT 'vd: OBJECT_NOT_DETECTED, TRIGGERED_TOO_LATE',
  description      TEXT NOT NULL,
  aeb_parameter_id INT UNSIGNED NULL,
  confidence       DECIMAL(4,3) NULL,
  is_primary       BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rc_failure_code (failure_id, cause_code),
  KEY idx_rc_param (aeb_parameter_id),
  CONSTRAINT fk_rc_failure FOREIGN KEY (failure_id)       REFERENCES failures(id)       ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_rc_param   FOREIGN KEY (aeb_parameter_id) REFERENCES aeb_parameters(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT ck_rc_confidence CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. PHÂN TÍCH, KẾT QUẢ REGRESSION, KHUYẾN NGHỊ (FE-10, FE-11, FE-12)  — 3 bảng
-- ---------------------------------------------------------------------
-- FE-10-04/05 độ nhạy, tương tác; FE-11-03 active learning; FE-11-05 robustness.
CREATE TABLE analysis_results (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id               BIGINT UNSIGNED NOT NULL,
  analysis_type            ENUM('SENSITIVITY','INTERACTION','ROBUSTNESS_VALIDATION','ACTIVE_LEARNING_TRACKER') NOT NULL,
  method                   VARCHAR(50) NULL COMMENT 'CORRELATION, RANDOM_FOREST, SHAP, PERTURBATION…',
  scenario_id              BIGINT UNSIGNED NULL COMMENT 'Họ kịch bản được phân tích (NULL = cả project)',
  aeb_version_id           BIGINT UNSIGNED NULL COMMENT 'Bắt buộc với ROBUSTNESS_VALIDATION: cấu hình được kiểm',
  optimization_run_id      BIGINT UNSIGNED NULL COMMENT 'Bắt buộc với ACTIVE_LEARNING_TRACKER',
  title                    VARCHAR(255) NOT NULL,
  config_json              JSON NULL COMMENT 'Đầu vào: chỉ số mục tiêu, bộ lọc run; robustness: nhiễu (ma sát 0,6–0,9, trễ phanh 0,15–0,30 s, latency…), số mẫu / biến thể',
  summary_json             JSON NOT NULL COMMENT 'Đầu ra: xếp hạng tham số, ma trận tương tác, phân bố theo nhiễu…',
  pass_rate                DECIMAL(5,2) NULL COMMENT '% mẫu đạt (robustness)',
  worst_case_run_id        BIGINT UNSIGNED NULL,
  status                   ENUM('PENDING','RUNNING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  created_by_user_id       BIGINT UNSIGNED NOT NULL,
  created_date               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ar_project_id_aeb (project_id, id, aeb_version_id),  -- đích của fk_sr_analysis
  KEY idx_ar_project_type (project_id, analysis_type),
  KEY idx_ar_scenario (project_id, scenario_id),
  KEY idx_ar_aeb (project_id, aeb_version_id),
  KEY idx_ar_opt (project_id, optimization_run_id),
  KEY idx_ar_worst (worst_case_run_id),
  KEY idx_ar_creator (created_by_user_id),
  CONSTRAINT fk_ar_project  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ar_scenario FOREIGN KEY (project_id, scenario_id) REFERENCES scenarios(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ar_aeb      FOREIGN KEY (project_id, aeb_version_id) REFERENCES aeb_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ar_opt      FOREIGN KEY (project_id, optimization_run_id) REFERENCES optimization_runs(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ar_worst    FOREIGN KEY (worst_case_run_id) REFERENCES simulation_runs(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_ar_creator  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_ar_robustness CHECK (analysis_type <> 'ROBUSTNESS_VALIDATION' OR aeb_version_id IS NOT NULL),
  CONSTRAINT ck_ar_active     CHECK (analysis_type <> 'ACTIVE_LEARNING_TRACKER' OR optimization_run_id IS NOT NULL),
  CONSTRAINT ck_ar_pass_rate  CHECK (pass_rate IS NULL OR pass_rate BETWEEN 0 AND 100)
) ENGINE=InnoDB;

-- FE-12-03: kết quả từng kịch bản. FK ghép ép: run candidate thuộc ĐÚNG regression này, ghép với ĐÚNG
-- run baseline (cùng biến thể + seed + bộ mô phỏng — ép tiếp bởi fk_sr_baseline).
CREATE TABLE regression_test_items (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  regression_test_id  BIGINT UNSIGNED NOT NULL,
  scenario_version_id BIGINT UNSIGNED NOT NULL,
  baseline_run_id     BIGINT UNSIGNED NOT NULL,
  candidate_run_id    BIGINT UNSIGNED NOT NULL,
  baseline_outcome    ENUM('SAFE','NEAR_MISS','COLLISION') NULL,
  candidate_outcome   ENUM('SAFE','NEAR_MISS','COLLISION') NULL,
  change_type         ENUM('FIXED','REGRESSED','UNCHANGED') NULL,
  is_regression       BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Baseline đạt mà candidate trượt',
  notes               TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rti_test_variant (regression_test_id, scenario_version_id),
  UNIQUE KEY uq_rti_candidate (candidate_run_id),
  KEY idx_rti_pair (candidate_run_id, baseline_run_id, regression_test_id, scenario_version_id),
  KEY idx_rti_variant (scenario_version_id),
  KEY idx_rti_baseline (baseline_run_id),
  CONSTRAINT fk_rti_test FOREIGN KEY (regression_test_id) REFERENCES regression_tests(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_rti_pair FOREIGN KEY (candidate_run_id, baseline_run_id, regression_test_id, scenario_version_id)
    REFERENCES simulation_runs(id, baseline_run_id, regression_test_id, scenario_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rti_baseline FOREIGN KEY (baseline_run_id) REFERENCES simulation_runs(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- FE-12-04/05: một khuyến nghị cho một regression; Reviewer ACCEPT / REJECT (hoặc yêu cầu kiểm thêm).
-- Chỉ project thuộc workspace có khuyến nghị (EXPERIENCER không có) — service ép.
CREATE TABLE engineering_recommendations (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id               BIGINT UNSIGNED NOT NULL,
  regression_test_id       BIGINT UNSIGNED NOT NULL,
  candidate_aeb_version_id BIGINT UNSIGNED NOT NULL,
  optimization_run_id      BIGINT UNSIGNED NULL,
  content                  TEXT NOT NULL COMMENT 'Kết luận kỹ thuật — chỉ là đề xuất, không tự áp dụng',
  confidence               ENUM('HIGH','MEDIUM','LOW') NULL,
  status                   ENUM('PENDING_REVIEW','ACCEPTED','REJECTED','MORE_TESTS_REQUESTED') NOT NULL DEFAULT 'PENDING_REVIEW',
  created_by_user_id       BIGINT UNSIGNED NOT NULL,
  reviewed_by_user_id      BIGINT UNSIGNED NULL,
  reviewed_at              DATETIME NULL,
  review_notes             TEXT NULL COMMENT 'Lý do quyết định (bắt buộc)',
  review_conditions        TEXT NULL COMMENT 'Điều kiện / việc cần làm tiếp sau quyết định',
  created_date               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_er_regression (regression_test_id),
  KEY idx_er_project_status (project_id, status),
  KEY idx_er_project_test (project_id, regression_test_id),
  KEY idx_er_test_candidate (regression_test_id, candidate_aeb_version_id),
  KEY idx_er_opt (project_id, optimization_run_id),
  KEY idx_er_creator (created_by_user_id),
  KEY idx_er_reviewer (reviewed_by_user_id),
  CONSTRAINT fk_er_test      FOREIGN KEY (project_id, regression_test_id) REFERENCES regression_tests(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_er_candidate FOREIGN KEY (regression_test_id, candidate_aeb_version_id) REFERENCES regression_tests(id, candidate_aeb_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_er_opt       FOREIGN KEY (project_id, optimization_run_id) REFERENCES optimization_runs(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_er_creator   FOREIGN KEY (created_by_user_id)  REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_er_reviewer  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_er_decision CHECK ((status = 'PENDING_REVIEW') = (reviewed_by_user_id IS NULL AND reviewed_at IS NULL)),
  CONSTRAINT ck_er_no_self_review CHECK (reviewed_by_user_id IS NULL OR reviewed_by_user_id <> created_by_user_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 9. TRI THỨC KỸ THUẬT (Admin quản lý)  — 1 bảng
-- Hằng số, định nghĩa, tiêu chuẩn / quy chuẩn dùng làm căn cứ cho mô hình và báo cáo.
-- ---------------------------------------------------------------------
CREATE TABLE tech_references (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ref_code         VARCHAR(100)  NOT NULL,
  ref_type         ENUM('PRINCIPLE','THEORY','CONSTANT','DEFINITION','UNIT','STANDARD') NOT NULL,
  ref_name         VARCHAR(255)  NOT NULL,
  ref_value        DECIMAL(30,12) NULL COMMENT 'Chỉ dùng khi ref_type=CONSTANT',
  unit             VARCHAR(30)   NULL,
  description      TEXT          NULL,
  source_type      VARCHAR(50)   NULL COMMENT 'STANDARD, REGULATION, PAPER...',
  source_title     VARCHAR(500)  NULL,
  author           VARCHAR(255)  NULL,
  organization     VARCHAR(255)  NULL,
  publication_year SMALLINT UNSIGNED NULL,
  page             VARCHAR(50)   NULL,
  url              VARCHAR(1024) NULL,
  doi              VARCHAR(255)  NULL,
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_date     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tech_references_code (ref_code),
  KEY idx_tech_references_type (ref_type, is_active),
  CONSTRAINT ck_tech_references_value CHECK (ref_value IS NULL OR ref_type = 'CONSTANT')
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- SEED
-- =====================================================================
INSERT INTO roles (code, name, description) VALUES
  ('ADMIN',       'Administrator', 'Quản trị toàn hệ thống, người dùng, role, duyệt workspace'),
  ('MANAGER',     'Manager',       'Quản lý workspace, thành viên, task và tiến độ; không làm kỹ thuật, không duyệt khuyến nghị'),
  ('ENGINEER',    'Engineer',      'Làm quy trình kỹ thuật trong workspace: xe, kịch bản, mô phỏng, tối ưu, regression'),
  ('REVIEWER',    'Reviewer',      'Xem kết quả kỹ thuật và ACCEPT / REJECT khuyến nghị'),
  ('EXPERIENCER', 'Experiencer',   'Người tự đăng ký: project cá nhân, chạy đến regression; không có khuyến nghị / duyệt');

-- Khớp seed của code (src/services/vehicsim/bootstrap.py). Baseline v1.0 dùng mặc định, riêng TTC = 1,5 s.
INSERT INTO aeb_parameters (code, name, category, unit, description, min_value, max_value, default_value, sort_order) VALUES
  ('DETECTION_CONFIDENCE_THRESHOLD', 'Detection Confidence Threshold', 'PERCEPTION', 'ratio', 'Ngưỡng confidence để chấp nhận một detection', 0.30, 0.99, 0.70, 1),
  ('RELATIVE_VELOCITY_THRESHOLD', 'Relative Velocity Threshold', 'DECISION', 'm/s', 'Vận tốc tiếp cận tối thiểu để xét nguy hiểm', 0.50, 10.00, 2.00, 2),
  ('PREDICTION_HORIZON', 'Prediction Horizon', 'DECISION', 's', 'Khoảng thời gian dự đoán chuyển động đối tượng', 0.50, 4.00, 2.00, 3),
  ('SAFETY_DISTANCE_MARGIN', 'Safety Distance Margin', 'DECISION', 'm', 'Khoảng đệm an toàn cộng thêm', 0.50, 5.00, 2.00, 4),
  ('TTC_THRESHOLD', 'TTC Threshold', 'DECISION', 's', 'Ngưỡng Time-to-Collision kích hoạt phanh', 0.50, 4.00, 1.80, 5),
  ('BRAKE_ACTIVATION_DELAY', 'Brake Activation Delay', 'CONTROL', 's', 'Trễ từ quyết định tới lúc bắt đầu phanh', 0.00, 0.50, 0.15, 6),
  ('MAX_DECELERATION', 'Target / Max Deceleration', 'VEHICLE_DYNAMICS', 'm/s2', 'Giảm tốc mục tiêu / tối đa AEB được xin', 3.00, 10.00, 8.00, 7),
  ('BRAKE_BUILDUP_RATE', 'Brake Build-up Rate', 'CONTROL', 'm/s3', 'Tốc độ tăng lực phanh', 10.00, 100.00, 50.00, 8),
  ('JERK_LIMIT', 'Jerk Limit', 'CONTROL', 'm/s3', 'Giới hạn thay đổi gia tốc khi phanh', 5.00, 50.00, 20.00, 9),
  ('ACTUATOR_RESPONSE_TIME', 'Actuator Response Time', 'VEHICLE_DYNAMICS', 's', 'Thời gian phản hồi của cơ cấu chấp hành phanh', 0.02, 0.30, 0.10, 10);

INSERT INTO carla_vehicle_models (carla_blueprint_id, display_name, length_m, width_m, height_m) VALUES
  ('vehicle.audi.etron', 'Audi e-tron', 4.750, 1.930, 1.670);

INSERT INTO tech_references (ref_code, ref_type, ref_name, ref_value, unit, description, source_type, source_title, organization, publication_year) VALUES
  ('GRAV_ACCEL', 'CONSTANT', 'Standard Gravity Acceleration', 9.80665, 'm/s2', 'Gia tốc trọng trường tiêu chuẩn dùng tính tải trọng & lực phanh tối đa', 'STANDARD', 'ISO 80000-3:2019 Quantities and units - Space and time', 'ISO', 2019),
  ('AIR_DENSITY_STP', 'CONSTANT', 'Air Density at STP', 1.225, 'kg/m3', 'Mật độ không khí tiêu chuẩn (15°C, 1 atm) dùng tính lực cản khí động học', 'STANDARD', 'ICAO Doc 7488/3 Manual of the ICAO Standard Atmosphere', 'ICAO', 1993),
  ('UNECE_R152', 'STANDARD', 'UN Regulation No. 152 (AEBS for M1/N1 Vehicles)', NULL, NULL, 'Quy chuẩn Liên Hiệp Quốc về phê chuẩn hệ thống phanh tự động khẩn cấp cho xe du lịch M1 và xe tải nhẹ N1', 'REGULATION', 'UN Regulation No. 152 Uniform provisions concerning AEBS', 'United Nations ECE', 2020),
  ('EURO_NCAP_AEB_C2C', 'PRINCIPLE', 'Euro NCAP AEB Car-to-Car Assessment Protocol', NULL, NULL, 'Quy chuẩn đánh giá hệ thống phanh tự động khẩn cấp giữa xe và xe (CCRs, CCRm, CCRb)', 'STANDARD', 'Euro NCAP Test Protocol - AEB Systems v4.3', 'Euro NCAP', 2023),
  ('ISO_22839_FCS', 'STANDARD', 'Forward Vehicle Collision Mitigation Systems', NULL, NULL, 'Tiêu chuẩn quốc tế quy định yêu cầu vận hành và quy trình thử nghiệm hệ thống cảnh báo & giảm thiểu va chạm phía trước', 'STANDARD', 'ISO 22839:2013 Intelligent transport systems - Forward collision mitigation', 'ISO', 2013),
  ('ISO_15623_TTC', 'DEFINITION', 'Time-to-Collision (TTC) Definition & Forward Collision Warning', NULL, NULL, 'Định nghĩa chuẩn và yêu cầu kích hoạt cảnh báo theo Time-to-Collision: TTC = Range / Range_Rate', 'STANDARD', 'ISO 15623:2013 Transport systems - Forward vehicle collision warning systems', 'ISO', 2013);
