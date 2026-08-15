# Scenario Forge (RAV-03)

Scenario Forge nhận mô tả tiếng Việt về một tình huống giao thông nguy hiểm và
sinh file **OpenSCENARIO 1.0 (`.xosc`)** để kỹ sư review, tải về và tuỳ chọn kiểm
chứng bằng CARLA ScenarioRunner.

> Trạng thái hiện tại: repo đã có data contracts, fixtures, routing logic, CI và
> một CARLA smoke test. Workflow AI, converter, retrieval, review API, frontend
> và worker vẫn đang được triển khai. Xem [trạng thái chi tiết](ARCHITECTURE.md#trạng-thái-hiện-tại).

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

## Workflow mục tiêu

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
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

python scripts/init_db.py     # dựng schema từ database rỗng
python scripts/seed_db.py     # nạp 10 kịch bản mẫu để retrieval có gì mà tìm

uvicorn src.main:app --reload --port 8000
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

GET  /api/v1/internal/jobs                  worker GPU poll
POST /api/v1/internal/jobs/{job_id}/result
```

Lưu ý: `POST /generate` hiện chạy một stub thay cho workflow đầy đủ — nó gọi
thật `parse_intent` và `retrieve`, phần còn lại là giả lập cho tới khi
`repair_draft` (#22) xong và 7 node được nối thành một graph.

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
worker/                 GPU worker, Python 3.10 — chưa có implementation
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

Smoke test này chưa chứng minh converter tự động, RAG, LLM workflow hay toàn bộ
maneuver đã hoạt động end-to-end.

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
