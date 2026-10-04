-- =====================================================================
-- Migration 001 — 03/10/2026: database phủ đủ FE-01 → FE-14 + ADR-030 (28 → 36 bảng)
-- Chi tiết và lý do: docs/adr/ADR-031-database-phu-du-chuc-nang.md
--
-- Dành cho DB MySQL đã tạo từ 01_schema.sql bản 28 bảng (trước 03/10/2026).
-- DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG cần chạy file này.
-- Chạy MỘT lần, từ thư mục gốc repo (PowerShell và bash như nhau — không dùng "<" vì
-- PowerShell 5.1 không có; thiếu utf8mb4 thì chữ tiếng Việt hỏng như TD-22):
--   docker compose exec mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction vehicsim > /tmp/backup.sql'
--   docker compose cp database/mysql/migrations/001_2026-10-03_phu-du-chuc-nang.sql mysql:/tmp/001.sql
--   docker compose exec mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim < /tmp/001.sql'
-- Nếu còn user mang role VIEWER, bước xoá role ở cuối sẽ lỗi (FK RESTRICT) — gỡ role đó trước.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. TD-26: DB tạo trước khi file schema thêm REQUEST_MORE_TESTS
ALTER TABLE regression_tests
  MODIFY review_decision ENUM('PENDING','ACCEPT','REJECT','REQUEST_MORE_TESTS') NOT NULL DEFAULT 'PENDING';

-- 2. FE-03 Profile
ALTER TABLE users
  ADD COLUMN avatar_url VARCHAR(1024) NULL AFTER full_name;

-- 3. ADR-030: role trong project
ALTER TABLE project_members
  MODIFY member_role ENUM('OWNER','ENGINEER','EXPERT') NOT NULL DEFAULT 'ENGINEER';

-- 4. FE-13 Active learning tracker
ALTER TABLE optimization_trials
  ADD COLUMN sampling_source ENUM('INITIAL_DESIGN','ACQUISITION','ACTIVE_LEARNING','MANUAL') NOT NULL DEFAULT 'INITIAL_DESIGN' AFTER status,
  ADD COLUMN acquisition_value DECIMAL(14,6) NULL AFTER sampling_source;

-- 5. FE-13 Robustness validation

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

-- 6. simulation_runs: run robustness
ALTER TABLE simulation_runs
  ADD COLUMN robustness_test_id BIGINT UNSIGNED NULL AFTER baseline_run_id,
  MODIFY purpose ENUM('MANUAL','BASELINE','OPTIMIZATION','REGRESSION','ROBUSTNESS') NOT NULL DEFAULT 'MANUAL',
  ADD KEY idx_sr_robustness (robustness_test_id, aeb_version_id),
  ADD CONSTRAINT fk_sr_robustness FOREIGN KEY (robustness_test_id, aeb_version_id)
    REFERENCES robustness_tests(id, aeb_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT ck_sr_robustness CHECK ((purpose = 'ROBUSTNESS') = (robustness_test_id IS NOT NULL));

-- 7. FE-09: file cảm biến / ground truth gắn với sensor
ALTER TABLE simulation_artifacts
  MODIFY artifact_type ENUM('VIDEO_MP4','LOG','RESULT_JSON','SCREENSHOT','XOSC',
                            'SENSOR_RECORDING','GROUND_TRUTH','TELEMETRY_CSV','OTHER') NOT NULL,
  ADD COLUMN sensor_id BIGINT UNSIGNED NULL AFTER artifact_type,
  ADD KEY idx_sa_sensor (sensor_id),
  ADD CONSTRAINT fk_sa_sensor FOREIGN KEY (sensor_id) REFERENCES sensors(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. FE-12 màn 05: kỹ sư sửa nhãn lỗi
ALTER TABLE failures
  ADD COLUMN auto_failure_type ENUM('COLLISION','MISSED_BRAKING','LATE_BRAKING','FALSE_BRAKING',
                                    'HIGH_IMPACT_SPEED','INSUFFICIENT_STOPPING_DISTANCE') NULL AFTER detected_by,
  ADD COLUMN labeled_by BIGINT UNSIGNED NULL AFTER auto_failure_type,
  ADD COLUMN labeled_at DATETIME NULL AFTER labeled_by,
  ADD COLUMN label_note VARCHAR(500) NULL AFTER labeled_at,
  ADD KEY idx_failures_labeled_by (labeled_by),
  ADD CONSTRAINT fk_failures_labeler FOREIGN KEY (labeled_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 9. FE-12 màn 07, 08: sensitivity / SHAP

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

-- 10. FE-04 Notifications, FE-10 Settings + Audit logs

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

-- 11. ADR-030: forum AEB chung

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

-- 12. ADR-030: thêm EXPERT, bỏ VIEWER (FK đã bật lại: còn user VIEWER thì lệnh DELETE lỗi)
INSERT INTO roles (code, name, description) VALUES
  ('EXPERT', 'Expert', 'Chuyên gia: chạy và kiểm thử như Engineer, đăng bài và duyệt forum AEB');
DELETE FROM roles WHERE code = 'VIEWER';

-- 13. View truy vết thêm robustness test

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

-- 14. TD-22: schema gốc từng được nạp bằng client latin1 → mô tả tiếng Việt vỡ chữ và
-- CHECK ck_sv_parent mang literal _latin1. Ghi lại đúng (chạy lại vô hại).
ALTER TABLE scenario_versions
  DROP CHECK ck_sv_parent,
  ADD CONSTRAINT ck_sv_parent CHECK ((source = 'GENERATED') = (parent_version_id IS NOT NULL));
ALTER TABLE aeb_versions
  MODIFY baseline_system_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'BASELINE', aeb_system_id, NULL)) VIRTUAL;

UPDATE roles SET description = 'Quản trị hệ thống' WHERE code = 'ADMIN';
UPDATE roles SET description = 'Tạo scenario, chạy simulation, review kết quả' WHERE code = 'ENGINEER';
UPDATE aeb_parameters SET description = 'Ngưỡng confidence để chấp nhận object' WHERE code = 'DETECTION_CONFIDENCE_THRESHOLD';
UPDATE aeb_parameters SET description = 'Ngưỡng vận tốc tương đối để xét nguy hiểm' WHERE code = 'RELATIVE_VELOCITY_THRESHOLD';
UPDATE aeb_parameters SET description = 'Khoảng thời gian dự đoán chuyển động object' WHERE code = 'PREDICTION_HORIZON';
UPDATE aeb_parameters SET description = 'Khoảng đệm an toàn' WHERE code = 'SAFETY_DISTANCE_MARGIN';
UPDATE aeb_parameters SET description = 'Ngưỡng Time-to-Collision kích hoạt phanh' WHERE code = 'TTC_THRESHOLD';
UPDATE aeb_parameters SET description = 'Trễ từ quyết định phanh tới khi bắt đầu phanh' WHERE code = 'BRAKE_ACTIVATION_DELAY';
UPDATE aeb_parameters SET description = 'Gia tốc giảm tốc mục tiêu/tối đa' WHERE code = 'MAX_DECELERATION';
UPDATE aeb_parameters SET description = 'Tốc độ tăng lực phanh' WHERE code = 'BRAKE_BUILDUP_RATE';
UPDATE aeb_parameters SET description = 'Giới hạn thay đổi gia tốc' WHERE code = 'JERK_LIMIT';
UPDATE aeb_parameters SET description = 'Thời gian phản hồi của actuator' WHERE code = 'ACTUATOR_RESPONSE_TIME';
