# ADR-024 — VehicSim dùng MySQL 27 bảng + Redis, tách khỏi SQLite của Forge

**Trạng thái:** Proposed 30/09/2026 (schema do nhóm cung cấp 28/09; TrungDQ chốt cách tích hợp)
**Phạm vi:** dữ liệu VehicSim và tài khoản người dùng

## Bối cảnh

Scenario Forge lưu mọi thứ trong SQLite (ADR-011, ADR-013). Nhóm đưa ra schema
MySQL 8 gồm 27 bảng cho VehicSim (xe, AEB version + 10 tham số, họ kịch bản, run,
kết quả, lỗi, nguyên nhân, regression). App là **public**: có tự đăng ký, cần mã xác
minh qua email và giới hạn tần suất. Kế hoạch MVP cần hàng đợi run.

## Các lựa chọn

1. Nhồi bảng VehicSim vào SQLite của Forge.
2. Chuyển cả Forge sang MySQL ngay.
3. VehicSim + tài khoản trên MySQL (`VEHICSIM_DATABASE_URL`), Forge giữ SQLite; Redis cho mã OTP, rate limit và broker Celery.

## Quyết định

Chọn (3).

- `database/mysql/01_schema.sql` là nguồn sự thật; `src/services/vehicsim/tables.py`
  mirror bằng SQLAlchemy Core (không ORM). Test dựng lại schema trên SQLite RAM.
- **Biến thể = `scenario_versions`** (nguồn `GENERATED`, `parent_version_id` trỏ bản
  gốc). Không có bảng biến thể riêng, không lưu min/max/step; không bước duyệt kịch bản.
- Mã 6 số (đăng ký, quên mật khẩu) lưu **HMAC trong Redis** có TTL, không lưu MySQL.
- Run chạy qua **Celery + Redis** (`vehicsim.simulation`); `VEHICSIM_RUN_MODE=inline` cho test.

## Lý do

- Không làm vỡ Forge đang chạy (demo, CI, dữ liệu thư viện) trong lúc dựng VehicSim.
- Ràng buộc quan trọng (một BASELINE mỗi hệ, run regression ép cùng biến thể + seed,
  nguồn `GENERATED` ⇔ có bản gốc) được **DB** thực thi bằng UNIQUE/FK/CHECK, không chỉ code.
- Mã OTP ngắn hạn, dùng một lần: Redis TTL hợp hơn bảng MySQL phải dọn.

## Hệ quả

- Hai kho dữ liệu song song; báo cáo đang ghi PostgreSQL — phải thống nhất (TD-03).
- Chưa có migration: đổi schema phải sửa SQL + `tables.py` cùng PR và `ALTER` tay
  trên DB đang chạy (TD-02).
- Máy dev cần Docker (MySQL, Redis) — `scripts/dev-up.cmd` bật sẵn.
- Máy kiểm: `test_python_parameter_seed_matches_sql_seed`, các test trong
  `tests/test_api/test_auth.py`.
