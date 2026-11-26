-- =====================================================================
-- Migration 025 — 26/11/2026 (ADR-069): một nguồn cho phạm vi 4 tham số AEB.
--
-- Trước đây có hai nguồn lệch nhau: aeb_parameters (chỉnh tay, màn /aeb) cho TTC 0,5–4 s, trễ 0–0,5 s, giảm tốc 3–10 m/s²;
-- còn MOBO tìm trong ParameterBounds.DEFAULT (TTC 0,5–3,5 s, trễ 0,05–0,45 s, giảm tốc 5–10 m/s²). Nhóm chốt lấy phạm vi
-- MOBO làm chuẩn: thu hẹp aeb_parameters cho khớp. Build-up rate giữ 5–20 m/s³ (đã khớp). Mặc định không đổi (1,5 / 0,15 / 8 / 20).
--
-- Không sửa aeb_parameter_values: phiên bản cũ có giá trị ngoài phạm vi mới vẫn giữ nguyên (bằng chứng run cũ), chỉ không
-- tạo thêm được (AebService kiểm theo min_value/max_value). Truy vấn cuối file liệt kê các giá trị đó để kiểm.
-- DB tạo mới từ 01_schema.sql hiện tại thì KHÔNG cần chạy file này.
--
-- Chạy một lần (giữ dữ liệu, sao lưu trước):
--   docker compose exec -T mysql sh -c 'mysql --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" vehicsim' \
--     < database/mysql/migrations/025_2026-11-26_pham-vi-tham-so-aeb-theo-mobo.sql
-- =====================================================================
UPDATE aeb_parameters SET min_value = 0.50, max_value = 3.50 WHERE code = 'TTC_THRESHOLD';
UPDATE aeb_parameters SET min_value = 0.05, max_value = 0.45 WHERE code = 'BRAKE_ACTIVATION_DELAY';
UPDATE aeb_parameters SET min_value = 5.00, max_value = 10.00 WHERE code = 'MAX_DECELERATION';

-- Mô tả do migration 022 ghi còn nêu khoảng cũ: sửa cho khớp (chạy sau 022; không có chuỗi cũ thì không đổi gì).
UPDATE aeb_parameters SET description = REPLACE(description, 'Khoảng tối ưu [0.5, 4.0] s', 'Khoảng tối ưu [0.5, 3.5] s') WHERE code = 'TTC_THRESHOLD';
UPDATE aeb_parameters SET description = REPLACE(description, 'Khoảng tối ưu [0.0, 0.5] s', 'Khoảng tối ưu [0.05, 0.45] s') WHERE code = 'BRAKE_ACTIVATION_DELAY';
UPDATE aeb_parameters SET description = REPLACE(description, 'Khoảng tối ưu [3.0, 10.0] m/s^2', 'Khoảng tối ưu [5.0, 10.0] m/s^2') WHERE code = 'MAX_DECELERATION';

-- Giá trị đã lưu nằm ngoài phạm vi mới (chỉ để xem, không sửa).
SELECT v.id AS aeb_version_id, v.label, v.status, p.code, pv.param_value, p.min_value, p.max_value
  FROM aeb_parameter_values pv
  JOIN aeb_parameters p ON p.id = pv.parameter_id
  JOIN aeb_versions v ON v.id = pv.aeb_version_id
 WHERE pv.param_value < p.min_value OR pv.param_value > p.max_value
 ORDER BY v.id, p.sort_order;
