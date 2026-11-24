-- =====================================================================
-- VehicSim — MySQL 8.4 schema (30 bảng) — bản chuẩn hóa Scope luận văn & Đồ án tốt nghiệp
-- Bảng lịch sử thứ 30 thuộc ADR-047 Proposed (migration 013).
-- Phạm vi kỹ thuật: 4 tham số AEB + 3 mục tiêu MOBO + 7 Category kịch bản Euro NCAP
-- Từ điển dữ liệu (nghĩa từng cột, ai ghi, JSON): docs/vehicsim/database-schema.md
-- DB đã tạo từ bản cũ hơn: chạy các file trong database/mysql/migrations/ theo thứ tự (mới nhất: 013)
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
  auth_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
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
  UNIQUE KEY uq_workspaces_name (name),
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
  granted_role     ENUM('ENGINEER','REVIEWER') NULL
                   COMMENT 'Role cấp khi thêm tài khoản EXPERIENCER (ADR-045); NULL = role có từ trước. Rời workspace cuối cùng thì về EXPERIENCER',
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
  CONSTRAINT ck_cvm_wheels CHECK (num_wheels IN (2, 4, 6)),
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
  aeb_mode                   ENUM('ON','OFF') NOT NULL DEFAULT 'ON' COMMENT 'OFF: AEB tắt, mốc tham chiếu của baseline; không bao giờ là baseline regression/tối ưu',
  repetition                 SMALLINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Lần lặp thứ mấy của cùng cấu hình (biến thể + AEB + aeb_mode + xe + simulator + seed); tính lúc tạo run (migration 019)',
  attempt                    SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Số lần worker nhận run này (tăng khi PENDING -> RUNNING); 0 = chưa chạy, 2 = bị khôi phục sau khi backend chết giữa run (migration 019)',
  simulator_type             ENUM('KINEMATIC','CARLA') NOT NULL,
  simulator_version          VARCHAR(30) NOT NULL COMMENT 'Danh tính bộ mô phỏng: vehicsim-kinematic-1.4 | carla-0.9.16-xosc15',
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
-- 8. PHÂN TÍCH, KẾT QUẢ REGRESSION, KHUYẾN NGHỊ (FE-10, FE-11, FE-12)  — 3 bảng (gồm lịch sử Reviewer đề xuất)
-- ---------------------------------------------------------------------
CREATE TABLE analysis_results (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id               BIGINT UNSIGNED NOT NULL,
  analysis_type            ENUM('SENSITIVITY','INTERACTION','ROBUSTNESS_VALIDATION','ACTIVE_LEARNING_TRACKER','BASELINE_DATASET') NOT NULL,
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

-- Lịch sử Reviewer — đề xuất ADR-047, chờ nhóm chốt.
CREATE TABLE recommendation_decisions (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recommendation_id    BIGINT UNSIGNED NOT NULL,
  decision             ENUM('ACCEPT','REJECT','REQUEST_MORE_TESTS') NOT NULL,
  reviewed_by_user_id   BIGINT UNSIGNED NOT NULL,
  reviewer_name        VARCHAR(255) NOT NULL COMMENT 'Tên hiển thị chụp lúc quyết định hoặc lúc backfill',
  reviewed_at          DATETIME NOT NULL,
  reason               TEXT NULL,
  review_conditions    TEXT NULL,
  confirmed            BOOLEAN NULL COMMENT 'NULL = dữ liệu cũ không lưu bằng chứng xác nhận',
  source               ENUM('REVIEW','LEGACY_SNAPSHOT') NOT NULL,
  PRIMARY KEY (id),
  KEY idx_rd_recommendation_time (recommendation_id, reviewed_at, id),
  KEY idx_rd_reviewer (reviewed_by_user_id),
  CONSTRAINT fk_rd_recommendation FOREIGN KEY (recommendation_id) REFERENCES engineering_recommendations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rd_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_rd_evidence CHECK (source = 'LEGACY_SNAPSHOT' OR (confirmed IS NOT NULL AND confirmed = TRUE AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0))
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
  UNIQUE KEY uq_tech_references_kind_name (ref_type, ref_name),
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
INSERT INTO aeb_parameters (code, name, category, unit, min_value, max_value, default_value, description, sort_order) VALUES
  ('TTC_THRESHOLD', 'TTC Threshold', 'DECISION', 's', 0.500000, 4.000000, 1.800000, 'Ngưỡng Time-to-Collision kích hoạt phanh AEB (TTC = Range / Range_Rate). Khoảng tối ưu [0.5, 3.5] s; đánh đổi giữa tránh va chạm và tỷ lệ phanh oan (ISO 15623:2013).', 1),
  ('BRAKE_ACTIVATION_DELAY', 'Brake Activation Delay', 'CONTROL', 's', 0.000000, 0.500000, 0.150000, 'Độ trễ phản hồi hệ thống chấp hành phanh cơ điện tử t_total = t_CAN + t_valve + t_calliper. Khoảng tối ưu [0.0, 0.5] s (Bosch Automotive Handbook / Reif 2014).', 2),
  ('MAX_DECELERATION', 'Max Deceleration', 'VEHICLE_DYNAMICS', 'm/s2', 3.000000, 10.000000, 8.000000, 'Giới hạn giảm tốc phanh khẩn cấp tối đa a_target <= mu * g. Khoảng tối ưu [3.0, 10.0] m/s^2 (Pacejka 2012 / Euro NCAP min 5.0 m/s^2).', 3),
  ('BRAKE_BUILDUP_RATE', 'Brake Build-up Rate', 'CONTROL', 'm/s3', 5.000000, 20.000000, 20.000000, 'Tốc độ tăng lực phanh (buildup rate / jerk limit da/dt). Khoảng tối ưu [5.0, 20.0] m/s^3; cân bằng giữa RMS Jerk êm ái và quãng phanh dừng (Ebel et al. 2020 / ADR-040).', 4);

-- Thông số xe Audi e-tron mặc định trong CARLA. Mô-men phanh 1800 N·m và phanh 100% 9,13 m/s²: hiệu chuẩn 08/11/2026
-- (ADR-051, migration 014) để CARLA phanh hết cỡ gần đúng max_brake_decel_mps2.
INSERT INTO carla_vehicle_models (carla_blueprint_id, display_name, length_m, width_m, height_m,
                                  mass_kg, tire_friction, max_brake_torque_nm, wheelbase_m, max_speed_mps, max_brake_decel_mps2,
                                  carla_full_brake_decel_mps2) VALUES
  ('vehicle.audi.etron', 'Audi e-tron', 4.750, 1.930, 1.670, 2100.00, 1.00, 1800.00, 2.950, 50.00, 9.13, 9.13);

-- 4 mẫu xe CARLA 0.9.16 (migration 011): physics mặc định đọc bằng worker/vehicle_catalog.py, phanh 100% đo bằng worker/vehicle_study.py.
-- max_brake_decel_mps2 = 9,5 như e-tron (giới hạn của bộ động học, TD-17); xe tải chỉ để xem (is_supported = FALSE).
-- Model 3, Patrol, Sprinter: mô-men phanh và phanh 100% hiệu chuẩn 22/11/2026 theo carla-ped-bench đợt 2 (migration 016); xe tải giữ mặc định.
-- max_brake_decel_mps2 = min(phanh xe thật, phanh 100% đo trên CARLA) của từng xe (migration 017; nguồn ghi trong file migration).
INSERT INTO carla_vehicle_models (carla_blueprint_id, display_name, length_m, width_m, height_m, num_wheels, mass_kg, drag_coefficient,
                                  center_of_mass_x_m, center_of_mass_y_m, center_of_mass_z_m, tire_friction, max_brake_torque_nm,
                                  wheelbase_m, max_speed_mps, max_brake_decel_mps2, carla_full_brake_decel_mps2, is_supported) VALUES
  ('vehicle.tesla.model3', 'Tesla Model 3', 4.792, 2.163, 1.488, 4, 1845.00, 0.150, 0.450, 0.000, -0.300, 3.50, 1750.00, 3.002, NULL, 9.10, 9.87, TRUE),
  ('vehicle.nissan.patrol_2021', 'Nissan Patrol 2021', 5.566, 2.150, 2.045, 4, 2355.00, 0.300, 0.600, 0.000, -0.500, 3.50, 2250.00, 3.276, NULL, 8.80, 9.90, TRUE),
  ('vehicle.mercedes.sprinter', 'Mercedes Sprinter', 5.915, 1.988, 2.561, 4, 3000.00, 0.500, 0.600, 0.000, -0.800, 3.50, 2250.00, 3.658, NULL, 8.50, 8.91, TRUE),
  ('vehicle.carlamotors.european_hgv', 'CarlaMotors European HGV', 7.936, 2.891, 3.462, 6, 7000.00, 0.300, 0.800, 0.000, -1.200, 3.50, 1500.00, 3.823, NULL, 1.77, 1.77, FALSE);

-- Tri thức kỹ thuật & tiêu chuẩn Euro NCAP, OpenSCENARIO, MOBO, GPR, qEHVI & Động lực học:
INSERT INTO tech_references (ref_code, ref_type, ref_name, ref_value, unit, description, source_type, source_title, author, organization, publication_year, page, url, doi, is_active) VALUES
  ('GRAV_ACCEL', 'CONSTANT', 'Standard Gravity Acceleration', 9.806650000000, 'm/s2', 'Gia tốc trọng trường tiêu chuẩn dùng tính tải trọng & lực phanh tối đa', 'STANDARD', 'ISO 80000-3:2019 Quantities and units - Space and time', 'ISO Technical Committee ISO/TC 12', 'ISO', 2019, 'Clause 3: Space and time quantities', 'https://www.iso.org/standard/64973.html', NULL, 1),
  ('AIR_DENSITY_STP', 'CONSTANT', 'Air Density at STP', 1.225000000000, 'kg/m3', 'Mật độ không khí tiêu chuẩn (15°C, 1 atm) dùng tính lực cản khí động học', 'STANDARD', 'ICAO Doc 7488/3 Manual of the ICAO Standard Atmosphere', 'International Civil Aviation Organization', 'ICAO', 1993, 'Part 1: Standard Atmosphere at Sea Level', 'https://ntrs.nasa.gov/citations/19770009539', 'NASA-TM-X-74335', 1),
  ('UNECE_R152', 'STANDARD', 'UN Regulation No. 152 (AEBS for M1/N1 Vehicles)', NULL, NULL, 'Quy chuẩn Liên Hiệp Quốc về phê chuẩn hệ thống phanh tự động khẩn cấp cho xe du lịch M1 và xe tải nhẹ N1', 'REGULATION', 'UN Regulation No. 152 Uniform provisions concerning AEBS', 'United Nations Working Party on Automated Vehicles', 'United Nations ECE', 2020, 'Annex 3: Test procedures for M1/N1 vehicles', 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:42020X1080', 'OJ-L-360-2020-UNECE-R152', 1),
  ('EURO_NCAP_AEB_C2C', 'STANDARD', 'Euro NCAP AEB Car-to-Car Assessment Protocol', NULL, NULL, 'Quy chuẩn đánh giá hệ thống phanh tự động khẩn cấp giữa xe và xe (CCRs, CCRm, CCRb)', 'STANDARD', 'Euro NCAP Test Protocol - AEB Systems v3.0.2 / v4.3', 'Euro NCAP Technical Secretariat', 'Euro NCAP', 2023, 'Version 4.3 (2023), Section 5: Car-to-Car Tests', 'https://www.euroncap.com/en/for-engineers/protocols/', 'EURONCAP-C2C-4.3', 1),
  ('EURO_NCAP_AEB_VRU', 'STANDARD', 'Euro NCAP AEB Vulnerable Road User Protocol', NULL, NULL, 'Quy chuẩn đánh giá AEB đối với người đi bộ và người đi xe đạp (CPFA, CPNA, CPNCO, CPLA, CPTA)', 'STANDARD', 'Euro NCAP Test Protocol - AEB/LSS VRU systems v4.5', 'Euro NCAP Technical Secretariat', 'Euro NCAP', 2023, 'Version 4.5 (2023), Section 4: VRU Test Scenarios', 'https://www.euroncap.com/en/for-engineers/protocols/', 'EURONCAP-VRU-4.5', 1),
  ('OPENSCENARIO_1_X', 'STANDARD', 'ASAM OpenSCENARIO Standard', NULL, NULL, 'Chuẩn quốc tế mô tả động học kịch bản thử nghiệm xe tự hành (.xosc) hỗ trợ bởi CARLA ScenarioRunner', 'STANDARD', 'ASAM OpenSCENARIO User Guide v1.0 / v1.1', 'Association for Standardization of Automation (ASAM)', 'ASAM', 2021, 'Version 1.1, Clause 6: OpenSCENARIO Data Model', 'https://www.asam.net/standards/detail/openscenario-xml/', NULL, 1),
  ('ISO_15623_TTC', 'DEFINITION', 'Time-to-Collision (TTC) Definition & Forward Collision Warning', NULL, NULL, 'Định nghĩa chuẩn và yêu cầu kích hoạt cảnh báo theo Time-to-Collision: TTC = Range / Range_Rate', 'STANDARD', 'ISO 15623:2013 Transport systems - Forward vehicle collision warning systems', 'ISO Technical Committee ISO/TC 204', 'ISO', 2013, 'Section 3.1: Terms & Section 5: Specifications', 'https://www.iso.org/standard/54483.html', NULL, 1),
  ('RASMUSSEN_GPR_2006', 'THEORY', 'Gaussian Process Regression & RBF Covariance Kernel', NULL, NULL, 'Mô hình hồi quy phi tham số Gaussian Process Regression (GPR) sử dụng hàm nhân RBF (Radial Basis Function / Squared Exponential) để xấp xỉ không gian mục tiêu 3 chiều (RMS Jerk, Impact Speed, Stopping Distance) từ 4 tham số AEB. k(x, x') = sigma_f^2 * exp(-0.5 * sum((x_d - x'_d)^2 / ell^2)) với length_scale ell = 0.35, signal_variance sigma_f^2 = 1.0.', 'PAPER', 'Gaussian Processes for Machine Learning (Adaptive Computation and Machine Learning series)', 'Carl Edward Rasmussen, Christopher K. I. Williams', 'The MIT Press', 2006, 'Mục 2.2: Function-space View, tr. 13-36', 'https://gaussianprocess.org/gpml/', '10.7551/mitpress/3206.001.0001', 1),
  ('CHOLESKY_JITTER_REG', 'PRINCIPLE', 'Cholesky Factorization with Jitter Regularization for Covariance Matrix', NULL, NULL, 'Giải hệ phương trình hiệp phương sai K * alpha = y qua phân rã Cholesky K = L * L^T (tam giác dưới). Nhằm đảm bảo ma trận K luôn đối xứng xác định dương (positive definite) và tránh suy biến số học do các điểm mẫu gần nhau, thêm nhiễu quan sát sigma_n^2 = 1e-4 và jitter epsilon = 1e-6 vào đường chéo: K_ii = k(x_i, x_i) + sigma_n^2 + epsilon.', 'BOOK', 'Matrix Computations (4th Edition)', 'Gene H. Golub, Charles F. Van Loan', 'Johns Hopkins University Press', 2013, 'Chương 4: Special Linear Systems, tr. 160-168', 'https://doi.org/10.56021/9781421407944', '10.56021/9781421407944', 1),
  ('DAULTON_QEHVI_2020', 'THEORY', 'q-Expected Hypervolume Improvement (qEHVI) Acquisition Function', NULL, NULL, 'Hàm thu thập tối ưu hóa đa mục tiêu Bayes qEHVI dựa trên xấp xỉ tích phân Monte Carlo N_MC = 64 mẫu: qEHVI(x) = E[HVI(y, P, r)]. Cho phép tính kỳ vọng mức tăng thể tích siêu khối Hypervolume từ phân phối hậu nghiệm N(mu(x), sigma^2(x)) của 3 Gaussian Process độc lập so với mặt cong Pareto hiện tại P và điểm tham chiếu r.', 'PAPER', 'Differentiable Expected Hypervolume Improvement for Parallel Multi-Objective Bayesian Optimization', 'Samuel Daulton, Maxim Balandat, Eytan Bakshy', 'Advances in Neural Information Processing Systems (NeurIPS 2020)', 2020, 'Tập 33, tr. 9851-9864', 'https://arxiv.org/abs/2007.04297', '10.48550/arXiv.2007.04297', 1),
  ('EMMERICH_HVI_2011', 'THEORY', 'Hypervolume-Based Expected Improvement for Multi-Objective Optimization', NULL, NULL, 'Cơ sở lý thuyết về hàm cải thiện thể tích siêu khối (Hypervolume Improvement - HVI). HVI(y, P, r) = HV(P U {y}, r) - HV(P, r) khi y không bị Pareto P thống trị và y < r; ngược lại HVI = 0. Định nghĩa không gian phân vùng tích phân giải tích cho tối ưu đa mục tiêu Bayes.', 'PAPER', 'Hypervolume-based expected improvement for constrained multi-objective optimization', 'Michael T. M. Emmerich, André H. Deutz, Julia W. Klinkenberg', 'Journal of Global Optimization', 2011, 'Tập 51(2), tr. 231-255', 'https://doi.org/10.1007/s10898-010-9596-7', '10.1007/s10898-010-9596-7', 1),
  ('ZITZLER_HYPERVOLUME_1999', 'DEFINITION', 'Hypervolume Indicator (S-Metric) & Pareto Dominance Definition', NULL, NULL, 'Chỉ số đánh giá độ bao phủ Pareto Front bằng độ đo Lebesgue Hypervolume: HV(P, r) = Lambda(U_{p in P} [p, r]). Đồng thời định nghĩa quan hệ Pareto Dominance cho bài toán MINIMIZE: a dominates b iff (forall i: a_i <= b_i) and (exists j: a_j < b_j). Nghiệm Pareto là tập các trial không bị bất kỳ trial nào khác thống trị.', 'PAPER', 'Multiobjective evolutionary algorithms: a comparative case study and the strength Pareto approach', 'Eckart Zitzler, Lothar Thiele', 'IEEE Transactions on Evolutionary Computation', 1999, 'Tập 3(4), tr. 257-271', 'https://doi.org/10.1109/4235.797969', '10.1109/4235.797969', 1),
  ('WHILE_SLICE_HV_2006', 'PRINCIPLE', '3D Slice-Based Hypervolume Exact Integration Algorithm', NULL, NULL, 'Giải thuật tính chính xác Hypervolume 3 chiều bằng phương pháp quét lát cắt hình học (3D Slicing). Phân rã trục Z (Stopping Distance) thành các đoạn cao Delta z_i, tại mỗi lát tính hợp diện tích hình chữ nhật trên mặt phẳng (X: Jerk, Y: Speed). Độ phức tạp O(N^2 log N) với N điểm Pareto, thực thi dưới 2ms trên JVM.', 'PAPER', 'A faster algorithm for calculating hypervolume', 'Lyndon While, Philip Hingston, Luigi Barone, Simon Huband', 'IEEE Transactions on Evolutionary Computation', 2006, 'Tập 10(1), tr. 29-38', 'https://doi.org/10.1109/TEVC.2005.859463', '10.1109/TEVC.2005.859463', 1),
  ('MOBO_REF_POINT', 'CONSTANT', 'MOBO 3D Normalized Hypervolume Reference Point', 1.100000000000, 'normalized', 'Điểm tham chiếu mốc xấu nhất r = [1.1, 1.1, 1.1]^T trong không gian mục tiêu 3 chiều đã chuẩn hóa Min-Max về [0, 1]^3. Được đặt vượt quá biên 1.0 một khoảng 10% để đảm bảo các điểm nằm ở biên của Pareto Front vẫn có gradient thể tích HVI dương và được phân phối mẫu công bằng.', 'PAPER', 'Differentiable Expected Hypervolume Improvement for Parallel Multi-Objective Bayesian Optimization (NeurIPS 2020)', 'Samuel Daulton et al.', 'Meta AI Research', 2020, 'Mục 3: Problem Setup, tr. 9853', 'https://arxiv.org/abs/2007.04297', '10.48550/arXiv.2007.04297', 1),
  ('MOBO_DEDUP_TOLERANCE', 'CONSTANT', 'Candidate Parameter Deduplication Euclidean Threshold', 0.040000000000, 'normalized', 'Ngưỡng khoảng cách Euclidean tối thiểu tau = 0.04 (tau^2 = 0.0016) trên không gian tham số chuẩn hóa [0, 1]^4. Bất kỳ ứng viên đề xuất nào có sum((x_cand,d - x_prev,d)^2) < tau^2 so với các trial đã chạy trong baseline sẽ bị loại bỏ để tránh lãng phí thời gian mô phỏng CARLA cho các cấu hình tương đương.', 'INDUSTRY_SPEC', 'VehicSim ADR-040: Rút scope 4 tham số AEB & Kỹ thuật tối ưu hóa MOBO', 'VehicSim Architecture Board', 'SEP490-FA26-G15', 2026, 'Mục 4: Thuật toán đề xuất candidate', 'https://botorch.org/', '10.48550/arXiv.2007.04297', 1),
  ('CP_CROSSING_TTC', 'PRINCIPLE', 'Kinematic Time-to-Collision for Crossing Pedestrian Scenarios', NULL, NULL, 'Công thức tính thời gian tới va chạm: TTC = gap / (v_ego - v_target,x) với v_target,x = 0 trong kịch bản người đi bộ cắt ngang. Khoảng hở dọc gap = -((p_ego + L_f * f_hat - O) . f_hat). Chỉ kích hoạt đánh giá khi khoảng cách gap > 0, tốc độ tiếp cận v_approach >= 2.0 m/s và đối tượng được phân loại nằm trong vùng phát hiện.', 'STANDARD', 'ISO 15623:2013 / Euro NCAP AEB VRU Protocol v4.5', 'ISO / Euro NCAP Technical Committee', 'ISO / Euro NCAP', 2023, 'Section 5.3: Assessment of AEB Pedestrian', 'https://www.iso.org/standard/54483.html', NULL, 1),
  ('AEB_DANGER_CORRIDOR', 'PRINCIPLE', 'Dynamic Lateral Corridor & In-Path Assessment', NULL, NULL, 'Quy tắc xác định đối tượng nằm trong hành lang nguy hiểm: inPath <=> (|y_pred| <= w_c) OR (|y_seen| <= w_c). Vị trí ngang dự đoán y_pred = y_seen + v_y * min(TTC, 2.0s). Bán độ rộng hành lang w_c = 0.5 * W_vehicle + 0.25 * 2.0m (với W_vehicle = 1.93m trên Audi e-tron => w_c = 1.465m).', 'INDUSTRY_SPEC', 'VehicSim ADR-057: Hành lang AEB theo bề rộng xe & Sổ tay công thức CP_CROSSING', 'VehicSim Core Team', 'SEP490-FA26-G15', 2026, 'CT 21: Hành lang nguy hiểm, tr. 5', 'https://www.euroncap.com/en/for-engineers/protocols/', 'EURONCAP-VRU-4.5', 1),
  ('AEB_BRAKE_ONSET_DELAY', 'THEORY', 'Total Brake Onset Latency Model', NULL, NULL, 'Mô hình thời điểm phanh bắt đầu sinh lực cản thực tế: t_onset = t_decision + tau_delay + tau_actuator. Trong đó tau_delay là tham số tối ưu BRAKE_ACTIVATION_DELAY (thời gian trễ tính toán ECU và thuật toán, 0.05 - 0.45s), tau_actuator = 0.10s là độ trễ vật lý của bộ trợ lực phanh điện tử/thủy lực iBooster.', 'BOOK', 'Brakes, Brake Control and Driver Assistance Systems (Bosch Professional Automotive Information)', 'Konrad Reif (Ed.)', 'Springer Vieweg', 2014, 'Chương 6: Hydraulic Modulator, tr. 88-102', 'https://doi.org/10.1007/978-3-658-03978-3', '10.1007/978-3-658-03978-3', 1),
  ('JERK_LIMITED_DECEL', 'THEORY', 'Jerk-Limited Deceleration Buildup Rate Model', NULL, NULL, 'Quy luật tăng lực phanh tuyến tính theo độ dốc jerk quy định: a_cmd(t) = min(a_lim, a_cmd(t - dt) + J * dt). Lực phanh tối đa a_lim = min(MAX_DECELERATION, a_xe,DB). Tham số J = BRAKE_BUILDUP_RATE (5.0 - 20.0 m/s3) kiểm soát độ êm và ngăn chặn xung giật giật cục đột ngột gây chấn thương đốt sống cổ.', 'STANDARD', 'ISO 2631-1:1997 Mechanical vibration and shock - Evaluation of human exposure to whole-body vibration', 'ISO Technical Committee ISO/TC 108/SC 4', 'ISO', 1997, 'Part 1: General requirements, Section 6', 'https://www.iso.org/standard/7612.html', NULL, 1),
  ('ROAD_FRICTION_WEATHER', 'PRINCIPLE', 'Road Surface Tire-Pavement Friction Coefficient by Weather Condition', NULL, NULL, 'Hệ số ma sát bám dọc tối đa mu giữa lốp cao su và mặt đường nhựa theo phân loại thời tiết: mu = 1.00 (CLEAR, CLOUDY, FOG - mặt đường khô ráo tiêu chuẩn PBC >= 0.9 Euro NCAP / PFC 1.02 FMVSS 127); mu = 0.65 (RAIN - mặt đường ướt có màng nước); mu = 0.55 (HEAVY_RAIN - mặt đường ngập nước gây nguy cơ trượt nước aquaplaning).', 'BOOK', 'Automotive Handbook (9th Edition)', 'Robert Bosch GmbH', 'Wiley / Bosch', 2014, 'Tire Contact Mechanics, tr. 436-442', 'https://www.sae.org/publications/books/content/bosch9/', '10.4271/BOSCH9', 1),
  ('CARLA_PEDAL_CLOSED_LOOP', 'PRINCIPLE', 'CARLA Feed-Forward Closed-Loop Brake Pedal Mapping', NULL, NULL, 'Mô hình điều khiển bàn đạp phanh CARLA bù sai lệch giảm tốc: Pedal = clamp(a_cmd / a_full + 0.05 * (a_cmd - a_meas), 0.0, 1.0). Trong đó a_full là gia tốc phanh 100% đo đạc thực tế của từng dòng xe trên CARLA (Audi e-tron: 9.13 m/s2, Tesla Model 3: 3.56 m/s2, Nissan Patrol: 6.01 m/s2, Mercedes Sprinter: 5.69 m/s2). Gia tốc phanh thực tế a_meas = min(mu * g, (v_{k-n} - v_k) / (n * dt)).', 'INDUSTRY_SPEC', 'VehicSim ADR-051 / ADR-059: Hiệu chuẩn bàn đạp phanh và phản hồi gia tốc 3 dòng xe trên CARLA', 'VehicSim Simulation Team', 'SEP490-FA26-G15', 2026, 'ADR-051 / ADR-059', 'https://carla.readthedocs.io/en/0.9.16/', '10.48550/arXiv.1711.03938', 1),
  ('RMS_JERK_METRIC', 'DEFINITION', 'Root-Mean-Square (RMS) Jerk Comfort Evaluation Metric', NULL, NULL, 'Chỉ số đo độ êm dịu phanh RMS Jerk: Jerk_RMS = sqrt((1/N) * sum_{i=1}^N (da_i / dt)^2) tính trong pha phanh [t_onset, t_end]. Giá trị Jerk_RMS phản ánh sự biến thiên gia tốc đột ngột; giá trị càng nhỏ thể hiện quá trình kích hoạt phanh càng mượt mà, giảm nguy cơ say xe và chấn thương hành khách.', 'STANDARD', 'ISO 2631-1:1997 / Euro NCAP Technical Bulletin TB 024', 'Euro NCAP & ISO Technical Committee', 'Euro NCAP / ISO', 2023, 'Technical Bulletin TB 024: Metrics Calculation', 'https://www.euroncap.com/en/for-engineers/technical-bulletins/', 'EURONCAP-TB-024', 1),
  ('STOPPING_DISTANCE_EXTRAPOLATION', 'THEORY', 'Integrated & Extrapolated Total Stopping Distance Metric', NULL, NULL, 'Quãng đường dừng toàn phần: d_stop = (x_last - x_onset) + (v_last^2) / (2 * a_avail). Tích phân khoảng cách di chuyển từ lúc phanh bắt đầu tác dụng t_onset tới thời điểm kết thúc mô phỏng. Nếu xe chưa dừng hẳn tại lúc va chạm hoặc hết thời gian (v_last > 0), quãng đường dừng vật lý lý thuyết được ngoại suy thêm bằng động năng còn lại v_last^2 / (2 * a_avail) với a_avail = min(a_max, a_xe, mu*g, a_full).', 'STANDARD', 'ISO 22733-1:2020 Road vehicles - Test method for evaluating AEB - Part 1: Car-to-car', 'ISO Technical Committee ISO/TC 22/SC 33', 'ISO', 2020, 'Section 8.2: Braking & Stopping Distance', 'https://www.iso.org/standard/72579.html', NULL, 1),
  ('RELATIVE_IMPACT_SPEED', 'DEFINITION', 'Relative Impact Speed Metric at Collision Frame', NULL, NULL, 'Vận tốc va chạm tương đối theo chuẩn ISO 22733-1: v_rel_impact = |v_ego - v_target| tại tick cuối cùng trước khi cảm biến va chạm kích hoạt. Đây là chỉ số trọng tâm đo mức độ giảm thiểu thương vong cho người đi bộ (nguy cơ tử vong giảm mạnh từ 85% xuống dưới 10% khi vận tốc va chạm giảm từ 50 km/h xuống dưới 30 km/h theo WHO).', 'STANDARD', 'ISO 22733-2:2023 Road vehicles - Test method for evaluating AEB - Part 2: Car-to-pedestrian', 'ISO Technical Committee ISO/TC 22/SC 33', 'ISO / WHO', 2023, 'Section 7.4: Collision speed & mitigation', 'https://www.iso.org/standard/79502.html', NULL, 1),
  ('ISO_26262_ASILD_LATENCY', 'STANDARD', 'ISO 26262 Automotive Functional Safety (ASIL-D Timing Fault Tolerance)', NULL, NULL, 'Tiêu chuẩn quốc tế về an toàn chức năng phương tiện đường bộ mức ASIL-D. Đặt ra giới hạn thời gian chịu lỗi tối đa (Fault Tolerant Time Interval - FTTI) và độ trễ phản hồi thuật toán khẩn cấp tối đa không vượt quá 0.45s đối với hệ thống can thiệp phanh chủ động cấp độ an toàn cao nhất.', 'STANDARD', 'ISO 26262-1:2018 Road vehicles - Functional safety - Part 1: Vocabulary & Part 3: Concept phase', 'ISO Technical Committee ISO/TC 22/SC 32', 'ISO', 2018, 'Part 3, Section 7: Safety concept', 'https://www.iso.org/standard/68383.html', NULL, 1),
  ('FMVSS_127_AEBS', 'STANDARD', 'NHTSA FMVSS No. 127: Automatic Emergency Braking Systems for Light Vehicles', NULL, NULL, 'Quy chuẩn an toàn liên bang Hoa Kỳ bắt buộc trang bị phanh khẩn cấp tự động trên tất cả ô tô du lịch và xe tải nhẹ. Quy định xe phải tự động phanh tránh va chạm ở dải tốc độ lên tới 62 mph (100 km/h) với xe phía trước và 45 mph (72 km/h) đối với người đi bộ cả ban ngày và ban đêm.', 'REGULATION', 'Federal Motor Vehicle Safety Standards; Automatic Emergency Braking Systems for Light Vehicles (49 CFR Part 571, Docket No. NHTSA-2023-0021)', 'National Highway Traffic Safety Administration (NHTSA)', 'U.S. Department of Transportation', 2024, 'Final Rule, 49 CFR Part 571', 'https://www.federalregister.gov/documents/2024/05/09/2024-09315/federal-motor-vehicle-safety-standards-automatic-emergency-braking-systems-for-light-vehicles', '49-CFR-571.127', 1),
  ('CARLA_SIMULATOR_0_9_16', 'STANDARD', 'CARLA Autonomous Driving Simulator 0.9.16 & ScenarioRunner API', NULL, NULL, 'Nền tảng mô phỏng mã nguồn mở 3D chân thực trên Unreal Engine 4 cho phát triển xe tự hành. Cung cấp API mô phỏng vật lý đa vật thể PhysX, cảm biến radar/camera, mô hình thời tiết động và hệ thống ScenarioRunner 0.9.16 hỗ trợ chuẩn kịch bản OpenSCENARIO 1.0/1.1.', 'PAPER', 'CARLA: An Open Urban Driving Simulator', 'Alexey Dosovitskiy, German Ros, Felipe Codevilla, Antonio Lopez, Vladlen Koltun', 'Proceedings of the 1st Annual Conference on Robot Learning (CoRL 2017)', 2017, 'PMLR 78, tr. 1-16', 'https://carla.readthedocs.io/en/0.9.16/', '10.48550/arXiv.1711.03938', 1),
  ('RADAR_CROSS_SECTION_PED', 'CONSTANT', 'Pedestrian Radar Cross Section (RCS) at 77 GHz Automotive Band', 1.000000000000, 'm2', 'Diện tích phản xạ hiệu dụng radar (RCS) của hình nộm người đi bộ tiêu chuẩn Euro NCAP (Adult Pedestrian Target - EPTa) ở dải tần radar ô tô 77-79 GHz. Dùng để cấu hình độ nhạy phát hiện của cảm biến radar mô phỏng CARLA.', 'STANDARD', 'Euro NCAP Test Protocol - AEB/LSS VRU systems v4.5 / ISO 19206-2', 'Euro NCAP & ISO Joint Committee', 'Euro NCAP / ISO', 2023, 'Annex A: Target Specifications for VRU', 'https://www.euroncap.com/en/for-engineers/protocols/', 'EURONCAP-VRU-4.5', 1),
  ('COULOMB_TIRE_ADHESION_LIMIT', 'CONSTANT', 'Coulomb Friction Maximum Tire Deceleration Boundary', 9.806650000000, 'm/s2', 'Giới hạn giảm tốc cực đại theo định luật ma sát Coulomb giữa lốp cao su và mặt đường nhựa khô ráo (mu * g = 1.0 * 9.80665 m/s2). Cận trên 10.0 m/s2 của tham số MAX_DECELERATION xuất phát từ giới hạn cơ học này; lực phanh yêu cầu vượt quá ngưỡng này sẽ dẫn đến hiện tượng trượt lết bánh xe và mất khả năng ổn định hướng lái.', 'BOOK', 'Tire and Vehicle Dynamics (3rd Edition)', 'Hans B. Pacejka', 'Butterworth-Heinemann / Elsevier', 2012, 'Chương 1: Tire Characteristics, tr. 1-45', 'https://doi.org/10.1016/B978-0-08-097016-5.00001-6', '10.1016/B978-0-08-097016-5.00001-6', 1),
  ('MIN_AEB_EMERGENCY_DECEL', 'CONSTANT', 'Euro NCAP Minimum Emergency Braking Deceleration Threshold', 5.000000000000, 'm/s2', 'Ngưỡng giảm tốc tối thiểu 5.0 m/s2 để một hành vi can thiệp phanh được tính là phanh khẩn cấp tự động (Emergency Braking) theo giao thức Euro NCAP. Mọi lực can thiệp dưới 5.0 m/s2 chỉ được phân loại là cảnh báo phanh ngắn hoặc phanh tiện nghi (Comfort Braking), do đó cận dưới của MAX_DECELERATION được cố định ở 5.0 m/s2.', 'STANDARD', 'Euro NCAP Assessment Protocol - Crash Avoidance v4.3', 'Euro NCAP Technical Secretariat', 'Euro NCAP', 2023, 'Section 3.1: AEB System Definitions', 'https://www.euroncap.com/en/for-engineers/protocols/', 'EURONCAP-CA-4.3', 1),
  ('SAE_J211_CFC60', 'STANDARD', 'SAE J211-1 / ISO 6487 Channel Frequency Class 60 (CFC 60) Filtering', NULL, NULL, 'Tiêu chuẩn lọc tín hiệu gia tốc va chạm và phanh xe tự động theo Channel Frequency Class (CFC 60, tần số cắt 100 Hz / Euro NCAP TB 024 tần số 10 Hz). Sử dụng bộ lọc Butterworth pha 0 (zero-phase phaseless 12-pole / 2 lượt xuôi-ngược) để loại bỏ nhiễu rung lắc tần số cao trước khi tích phân tính RMS jerk và vận tốc va chạm.', 'STANDARD', 'SAE J211-1 Instrumentation for Impact Test - Part 1: Electronic Instrumentation', 'SAE Safety Test Instrumentation Standards Committee', 'Society of Automotive Engineers (SAE) / ISO', 2022, 'Section 5.3: Filter Classes & Data Processing', 'https://doi.org/10.4271/J211/1_202208', '10.4271/J211/1_202208', 1),
  ('PACEJKA_MAGIC_FORMULA', 'THEORY', 'Pacejka Magic Formula Tire Model (MF 5.2)', NULL, NULL, 'Mô hình động học lực bám lốp xe phi tuyến Pacejka kinh điển: Fx = D*sin(C*arctan(B*kappa - E*(B*kappa - arctan(B*kappa)))). Xác định giới hạn lực kéo và phanh dọc cực đại theo hệ số trượt bánh xe (slip ratio kappa) trên các bề mặt đường khô (mu ~ 0.85-1.0) và đường ướt (mu ~ 0.35-0.55), là cơ sở kiểm soát phanh tránh trượt lết trong AEB/ABS.', 'BOOK', 'Tire and Vehicle Dynamics (3rd Edition)', 'Hans B. Pacejka, Igo Besselink', 'Butterworth-Heinemann (Elsevier)', 2012, 'Chapter 4: Semi-Empirical Tyre Models', 'https://doi.org/10.1016/B978-0-08-097016-5.00004-9', '10.1016/B978-0-08-097016-5.00004-9', 1),
  ('ISO_19206_2_PED_TARGET', 'STANDARD', 'ISO 19206-2 Articulated Pedestrian Target (EPTa/EPTc)', NULL, NULL, 'Tiêu chuẩn quốc tế quy định đặc tính quang học, hình học, chuyển động khớp chân tay và tiết diện phản xạ sóng radar (RCS) của bia người đi bộ (EPTa người lớn chiều cao 1.8m, EPTc trẻ em 1.15m) dùng kiểm thử nghiệm thu hệ thống AEB VRU ở dải tần radar ô tô 77 GHz theo kịch bản băng qua đường CP_CROSSING.', 'STANDARD', 'ISO 19206-2:2020 Road vehicles - Test devices for target vehicles, vulnerable road users and other objects - Part 2: Pedestrian targets', 'ISO/TC 22/SC 33 Technical Committee', 'International Organization for Standardization (ISO)', 2020, 'Clause 6: Radar cross section and kinematics', 'https://www.iso.org/standard/74720.html', '10.19206-2:2020', 1),
  ('PAREGO_KNOWLES_2006', 'THEORY', 'ParEGO: Multi-Objective Bayesian Optimization via Augmented Chebyshev Scalarization', NULL, NULL, 'Thuật toán tối ưu hóa đa mục tiêu Bayes (MOBO) chuyển đổi vector mục tiêu [RMS jerk, impact speed, stopping distance] thành hàm vô hướng bằng phương pháp Chebyshev tăng cường: f_lam(y) = max_i(lam_i * y_i) + rho * sum(lam_i * y_i). Tại mỗi vòng lặp, vector trọng số lambda được lấy mẫu ngẫu nhiên trên đơn thể để khám phá toàn diện mặt biên Pareto.', 'PAPER', 'ParEGO: A Hybrid Algorithm with On-Line Control of Parameters for Distributed Multi-Objective Optimization', 'Joshua Knowles', 'IEEE Transactions on Evolutionary Computation (Vol. 10, No. 1)', 2006, 'pp. 50-66', 'https://doi.org/10.1109/TEVC.2005.851274', '10.1109/TEVC.2005.851274', 1),
  ('MESMO_ACQUISITION_2016', 'THEORY', 'MESMO: Multi-Objective Predictive Entropy Search Acquisition Function', NULL, NULL, 'Hàm thu nhận tối ưu Bayes đa mục tiêu dựa trên tối đa hóa lượng giảm entropy thông tin (mutual information) của tập nghiệm tối ưu Pareto chưa biết. Cung cấp cơ chế cân bằng khám phá (exploration) và khai thác (exploitation) hiệu quả khi đánh giá hàm chi phí mô phỏng đắt đỏ (như CARLA hoặc kinematic 100 Hz).', 'PAPER', 'Multi-Objective Predictive Entropy Search for Efficient Multi-Objective Bayesian Optimization', 'Daniel Hernández-Lobato, Jose Hernandez-Lobato, Amar Shah, Ryan Adams', 'International Conference on Machine Learning (ICML 2016, PMLR 48)', 2016, 'pp. 1492-1501', 'https://proceedings.mlr.press/v48/hernandez-lobatoa16.html', '10.48550/arXiv.1604.01502', 1),
  ('MATERN52_KERNEL', 'THEORY', 'Matérn 5/2 Covariance Kernel for Surrogate Modeling', NULL, NULL, 'Hàm hiệp phương sai Matérn với tham số độ mượt nu = 5/2 dùng trong mô hình hồi quy Gauss (GPR): k_52(r) = sigma^2 * (1 + sqrt(5)*r/l + 5*r^2/(3*l^2)) * exp(-sqrt(5)*r/l). Cho phép các hàm xấp xỉ liên tục vi phân 2 lần (C^2), phù hợp hơn RBF khi mô phỏng phản hồi động học phi tuyến tính của hệ thống phanh AEB.', 'BOOK', 'Interpolation of Spatial Data: Some Theory for Kriging', 'Michael L. Stein', 'Springer Series in Statistics', 1999, 'Chapter 2: Covariance Functions & Smoothness', 'https://doi.org/10.1007/978-1-4612-1494-6', '10.1007/978-1-4612-1494-6', 1),
  ('SOBOL_LHS_DOE', 'PRINCIPLE', 'Sobol Quasi-Random Sequences & Latin Hypercube Sampling (LHS)', NULL, NULL, 'Phương pháp thiết kế thử nghiệm không gian (Space-Filling Design of Experiments - DoE) dùng dãy Sobol độ lệch thấp (low-discrepancy) hoặc Latin Hypercube Sampling để rải đều các bộ tham số khởi tạo ban đầu [TTC, delay, decel, buildup] trong không gian 4 chiều trước khi khởi chạy chu trình học lặp Gaussian Process trong MOBO.', 'PAPER', 'A Comparison of Three Methods for Selecting Values of Input Variables in the Analysis of Output from a Computer Code', 'M. D. McKay, R. J. Beckman, W. J. Conover', 'Technometrics (Vol. 21, No. 2)', 1979, 'pp. 239-245', 'https://doi.org/10.1080/00401706.1979.10489755', '10.1080/00401706.1979.10489755', 1),
  ('BOSCH_BRAKE_SYSTEMS', 'THEORY', 'Hydraulic and Electromechanical Brake Actuation Response Dynamics', NULL, NULL, 'Mô hình cơ điện thủy lực của hệ thống phanh đĩa ô tô hiện đại (iBooster / ESP-EHB). Thời gian trễ kích hoạt phanh t_total ~ 0.35 s bao gồm: trễ nhận lệnh điện tử t_delay (~50-100 ms), lấp đầy khe hở má phanh (calliper filling ~100-150 ms) và tăng áp lực thủy lực t_buildup (~150-250 ms) đạt gia tốc cực đại (buildup_rate từ 15-40 m/s^3).', 'BOOK', 'Brakes, Brake Control and Driver Assistance Systems (Bosch Professional Automotive Information)', 'Konrad Reif (Ed.)', 'Robert Bosch GmbH / Springer Vieweg', 2014, 'Chapter 6: Hydraulic Brake Systems & Wheel Brakes', 'https://doi.org/10.1007/978-3-658-03978-3', '10.1007/978-3-658-03978-3', 1),
  ('EURO_NCAP_CP_SCENARIOS', 'STANDARD', 'Euro NCAP VRU Crossing Pedestrian Scenarios (CPFA, CPNA, CPNCO)', NULL, NULL, 'Định nghĩa chi tiết 3 kịch bản kiểm thử va chạm người đi bộ cắt ngang: (1) CPFA-50 (Car-to-Pedestrian Farside Adult, va chạm tâm xe 50%, tốc độ người đi bộ 8 km/h), (2) CPNA-25 & CPNA-75 (Nearside Adult, xuất phát từ lề gần, va chạm 25% hoặc 75% chiều rộng xe, tốc độ 5 km/h), (3) CPNCO-50 (Nearside Child Obstructed, trẻ em khuất sau xe đỗ ven đường chạy vụt ra với tốc độ 5 km/h).', 'STANDARD', 'Euro NCAP Assessment Protocol - Vulnerable Road User Protection v4.5', 'Euro NCAP Secretariat', 'European New Car Assessment Programme (Euro NCAP)', 2023, 'Section 3: AEB / LSS VRU Test Protocol', 'https://www.euroncap.com/en/for-engineers/protocols/', 'EURONCAP-VRU-4.5', 1),
  ('EURO_NCAP_TB024', 'STANDARD', 'Euro NCAP Technical Bulletin TB 024: Data Filter and Processing Protocols', NULL, NULL, 'Quy định kỹ thuật chính thức của Euro NCAP về xử lý tín hiệu cảm biến trong kiểm thử an toàn chủ động: bộ lọc 12-pole không dịch pha (zero-phase 12-pole Butterworth filter) tần số cắt -6dB tại 10 Hz cho kênh gia tốc dọc và ngang; mốc thời gian T_AEB tính từ thời điểm phanh bắt đầu kích hoạt thực sự (deceleration đạt -0.5 m/s^2 hoặc áp lực dầu đạt ngưỡng).', 'STANDARD', 'Euro NCAP Technical Bulletin TB 024: Data Filter and Processing Protocols for Active Safety', 'Euro NCAP Technical Working Group', 'European New Car Assessment Programme (Euro NCAP)', 2021, 'Clause 4: Filtering of Vehicle Kinematic Data', 'https://www.euroncap.com/en/for-engineers/technical-bulletins/', 'EURONCAP-TB-024', 1),
  ('PARAM_TTC_THRESHOLD', 'DEFINITION', 'AEB Parameter: Time-to-Collision Threshold (TTC_THRESHOLD)', NULL, 's', 'Tham số quyết định kích hoạt phanh khẩn cấp tự động: khi giá trị Time-to-Collision (TTC) dự đoán nhỏ hơn hoặc bằng ngưỡng này, hệ thống AEB lập tức phát lệnh phanh khẩn cấp. Công thức: TTC = Range / Range_Rate (hoặc X_rel / V_ego với kịch bản người đi bộ cắt ngang CP_CROSSING). Khoảng tối ưu: [0.5, 3.5] s (mặc định 1.5 - 1.8 s). Đánh đổi: TTC lớn phanh sớm giúp tránh va chạm nhưng tăng nguy cơ phanh oan (false positive); TTC nhỏ giảm phanh oan nhưng xe không đủ quãng đường dừng gây va chạm.', 'STANDARD', 'ISO 15623:2013 Transport systems - Forward vehicle collision warning systems', 'ISO Technical Committee ISO/TC 204', 'International Organization for Standardization (ISO)', 2013, 'Clause 5.3: Collision Warning & Braking Timing', 'https://www.iso.org/standard/54483.html', 'ISO-15623:2013', 1),
  ('PARAM_BRAKE_ACTIVATION_DELAY', 'THEORY', 'AEB Parameter: Brake Activation Delay (BRAKE_ACTIVATION_DELAY)', NULL, 's', 'Tham số mô hình hóa tổng thời gian trễ của hệ thống chấp hành phanh cơ điện tử: khoảng thời gian từ lúc ECU phát lệnh phanh khẩn cấp đến khi má phanh ép sát đĩa và áp suất thủy lực sinh gia tốc hãm thực sự (a(t) <= -0.5 m/s^2). Công thức: t_total = t_CAN + t_valve + t_calliper. Khoảng tối ưu: [0.0, 0.5] s (mặc định 0.15 s). Trong thời gian trễ này, xe tiếp tục chuyển động quán tính một quãng s_lost = v0 * t_delay.', 'BOOK', 'Brakes, Brake Control and Driver Assistance Systems (Bosch Professional Automotive Information)', 'Konrad Reif (Ed.)', 'Robert Bosch GmbH / Springer Vieweg', 2014, 'Chapter 6: Hydraulic Brake Systems & Wheel Brakes', 'https://www.springer.com/gp/book/9783658039776', '10.1007/978-3-658-03978-3', 1),
  ('PARAM_MAX_DECELERATION', 'PRINCIPLE', 'AEB Parameter: Maximum Emergency Deceleration (MAX_DECELERATION)', NULL, 'm/s2', 'Mức gia tốc giảm tốc tối đa mà bộ điều khiển AEB yêu cầu hệ thống phanh đạt tới trong pha phanh khẩn cấp: a_target = min(MAX_DECELERATION, mu * g). Khoảng tối ưu: [3.0, 10.0] m/s^2 (mặc định 8.0 m/s^2). Cận trên 10.0 m/s^2 bị giới hạn bởi độ bám cực đại Coulomb giữa lốp cao su và mặt đường nhựa khô ráo; cận dưới 5.0 m/s^2 là ngưỡng tối thiểu theo Euro NCAP để phân loại là phanh khẩn cấp (Emergency Braking) thay vì phanh cảnh báo.', 'BOOK', 'Tire and Vehicle Dynamics (3rd Edition)', 'Hans B. Pacejka, Igo Besselink', 'Society of Automotive Engineers (SAE) / Elsevier', 2012, 'Chapter 1: Tire Characteristics & Braking Limits', 'https://www.sae.org/publications/books/content/r-435/', '10.4271/R-435', 1),
  ('PARAM_BRAKE_BUILDUP_RATE', 'THEORY', 'AEB Parameter: Brake Buildup Rate (BRAKE_BUILDUP_RATE)', NULL, 'm/s3', 'Tốc độ tăng lực phanh (buildup rate / jerk limit), biểu thị tốc độ thay đổi gia tốc theo thời gian: r = da/dt (m/s^3). Thời gian đạt gia tốc phanh cực đại: t_buildup = MAX_DECELERATION / BRAKE_BUILDUP_RATE. Khoảng tối ưu: [5.0, 20.0] m/s^3 (mặc định 20.0 m/s^3 = JERK_LIMIT của lõi AEB theo ADR-040). Buildup rate cao giúp phanh đạt lực hãm nhanh nhất để cứu mạng nhưng tạo ra RMS Jerk lớn gây giật mạnh; buildup rate thấp giúp phanh êm ái nhưng kéo dài quãng phanh.', 'PAPER', 'Optimization of Braking Curves for Autonomous Emergency Braking Systems Considering Passenger Safety and Acceptance', 'Dominik Ebel, Christoph Lachenmayer, Klaus Dietmayer', 'IEEE Transactions on Intelligent Vehicles', 2020, 'Vol. 5, Iss. 3, pp. 488-498', 'https://ieeexplore.ieee.org/document/9089293/', '10.1109/TIV.2020.2987445', 1); ngược lại HVI = 0. Định nghĩa không gian phân vùng tích phân giải tích cho tối ưu đa mục tiêu Bayes.', 'PAPER', 'Hypervolume-based expected improvement for constrained multi-objective optimization', 'Michael T. M. Emmerich, André H. Deutz, Julia W. Klinkenberg', 'Journal of Global Optimization', 2011, 'Tập 51(2), tr. 231-255', 'https://doi.org/10.1007/s10898-010-9596-7', '10.1007/s10898-010-9596-7', 1),
  ('ZITZLER_HYPERVOLUME_1999', 'DEFINITION', 'Hypervolume Indicator (S-Metric) & Pareto Dominance Definition', NULL, NULL, 'Chỉ số đánh giá độ bao phủ Pareto Front bằng độ đo Lebesgue Hypervolume: HV(P, r) = Lambda(U_{p in P} [p, r]). Đồng thời định nghĩa quan hệ Pareto Dominance cho bài toán MINIMIZE: a dominates b iff (forall i: a_i <= b_i) and (exists j: a_j < b_j). Nghiệm Pareto là tập các trial không bị bất kỳ trial nào khác thống trị.', 'PAPER', 'Multiobjective evolutionary algorithms: a comparative case study and the strength Pareto approach', 'Eckart Zitzler, Lothar Thiele', 'IEEE Transactions on Evolutionary Computation', 1999, 'Tập 3(4), tr. 257-271', 'https://doi.org/10.1109/4235.797969', '10.1109/4235.797969', 1),
  ('WHILE_SLICE_HV_2006', 'PRINCIPLE', '3D Slice-Based Hypervolume Exact Integration Algorithm', NULL, NULL, 'Giải thuật tính chính xác Hypervolume 3 chiều bằng phương pháp quét lát cắt hình học (3D Slicing). Phân rã trục Z (Stopping Distance) thành các đoạn cao Delta z_i, tại mỗi lát tính hợp diện tích hình chữ nhật trên mặt phẳng (X: Jerk, Y: Speed). Độ phức tạp O(N^2 log N) với N điểm Pareto, thực thi dưới 2ms trên JVM.', 'PAPER', 'A faster algorithm for calculating hypervolume', 'Lyndon While, Philip Hingston, Luigi Barone, Simon Huband', 'IEEE Transactions on Evolutionary Computation', 2006, 'Tập 10(1), tr. 29-38', 'https://doi.org/10.1109/TEVC.2005.859463', '10.1109/TEVC.2005.859463', 1),
  ('MOBO_REF_POINT', 'CONSTANT', 'MOBO 3D Normalized Hypervolume Reference Point', 1.100000000000, 'normalized', 'Điểm tham chiếu mốc xấu nhất r = [1.1, 1.1, 1.1]^T trong không gian mục tiêu 3 chiều đã chuẩn hóa Min-Max về [0, 1]^3. Được đặt vượt quá biên 1.0 một khoảng 10% để đảm bảo các điểm nằm ở biên của Pareto Front vẫn có gradient thể tích HVI dương và được phân phối mẫu công bằng.', 'PAPER', 'Differentiable Expected Hypervolume Improvement for Parallel Multi-Objective Bayesian Optimization (NeurIPS 2020)', 'Samuel Daulton et al.', 'Meta AI Research', 2020, 'Mục 3: Problem Setup, tr. 9853', 'https://arxiv.org/abs/2007.04297', '10.48550/arXiv.2007.04297', 1),
  ('MOBO_DEDUP_TOLERANCE', 'CONSTANT', 'Candidate Parameter Deduplication Euclidean Threshold', 0.040000000000, 'normalized', 'Ngưỡng khoảng cách Euclidean tối thiểu tau = 0.04 (tau^2 = 0.0016) trên không gian tham số chuẩn hóa [0, 1]^4. Bất kỳ ứng viên đề xuất nào có sum((x_cand,d - x_prev,d)^2) < tau^2 so với các trial đã chạy trong baseline sẽ bị loại bỏ để tránh lãng phí thời gian mô phỏng CARLA cho các cấu hình tương đương.', 'INDUSTRY_SPEC', 'VehicSim ADR-040: Rút scope 4 tham số AEB & Kỹ thuật tối ưu hóa MOBO', 'VehicSim Architecture Board', 'SEP490-FA26-G15', 2026, 'Mục 4: Thuật toán đề xuất candidate', 'https://botorch.org/', '10.48550/arXiv.2007.04297', 1),
  ('CP_CROSSING_TTC', 'PRINCIPLE', 'Kinematic Time-to-Collision for Crossing Pedestrian Scenarios', NULL, NULL, 'Công thức tính thời gian tới va chạm: TTC = gap / (v_ego - v_target,x) với v_target,x = 0 trong kịch bản người đi bộ cắt ngang. Khoảng hở dọc gap = -((p_ego + L_f * f_hat - O) . f_hat). Chỉ kích hoạt đánh giá khi khoảng cách gap > 0, tốc độ tiếp cận v_approach >= 2.0 m/s và đối tượng được phân loại nằm trong vùng phát hiện.', 'STANDARD', 'ISO 15623:2013 / Euro NCAP AEB VRU Protocol v4.5', 'ISO / Euro NCAP Technical Committee', 'ISO / Euro NCAP', 2023, 'Section 5.3: Assessment of AEB Pedestrian', 'https://www.iso.org/standard/54483.html', NULL, 1),
  ('AEB_DANGER_CORRIDOR', 'PRINCIPLE', 'Dynamic Lateral Corridor & In-Path Assessment', NULL, NULL, 'Quy tắc xác định đối tượng nằm trong hành lang nguy hiểm: inPath <=> (|y_pred| <= w_c) OR (|y_seen| <= w_c). Vị trí ngang dự đoán y_pred = y_seen + v_y * min(TTC, 2.0s). Bán độ rộng hành lang w_c = 0.5 * W_vehicle + 0.25 * 2.0m (với W_vehicle = 1.93m trên Audi e-tron => w_c = 1.465m).', 'INDUSTRY_SPEC', 'VehicSim ADR-057: Hành lang AEB theo bề rộng xe & Sổ tay công thức CP_CROSSING', 'VehicSim Core Team', 'SEP490-FA26-G15', 2026, 'CT 21: Hành lang nguy hiểm, tr. 5', 'https://www.euroncap.com/en/for-engineers/protocols/', 'EURONCAP-VRU-4.5', 1),
  ('AEB_BRAKE_ONSET_DELAY', 'THEORY', 'Total Brake Onset Latency Model', NULL, NULL, 'Mô hình thời điểm phanh bắt đầu sinh lực cản thực tế: t_onset = t_decision + tau_delay + tau_actuator. Trong đó tau_delay là tham số tối ưu BRAKE_ACTIVATION_DELAY (thời gian trễ tính toán ECU và thuật toán, 0.05 - 0.45s), tau_actuator = 0.10s là độ trễ vật lý của bộ trợ lực phanh điện tử/thủy lực iBooster.', 'BOOK', 'Brakes, Brake Control and Driver Assistance Systems (Bosch Professional Automotive Information)', 'Konrad Reif (Ed.)', 'Springer Vieweg', 2014, 'Chương 6: Hydraulic Modulator, tr. 88-102', 'https://doi.org/10.1007/978-3-658-03978-3', '10.1007/978-3-658-03978-3', 1),
  ('JERK_LIMITED_DECEL', 'THEORY', 'Jerk-Limited Deceleration Buildup Rate Model', NULL, NULL, 'Quy luật tăng lực phanh tuyến tính theo độ dốc jerk quy định: a_cmd(t) = min(a_lim, a_cmd(t - dt) + J * dt). Lực phanh tối đa a_lim = min(MAX_DECELERATION, a_xe,DB). Tham số J = BRAKE_BUILDUP_RATE (5.0 - 20.0 m/s3) kiểm soát độ êm và ngăn chặn xung giật giật cục đột ngột gây chấn thương đốt sống cổ.', 'STANDARD', 'ISO 2631-1:1997 Mechanical vibration and shock - Evaluation of human exposure to whole-body vibration', 'ISO Technical Committee ISO/TC 108/SC 4', 'ISO', 1997, 'Part 1: General requirements, Section 6', 'https://www.iso.org/standard/7612.html', NULL, 1),
  ('ROAD_FRICTION_WEATHER', 'PRINCIPLE', 'Road Surface Tire-Pavement Friction Coefficient by Weather Condition', NULL, NULL, 'Hệ số ma sát bám dọc tối đa mu giữa lốp cao su và mặt đường nhựa theo phân loại thời tiết: mu = 1.00 (CLEAR, CLOUDY, FOG - mặt đường khô ráo tiêu chuẩn PBC >= 0.9 Euro NCAP / PFC 1.02 FMVSS 127); mu = 0.65 (RAIN - mặt đường ướt có màng nước); mu = 0.55 (HEAVY_RAIN - mặt đường ngập nước gây nguy cơ trượt nước aquaplaning).', 'BOOK', 'Automotive Handbook (9th Edition)', 'Robert Bosch GmbH', 'Wiley / Bosch', 2014, 'Tire Contact Mechanics, tr. 436-442', 'https://www.sae.org/publications/books/content/bosch9/', '10.4271/BOSCH9', 1),
  ('CARLA_PEDAL_CLOSED_LOOP', 'PRINCIPLE', 'CARLA Feed-Forward Closed-Loop Brake Pedal Mapping', NULL, NULL, 'Mô hình điều khiển bàn đạp phanh CARLA bù sai lệch giảm tốc: Pedal = clamp(a_cmd / a_full + 0.05 * (a_cmd - a_meas), 0.0, 1.0). Trong đó a_full là gia tốc phanh 100% đo đạc thực tế của từng dòng xe trên CARLA (Audi e-tron: 9.13 m/s2, Tesla Model 3: 3.56 m/s2, Nissan Patrol: 6.01 m/s2, Mercedes Sprinter: 5.69 m/s2). Gia tốc phanh thực tế a_meas = min(mu * g, (v_{k-n} - v_k) / (n * dt)).', 'INDUSTRY_SPEC', 'VehicSim ADR-051 / ADR-059: Hiệu chuẩn bàn đạp phanh và phản hồi gia tốc 3 dòng xe trên CARLA', 'VehicSim Simulation Team', 'SEP490-FA26-G15', 2026, 'ADR-051 / ADR-059', 'https://carla.readthedocs.io/en/0.9.16/', '10.48550/arXiv.1711.03938', 1),
  ('RMS_JERK_METRIC', 'DEFINITION', 'Root-Mean-Square (RMS) Jerk Comfort Evaluation Metric', NULL, NULL, 'Chỉ số đo độ êm dịu phanh RMS Jerk: Jerk_RMS = sqrt((1/N) * sum_{i=1}^N (da_i / dt)^2) tính trong pha phanh [t_onset, t_end]. Giá trị Jerk_RMS phản ánh sự biến thiên gia tốc đột ngột; giá trị càng nhỏ thể hiện quá trình kích hoạt phanh càng mượt mà, giảm nguy cơ say xe và chấn thương hành khách.', 'STANDARD', 'ISO 2631-1:1997 / Euro NCAP Technical Bulletin TB 024', 'Euro NCAP & ISO Technical Committee', 'Euro NCAP / ISO', 2023, 'Technical Bulletin TB 024: Metrics Calculation', 'https://www.euroncap.com/en/for-engineers/technical-bulletins/', 'EURONCAP-TB-024', 1),
  ('STOPPING_DISTANCE_EXTRAPOLATION', 'THEORY', 'Integrated & Extrapolated Total Stopping Distance Metric', NULL, NULL, 'Quãng đường dừng toàn phần: d_stop = (x_last - x_onset) + (v_last^2) / (2 * a_avail). Tích phân khoảng cách di chuyển từ lúc phanh bắt đầu tác dụng t_onset tới thời điểm kết thúc mô phỏng. Nếu xe chưa dừng hẳn tại lúc va chạm hoặc hết thời gian (v_last > 0), quãng đường dừng vật lý lý thuyết được ngoại suy thêm bằng động năng còn lại v_last^2 / (2 * a_avail) với a_avail = min(a_max, a_xe, mu*g, a_full).', 'STANDARD', 'ISO 22733-1:2020 Road vehicles - Test method for evaluating AEB - Part 1: Car-to-car', 'ISO Technical Committee ISO/TC 22/SC 33', 'ISO', 2020, 'Section 8.2: Braking & Stopping Distance', 'https://www.iso.org/standard/72579.html', NULL, 1),
  ('RELATIVE_IMPACT_SPEED', 'DEFINITION', 'Relative Impact Speed Metric at Collision Frame', NULL, NULL, 'Vận tốc va chạm tương đối theo chuẩn ISO 22733-1: v_rel_impact = |v_ego - v_target| tại tick cuối cùng trước khi cảm biến va chạm kích hoạt. Đây là chỉ số trọng tâm đo mức độ giảm thiểu thương vong cho người đi bộ (nguy cơ tử vong giảm mạnh từ 85% xuống dưới 10% khi vận tốc va chạm giảm từ 50 km/h xuống dưới 30 km/h theo WHO).', 'STANDARD', 'ISO 22733-2:2023 Road vehicles - Test method for evaluating AEB - Part 2: Car-to-pedestrian', 'ISO Technical Committee ISO/TC 22/SC 33', 'ISO / WHO', 2023, 'Section 7.4: Collision speed & mitigation', 'https://www.iso.org/standard/79502.html', NULL, 1),
  ('ISO_26262_ASILD_LATENCY', 'STANDARD', 'ISO 26262 Automotive Functional Safety (ASIL-D Timing Fault Tolerance)', NULL, NULL, 'Tiêu chuẩn quốc tế về an toàn chức năng phương tiện đường bộ mức ASIL-D. Đặt ra giới hạn thời gian chịu lỗi tối đa (Fault Tolerant Time Interval - FTTI) và độ trễ phản hồi thuật toán khẩn cấp tối đa không vượt quá 0.45s đối với hệ thống can thiệp phanh chủ động cấp độ an toàn cao nhất.', 'STANDARD', 'ISO 26262-1:2018 Road vehicles - Functional safety - Part 1: Vocabulary & Part 3: Concept phase', 'ISO Technical Committee ISO/TC 22/SC 32', 'ISO', 2018, 'Part 3, Section 7: Safety concept', 'https://www.iso.org/standard/68383.html', NULL, 1),
  ('FMVSS_127_AEBS', 'STANDARD', 'NHTSA FMVSS No. 127: Automatic Emergency Braking Systems for Light Vehicles', NULL, NULL, 'Quy chuẩn an toàn liên bang Hoa Kỳ bắt buộc trang bị phanh khẩn cấp tự động trên tất cả ô tô du lịch và xe tải nhẹ. Quy định xe phải tự động phanh tránh va chạm ở dải tốc độ lên tới 62 mph (100 km/h) với xe phía trước và 45 mph (72 km/h) đối với người đi bộ cả ban ngày và ban đêm.', 'REGULATION', 'Federal Motor Vehicle Safety Standards; Automatic Emergency Braking Systems for Light Vehicles (49 CFR Part 571, Docket No. NHTSA-2023-0021)', 'National Highway Traffic Safety Administration (NHTSA)', 'U.S. Department of Transportation', 2024, 'Final Rule, 49 CFR Part 571', 'https://www.federalregister.gov/documents/2024/05/09/2024-09315/federal-motor-vehicle-safety-standards-automatic-emergency-braking-systems-for-light-vehicles', '49-CFR-571.127', 1),
  ('CARLA_SIMULATOR_0_9_16', 'STANDARD', 'CARLA Autonomous Driving Simulator 0.9.16 & ScenarioRunner API', NULL, NULL, 'Nền tảng mô phỏng mã nguồn mở 3D chân thực trên Unreal Engine 4 cho phát triển xe tự hành. Cung cấp API mô phỏng vật lý đa vật thể PhysX, cảm biến radar/camera, mô hình thời tiết động và hệ thống ScenarioRunner 0.9.16 hỗ trợ chuẩn kịch bản OpenSCENARIO 1.0/1.1.', 'PAPER', 'CARLA: An Open Urban Driving Simulator', 'Alexey Dosovitskiy, German Ros, Felipe Codevilla, Antonio Lopez, Vladlen Koltun', 'Proceedings of the 1st Annual Conference on Robot Learning (CoRL 2017)', 2017, 'PMLR 78, tr. 1-16', 'https://carla.readthedocs.io/en/0.9.16/', '10.48550/arXiv.1711.03938', 1),
  ('RADAR_CROSS_SECTION_PED', 'CONSTANT', 'Pedestrian Radar Cross Section (RCS) at 77 GHz Automotive Band', 1.000000000000, 'm2', 'Diện tích phản xạ hiệu dụng radar (RCS) của hình nộm người đi bộ tiêu chuẩn Euro NCAP (Adult Pedestrian Target - EPTa) ở dải tần radar ô tô 77-79 GHz. Dùng để cấu hình độ nhạy phát hiện của cảm biến radar mô phỏng CARLA.', 'STANDARD', 'Euro NCAP Test Protocol - AEB/LSS VRU systems v4.5 / ISO 19206-2', 'Euro NCAP & ISO Joint Committee', 'Euro NCAP / ISO', 2023, 'Annex A: Target Specifications for VRU', 'https://www.euroncap.com/en/for-engineers/protocols/', 'EURONCAP-VRU-4.5', 1),
  ('COULOMB_TIRE_ADHESION_LIMIT', 'CONSTANT', 'Coulomb Friction Maximum Tire Deceleration Boundary', 9.806650000000, 'm/s2', 'Giới hạn giảm tốc cực đại theo định luật ma sát Coulomb giữa lốp cao su và mặt đường nhựa khô ráo (mu * g = 1.0 * 9.80665 m/s2). Cận trên 10.0 m/s2 của tham số MAX_DECELERATION xuất phát từ giới hạn cơ học này; lực phanh yêu cầu vượt quá ngưỡng này sẽ dẫn đến hiện tượng trượt lết bánh xe và mất khả năng ổn định hướng lái.', 'BOOK', 'Tire and Vehicle Dynamics (3rd Edition)', 'Hans B. Pacejka', 'Butterworth-Heinemann / Elsevier', 2012, 'Chương 1: Tire Characteristics, tr. 1-45', 'https://doi.org/10.1016/B978-0-08-097016-5.00001-6', '10.1016/B978-0-08-097016-5.00001-6', 1),
  ('MIN_AEB_EMERGENCY_DECEL', 'CONSTANT', 'Euro NCAP Minimum Emergency Braking Deceleration Threshold', 5.000000000000, 'm/s2', 'Ngưỡng giảm tốc tối thiểu 5.0 m/s2 để một hành vi can thiệp phanh được tính là phanh khẩn cấp tự động (Emergency Braking) theo giao thức Euro NCAP. Mọi lực can thiệp dưới 5.0 m/s2 chỉ được phân loại là cảnh báo phanh ngắn hoặc phanh tiện nghi (Comfort Braking), do đó cận dưới của MAX_DECELERATION được cố định ở 5.0 m/s2.', 'STANDARD', 'Euro NCAP Assessment Protocol - Crash Avoidance v4.3', 'Euro NCAP Technical Secretariat', 'Euro NCAP', 2023, 'Section 3.1: AEB System Definitions', 'https://www.euroncap.com/en/for-engineers/protocols/', 'EURONCAP-CA-4.3', 1),
  ('SAE_J211_CFC60', 'STANDARD', 'SAE J211-1 / ISO 6487 Channel Frequency Class 60 (CFC 60) Filtering', NULL, NULL, 'Tiêu chuẩn lọc tín hiệu gia tốc va chạm và phanh xe tự động theo Channel Frequency Class (CFC 60, tần số cắt 100 Hz / Euro NCAP TB 024 tần số 10 Hz). Sử dụng bộ lọc Butterworth pha 0 (zero-phase phaseless 12-pole / 2 lượt xuôi-ngược) để loại bỏ nhiễu rung lắc tần số cao trước khi tích phân tính RMS jerk và vận tốc va chạm.', 'STANDARD', 'SAE J211-1 Instrumentation for Impact Test - Part 1: Electronic Instrumentation', 'SAE Safety Test Instrumentation Standards Committee', 'Society of Automotive Engineers (SAE) / ISO', 2022, 'Section 5.3: Filter Classes & Data Processing', 'https://doi.org/10.4271/J211/1_202208', '10.4271/J211/1_202208', 1),
  ('PACEJKA_MAGIC_FORMULA', 'THEORY', 'Pacejka Magic Formula Tire Model (MF 5.2)', NULL, NULL, 'Mô hình động học lực bám lốp xe phi tuyến Pacejka kinh điển: Fx = D*sin(C*arctan(B*kappa - E*(B*kappa - arctan(B*kappa)))). Xác định giới hạn lực kéo và phanh dọc cực đại theo hệ số trượt bánh xe (slip ratio kappa) trên các bề mặt đường khô (mu ~ 0.85-1.0) và đường ướt (mu ~ 0.35-0.55), là cơ sở kiểm soát phanh tránh trượt lết trong AEB/ABS.', 'BOOK', 'Tire and Vehicle Dynamics (3rd Edition)', 'Hans B. Pacejka, Igo Besselink', 'Butterworth-Heinemann (Elsevier)', 2012, 'Chapter 4: Semi-Empirical Tyre Models', 'https://doi.org/10.1016/B978-0-08-097016-5.00004-9', '10.1016/B978-0-08-097016-5.00004-9', 1),
  ('ISO_19206_2_PED_TARGET', 'STANDARD', 'ISO 19206-2 Articulated Pedestrian Target (EPTa/EPTc)', NULL, NULL, 'Tiêu chuẩn quốc tế quy định đặc tính quang học, hình học, chuyển động khớp chân tay và tiết diện phản xạ sóng radar (RCS) của bia người đi bộ (EPTa người lớn chiều cao 1.8m, EPTc trẻ em 1.15m) dùng kiểm thử nghiệm thu hệ thống AEB VRU ở dải tần radar ô tô 77 GHz theo kịch bản băng qua đường CP_CROSSING.', 'STANDARD', 'ISO 19206-2:2020 Road vehicles - Test devices for target vehicles, vulnerable road users and other objects - Part 2: Pedestrian targets', 'ISO/TC 22/SC 33 Technical Committee', 'International Organization for Standardization (ISO)', 2020, 'Clause 6: Radar cross section and kinematics', 'https://www.iso.org/standard/74720.html', '10.19206-2:2020', 1),
  ('PAREGO_KNOWLES_2006', 'THEORY', 'ParEGO: Multi-Objective Bayesian Optimization via Augmented Chebyshev Scalarization', NULL, NULL, 'Thuật toán tối ưu hóa đa mục tiêu Bayes (MOBO) chuyển đổi vector mục tiêu [RMS jerk, impact speed, stopping distance] thành hàm vô hướng bằng phương pháp Chebyshev tăng cường: f_lam(y) = max_i(lam_i * y_i) + rho * sum(lam_i * y_i). Tại mỗi vòng lặp, vector trọng số lambda được lấy mẫu ngẫu nhiên trên đơn thể để khám phá toàn diện mặt biên Pareto.', 'PAPER', 'ParEGO: A Hybrid Algorithm with On-Line Control of Parameters for Distributed Multi-Objective Optimization', 'Joshua Knowles', 'IEEE Transactions on Evolutionary Computation (Vol. 10, No. 1)', 2006, 'pp. 50-66', 'https://doi.org/10.1109/TEVC.2005.851274', '10.1109/TEVC.2005.851274', 1),
  ('MESMO_ACQUISITION_2016', 'THEORY', 'MESMO: Multi-Objective Predictive Entropy Search Acquisition Function', NULL, NULL, 'Hàm thu nhận tối ưu Bayes đa mục tiêu dựa trên tối đa hóa lượng giảm entropy thông tin (mutual information) của tập nghiệm tối ưu Pareto chưa biết. Cung cấp cơ chế cân bằng khám phá (exploration) và khai thác (exploitation) hiệu quả khi đánh giá hàm chi phí mô phỏng đắt đỏ (như CARLA hoặc kinematic 100 Hz).', 'PAPER', 'Multi-Objective Predictive Entropy Search for Efficient Multi-Objective Bayesian Optimization', 'Daniel Hernández-Lobato, Jose Hernandez-Lobato, Amar Shah, Ryan Adams', 'International Conference on Machine Learning (ICML 2016, PMLR 48)', 2016, 'pp. 1492-1501', 'https://proceedings.mlr.press/v48/hernandez-lobatoa16.html', '10.48550/arXiv.1604.01502', 1),
  ('MATERN52_KERNEL', 'THEORY', 'Matérn 5/2 Covariance Kernel for Surrogate Modeling', NULL, NULL, 'Hàm hiệp phương sai Matérn với tham số độ mượt nu = 5/2 dùng trong mô hình hồi quy Gauss (GPR): k_52(r) = sigma^2 * (1 + sqrt(5)*r/l + 5*r^2/(3*l^2)) * exp(-sqrt(5)*r/l). Cho phép các hàm xấp xỉ liên tục vi phân 2 lần (C^2), phù hợp hơn RBF khi mô phỏng phản hồi động học phi tuyến tính của hệ thống phanh AEB.', 'BOOK', 'Interpolation of Spatial Data: Some Theory for Kriging', 'Michael L. Stein', 'Springer Series in Statistics', 1999, 'Chapter 2: Covariance Functions & Smoothness', 'https://doi.org/10.1007/978-1-4612-1494-6', '10.1007/978-1-4612-1494-6', 1),
  ('SOBOL_LHS_DOE', 'PRINCIPLE', 'Sobol Quasi-Random Sequences & Latin Hypercube Sampling (LHS)', NULL, NULL, 'Phương pháp thiết kế thử nghiệm không gian (Space-Filling Design of Experiments - DoE) dùng dãy Sobol độ lệch thấp (low-discrepancy) hoặc Latin Hypercube Sampling để rải đều các bộ tham số khởi tạo ban đầu [TTC, delay, decel, buildup] trong không gian 4 chiều trước khi khởi chạy chu trình học lặp Gaussian Process trong MOBO.', 'PAPER', 'A Comparison of Three Methods for Selecting Values of Input Variables in the Analysis of Output from a Computer Code', 'M. D. McKay, R. J. Beckman, W. J. Conover', 'Technometrics (Vol. 21, No. 2)', 1979, 'pp. 239-245', 'https://doi.org/10.1080/00401706.1979.10489755', '10.1080/00401706.1979.10489755', 1),
  ('BOSCH_BRAKE_SYSTEMS', 'THEORY', 'Hydraulic and Electromechanical Brake Actuation Response Dynamics', NULL, NULL, 'Mô hình cơ điện thủy lực của hệ thống phanh đĩa ô tô hiện đại (iBooster / ESP-EHB). Thời gian trễ kích hoạt phanh t_total ~ 0.35 s bao gồm: trễ nhận lệnh điện tử t_delay (~50-100 ms), lấp đầy khe hở má phanh (calliper filling ~100-150 ms) và tăng áp lực thủy lực t_buildup (~150-250 ms) đạt gia tốc cực đại (buildup_rate từ 15-40 m/s^3).', 'BOOK', 'Brakes, Brake Control and Driver Assistance Systems (Bosch Professional Automotive Information)', 'Konrad Reif (Ed.)', 'Robert Bosch GmbH / Springer Vieweg', 2014, 'Chapter 6: Hydraulic Brake Systems & Wheel Brakes', 'https://doi.org/10.1007/978-3-658-03978-3', '10.1007/978-3-658-03978-3', 1),
  ('EURO_NCAP_CP_SCENARIOS', 'STANDARD', 'Euro NCAP VRU Crossing Pedestrian Scenarios (CPFA, CPNA, CPNCO)', NULL, NULL, 'Định nghĩa chi tiết 3 kịch bản kiểm thử va chạm người đi bộ cắt ngang: (1) CPFA-50 (Car-to-Pedestrian Farside Adult, va chạm tâm xe 50%, tốc độ người đi bộ 8 km/h), (2) CPNA-25 & CPNA-75 (Nearside Adult, xuất phát từ lề gần, va chạm 25% hoặc 75% chiều rộng xe, tốc độ 5 km/h), (3) CPNCO-50 (Nearside Child Obstructed, trẻ em khuất sau xe đỗ ven đường chạy vụt ra với tốc độ 5 km/h).', 'STANDARD', 'Euro NCAP Assessment Protocol - Vulnerable Road User Protection v4.5', 'Euro NCAP Secretariat', 'European New Car Assessment Programme (Euro NCAP)', 2023, 'Section 3: AEB / LSS VRU Test Protocol', 'https://www.euroncap.com/en/for-engineers/protocols/', 'EURONCAP-VRU-4.5', 1),
  ('EURO_NCAP_TB024', 'STANDARD', 'Euro NCAP Technical Bulletin TB 024: Data Filter and Processing Protocols', NULL, NULL, 'Quy định kỹ thuật chính thức của Euro NCAP về xử lý tín hiệu cảm biến trong kiểm thử an toàn chủ động: bộ lọc 12-pole không dịch pha (zero-phase 12-pole Butterworth filter) tần số cắt -6dB tại 10 Hz cho kênh gia tốc dọc và ngang; mốc thời gian T_AEB tính từ thời điểm phanh bắt đầu kích hoạt thực sự (deceleration đạt -0.5 m/s^2 hoặc áp lực dầu đạt ngưỡng).', 'STANDARD', 'Euro NCAP Technical Bulletin TB 024: Data Filter and Processing Protocols for Active Safety', 'Euro NCAP Technical Working Group', 'European New Car Assessment Programme (Euro NCAP)', 2021, 'Clause 4: Filtering of Vehicle Kinematic Data', 'https://www.euroncap.com/en/for-engineers/technical-bulletins/', 'EURONCAP-TB-024', 1); ngược lại HVI = 0. Định nghĩa không gian phân vùng tích phân giải tích cho tối ưu đa mục tiêu Bayes.', 'PAPER', 'Hypervolume-based expected improvement for constrained multi-objective optimization', 'Michael T. M. Emmerich, André H. Deutz, Julia W. Klinkenberg', 'Journal of Global Optimization', 2011, 'Tập 51(2), tr. 231-255', 'https://link.springer.com/article/10.1007/s10898-010-9596-7', '10.1007/s10898-010-9596-7', 1),
  ('ZITZLER_HYPERVOLUME_1999', 'DEFINITION', 'Hypervolume Indicator (S-Metric) & Pareto Dominance Definition', NULL, NULL, 'Chỉ số đánh giá độ bao phủ Pareto Front bằng độ đo Lebesgue Hypervolume: HV(P, r) = Lambda(U_{p in P} [p, r]). Đồng thời định nghĩa quan hệ Pareto Dominance cho bài toán MINIMIZE: a dominates b iff (forall i: a_i <= b_i) and (exists j: a_j < b_j). Nghiệm Pareto là tập các trial không bị bất kỳ trial nào khác thống trị.', 'PAPER', 'Multiobjective evolutionary algorithms: a comparative case study and the strength Pareto approach', 'Eckart Zitzler, Lothar Thiele', 'IEEE Transactions on Evolutionary Computation', 1999, 'Tập 3(4), tr. 257-271', 'https://ieeexplore.ieee.org/document/797969', '10.1109/4235.797969', 1),
  ('WHILE_SLICE_HV_2006', 'PRINCIPLE', '3D Slice-Based Hypervolume Exact Integration Algorithm', NULL, NULL, 'Giải thuật tính chính xác Hypervolume 3 chiều bằng phương pháp quét lát cắt hình học (3D Slicing). Phân rã trục Z (Stopping Distance) thành các đoạn cao Delta z_i, tại mỗi lát tính hợp diện tích hình chữ nhật trên mặt phẳng (X: Jerk, Y: Speed). Độ phức tạp O(N^2 log N) với N điểm Pareto, thực thi dưới 2ms trên JVM.', 'PAPER', 'A faster algorithm for calculating hypervolume', 'Lyndon While, Philip Hingston, Luigi Barone, Simon Huband', 'IEEE Transactions on Evolutionary Computation', 2006, 'Tập 10(1), tr. 29-38', 'https://ieeexplore.ieee.org/document/1597059', '10.1109/TEVC.2005.859463', 1),
  ('MOBO_REF_POINT', 'CONSTANT', 'MOBO 3D Normalized Hypervolume Reference Point', 1.100000000000, 'normalized', 'Điểm tham chiếu mốc xấu nhất r = [1.1, 1.1, 1.1]^T trong không gian mục tiêu 3 chiều đã chuẩn hóa Min-Max về [0, 1]^3. Được đặt vượt quá biên 1.0 một khoảng 10% để đảm bảo các điểm nằm ở biên của Pareto Front vẫn có gradient thể tích HVI dương và được phân phối mẫu công bằng.', 'PAPER', 'Differentiable Expected Hypervolume Improvement for Parallel Multi-Objective Bayesian Optimization (NeurIPS 2020)', 'Samuel Daulton et al.', 'Meta AI Research', 2020, 'Mục 3: Problem Setup, tr. 9853', 'https://arxiv.org/abs/2007.04297', '10.48550/arXiv.2007.04297', 1),
  ('MOBO_DEDUP_TOLERANCE', 'CONSTANT', 'Candidate Parameter Deduplication Euclidean Threshold', 0.040000000000, 'normalized', 'Ngưỡng khoảng cách Euclidean tối thiểu tau = 0.04 (tau^2 = 0.0016) trên không gian tham số chuẩn hóa [0, 1]^4. Bất kỳ ứng viên đề xuất nào có sum((x_cand,d - x_prev,d)^2) < tau^2 so với các trial đã chạy trong baseline sẽ bị loại bỏ để tránh lãng phí thời gian mô phỏng CARLA cho các cấu hình tương đương.', 'INDUSTRY_SPEC', 'VehicSim ADR-040: Rút scope 4 tham số AEB & Kỹ thuật tối ưu hóa MOBO', 'VehicSim Architecture Board', 'SEP490-FA26-G15', 2026, 'Mục 4: Thuật toán đề xuất candidate', NULL, NULL, 1),
  ('CP_CROSSING_TTC', 'PRINCIPLE', 'Kinematic Time-to-Collision for Crossing Pedestrian Scenarios', NULL, NULL, 'Công thức tính thời gian tới va chạm: TTC = gap / (v_ego - v_target,x) với v_target,x = 0 trong kịch bản người đi bộ cắt ngang. Khoảng hở dọc gap = -((p_ego + L_f * f_hat - O) . f_hat). Chỉ kích hoạt đánh giá khi khoảng cách gap > 0, tốc độ tiếp cận v_approach >= 2.0 m/s và đối tượng được phân loại nằm trong vùng phát hiện.', 'STANDARD', 'ISO 15623:2013 / Euro NCAP AEB VRU Protocol v4.5', 'ISO / Euro NCAP Technical Committee', 'ISO / Euro NCAP', 2023, 'Section 5.3: Assessment of AEB Pedestrian', 'https://www.iso.org/standard/54483.html', NULL, 1),
  ('AEB_DANGER_CORRIDOR', 'PRINCIPLE', 'Dynamic Lateral Corridor & In-Path Assessment', NULL, NULL, 'Quy tắc xác định đối tượng nằm trong hành lang nguy hiểm: inPath <=> (|y_pred| <= w_c) OR (|y_seen| <= w_c). Vị trí ngang dự đoán y_pred = y_seen + v_y * min(TTC, 2.0s). Bán độ rộng hành lang w_c = 0.5 * W_vehicle + 0.25 * 2.0m (với W_vehicle = 1.93m trên Audi e-tron => w_c = 1.465m).', 'INDUSTRY_SPEC', 'VehicSim ADR-057: Hành lang AEB theo bề rộng xe & Sổ tay công thức CP_CROSSING', 'VehicSim Core Team', 'SEP490-FA26-G15', 2026, 'CT 21: Hành lang nguy hiểm, tr. 5', NULL, NULL, 1),
  ('AEB_BRAKE_ONSET_DELAY', 'THEORY', 'Total Brake Onset Latency Model', NULL, NULL, 'Mô hình thời điểm phanh bắt đầu sinh lực cản thực tế: t_onset = t_decision + tau_delay + tau_actuator. Trong đó tau_delay là tham số tối ưu BRAKE_ACTIVATION_DELAY (thời gian trễ tính toán ECU và thuật toán, 0.05 - 0.45s), tau_actuator = 0.10s là độ trễ vật lý của bộ trợ lực phanh điện tử/thủy lực iBooster.', 'BOOK', 'Brakes, Brake Control and Driver Assistance Systems (Bosch Professional Automotive Information)', 'Konrad Reif (Ed.)', 'Springer Vieweg', 2014, 'Chương 6: Hydraulic Modulator, tr. 88-102', 'https://link.springer.com/book/10.1007/978-3-658-03978-3', '10.1007/978-3-658-03978-3', 1),
  ('JERK_LIMITED_DECEL', 'THEORY', 'Jerk-Limited Deceleration Buildup Rate Model', NULL, NULL, 'Quy luật tăng lực phanh tuyến tính theo độ dốc jerk quy định: a_cmd(t) = min(a_lim, a_cmd(t - dt) + J * dt). Lực phanh tối đa a_lim = min(MAX_DECELERATION, a_xe,DB). Tham số J = BRAKE_BUILDUP_RATE (5.0 - 20.0 m/s3) kiểm soát độ êm và ngăn chặn xung giật giật cục đột ngột gây chấn thương đốt sống cổ.', 'STANDARD', 'ISO 2631-1:1997 Mechanical vibration and shock - Evaluation of human exposure to whole-body vibration', 'ISO Technical Committee ISO/TC 108/SC 4', 'ISO', 1997, 'Part 1: General requirements, Section 6', 'https://www.iso.org/standard/7612.html', NULL, 1),
  ('ROAD_FRICTION_WEATHER', 'PRINCIPLE', 'Road Surface Tire-Pavement Friction Coefficient by Weather Condition', NULL, NULL, 'Hệ số ma sát bám dọc tối đa mu giữa lốp cao su và mặt đường nhựa theo phân loại thời tiết: mu = 1.00 (CLEAR, CLOUDY, FOG - mặt đường khô ráo tiêu chuẩn PBC >= 0.9 Euro NCAP / PFC 1.02 FMVSS 127); mu = 0.65 (RAIN - mặt đường ướt có màng nước); mu = 0.55 (HEAVY_RAIN - mặt đường ngập nước gây nguy cơ trượt nước aquaplaning).', 'BOOK', 'Automotive Handbook (9th Edition)', 'Robert Bosch GmbH', 'Wiley / Bosch', 2014, 'Tire Contact Mechanics, tr. 436-442', 'https://www.wiley.com/en-us/Automotive+Handbook%2C+9th+Edition-p-9781119032946', NULL, 1),
  ('CARLA_PEDAL_CLOSED_LOOP', 'PRINCIPLE', 'CARLA Feed-Forward Closed-Loop Brake Pedal Mapping', NULL, NULL, 'Mô hình điều khiển bàn đạp phanh CARLA bù sai lệch giảm tốc: Pedal = clamp(a_cmd / a_full + 0.05 * (a_cmd - a_meas), 0.0, 1.0). Trong đó a_full là gia tốc phanh 100% đo đạc thực tế của từng dòng xe trên CARLA (Audi e-tron: 9.13 m/s2, Tesla Model 3: 3.56 m/s2, Nissan Patrol: 6.01 m/s2, Mercedes Sprinter: 5.69 m/s2). Gia tốc phanh thực tế a_meas = min(mu * g, (v_{k-n} - v_k) / (n * dt)).', 'INDUSTRY_SPEC', 'VehicSim ADR-051 / ADR-059: Hiệu chuẩn bàn đạp phanh và phản hồi gia tốc 3 dòng xe trên CARLA', 'VehicSim Simulation Team', 'SEP490-FA26-G15', 2026, 'ADR-051 / ADR-059', NULL, NULL, 1),
  ('RMS_JERK_METRIC', 'DEFINITION', 'Root-Mean-Square (RMS) Jerk Comfort Evaluation Metric', NULL, NULL, 'Chỉ số đo độ êm dịu phanh RMS Jerk: Jerk_RMS = sqrt((1/N) * sum_{i=1}^N (da_i / dt)^2) tính trong pha phanh [t_onset, t_end]. Giá trị Jerk_RMS phản ánh sự biến thiên gia tốc đột ngột; giá trị càng nhỏ thể hiện quá trình kích hoạt phanh càng mượt mà, giảm nguy cơ say xe và chấn thương hành khách.', 'STANDARD', 'ISO 2631-1:1997 / Euro NCAP Technical Bulletin TB 024', 'Euro NCAP & ISO Technical Committee', 'Euro NCAP / ISO', 2023, 'Technical Bulletin TB 024: Metrics Calculation', 'https://www.euroncap.com/en/for-engineers/technical-bulletins/', NULL, 1),
  ('STOPPING_DISTANCE_EXTRAPOLATION', 'THEORY', 'Integrated & Extrapolated Total Stopping Distance Metric', NULL, NULL, 'Quãng đường dừng toàn phần: d_stop = (x_last - x_onset) + (v_last^2) / (2 * a_avail). Tích phân khoảng cách di chuyển từ lúc phanh bắt đầu tác dụng t_onset tới thời điểm kết thúc mô phỏng. Nếu xe chưa dừng hẳn tại lúc va chạm hoặc hết thời gian (v_last > 0), quãng đường dừng vật lý lý thuyết được ngoại suy thêm bằng động năng còn lại v_last^2 / (2 * a_avail) với a_avail = min(a_max, a_xe, mu*g, a_full).', 'STANDARD', 'ISO 22733-1:2020 Road vehicles - Test method for evaluating AEB - Part 1: Car-to-car', 'ISO Technical Committee ISO/TC 22/SC 33', 'ISO', 2020, 'Section 8.2: Braking & Stopping Distance', 'https://www.iso.org/standard/72579.html', NULL, 1),
  ('RELATIVE_IMPACT_SPEED', 'DEFINITION', 'Relative Impact Speed Metric at Collision Frame', NULL, NULL, 'Vận tốc va chạm tương đối theo chuẩn ISO 22733-1: v_rel_impact = |v_ego - v_target| tại tick cuối cùng trước khi cảm biến va chạm kích hoạt. Đây là chỉ số trọng tâm đo mức độ giảm thiểu thương vong cho người đi bộ (nguy cơ tử vong giảm mạnh từ 85% xuống dưới 10% khi vận tốc va chạm giảm từ 50 km/h xuống dưới 30 km/h theo WHO).', 'STANDARD', 'ISO 22733-2:2023 Road vehicles - Test method for evaluating AEB - Part 2: Car-to-pedestrian', 'ISO Technical Committee ISO/TC 22/SC 33', 'ISO / WHO', 2023, 'Section 7.4: Collision speed & mitigation', 'https://www.iso.org/standard/79502.html', NULL, 1),
  ('ISO_26262_ASILD_LATENCY', 'STANDARD', 'ISO 26262 Automotive Functional Safety (ASIL-D Timing Fault Tolerance)', NULL, NULL, 'Tiêu chuẩn quốc tế về an toàn chức năng phương tiện đường bộ mức ASIL-D. Đặt ra giới hạn thời gian chịu lỗi tối đa (Fault Tolerant Time Interval - FTTI) và độ trễ phản hồi thuật toán khẩn cấp tối đa không vượt quá 0.45s đối với hệ thống can thiệp phanh chủ động cấp độ an toàn cao nhất.', 'STANDARD', 'ISO 26262-1:2018 Road vehicles - Functional safety - Part 1: Vocabulary & Part 3: Concept phase', 'ISO Technical Committee ISO/TC 22/SC 32', 'ISO', 2018, 'Part 3, Section 7: Safety concept', 'https://www.iso.org/standard/68383.html', NULL, 1),
  ('FMVSS_127_AEBS', 'STANDARD', 'NHTSA FMVSS No. 127: Automatic Emergency Braking Systems for Light Vehicles', NULL, NULL, 'Quy chuẩn an toàn liên bang Hoa Kỳ bắt buộc trang bị phanh khẩn cấp tự động trên tất cả ô tô du lịch và xe tải nhẹ. Quy định xe phải tự động phanh tránh va chạm ở dải tốc độ lên tới 62 mph (100 km/h) với xe phía trước và 45 mph (72 km/h) đối với người đi bộ cả ban ngày và ban đêm.', 'REGULATION', 'Federal Motor Vehicle Safety Standards; Automatic Emergency Braking Systems for Light Vehicles (49 CFR Part 571, Docket No. NHTSA-2023-0021)', 'National Highway Traffic Safety Administration (NHTSA)', 'U.S. Department of Transportation', 2024, 'Final Rule, 49 CFR Part 571', 'https://www.nhtsa.gov/press-releases/nhtsa-finalizes-key-safety-rule-automatic-emergency-braking-light-vehicles', NULL, 1),
  ('CARLA_SIMULATOR_0_9_16', 'STANDARD', 'CARLA Autonomous Driving Simulator 0.9.16 & ScenarioRunner API', NULL, NULL, 'Nền tảng mô phỏng mã nguồn mở 3D chân thực trên Unreal Engine 4 cho phát triển xe tự hành. Cung cấp API mô phỏng vật lý đa vật thể PhysX, cảm biến radar/camera, mô hình thời tiết động và hệ thống ScenarioRunner 0.9.16 hỗ trợ chuẩn kịch bản OpenSCENARIO 1.0/1.1.', 'PAPER', 'CARLA: An Open Urban Driving Simulator', 'Alexey Dosovitskiy, German Ros, Felipe Codevilla, Antonio Lopez, Vladlen Koltun', 'Proceedings of the 1st Annual Conference on Robot Learning (CoRL 2017)', 2017, 'PMLR 78, tr. 1-16', 'https://proceedings.mlr.press/v78/dosovitskiy17a.html', '10.48550/arXiv.1711.03938', 1),
  ('RADAR_CROSS_SECTION_PED', 'CONSTANT', 'Pedestrian Radar Cross Section (RCS) at 77 GHz Automotive Band', 1.000000000000, 'm2', 'Diện tích phản xạ hiệu dụng radar (RCS) của hình nộm người đi bộ tiêu chuẩn Euro NCAP (Adult Pedestrian Target - EPTa) ở dải tần radar ô tô 77-79 GHz. Dùng để cấu hình độ nhạy phát hiện của cảm biến radar mô phỏng CARLA.', 'STANDARD', 'Euro NCAP Test Protocol - AEB/LSS VRU systems v4.5 / ISO 19206-2', 'Euro NCAP & ISO Joint Committee', 'Euro NCAP / ISO', 2023, 'Annex A: Target Specifications for VRU', 'https://www.euroncap.com/en/for-engineers/protocols/', NULL, 1),
  ('COULOMB_TIRE_ADHESION_LIMIT', 'CONSTANT', 'Coulomb Friction Maximum Tire Deceleration Boundary', 9.806650000000, 'm/s2', 'Giới hạn giảm tốc cực đại theo định luật ma sát Coulomb giữa lốp cao su và mặt đường nhựa khô ráo (mu * g = 1.0 * 9.80665 m/s2). Cận trên 10.0 m/s2 của tham số MAX_DECELERATION xuất phát từ giới hạn cơ học này; lực phanh yêu cầu vượt quá ngưỡng này sẽ dẫn đến hiện tượng trượt lết bánh xe và mất khả năng ổn định hướng lái.', 'BOOK', 'Tire and Vehicle Dynamics (3rd Edition)', 'Hans B. Pacejka', 'Butterworth-Heinemann / Elsevier', 2012, 'Chương 1: Tire Characteristics, tr. 1-45', 'https://www.sciencedirect.com/book/9780080970165/tire-and-vehicle-dynamics', '10.1016/B978-0-08-097016-5.00001-6', 1),
  ('MIN_AEB_EMERGENCY_DECEL', 'CONSTANT', 'Euro NCAP Minimum Emergency Braking Deceleration Threshold', 5.000000000000, 'm/s2', 'Ngưỡng giảm tốc tối thiểu 5.0 m/s2 để một hành vi can thiệp phanh được tính là phanh khẩn cấp tự động (Emergency Braking) theo giao thức Euro NCAP. Mọi lực can thiệp dưới 5.0 m/s2 chỉ được phân loại là cảnh báo phanh ngắn hoặc phanh tiện nghi (Comfort Braking), do đó cận dưới của MAX_DECELERATION được cố định ở 5.0 m/s2.', 'STANDARD', 'Euro NCAP Assessment Protocol - Crash Avoidance v4.3', 'Euro NCAP Technical Secretariat', 'Euro NCAP', 2023, 'Section 3.1: AEB System Definitions', 'https://www.euroncap.com/en/for-engineers/protocols/', NULL, 1),
  ('SAE_J211_CFC60', 'STANDARD', 'SAE J211-1 / ISO 6487 Channel Frequency Class 60 (CFC 60) Filtering', NULL, NULL, 'Tiêu chuẩn lọc tín hiệu gia tốc va chạm và phanh xe tự động theo Channel Frequency Class (CFC 60, tần số cắt 100 Hz / Euro NCAP TB 024 tần số 10 Hz). Sử dụng bộ lọc Butterworth pha 0 (zero-phase phaseless 12-pole / 2 lượt xuôi-ngược) để loại bỏ nhiễu rung lắc tần số cao trước khi tích phân tính RMS jerk và vận tốc va chạm.', 'STANDARD', 'SAE J211-1 Instrumentation for Impact Test - Part 1: Electronic Instrumentation', 'SAE Safety Test Instrumentation Standards Committee', 'Society of Automotive Engineers (SAE) / ISO', 2022, 'Section 5.3: Filter Classes & Data Processing', 'https://www.sae.org/standards/content/j211/1_202208/', '10.4271/J211/1_202208', 1),
  ('PACEJKA_MAGIC_FORMULA', 'THEORY', 'Pacejka Magic Formula Tire Model (MF 5.2)', NULL, NULL, 'Mô hình động học lực bám lốp xe phi tuyến Pacejka kinh điển: Fx = D*sin(C*arctan(B*kappa - E*(B*kappa - arctan(B*kappa)))). Xác định giới hạn lực kéo và phanh dọc cực đại theo hệ số trượt bánh xe (slip ratio kappa) trên các bề mặt đường khô (mu ~ 0.85-1.0) và đường ướt (mu ~ 0.35-0.55), là cơ sở kiểm soát phanh tránh trượt lết trong AEB/ABS.', 'BOOK', 'Tire and Vehicle Dynamics (3rd Edition)', 'Hans B. Pacejka, Igo Besselink', 'Butterworth-Heinemann (Elsevier)', 2012, 'Chapter 4: Semi-Empirical Tyre Models', 'https://www.elsevier.com/books/tire-and-vehicle-dynamics/pacejka/978-0-08-097016-5', '10.1016/B978-0-08-097016-5.00004-9', 1),
  ('ISO_19206_2_PED_TARGET', 'STANDARD', 'ISO 19206-2 Articulated Pedestrian Target (EPTa/EPTc)', NULL, NULL, 'Tiêu chuẩn quốc tế quy định đặc tính quang học, hình học, chuyển động khớp chân tay và tiết diện phản xạ sóng radar (RCS) của bia người đi bộ (EPTa người lớn chiều cao 1.8m, EPTc trẻ em 1.15m) dùng kiểm thử nghiệm thu hệ thống AEB VRU ở dải tần radar ô tô 77 GHz theo kịch bản băng qua đường CP_CROSSING.', 'STANDARD', 'ISO 19206-2:2020 Road vehicles - Test devices for target vehicles, vulnerable road users and other objects - Part 2: Pedestrian targets', 'ISO/TC 22/SC 33 Technical Committee', 'International Organization for Standardization (ISO)', 2020, 'Clause 6: Radar cross section and kinematics', 'https://www.iso.org/standard/74720.html', '10.19206-2:2020', 1),
  ('PAREGO_KNOWLES_2006', 'THEORY', 'ParEGO: Multi-Objective Bayesian Optimization via Augmented Chebyshev Scalarization', NULL, NULL, 'Thuật toán tối ưu hóa đa mục tiêu Bayes (MOBO) chuyển đổi vector mục tiêu [RMS jerk, impact speed, stopping distance] thành hàm vô hướng bằng phương pháp Chebyshev tăng cường: f_lam(y) = max_i(lam_i * y_i) + rho * sum(lam_i * y_i). Tại mỗi vòng lặp, vector trọng số lambda được lấy mẫu ngẫu nhiên trên đơn thể để khám phá toàn diện mặt biên Pareto.', 'PAPER', 'ParEGO: A Hybrid Algorithm with On-Line Control of Parameters for Distributed Multi-Objective Optimization', 'Joshua Knowles', 'IEEE Transactions on Evolutionary Computation (Vol. 10, No. 1)', 2006, 'pp. 50-66', 'https://ieeexplore.ieee.org/document/1583592', '10.1109/TEVC.2005.851274', 1),
  ('MESMO_ACQUISITION_2016', 'THEORY', 'MESMO: Multi-Objective Predictive Entropy Search Acquisition Function', NULL, NULL, 'Hàm thu nhận tối ưu Bayes đa mục tiêu dựa trên tối đa hóa lượng giảm entropy thông tin (mutual information) của tập nghiệm tối ưu Pareto chưa biết. Cung cấp cơ chế cân bằng khám phá (exploration) và khai thác (exploitation) hiệu quả khi đánh giá hàm chi phí mô phỏng đắt đỏ (như CARLA hoặc kinematic 100 Hz).', 'PAPER', 'Multi-Objective Predictive Entropy Search for Efficient Multi-Objective Bayesian Optimization', 'Daniel Hernández-Lobato, Jose Hernandez-Lobato, Amar Shah, Ryan Adams', 'International Conference on Machine Learning (ICML 2016, PMLR 48)', 2016, 'pp. 1492-1501', 'https://proceedings.mlr.press/v48/hernandez-lobatoa16.html', '10.48550/arXiv.1604.01502', 1),
  ('MATERN52_KERNEL', 'THEORY', 'Matérn 5/2 Covariance Kernel for Surrogate Modeling', NULL, NULL, 'Hàm hiệp phương sai Matérn với tham số độ mượt nu = 5/2 dùng trong mô hình hồi quy Gauss (GPR): k_52(r) = sigma^2 * (1 + sqrt(5)*r/l + 5*r^2/(3*l^2)) * exp(-sqrt(5)*r/l). Cho phép các hàm xấp xỉ liên tục vi phân 2 lần (C^2), phù hợp hơn RBF khi mô phỏng phản hồi động học phi tuyến tính của hệ thống phanh AEB.', 'BOOK', 'Interpolation of Spatial Data: Some Theory for Kriging', 'Michael L. Stein', 'Springer Series in Statistics', 1999, 'Chapter 2: Covariance Functions & Smoothness', 'https://link.springer.com/book/10.1007/978-1-4612-1494-6', '10.1007/978-1-4612-1494-6', 1),
  ('SOBOL_LHS_DOE', 'PRINCIPLE', 'Sobol Quasi-Random Sequences & Latin Hypercube Sampling (LHS)', NULL, NULL, 'Phương pháp thiết kế thử nghiệm không gian (Space-Filling Design of Experiments - DoE) dùng dãy Sobol độ lệch thấp (low-discrepancy) hoặc Latin Hypercube Sampling để rải đều các bộ tham số khởi tạo ban đầu [TTC, delay, decel, buildup] trong không gian 4 chiều trước khi khởi chạy chu trình học lặp Gaussian Process trong MOBO.', 'PAPER', 'A Comparison of Three Methods for Selecting Values of Input Variables in the Analysis of Output from a Computer Code', 'M. D. McKay, R. J. Beckman, W. J. Conover', 'Technometrics (Vol. 21, No. 2)', 1979, 'pp. 239-245', 'https://www.jstor.org/stable/1268522', '10.1080/00401706.1979.10489755', 1),
  ('BOSCH_BRAKE_SYSTEMS', 'THEORY', 'Hydraulic and Electromechanical Brake Actuation Response Dynamics', NULL, NULL, 'Mô hình cơ điện thủy lực của hệ thống phanh đĩa ô tô hiện đại (iBooster / ESP-EHB). Thời gian trễ kích hoạt phanh t_total ~ 0.35 s bao gồm: trễ nhận lệnh điện tử t_delay (~50-100 ms), lấp đầy khe hở má phanh (calliper filling ~100-150 ms) và tăng áp lực thủy lực t_buildup (~150-250 ms) đạt gia tốc cực đại (buildup_rate từ 15-40 m/s^3).', 'BOOK', 'Brakes, Brake Control and Driver Assistance Systems (Bosch Professional Automotive Information)', 'Konrad Reif (Ed.)', 'Robert Bosch GmbH / Springer Vieweg', 2014, 'Chapter 6: Hydraulic Brake Systems & Wheel Brakes', 'https://link.springer.com/book/10.1007/978-3-658-03978-3', '10.1007/978-3-658-03978-3', 1),
  ('EURO_NCAP_CP_SCENARIOS', 'STANDARD', 'Euro NCAP VRU Crossing Pedestrian Scenarios (CPFA, CPNA, CPNCO)', NULL, NULL, 'Định nghĩa chi tiết 3 kịch bản kiểm thử va chạm người đi bộ cắt ngang: (1) CPFA-50 (Car-to-Pedestrian Farside Adult, va chạm tâm xe 50%, tốc độ người đi bộ 8 km/h), (2) CPNA-25 & CPNA-75 (Nearside Adult, xuất phát từ lề gần, va chạm 25% hoặc 75% chiều rộng xe, tốc độ 5 km/h), (3) CPNCO-50 (Nearside Child Obstructed, trẻ em khuất sau xe đỗ ven đường chạy vụt ra với tốc độ 5 km/h).', 'STANDARD', 'Euro NCAP Assessment Protocol - Vulnerable Road User Protection v4.5', 'Euro NCAP Secretariat', 'Euro NCAP', 2023, 'Section 3: AEB / LSS VRU Test Protocol', 'https://www.euroncap.com/en/for-engineers/protocols/', 'EURONCAP-VRU-4.5', 1),
  ('EURO_NCAP_TB024', 'STANDARD', 'Euro NCAP Technical Bulletin TB 024: Data Filter and Processing Protocols', NULL, NULL, 'Quy định kỹ thuật chính thức của Euro NCAP về xử lý tín hiệu cảm biến trong kiểm thử an toàn chủ động: bộ lọc 12-pole không dịch pha (zero-phase 12-pole Butterworth filter) tần số cắt -6dB tại 10 Hz cho kênh gia tốc dọc và ngang; mốc thời gian T_AEB tính từ thời điểm phanh bắt đầu kích hoạt thực sự (deceleration đạt -0.5 m/s^2 hoặc áp lực dầu đạt ngưỡng).', 'STANDARD', 'Euro NCAP Technical Bulletin TB 024: Data Filter and Processing Protocols for Active Safety', 'Euro NCAP Technical Working Group', 'Euro NCAP', 2021, 'Clause 4: Filtering of Vehicle Kinematic Data', 'https://www.euroncap.com/en/for-engineers/technical-bulletins/', 'EURONCAP-TB-024', 1);
