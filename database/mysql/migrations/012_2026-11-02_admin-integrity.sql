-- Existing databases after migration 011 only. New databases use 01_schema.sql.
-- Back up first. Do NOT run against a new DB or repeat after success.
-- Preflight intentionally fails before any ALTER if existing names conflict.
-- Resolve duplicate names explicitly with the data owner; never delete rows here.
-- MySQL DDL auto-commits: if interrupted after an ALTER, inspect SHOW CREATE TABLE before resuming.
SET NAMES utf8mb4;
DROP PROCEDURE IF EXISTS vsos_admin_preflight;
DELIMITER //
CREATE PROCEDURE vsos_admin_preflight()
BEGIN
  IF EXISTS (SELECT name FROM workspaces GROUP BY name HAVING COUNT(*) > 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Duplicate workspace names; resolve before migration 012';
  END IF;
  IF EXISTS (SELECT ref_type, ref_name FROM tech_references GROUP BY ref_type, ref_name HAVING COUNT(*) > 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Duplicate reference names within kind; resolve before migration 012';
  END IF;
END//
DELIMITER ;
CALL vsos_admin_preflight();
DROP PROCEDURE vsos_admin_preflight;
ALTER TABLE users ADD COLUMN auth_version BIGINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD UNIQUE KEY uq_workspaces_name (name);
ALTER TABLE tech_references ADD UNIQUE KEY uq_tech_references_kind_name (ref_type, ref_name);