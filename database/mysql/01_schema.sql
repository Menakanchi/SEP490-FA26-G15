-- =====================================================================
-- VehicSim - MySQL 8.x schema (27 tables)
-- Scenario -> CARLA -> AEB Evaluation -> Failure Analysis
--          -> Optimization -> Regression
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
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE roles (
  id           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         VARCHAR(50)  NOT NULL,            -- ADMIN / ENGINEER / VIEWER
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
  member_role  ENUM('OWNER','ENGINEER','VIEWER') NOT NULL DEFAULT 'ENGINEER',
  joined_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  KEY idx_pm_user (user_id),
  CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pm_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 2. VEHICLE (1 vehicle / project)  &  SENSORS
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
-- 5. OPTIMIZATION  (2 bảng) - tạo trước simulation_runs để tránh vòng FK
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
  purpose                ENUM('MANUAL','BASELINE','OPTIMIZATION','REGRESSION') NOT NULL DEFAULT 'MANUAL',
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
    (purpose = 'REGRESSION') = (regression_test_id IS NOT NULL AND baseline_run_id IS NOT NULL))
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
  artifact_type      ENUM('VIDEO_MP4','LOG','RESULT_JSON','SCREENSHOT','XOSC','OTHER') NOT NULL,
  file_name          VARCHAR(255)  NOT NULL,
  storage_url        VARCHAR(1024) NOT NULL,                 -- path / object-storage URL, KHÔNG lưu binary
  mime_type          VARCHAR(100)  NULL,
  file_size_bytes    BIGINT UNSIGNED NULL,
  checksum_sha256    CHAR(64) NULL,
  metadata           JSON NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sa_run_type (simulation_run_id, artifact_type),
  CONSTRAINT fk_sa_run FOREIGN KEY (simulation_run_id) REFERENCES simulation_runs(id) ON DELETE CASCADE ON UPDATE CASCADE
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
-- 8. FAILURE ANALYSIS  (2 bảng)
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
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_failures_run_cat (simulation_run_id, failure_type),
  KEY idx_failures_result (aeb_result_id),
  KEY idx_failures_type_sev (failure_type, severity),
  CONSTRAINT fk_failures_run    FOREIGN KEY (simulation_run_id) REFERENCES simulation_runs(id) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_failures_result FOREIGN KEY (aeb_result_id)     REFERENCES aeb_results(id)     ON DELETE SET NULL ON UPDATE CASCADE
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
<<<<<<< Updated upstream
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
=======
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
>>>>>>> Stashed changes
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

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- SEED DATA
-- =====================================================================

INSERT INTO roles (code, name, description) VALUES
  ('ADMIN',    'Administrator', 'Quản trị hệ thống'),
  ('ENGINEER', 'Engineer',      'Tạo scenario, chạy simulation, review kết quả'),
  ('VIEWER',   'Viewer',        'Chỉ xem');

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
  sr.baseline_run_id
FROM simulation_runs sr
JOIN projects p           ON p.id  = sr.project_id
JOIN vehicles v           ON v.id  = sr.vehicle_id
JOIN scenario_versions sv ON sv.id = sr.scenario_version_id
JOIN scenarios sc         ON sc.id = sv.scenario_id
JOIN aeb_versions av      ON av.id = sr.aeb_version_id
JOIN aeb_systems asys     ON asys.id = av.aeb_system_id
LEFT JOIN optimization_trials ot ON ot.id = sr.optimization_trial_id;
