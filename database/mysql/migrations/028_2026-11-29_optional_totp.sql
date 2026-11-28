-- Sao lưu trước khi nâng cấp. Không bật MFA cho tài khoản hiện có.
CREATE TABLE IF NOT EXISTS auth_mfa (
  user_id BIGINT UNSIGNED NOT NULL,
  encrypted_secret VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  last_step BIGINT NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_auth_mfa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_mfa_recovery_codes (
  user_id BIGINT UNSIGNED NOT NULL,
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (user_id, code_hash),
  CONSTRAINT fk_auth_mfa_recovery_user FOREIGN KEY (user_id) REFERENCES auth_mfa(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;
