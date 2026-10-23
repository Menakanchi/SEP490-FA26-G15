-- =====================================================================
-- Migration 010 — 23/10/2026: Manager / Admin cấp role khi thêm thành viên workspace (29 bảng, không đổi số bảng).
-- Chi tiết và lý do: docs/adr/ADR-045-manager-cap-role-khi-them-thanh-vien.md
--
-- Thêm workspace_members.granted_role: role ENGINEER / REVIEWER cấp cho tài khoản tự đăng ký (EXPERIENCER) lúc được thêm vào
-- workspace; bớt khỏi workspace cuối cùng thì service trả role về EXPERIENCER. NULL = role có từ trước (Admin cấp) — mọi dòng đã
-- có trước migration này đều NULL nên không ai bị đổi role. DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG cần chạy file này.
--
-- Chạy một lần (giữ dữ liệu):
--   docker compose exec -T mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim' \
--     < database/mysql/migrations/010_2026-10-23_manager-cap-role-khi-them.sql
-- =====================================================================
ALTER TABLE workspace_members
  ADD COLUMN granted_role ENUM('ENGINEER','REVIEWER') NULL
    COMMENT 'Role cấp khi thêm tài khoản EXPERIENCER (ADR-045); NULL = role có từ trước. Rời workspace cuối cùng thì về EXPERIENCER'
    AFTER added_by_user_id;
