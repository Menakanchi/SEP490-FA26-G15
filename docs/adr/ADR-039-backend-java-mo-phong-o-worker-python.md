# ADR-039 — Backend Java (Spring Boot) cho API; mô phỏng và chấm điểm ở lại worker Python

**Trạng thái:** Proposed 14/10/2026 (TrungDQ, nhánh `trungdam`; code + kiểm chứng ở
[exec plan 14/10](../exec-plans/completed/2026-10-14-port-backend-java.md))
**Phạm vi:** thay phần "FastAPI + Celery" của kiến trúc VehicSim (ADR-023 → ADR-038). Không đổi schema, hợp đồng JSON
của worker (ADR-027), 5 role (ADR-035) hay luật regression.

## Bối cảnh

Nhóm chuyển backend từ FastAPI sang Spring Boot (Java 21; `pom.xml`, `src/main/java/com/vehicsim`). Việc chuyển này chưa có
ADR. Khi port các route `/api/v1/vehicsim/*` phải quyết **AEB và bộ mô phỏng nằm ở đâu**, vì luật cứng số 8 của
[AGENTS.md](../../AGENTS.md) là *một AEB cho mọi bộ mô phỏng*: bộ động học và runner CARLA phải kiểm thử cùng một AEB, rồi
`evaluation` chấm cả hai bằng cùng một luật. Thêm nữa, nhiễu perception lấy từ `random.Random(seed)` của Python
(Mersenne Twister + `gauss` của Python); Java không tái lập được chuỗi này, nên cùng seed sẽ ra kết quả khác.

## Lựa chọn

1. Viết lại AEB + bộ động học + luật chấm bằng Java — loại: hai bản AEB (Java và Python cho CARLA) sẽ lệch nhau, nhiễu theo seed
   không còn khớp 1.380 run đã lưu, và regression không còn so được run cũ với run mới.
2. **Java lo REST, nghiệp vụ, lưu trữ; mô phỏng + chấm điểm chạy ở `worker/` Python qua hợp đồng JSON đã có
   (bundle → `result.json`)** — chọn.

## Quyết định

- Lõi mô phỏng (`aeb_stack`, `simulator`, `evaluation`, `bundle`) nằm ở `worker/vehicsim_core/`: **chỉ thư viện chuẩn, Python
  ≥ 3.10**, để venv CARLA import thẳng. Backend Java không có bản AEB nào.
- Java gọi `worker/kinematic_sim.py` (hoặc `VEHICSIM_CARLA_COMMAND`) như **tiến trình con có timeout**; `result.json` nay
  mang thêm khoá `evaluation` (kết quả chấm của lõi), Java ghi thẳng vào `simulation_runs` / `failures` / `root_causes` —
  không chấm lại bằng một bản luật thứ hai.
- Hàng đợi chạy nền là thread pool của Spring (CARLA: 1 luồng) thay Celery; run PENDING/RUNNING bỏ dở được nhặt lại khi
  khởi động. Run chỉ được nhận bằng `UPDATE … WHERE status = 'PENDING'` nên hai backend dùng chung DB không chạy đôi.
- Mật khẩu: hash cũ của backend Python (`salt:pbkdf2`) vẫn đăng nhập được và được băm lại thành BCrypt ở lần đăng nhập đúng.
  JWT mang `pwv` (dấu vân tay mật khẩu) để đổi mật khẩu làm mọi token cũ hết hiệu lực — như backend cũ.

## Hệ quả

- `src_python_backup/` (bản FastAPI cũ) chỉ còn để đối chiếu; không import từ đó.
- Bộ test Python của backend cũ (`tests/test_api`, `test_services`, `test_vehicsim/*` dùng DB…) không còn chạy được;
  test của lõi nằm ở `worker/tests/`, test Java ở `src/test/java`.
- Chưa có lọc project theo workspace (TD-30 giữ nguyên) và chưa nối bộ sinh OpenSCENARIO (TD-27; mã nằm ở `src_python_backup`).
