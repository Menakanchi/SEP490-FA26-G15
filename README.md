# VehicSim (VSOS) — SEP490-FA26-G15

Nền tảng web mô phỏng, kiểm thử và tối ưu **AEB** (phanh khẩn cấp tự động) và **FCW** (cảnh báo va
chạm phía trước). Vòng khép kín của MVP:

> Mô tả bằng tiếng Việt → Scenario IR → sinh biến thể → mô phỏng baseline → phân tích lỗi
> (Perception / Decision / Control / Dynamics) → AEB candidate → regression cùng seed →
> **kỹ sư Accept/Reject**

Mô phỏng chạy bằng bộ động học tất định (máy nào cũng chạy) hoặc CARLA sau cùng một hợp đồng JSON.
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

Tài khoản và dữ liệu mẫu (backend đang chạy):

```bash
python scripts/create_admin.py --email admin@example.com --seed     # --role MANAGER cho người quản lý workspace
```

Database MySQL dựng từ `database/mysql/01_schema.sql` ở lần đầu; DB đã có thì nâng bằng file trong
`database/mysql/migrations/` (không `docker compose down -v`).

## Kiểm tra

```bash
make check                                   # = ba cổng của CI: Java, worker, frontend
./mvnw clean test                            # backend (không cần Docker)
python -m pytest worker/tests -q             # lõi mô phỏng
cd frontend && npm run lint && npx tsc --noEmit && npx next build
```

Test Java và worker không cần Docker, CARLA hay khoá LLM; test Java dùng máy chủ giả thay cho LLM thật.
`tests/` chỉ còn tài sản kiểm bộ sinh OpenSCENARIO (`test_openscenario/`, `schemas/`), chờ port sang Java (TD-27) — không nằm trong CI.

## Cấu trúc

```
src/main/java/com/vehicsim/
  controller/ service/ security/ config/   xác thực: đăng ký / quên mật khẩu bằng OTP, JWT
  vehicsim/                                vòng AEB: FamilyService, RunService, RegressionService, ViewsService,
                                           DescribeService (câu mô tả -> Scenario IR), LlmService (cửa duy nhất tới LLM)
worker/                run_variant.py (JSON -> CARLA), kinematic_sim.py, vehicsim_core/ (AEB, bộ động học, luật chấm)
frontend/              Next.js 16 — app/ (Tổng quan, kịch bản, AEB, phân tích, kiểm định, hồ sơ)
database/mysql/        01_schema.sql (29 bảng) + migrations/
docs/                  vehicsim/ (kiến trúc, từ điển dữ liệu), adr/, exec-plans/
```

Bộ sinh OpenSCENARIO (`.xosc`) chưa port sang Java (TD-27); mã cũ ở `src_python_backup/` (git bỏ qua).

## Tài liệu

- [AGENTS.md](AGENTS.md) — bản đồ repo và luật không được phá (đọc trước)
- [Kiến trúc VehicSim](docs/vehicsim/architecture.md) · [Từ điển dữ liệu](docs/vehicsim/database-schema.md)
- [ADR](docs/adr/README.md) · [Việc đã làm](docs/exec-plans/completed/) · [Nợ kỹ thuật](docs/exec-plans/tech-debt-tracker.md)
- [CLAUDE.md](CLAUDE.md) — bẫy khi chạy CARLA / ScenarioRunner thật

Repo dựng lên từ Scenario Forge (dự án AI20K RAV-03); phần Forge đã gỡ ngày 04/10/2026 (ADR-032),
lịch sử còn trong git.
