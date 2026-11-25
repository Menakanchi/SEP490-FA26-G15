-- BE-R1 additive Failure Analysis storage. Manual application to an ISOLATED DB first.
-- NOT executed by the application. No historical row is migrated or updated.
-- MySQL 8.0.16+ / InnoDB. Rollback: archive/export these resources first, then drop
-- fa_json_handoffs, fa_json_reports, fa_json_executions, fa_json_sources in that order.

CREATE TABLE fa_json_sources (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  execution_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  dedupe_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  identity_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  payload_bytes MEDIUMBLOB NOT NULL,
  payload_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  metadata_bytes MEDIUMBLOB NOT NULL,
  metadata_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_fa_source_project_id (project_id,id),
  UNIQUE KEY uq_fa_source_dedupe (project_id,dedupe_key),
  KEY ix_fa_source_identity (project_id,identity_digest),
  KEY ix_fa_source_list (project_id,created_at,id),
  CONSTRAINT fk_fa_source_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT ck_fa_source_bytes CHECK (OCTET_LENGTH(payload_bytes) <= 1048576 AND OCTET_LENGTH(metadata_bytes) <= 262144),
  CONSTRAINT ck_fa_source_parent CHECK (source_id IS NULL AND execution_id IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE fa_json_executions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  execution_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  dedupe_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  identity_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  payload_bytes MEDIUMBLOB NOT NULL,
  payload_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  metadata_bytes MEDIUMBLOB NOT NULL,
  metadata_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_fa_execution_parent (project_id,id,source_id),
  UNIQUE KEY uq_fa_execution_dedupe (project_id,dedupe_key),
  KEY ix_fa_execution_list (project_id,created_at,id),
  CONSTRAINT fk_fa_execution_source FOREIGN KEY (project_id,source_id) REFERENCES fa_json_sources(project_id,id) ON DELETE RESTRICT,
  CONSTRAINT ck_fa_execution_bytes CHECK (OCTET_LENGTH(payload_bytes) <= 8388608 AND OCTET_LENGTH(metadata_bytes) <= 262144),
  CONSTRAINT ck_fa_execution_parent CHECK (execution_id IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE fa_json_reports (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  execution_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  dedupe_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  identity_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  payload_bytes MEDIUMBLOB NOT NULL,
  payload_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  metadata_bytes MEDIUMBLOB NOT NULL,
  metadata_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_fa_report_dedupe (project_id,dedupe_key),
  KEY ix_fa_report_execution (project_id,execution_id,source_id),
  KEY ix_fa_report_list (project_id,created_at,id),
  CONSTRAINT fk_fa_report_execution FOREIGN KEY (project_id,execution_id,source_id) REFERENCES fa_json_executions(project_id,id,source_id) ON DELETE RESTRICT,
  CONSTRAINT ck_fa_report_bytes CHECK (OCTET_LENGTH(payload_bytes) <= 8388608 AND OCTET_LENGTH(metadata_bytes) <= 262144)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE fa_json_handoffs (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  execution_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  dedupe_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  identity_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  payload_bytes MEDIUMBLOB NULL,
  payload_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  metadata_bytes MEDIUMBLOB NOT NULL,
  metadata_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_fa_handoff_execution (project_id,execution_id),
  UNIQUE KEY uq_fa_handoff_dedupe (project_id,dedupe_key),
  KEY ix_fa_handoff_execution (project_id,execution_id,source_id),
  CONSTRAINT fk_fa_handoff_execution FOREIGN KEY (project_id,execution_id,source_id) REFERENCES fa_json_executions(project_id,id,source_id) ON DELETE RESTRICT,
  CONSTRAINT ck_fa_handoff_bytes CHECK ((payload_bytes IS NULL OR OCTET_LENGTH(payload_bytes) <= 8388608) AND OCTET_LENGTH(metadata_bytes) <= 262144),
  CONSTRAINT ck_fa_handoff_null CHECK ((payload_bytes IS NULL AND payload_sha256 IS NULL) OR (payload_bytes IS NOT NULL AND payload_sha256 IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
