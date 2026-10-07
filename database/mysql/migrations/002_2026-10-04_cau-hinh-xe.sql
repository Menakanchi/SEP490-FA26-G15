-- =====================================================================
-- Migration 002 — 04/10/2026: cấu hình xe để so sánh (36 → 38 bảng)
-- Chi tiết và lý do: docs/adr/ADR-033-cau-hinh-xe-de-so-sanh.md
--
-- Dành cho DB MySQL đã ở bản 36 bảng (đã chạy migration 001, hoặc tạo từ 01_schema.sql
-- trong khoảng 03/10 → 04/10/2026). DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG cần chạy.
-- Chạy MỘT lần, từ thư mục gốc repo (như migration 001 — luôn utf8mb4):
--   docker compose exec mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction vehicsim > /tmp/backup.sql'
--   docker compose cp database/mysql/migrations/002_2026-10-04_cau-hinh-xe.sql mysql:/tmp/002.sql
--   docker compose exec mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim < /tmp/002.sql'
-- Không đổi dòng dữ liệu nào ngoài bước 4 (blueprint của xe seed).
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Cấu hình xe: bộ thông số khác của CÙNG xe, chỉ để so sánh
CREATE TABLE vehicle_configurations (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_id            BIGINT UNSIGNED NOT NULL,
  config_number         SMALLINT UNSIGNED NOT NULL,           -- 1, 2, 3… trong một xe
  name                  VARCHAR(150)  NOT NULL,               -- vd: "Chở đủ tải (+300 kg)"
  source                ENUM('COPY_OF_VEHICLE','CARLA_CLONE','MANUAL') NOT NULL DEFAULT 'COPY_OF_VEHICLE',
  carla_blueprint       VARCHAR(100)  NOT NULL,
  mass_kg               DECIMAL(8,2)  NOT NULL,               -- ép vào CARLA (physics control)
  length_m              DECIMAL(5,3)  NOT NULL,
  width_m               DECIMAL(5,3)  NOT NULL,
  height_m              DECIMAL(5,3)  NOT NULL,
  wheelbase_m           DECIMAL(5,3)  NOT NULL,
  max_speed_mps         DECIMAL(7,3)  NOT NULL,
  max_brake_decel_mps2  DECIMAL(5,2)  NOT NULL,               -- trần giảm tốc AEB được xin
  drag_coefficient      DECIMAL(4,3)  NULL,                   -- ép vào CARLA khi có
  physics_overrides     JSON          NULL,                   -- trường VehiclePhysicsControl ép thêm (bánh xe, trọng tâm…)
  provenance            JSON          NULL,                   -- nguồn gốc từng số, như vehicles.extra_config.provenance
  notes                 TEXT          NULL,
  created_by            BIGINT UNSIGNED NULL,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vc_vehicle_number (vehicle_id, config_number),
  UNIQUE KEY uq_vc_vehicle_name (vehicle_id, name),
  UNIQUE KEY uq_vc_vehicle_id (vehicle_id, id),               -- đích của FK ghép: cấu hình phải của đúng xe
  KEY idx_vc_created_by (created_by),
  CONSTRAINT fk_vc_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_vc_creator FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT ck_vc_dims CHECK (mass_kg > 0 AND length_m > 0 AND width_m > 0 AND height_m > 0 AND wheelbase_m > 0),
  CONSTRAINT ck_vc_perf CHECK (max_speed_mps > 0 AND max_brake_decel_mps2 > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. Phép so sánh: cùng họ, cùng AEB, cùng seed, cùng bộ mô phỏng — chỉ đổi thông số xe
CREATE TABLE vehicle_comparisons (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id                BIGINT UNSIGNED NOT NULL,
  name                      VARCHAR(150) NULL,
  vehicle_id                BIGINT UNSIGNED NOT NULL,         -- lặp lại có chủ đích: FK ghép ép cấu hình thuộc đúng xe
  vehicle_configuration_id  BIGINT UNSIGNED NOT NULL,         -- cấu hình đem so với xe chính
  aeb_system_id             BIGINT UNSIGNED NOT NULL,
  aeb_version_id            BIGINT UNSIGNED NOT NULL,         -- AEB giữ nguyên ở cả hai phía
  scenario_id               BIGINT UNSIGNED NOT NULL,         -- cả họ
  base_scenario_version_id  BIGINT UNSIGNED NOT NULL,         -- bản gốc; bộ biến thể = con của nó
  simulator                 VARCHAR(30)  NOT NULL,            -- như simulation_runs.carla_version; hai phía cùng bộ mô phỏng
  status                    ENUM('PENDING','RUNNING','COMPLETED','ERROR') NOT NULL DEFAULT 'PENDING',
  result_summary            JSON NULL,                        -- cặp, ma trận chuyển, tỉ lệ va chạm/phanh oan, trung vị TTC
  error_message             TEXT NULL,
  created_by                BIGINT UNSIGNED NOT NULL,
  finished_at               DATETIME NULL,
  created_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vcmp_run_target (id, vehicle_configuration_id, aeb_version_id),  -- đích của fk_sr_vehicle_comparison
  KEY idx_vcmp_project_status (project_id, status),
  KEY idx_vcmp_vehicle (project_id, vehicle_id),
  KEY idx_vcmp_config (vehicle_id, vehicle_configuration_id),
  KEY idx_vcmp_system (project_id, aeb_system_id),
  KEY idx_vcmp_version (aeb_system_id, aeb_version_id),
  KEY idx_vcmp_scenario (project_id, scenario_id),
  KEY idx_vcmp_base_version (scenario_id, base_scenario_version_id),
  KEY idx_vcmp_created_by (created_by),
  CONSTRAINT fk_vcmp_project      FOREIGN KEY (project_id)                           REFERENCES projects(id)                          ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_vcmp_vehicle      FOREIGN KEY (project_id, vehicle_id)               REFERENCES vehicles(project_id, id)              ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_vcmp_config       FOREIGN KEY (vehicle_id, vehicle_configuration_id) REFERENCES vehicle_configurations(vehicle_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_vcmp_system       FOREIGN KEY (project_id, aeb_system_id)            REFERENCES aeb_systems(project_id, id)           ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_vcmp_version      FOREIGN KEY (aeb_system_id, aeb_version_id)        REFERENCES aeb_versions(aeb_system_id, id)       ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_vcmp_scenario     FOREIGN KEY (project_id, scenario_id)              REFERENCES scenarios(project_id, id)             ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_vcmp_base_version FOREIGN KEY (scenario_id, base_scenario_version_id) REFERENCES scenario_versions(scenario_id, id)   ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_vcmp_creator      FOREIGN KEY (created_by)                           REFERENCES users(id)                             ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Run mang cấu hình xe + phép so sánh; mọi run hiện có giữ NULL = xe chính
ALTER TABLE simulation_runs
  ADD COLUMN vehicle_configuration_id BIGINT UNSIGNED NULL AFTER vehicle_id,
  ADD COLUMN vehicle_comparison_id BIGINT UNSIGNED NULL AFTER robustness_test_id,
  MODIFY purpose ENUM('MANUAL','BASELINE','OPTIMIZATION','REGRESSION','ROBUSTNESS','VEHICLE_COMPARISON') NOT NULL DEFAULT 'MANUAL',
  ADD KEY idx_sr_vehicle_config (vehicle_id, vehicle_configuration_id),
  ADD KEY idx_sr_vehicle_comparison (vehicle_comparison_id, vehicle_configuration_id, aeb_version_id);

ALTER TABLE simulation_runs
  ADD CONSTRAINT fk_sr_vehicle_config     FOREIGN KEY (vehicle_id, vehicle_configuration_id)
    REFERENCES vehicle_configurations(vehicle_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_sr_vehicle_comparison FOREIGN KEY (vehicle_comparison_id, vehicle_configuration_id, aeb_version_id)
    REFERENCES vehicle_comparisons(id, vehicle_configuration_id, aeb_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT ck_sr_vehicle_comparison CHECK ((purpose = 'VEHICLE_COMPARISON') =
    (vehicle_comparison_id IS NOT NULL AND vehicle_configuration_id IS NOT NULL AND baseline_run_id IS NOT NULL)),
  ADD CONSTRAINT ck_sr_main_vehicle CHECK (purpose = 'VEHICLE_COMPARISON' OR vehicle_configuration_id IS NULL);

-- 4. Runner CARLA giờ spawn đúng vehicles.carla_blueprint (trước đây lấy tham số dòng lệnh,
--    mặc định vehicle.audi.etron). Xe seed ghi vehicle.tesla.model3 nhưng mọi đo đạc CARLA
--    (phanh 4,6 m/s², TD-17) làm trên audi.etron — đổi để CARLA giữ đúng chiếc xe đã đo.
--    Bộ động học không đọc cột này nên 1.134 run cũ không đổi kết quả.
UPDATE vehicles SET carla_blueprint = 'vehicle.audi.etron'
WHERE name = 'VF8 v1.2' AND carla_blueprint = 'vehicle.tesla.model3';

-- 5. View truy vết: thêm cấu hình xe + phép so sánh
CREATE OR REPLACE VIEW v_simulation_traceability AS
SELECT
  sr.id                 AS simulation_run_id,
  p.id                  AS project_id,
  p.name                AS project_name,
  v.name                AS vehicle_name,
  vc.name               AS vehicle_configuration,     -- NULL = xe chính
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
  sr.robustness_test_id,
  sr.vehicle_comparison_id
FROM simulation_runs sr
JOIN projects p           ON p.id  = sr.project_id
JOIN vehicles v           ON v.id  = sr.vehicle_id
LEFT JOIN vehicle_configurations vc ON vc.id = sr.vehicle_configuration_id
JOIN scenario_versions sv ON sv.id = sr.scenario_version_id
JOIN scenarios sc         ON sc.id = sv.scenario_id
JOIN aeb_versions av      ON av.id = sr.aeb_version_id
JOIN aeb_systems asys     ON asys.id = av.aeb_system_id
LEFT JOIN optimization_trials ot ON ot.id = sr.optimization_trial_id;

SET FOREIGN_KEY_CHECKS = 1;
