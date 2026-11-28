-- Sao lưu DB trước khi áp dụng. Bổ sung, không thay đổi dữ liệu hiện có.
-- Áp dụng trước khi chạy backend mới; mọi backend cũ phải được thay đồng bộ.
CREATE TABLE IF NOT EXISTS auth_revoked_tokens (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at_epoch BIGINT NOT NULL,
  PRIMARY KEY (token_hash),
  KEY idx_auth_revoked_tokens_expiry (expires_at_epoch)
) ENGINE=InnoDB;
