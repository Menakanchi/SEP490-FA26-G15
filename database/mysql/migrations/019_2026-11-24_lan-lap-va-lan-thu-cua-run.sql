-- =====================================================================
-- Migration 019 — 24/11/2026 (ADR-065): lần lặp và lần thử của run. Không đổi số bảng.
--
-- simulation_runs.repetition: lần lặp thứ mấy của cùng một cấu hình (biến thể + AEB + aeb_mode + xe + simulator + seed). Run đầu là 1.
--   Backend tính lúc tạo run; run cũ được đánh số theo thứ tự id trong từng cấu hình bên dưới.
-- simulation_runs.attempt: số lần worker nhận run (tăng ở bước PENDING -> RUNNING). 0 = chưa chạy; 2 = run bị khôi phục sau khi backend chết
--   giữa chừng. Run cũ: 1 nếu đã có started_at, ngược lại 0 (không biết run cũ từng bị nhặt lại bao nhiêu lần).
-- Hai cột được ghi vào khối "dataset.identity" của result.json (Failure Analysis) và không đổi kết quả hay định danh run.
-- DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG cần chạy file này. Cần MySQL 8 (ROW_NUMBER).
--
-- Chạy một lần (giữ dữ liệu):
--   docker compose exec -T mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim' \
--     < database/mysql/migrations/019_2026-11-24_lan-lap-va-lan-thu-cua-run.sql
-- =====================================================================
ALTER TABLE simulation_runs
  ADD COLUMN repetition SMALLINT UNSIGNED NOT NULL DEFAULT 1
    COMMENT 'Lần lặp thứ mấy của cùng cấu hình (biến thể + AEB + aeb_mode + xe + simulator + seed); tính lúc tạo run (migration 019)' AFTER aeb_mode,
  ADD COLUMN attempt SMALLINT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Số lần worker nhận run này (tăng khi PENDING -> RUNNING); 0 = chưa chạy, 2 = bị khôi phục sau khi backend chết giữa run (migration 019)' AFTER repetition;

UPDATE simulation_runs r
JOIN (
  SELECT id, ROW_NUMBER() OVER (
           PARTITION BY scenario_version_id, aeb_version_id, aeb_mode, carla_vehicle_model_id, simulator_version, random_seed
           ORDER BY id) AS rep
  FROM simulation_runs
) n ON n.id = r.id
SET r.repetition = n.rep;

UPDATE simulation_runs SET attempt = 1 WHERE started_at IS NOT NULL;
