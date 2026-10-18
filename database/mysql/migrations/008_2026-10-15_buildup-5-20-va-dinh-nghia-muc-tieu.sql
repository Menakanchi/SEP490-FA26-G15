-- =====================================================================
-- Migration 008 — 15/10/2026: BRAKE_BUILDUP_RATE biên [5, 20] và định nghĩa ba mục tiêu tối ưu (bổ sung ADR-040).
-- Số bảng giữ nguyên (29). Chi tiết và lý do: docs/adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md
--
-- Dành cho DB MySQL đã chạy migration 007. DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG cần chạy.
-- Chạy MỘT lần, từ thư mục gốc repo (luôn utf8mb4), SAU KHI sao lưu:
--   docker compose exec mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction vehicsim > /tmp/backup.sql'
--   docker compose cp database/mysql/migrations/008_2026-10-15_buildup-5-20-va-dinh-nghia-muc-tieu.sql mysql:/tmp/008.sql
--   docker compose exec mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim < /tmp/008.sql'
--
-- Đổi dữ liệu:
--   - BRAKE_BUILDUP_RATE: biên [10, 100] → [5, 20], mặc định 50 → 20. Lõi AEB chặn tốc độ tăng lực phanh ở JERK_LIMIT = 20 m/s³
--     nên 20–100 cho cùng một kết quả (đo trên họ kịch bản thật: 90 % khoảng cũ không đổi gì). Mọi giá trị đang lưu (50) → 20:
--     kết quả mô phỏng của các run cũ KHÔNG đổi.
--   - simulation_runs.rms_jerk_mps3 và stopping_distance_m tính lại cho mọi run COMPLETED từ telemetry_json theo định nghĩa mới
--     (worker/vehicsim_core/simulator.py::brake_phase_metrics): RMS jerk trong pha phanh; quãng phanh dừng = quãng từ lúc phanh tác dụng
--     tới lúc dừng, run kết thúc khi xe còn chạy thì cộng v²/(2·decel_available) — nên ca va chạm cũng có giá trị. Run không phanh: NULL.
-- =====================================================================
SET NAMES utf8mb4;

-- 1. BRAKE_BUILDUP_RATE ---------------------------------------------------------
UPDATE aeb_parameter_values pv
JOIN aeb_parameters p ON p.id = pv.parameter_id
SET pv.param_value = 20
WHERE p.code = 'BRAKE_BUILDUP_RATE' AND pv.param_value > 20;

UPDATE aeb_parameters
SET min_value = 5.00, max_value = 20.00, default_value = 20.00,
    description = 'Tốc độ tăng lực phanh (build-up rate), tối đa 20 = JERK_LIMIT cố định của lõi AEB'
WHERE code = 'BRAKE_BUILDUP_RATE';

-- 2. Comment cột mục tiêu (định nghĩa) -----------------------------------------------
ALTER TABLE optimization_runs
  MODIFY objective_config_json JSON NOT NULL COMMENT 'Cấu hình 3 mục tiêu: Braking Comfort (RMS Jerk), Collision Mitigation (Impact Speed), Stopping Performance (Stopping Distance). Ràng buộc mặc định: {"constraints": {"collision_rate_pct": {"max": "baseline"}, "false_activation_increase_pts": {"max": 5}}} — trial vi phạm bị loại khỏi mặt Pareto';

ALTER TABLE optimization_trials
  MODIFY rms_jerk_mps3 DECIMAL(8,3) NULL COMMENT 'Mục tiêu 1: Braking Comfort — RMS Jerk (m/s3) cần MINIMIZE; trung bình rms_jerk_mps3 các run có phanh của họ',
  MODIFY impact_speed_mps DECIMAL(8,3) NULL COMMENT 'Mục tiêu 2: Collision Mitigation — Vận tốc va chạm (m/s) cần MINIMIZE; trung bình trên MỌI run của họ (không va chạm = 0)',
  MODIFY stopping_distance_m DECIMAL(8,3) NULL COMMENT 'Mục tiêu 3: Stopping Performance — Quãng đường phanh dừng (m) cần MINIMIZE; trung bình các run có phanh của họ (kể cả ca va chạm)';

ALTER TABLE simulation_runs
  MODIFY rms_jerk_mps3 DECIMAL(8,3) NULL COMMENT 'Objective 1: RMS Jerk (m/s3) trong pha phanh, từ lúc phanh tác dụng tới hết run (Braking Comfort); NULL nếu không phanh',
  MODIFY impact_speed_mps DECIMAL(8,3) NULL COMMENT 'Objective 2: Vận tốc lúc va chạm (m/s) (Collision Mitigation); NULL nếu không va chạm — khi gộp theo họ tính 0',
  MODIFY stopping_distance_m DECIMAL(8,3) NULL COMMENT 'Objective 3: Quãng từ lúc phanh tác dụng tới lúc dừng (m); run kết thúc khi xe còn chạy thì cộng v²/(2·decel_available), nên có cả ca va chạm; NULL nếu không phanh (Stopping Performance)';

-- 3. Tính lại hai mục tiêu cho run cũ từ telemetry_json ------------------------------------
-- Cùng công thức với brake_phase_metrics (khung có ego_a / ego_x / ego_v đã làm tròn như worker lưu; dt = 0.05 s).
UPDATE simulation_runs r
JOIN (
  WITH frames AS (
    SELECT s.id AS rid, jt.i, jt.t, jt.a, jt.x, jt.v,
           LAG(jt.a, 1, 0) OVER (PARTITION BY s.id ORDER BY jt.i) AS prev_a,
           JSON_VALUE(s.telemetry_json, '$.metrics.brake_onset_t' RETURNING DOUBLE) AS onset,
           JSON_VALUE(s.telemetry_json, '$.metrics.decel_available_mps2' RETURNING DOUBLE) AS dec_av
    FROM simulation_runs s,
         JSON_TABLE(s.telemetry_json, '$.frames[*]' COLUMNS (
           i FOR ORDINALITY,
           t DOUBLE PATH '$.t', a DOUBLE PATH '$.ego_a', x DOUBLE PATH '$.ego_x', v DOUBLE PATH '$.ego_v')) jt
    WHERE s.status = 'COMPLETED' AND s.telemetry_json IS NOT NULL
  ),
  phase AS (
    SELECT rid, a, prev_a, dec_av,
           FIRST_VALUE(x) OVER w AS x0, LAST_VALUE(x) OVER w AS x1, LAST_VALUE(v) OVER w AS v1
    FROM frames
    WHERE onset IS NOT NULL AND t >= onset - 0.000000001
    WINDOW w AS (PARTITION BY rid ORDER BY i ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
  )
  SELECT rid,
         ROUND(SQRT(AVG(POW((a - prev_a) / 0.05, 2))), 3) AS rms,
         ROUND(MAX(x1) - MAX(x0) + IF(MAX(dec_av) > 0, MAX(v1) * MAX(v1) / (2 * MAX(dec_av)), 0), 3) AS dist
  FROM phase
  GROUP BY rid
) b ON b.rid = r.id
SET r.rms_jerk_mps3 = b.rms, r.stopping_distance_m = b.dist;

-- Run không phanh: hai mục tiêu NULL (stopping_distance_m cũ cũng đã NULL).
UPDATE simulation_runs
SET rms_jerk_mps3 = NULL, stopping_distance_m = NULL
WHERE status = 'COMPLETED' AND telemetry_json IS NOT NULL
  AND JSON_VALUE(telemetry_json, '$.metrics.brake_onset_t' RETURNING DOUBLE) IS NULL;
