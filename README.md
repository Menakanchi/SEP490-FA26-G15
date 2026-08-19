# Scenario Forge (RAV-03)

Scenario Forge nhận mô tả tiếng Việt về một tình huống giao thông nguy hiểm và
sinh file **OpenSCENARIO 1.0 (`.xosc`)** để kỹ sư review, tải về và tuỳ chọn kiểm
chứng bằng CARLA ScenarioRunner.

> Trạng thái hiện tại: đường đi đầy đủ đã chạy — bảy node, converter, retrieval,
> review API hai cổng, frontend và GPU worker (chạy thật trên CARLA ngày
> 15/08/2026). Chưa có: behavior checker, agent layer closed-loop, và báo cáo
> M1/M2/M3 bằng số trên tập lớn. Phạm vi converter còn 76/560 ô ODD — chỉ
> `highway` ([ADR-016](docs/adr/ADR-016-pham-vi-converter-mot-anchor-da-kiem-chung.md)).
> Xem [trạng thái chi tiết](ARCHITECTURE.md#trạng-thái-hiện-tại).

## Input và output

**Input**

```text
Xe máy chạy từ phía sau, vượt lên, tạt đầu ô tô rồi phanh gấp.
```

**Output chính**

```text
scenario.xosc
```

File `.xosc` mô tả actors, vị trí, tốc độ, actions, triggers, thời tiết và tiêu
chí đánh giá theo OpenSCENARIO. CARLA là tầng kiểm chứng tuỳ chọn; web vẫn phải
sinh và cho tải file khi GPU worker đang offline.

## Workflow

```text
parse_intent
  → retrieve
  → generate_draft
  → validate ↔ repair_draft
  → convert_xosc
  → persist_pending_review
```

- LLM chỉ tham gia `parse_intent`, `generate_draft` và `repair_draft`.
- Thứ tự, nhánh lỗi và trần ba vòng repair do code quyết định.
- LLM sinh `ScenarioDraft`, không sinh thẳng XML.
- Backend cấp `scenario_id`, giữ nguyên câu gốc rồi tạo `ScenarioSpec`.
- Converter deterministic biến `ScenarioSpec` thành `.xosc`.
- Review và CARLA simulation là các HTTP transaction sau workflow, không phải
  node đứng chờ trong RAM.

## Kiến trúc

- [Kiến trúc, sơ đồ và contracts](ARCHITECTURE.md)
- [Architecture Decision Records](docs/adr/README.md)
- [Golden fixtures và CARLA smoke test](fixtures/README.md)

Nguồn sự thật:

- Hình dạng dữ liệu: `src/models/schemas.py`
- Quyết định kiến trúc: `docs/adr/`
- Tiến độ và ownership: GitHub Issues/Project
- Bằng chứng thực thi: tests, `eval/`, `JOURNAL.md`, `WORKLOG.md`

## Quick start

Yêu cầu: Python 3.11+ cho backend, Node 20+ cho frontend.

```bash
uv sync --locked
cp .env.example .env

uv run python scripts/init_db.py     # dựng schema từ database rỗng
uv run python scripts/seed_db.py     # nạp 10 kịch bản mẫu để retrieval có gì mà tìm

uv run uvicorn src.main:app --reload --port 8000
```

Frontend chạy riêng ở cổng 3000, mặc định gọi backend qua
`http://localhost:8000/api/v1` (đổi bằng `NEXT_PUBLIC_API_URL`; backend đã cho
phép origin `localhost:3000` sẵn qua `cors_origins`):

```bash
cd frontend
npm ci
npm run dev
```

Cài hook một lần sau khi clone. Nó chạy gate lint/test trước mỗi lần push, nên
lỗi bị chặn ở máy thay vì chờ một vòng CI:

```bash
bash scripts/setup_hooks.sh                                   # macOS / Linux / Git Bash
powershell -ExecutionPolicy Bypass -File scripts/setup_hooks.ps1   # Windows
```

Chạy tay đúng những gì gate chạy:

```bash
make check                    # ruff check + ruff format --check + pytest
cd frontend && npm run lint && npx next build
```

Cần push gấp khi gate đỏ: `SKIP_CHECK=1 git push`.

### Endpoint đang có

```text
GET  /health

POST /api/v1/generate                       (alias: /api/v1/scenarios/generate)
GET  /api/v1/status/{request_id}
POST /api/v1/review                         (alias: /api/v1/scenarios/{id}/review)
GET  /api/v1/scenarios                      (alias: /api/v1/library/search)
GET  /api/v1/scenarios/{id}
GET  /api/v1/scenarios/{id}/xosc            403 nếu chưa duyệt BEFORE_LIBRARY
POST /api/v1/scenarios/{id}/request-sim     mở cổng BEFORE_SIM, KHÔNG chạy CARLA
PUT  /api/v1/scenarios/{id}/tags            thay toàn bộ tag

GET  /api/v1/internal/jobs                  worker GPU poll
POST /api/v1/internal/jobs/{job_id}/result  đặt VerificationLevel cho kịch bản
```

`POST /generate` chạy graph thật, không còn stub: nó trả `request_id` ngay rồi
chạy bảy node nền, client poll `GET /status/{request_id}` cho tới `done|failed`.

## Cấu trúc chính

```text
src/
├── agents/             state, routing, graph và nodes
├── api/                FastAPI routes
├── models/schemas.py   data contracts
└── services/           LLM và business logic

fixtures/               specs, invalid drafts, execution results, golden .xosc
tests/                  unit, contract và architecture tests
docs/adr/               lý do cho các quyết định quan trọng
eval/                   evaluation evidence
presentation/           pitch deck và demo material
worker/                 GPU worker pull-based, Python 3.10
```

## Ranh giới quan trọng

1. `src/` không `import carla`; CARLA chỉ nằm ở worker GPU riêng.
2. `ScenarioSpec` độc lập simulator, không chứa blueprint hay toạ độ CARLA.
3. Transactional store là nguồn thật cho scenario/review/job; embedding nằm cùng `.db` dưới dạng BLOB và chỉ phục vụ retrieval qua `Retriever` (ADR-013). MVP dùng SQLite, PostgreSQL chỉ là phương án nâng cấp khi cần.
4. Chỉ scenario được người chịu trách nhiệm duyệt mới vào thư viện few-shot.
5. Structured validation và static validation chạy được không cần GPU.

## CARLA smoke test

Ngày 31/07/2026, fixture `fixtures/xosc/sample_001_cut_in.xosc` đã được
ScenarioRunner 0.9.15 chạy với CARLA 0.9.15 server trên Windows và client WSL2
Python 3.10. Kết quả xác nhận toolchain và `RelativeLanePosition` hoạt động,
đồng thời phát hiện các khác biệt giữa chuẩn OpenSCENARIO và parser của
ScenarioRunner. Chi tiết ở [ADR-012](docs/adr/ADR-012-converter-dung-relativelaneposition.md).

Smoke test này chạy fixture viết tay nên chưa chứng minh converter tự động.
Bằng chứng đó có ngày 15/08/2026: `sc_014` do LLM sinh và converter biên dịch đã
đi qua cả hai cổng duyệt rồi chạy trọn vòng trên worker. Kết quả `CollisionTest =
SUCCESS` — 0 va chạm, tức kịch bản chạy trót lọt mà **không** dựng được nguy
hiểm nào; đường ống thông không có nghĩa kịch bản đáng giá.

## Deliverables

- Source code và CI
- README và architecture
- AI usage logs
- Live URL
- Demo video và pitch deck
- `JOURNAL.md` và `WORKLOG.md`
- Evaluation report trong `eval/results/`

## License

MIT
