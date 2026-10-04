-- =====================================================================
-- VehicSim - MySQL 8.x schema (36 tables)
-- Scenario -> CARLA -> AEB Evaluation -> Failure Analysis
--          -> Optimization -> Regression
-- Từ điển dữ liệu (nghĩa từng cột, ai ghi, JSON): docs/vehicsim/database-schema.md
-- DB đã tạo từ bản cũ hơn: chạy các file trong database/mysql/migrations/ theo thứ tự
-- Yêu cầu: MySQL >= 8.0.16 (CHECK constraint có hiệu lực)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS vehicsim
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE vehicsim;

SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- 1. IDENTITY / WORKSPACE  (6 bảng)
-- =====================================================================

CREATE TABLE users (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(255) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  full_name      VARCHAR(150) NOT NULL,
  avatar_url     VARCHAR(1024) NULL,                       -- FE-03: ảnh đại diện (URL, không lưu nhị phân)
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE roles (
  id           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         VARCHAR(50)  NOT NULL,            -- ADMIN / EXPERT / ENGINEER (ADR-030)
  name         VARCHAR(100) NOT NULL,
  description  VARCHAR(255) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB;

CREATE TABLE user_roles (
  user_id      BIGINT UNSIGNED   NOT NULL,
  role_id      SMALLINT UNSIGNED NOT NULL,
  assigned_at  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE workspaces (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(150) NOT NULL,
  description  TEXT         NULL,
  owner_id     BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_workspaces_owner_name (owner_id, name),
  CONSTRAINT fk_workspaces_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE projects (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workspace_id  BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(150) NOT NULL,
  description   TEXT         NULL,
  status        ENUM('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  created_by    BIGINT UNSIGNED NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_projects_ws_name (workspace_id, name),
  KEY idx_projects_created_by (created_by),
  CONSTRAINT fk_projects_workspace  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_projects_created_by FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE project_members (
  project_id   BIGINT UNSIGNED NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  member_role  ENUM('OWNER','ENGINEER','EXPERT') NOT NULL DEFAULT 'ENGINEER',
  joined_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  KEY idx_pm_user (user_id),
  CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pm_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 2. VEHICLE (1 vehicle / project)  &  SENSORS
-- Phạm vi (TrungDQ 03/10): nghiên cứu MỘT xe duy nhất, KHÔNG có phiên bản xe.
-- Thêm xe = clone thông số từ blueprint CARLA (physics control + bounding box)
-- vào bảng vehicles; bản chụp đầy đủ để ở extra_config.
-- =====================================================================

CREATE TABLE vehicles (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id            BIGINT UNSIGNED NOT NULL,
  name                  VARCHAR(150)  NOT NULL,              -- vd: "VF8-like"
  carla_blueprint       VARCHAR(100)  NOT NULL,              -- vd: vehicle.tesla.model3
  mass_kg               DECIMAL(8,2)  NOT NULL,
  length_m              DECIMAL(5,3)  NOT NULL,
  width_m               DECIMAL(5,3)  NOT NULL,
  height_m              DECIMAL(5,3)  NOT NULL,
  wheelbase_m           DECIMAL(5,3)  NOT NULL,
  cg_height_m           DECIMAL(5,3)  NULL,
  max_speed_mps         DECIMAL(7,3)  NOT NULL,
  max_brake_decel_mps2  DECIMAL(5,2)  NOT NULL,              -- giới hạn vật lý của xe
  tire_friction_coeff   DECIMAL(4,3)  NULL,
  drag_coefficient      DECIMAL(4,3)  NULL,
  extra_config          JSON          NULL,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vehicles_project (project_id),               -- ép: tối đa 1 vehicle / project
  UNIQUE KEY uq_vehicles_project_id (project_id, id),        -- Cần thiết cho Composite FK ở aeb_systems
  CONSTRAINT fk_vehicles_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_vehicles_dims CHECK (mass_kg > 0 AND length_m > 0 AND width_m > 0 AND height_m > 0 AND wheelbase_m > 0),
  CONSTRAINT ck_vehicles_perf CHECK (max_speed_mps > 0 AND max_brake_decel_mps2 > 0)
) ENGINE=InnoDB;

CREATE TABLE sensors (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_id       BIGINT UNSIGNED NOT NULL,
  name             VARCHAR(100) NOT NULL,
  sensor_type      ENUM('CAMERA','RADAR','LIDAR') NOT NULL,
  carla_blueprint  VARCHAR(100) NOT NULL,                    -- vd: sensor.other.radar
  mount_x_m        DECIMAL(6,3) NOT NULL DEFAULT 0,
  mount_y_m        DECIMAL(6,3) NOT NULL DEFAULT 0,
  mount_z_m        DECIMAL(6,3) NOT NULL DEFAULT 0,
  mount_yaw_deg    DECIMAL(6,2) NOT NULL DEFAULT 0,
  range_m          DECIMAL(7,2) NULL,
  fov_deg          DECIMAL(6,2) NULL,
  update_rate_hz   DECIMAL(6,2) NULL,
  config           JSON         NULL,
  is_enabled       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sensors_vehicle_name (vehicle_id, name),
  CONSTRAINT fk_sensors_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 3. AEB  (4 bảng)
-- =====================================================================

CREATE TABLE aeb_systems (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   BIGINT UNSIGNED NOT NULL,
  vehicle_id   BIGINT UNSIGNED NOT NULL,
  name         VARCHAR(150) NOT NULL,
  description  TEXT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aeb_systems_project_name (project_id, name),
  UNIQUE KEY uq_aeb_systems_vehicle (vehicle_id),
  UNIQUE KEY uq_aeb_systems_project_id (project_id, id),
  CONSTRAINT fk_aeb_systems_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_aeb_systems_vehicle FOREIGN KEY (project_id, vehicle_id)
    REFERENCES vehicles(project_id, id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE aeb_versions (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  aeb_system_id      BIGINT UNSIGNED NOT NULL,
  version_number     INT UNSIGNED    NOT NULL,
  label              VARCHAR(100)    NULL,
  source             ENUM('MANUAL','OPTIMIZATION') NOT NULL DEFAULT 'MANUAL',
  status             ENUM('BASELINE','CANDIDATE','ACCEPTED','REJECTED','ARCHIVED') NOT NULL DEFAULT 'CANDIDATE',
  parent_version_id  BIGINT UNSIGNED NULL,                  -- version gốc mà candidate được sinh ra từ đó
  notes              TEXT NULL,
  created_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Mỗi AEB system chỉ có ĐÚNG MỘT baseline: cột này = aeb_system_id khi
  -- status = BASELINE, NULL khi khác; UNIQUE bỏ qua NULL. Accept candidate thì
  -- trong cùng transaction: hạ baseline cũ (ARCHIVED) TRƯỚC, rồi nâng candidate.
  baseline_system_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'BASELINE', aeb_system_id, NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aeb_versions_sys_ver (aeb_system_id, version_number),
  UNIQUE KEY uq_aeb_versions_system_id (aeb_system_id, id),
  UNIQUE KEY uq_aeb_versions_one_baseline (baseline_system_key),
  KEY idx_aeb_versions_parent (parent_version_id),
  KEY idx_aeb_versions_created_by (created_by),
  CONSTRAINT fk_aeb_versions_system  FOREIGN KEY (aeb_system_id)     REFERENCES aeb_systems(id)  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_aeb_versions_parent  FOREIGN KEY (parent_version_id) REFERENCES aeb_versions(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_aeb_versions_creator FOREIGN KEY (created_by)        REFERENCES users(id)        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Đúng 10 parameter: ENUM + UNIQUE(code) chặn việc thêm parameter thứ 11
CREATE TABLE aeb_parameters (
  id             TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           ENUM(
                   'DETECTION_CONFIDENCE_THRESHOLD',
                   'RELATIVE_VELOCITY_THRESHOLD',
                   'PREDICTION_HORIZON',
                   'SAFETY_DISTANCE_MARGIN',
                   'TTC_THRESHOLD',
                   'BRAKE_ACTIVATION_DELAY',
                   'MAX_DECELERATION',
                   'BRAKE_BUILDUP_RATE',
                   'JERK_LIMIT',
                   'ACTUATOR_RESPONSE_TIME'
                 ) NOT NULL,
  name           VARCHAR(100)  NOT NULL,
  category       ENUM('PERCEPTION','DECISION','CONTROL','VEHICLE_DYNAMICS') NOT NULL,
  unit           VARCHAR(20)   NOT NULL,
  description    VARCHAR(255)  NULL,
  min_value      DECIMAL(12,4) NOT NULL,                     -- search space cho optimization
  max_value      DECIMAL(12,4) NOT NULL,
  default_value  DECIMAL(12,4) NOT NULL,
  sort_order     TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aeb_parameters_code (code),
  CONSTRAINT ck_aeb_param_range CHECK (min_value < max_value AND default_value BETWEEN min_value AND max_value)
) ENGINE=InnoDB;

CREATE TABLE aeb_parameter_values (
  aeb_version_id    BIGINT UNSIGNED  NOT NULL,
  aeb_parameter_id  TINYINT UNSIGNED NOT NULL,
  value             DECIMAL(12,4)    NOT NULL,
  PRIMARY KEY (aeb_version_id, aeb_parameter_id),
  KEY idx_apv_param (aeb_parameter_id),
  CONSTRAINT fk_apv_version   FOREIGN KEY (aeb_version_id)   REFERENCES aeb_versions(id)   ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_apv_parameter FOREIGN KEY (aeb_parameter_id) REFERENCES aeb_parameters(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 4. SCENARIO  (5 bảng)
-- =====================================================================

CREATE TABLE scenarios (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id   BIGINT UNSIGNED NOT NULL,
  code         VARCHAR(30)  NOT NULL,                        -- S01, S02...
  name         VARCHAR(200) NOT NULL,
  description  TEXT NULL,
  category     ENUM('PEDESTRIAN','VEHICLE','CYCLIST','OTHER') NOT NULL DEFAULT 'PEDESTRIAN',
  created_by   BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scenarios_project_code (project_id, code),
  UNIQUE KEY uq_scenarios_project_id (project_id, id),       -- cho composite FK: bảng con không trỏ sang scenario của project khác
  KEY idx_scenarios_created_by (created_by),
  CONSTRAINT fk_scenarios_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_scenarios_creator FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Mỗi version là MỘT BIẾN THỂ của scenario (scenario = họ kịch bản / mô típ).
-- Bản gốc do LLM hoặc kỹ sư tạo: source = NATURAL_LANGUAGE / MANUAL.
-- Biến thể do bộ sinh lưới tạo từ bản gốc: source = GENERATED, parent_version_id
-- = bản gốc đó. Nhờ vậy sửa bản gốc rồi sinh lại không trộn biến thể cũ và mới.
CREATE TABLE scenario_versions (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scenario_id            BIGINT UNSIGNED NOT NULL,
  version_number         INT UNSIGNED    NOT NULL,
  source                 ENUM('NATURAL_LANGUAGE','MANUAL','GENERATED') NOT NULL DEFAULT 'NATURAL_LANGUAGE',
  parent_version_id      BIGINT UNSIGNED NULL,               -- bản gốc sinh ra biến thể này; NULL nếu chính nó là bản gốc
  natural_language_input TEXT NULL,
  llm_model              VARCHAR(100) NULL,
  scenario_ir            JSON NOT NULL,                      -- snapshot Scenario IR đã chốt
  validation_status      ENUM('PENDING','VALID','INVALID') NOT NULL DEFAULT 'PENDING',
  validation_errors      JSON NULL,
  opendrive_map          VARCHAR(100) NOT NULL,              -- vd: Town10HD
  openscenario_version   VARCHAR(20)  NULL,                  -- vd: 1.2
  xosc_content           LONGTEXT NULL,                      -- nội dung .xosc đã sinh
  xosc_sha256            CHAR(64) NULL,
  change_note            VARCHAR(500) NULL,
  created_by             BIGINT UNSIGNED NOT NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scenario_versions_ver (scenario_id, version_number),
  UNIQUE KEY uq_scenario_versions_scenario_id (scenario_id, id),
  KEY idx_sv_parent (scenario_id, parent_version_id),
  KEY idx_sv_created_by (created_by),
  CONSTRAINT fk_sv_scenario FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sv_creator  FOREIGN KEY (created_by)  REFERENCES users(id)     ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Bản gốc phải thuộc CÙNG scenario. RESTRICT vì parent_version_id nằm trong
  -- CHECK bên dưới (MySQL cấm cột CHECK tham gia FK có CASCADE/SET NULL).
  CONSTRAINT fk_sv_parent   FOREIGN KEY (scenario_id, parent_version_id)
    REFERENCES scenario_versions(scenario_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_sv_parent   CHECK ((source = 'GENERATED') = (parent_version_id IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE scenario_objects (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scenario_version_id  BIGINT UNSIGNED NOT NULL,
  name                 VARCHAR(100) NOT NULL,                -- "ego", "pedestrian_1"
  role                 ENUM('EGO','TARGET','OTHER') NOT NULL,
  object_type          ENUM('EGO_VEHICLE','PEDESTRIAN','CAR','TRUCK','MOTORCYCLE','BICYCLE','STATIC_OBSTACLE') NOT NULL,
  carla_blueprint      VARCHAR(100) NULL,
  spawn_x_m            DECIMAL(9,3) NULL,
  spawn_y_m            DECIMAL(9,3) NULL,
  spawn_z_m            DECIMAL(9,3) NULL,
  spawn_yaw_deg        DECIMAL(7,3) NULL,
  extra_config         JSON NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_so_version_name (scenario_version_id, name),
  KEY idx_so_version_role (scenario_version_id, role),
  CONSTRAINT fk_so_version FOREIGN KEY (scenario_version_id) REFERENCES scenario_versions(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE scenario_environments (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scenario_version_id  BIGINT UNSIGNED NOT NULL,             -- 1:1
  weather              ENUM('CLEAR','CLOUDY','RAIN','HEAVY_RAIN','FOG') NOT NULL DEFAULT 'CLEAR',
  time_of_day          ENUM('DAY','DUSK','NIGHT') NOT NULL DEFAULT 'DAY',
  road_condition       ENUM('DRY','WET','ICY') NOT NULL DEFAULT 'DRY',
  friction             DECIMAL(4,3) NOT NULL DEFAULT 1.000,  -- road friction coefficient
  visibility_m         DECIMAL(8,2) NULL,
  precipitation_pct    DECIMAL(5,2) NULL,
  cloudiness_pct       DECIMAL(5,2) NULL,
  fog_density_pct      DECIMAL(5,2) NULL,
  sun_altitude_deg     DECIMAL(6,2) NULL,
  speed_limit_mps      DECIMAL(7,3) NULL,
  extra_config         JSON NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_se_version (scenario_version_id),
  CONSTRAINT fk_se_version FOREIGN KEY (scenario_version_id) REFERENCES scenario_versions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_se_friction CHECK (friction > 0 AND friction <= 1.500),
  CONSTRAINT ck_se_pct CHECK (
    (precipitation_pct IS NULL OR precipitation_pct BETWEEN 0 AND 100) AND
    (cloudiness_pct    IS NULL OR cloudiness_pct    BETWEEN 0 AND 100) AND
    (fog_density_pct   IS NULL OR fog_density_pct   BETWEEN 0 AND 100))
) ENGINE=InnoDB;

CREATE TABLE scenario_parameters (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scenario_version_id BIGINT UNSIGNED NOT NULL,
  scenario_object_id  BIGINT UNSIGNED NULL,                  -- NULL nếu là tham số toàn cục của kịch bản
  param_name          VARCHAR(64)   NOT NULL,
  value               DECIMAL(14,4) NOT NULL,
  unit                VARCHAR(20)   NULL,
  -- VIRTUAL, không phải STORED: MySQL cấm FK có CASCADE trên cột gốc của cột
  -- sinh STORED (ERROR 1215 khi tạo fk_sp_object). VIRTUAL vẫn đánh index được.
  object_scope_key    BIGINT UNSIGNED GENERATED ALWAYS AS (COALESCE(scenario_object_id, 0)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sp_version_object_param (scenario_version_id, object_scope_key, param_name),
  KEY idx_sp_version (scenario_version_id),
  KEY idx_sp_object (scenario_object_id),
  CONSTRAINT fk_sp_version FOREIGN KEY (scenario_version_id) REFERENCES scenario_versions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sp_object  FOREIGN KEY (scenario_object_id)  REFERENCES scenario_objects(id)  ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 5. OPTIMIZATION & ROBUSTNESS  (3 bảng) - tạo trước simulation_runs để tránh vòng FK
-- =====================================================================

CREATE TABLE optimization_runs (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id              BIGINT UNSIGNED NOT NULL,
  scenario_id             BIGINT UNSIGNED NOT NULL,           -- cả họ: mọi candidate chấm trên toàn bộ biến thể
  base_scenario_version_id BIGINT UNSIGNED NOT NULL,          -- bản gốc; bộ biến thể = scenario_versions có parent_version_id = cột này
  aeb_system_id           BIGINT UNSIGNED NOT NULL,           -- lặp lại có chủ đích để composite FK ép cùng project / cùng system
  baseline_aeb_version_id BIGINT UNSIGNED NOT NULL,
  name                    VARCHAR(150) NOT NULL,
  algorithm               ENUM('BAYESIAN_OPTIMIZATION','NSGA_II','RANDOM_SEARCH') NOT NULL,
  objective_config        JSON NOT NULL,                      -- objectives + constraints + search-space override
  max_trials              INT UNSIGNED NOT NULL,
  random_seed             BIGINT NULL,
  status                  ENUM('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  error_message           TEXT NULL,
  created_by              BIGINT UNSIGNED NOT NULL,
  started_at              DATETIME NULL,
  finished_at             DATETIME NULL,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_or_id_system (id, aeb_system_id),            -- cho composite FK ở optimization_trials
  KEY idx_or_project_status (project_id, status),
  KEY idx_or_scenario (project_id, scenario_id),
  KEY idx_or_base_version (scenario_id, base_scenario_version_id),
  KEY idx_or_system (project_id, aeb_system_id),
  KEY idx_or_baseline (aeb_system_id, baseline_aeb_version_id),
  KEY idx_or_created_by (created_by),
  CONSTRAINT fk_or_project      FOREIGN KEY (project_id)                             REFERENCES projects(id)                        ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_or_scenario     FOREIGN KEY (project_id, scenario_id)                REFERENCES scenarios(project_id, id)           ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_or_base_version FOREIGN KEY (scenario_id, base_scenario_version_id)  REFERENCES scenario_versions(scenario_id, id)  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_or_system       FOREIGN KEY (project_id, aeb_system_id)              REFERENCES aeb_systems(project_id, id)         ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_or_baseline     FOREIGN KEY (aeb_system_id, baseline_aeb_version_id) REFERENCES aeb_versions(aeb_system_id, id)     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_or_creator      FOREIGN KEY (created_by)                             REFERENCES users(id)                           ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_or_trials CHECK (max_trials > 0)
) ENGINE=InnoDB;

CREATE TABLE optimization_trials (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  optimization_run_id       BIGINT UNSIGNED NOT NULL,
  trial_number              INT UNSIGNED    NOT NULL,
  aeb_system_id             BIGINT UNSIGNED NOT NULL,        -- = system của optimization run; ép candidate cùng system
  candidate_aeb_version_id  BIGINT UNSIGNED NOT NULL,        -- candidate config = 1 AEB version
  status                    ENUM('PENDING','RUNNING','COMPLETED','FAILED','PRUNED') NOT NULL DEFAULT 'PENDING',
  -- FE-13 Active learning tracker: điểm này do đâu mà có, và hàm thu nhận chấm bao nhiêu
  sampling_source           ENUM('INITIAL_DESIGN','ACQUISITION','ACTIVE_LEARNING','MANUAL') NOT NULL DEFAULT 'INITIAL_DESIGN',
  acquisition_value         DECIMAL(14,6) NULL,              -- EI / UCB / PI lúc chọn điểm
  objective_values          JSON NULL,                       -- vd: {"collision_rate":0.1,"false_braking_rate":0.02}
  score                     DECIMAL(14,6) NULL,              -- objective vô hướng (BO / Random)
  constraint_violated       TINYINT(1) NOT NULL DEFAULT 0,
  is_pareto_optimal         TINYINT(1) NOT NULL DEFAULT 0,   -- NSGA-II
  is_recommended            TINYINT(1) NOT NULL DEFAULT 0,   -- recommendation cho engineer
  started_at                DATETIME NULL,
  completed_at              DATETIME NULL,
  created_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ot_run_trial (optimization_run_id, trial_number),
  UNIQUE KEY uq_ot_candidate (candidate_aeb_version_id),
  KEY idx_ot_run_status (optimization_run_id, status),
  KEY idx_ot_run_system (optimization_run_id, aeb_system_id),
  KEY idx_ot_candidate_system (aeb_system_id, candidate_aeb_version_id),
  CONSTRAINT fk_ot_run       FOREIGN KEY (optimization_run_id, aeb_system_id)      REFERENCES optimization_runs(id, aeb_system_id) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_ot_candidate FOREIGN KEY (aeb_system_id, candidate_aeb_version_id) REFERENCES aeb_versions(aeb_system_id, id)    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- FE-13 Robustness validation: chạy MỘT AEB version trên cả họ dưới nhiễu
-- (ma sát 0.6–0.9, trễ phanh 0.15–0.30 s, nhiễu cảm biến, latency, thời tiết).
-- Từng run nằm ở simulation_runs (purpose = ROBUSTNESS, robustness_test_id).
CREATE TABLE robustness_tests (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id               BIGINT UNSIGNED NOT NULL,
  name                     VARCHAR(150) NULL,
  aeb_system_id            BIGINT UNSIGNED NOT NULL,         -- lặp lại có chủ đích: composite FK ép cùng project / cùng system
  aeb_version_id           BIGINT UNSIGNED NOT NULL,         -- cấu hình được kiểm (thường là candidate)
  scenario_id              BIGINT UNSIGNED NOT NULL,         -- cả họ
  base_scenario_version_id BIGINT UNSIGNED NOT NULL,         -- bản gốc; bộ biến thể = con của nó
  optimization_trial_id    BIGINT UNSIGNED NULL,             -- khi kiểm một candidate sinh từ tối ưu
  perturbation_config      JSON NOT NULL,                    -- vd: {"friction":[0.6,0.9],"brake_delay_s":[0.15,0.30],"latency_s":[0,0.1]}
  samples_per_variant      SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  random_seed              BIGINT NULL,
  pass_criteria            JSON NOT NULL,                    -- vd: {"min_pass_rate":0.95,"max_collision_rate":0.02}
  result_summary           JSON NULL,                        -- tỉ lệ đạt, ca xấu nhất, phân bố chỉ số theo nhiễu
  robustness_score         DECIMAL(6,4) NULL,                -- 0–1: tỉ lệ mẫu nhiễu vẫn đạt
  status                   ENUM('PENDING','RUNNING','PASSED','FAILED','ERROR') NOT NULL DEFAULT 'PENDING',
  error_message            TEXT NULL,
  created_by               BIGINT UNSIGNED NOT NULL,
  started_at               DATETIME NULL,
  finished_at              DATETIME NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rb_id_version (id, aeb_version_id),          -- đích của fk_sr_robustness
  KEY idx_rb_project_status (project_id, status),
  KEY idx_rb_system (project_id, aeb_system_id),
  KEY idx_rb_version (aeb_system_id, aeb_version_id),
  KEY idx_rb_scenario (project_id, scenario_id),
  KEY idx_rb_base_version (scenario_id, base_scenario_version_id),
  KEY idx_rb_trial (optimization_trial_id),
  KEY idx_rb_created_by (created_by),
  CONSTRAINT fk_rb_project      FOREIGN KEY (project_id)                            REFERENCES projects(id)                       ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rb_system       FOREIGN KEY (project_id, aeb_system_id)             REFERENCES aeb_systems(project_id, id)        ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rb_version      FOREIGN KEY (aeb_system_id, aeb_version_id)         REFERENCES aeb_versions(aeb_system_id, id)    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rb_scenario     FOREIGN KEY (project_id, scenario_id)               REFERENCES scenarios(project_id, id)          ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rb_base_version FOREIGN KEY (scenario_id, base_scenario_version_id) REFERENCES scenario_versions(scenario_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rb_trial        FOREIGN KEY (optimization_trial_id)                 REFERENCES optimization_trials(id)            ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_rb_creator      FOREIGN KEY (created_by)                            REFERENCES users(id)                          ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_rb_samples CHECK (samples_per_variant > 0),
  CONSTRAINT ck_rb_score   CHECK (robustness_score IS NULL OR robustness_score BETWEEN 0 AND 1)
) ENGINE=InnoDB;

-- =====================================================================
-- 6. SIMULATION  (3 bảng)
-- =====================================================================

CREATE TABLE simulation_runs (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id             BIGINT UNSIGNED NOT NULL,
  -- scenario_id và aeb_system_id lặp lại có chủ đích: composite FK dùng chúng
  -- để ép scenario / xe / AEB của run đều thuộc CÙNG project_id.
  scenario_id            BIGINT UNSIGNED NOT NULL,
  scenario_version_id    BIGINT UNSIGNED NOT NULL,
  vehicle_id             BIGINT UNSIGNED NOT NULL,
  aeb_system_id          BIGINT UNSIGNED NOT NULL,
  aeb_version_id         BIGINT UNSIGNED NOT NULL,
  optimization_trial_id  BIGINT UNSIGNED NULL,               -- có giá trị nếu run thuộc 1 trial
  regression_test_id     BIGINT UNSIGNED NULL,               -- có giá trị khi purpose = REGRESSION
  baseline_run_id        BIGINT UNSIGNED NULL,               -- run baseline mà run regression này chạy lại (cùng biến thể + seed)
  robustness_test_id     BIGINT UNSIGNED NULL,               -- có giá trị khi purpose = ROBUSTNESS (nhiễu nằm trong run_config.perturbation)
  purpose                ENUM('MANUAL','BASELINE','OPTIMIZATION','REGRESSION','ROBUSTNESS') NOT NULL DEFAULT 'MANUAL',
  random_seed            BIGINT NOT NULL,                    -- reproducibility
  status                 ENUM('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  carla_version          VARCHAR(30) NULL,
  openscenario_version   VARCHAR(20) NULL,
  fixed_delta_seconds    DECIMAL(6,4) NULL,
  max_duration_s         DECIMAL(8,2) NULL,
  worker_host            VARCHAR(150) NULL,
  run_config             JSON NULL,
  error_message          TEXT NULL,
  requested_by           BIGINT UNSIGNED NULL,
  queued_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at             DATETIME NULL,
  finished_at            DATETIME NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sr_project_id (project_id, id),
  UNIQUE KEY uq_sr_replay (id, scenario_version_id, random_seed),  -- đích của fk_sr_baseline_run
  KEY idx_sr_project_status (project_id, status),
  KEY idx_sr_scenario (project_id, scenario_id),
  KEY idx_sr_scenario_version (scenario_id, scenario_version_id),
  KEY idx_sr_scenario_aeb (scenario_version_id, aeb_version_id),
  KEY idx_sr_vehicle (project_id, vehicle_id),
  KEY idx_sr_system (project_id, aeb_system_id),
  KEY idx_sr_aeb (aeb_system_id, aeb_version_id),
  KEY idx_sr_trial (optimization_trial_id),
  KEY idx_sr_regression (regression_test_id, aeb_version_id),
  KEY idx_sr_baseline_run (baseline_run_id, scenario_version_id, random_seed),
  KEY idx_sr_robustness (robustness_test_id, aeb_version_id),
  KEY idx_sr_requested_by (requested_by),
  KEY idx_sr_queue (status, queued_at),
  CONSTRAINT fk_sr_project          FOREIGN KEY (project_id)                        REFERENCES projects(id)                       ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sr_scenario         FOREIGN KEY (project_id, scenario_id)           REFERENCES scenarios(project_id, id)          ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sr_scenario_version FOREIGN KEY (scenario_id, scenario_version_id)  REFERENCES scenario_versions(scenario_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sr_vehicle          FOREIGN KEY (project_id, vehicle_id)            REFERENCES vehicles(project_id, id)           ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sr_system           FOREIGN KEY (project_id, aeb_system_id)         REFERENCES aeb_systems(project_id, id)        ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sr_aeb              FOREIGN KEY (aeb_system_id, aeb_version_id)     REFERENCES aeb_versions(aeb_system_id, id)    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sr_trial            FOREIGN KEY (optimization_trial_id)             REFERENCES optimization_trials(id)            ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_sr_user             FOREIGN KEY (requested_by)                      REFERENCES users(id)                          ON DELETE SET NULL ON UPDATE CASCADE,
  -- Run regression phải chạy đúng AEB candidate của regression test đó.
  -- RESTRICT (không CASCADE) vì regression_test_id / baseline_run_id nằm trong
  -- ck_sr_regression — MySQL cấm cột CHECK tham gia FK có referential action.
  CONSTRAINT fk_sr_regression       FOREIGN KEY (regression_test_id, aeb_version_id)
    REFERENCES regression_tests(id, candidate_aeb_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- ...và chạy lại ĐÚNG biến thể + seed của run baseline mà nó ghép cặp.
  CONSTRAINT fk_sr_baseline_run     FOREIGN KEY (baseline_run_id, scenario_version_id, random_seed)
    REFERENCES simulation_runs(id, scenario_version_id, random_seed) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_sr_regression CHECK (
    (purpose = 'REGRESSION') = (regression_test_id IS NOT NULL AND baseline_run_id IS NOT NULL)),
  -- Run robustness phải chạy đúng AEB version của robustness test. RESTRICT vì
  -- robustness_test_id nằm trong ck_sr_robustness (cùng lý do với fk_sr_regression).
  CONSTRAINT fk_sr_robustness       FOREIGN KEY (robustness_test_id, aeb_version_id)
    REFERENCES robustness_tests(id, aeb_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_sr_robustness CHECK ((purpose = 'ROBUSTNESS') = (robustness_test_id IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE simulation_results (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  simulation_run_id     BIGINT UNSIGNED NOT NULL,            -- 1:1
  end_reason            ENUM('TARGET_CLEARED','EGO_STOPPED','COLLISION','TIMEOUT','ERROR') NOT NULL,
  simulated_duration_s  DECIMAL(9,3) NULL,
  total_frames          INT UNSIGNED NULL,
  ego_final_speed_mps   DECIMAL(7,3) NULL,
  ego_distance_m        DECIMAL(9,3) NULL,
  raw_metrics           JSON NULL,                           -- time-series tóm tắt/payload từ worker
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_simres_run (simulation_run_id),
  CONSTRAINT fk_simres_run FOREIGN KEY (simulation_run_id) REFERENCES simulation_runs(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE simulation_artifacts (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  simulation_run_id  BIGINT UNSIGNED NOT NULL,
  -- FE-09: SENSOR_RECORDING = dữ liệu thô một cảm biến (RGB/depth/LiDAR/radar), GROUND_TRUTH =
  -- object id/loại/vị trí/bbox/quỹ đạo từng khung, TELEMETRY_CSV = trạng thái xe từng khung
  artifact_type      ENUM('VIDEO_MP4','LOG','RESULT_JSON','SCREENSHOT','XOSC',
                          'SENSOR_RECORDING','GROUND_TRUTH','TELEMETRY_CSV','OTHER') NOT NULL,
  sensor_id          BIGINT UNSIGNED NULL,                   -- cảm biến sinh ra file (SENSOR_RECORDING)
  file_name          VARCHAR(255)  NOT NULL,
  storage_url        VARCHAR(1024) NOT NULL,                 -- path / object-storage URL, KHÔNG lưu binary
  mime_type          VARCHAR(100)  NULL,
  file_size_bytes    BIGINT UNSIGNED NULL,
  checksum_sha256    CHAR(64) NULL,
  metadata           JSON NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sa_run_type (simulation_run_id, artifact_type),
  KEY idx_sa_sensor (sensor_id),
  CONSTRAINT fk_sa_run    FOREIGN KEY (simulation_run_id) REFERENCES simulation_runs(id) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_sa_sensor FOREIGN KEY (sensor_id)         REFERENCES sensors(id)         ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 7. AEB EVALUATION  (2 bảng)
-- =====================================================================

CREATE TABLE aeb_results (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  simulation_result_id    BIGINT UNSIGNED NOT NULL,          -- 1:1
  collision               TINYINT(1)   NOT NULL,
  collision_count         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  impact_speed_mps        DECIMAL(7,3) NULL,                 -- NULL nếu không va chạm
  min_ttc_s               DECIMAL(8,4) NULL,
  min_distance_m          DECIMAL(8,3) NULL,
  aeb_triggered           TINYINT(1)   NOT NULL DEFAULT 0,
  aeb_trigger_time_s      DECIMAL(8,3) NULL,
  braking_latency_s       DECIMAL(8,4) NULL,
  false_activation        TINYINT(1)   NOT NULL DEFAULT 0,
  missed_activation       TINYINT(1)   NOT NULL DEFAULT 0,
  max_deceleration_mps2   DECIMAL(7,3) NULL,
  mean_deceleration_mps2  DECIMAL(7,3) NULL,
  max_jerk_mps3           DECIMAL(8,3) NULL,
  stopping_distance_m     DECIMAL(8,3) NULL,
  verdict                 ENUM('PASS','FAIL') NOT NULL,
  evaluated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aebres_simres (simulation_result_id),
  KEY idx_aebres_verdict (verdict, collision),
  CONSTRAINT fk_aebres_simres FOREIGN KEY (simulation_result_id) REFERENCES simulation_results(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_aebres_collision CHECK (
    (collision = 0 AND collision_count = 0) OR (collision = 1 AND collision_count >= 1)),
  CONSTRAINT ck_aebres_nonneg CHECK (
    (impact_speed_mps IS NULL OR impact_speed_mps >= 0) AND
    (min_distance_m   IS NULL OR min_distance_m   >= 0) AND
    (braking_latency_s IS NULL OR braking_latency_s >= 0))
) ENGINE=InnoDB;

CREATE TABLE collision_events (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  aeb_result_id        BIGINT UNSIGNED NOT NULL,
  event_index          SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  target_object_id     BIGINT UNSIGNED NULL,                 -- scenario_objects bị va chạm
  timestamp_s          DECIMAL(9,3) NOT NULL,
  impact_speed_mps     DECIMAL(7,3) NOT NULL,
  relative_speed_mps   DECIMAL(7,3) NULL,
  distance_at_trigger_m DECIMAL(8,3) NULL,                   -- khoảng cách khi AEB kích hoạt
  collision_type       ENUM('FRONT','SIDE','REAR','OTHER') NOT NULL DEFAULT 'FRONT',
  impact_x_m           DECIMAL(9,3) NULL,
  impact_y_m           DECIMAL(9,3) NULL,
  impact_z_m           DECIMAL(9,3) NULL,
  carla_actor_id       INT NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ce_result_idx (aeb_result_id, event_index),
  KEY idx_ce_target (target_object_id),
  CONSTRAINT fk_ce_result FOREIGN KEY (aeb_result_id)    REFERENCES aeb_results(id)     ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ce_target FOREIGN KEY (target_object_id) REFERENCES scenario_objects(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 8. FAILURE ANALYSIS & SENSITIVITY  (4 bảng)
-- =====================================================================

CREATE TABLE failures (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  simulation_run_id BIGINT UNSIGNED NOT NULL,
  aeb_result_id     BIGINT UNSIGNED NULL,
  failure_type      ENUM('COLLISION','MISSED_BRAKING','LATE_BRAKING','FALSE_BRAKING',
                         'HIGH_IMPACT_SPEED','INSUFFICIENT_STOPPING_DISTANCE') NOT NULL,
  severity          ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
  description       TEXT NULL,
  detected_at_s     DECIMAL(9,3) NULL,
  detected_by       ENUM('AUTO','MANUAL') NOT NULL DEFAULT 'AUTO',
  -- FE-12 (màn 05 Edit label): kỹ sư sửa nhãn máy chấm. Giữ nhãn gốc để đo độ đúng của bộ chấm.
  auto_failure_type ENUM('COLLISION','MISSED_BRAKING','LATE_BRAKING','FALSE_BRAKING',
                         'HIGH_IMPACT_SPEED','INSUFFICIENT_STOPPING_DISTANCE') NULL,  -- nhãn gốc; NULL nếu chưa sửa
  labeled_by        BIGINT UNSIGNED NULL,
  labeled_at        DATETIME NULL,
  label_note        VARCHAR(500) NULL,                       -- lý do sửa nhãn
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_failures_run_cat (simulation_run_id, failure_type),
  KEY idx_failures_result (aeb_result_id),
  KEY idx_failures_type_sev (failure_type, severity),
  KEY idx_failures_labeled_by (labeled_by),
  CONSTRAINT fk_failures_run     FOREIGN KEY (simulation_run_id) REFERENCES simulation_runs(id) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_failures_result  FOREIGN KEY (aeb_result_id)     REFERENCES aeb_results(id)     ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_failures_labeler FOREIGN KEY (labeled_by)        REFERENCES users(id)           ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE root_causes (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  failure_id                BIGINT UNSIGNED NOT NULL,
  cause_category            ENUM('PERCEPTION','DECISION','CONTROL','VEHICLE_DYNAMICS') NOT NULL,
  cause_code                VARCHAR(64) NOT NULL,            -- OBJECT_NOT_DETECTED, TRIGGERED_TOO_LATE, SLOW_BRAKE_BUILDUP...
  related_aeb_parameter_id  TINYINT UNSIGNED NULL,           -- parameter nghi ngờ -> nối sang optimization
  description               TEXT NULL,
  confidence                DECIMAL(4,3) NULL,
  is_primary                TINYINT(1) NOT NULL DEFAULT 0,
  analysis_method           ENUM('RULE_BASED','MANUAL','LLM_ASSISTED') NOT NULL DEFAULT 'RULE_BASED',
  created_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rc_failure_code (failure_id, cause_code),
  KEY idx_rc_category (cause_category),
  KEY idx_rc_param (related_aeb_parameter_id),
  CONSTRAINT fk_rc_failure FOREIGN KEY (failure_id) REFERENCES failures(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rc_param   FOREIGN KEY (related_aeb_parameter_id) REFERENCES aeb_parameters(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- FE-12 Parameter sensitivity & interaction (màn 07, 08): một lần phân tích trên
-- các run lịch sử — không sinh run mới. Đầu vào: tham số AEB + tham số kịch bản +
-- môi trường của từng run; đầu ra: mức ảnh hưởng tới một chỉ số mục tiêu.
CREATE TABLE sensitivity_analyses (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id       BIGINT UNSIGNED NOT NULL,
  name             VARCHAR(150) NULL,
  aeb_system_id    BIGINT UNSIGNED NOT NULL,
  scenario_id      BIGINT UNSIGNED NULL,                     -- NULL = mọi họ trong project
  method           ENUM('CORRELATION','RANDOM_FOREST','SHAP') NOT NULL,
  target_metric    VARCHAR(64)  NOT NULL,                    -- collision, min_ttc_s, false_activation, impact_speed_mps...
  run_filter       JSON NULL,                                -- run nào được dùng: purpose, simulator, khoảng thời gian
  sample_size      INT UNSIGNED NULL,                        -- số run thực dùng
  model_score      DECIMAL(8,6) NULL,                        -- R² / AUC của mô hình thay thế (RF, SHAP)
  status           ENUM('PENDING','RUNNING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  error_message    TEXT NULL,
  created_by       BIGINT UNSIGNED NOT NULL,
  started_at       DATETIME NULL,
  finished_at      DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sens_project_status (project_id, status),
  KEY idx_sens_system (project_id, aeb_system_id),
  KEY idx_sens_scenario (project_id, scenario_id),
  KEY idx_sens_created_by (created_by),
  CONSTRAINT fk_sens_project  FOREIGN KEY (project_id)                REFERENCES projects(id)               ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sens_system   FOREIGN KEY (project_id, aeb_system_id) REFERENCES aeb_systems(project_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sens_scenario FOREIGN KEY (project_id, scenario_id)   REFERENCES scenarios(project_id, id)   ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sens_creator  FOREIGN KEY (created_by)                REFERENCES users(id)                  ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Mỗi dòng: mức ảnh hưởng của MỘT đặc trưng (interaction_with NULL) hoặc của MỘT
-- cặp tương tác (vd. TTC_THRESHOLD × BRAKE_ACTIVATION_DELAY).
CREATE TABLE sensitivity_results (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  analysis_id       BIGINT UNSIGNED NOT NULL,
  feature_name      VARCHAR(64)   NOT NULL,                  -- 'TTC_THRESHOLD', 'ego_speed_kmh', 'friction'
  feature_source    ENUM('AEB_PARAMETER','SCENARIO_PARAMETER','ENVIRONMENT') NOT NULL,
  aeb_parameter_id  TINYINT UNSIGNED NULL,                   -- có khi feature_source = AEB_PARAMETER
  interaction_with  VARCHAR(64)   NULL,                      -- đặc trưng thứ hai của cặp tương tác
  importance        DECIMAL(12,6) NOT NULL,                  -- |hệ số tương quan| / importance RF / mean|SHAP|
  direction         ENUM('POSITIVE','NEGATIVE','MIXED') NULL, -- tăng đặc trưng thì chỉ số mục tiêu tăng/giảm
  rank_order        SMALLINT UNSIGNED NOT NULL,              -- 1 = ảnh hưởng mạnh nhất
  details           JSON NULL,                               -- dữ liệu vẽ: PDP, phân bố SHAP, lưới tương tác
  interaction_key   VARCHAR(64) GENERATED ALWAYS AS (COALESCE(interaction_with, '')) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sres_feature (analysis_id, feature_name, interaction_key),
  KEY idx_sres_rank (analysis_id, rank_order),
  KEY idx_sres_param (aeb_parameter_id),
  CONSTRAINT fk_sres_analysis FOREIGN KEY (analysis_id)      REFERENCES sensitivity_analyses(id) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_sres_param    FOREIGN KEY (aeb_parameter_id) REFERENCES aeb_parameters(id)       ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 9. REGRESSION  (1 bảng) + Engineer review ACCEPT/REJECT
-- =====================================================================

CREATE TABLE regression_tests (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id               BIGINT UNSIGNED NOT NULL,
  name                     VARCHAR(150) NULL,
  aeb_system_id            BIGINT UNSIGNED NOT NULL,         -- lặp lại có chủ đích: ép baseline + candidate cùng một AEB system
  baseline_aeb_version_id  BIGINT UNSIGNED NOT NULL,
  candidate_aeb_version_id BIGINT UNSIGNED NOT NULL,
  scenario_id              BIGINT UNSIGNED NOT NULL,         -- cả họ: so baseline vs candidate trên mọi biến thể
  base_scenario_version_id BIGINT UNSIGNED NOT NULL,         -- bản gốc; bộ biến thể = scenario_versions có parent_version_id = cột này
  -- Từng cặp run nằm ở simulation_runs (regression_test_id + baseline_run_id).
  baseline_simulation_id   BIGINT UNSIGNED NULL,             -- chỉ dùng khi so đúng 1 cặp run; so cả họ thì để NULL
  candidate_simulation_id  BIGINT UNSIGNED NULL,
  pass_criteria            JSON NOT NULL,                    -- vd: {"max_collision_increase":0,"max_false_braking_delta_pct":2}
  metric_deltas            JSON NULL,                        -- vd: {"impact_speed_mps":-8.333,"false_braking_pct":+6}
  status                   ENUM('PENDING','RUNNING','PASSED','FAILED','ERROR') NOT NULL DEFAULT 'PENDING',
  -- REQUEST_MORE_TESTS: kỹ sư gửi lại kèm yêu cầu thêm kịch bản (màn 18 Figma).
  review_decision          ENUM('PENDING','ACCEPT','REJECT','REQUEST_MORE_TESTS') NOT NULL DEFAULT 'PENDING',
  reviewed_by              BIGINT UNSIGNED NULL,
  reviewed_at              DATETIME NULL,
  review_note              TEXT NULL,                        -- lý do (bắt buộc khi quyết định)
  review_conditions        TEXT NULL,                        -- điều kiện / việc cần làm tiếp sau quyết định
  created_by               BIGINT UNSIGNED NOT NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rt_id_candidate (id, candidate_aeb_version_id),  -- đích của fk_sr_regression
  KEY idx_rt_pair_scenario (baseline_aeb_version_id, candidate_aeb_version_id, scenario_id),
  KEY idx_rt_project_status (project_id, status),
  KEY idx_rt_system (project_id, aeb_system_id),
  KEY idx_rt_baseline (aeb_system_id, baseline_aeb_version_id),
  KEY idx_rt_candidate (aeb_system_id, candidate_aeb_version_id),
  KEY idx_rt_scenario (project_id, scenario_id),
  KEY idx_rt_base_version (scenario_id, base_scenario_version_id),
  KEY idx_rt_base_sim (project_id, baseline_simulation_id),
  KEY idx_rt_cand_sim (project_id, candidate_simulation_id),
  KEY idx_rt_reviewed_by (reviewed_by),
  KEY idx_rt_created_by (created_by),
  CONSTRAINT fk_rt_project      FOREIGN KEY (project_id)                              REFERENCES projects(id)                        ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rt_system       FOREIGN KEY (project_id, aeb_system_id)               REFERENCES aeb_systems(project_id, id)         ON DELETE RESTRICT ON UPDATE CASCADE,
  -- ON UPDATE RESTRICT, không phải CASCADE: MySQL cấm cột nằm trong CHECK
  -- (ck_rt_diff) tham gia FK có referential action (ERROR 3823). id là
  -- AUTO_INCREMENT, không bao giờ bị UPDATE, nên CASCADE ở đây không mất gì.
  CONSTRAINT fk_rt_baseline     FOREIGN KEY (aeb_system_id, baseline_aeb_version_id)  REFERENCES aeb_versions(aeb_system_id, id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rt_candidate    FOREIGN KEY (aeb_system_id, candidate_aeb_version_id) REFERENCES aeb_versions(aeb_system_id, id)     ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rt_scenario     FOREIGN KEY (project_id, scenario_id)                 REFERENCES scenarios(project_id, id)           ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rt_base_version FOREIGN KEY (scenario_id, base_scenario_version_id)   REFERENCES scenario_versions(scenario_id, id)  ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rt_base_sim     FOREIGN KEY (project_id, baseline_simulation_id)      REFERENCES simulation_runs(project_id, id)     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rt_cand_sim     FOREIGN KEY (project_id, candidate_simulation_id)     REFERENCES simulation_runs(project_id, id)     ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rt_reviewer  FOREIGN KEY (reviewed_by)              REFERENCES users(id)            ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rt_creator   FOREIGN KEY (created_by)               REFERENCES users(id)            ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_rt_diff CHECK (baseline_aeb_version_id <> candidate_aeb_version_id)
) ENGINE=InnoDB;

-- =====================================================================
-- 10. TRỢ LÝ DỰ ÁN (RAG, chỉ đọc)  (1 bảng)
-- Mỗi hàng là một đoạn tri thức + vector: tài liệu repo (project_id NULL) hoặc
-- dữ liệu của một project (tổng quan, tham số AEB, họ kịch bản, ca lỗi, regression).
-- Là dữ liệu dẫn xuất: xoá đi thì lần hỏi sau tự dựng lại.
-- =====================================================================

CREATE TABLE knowledge_chunks (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id       BIGINT UNSIGNED NULL,                   -- NULL = tài liệu repo, dùng chung
  source_type      ENUM('DOC','PROJECT','AEB','FAMILY','FAILURE','REGRESSION') NOT NULL,
  source_key       VARCHAR(255)  NOT NULL,                 -- "doc:docs/adr/ADR-027…md#3", "p1:failure:1055"
  source_ref       VARCHAR(255)  NOT NULL,                 -- mã người đọc thấy: "#1055", "RT-004", "v1.3", đường dẫn tài liệu
  title            VARCHAR(255)  NOT NULL,
  link             VARCHAR(255)  NULL,                     -- URL màn hình VehicSim tương ứng
  content          TEXT          NOT NULL,
  content_hash     CHAR(64)      NOT NULL,                 -- sha256(model + nội dung): đổi thì embed lại
  embedding_model  VARCHAR(64)   NOT NULL,
  embedding        BLOB          NOT NULL,                 -- float32 little-endian, đã chuẩn hoá L2
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kc_source (source_key),
  KEY idx_kc_scope (project_id, embedding_model),
  CONSTRAINT fk_kc_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 11. QUẢN TRỊ HỆ THỐNG  (3 bảng) - FE-04 Notifications, FE-10 Settings + Audit logs
-- =====================================================================

-- Thông báo trong app cho từng người (run xong, cần review, bài forum chờ duyệt...).
CREATE TABLE notifications (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,                     -- người nhận
  type         ENUM('RUN_COMPLETED','RUN_FAILED','REGRESSION_COMPLETED','REVIEW_REQUESTED',
                    'REVIEW_DECIDED','OPTIMIZATION_COMPLETED','ROBUSTNESS_COMPLETED',
                    'FORUM_POST_PENDING','FORUM_POST_MODERATED','FORUM_REPLY','SYSTEM') NOT NULL,
  title        VARCHAR(255)  NOT NULL,
  message      TEXT          NULL,
  link         VARCHAR(255)  NULL,                           -- đường dẫn màn hình liên quan, vd. /validation/regression/4
  project_id   BIGINT UNSIGNED NULL,
  entity_type  VARCHAR(50)   NULL,                           -- 'regression_test', 'forum_post'...
  entity_id    BIGINT UNSIGNED NULL,
  is_read      TINYINT(1)    NOT NULL DEFAULT 0,
  read_at      DATETIME      NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_inbox (user_id, is_read, created_at),
  KEY idx_notif_project (project_id),
  CONSTRAINT fk_notif_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notif_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Cấu hình hệ thống do ADMIN sửa trên web (LLM API key, CARLA host/port...).
-- value_type = SECRET: `value` là bản MÃ HOÁ ở tầng ứng dụng; API không bao giờ trả
-- giá trị này ra, chỉ trả "đã đặt / chưa đặt". Mọi lần sửa ghi audit_logs.
CREATE TABLE system_settings (
  id           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  setting_key  VARCHAR(100) NOT NULL,                        -- 'llm.api_key', 'llm.model', 'carla.host', 'carla.port'
  category     ENUM('LLM','CARLA','SIMULATION','SECURITY','GENERAL') NOT NULL,
  value_type   ENUM('STRING','INT','DECIMAL','BOOL','JSON','SECRET') NOT NULL DEFAULT 'STRING',
  value        TEXT         NULL,
  description  VARCHAR(255) NULL,
  updated_by   BIGINT UNSIGNED NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settings_key (setting_key),
  KEY idx_settings_category (category),
  CONSTRAINT fk_settings_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Nhật ký kiểm toán: chỉ thêm, không sửa/xoá qua ứng dụng.
-- `details` KHÔNG BAO GIỜ chứa mật khẩu, mã OTP, token, API key hay nội dung câu hỏi.
CREATE TABLE audit_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NULL,                         -- NULL = hệ thống / chưa đăng nhập
  action       VARCHAR(64)  NOT NULL,                        -- 'auth.login', 'regression.decide', 'settings.update', 'forum.moderate'
  outcome      ENUM('SUCCESS','DENIED','FAILED') NOT NULL DEFAULT 'SUCCESS',
  project_id   BIGINT UNSIGNED NULL,
  entity_type  VARCHAR(50)  NULL,
  entity_id    BIGINT UNSIGNED NULL,
  details      JSON         NULL,                            -- trước/sau của thay đổi, đã che dữ liệu nhạy cảm
  ip_address   VARCHAR(45)  NULL,                            -- đủ cho IPv6
  user_agent   VARCHAR(255) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_user_time (user_id, created_at),
  KEY idx_audit_action_time (action, created_at),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_project (project_id),
  CONSTRAINT fk_audit_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_audit_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 12. FORUM AEB  (2 bảng) - ADR-030: một forum chung toàn hệ thống
-- EXPERT đăng bài hiện ngay; bài của ENGINEER chờ ADMIN/EXPERT duyệt;
-- comment không cần duyệt; ADMIN/EXPERT ẩn được nội dung vi phạm.
-- Không gắn project, không link run: forum ai cũng đọc, run thuộc project riêng.
-- =====================================================================

CREATE TABLE forum_posts (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  author_id         BIGINT UNSIGNED NOT NULL,                -- EXPERT hoặc ENGINEER (kiểm ở API)
  title             VARCHAR(255) NOT NULL,
  content           LONGTEXT     NOT NULL,                   -- Markdown; render tắt HTML thô
  post_type         ENUM('QUESTION','DISCUSSION','GUIDE','ANNOUNCEMENT') NOT NULL DEFAULT 'DISCUSSION',
  topic             ENUM('PERCEPTION','DECISION','CONTROL','VEHICLE_DYNAMICS',
                         'SCENARIO','PARAMETER_TUNING','REGRESSION','GENERAL') NOT NULL DEFAULT 'GENERAL',
  aeb_parameter_id  TINYINT UNSIGNED NULL,                   -- tham số AEB được bàn tới
  status            ENUM('OPEN','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  view_count        INT UNSIGNED NOT NULL DEFAULT 0,
  is_pinned         TINYINT(1)   NOT NULL DEFAULT 0,
  moderation_status ENUM('PENDING','APPROVED','REJECTED','HIDDEN') NOT NULL DEFAULT 'PENDING',
  moderated_by      BIGINT UNSIGNED NULL,                    -- ADMIN/EXPERT, khác author_id
  moderated_at      DATETIME     NULL,
  moderation_note   VARCHAR(500) NULL,                       -- bắt buộc khi REJECTED/HIDDEN (kiểm ở API)
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fp_list (moderation_status, is_pinned, created_at),
  KEY idx_fp_topic (topic, created_at),
  KEY idx_fp_author (author_id),
  KEY idx_fp_moderator (moderated_by),
  KEY idx_fp_parameter (aeb_parameter_id),
  -- author_id / moderated_by nằm trong CHECK nên FK không được có referential action
  -- (ERROR 3823) — RESTRICT cả hai chiều; id user không bao giờ bị UPDATE.
  CONSTRAINT fk_fp_author    FOREIGN KEY (author_id)        REFERENCES users(id)          ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_fp_moderator FOREIGN KEY (moderated_by)     REFERENCES users(id)          ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_fp_parameter FOREIGN KEY (aeb_parameter_id) REFERENCES aeb_parameters(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT ck_fp_no_self_moderation CHECK (moderated_by IS NULL OR moderated_by <> author_id)
) ENGINE=InnoDB;

CREATE TABLE forum_comments (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id           BIGINT UNSIGNED NOT NULL,
  parent_comment_id BIGINT UNSIGNED NULL,                    -- trả lời theo luồng
  author_id         BIGINT UNSIGNED NOT NULL,
  content           TEXT         NOT NULL,                   -- hiện ngay, không cần duyệt
  is_expert_answer  TINYINT(1)   NOT NULL DEFAULT 0,         -- EXPERT đánh dấu câu trả lời chuyên gia
  is_hidden         TINYINT(1)   NOT NULL DEFAULT 0,         -- ADMIN/EXPERT ẩn khi vi phạm
  hidden_by         BIGINT UNSIGNED NULL,
  hidden_at         DATETIME     NULL,
  hidden_note       VARCHAR(500) NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fc_post (post_id, is_hidden, created_at),
  KEY idx_fc_parent (parent_comment_id),
  KEY idx_fc_author (author_id),
  KEY idx_fc_hider (hidden_by),
  CONSTRAINT fk_fc_post   FOREIGN KEY (post_id)           REFERENCES forum_posts(id)    ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_fc_parent FOREIGN KEY (parent_comment_id) REFERENCES forum_comments(id) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_fc_author FOREIGN KEY (author_id)         REFERENCES users(id)          ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_fc_hider  FOREIGN KEY (hidden_by)         REFERENCES users(id)          ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- SEED DATA
-- =====================================================================

-- ADR-030: bỏ VIEWER; EXPERT chạy/kiểm thử như ENGINEER + đăng bài và duyệt forum.
INSERT INTO roles (code, name, description) VALUES
  ('ADMIN',    'Administrator', 'Quản trị hệ thống'),
  ('ENGINEER', 'Engineer',      'Tạo scenario, chạy simulation, review kết quả'),
  ('EXPERT',   'Expert',        'Chuyên gia: chạy và kiểm thử như Engineer, đăng bài và duyệt forum AEB');

-- Đúng 10 AEB parameters (min/max/default là giá trị gợi ý, chỉnh theo thực tế)
INSERT INTO aeb_parameters
  (code, name, category, unit, description, min_value, max_value, default_value, sort_order) VALUES
  ('DETECTION_CONFIDENCE_THRESHOLD','Detection Confidence Threshold','PERCEPTION','ratio','Ngưỡng confidence để chấp nhận object',        0.3000,  0.9900,  0.7000,  1),
  ('RELATIVE_VELOCITY_THRESHOLD',   'Relative Velocity Threshold',   'DECISION',  'm/s',  'Ngưỡng vận tốc tương đối để xét nguy hiểm',      0.5000, 10.0000,  2.0000,  2),
  ('PREDICTION_HORIZON',            'Prediction Horizon',            'DECISION',  's',    'Khoảng thời gian dự đoán chuyển động object',   0.5000,  4.0000,  2.0000,  3),
  ('SAFETY_DISTANCE_MARGIN',        'Safety Distance Margin',        'DECISION',  'm',    'Khoảng đệm an toàn',                             0.5000,  5.0000,  2.0000,  4),
  ('TTC_THRESHOLD',                 'TTC Threshold',                 'DECISION',  's',    'Ngưỡng Time-to-Collision kích hoạt phanh',      0.5000,  4.0000,  1.8000,  5),
  ('BRAKE_ACTIVATION_DELAY',        'Brake Activation Delay',        'CONTROL',   's',    'Trễ từ quyết định phanh tới khi bắt đầu phanh', 0.0000,  0.5000,  0.1500,  6),
  ('MAX_DECELERATION',              'Target / Max Deceleration',     'VEHICLE_DYNAMICS','m/s2','Gia tốc giảm tốc mục tiêu/tối đa',           3.0000, 10.0000,  8.0000,  7),
  ('BRAKE_BUILDUP_RATE',            'Brake Build-up Rate',           'CONTROL',   'm/s3', 'Tốc độ tăng lực phanh',                         10.0000,100.0000, 50.0000,  8),
  ('JERK_LIMIT',                    'Jerk Limit',                    'CONTROL',   'm/s3', 'Giới hạn thay đổi gia tốc',                      5.0000, 50.0000, 20.0000,  9),
  ('ACTUATOR_RESPONSE_TIME',        'Actuator Response Time',        'VEHICLE_DYNAMICS','s','Thời gian phản hồi của actuator',              0.0200,  0.3000,  0.1000, 10);

-- =====================================================================
-- VIEW TRACEABILITY: "simulation này dùng đúng cấu hình nào?"
-- =====================================================================
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
