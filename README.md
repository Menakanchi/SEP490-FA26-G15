# VehicSim (VSOS) — SEP490-FA26-G15

Nền tảng web mô phỏng, kiểm thử và tối ưu **AEB** (phanh khẩn cấp tự động) và **FCW** (cảnh báo va
chạm phía trước). Vòng khép kín của MVP:

> Mô tả bằng tiếng Việt → Scenario IR → sinh biến thể → mô phỏng baseline → phân tích lỗi
> (Perception / Decision / Control / Dynamics) → AEB candidate → regression cùng seed →
> **kỹ sư Accept/Reject**

Mô phỏng chạy bằng bộ động học tất định (máy nào cũng chạy) hoặc CARLA sau cùng một hợp đồng JSON.
Khuyến nghị dựa trên mô phỏng — không thay thế kiểm thử vật lý hay chứng nhận an toàn.

## Chạy local

Cần: Docker Desktop, [uv](https://docs.astral.sh/uv/), Node.js 20+.

```bash
cp .env.example .env          # điền khoá LLM, SMTP; JWT_SECRET_KEY bắt buộc ở production
uv sync --locked
cd frontend && npm ci && cd ..
```

**Windows:** `scripts\dev-up.cmd` bật MySQL + Redis (Docker), Celery worker, backend
`http://localhost:8001`, frontend `http://localhost:3000` — mỗi dịch vụ một cửa sổ.

**Thủ công:**

```bash
docker compose up -d mysql redis
uv run celery -A src.celery_app worker --pool=solo -Q vehicsim.simulation   # hoặc VEHICSIM_RUN_MODE=inline
uv run uvicorn src.main:app --reload --port 8001
cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev
```

Tài khoản và dữ liệu mẫu:

```bash
uv run python scripts/create_admin.py --email admin@example.com          # --role EXPERT cho chuyên gia
uv run python scripts/seed_vehicsim.py --owner admin@example.com --demo
```

Database MySQL dựng từ `database/mysql/01_schema.sql` ở lần đầu; DB đã có thì nâng bằng file trong
`database/mysql/migrations/` (không `docker compose down -v`).

## Kiểm tra

```bash
make check                                   # ruff + format + pytest (giống CI)
cd frontend && npm run lint && npx tsc --noEmit && npx next build
```

Test không cần Docker (SQLite RAM + Redis giả) và chặn mọi lời gọi LLM thật trừ khi `RUN_LLM_TESTS=1`.

## Cấu trúc

```
src/
  api/                 vehicsim_routes.py, auth_routes.py  (chỉ đổi lỗi -> HTTP)
  services/vehicsim/   vòng AEB: family, runs, simulator, aeb_stack, evaluation, regression,
                       views; Meomeo Agent (assistant, agent_tools, knowledge, guardrails)
  services/auth/       đăng ký/quên mật khẩu bằng mã OTP, JWT
  services/openscenario/  bộ sinh OpenSCENARIO 1.0 (.xosc), chưa nối API
  services/llm.py      cửa duy nhất tới LLM (OpenAI / DeepSeek)
worker/                run_variant.py (JSON -> CARLA), kinematic_sim.py, follow_hero.py
frontend/              Next.js 16 — app/ (Tổng quan, kịch bản, AEB, phân tích, kiểm định, hồ sơ)
database/mysql/        01_schema.sql (36 bảng) + migrations/
docs/                  vehicsim/ (kiến trúc, từ điển dữ liệu), adr/, exec-plans/
```

## Tài liệu

- [AGENTS.md](AGENTS.md) — bản đồ repo và luật không được phá (đọc trước)
- [Kiến trúc VehicSim](docs/vehicsim/architecture.md) · [Từ điển dữ liệu](docs/vehicsim/database-schema.md)
- [ADR](docs/adr/README.md) · [Việc đã làm](docs/exec-plans/completed/) · [Nợ kỹ thuật](docs/exec-plans/tech-debt-tracker.md)
- [CLAUDE.md](CLAUDE.md) — bẫy khi chạy CARLA / ScenarioRunner thật

Repo dựng lên từ Scenario Forge (dự án AI20K RAV-03); phần Forge đã gỡ ngày 04/10/2026 (ADR-032),
lịch sử còn trong git.
