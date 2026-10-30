# VehicSim (VSOS) — SEP490-FA26-G15

Nền tảng web mô phỏng, kiểm thử và tối ưu **AEB** (phanh khẩn cấp tự động) và **FCW** (cảnh báo va
chạm phía trước). Vòng khép kín của MVP:

> Mô tả bằng tiếng Việt → Scenario IR → sinh biến thể → mô phỏng baseline → phân tích lỗi
> (Perception / Decision / Control / Dynamics) → AEB candidate → regression cùng seed →
> **kỹ sư Accept/Reject**

Mô phỏng chạy bằng bộ động học tất định hoặc CARLA. Web xuất OpenSCENARIO `.xosc` và chạy ScenarioRunner 0.9.16
qua controller dùng chung lõi AEB; JSON vẫn là giao tiếp nội bộ để lưu kết quả và giữ seed/source.
Khuyến nghị dựa trên mô phỏng — không thay thế kiểm thử vật lý hay chứng nhận an toàn.

## Chạy local

Cần: Docker Desktop, JDK 21, Python ≥ 3.10 (worker mô phỏng), Node.js 20+.

```bash
cp .env.example .env          # điền khoá LLM, SMTP; JWT_SECRET bắt buộc ở production
cd frontend && npm ci && cd ..
```

**Windows:** `scripts\dev-up.cmd` bật MySQL + Redis (Docker), backend `http://localhost:8001`
(Swagger: `/swagger-ui.html`), frontend `http://localhost:3000` — mỗi dịch vụ một cửa sổ.

**Thủ công:**

```bash
docker compose up -d mysql redis
./mvnw spring-boot:run                                          # backend :8001, đọc .env
cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev
```

**Cả backend trong Docker:** `docker compose up -d --build backend` (image Java 21 + python3 cho worker).

**CARLA 0.9.16 trên Windows:** chuẩn bị `C:\Carla_package`, Python 3.12 rồi chạy:

```powershell
.\scripts\setup-carla.ps1                 # một lần: venv riêng + ScenarioRunner v0.9.16
.\scripts\dev-carla.ps1 -RestartBackend  # chọn profile .xosc và bật ứng dụng local
```

Vào **Phân tích → Dữ liệu CARLA** để chọn họ, chạy, theo dõi trạng thái và xem ảnh/cảm biến; nút **Tải .xosc** có ở
chi tiết lượt chạy và phát lại. [Hướng dẫn CARLA local](docs/vehicsim/carla-local.md).

Tài khoản và dữ liệu mẫu (backend đang chạy):

```bash
java -cp target/classes scripts/CreateAdmin.java --email admin@example.com --seed     # --role MANAGER cho người quản lý workspace
```

Database MySQL dựng từ `database/mysql/01_schema.sql` ở lần đầu; DB đã có thì nâng bằng file trong
`database/mysql/migrations/` (không `docker compose down -v`).

## Kiểm tra

```bash
make check                                   # = ba cổng của CI: Java, worker, frontend
./mvnw clean test                            # backend (không cần Docker)
python -m pytest worker/tests -q             # adapter CARLA (cần mvnw compile cho test cầu nối)
cd frontend && npm run lint && npx tsc --noEmit && npx next build
```

Test Java và worker không cần Docker, CARLA hay khoá LLM; test Java dùng máy chủ giả thay cho LLM thật.
`tests/` giữ đặc tả/golden của converter Forge cũ và XSD. Bộ sinh CP_CROSSING mới được kiểm trong `XoscExportTest`
và `OpenScenarioSchemaTest` (Java), đều chạy trong CI.

## Cấu trúc

```
src/main/java/com/vsos/                  quy tắc gói: docs/vehicsim/quy-tac-dat-ten.md
  backend/<tầng>/<chức năng>/              controller, service, repository, entity, dto, exception theo chức năng
                                           (auth, workspace, scenario, simulation, analysis, aeb, optimization, regression…);
                                           config/ security/ common/ dùng chung; LlmService (cửa duy nhất tới LLM) ở service/common
  core/                                    lõi AEB (aeb/), bộ động học (simulation/), luật chấm (evaluation/), .xosc (xosc/),
                                           cầu nối (bridge/), MOBO (mobo/) — chỉ dùng JDK; ADR-042
worker/                run_xosc.py, vehicsim_aeb_control.py, sensor_recorder.py — adapter CARLA, không chứa logic AEB
frontend/              Next.js 16 — app/ (Tổng quan, kịch bản, AEB, phân tích, kiểm định, hồ sơ)
database/mysql/        01_schema.sql (29 bảng) + migrations/
docs/                  vehicsim/ (kiến trúc, từ điển dữ liệu), adr/, exec-plans/
```

Bộ sinh `.xosc` CP_CROSSING chạy ở worker, chỉ dùng thư viện chuẩn; mã converter Forge cũ vẫn chỉ để đối chiếu trong lịch sử git.

## Tài liệu

- [AGENTS.md](AGENTS.md) — bản đồ repo và luật không được phá (đọc trước)
- [Kiến trúc VehicSim](docs/vehicsim/architecture.md) · [Từ điển dữ liệu](docs/vehicsim/database-schema.md)
- [ADR](docs/adr/README.md) · [Việc đã làm](docs/exec-plans/completed/) · [Nợ kỹ thuật](docs/exec-plans/tech-debt-tracker.md)
- [CLAUDE.md](CLAUDE.md) — bẫy khi chạy CARLA / ScenarioRunner thật

Repo dựng lên từ Scenario Forge (dự án AI20K RAV-03); phần Forge đã gỡ ngày 04/10/2026 (ADR-032),
lịch sử còn trong git.
