-- Chạy trên DB hiện có trước khi triển khai backend mới. Không thay đổi dữ liệu sẵn có.
-- Khi rollback code phải giữ bảng cho tới khi mọi việc dọn đã hoàn tất.
CREATE TABLE IF NOT EXISTS project_local_storage (
  id TINYINT UNSIGNED NOT NULL,
  storage_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT ck_project_local_storage_singleton CHECK (id = 1)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS project_local_cleanup (
  run_id BIGINT UNSIGNED NOT NULL,
  storage_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id),
  KEY ix_project_local_cleanup_storage (storage_id, run_id)
) ENGINE=InnoDB;
