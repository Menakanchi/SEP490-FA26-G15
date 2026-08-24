# Scenario Forge (RAV-03)

Scenario Forge nhận mô tả tiếng Việt về một tình huống giao thông nguy hiểm và
sinh file **OpenSCENARIO 1.0 (`.xosc`)** để kỹ sư review, tải về và kiểm chứng
bằng CARLA ScenarioRunner trước khi đưa vào thư viện.

> Trạng thái ngày 24/08/2026: đường đi đầy đủ đã chạy — bảy node, converter,
> retrieval, hai cổng review, frontend, campaign ODD, behavior checker và GPU
> worker CARLA. Báo cáo M1/M2/M3 được tính trực tiếp từ dữ liệu thực thi. Phạm
> vi converter hiện là 72/560 ô ODD — năm maneuver xe trên anchor `highway` và
> `run_red_light` trên anchor `urban_straight`, cho ba loại xe qua bốn kiểu thời
> tiết; `jaywalk` đã được loại khỏi phạm vi vì không phù hợp anchor Town04
> ([ADR-016](docs/adr/ADR-016-pham-vi-converter-mot-anchor-da-kiem-chung.md)).
> Sáu oracle L4 trong phạm vi đều đã có. Closed-loop với CARLA BehaviorAgent đã
> có trên nhánh `feature/closed-loop`: job đánh giá tách khỏi job xác minh, mỗi
> lần chạy một cặp baseline/BehaviorAgent mới; UI kiểm tốc độ đầu rồi so số
> phanh/khe hở/giảm tốc. Closed-loop dừng có chủ đích ở cặp A/B do con người
> khởi động; vòng tự sinh nhiều thế hệ nằm ngoài phạm vi. Benchmark online 20
> request cho generation workflow đo p50/p95 latency **2,766/4,152 s** và
> cost/request **$0,002304/$0,004582**; 17/20 request hoàn tất và request lỗi
> vẫn nằm trong mẫu số. Xem
> [ADR-021](docs/adr/ADR-021-danh-gia-controller-tach-khoi-xac-minh-kich-ban.md)
> và [ADR-022](docs/adr/ADR-022-closed-loop-dung-o-cap-ab-co-nguoi-khoi-dong.md),
> [báo cáo đánh giá](eval/results/report.md) và
> [artifact benchmark](eval/results/cost_latency_2026-08-24.json).

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
chí đánh giá theo OpenSCENARIO. Web vẫn sinh và cho tải file khi GPU worker đang
offline; tuy nhiên kịch bản chỉ vào thư viện sau khi có kết quả CARLA và qua
`BEFORE_LIBRARY`.

## Workflow

```text
parse_intent
  → retrieve
  → generate_draft
  → validate ↔ repair_draft
  → convert_xosc
  → persist_pending_sim_review
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

### Một lệnh chạy demo

Sau khi đã tạo `.env`, lệnh mặc định dựng backend, frontend, CARLA có render,
camera bám xe và GPU worker. Nó tái sử dụng service đang chạy và khi nhấn
`Ctrl+C` chỉ dừng process do chính lệnh đó tạo:

```bash
make demo
```

Máy không có CARLA/GPU vẫn demo được luồng sinh, review và thư viện:

```bash
make demo-web
```

Kiểm dependency và đường dẫn mà chưa khởi động gì:

```bash
make demo-check
```

Log của từng service được giữ trong một thư mục
`/tmp/scenario-forge-demo.*` và in ra khi lệnh khởi động.

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
GET  /api/v1/scenarios/{id}/xosc            tải XML để kiểm tra từ Cổng 1
PUT  /api/v1/scenarios/{id}/tags            thay toàn bộ tag

POST /api/v1/campaigns                      sinh một batch phủ các ô ODD đã chọn
POST /api/v1/campaigns/{id}/review          duyệt batch trước khi chạy GPU
GET  /api/v1/metrics/quality                báo cáo M1/M2/M3 từ dữ liệu thật
GET  /api/v1/metrics/intent-agreement       mức khớp giữa behavior checker và người
GET  /api/v1/library/audit                  rà lại kho theo luật hiện tại

GET  /api/v1/internal/jobs                  worker GPU poll
POST /api/v1/internal/jobs/{job_id}/result  ghi kết quả và mở BEFORE_LIBRARY
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
