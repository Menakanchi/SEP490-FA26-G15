-- =====================================================================
-- Migration 015 — 13/11/2026: chế độ AEB của run (chốt 13/11: baseline đo cả AEB hiện tại lẫn AEB tắt). Không đổi số bảng.
--
-- simulation_runs.aeb_mode: ON (mặc định, mọi run cũ) | OFF. Run OFF: perception và quyết định AEB vẫn chạy để ghi "AEB lẽ ra làm gì",
--   nhưng không phanh — mốc tham chiếu va chạm khi không có AEB. Regression và tối ưu không bao giờ lấy run OFF làm baseline.
-- Cùng đợt (không cần SQL): bộ động học đổi định danh vehicsim-kinematic-1.0 → 1.1 (impact_speed_mps là vận tốc va chạm tương đối),
--   CARLA lên .xosc v6 / -xosc6 (AEB của ca người đi bộ dùng radar, RMS jerk lọc theo Euro NCAP). Run cũ giữ nguyên, backend không chạy
--   lại run PENDING mang định danh cũ; baseline cần chạy lại bằng định danh mới.
-- DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG cần chạy file này.
--
-- Chạy một lần (giữ dữ liệu):
--   docker compose exec -T mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim' \
--     < database/mysql/migrations/015_2026-11-13_che-do-aeb-tat.sql
-- =====================================================================
ALTER TABLE simulation_runs
  ADD COLUMN aeb_mode ENUM('ON','OFF') NOT NULL DEFAULT 'ON'
    COMMENT 'OFF: AEB tắt, mốc tham chiếu của baseline; không bao giờ là baseline regression/tối ưu' AFTER aeb_version_id;