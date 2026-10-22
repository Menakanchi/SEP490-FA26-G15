-- =====================================================================
-- Migration 007 — 15/10/2026: rút scope theo bản chuẩn hoá luận văn (4 tham số AEB, 3 mục tiêu MOBO,
-- 7 category kịch bản Euro NCAP). Số bảng giữ nguyên (29). Chi tiết và lý do:
-- docs/adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md
--
-- Dành cho DB MySQL đã chạy migration 006. DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG cần chạy.
-- Chạy MỘT lần, từ thư mục gốc repo (luôn utf8mb4), SAU KHI sao lưu:
--   docker compose exec mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction vehicsim > /tmp/backup.sql'
--   docker compose cp database/mysql/migrations/007_2026-10-15_rut-scope-4-tham-so-aeb-7-category.sql mysql:/tmp/007.sql
--   docker compose exec mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim < /tmp/007.sql'
--
-- Đổi dữ liệu:
--   - aeb_parameters: còn 4 tham số (TTC_THRESHOLD, BRAKE_ACTIVATION_DELAY, MAX_DECELERATION, BRAKE_BUILDUP_RATE).
--     6 tham số bị bỏ (DETECTION_CONFIDENCE_THRESHOLD, RELATIVE_VELOCITY_THRESHOLD, PREDICTION_HORIZON,
--     SAFETY_DISTANCE_MARGIN, JERK_LIMIT, ACTUATOR_RESPONSE_TIME) thành hằng số cố định của lõi AEB
--     (worker/vehicsim_core/aeb_stack.py). Giá trị của chúng ở mỗi AEB version bị xoá; version nào từng đặt giá trị KHÁC
--     mặc định thì giá trị đó được ghi vào cột notes để còn truy vết (không còn dùng để chạy).
--   - root_causes.aeb_parameter_id trỏ tới tham số đã bỏ → NULL (khoá ngoại ON DELETE SET NULL); cause_code giữ nguyên.
--   - scenarios.category = CP_CROSSING cho mọi họ cũ (họ duy nhất của MVP là người đi bộ băng qua đường).
--   - scenario_versions: pedestrian_speed_mps (m/s) → target_speed_kmh (= m/s × 3,6); target_type = PEDESTRIAN;
--     max_duration_s = 12 (đúng hằng số MAX_DURATION_S của bộ động học mà các run cũ đã chạy). Bản gốc (không gian
--     tham số) nhận giá trị giữ chỗ của bản chuẩn: 50 km/h, CLEAR, DAY. scenario_ir_json KHÔNG đổi (IR vẫn dùng m/s).
--   - optimization_runs / optimization_trials: đổi tên thuật toán / hàm thu nhận và cột mục tiêu theo bản chuẩn
--     (bảng đang rỗng; nếu có dữ liệu thì BAYESIAN_OPTIMIZATION → MOBO, EI/UCB/PI → NULL).
--   - tech_references: theo seed mới (bỏ ISO_22839_FCS, thêm EURO_NCAP_AEB_VRU và OPENSCENARIO_1_X).
-- =====================================================================
SET NAMES utf8mb4;

-- 1. AEB: 10 → 4 tham số --------------------------------------------------
UPDATE aeb_versions v
SET v.notes = CONCAT(IFNULL(CONCAT(v.notes, CHAR(10)), ''),
      'Đã rút khỏi scope (migration 007) — giá trị khác mặc định của các tham số cố định: ',
      (SELECT GROUP_CONCAT(CONCAT(p.code, '=', CAST(pv.param_value AS DOUBLE)) ORDER BY p.sort_order SEPARATOR ', ')
         FROM aeb_parameter_values pv JOIN aeb_parameters p ON p.id = pv.parameter_id
        WHERE pv.aeb_version_id = v.id AND pv.param_value <> p.default_value
          AND p.code IN ('DETECTION_CONFIDENCE_THRESHOLD', 'RELATIVE_VELOCITY_THRESHOLD', 'PREDICTION_HORIZON',
                         'SAFETY_DISTANCE_MARGIN', 'JERK_LIMIT', 'ACTUATOR_RESPONSE_TIME')))
WHERE EXISTS (SELECT 1
                FROM aeb_parameter_values pv JOIN aeb_parameters p ON p.id = pv.parameter_id
               WHERE pv.aeb_version_id = v.id AND pv.param_value <> p.default_value
                 AND p.code IN ('DETECTION_CONFIDENCE_THRESHOLD', 'RELATIVE_VELOCITY_THRESHOLD', 'PREDICTION_HORIZON',
                                'SAFETY_DISTANCE_MARGIN', 'JERK_LIMIT', 'ACTUATOR_RESPONSE_TIME'));

DELETE pv FROM aeb_parameter_values pv
JOIN aeb_parameters p ON p.id = pv.parameter_id
WHERE p.code IN ('DETECTION_CONFIDENCE_THRESHOLD', 'RELATIVE_VELOCITY_THRESHOLD', 'PREDICTION_HORIZON',
                 'SAFETY_DISTANCE_MARGIN', 'JERK_LIMIT', 'ACTUATOR_RESPONSE_TIME');

DELETE FROM aeb_parameters
WHERE code IN ('DETECTION_CONFIDENCE_THRESHOLD', 'RELATIVE_VELOCITY_THRESHOLD', 'PREDICTION_HORIZON',
               'SAFETY_DISTANCE_MARGIN', 'JERK_LIMIT', 'ACTUATOR_RESPONSE_TIME');

ALTER TABLE aeb_parameters
  MODIFY category ENUM('DECISION','CONTROL','VEHICLE_DYNAMICS') NOT NULL,
  MODIFY min_value DECIMAL(14,6) NOT NULL COMMENT 'Biên dưới — kiểm giá trị + không gian tìm kiếm MOBO';

UPDATE aeb_parameters SET sort_order = 1, name = 'TTC Threshold',          description = 'Ngưỡng Time-to-Collision kích hoạt phanh AEB'              WHERE code = 'TTC_THRESHOLD';
UPDATE aeb_parameters SET sort_order = 2, name = 'Brake Activation Delay', description = 'Độ trễ từ lúc quyết định tới khi phanh tác động'         WHERE code = 'BRAKE_ACTIVATION_DELAY';
UPDATE aeb_parameters SET sort_order = 3, name = 'Max Deceleration',       description = 'Giới hạn giảm tốc tối đa mà bộ AEB được yêu cầu'         WHERE code = 'MAX_DECELERATION';
UPDATE aeb_parameters SET sort_order = 4, name = 'Brake Build-up Rate',    description = 'Tốc độ tăng lực phanh (build-up rate)'                    WHERE code = 'BRAKE_BUILDUP_RATE';

ALTER TABLE aeb_versions
  MODIFY notes TEXT NULL COMMENT 'Kỹ sư ghi vì sao tạo version này (vd: TTC 1.8s phanh sớm hơn)';

-- 2. Kịch bản: 7 category ------------------------------------------------------
ALTER TABLE scenarios
  ADD COLUMN category ENUM('CCRS','CCRM','CCRB','CP_CROSSING','CPLA','TURNING','CUT_IN') NOT NULL DEFAULT 'CCRS' COMMENT '7 nhóm kịch bản Euro NCAP: CCRs (đứng yên), CCRm (đi đều), CCRb (phanh gấp), CP_CROSSING (băng qua), CPLA (cùng chiều), TURNING (rẽ cắt), CUT_IN (cắt làn)' AFTER project_id,
  ADD KEY idx_scenarios_category (category);
UPDATE scenarios SET category = 'CP_CROSSING';

ALTER TABLE scenario_versions
  ADD COLUMN target_type ENUM('VEHICLE','PEDESTRIAN') NOT NULL DEFAULT 'VEHICLE' COMMENT 'Đối tượng mục tiêu: Xe hoặc Người đi bộ' AFTER scenario_ir_json,
  ADD COLUMN target_speed_kmh DECIMAL(6,2) NULL COMMENT 'Tốc độ xe mục tiêu hoặc người đi bộ (km/h, vd: xe trước 20/50 km/h; người đi bộ 5/8 km/h)' AFTER ego_speed_kmh,
  ADD COLUMN initial_distance_m DECIMAL(6,2) NULL COMMENT 'Khoảng cách ban đầu giữa xe ego và đối tượng (m, vd: 12 m hoặc 40 m)' AFTER target_speed_kmh,
  ADD COLUMN lateral_overlap_pct DECIMAL(5,2) NULL COMMENT 'Độ chồng lấn / lệch ngang (%, vd: 25%, 50%, 75%, 100%)' AFTER initial_distance_m,
  ADD COLUMN target_decel_mps2 DECIMAL(5,2) NULL COMMENT 'Gia tốc phanh của xe phía trước nếu là CCRb (m/s2, vd: -2 hoặc -6 m/s2)' AFTER lateral_overlap_pct,
  ADD COLUMN max_duration_s DECIMAL(6,2) NOT NULL DEFAULT 15.00 COMMENT 'Thời gian mô phỏng tối đa (s, mặc định 15s theo Euro NCAP)' AFTER road_friction;

UPDATE scenario_versions SET target_type = 'PEDESTRIAN', max_duration_s = 12.00;
UPDATE scenario_versions SET target_speed_kmh = ROUND(pedestrian_speed_mps * 3.6, 2) WHERE pedestrian_speed_mps IS NOT NULL;
-- Bản gốc chưa có điểm tham số: nhận giá trị giữ chỗ của bản chuẩn (cột bản chuẩn là NOT NULL).
UPDATE scenario_versions SET ego_speed_kmh = 50.00 WHERE ego_speed_kmh IS NULL;
UPDATE scenario_versions SET weather = 'CLEAR'     WHERE weather IS NULL;
UPDATE scenario_versions SET time_of_day = 'DAY'   WHERE time_of_day IS NULL;

ALTER TABLE scenario_versions
  MODIFY scenario_ir_json JSON NOT NULL COMMENT 'Bản gốc: không gian tham số; biến thể: một điểm tham số cụ thể',
  MODIFY ego_speed_kmh DECIMAL(6,2) NOT NULL DEFAULT 50.00 COMMENT 'Tốc độ xuất phát xe ego (km/h, vd: 10–80 km/h)',
  MODIFY trigger_distance_m DECIMAL(6,2) NULL COMMENT 'Khoảng cách kích hoạt tình huống (m, vd: người đi bộ bắt đầu đi khi xe còn cách 37.5 m)',
  MODIFY stops_at_curb BOOLEAN NULL DEFAULT FALSE COMMENT 'Người đi bộ dừng ở mép lề đường — ca đo phanh oan False Positive',
  MODIFY weather ENUM('CLEAR','CLOUDY','RAIN','HEAVY_RAIN','FOG') NOT NULL DEFAULT 'CLEAR',
  MODIFY time_of_day ENUM('DAY','DUSK','NIGHT') NOT NULL DEFAULT 'DAY',
  MODIFY road_friction DECIMAL(4,2) NULL DEFAULT 1.00 COMMENT 'Hệ số ma sát mặt đường μ (bộ động học dùng, CARLA mô phỏng visual mưa)',
  MODIFY openscenario_version VARCHAR(20) NULL DEFAULT '1.0' COMMENT 'Phiên bản OpenSCENARIO (.xosc)',
  MODIFY openscenario_content LONGTEXT NULL COMMENT 'Nội dung file OpenSCENARIO XML (.xosc) nạp vào ScenarioRunner',
  MODIFY opendrive_content LONGTEXT NULL COMMENT 'Nội dung file OpenDRIVE (.xodr) hoặc NULL nếu dùng map chuẩn CARLA',
  MODIFY map_name VARCHAR(100) NULL DEFAULT 'Town01' COMMENT 'Bản đồ CARLA LogicFile (vd: Town01, Town10HD)',
  DROP COLUMN pedestrian_speed_mps,
  ADD CONSTRAINT ck_sv_ranges CHECK (ego_speed_kmh > 0 AND max_duration_s > 0
                                     AND (target_speed_kmh IS NULL OR target_speed_kmh >= 0)
                                     AND (initial_distance_m IS NULL OR initial_distance_m > 0)
                                     AND (trigger_distance_m IS NULL OR trigger_distance_m > 0)
                                     AND (lateral_overlap_pct IS NULL OR lateral_overlap_pct BETWEEN -100 AND 100)),
  ADD CONSTRAINT ck_sv_decel CHECK (target_decel_mps2 IS NULL OR (target_decel_mps2 < 0 AND target_type = 'VEHICLE'));

-- 3. Tối ưu đa mục tiêu (MOBO) ------------------------------------------------------
ALTER TABLE optimization_runs DROP CHECK ck_or_acquisition;
ALTER TABLE optimization_runs
  MODIFY algorithm ENUM('BAYESIAN_OPTIMIZATION','MOBO','NSGA_II','RANDOM_SEARCH') NOT NULL,
  MODIFY acquisition_function ENUM('EI','UCB','PI','EHVI','qEHVI','MESMO','USEMO','PAREGO') NULL;
UPDATE optimization_runs SET algorithm = 'MOBO' WHERE algorithm = 'BAYESIAN_OPTIMIZATION';
UPDATE optimization_runs SET acquisition_function = NULL WHERE acquisition_function IN ('EI','UCB','PI');
ALTER TABLE optimization_runs
  MODIFY simulator_version VARCHAR(30) NOT NULL COMMENT 'vd: vehicsim-kinematic-1.0, carla-0.9.16',
  MODIFY algorithm ENUM('MOBO','NSGA_II','RANDOM_SEARCH') NOT NULL DEFAULT 'MOBO' COMMENT 'Thuật toán tối ưu: Multi-Objective Bayesian Optimization (MOBO), NSGA-II, Random Search',
  MODIFY acquisition_function ENUM('EHVI','qEHVI','MESMO','USEMO','PAREGO') NULL COMMENT 'Hàm thu nhận đa mục tiêu: Expected Hypervolume Improvement (EHVI/qEHVI), ParEGO, MESMO',
  MODIFY n_initial_points INT UNSIGNED NULL COMMENT 'Số điểm thiết kế ban đầu (DoE/Sobol) trước khi hàm thu nhận chọn điểm',
  MODIFY search_space_json JSON NOT NULL COMMENT 'Không gian tìm kiếm 4 tham số AEB: TTC_THRESHOLD, BRAKE_ACTIVATION_DELAY, MAX_DECELERATION, BRAKE_BUILDUP_RATE',
  MODIFY objective_config_json JSON NOT NULL COMMENT 'Cấu hình 3 mục tiêu: Braking Comfort (RMS Jerk), Collision Mitigation (Impact Speed), Stopping Performance (Stopping Distance)',
  ADD CONSTRAINT ck_or_acquisition CHECK (acquisition_function IS NULL OR algorithm = 'MOBO');

ALTER TABLE optimization_trials DROP CHECK ck_ot_rates;
ALTER TABLE optimization_trials
  MODIFY acquisition_value DECIMAL(14,6) NULL COMMENT 'Giá trị hàm thu nhận EHVI/ParEGO lúc thuật toán chọn điểm',
  ADD COLUMN rms_jerk_mps3 DECIMAL(8,3) NULL COMMENT 'Mục tiêu 1: Braking Comfort — RMS Jerk (m/s3) cần MINIMIZE' AFTER acquisition_value,
  ADD COLUMN impact_speed_mps DECIMAL(8,3) NULL COMMENT 'Mục tiêu 2: Collision Mitigation — Vận tốc va chạm (m/s) cần MINIMIZE' AFTER rms_jerk_mps3,
  ADD COLUMN stopping_distance_m DECIMAL(8,3) NULL COMMENT 'Mục tiêu 3: Stopping Performance — Quãng đường phanh dừng (m) cần MINIMIZE' AFTER impact_speed_mps,
  MODIFY collision_rate_pct DECIMAL(5,2) NULL COMMENT 'Tỉ lệ xảy ra va chạm trên tập kịch bản (%)',
  MODIFY objective_values_json JSON NULL COMMENT 'Vector 3 mục tiêu [rms_jerk, impact_speed, stopping_distance] và các chỉ số phụ',
  MODIFY score DECIMAL(18,6) NULL COMMENT 'Điểm số vô hướng hóa (nếu dùng ParEGO / Chebyshev scalarization)',
  MODIFY is_pareto_optimal BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Đánh dấu nghiệm thuộc Pareto-optimal front của bài toán đa mục tiêu',
  DROP COLUMN false_activation_rate_pct,
  DROP COLUMN comfort_max_jerk_mps3,
  ADD CONSTRAINT ck_ot_rates CHECK ((collision_rate_pct IS NULL OR collision_rate_pct BETWEEN 0 AND 100));

-- 4. Regression, run, nguyên nhân gốc, khuyến nghị: cột mới / comment theo bản chuẩn ----------------
ALTER TABLE regression_tests
  MODIFY simulator_version VARCHAR(30) NOT NULL COMMENT 'Mọi cặp run chạy đúng bộ mô phỏng này',
  MODIFY pass_criteria_json JSON NOT NULL COMMENT 'vd: không va chạm mới, RMS Jerk không tăng quá 10%, stopping distance cải thiện';

ALTER TABLE simulation_runs
  MODIFY simulator_version VARCHAR(30) NOT NULL COMMENT 'Danh tính bộ mô phỏng: vehicsim-kinematic-1.0 | carla-0.9.16',
  MODIFY fixed_delta_seconds DECIMAL(6,4) NOT NULL DEFAULT 0.0500 COMMENT 'Bước mô phỏng (synchronous_mode)',
  MODIFY first_detection_time_s DECIMAL(8,3) NULL COMMENT 'Perception phát hiện đối tượng lần đầu (độ trễ phát hiện)',
  ADD COLUMN rms_jerk_mps3 DECIMAL(8,3) NULL COMMENT 'Objective 1: RMS Jerk (m/s3) — Độ êm phanh (Braking Comfort)' AFTER is_false_negative,
  MODIFY impact_speed_mps DECIMAL(8,3) NULL COMMENT 'Objective 2: Vận tốc lúc va chạm (m/s) — Giảm thiểu va chạm (Collision Mitigation)',
  MODIFY stopping_distance_m DECIMAL(8,3) NULL COMMENT 'Objective 3: Quãng đường phanh dừng (m) — Hiệu năng phanh (Stopping Performance)',
  MODIFY braking_response_time_s DECIMAL(8,3) NULL COMMENT 'Từ lệnh AEB tới lúc phanh có tác dụng thực tế',
  MODIFY telemetry_json JSON NULL COMMENT 'Chuỗi khung (ego, target, perception, TTC) cho biểu đồ / phát lại';

ALTER TABLE root_causes
  MODIFY cause_code VARCHAR(64) NOT NULL COMMENT 'vd: TRIGGERED_TOO_LATE, BRAKE_DELAY_TOO_HIGH';

ALTER TABLE engineering_recommendations
  MODIFY content TEXT NOT NULL COMMENT 'Kết luận kỹ thuật & đề xuất lựa chọn cấu hình Pareto tốt nhất';

-- 5. Tri thức kỹ thuật: seed mới -----------------------------------------------------------
DELETE FROM tech_references WHERE ref_code = 'ISO_22839_FCS';
UPDATE tech_references
   SET ref_type = 'STANDARD', ref_name = 'Euro NCAP AEB Car-to-Car Assessment Protocol',
       description = 'Quy chuẩn đánh giá hệ thống phanh tự động khẩn cấp giữa xe và xe (CCRs, CCRm, CCRb)',
       source_type = 'STANDARD', source_title = 'Euro NCAP Test Protocol - AEB Systems v3.0.2 / v4.3',
       organization = 'Euro NCAP', publication_year = 2023
 WHERE ref_code = 'EURO_NCAP_AEB_C2C';
INSERT INTO tech_references (ref_code, ref_type, ref_name, ref_value, unit, description, source_type, source_title, organization, publication_year)
SELECT * FROM (
  SELECT 'EURO_NCAP_AEB_VRU' AS ref_code, 'STANDARD' AS ref_type, 'Euro NCAP AEB Vulnerable Road User Protocol' AS ref_name, NULL AS ref_value, NULL AS unit,
         'Quy chuẩn đánh giá AEB đối với người đi bộ và người đi xe đạp (CPFA, CPNA, CPNCO, CPLA, CPTA)' AS description, 'STANDARD' AS source_type,
         'Euro NCAP Test Protocol - AEB/LSS VRU systems v4.5' AS source_title, 'Euro NCAP' AS organization, 2023 AS publication_year
  UNION ALL
  SELECT 'OPENSCENARIO_1_X', 'STANDARD', 'ASAM OpenSCENARIO Standard', NULL, NULL,
         'Chuẩn quốc tế mô tả động học kịch bản thử nghiệm xe tự hành (.xosc) hỗ trợ bởi CARLA ScenarioRunner', 'STANDARD',
         'ASAM OpenSCENARIO User Guide v1.0 / v1.1', 'ASAM', 2021
) AS new_rows
WHERE NOT EXISTS (SELECT 1 FROM tech_references t WHERE t.ref_code = new_rows.ref_code);
