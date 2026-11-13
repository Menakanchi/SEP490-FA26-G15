-- Migration 013: 29 -> 30 bảng. Dừng backend, sao lưu, chạy trên DB hiện hữu rồi khởi động code mới.
-- DB mới dùng 01_schema.sql không cần migration. Có thể chạy lại: CREATE IF NOT EXISTS và backfill chống trùng.
-- Chỉ giữ quyết định gần nhất còn trong DB; không dựng lại các quyết định đã bị ghi đè trước đây.
-- Rollback ứng dụng giữ nguyên bảng này. Khi nâng lại, chạy lại backfill để giữ lần ghi gần nhất từ code cũ.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS recommendation_decisions (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recommendation_id    BIGINT UNSIGNED NOT NULL,
  decision             ENUM('ACCEPT','REJECT','REQUEST_MORE_TESTS') NOT NULL,
  reviewed_by_user_id   BIGINT UNSIGNED NOT NULL,
  reviewer_name        VARCHAR(255) NOT NULL COMMENT 'Tên hiển thị chụp lúc quyết định hoặc lúc backfill',
  reviewed_at          DATETIME NOT NULL,
  reason               TEXT NULL,
  review_conditions    TEXT NULL,
  confirmed            BOOLEAN NULL COMMENT 'NULL = dữ liệu cũ không lưu bằng chứng xác nhận',
  source               ENUM('REVIEW','LEGACY_SNAPSHOT') NOT NULL,
  PRIMARY KEY (id),
  KEY idx_rd_recommendation_time (recommendation_id, reviewed_at, id),
  KEY idx_rd_reviewer (reviewed_by_user_id),
  CONSTRAINT fk_rd_recommendation FOREIGN KEY (recommendation_id) REFERENCES engineering_recommendations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_rd_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_rd_evidence CHECK (source = 'LEGACY_SNAPSHOT' OR (confirmed IS NOT NULL AND confirmed = TRUE AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0))
) ENGINE=InnoDB;

INSERT INTO recommendation_decisions
    (recommendation_id, decision, reviewed_by_user_id, reviewer_name, reviewed_at, reason, review_conditions, confirmed, source)
SELECT er.id, CASE er.status WHEN 'ACCEPTED' THEN 'ACCEPT' WHEN 'REJECTED' THEN 'REJECT' ELSE 'REQUEST_MORE_TESTS' END,
       er.reviewed_by_user_id, CONCAT_WS(' ', u.last_name, u.middle_name, u.first_name), er.reviewed_at,
       er.review_notes, er.review_conditions, NULL, 'LEGACY_SNAPSHOT'
  FROM engineering_recommendations er JOIN users u ON u.id = er.reviewed_by_user_id
 WHERE er.status <> 'PENDING_REVIEW' AND er.reviewed_at IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM recommendation_decisions d
        WHERE d.recommendation_id = er.id AND d.reviewed_by_user_id = er.reviewed_by_user_id
          AND d.reviewed_at = er.reviewed_at
          AND d.decision = CASE er.status WHEN 'ACCEPTED' THEN 'ACCEPT' WHEN 'REJECTED' THEN 'REJECT' ELSE 'REQUEST_MORE_TESTS' END
          AND d.reason <=> er.review_notes AND d.review_conditions <=> er.review_conditions
   );
