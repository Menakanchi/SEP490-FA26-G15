-- =====================================================================
-- VehicSim — MySQL 8.4 schema (29 bảng) — bản chuẩn hóa Scope luận văn & Đồ án tốt nghiệp
-- Phạm vi kỹ thuật: 4 tham số AEB + 3 mục tiêu MOBO + 7 Category kịch bản Euro NCAP
-- Từ điển dữ liệu (nghĩa từng cột, ai ghi, JSON): docs/vehicsim/database-schema.md
-- DB đã tạo từ bản cũ hơn: chạy các file trong database/mysql/migrations/ theo thứ tự (mới nhất: 007)
-- Backend: Java Spring Boot 3 (Java 17/21) + Spring Data JPA / Redis · Simulator: CARLA 0.9.16 + bộ động học
-- Charset: utf8mb4 / utf8mb4_0900_ai_ci · Yêu cầu MySQL >= 8.0.16 (CHECK có hiệu lực)
--
-- Ngoài MySQL (không có bảng):
--   - OTP đăng ký / quên mật khẩu, rate limit: Redis có TTL (FE-01-05/06).
--   - Cấu hình hệ thống (LLM key, CARLA host): application.yml / Spring Environment.
--   - Nhật ký thao tác: logback / SLF4J log file.
--   - Quyền theo role: kiểm ở Spring Security / Method Security (role nào được ghi / duyệt).
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
  created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
-- FE-03-03: Admin tạo workspace và gán thẳng một MANAGER quản lý (ADR-038) — không có bước xin / duyệt.
-- Manager xem được mọi thành viên của workspace mình quản lý (kiểm ở Spring Security/API).
CREATE TABLE workspaces (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name               VARCHAR(150) NOT NULL,
  description        TEXT         NULL,
  manager_id         BIGINT UNSIGNED NOT NULL COMMENT 'MANAGER do Admin gán (service kiểm role)',
  status             ENUM('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  created_by_user_id BIGINT UNSIGNED NOT NULL COMMENT 'Admin tạo workspace',
  created_date       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_workspaces_manager_name (manager_id, name),
  KEY idx_workspaces_status (status),
  KEY idx_workspaces_creator (created_by_user_id),
  CONSTRAINT fk_workspaces_manager FOREIGN KEY (manager_id)         REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_workspaces_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
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
  created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
                      'RECOMMENDATION_DECIDED','TASK_ASSIGNED','REPORT_SUBMITTED','WORKSPACE_ASSIGNED',
                      'MEMBER_ADDED','FAILURE_DETECTED','CANDIDATE_CREATED','SYSTEM') NOT NULL,
  title          VARCHAR(255) NOT NULL,
  content        TEXT NOT NULL,
  reference_type VARCHAR(50)  NULL COMMENT 'SIMULATION_RUN, TASK, RECOMMENDATION, WORKSPACE…',
  reference_id   BIGINT UNSIGNED NULL,
  is_read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_date   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  created_date        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wt_id_project (id, project_id),  -- đích của fk_tr_task
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

-- FE-13-03/04: báo cáo công việc gửi theo từng PROJECT; Manager của workspace chứa project duyệt (ADR-038).
-- task_id tuỳ chọn; có thì task phải thuộc đúng project của báo cáo (FK ghép fk_tr_task).
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

-- ---------------------------------------------------------------------
-- 3. PROJECT & XE (FE-04)  — 4 bảng
-- ---------------------------------------------------------------------
-- Người dùng tự tạo project: Workspace Project (workspace_id có giá trị, ENGINEER tạo) / Personal Project
-- (NULL, EXPERIENCER tạo). Người tạo là owner; thành viên khác nằm ở project_members (ADR-037).
CREATE TABLE projects (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id           BIGINT UNSIGNED NULL,
  name                   VARCHAR(150) NOT NULL,
  description            TEXT NULL,
  status                 ENUM('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  created_by_user_id     BIGINT UNSIGNED NOT NULL,
  carla_vehicle_model_id BIGINT UNSIGNED NULL COMMENT 'Xe project đang dùng cho run mới (UC-23); đổi xe thì run cũ giữ xe của nó',
  personal_owner_key     BIGINT UNSIGNED GENERATED ALWAYS AS (IF(workspace_id IS NULL, created_by_user_id, NULL)) VIRTUAL,
  created_date           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_projects_ws_name (workspace_id, name),
  UNIQUE KEY uq_projects_personal_name (personal_owner_key, name),
  UNIQUE KEY uq_projects_id_ws (id, workspace_id),
  KEY idx_projects_creator (created_by_user_id),
  KEY idx_projects_vehicle (carla_vehicle_model_id),
  CONSTRAINT fk_projects_vehicle   FOREIGN KEY (carla_vehicle_model_id) REFERENCES carla_vehicle_models(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_projects_workspace FOREIGN KEY (workspace_id)           REFERENCES workspaces(id)           ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_projects_creator   FOREIGN KEY (created_by_user_id)     REFERENCES users(id)                ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- UC-72/73/74: thành viên project (thêm / xoá / xem). Chỉ project thuộc workspace mới có thành viên.
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
  CONSTRAINT fk_pm_project   FOREIGN KEY (project_id, workspace_id) REFERENCES projects(id, workspace_id)         ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_pm_ws_member FOREIGN KEY (workspace_id, user_id)    REFERENCES workspace_members(workspace_id, user_id) ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_pm_user      FOREIGN KEY (user_id)                  REFERENCES users(id)                         ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_pm_added_by  FOREIGN KEY (added_by_user_id)         REFERENCES users(id)                         ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- FE-04-01/02: danh mục xe = blueprint CARLA + thông số vật lý. Thông số cố định theo mẫu xe.
CREATE TABLE carla_vehicle_models (
  id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  carla_blueprint_id          VARCHAR(100) NOT NULL,
  display_name                VARCHAR(150) NULL,
  length_m                    DECIMAL(6,3) NOT NULL,
  width_m                     DECIMAL(6,3) NOT NULL,
  height_m                    DECIMAL(6,3) NOT NULL,
  num_wheels                  TINYINT UNSIGNED NOT NULL DEFAULT 4,
  mass_kg                     DECIMAL(8,2) NOT NULL COMMENT 'VehiclePhysicsControl.mass',
  drag_coefficient            DECIMAL(4,3) NULL COMMENT 'VehiclePhysicsControl.drag_coefficient',
  center_of_mass_x_m          DECIMAL(6,3) NULL COMMENT 'VehiclePhysicsControl.center_of_mass (m, so với gốc actor); đủ x/y/z hoặc để trống cả ba',
  center_of_mass_y_m          DECIMAL(6,3) NULL,
  center_of_mass_z_m          DECIMAL(6,3) NULL,
  tire_friction               DECIMAL(4,2) NULL COMMENT 'WheelPhysicsControl.tire_friction, mọi bánh (ma sát mặt đường thuộc kịch bản)',
  max_brake_torque_nm         DECIMAL(8,2) NULL COMMENT 'WheelPhysicsControl.max_brake_torque, mọi bánh',
  wheelbase_m                 DECIMAL(5,3) NULL COMMENT 'Đối chiếu với vị trí bánh của blueprint',
  max_speed_mps               DECIMAL(6,2) NULL,
  max_brake_decel_mps2        DECIMAL(5,2) NOT NULL COMMENT 'Giới hạn phanh của xe — bộ động học dùng; AEB không xin quá mức này',
  carla_full_brake_decel_mps2 DECIMAL(5,2) NULL COMMENT 'Đo trên CARLA: giảm tốc khi phanh 100% — runner đổi giảm tốc AEB ra bàn đạp (TD-17)',
  is_supported                BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cvm_blueprint (carla_blueprint_id),
  CONSTRAINT ck_cvm_dims   CHECK (length_m > 0 AND width_m > 0 AND height_m > 0),
  CONSTRAINT ck_cvm_wheels CHECK (num_wheels IN (2, 4)),
  CONSTRAINT ck_cvm_physics CHECK (mass_kg > 0 AND max_brake_decel_mps2 > 0
                                   AND (max_speed_mps IS NULL OR max_speed_mps > 0)
                                   AND (max_brake_torque_nm IS NULL OR max_brake_torque_nm > 0)
                                   AND (carla_full_brake_decel_mps2 IS NULL OR carla_full_brake_decel_mps2 > 0)
                                   AND (drag_coefficient IS NULL OR drag_coefficient > 0)
                                   AND (tire_friction IS NULL OR tire_friction > 0)),
  CONSTRAINT ck_cvm_center_of_mass CHECK ((center_of_mass_x_m IS NULL) = (center_of_mass_y_m IS NULL)
                                          AND (center_of_mass_y_m IS NULL) = (center_of_mass_z_m IS NULL))
) ENGINE=InnoDB;

-- FE-04, FE-08-03: bộ cảm biến của mẫu xe (vị trí tương đối với xe); cố định như thông số xe.
CREATE TABLE sensors (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  carla_vehicle_model_id BIGINT UNSIGNED NOT NULL,
  name                   VARCHAR(100) NOT NULL,
  sensor_type            ENUM('RGB_CAMERA','DEPTH_CAMERA','SEMANTIC_SEGMENTATION','INSTANCE_SEGMENTATION',
                              'LIDAR','SEMANTIC_LIDAR','RADAR','COLLISION','OBSTACLE','LANE_INVASION') NOT NULL,
  carla_blueprint_id     VARCHAR(100) NOT NULL COMMENT 'vd: sensor.camera.rgb, sensor.lidar.ray_cast, sensor.other.radar',
  location_x_m           DECIMAL(7,3) NOT NULL DEFAULT 0,
  location_y_m           DECIMAL(7,3) NOT NULL DEFAULT 0,
  location_z_m           DECIMAL(7,3) NOT NULL DEFAULT 0,
  rotation_pitch_deg     DECIMAL(7,3) NOT NULL DEFAULT 0,
  rotation_yaw_deg       DECIMAL(7,3) NOT NULL DEFAULT 0,
  rotation_roll_deg      DECIMAL(7,3) NOT NULL DEFAULT 0,
  attributes_json        JSON NULL COMMENT 'Attribute đúng tên blueprint CARLA (image_size_x, fov, range, sensor_tick…)',
  is_enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sensors_model_name (carla_vehicle_model_id, name),
  CONSTRAINT fk_sensors_model FOREIGN KEY (carla_vehicle_model_id) REFERENCES carla_vehicle_models(id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. AEB (FE-09)  — 3 bảng  (4 tham số điều khiển AEB cốt lõi)
-- ---------------------------------------------------------------------
-- Chuẩn hóa từ 10 tham số xuống 4 tham số tối ưu có cơ sở từ paper:
-- 1. TTC_THRESHOLD (TTC Threshold - s)
-- 2. BRAKE_ACTIVATION_DELAY (Brake Activation Delay - s)
-- 3. MAX_DECELERATION (Max Deceleration - m/s2)
-- 4. BRAKE_BUILDUP_RATE (Brake Build-up Rate - m/s3), biên [5, 20] vì lõi chặn ở JERK_LIMIT = 20 (migration 008)
CREATE TABLE aeb_parameters (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(50)   NOT NULL,
  name          VARCHAR(100)  NOT NULL,
  category      ENUM('DECISION','CONTROL','VEHICLE_DYNAMICS') NOT NULL,
  unit          VARCHAR(20)   NOT NULL,
  min_value     DECIMAL(14,6) NOT NULL COMMENT 'Biên dưới — kiểm giá trị + không gian tìm kiếm MOBO',
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
  notes                TEXT NULL COMMENT 'Kỹ sư ghi vì sao tạo version này (vd: TTC 1.8s phanh sớm hơn)',
  baseline_project_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'BASELINE', project_id, NULL)) VIRTUAL,
  created_by_user_id   BIGINT UNSIGNED NOT NULL,
  created_date         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

-- Mỗi version đủ 4 dòng (4 tham số lõi của bộ điều khiển AEB); giá trị trong [min_value, max_value].
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
-- Một scenario = một họ kịch bản thuộc 1 trong 7 nhóm Euro NCAP (CCRs, CCRm, CCRb, CP_CROSSING, CPLA, TURNING, CUT_IN).
CREATE TABLE scenarios (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id         BIGINT UNSIGNED NOT NULL,
  category           ENUM('CCRS','CCRM','CCRB','CP_CROSSING','CPLA','TURNING','CUT_IN') NOT NULL DEFAULT 'CCRS'
                     COMMENT '7 nhóm kịch bản Euro NCAP: CCRs (đứng yên), CCRm (đi đều), CCRb (phanh gấp), CP_CROSSING (băng qua), CPLA (cùng chiều), TURNING (rẽ cắt), CUT_IN (cắt làn)',
  code               VARCHAR(30)  NOT NULL COMMENT 'S01, S02…',
  name               VARCHAR(150) NOT NULL,
  description        TEXT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_date       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scenarios_code (project_id, code),
  UNIQUE KEY uq_scenarios_name (project_id, name),
  UNIQUE KEY uq_scenarios_project_id (project_id, id),
  KEY idx_scenarios_category (category),
  KEY idx_scenarios_creator (created_by_user_id),
  CONSTRAINT fk_scenarios_project FOREIGN KEY (project_id)         REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_scenarios_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- Bản gốc (NATURAL_LANGUAGE / MANUAL / IMPORTED_XOSC) + các biến thể GENERATED.
-- Chứa đầy đủ các tham số kịch bản theo tài liệu Euro NCAP & OpenSCENARIO ScenarioRunner:
-- ego_speed_kmh, target_type, target_speed_kmh, initial_distance_m, lateral_overlap_pct, target_decel_mps2, trigger_distance_m, weather, time_of_day, road_friction.
CREATE TABLE scenario_versions (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scenario_id            BIGINT UNSIGNED NOT NULL,
  version_no             INT UNSIGNED NOT NULL,
  source                 ENUM('NATURAL_LANGUAGE','MANUAL','IMPORTED_XOSC','GENERATED') NOT NULL,
  parent_version_id      BIGINT UNSIGNED NULL,
  natural_language_input TEXT NULL,
  llm_model              VARCHAR(100) NULL,
  scenario_ir_json       JSON NOT NULL COMMENT 'Bản gốc: không gian tham số; biến thể: một điểm tham số cụ thể',
  target_type            ENUM('VEHICLE','PEDESTRIAN') NOT NULL DEFAULT 'VEHICLE' COMMENT 'Đối tượng mục tiêu: Xe hoặc Người đi bộ',
  ego_speed_kmh          DECIMAL(6,2) NOT NULL DEFAULT 50.00 COMMENT 'Tốc độ xuất phát xe ego (km/h, vd: 10–80 km/h)',
  target_speed_kmh       DECIMAL(6,2) NULL COMMENT 'Tốc độ xe mục tiêu hoặc người đi bộ (km/h, vd: xe trước 20/50 km/h; người đi bộ 5/8 km/h)',
  initial_distance_m     DECIMAL(6,2) NULL COMMENT 'Khoảng cách ban đầu giữa xe ego và đối tượng (m, vd: 12 m hoặc 40 m)',
  lateral_overlap_pct    DECIMAL(5,2) NULL COMMENT 'Độ chồng lấn / lệch ngang (%, vd: 25%, 50%, 75%, 100%)',
  target_decel_mps2      DECIMAL(5,2) NULL COMMENT 'Gia tốc phanh của xe phía trước nếu là CCRb (m/s2, vd: -2 hoặc -6 m/s2)',
  trigger_distance_m     DECIMAL(6,2) NULL COMMENT 'Khoảng cách kích hoạt tình huống (m, vd: người đi bộ bắt đầu đi khi xe còn cách 37.5 m)',
  stops_at_curb          BOOLEAN NULL DEFAULT FALSE COMMENT 'Người đi bộ dừng ở mép lề đường — ca đo phanh oan False Positive',
  weather                ENUM('CLEAR','CLOUDY','RAIN','HEAVY_RAIN','FOG') NOT NULL DEFAULT 'CLEAR',
  time_of_day            ENUM('DAY','DUSK','NIGHT') NOT NULL DEFAULT 'DAY',
  road_friction          DECIMAL(4,2) NULL DEFAULT 1.00 COMMENT 'Hệ số ma sát mặt đường μ (bộ động học dùng, CARLA mô phỏng visual mưa)',
  max_duration_s         DECIMAL(6,2) NOT NULL DEFAULT 15.00 COMMENT 'Thời gian mô phỏng tối đa (s, mặc định 15s theo Euro NCAP)',
  openscenario_version   VARCHAR(20) NULL DEFAULT '1.0' COMMENT 'Phiên bản OpenSCENARIO (.xosc)',
  openscenario_content   LONGTEXT NULL COMMENT 'Nội dung file OpenSCENARIO XML (.xosc) nạp vào ScenarioRunner',
  opendrive_content      LONGTEXT NULL COMMENT 'Nội dung file OpenDRIVE (.xodr) hoặc NULL nếu dùng map chuẩn CARLA',
  map_name               VARCHAR(100) NULL DEFAULT 'Town01' COMMENT 'Bản đồ CARLA LogicFile (vd: Town01, Town10HD)',
  validation_status      ENUM('NOT_VALIDATED','VALID','INVALID') NOT NULL DEFAULT 'NOT_VALIDATED',
  status_message         TEXT NULL,
  created_by_user_id     BIGINT UNSIGNED NOT NULL,
  created_date           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sv_no (scenario_id, version_no),
  UNIQUE KEY uq_sv_scenario_id (scenario_id, id),
  KEY idx_sv_parent (scenario_id, parent_version_id),
  KEY idx_sv_filter (weather, time_of_day, ego_speed_kmh),
  KEY idx_sv_creator (created_by_user_id),
  CONSTRAINT fk_sv_scenario FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sv_parent   FOREIGN KEY (scenario_id, parent_version_id) REFERENCES scenario_versions(scenario_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sv_creator  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_sv_generated CHECK ((source = 'GENERATED') = (parent_version_id IS NOT NULL)),
  -- Chặn giá trị vô nghĩa; luật theo category (CCRB phải có gia tốc phanh + khoảng cách…) do FamilyService kiểm.
  CONSTRAINT ck_sv_ranges CHECK (ego_speed_kmh > 0 AND max_duration_s > 0
                                 AND (target_speed_kmh IS NULL OR target_speed_kmh >= 0)
                                 AND (initial_distance_m IS NULL OR initial_distance_m > 0)
                                 AND (trigger_distance_m IS NULL OR trigger_distance_m > 0)
                                 AND (lateral_overlap_pct IS NULL OR lateral_overlap_pct BETWEEN -100 AND 100)),
  CONSTRAINT ck_sv_decel CHECK (target_decel_mps2 IS NULL OR (target_decel_mps2 < 0 AND target_type = 'VEHICLE'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. TỐI ƯU ĐA MỤC TIÊU (MOBO) & REGRESSION (FE-11, FE-12) — 4 bảng
-- ---------------------------------------------------------------------
-- FE-11-01: Tối ưu đa mục tiêu (MOBO) trên cả họ kịch bản.
-- Bài toán: min F(x) = [RMS Jerk, Impact Speed, Stopping Distance] với x = [TTC, Delay, Decel, Buildup].
CREATE TABLE optimization_runs (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id             BIGINT UNSIGNED NOT NULL,
  scenario_id            BIGINT UNSIGNED NOT NULL,
  base_aeb_version_id    BIGINT UNSIGNED NOT NULL,
  carla_vehicle_model_id BIGINT UNSIGNED NOT NULL,
  simulator_version      VARCHAR(30) NOT NULL COMMENT 'vd: vehicsim-kinematic-1.0, carla-0.9.16',
  name                   VARCHAR(150) NOT NULL,
  algorithm              ENUM('MOBO','NSGA_II','RANDOM_SEARCH') NOT NULL DEFAULT 'MOBO'
                         COMMENT 'Thuật toán tối ưu: Multi-Objective Bayesian Optimization (MOBO), NSGA-II, Random Search',
  acquisition_function   ENUM('EHVI','qEHVI','MESMO','USEMO','PAREGO') NULL
                         COMMENT 'Hàm thu nhận đa mục tiêu: Expected Hypervolume Improvement (EHVI/qEHVI), ParEGO, MESMO',
  n_initial_points       INT UNSIGNED NULL COMMENT 'Số điểm thiết kế ban đầu (DoE/Sobol) trước khi hàm thu nhận chọn điểm',
  search_space_json      JSON NOT NULL COMMENT 'Không gian tìm kiếm 4 tham số AEB: TTC_THRESHOLD, BRAKE_ACTIVATION_DELAY, MAX_DECELERATION, BRAKE_BUILDUP_RATE',
  objective_config_json  JSON NOT NULL COMMENT 'Cấu hình 3 mục tiêu: Braking Comfort (RMS Jerk), Collision Mitigation (Impact Speed), Stopping Performance (Stopping Distance). Ràng buộc mặc định: {"constraints": {"collision_rate_pct": {"max": "baseline"}, "false_activation_increase_pts": {"max": 5}}} — trial vi phạm bị loại khỏi mặt Pareto',
  max_trials             INT UNSIGNED NOT NULL,
  random_seed            BIGINT UNSIGNED NULL,
  status                 ENUM('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  error_message          TEXT NULL,
  created_by_user_id     BIGINT UNSIGNED NOT NULL,
  started_at             DATETIME NULL,
  finished_at            DATETIME NULL,
  created_date           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_or_project_id (project_id, id),
  KEY idx_or_scenario (project_id, scenario_id),
  KEY idx_or_base (project_id, base_aeb_version_id),
  KEY idx_or_vehicle (carla_vehicle_model_id),
  KEY idx_or_creator (created_by_user_id),
  CONSTRAINT fk_or_project  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_or_scenario FOREIGN KEY (project_id, scenario_id) REFERENCES scenarios(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_or_base     FOREIGN KEY (project_id, base_aeb_version_id) REFERENCES aeb_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_or_vehicle  FOREIGN KEY (carla_vehicle_model_id) REFERENCES carla_vehicle_models(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_or_creator  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_or_trials CHECK (max_trials > 0 AND (n_initial_points IS NULL OR n_initial_points <= max_trials)),
  CONSTRAINT ck_or_acquisition CHECK (acquisition_function IS NULL OR algorithm = 'MOBO')
) ENGINE=InnoDB;

-- FE-11-03/04: mỗi trial sinh ra 1 candidate AEB version, đánh giá trên bộ 3 mục tiêu [RMS Jerk, Impact Speed, Stopping Distance].
CREATE TABLE optimization_trials (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id               BIGINT UNSIGNED NOT NULL,
  optimization_run_id      BIGINT UNSIGNED NOT NULL,
  trial_number             INT UNSIGNED NOT NULL,
  candidate_aeb_version_id BIGINT UNSIGNED NOT NULL,
  sampling_source          ENUM('INITIAL_DESIGN','ACQUISITION','ACTIVE_LEARNING','MANUAL') NOT NULL DEFAULT 'INITIAL_DESIGN',
  acquisition_value        DECIMAL(14,6) NULL COMMENT 'Giá trị hàm thu nhận EHVI/ParEGO lúc thuật toán chọn điểm',
  -- 3 MỤC TIÊU TỐI ƯU CỐT LÕI (THEO PAPER & THESIS):
  rms_jerk_mps3            DECIMAL(8,3) NULL COMMENT 'Mục tiêu 1: Braking Comfort — RMS Jerk (m/s3) cần MINIMIZE; trung bình rms_jerk_mps3 các run có phanh của họ',
  impact_speed_mps         DECIMAL(8,3) NULL COMMENT 'Mục tiêu 2: Collision Mitigation — Vận tốc va chạm (m/s) cần MINIMIZE; trung bình trên MỌI run của họ (không va chạm = 0)',
  stopping_distance_m      DECIMAL(8,3) NULL COMMENT 'Mục tiêu 3: Stopping Performance — Quãng đường phanh dừng (m) cần MINIMIZE; trung bình các run có phanh của họ (kể cả ca va chạm)',
  collision_rate_pct       DECIMAL(5,2) NULL COMMENT 'Tỉ lệ xảy ra va chạm trên tập kịch bản (%)',
  objective_values_json    JSON NULL COMMENT 'Vector 3 mục tiêu [rms_jerk, impact_speed, stopping_distance] và các chỉ số phụ',
  score                    DECIMAL(18,6) NULL COMMENT 'Điểm số vô hướng hóa (nếu dùng ParEGO / Chebyshev scalarization)',
  constraint_violated      BOOLEAN NOT NULL DEFAULT FALSE,
  is_pareto_optimal        BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Đánh dấu nghiệm thuộc Pareto-optimal front của bài toán đa mục tiêu',
  status                   ENUM('PENDING','RUNNING','COMPLETED','FAILED','PRUNED') NOT NULL DEFAULT 'PENDING',
  created_date             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at             DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ot_run_trial (optimization_run_id, trial_number),
  UNIQUE KEY uq_ot_candidate (candidate_aeb_version_id),
  UNIQUE KEY uq_ot_id_candidate (id, candidate_aeb_version_id),
  KEY idx_ot_run (project_id, optimization_run_id),
  KEY idx_ot_cand (project_id, candidate_aeb_version_id),
  CONSTRAINT fk_ot_run       FOREIGN KEY (project_id, optimization_run_id) REFERENCES optimization_runs(project_id, id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_ot_candidate FOREIGN KEY (project_id, candidate_aeb_version_id) REFERENCES aeb_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_ot_rates CHECK ((collision_rate_pct IS NULL OR collision_rate_pct BETWEEN 0 AND 100))
) ENGINE=InnoDB;

-- FE-12-01/02: so candidate với baseline trên cả họ kịch bản, cùng seed, cùng xe, cùng bộ mô phỏng.
CREATE TABLE regression_tests (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id               BIGINT UNSIGNED NOT NULL,
  scenario_id              BIGINT UNSIGNED NOT NULL,
  baseline_aeb_version_id  BIGINT UNSIGNED NOT NULL,
  candidate_aeb_version_id BIGINT UNSIGNED NOT NULL,
  carla_vehicle_model_id   BIGINT UNSIGNED NOT NULL COMMENT 'Mọi cặp run chạy đúng xe này',
  simulator_version        VARCHAR(30) NOT NULL COMMENT 'Mọi cặp run chạy đúng bộ mô phỏng này',
  name                     VARCHAR(150) NULL,
  description              TEXT NULL,
  pass_criteria_json       JSON NOT NULL COMMENT 'vd: không va chạm mới, RMS Jerk không tăng quá 10%, stopping distance cải thiện',
  execution_status         ENUM('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  verdict                  ENUM('PENDING','PASSED','REGRESSED','FAILED') NOT NULL DEFAULT 'PENDING'
                           COMMENT 'PASSED = đạt mọi tiêu chí; REGRESSED = có ca baseline đạt mà candidate trượt; FAILED = trượt tiêu chí khác',
  total_scenarios          INT UNSIGNED NOT NULL DEFAULT 0,
  fixed_scenarios          INT UNSIGNED NOT NULL DEFAULT 0,
  regressed_scenarios      INT UNSIGNED NOT NULL DEFAULT 0,
  created_by_user_id       BIGINT UNSIGNED NOT NULL,
  created_date             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at              DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rt_project_id (project_id, id),
  UNIQUE KEY uq_rt_id_candidate (id, candidate_aeb_version_id),
  UNIQUE KEY uq_rt_run_scope (id, candidate_aeb_version_id, carla_vehicle_model_id, simulator_version),  -- đích của fk_sr_regression
  KEY idx_rt_scenario (project_id, scenario_id),
  KEY idx_rt_baseline (project_id, baseline_aeb_version_id),
  KEY idx_rt_candidate (project_id, candidate_aeb_version_id),
  KEY idx_rt_vehicle (carla_vehicle_model_id),
  KEY idx_rt_creator (created_by_user_id),
  CONSTRAINT fk_rt_project   FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rt_vehicle   FOREIGN KEY (carla_vehicle_model_id) REFERENCES carla_vehicle_models(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rt_scenario  FOREIGN KEY (project_id, scenario_id) REFERENCES scenarios(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rt_baseline  FOREIGN KEY (project_id, baseline_aeb_version_id) REFERENCES aeb_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rt_candidate FOREIGN KEY (project_id, candidate_aeb_version_id) REFERENCES aeb_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rt_creator   FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_rt_distinct CHECK (baseline_aeb_version_id <> candidate_aeb_version_id),
  CONSTRAINT ck_rt_verdict  CHECK (verdict = 'PENDING' OR execution_status = 'COMPLETED')
) ENGINE=InnoDB;

-- FE-12-03: kết quả từng kịch bản trong regression.
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

-- ---------------------------------------------------------------------
-- 7. MÔ PHỎNG, ĐÁNH GIÁ, LỖI (FE-07, FE-08, FE-09, FE-10)  — 5 bảng
-- ---------------------------------------------------------------------
-- Một lần chạy một biến thể với một xe + một AEB version + một seed; gồm luôn kết quả đo 3 objective và telemetry.
CREATE TABLE simulation_runs (
  id                         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id                 BIGINT UNSIGNED NOT NULL,
  scenario_id                BIGINT UNSIGNED NOT NULL COMMENT 'lặp lại có chủ đích để FK ghép ép cùng project',
  scenario_version_id        BIGINT UNSIGNED NOT NULL,
  carla_vehicle_model_id     BIGINT UNSIGNED NOT NULL,
  aeb_version_id             BIGINT UNSIGNED NOT NULL,
  simulator_type             ENUM('KINEMATIC','CARLA') NOT NULL,
  simulator_version          VARCHAR(30) NOT NULL COMMENT 'Danh tính bộ mô phỏng: vehicsim-kinematic-1.0 | carla-0.9.16',
  map_name                   VARCHAR(100) NULL COMMENT 'Map CARLA thực nạp (world.get_map().name); NULL với động học',
  fixed_delta_seconds        DECIMAL(6,4) NOT NULL DEFAULT 0.0500 COMMENT 'Bước mô phỏng (synchronous_mode)',
  max_duration_s             DECIMAL(8,2) NULL COMMENT 'Hết giờ mô phỏng thì end_reason = TIMEOUT',
  purpose                    ENUM('BASELINE','EVALUATION','OPTIMIZATION','REGRESSION','ROBUSTNESS') NOT NULL,
  status                     ENUM('PENDING','RUNNING','PAUSED','COMPLETED','FAILED','STOPPED') NOT NULL DEFAULT 'PENDING',
  random_seed                BIGINT UNSIGNED NOT NULL,
  baseline_run_id            BIGINT UNSIGNED NULL COMMENT 'Run REGRESSION chạy lại đúng biến thể + seed + bộ mô phỏng + xe của run này',
  regression_test_id         BIGINT UNSIGNED NULL,
  optimization_trial_id      BIGINT UNSIGNED NULL,
  analysis_result_id         BIGINT UNSIGNED NULL COMMENT 'Run ROBUSTNESS thuộc lần kiểm robustness nào (FE-11-05)',
  run_config_json            JSON NULL COMMENT 'Bản chụp tham số biến thể lúc chạy (+ nhiễu nếu ROBUSTNESS)',
  -- Kết quả đánh giá AEB (FE-09-05) & 3 Metrics cốt lõi:
  verdict                    ENUM('PASS','FAIL') NULL,
  end_reason                 ENUM('TARGET_CLEARED','EGO_STOPPED','COLLISION','TIMEOUT','ERROR') NULL,
  simulated_duration_s       DECIMAL(9,3) NULL,
  collision_occurred         BOOLEAN NULL,
  first_detection_time_s     DECIMAL(8,3) NULL COMMENT 'Perception phát hiện đối tượng lần đầu (độ trễ phát hiện)',
  first_detection_distance_m DECIMAL(8,3) NULL,
  fcw_activated              BOOLEAN NULL COMMENT 'FCW đã cảnh báo',
  fcw_time_s                 DECIMAL(8,3) NULL,
  aeb_activated              BOOLEAN NULL,
  aeb_activation_time_s      DECIMAL(8,3) NULL,
  is_false_positive          BOOLEAN NULL COMMENT 'Phanh oan: an toàn mà vẫn phanh gấp',
  is_false_negative          BOOLEAN NULL COMMENT 'Bỏ sót: có nguy cơ mà không phanh',
  -- 3 METRIC CHO 3 OBJECTIVES:
  rms_jerk_mps3              DECIMAL(8,3) NULL COMMENT 'Objective 1: RMS Jerk (m/s3) trong pha phanh, từ lúc phanh tác dụng tới hết run (Braking Comfort); NULL nếu không phanh',
  impact_speed_mps           DECIMAL(8,3) NULL COMMENT 'Objective 2: Vận tốc lúc va chạm (m/s) (Collision Mitigation); NULL nếu không va chạm — khi gộp theo họ tính 0',
  stopping_distance_m        DECIMAL(8,3) NULL COMMENT 'Objective 3: Quãng từ lúc phanh tác dụng tới lúc dừng (m); run kết thúc khi xe còn chạy thì cộng v²/(2·decel_available), nên có cả ca va chạm; NULL nếu không phanh (Stopping Performance)',
  min_distance_m             DECIMAL(10,3) NULL,
  min_ttc_s                  DECIMAL(8,3) NULL,
  braking_response_time_s    DECIMAL(8,3) NULL COMMENT 'Từ lệnh AEB tới lúc phanh có tác dụng thực tế',
  max_deceleration_mps2      DECIMAL(8,3) NULL,
  mean_deceleration_mps2     DECIMAL(8,3) NULL,
  max_jerk_mps3              DECIMAL(8,3) NULL,
  telemetry_json             JSON NULL COMMENT 'Chuỗi khung (ego, target, perception, TTC) cho biểu đồ / phát lại',
  error_message              TEXT NULL,
  worker_host                VARCHAR(150) NULL,
  created_by_user_id         BIGINT UNSIGNED NOT NULL,
  queued_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at                 DATETIME NULL,
  ended_at                   DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sr_replay (id, scenario_version_id, random_seed, simulator_version, carla_vehicle_model_id),
  UNIQUE KEY uq_sr_pair (id, baseline_run_id, regression_test_id, scenario_version_id),
  KEY idx_sr_project_status (project_id, status),
  KEY idx_sr_scenario (project_id, scenario_id),
  KEY idx_sr_variant (scenario_id, scenario_version_id),
  KEY idx_sr_vehicle (carla_vehicle_model_id),
  KEY idx_sr_aeb (project_id, aeb_version_id),
  KEY idx_sr_baseline (baseline_run_id, scenario_version_id, random_seed, simulator_version, carla_vehicle_model_id),
  KEY idx_sr_regression (regression_test_id, aeb_version_id, carla_vehicle_model_id, simulator_version),
  KEY idx_sr_simulator (project_id, simulator_version),
  KEY idx_sr_trial (optimization_trial_id, aeb_version_id),
  KEY idx_sr_analysis (project_id, analysis_result_id, aeb_version_id),
  KEY idx_sr_purpose (purpose, status),
  KEY idx_sr_creator (created_by_user_id),
  CONSTRAINT fk_sr_project    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_scenario   FOREIGN KEY (project_id, scenario_id) REFERENCES scenarios(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_variant    FOREIGN KEY (scenario_id, scenario_version_id) REFERENCES scenario_versions(scenario_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_vehicle    FOREIGN KEY (carla_vehicle_model_id) REFERENCES carla_vehicle_models(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_aeb        FOREIGN KEY (project_id, aeb_version_id) REFERENCES aeb_versions(project_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_baseline   FOREIGN KEY (baseline_run_id, scenario_version_id, random_seed, simulator_version, carla_vehicle_model_id)
    REFERENCES simulation_runs(id, scenario_version_id, random_seed, simulator_version, carla_vehicle_model_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_regression FOREIGN KEY (regression_test_id, aeb_version_id, carla_vehicle_model_id, simulator_version)
    REFERENCES regression_tests(id, candidate_aeb_version_id, carla_vehicle_model_id, simulator_version) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sr_trial      FOREIGN KEY (optimization_trial_id, aeb_version_id)
    REFERENCES optimization_trials(id, candidate_aeb_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
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

-- FE-08: file lớn của run (video, log, dữ liệu cảm biến, ground truth).
CREATE TABLE simulation_artifacts (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  simulation_run_id BIGINT UNSIGNED NOT NULL,
  sensor_id         BIGINT UNSIGNED NULL COMMENT 'Cảm biến sinh ra file (SENSOR_OUTPUT)',
  artifact_type     ENUM('VIDEO_MP4','TELEMETRY','SENSOR_OUTPUT','GROUND_TRUTH','LOG','RESULT_FILE','XOSC') NOT NULL,
  file_name         VARCHAR(255)  NOT NULL,
  storage_url       VARCHAR(1024) NOT NULL,
  mime_type         VARCHAR(100)  NULL,
  file_size_bytes   BIGINT UNSIGNED NULL,
  created_date      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sa_run_type (simulation_run_id, artifact_type),
  KEY idx_sa_sensor (sensor_id),
  CONSTRAINT fk_sa_run    FOREIGN KEY (simulation_run_id) REFERENCES simulation_runs(id) ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_sa_sensor FOREIGN KEY (sensor_id)         REFERENCES sensors(id)         ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- Va chạm thô từ carla.CollisionEvent + số đã tính.
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

-- FE-10-01/02: ca lỗi của một run, phân vào 4 khâu; kỹ sư sửa nhãn được.
CREATE TABLE failures (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  simulation_run_id  BIGINT UNSIGNED NOT NULL,
  failure_type       ENUM('COLLISION','NEAR_MISS','MISSED_BRAKING','LATE_BRAKING','FALSE_BRAKING','HIGH_IMPACT_SPEED',
                          'INSUFFICIENT_STOPPING_DISTANCE') NOT NULL,
  category           ENUM('PERCEPTION','DECISION','CONTROL','VEHICLE_DYNAMICS') NOT NULL,
  severity           ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
  description        TEXT NOT NULL,
  detected_by        ENUM('AUTO','MANUAL') NOT NULL DEFAULT 'AUTO',
  labeled_by_user_id BIGINT UNSIGNED NULL COMMENT 'Kỹ sư sửa nhãn',
  labeled_at         DATETIME NULL,
  created_date       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_failures_run_type (simulation_run_id, failure_type),
  KEY idx_failures_category (category, severity),
  KEY idx_failures_labeler (labeled_by_user_id),
  CONSTRAINT fk_failures_run     FOREIGN KEY (simulation_run_id)  REFERENCES simulation_runs(id) ON DELETE CASCADE  ON UPDATE RESTRICT,
  CONSTRAINT fk_failures_labeler FOREIGN KEY (labeled_by_user_id) REFERENCES users(id)           ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- FE-10-02: chuỗi nguyên nhân theo khâu, nối tới 1 trong 4 tham số AEB nghi ngờ.
CREATE TABLE root_causes (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  failure_id       BIGINT UNSIGNED NOT NULL,
  category         ENUM('PERCEPTION','DECISION','CONTROL','VEHICLE_DYNAMICS') NOT NULL,
  cause_code       VARCHAR(64) NOT NULL COMMENT 'vd: TRIGGERED_TOO_LATE, BRAKE_DELAY_TOO_HIGH',
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
  created_date             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

-- FE-12-04/05: một khuyến nghị cho một regression; Reviewer ACCEPT / REJECT.
CREATE TABLE engineering_recommendations (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id               BIGINT UNSIGNED NOT NULL,
  regression_test_id       BIGINT UNSIGNED NOT NULL,
  candidate_aeb_version_id BIGINT UNSIGNED NOT NULL,
  optimization_run_id      BIGINT UNSIGNED NULL,
  content                  TEXT NOT NULL COMMENT 'Kết luận kỹ thuật & đề xuất lựa chọn cấu hình Pareto tốt nhất',
  confidence               ENUM('HIGH','MEDIUM','LOW') NULL,
  status                   ENUM('PENDING_REVIEW','ACCEPTED','REJECTED','MORE_TESTS_REQUESTED') NOT NULL DEFAULT 'PENDING_REVIEW',
  created_by_user_id       BIGINT UNSIGNED NOT NULL,
  reviewed_by_user_id      BIGINT UNSIGNED NULL,
  reviewed_at              DATETIME NULL,
  review_notes             TEXT NULL COMMENT 'Lý do quyết định (bắt buộc)',
  review_conditions        TEXT NULL COMMENT 'Điều kiện / việc cần làm tiếp sau quyết định',
  created_date             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
-- SEED DATA
-- =====================================================================
INSERT INTO roles (code, name, description) VALUES
  ('ADMIN',       'Administrator', 'Quản trị toàn hệ thống, người dùng, role, duyệt workspace'),
  ('MANAGER',     'Manager',       'Quản lý workspace, thành viên, task và tiến độ; không làm kỹ thuật, không duyệt khuyến nghị'),
  ('ENGINEER',    'Engineer',      'Làm quy trình kỹ thuật trong workspace: xe, kịch bản, mô phỏng, tối ưu, regression'),
  ('REVIEWER',    'Reviewer',      'Xem kết quả kỹ thuật và ACCEPT / REJECT khuyến nghị'),
  ('EXPERIENCER', 'Experiencer',   'Người tự đăng ký: project cá nhân, chạy đến regression; không có khuyến nghị / duyệt');

-- 4 tham số AEB cốt lõi được tối ưu hóa (Scope rút gọn chuẩn hóa theo paper):
INSERT INTO aeb_parameters (code, name, category, unit, description, min_value, max_value, default_value, sort_order) VALUES
  ('TTC_THRESHOLD',           'TTC Threshold',           'DECISION',         's',    'Ngưỡng Time-to-Collision kích hoạt phanh AEB',       0.50,   4.00,   1.80,  1),
  ('BRAKE_ACTIVATION_DELAY',  'Brake Activation Delay',  'CONTROL',          's',    'Độ trễ từ lúc quyết định tới khi phanh tác động',   0.00,   0.50,   0.15,  2),
  ('MAX_DECELERATION',        'Max Deceleration',        'VEHICLE_DYNAMICS', 'm/s2', 'Giới hạn giảm tốc tối đa mà bộ AEB được yêu cầu', 3.00,  10.00,   8.00,  3),
  ('BRAKE_BUILDUP_RATE',      'Brake Build-up Rate',      'CONTROL',          'm/s3', 'Tốc độ tăng lực phanh (build-up rate), tối đa 20 = JERK_LIMIT cố định của lõi AEB',  5.00,  20.00,  20.00,  4);

-- Thông số xe Audi e-tron mặc định trong CARLA:
INSERT INTO carla_vehicle_models (carla_blueprint_id, display_name, length_m, width_m, height_m,
                                  mass_kg, tire_friction, wheelbase_m, max_speed_mps, max_brake_decel_mps2) VALUES
  ('vehicle.audi.etron', 'Audi e-tron', 4.750, 1.930, 1.670, 2100.00, 1.00, 2.950, 50.00, 9.50);

-- Tri thức kỹ thuật & tiêu chuẩn Euro NCAP, OpenSCENARIO:
INSERT INTO tech_references (ref_code, ref_type, ref_name, ref_value, unit, description, source_type, source_title, organization, publication_year) VALUES
  ('GRAV_ACCEL', 'CONSTANT', 'Standard Gravity Acceleration', 9.80665, 'm/s2', 'Gia tốc trọng trường tiêu chuẩn dùng tính tải trọng & lực phanh tối đa', 'STANDARD', 'ISO 80000-3:2019 Quantities and units - Space and time', 'ISO', 2019),
  ('AIR_DENSITY_STP', 'CONSTANT', 'Air Density at STP', 1.225, 'kg/m3', 'Mật độ không khí tiêu chuẩn (15°C, 1 atm) dùng tính lực cản khí động học', 'STANDARD', 'ICAO Doc 7488/3 Manual of the ICAO Standard Atmosphere', 'ICAO', 1993),
  ('UNECE_R152', 'STANDARD', 'UN Regulation No. 152 (AEBS for M1/N1 Vehicles)', NULL, NULL, 'Quy chuẩn Liên Hiệp Quốc về phê chuẩn hệ thống phanh tự động khẩn cấp cho xe du lịch M1 và xe tải nhẹ N1', 'REGULATION', 'UN Regulation No. 152 Uniform provisions concerning AEBS', 'United Nations ECE', 2020),
  ('EURO_NCAP_AEB_C2C', 'STANDARD', 'Euro NCAP AEB Car-to-Car Assessment Protocol', NULL, NULL, 'Quy chuẩn đánh giá hệ thống phanh tự động khẩn cấp giữa xe và xe (CCRs, CCRm, CCRb)', 'STANDARD', 'Euro NCAP Test Protocol - AEB Systems v3.0.2 / v4.3', 'Euro NCAP', 2023),
  ('EURO_NCAP_AEB_VRU', 'STANDARD', 'Euro NCAP AEB Vulnerable Road User Protocol', NULL, NULL, 'Quy chuẩn đánh giá AEB đối với người đi bộ và người đi xe đạp (CPFA, CPNA, CPNCO, CPLA, CPTA)', 'STANDARD', 'Euro NCAP Test Protocol - AEB/LSS VRU systems v4.5', 'Euro NCAP', 2023),
  ('OPENSCENARIO_1_X', 'STANDARD', 'ASAM OpenSCENARIO Standard', NULL, NULL, 'Chuẩn quốc tế mô tả động học kịch bản thử nghiệm xe tự hành (.xosc) hỗ trợ bởi CARLA ScenarioRunner', 'STANDARD', 'ASAM OpenSCENARIO User Guide v1.0 / v1.1', 'ASAM', 2021),
  ('ISO_15623_TTC', 'DEFINITION', 'Time-to-Collision (TTC) Definition & Forward Collision Warning', NULL, NULL, 'Định nghĩa chuẩn và yêu cầu kích hoạt cảnh báo theo Time-to-Collision: TTC = Range / Range_Rate', 'STANDARD', 'ISO 15623:2013 Transport systems - Forward vehicle collision warning systems', 'ISO', 2013);
