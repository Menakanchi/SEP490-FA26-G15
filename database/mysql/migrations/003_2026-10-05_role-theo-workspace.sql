-- =====================================================================
-- Migration 003 — 05/10/2026: role theo workspace, bỏ forum (38 → 36 bảng)
-- Chi tiết và lý do: docs/adr/ADR-034-role-he-thong-va-role-trong-workspace.md
--
-- Dành cho DB MySQL đã chạy migration 002 (38 bảng). DB tạo mới từ 01_schema.sql hiện tại
-- thì KHÔNG cần chạy. Chạy MỘT lần, từ thư mục gốc repo (luôn utf8mb4):
--   docker compose exec mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction vehicsim > /tmp/backup.sql'
--   docker compose cp database/mysql/migrations/003_2026-10-05_role-theo-workspace.sql mysql:/tmp/003.sql
--   docker compose exec mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim < /tmp/003.sql'
--
-- Đổi dữ liệu: role EXPERT cũ (ADR-030, "chuyên gia") đổi tên thành EXPERIENCE ("EXP" — người dùng tự
-- đăng ký, ADR-034; nghĩa mới, không phải chuyên gia); mọi tài khoản đang có role ENGINEER chuyển sang
-- EXPERIENCE, rồi xoá role ENGINEER. Xoá hẳn forum_posts / forum_comments / project_members (chưa có code, 0 dòng
-- trên DB dev — có dòng thì sao lưu trước).
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Role hệ thống: ADMIN / MANAGER / EXPERIENCE
INSERT INTO roles (code, name, description) VALUES
  ('MANAGER', 'Manager', 'Tạo workspace, thêm/bớt thành viên Engineer/Reviewer');
UPDATE roles SET description = 'Quản trị hệ thống' WHERE code = 'ADMIN';
UPDATE roles
SET code = 'EXPERIENCE', name = 'Experience',
    description = 'Người dùng đăng ký (EXP): tạo project cá nhân, chạy và kiểm thử; không tạo workspace'
WHERE code = 'EXPERT';

INSERT IGNORE INTO user_roles (user_id, role_id, assigned_at)
SELECT ur.user_id, e.id, ur.assigned_at
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id AND r.code = 'ENGINEER'
CROSS JOIN roles e
WHERE e.code = 'EXPERIENCE';
DELETE ur FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'ENGINEER';
DELETE FROM roles WHERE code = 'ENGINEER';

-- 2. Project cá nhân: không thuộc workspace nào
ALTER TABLE projects
  MODIFY workspace_id BIGINT UNSIGNED NULL,
  ADD COLUMN personal_owner_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(workspace_id IS NULL, created_by, NULL)) VIRTUAL AFTER created_by,
  ADD UNIQUE KEY uq_projects_personal_name (personal_owner_key, name);

-- 3. Thành viên theo workspace thay cho thành viên theo project
DROP TABLE project_members;

CREATE TABLE workspace_members (
  workspace_id BIGINT UNSIGNED NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  member_role  ENUM('ENGINEER','REVIEWER') NOT NULL,           -- ENGINEER: tạo project, chạy, tạo candidate; REVIEWER: chỉ duyệt
  added_by     BIGINT UNSIGNED NULL,                           -- Manager đã thêm
  joined_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id),
  KEY idx_wm_user (user_id),
  KEY idx_wm_added_by (added_by),
  CONSTRAINT fk_wm_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_wm_user      FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_wm_added_by  FOREIGN KEY (added_by)     REFERENCES users(id)      ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Bỏ forum (TrungDQ 05/10: không làm forum nữa)
ALTER TABLE notifications
  MODIFY type ENUM('RUN_COMPLETED','RUN_FAILED','REGRESSION_COMPLETED','REVIEW_REQUESTED',
                   'REVIEW_DECIDED','OPTIMIZATION_COMPLETED','ROBUSTNESS_COMPLETED',
                   'WORKSPACE_MEMBER_ADDED','WORKSPACE_MEMBER_REMOVED','SYSTEM') NOT NULL;
DROP TABLE forum_comments;
DROP TABLE forum_posts;

SET FOREIGN_KEY_CHECKS = 1;
