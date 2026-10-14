# Exec plan — Port backend FastAPI → Spring Boot: auth người dùng + `/api/v1/vehicsim/*` (ADR-039)

**Trạng thái:** xong 14/10/2026 · **Người làm:** TrungDQ (nhánh `trungdam`)

## Mục tiêu

Frontend Next.js chạy được với backend Java mà không đổi hợp đồng API: đăng ký / đăng nhập / quên mật khẩu / hồ sơ, và đủ 19 route
của vòng MVP (họ kịch bản, chạy mô phỏng, ca lỗi, regression, khuyến nghị, quyết định của Reviewer).

## Đã làm

1. **Auth** (`com.vehicsim.service.AuthService`, `OtpService`, `MailService`, `AuthController`):
   - đăng nhập có giới hạn 10 lần / IP / 15 phút, email lạ vẫn tốn một lần băm (chống dò email theo độ trễ);
   - đăng ký hai bước bằng OTP 6 số (Redis, chỉ lưu HMAC, dùng một lần, tối đa 5 lần sai) và đăng ký một bước;
   - quên mật khẩu bằng OTP, đổi mật khẩu (trả phiên mới), sửa họ tên;
   - `LegacyAwarePasswordEncoder`: hash PBKDF2 cũ vẫn dùng được và được nâng lên BCrypt; JWT có `pwv`; `JWT_SECRET` bắt buộc ở production;
   - lỗi trả `{"detail": …}` bằng tiếng Việt (`ApiExceptionHandler`), 401/403 cũng vậy (`SecurityConfig`).
2. **Swagger UI / OpenAPI 3** (`springdoc`, `/swagger-ui.html`, nút Authorize cho JWT).
3. **Vòng MVP** (`com.vehicsim.vehicsim.*`): `ViewsService` (màn đọc), `FamilyService`, `AebService`, `RunService` (+ worker),
   `RegressionService`, `DescribeService` + `LlmService` (DeepSeek/OpenAI, tool call bắt buộc, tự leo model, đường lui bằng luật),
   `BootstrapService` (`POST /vehicsim/bootstrap`, thay `scripts/seed_vehicsim.py`), `VehicSimController`.
4. **Worker**: lõi tách ra `worker/vehicsim_core/` (ADR-039); `result.json` có thêm khối `evaluation`; test lõi ở `worker/tests/`.
5. **Frontend**: `.env.local` trỏ `NEXT_PUBLIC_API_URL=http://localhost:8001`; trang đăng ký một bước (`/register`).

## Kiểm chứng

| Việc | Kết quả |
|---|---|
| Test Java (`./mvnw clean test`) | 28 test đạt (mật khẩu cũ, JWT/pwv, tách họ tên, làm tròn kiểu Python, mô tả có LLM giả, luật regression, CSV) |
| Test lõi (`python -m pytest worker/tests`) | 59 test đạt, gồm seed tham số ở `BootstrapService.java` khớp `01_schema.sql` |
| Worker mới so với 30 run cũ trong DB | khớp từng khung hình, sự kiện, chuỗi nguyên nhân; chỉ chữ số cuối của vài số thực lệch ~1e-16 |
| Route đọc, Java so với hàm Python cũ trên DB thật (1.380 run) | 71 phép so JSON đều khớp: context, họ, AEB, ca lỗi (lọc + phân trang), chi tiết / playback / bundle của 12 run, regression + khuyến nghị |
| Route ghi, trên bản sao DB | tạo họ 64 biến thể → 64 run xong 6 s qua worker → mỗi run chấm lại bằng Python cũ: 0 lệch; candidate; regression tự chốt (64 cặp, 1 khuyến nghị, seed + bộ mô phỏng trùng baseline); REJECT, ACCEPT (baseline cũ → ARCHIVED, đúng một BASELINE); các nhánh 400 / 403 |
| Bước mô tả | bằng luật: 10/10 câu khớp Python; bằng LLM thật (`gpt-5.4-mini`): 1 lượt, ~3 s, ~0,0013 USD |
| DB trống (nạp `01_schema.sql`) | đăng ký → nâng ADMIN → `POST /vehicsim/bootstrap` → tạo họ → 4 run xong |
| Frontend thật (Chrome headless, đăng nhập bằng giao diện) | 14 trang VehicSim, 0 lỗi API |

Chưa kiểm: gửi email OTP qua SMTP thật (khi thử đã tắt SMTP, mã ra log ngoài production); chạy CARLA thật qua `VEHICSIM_CARLA_COMMAND`
(cùng đường tiến trình con với bộ động học nhưng chưa có CARLA để chạy).

## Việc còn lại

Xem TD-33 → TD-38 ở [tech-debt-tracker](../tech-debt-tracker.md).
