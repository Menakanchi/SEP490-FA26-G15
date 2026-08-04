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

Yêu cầu: Python 3.11 cho backend.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn src.main:app --reload --port 8000
```

Kiểm tra:

```bash
ruff check src/ tests/
ruff format --check src/ tests/
pytest tests/ -v --cov=src --cov-report=term-missing --cov-fail-under=60
```

Endpoint đang có trong source hiện tại:

```text
GET  /health
POST /api/v1/chat      placeholder từ template
GET  /api/v1/status
```

Các API generate/review/download/job trong kiến trúc mục tiêu chưa được ship.

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
