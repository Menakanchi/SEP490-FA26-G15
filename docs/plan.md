# RAV-03 Scenario Forge — Plan

## §1. Mục tiêu và phạm vi

Web tool nhận mô tả tiếng Việt về tình huống giao thông nguy hiểm, sinh file **OpenSCENARIO 1.0 (`.xosc`)**, cho reviewer duyệt, lưu vào thư viện có gắn nhãn, tuỳ chọn chạy kiểm chứng bằng **CARLA ScenarioRunner**.

Ràng buộc chính:

- Luồng xử lý **cố định**: `guardrails → parse_intent → retrieve → generate_draft → validate ↔ repair_draft → convert_xosc → persist_pending_review`. `validate` là điểm rẽ nhánh duy nhất *trong graph*: đạt thì đi tiếp; lỗi **sửa được** thì `repair_draft` rồi kiểm lại, tối đa 3 vòng; **bất kỳ** lỗi nào không sửa được (guardrail, provider, converter, DB) thì dừng ngay chứ không đốt hết 3 vòng; hết lượt vẫn lỗi thì kết thúc với lý do rõ ràng. Thứ tự do code quyết, không phải LLM — §3. Có **một** cửa chặn ngay sau `parse_intent` (không sớm hơn được — phải có `ODDQuery` thì mới biết thiếu gì): câu thiếu hẳn `actor_type`/`maneuver`, hoặc tổ hợp ODD nằm ngoài phạm vi converter hỗ trợ, thì trả `422` kèm gợi ý tương thích. Tốn đúng một LLM call rẻ thay vì đi hết `retrieve → generate → repair` cho thứ biết trước là không dựng được.
- LLM chỉ sinh `ScenarioDraft`; `scenario_id` và `description_vi` do backend cấp khi promote sang `ScenarioSpec` — `schemas.py`.
- Sau `persist_pending_review`, scenario ở trạng thái `pending_review` và **graph kết thúc** — không đứng chờ người trong RAM (Render free tier ngủ khi không có request). Hai cổng duyệt là hai HTTP transaction riêng, không phải node: cổng 1 duyệt trước khi vào library/tải `.xosc`; cổng 2 là chính sách đội bổ sung trước khi gửi job chạy CARLA.
- **Sản phẩm chính là file `.xosc` tải được từ Live URL sau khi qua cổng 1.** CARLA là tầng kiểm chứng, không phải điều kiện để web hoạt động.
- Backend cloud **không bao giờ** `import carla`. Worker GPU là process riêng, pull job qua HTTP.
- **HITL theo đề bài:** reviewer duyệt trước khi scenario vào bộ test chính thức. **Chính sách đội bổ sung:** duyệt thêm một lần trước khi chạy simulation để kiểm soát job GPU.
- Chỉ dùng dữ liệu mô phỏng/công khai. Không đưa dữ liệu cá nhân thật vào hệ thống.
- **W6 feature freeze.** Phần cơ bản + đủ deliverables xong trước, rồi mới tới ba hạng mục nâng cao theo thứ tự rẻ trước đắt sau: *Tiết kiệm LLM* (W3–4) → *Phủ ODD* (W4) → *Săn lỗi xe tự hành* (W5).

Nhãn dùng trong tài liệu:

- **[Đề bắt buộc]**: yêu cầu có trong RAV-03.
- **[Quyết định kiến trúc]**: cách đội chọn để đáp ứng yêu cầu.
- **[Target nội bộ]**: ngưỡng đội tự đặt, phải hiệu chỉnh sau baseline.
- **[Giả định cần kiểm chứng]**: chỉ được trình bày như số thật sau khi có đo đạc hoặc nguồn.

### Truy vết yêu cầu

| Yêu cầu | Cách đáp ứng | Acceptance test | Bằng chứng |
|---|---|---|---|
| **[Đề bắt buộc]** Tiếng Việt → file CARLA | `ScenarioSpec` → converter → `.xosc` | ScenarioRunner parse được file; file tải được sau cổng 1 | fixture `.xosc` + test converter + Live URL |
| **[Đề bắt buộc]** Preview | Top-down 2D từ `ScenarioSpec` | Reviewer nhận ra actor, vị trí, hướng, thời tiết và hành vi mà không đọc XML | UI test + user test |
| **[Đề bắt buộc]** Library có tag | Qdrant payload + metadata | Scenario đã duyệt tìm lại được theo tag và ngữ nghĩa | integration test + retrieval eval |
| **[Đề bắt buộc]** Creator/reviewer | Auth + RBAC | Creator tạo/xem; reviewer approve/reject; reject bắt buộc có lý do | API/UI authorization tests |
| **[Đề bắt buộc]** HITL | Trạng thái `pending_review` + cổng 1 | Scenario chưa duyệt không vào library và chưa tải được | state-transition test |
| **[Đề bắt buộc]** Báo cáo validity | `/stats` + script eval chạy lại được | Dashboard khớp kết quả tính từ cùng dataset | `eval/results/report.md` |
| **[Đề nâng cao]** Phủ ODD | Ma trận 4 trục + batch generation | Báo cáo tổng và tách theo từng maneuver | `eval/results/` |
| **[Đề nâng cao]** Tự chạy simulator | Job queue + worker GPU | Job đã qua cổng 2 trả `ExecutionResult` | worker integration evidence |
| **[Đề nâng cao]** Closed-loop | Chạy scenario với ego autopilot | Lọc được scenario làm mô hình lái thất bại | adversarial report |
| **[Đề nâng cao]** Tối ưu chi phí | Cache + model routing + telemetry | So sánh cost/latency trước và sau trên cùng dataset | cost report |

---

## §2. Quyết định cần chốt

**Lý do đầy đủ nằm trong ADR, không nhân đôi ở đây.** Bảng này chỉ trả lời: đã chốt chưa, đọc ở đâu.

| Chủ đề | Chốt là gì | Trạng thái |
|---|---|---|
| **CARLA runtime** | Backend cloud + worker GPU pull-based; `validation_mode = static\|sim` | ✅ [ADR-001](adr/ADR-001-carla-worker-tach-khoi-backend.md) |
| **Python version** | `src/` = 3.11; `worker/` = venv riêng theo wheel CARLA (0.9.15 → 3.7/3.8) | ✅ [ADR-002](adr/ADR-002-python-version-hai-venv.md) — **ô số liệu còn trống** tới khi đo xong wheel |
| **Vector store** | Qdrant, cấu hình qua `pydantic-settings` | ✅ [ADR-003](adr/ADR-003-qdrant-lam-vector-store.md) |
| **Evaluation** | DeepEval cho scenario quality; Recall/MRR/nDCG tự implement cho retrieval | ✅ [ADR-004](adr/ADR-004-deepeval-va-metric-retrieval-tu-implement.md) |
| **Simulator** | Chỉ CARLA/ScenarioRunner. Isaac Sim ngoài phạm vi | ✅ [ADR-005](adr/ADR-005-bo-isaac-sim-khoi-pham-vi.md) |
| **Embeddings** | OpenAI `text-embedding-3-small` cho prod | ✅ [ADR-006](adr/ADR-006-embeddings-openai-thay-vi-sentence-transformers.md) |
| **Vị trí trong spec** | Offset tương đối theo làn, không phải `spawn_index` | ✅ [ADR-010](adr/ADR-010-vi-tri-tuong-doi-theo-lan-thay-vi-spawn-index.md) |
| **Converter phân giải offset?** | **Không** — dùng thẳng `RelativeLanePosition`, ScenarioRunner tự phân giải | ⏳ [ADR-012](adr/ADR-012-converter-dung-relativelaneposition.md) **Proposed** — Accepted khi smoke test `.xosc` chạy được (§11.1b) |
| **Dữ liệu giao dịch** | PostgreSQL lưu user, review, trạng thái scenario và job; Qdrant chỉ phục vụ retrieval | ⚠ Cần ADR-011 trước khi dựng review/job API |
| **Converter** | `src/services/scenario/converter.py` — thuần XML, không phụ thuộc GPU/CARLA | ✅ Đã chốt (hệ quả của ADR-001) |
| **LLM gateway** | Mọi provider đi qua `src/services/llm.py` dùng **LiteLLM** | ✅ Đã chốt → ADR-008 (W4) |

Còn nợ: **ADR-007** workflow vs agent (W2) · **ADR-008** model routing (W4) · **ADR-009** index Qdrant (§9, tuỳ chọn) · **ADR-011** PostgreSQL cho dữ liệu giao dịch — **đang chặn review/job API** · **ADR-012** đã viết, đang `Proposed` — chờ smoke test.

---

## §3. Vì sao dùng workflow AI được điều phối bằng code

Đây là bằng chứng **PLO1 + PLO2** mạnh nhất — mạnh hơn việc dựng thêm tầng. Nội dung đầy đủ nằm ở **ADR-007** (W2); đây là khung lập luận.

Phân loại bằng một câu hỏi vận hành, không bằng cảm tính: ***ai quyết thứ tự bước?***

| Mức | Ai quyết thứ tự | Forge? |
|---|---|:---:|
| **Workflow AI** | Người viết code quyết trước. LLM xử lý các bước cần hiểu và sinh ngôn ngữ | ✅ **đây là Forge** |
| **Agent (ReAct)** | LLM tự quyết mỗi vòng: gọi tool nào, hay dừng. Số bước không biết trước | ❌ |
| **Multi-agent** | Nhiều LLM có vai riêng, đàm phán với nhau, mỗi bên giữ context riêng | ❌ |

**Bài kiểm tra một câu:** *có tình huống nào mà thứ tự bước phải khác đi không?* Với phạm vi hiện tại: **không**. Luôn `parse_intent` trước để rút `ODDQuery`; `retrieve` dùng chính các nhãn đó để kết hợp vector search với payload filter; rồi mới `generate_draft` và `validate`. Thứ tự đã có đáp án ổn định nên để code điều phối sẽ dễ kiểm thử, dự toán chi phí và tìm lỗi hơn.

Vòng `validate → repair` **là** vòng lặp, nhưng điều kiện lặp là code thuần, không có LLM trong đó:

```python
def route_after_validate(issues: list[ValidationIssue], iteration: int) -> str:
    errors = [i for i in issues if i.severity is IssueSeverity.ERROR]
    if not errors:
        return "promote"                       # warning không chặn, reviewer xem ở cổng 1
    if any(not e.repairable_by_llm for e in errors):
        return "failed"                        # MỘT lỗi hệ thống là đủ để dừng
    if iteration >= MAX_REPAIR:                # = 3
        return "failed"                        # trả lỗi có giải thích, không đưa vào review
    return "repair_draft"
```

Bản thật ở `src/agents/routing.py`, test ở `tests/test_agents/test_routing.py`. Chỗ dễ viết sai: điều kiện là **`any`** chứ không phải `all` — sửa được lỗi hình học không làm bug converter biến mất, nên đi repair lúc đó là trả tiền cho ba vòng chắc chắn thất bại.

**Chọn workflow là tốt hơn, không phải làm cho dễ:**

| | Workflow (ta) | ReAct agent |
|---|---|---|
| Số LLM call / scenario | có trần do giới hạn 3 vòng ⇒ đo và đặt target được | khó đặt trần nếu LLM tự chọn số vòng |
| p95 latency | đo được và hiệu chỉnh sau baseline | phụ thuộc số vòng LLM tự chọn |
| Test | mock từng node, assert từng cạnh | phải test cả không gian quỹ đạo |
| Debug | biết chính xác node nào hỏng | phải đọc lại chuỗi suy luận |

Trong phạm vi hiện tại, ReAct không bổ sung năng lực cần thiết nhưng làm cost và latency khó dự đoán hơn. Multi-agent cũng chưa có sub-goal độc lập cần đàm phán. Cả *Phủ ODD* lẫn *Săn lỗi xe tự hành* vẫn là workflow — vòng `for` do code điều khiển.

**Điều kiện để phải đổi ý** (viết luôn vào ADR — đây là thứ làm ADR đáng tin): người dùng hỏi mở kiểu *"tìm giúp tôi lỗ hổng trong bộ scenario hiện có"* khiến hệ thống phải tự chọn thứ tự; hoặc số tool vượt ~10 và việc chọn tool phụ thuộc kết quả tool trước theo cách không liệt kê hết được. Hiện chưa có cái nào.

---

## §4. Hợp đồng tích hợp

Ranh giới module = **ranh giới GPU**.

```text
  src/ (Python 3.11, cloud)              worker/ (Python 3.8, máy có GPU)
  ─────────────────────────              ────────────────────────────────
  ScenarioSpec (JSON)
        │
        ▼  converter.py   ← thuần XML, không GPU
     .xosc (string)  ──── job payload ────►  ghi ra đĩa
                                                   │
                                                   ▼  runner.py
                                            scenario_runner.py --openscenario --json
                                                   │
     ExecutionResult  ◄──── POST kết quả ─────────┘
```

Quy tắc:

- Job payload gửi `xosc_content` (XML string), **không** gửi `ScenarioSpec` ⇒ worker không cần biết schema, bớt một mặt tiếp xúc giữa hai venv.
- `converter.py` test được bằng `pytest` trong CI **không cần CARLA/GPU** ⇒ tính vào mục tiêu coverage ≥60%.
- **`src/models/schemas.py` là single source of truth.** Đổi schema phải cập nhật `fixtures/` + tests **trong cùng PR** — đó mới là phần bắt buộc. Một người chốt, **không cần cả đội duyệt**; ai bị ảnh hưởng thì được báo, không phải được hỏi.
- Không node nào `import openai` trực tiếp — mọi lệnh gọi LLM đi qua `src/services/llm.py`.
- `runner.py` lấy kết quả bằng `--json --outputDir` rồi đọc file, **không parse stdout bằng regex**.

`ExecutionResult` worker trả về:

```json
{
  "scenario_id": "sc_001",
  "xosc_path": "outputs/sc_001.xosc",
  "success": true,
  "criteria_results": [
    {"name": "CollisionTest",      "result": "FAILURE", "actual": "collision at tick 245"},
    {"name": "DrivenDistanceTest", "result": "SUCCESS", "actual": "150m"},
    {"name": "MaxVelocityTest",    "result": "SUCCESS", "actual": "58 km/h"}
  ],
  "metrics": {"total_ticks": 600, "duration_s": 30.0},
  "error": null
}
```

⚠ **Chỗ dễ hiểu sai nhất của cả dự án:**

| Trường | Nghĩa | KHÔNG có nghĩa là |
|---|---|---|
| `success` | ScenarioRunner **chạy xong**, không crash / timeout / lỗi XML | không phải "xe không đâm nhau" |
| `CollisionTest = FAILURE` | Đã xảy ra va chạm. Với Forge đây thường là **kết quả mong muốn** | không phải lỗi hệ thống |
| `error` | Lý do worker/ScenarioRunner hỏng | — |

Hệ quả: *Săn lỗi xe tự hành* (W5) đọc `CollisionTest == FAILURE` khi ego chạy autopilot ⇒ đó là **adversarial success**.

---

## §5. Bản đồ mã nguồn

Chỉ liệt kê phần có bẫy hoặc dễ hiểu nhầm. Cấu trúc đầy đủ đọc bằng `tree` sau khi repo dựng xong.

```text
src/
├── config.py                 qdrant_*, carla_*, model_cheap/eval/fallback, budget
├── models/schemas.py         ⚠ SINGLE SOURCE OF TRUTH — sửa = PR riêng
├── agents/                                                          PLO1, PLO6
│   ├── graph.py              workflow graph cố định, KHÔNG ReAct — §3
│   ├── state.py   guardrails.py   routing.py  ⚠ điều kiện rẽ nhánh, code thuần — §3
│   ├── nodes/                parse_intent · retrieve · generate_draft · validate
│   │                         · repair_draft · convert_xosc · persist_pending_review
│   ├── tools/                library_search · static_validator · sim_runner
│   │                         (`map_waypoints` bỏ — ADR-012, §2)
│   └── prompts/              versioned: v1/, v2/
├── api/routers/              library · review · stats · auth
│                             generate · odd · internal_jobs (WORKER_TOKEN)
├── auth/                     2 vai trò creator/reviewer — [Đề bắt buộc]
├── services/
│   ├── llm.py                bọc LiteLLM: router + fallback chain + log tokens/cost
│   ├── jobs.py   telemetry.py                                          PLO5
│   ├── library/              store · embeddings · search · dedup · coverage    PLO3
│   ├── scenario/
│   │   ├── templates.py      catalog ScenarioTemplate — ⚠ KHÔNG đưa vào schemas.py:
│   │   │                     nó chứa map_name, để lọt vào hợp đồng chung là phá ADR-005
│   │   ├── converter.py      ScenarioSpec → .xosc, thuần xml.etree
│   │   │                     ⚠ KHÔNG import carla. Chạy Python 3.11.
│   │   └── templates/        fragment .xosc: entities · weather · storyboard · trigger
│   └── carla/                job_queue.py · static_check.py
└── odd/matrix.py             4 trục ODD — xem §12. Trục *tình huống* là bắt buộc:
                              đề bài đo "độ đa dạng của các TÌNH HUỐNG"

worker/                       venv 3.8 riêng, `src/` KHÔNG được import
├── runner.py                 .xosc → scenario_runner.py --openscenario --json → ExecutionResult
├── run_worker.py             poll /internal/jobs → ghi .xosc → run → POST kết quả
└── autopilot.py              CHỈ cho *Săn lỗi xe tự hành* (W5) — lúc này mới đụng CARLA Python API

frontend/                     Next.js 14 + Tailwind + next-themes
├── preview/                  ⚠ [Đề bắt buộc] — nhìn hiểu ngay, không đọc XML
│                             top-down 2D: vị trí xe, mũi tên hướng, icon thời tiết
│                             SVG hoặc Canvas. Vẽ từ ScenarioSpec, KHÔNG từ .xosc
└── (responsive · dark mode · accessibility — 1 trong 5 tiêu chí BTC chấm)
docker-compose.yml            backend + Qdrant + frontend              [tiêu chí DevOps]
fixtures/                     ✅ xosc/ · scenario_specs/ (3) · execution_results/ (3)
                              ✅ invalid_drafts/ (12) — bộ đề cho static_check.py:
                                 9 case Pydantic bắt · 3 case CHỈ hình học bắt được
                              còn thiếu: nl_queries · library_entries
eval/                         datasets · retrieval_eval · scenario_eval
                              · cost_report · results/report.md                 [nộp #10]
docs/adr/                     nhật ký quyết định (mẫu Ch.3)
docs/guide/ · .claude/ · .codex/ · scripts/setup_hooks.sh        KHÔNG ĐỤNG
```

---

## §6. Luật phối hợp

**Phân công không nằm trong tài liệu này.** Ai làm gì sống ở GitHub Issues, đổi
được bất cứ lúc nào bằng một dòng trong issue — không cần sửa tài liệu, không
cần cả đội duyệt. Việc đang tắc thì cứ nhận, báo một tiếng là đủ.

Thứ **không** đổi bằng một dòng trong issue nằm ngay dưới đây.

### Bất biến — không thương lượng, và **máy** canh chứ không phải người

Mỗi dòng có một test đỏ nếu vi phạm. Một luật chỉ nằm trong tài liệu thì chỉ có
tác dụng tới lúc người đọc nó đi ngủ.

| Bất biến | Vì sao | Canh bằng |
|---|---|---|
| `src/` không bao giờ `import carla` | Vi phạm = backend không deploy được = mất Deliverable #5. Hỏng chỉ trên Render, máy dev vẫn chạy ngon | `test_src_never_imports_carla` |
| `api/routers/` không `import qdrant_client` | Router là **lớp HTTP**; logic tìm kiếm ở `services/library/`. Nhân đôi = người đổi retrieval sửa một chỗ rồi tưởng xong | `test_http_layer_does_not_talk_to_the_vector_store` |
| Đúng **3 node** gọi LLM | Bằng chứng PLO1/PLO2. Node thứ tư lặng lẽ gọi LLM là trần cost và p95 mất hiệu lực mà không ai thấy | `test_only_three_nodes_are_allowed_to_call_an_llm` |
| Không ai `import openai` thẳng | Làm *"đổi provider = đổi một biến môi trường"* thành câu nói thật — plan B khi hết quota giữa tuần demo (§10) | `test_nothing_imports_the_llm_provider_directly` |
| `ScenarioSpec` không dính khái niệm CARLA | ADR-005: thêm Isaac sau = viết converter thứ hai, không phải viết lại | review PR + ADR-005 |
| Preview 2D vẽ từ `ScenarioSpec`, **không** parse `.xosc` | Spec đã có `lane_offset` + `s_offset_m` + hướng, đủ để vẽ. Đọc ngược XML tạo coupling với template converter | review PR |

### Luật phối hợp

- **`schemas.py` là ngoại lệ duy nhất còn cần gác cổng.** Sửa nó phải cập nhật
  `fixtures/` + tests **trong cùng PR**, và cần **một người duyệt riêng** — không
  phải vì quyền, mà vì bốn nhánh cùng đọc nó và schema churn là rủi ro có tên ở
  §10. Phần còn lại chỉ cần **một người thứ hai** duyệt, ai cũng được.
- **Không ai được chờ module khác** — bị chặn thì load từ `fixtures/`. Nếu phải
  chờ người khác mới làm được việc của mình thì đó là lỗi thiết kế task, không
  phải lỗi thái độ.
- Issue → nhánh `feature/*` → PR → test/evidence. **Không push thẳng `main`** —
  luật của đội, **chưa cưỡng chế được bằng branch protection** vì tài khoản không
  có quyền admin trên repo của tổ chức. Xin quyền hoặc nhờ coach bật giúp; tới lúc
  đó nó là kỷ luật tự giác. Commit dạng `type(scope): mô tả`. Không dùng `develop`
  — đội 4 người, phát hành một lần. Nhánh `release/demo` cắt từ `main` ở W5 lúc
  feature freeze là chỗ tách nhánh duy nhất có lý do.
- **`static_check.py` làm trước `converter.py`.** Không phải thứ tự tuỳ tiện: nó
  là hàm thuần, test được bằng `fixtures/invalid_drafts/` ngay hôm nay, và đòi
  hiểu `ScenarioSpec` đủ sâu để viết được bộ dịch. Làm xong nó là đã sẵn sàng cho
  converter, đồng thời lộ rủi ro năng lực từ W1 thay vì W4.
- **Hai thứ cùng tên "library", đừng lẫn:** `services/library/` là **logic tìm
  kiếm** (embed, search Qdrant, dedup); `api/routers/library.py` chỉ là **lớp
  HTTP** cho frontend duyệt thư viện.
- AI logs, `WORKLOG.md`, `JOURNAL.md` ghi đúng đóng góp thật.

---

## §7. Mốc 6 tuần

Tiến độ theo ngày sống ở **GitHub Issues/Project**, không nhân đôi ở đây. Dưới đây chỉ là **danh sách thứ phải làm ra**, theo thứ tự.

| Tuần | Phải có |
|---|---|
| **W1** 07-27→08-02 | ADR nền tảng · `schemas.py` + `fixtures/` · converter sinh được `.xosc` · library + frontend scaffold · deploy Live URL |
| **W2** 08-03→08-09 | E2E tiếng Việt → spec → validate → review → library · tải `.xosc` · worker pull/report job · **preview 2D** · **2 vai trò creator/reviewer** · ADR-007 |
| **W3** 08-10→08-16 | Retrieval baseline **rồi mới** improved · dashboard validity/cost/latency · batch CARLA đầu tiên · guardrails · test coverage ≥60% |
| **W4** 08-17→08-23 | ODD coverage heatmap · cache/cost report · model routing + fallback chain + ADR-008 · user testing 3–5 người |
| **W5** 08-24→08-30 | Failure analysis 20 case → prompt v2 → đo lại · adversarial **chỉ khi** core đã ổn · **feature freeze thứ 6** · branch `release/demo` |
| **W6** 08-31→09-06 | Đủ 10 deliverables · video · pitch deck · demo script · 3 lần dry-run. **Chỉ bug fix** |

**Ba cấu phần bắt buộc, không cái nào rơi vào W6:** *giá trị kinh doanh* = PRD + pitch + user testing W4 · *hạ tầng vận hành* = deploy W1 + `/stats` + CI + worker protocol · *lõi AI* = agent graph + RAG metrics + eval.

---

## §8. Deliverables và bằng chứng

| # | Deliverable | Nơi bàn giao | Xong |
|---|---|---|---|
| 1 | Source code | `src/`, `worker/`, `frontend/` | W5 |
| 2 | README | `README.md` | W6 T2 |
| 3 | Architecture | `ARCHITECTURE.md`, `docs/architecture_diagram.md`, ADRs | W6 T2 |
| 4 | AI logs | `.ai-log/` (hooks) + LangSmith trace | ✅ 1/4 người · còn lại **W1** |
| 5 | Live URL | Backend + frontend + vector store | **W1 T5** |
| 6 | Video demo | `presentation/video_demo.md` | W6 T4 |
| 7 | Pitch deck | `presentation/pitch_deck.pdf` | W6 T4 |
| 8 | Weekly journal | `JOURNAL.md` | mỗi CN |
| 9 | Worklog | `WORKLOG.md` | mỗi ngày |
| 10 | Evaluation evidence | `eval/results/report.md` | W6 T2 |

Bằng chứng tối thiểu theo 8 tiêu chí chấm (**PLO**):

| PLO | Bằng chứng | Rủi ro thiếu |
|---|---|---|
| **1** Kiến trúc | ADR-007 (workflow/agent/multi-agent + điều kiện đổi ý) · ADR-001 (ranh giới sim) · ADR-008 (model routing, **đổi provider không đổi code**; phải test bằng cách rút key) | Thấp |
| **2** Multi-agent | **Chủ động N/A ở cả 2 nấc** — §3 + ADR-007. Bù bằng LangSmith node-level trace của loop generate→validate→repair | ⚠ Phải nói ra, không được im lặng |
| **3** RAG | Cùng một golden set, báo cáo **cả baseline lẫn improved** | ⚠ Không có baseline = không chứng minh được "vượt naive" |
| **4** Business | PRD, 2 persona, 8 user story, ROI (giờ kỹ sư viết tay vs sinh tự động), user testing | Trung bình |
| **5** Hạ tầng | Live URL, CI, `/health`, `/stats`, structured logging, worker protocol | Thấp (deploy W1) |
| **6** An toàn | HITL 2 cổng, guardrails injection, iteration/actor cap, chỉ dữ liệu mô phỏng | Thấp |
| **7** Đánh giá | Validity 3 tầng, failure analysis 20 case, cost/latency, before/after | ⚠ Failure analysis dễ bị bỏ khi hết giờ → làm W5, không W6 |
| **8** Vibe coding & team | Lịch sử issue/PR/review, AI logs, worklog, journal | Thấp nếu hooks chạy từ ngày đầu |

**Tài liệu ngoài code:** `docs/prd.md` (W1 T7) · `docs/deploy.md` (W2) · `docs/safety.md` (W3) · `docs/odd.md` (W4 — kèm mục *"scenario types hỗ trợ / out of scope"*) · `worker/README.md` + `src/services/scenario/README.md` (W3) · `presentation/demo_script.md` (W6 T3 — **phải có cả kịch bản lỗi**).

**Q&A chuẩn bị sẵn:** *"Sao không multi-agent?"* → §3 + ADR-007 · *"Hallucination xử lý sao?"* → ADR-010 thu hẹp không gian đầu ra: vị trí là offset tương đối có giới hạn `lane_offset` −4…4 và `s_offset_m` ±200, thay vì toạ độ tuyệt đối tự do. Ba tầng tiếp theo là structured output ép schema → static validator kiểm **quan hệ hình học** (chủ thể có bắt kịp ego không, trigger có bắn kịp không) → CARLA thật · *"Cost/request?"* → số thật từ `/stats` · *"Scale 1000 user?"* → job queue đã tách, worker scale ngang; nút cổ chai dự kiến là GPU sim và phải được xác nhận bằng load test.

---

## §9. Quality gates

Đề bài chỉ định **ba thước đo chất lượng** và **hai ràng buộc vận hành** — không cho con số nào. Ba dòng ★ dưới đây là ba thước đo bắt buộc đó; **mọi con số trong bảng là do đội tự đặt**, sẽ hiệu chỉnh sau baseline. Nói rõ điều này với mentor, đừng để họ tưởng là chỉ tiêu BTC.

| Đề bài yêu cầu đo | Dòng tương ứng |
|---|---|
| Tỷ lệ kịch bản chạy hợp lệ | ★ Sim valid rate |
| Độ đa dạng (coverage) của các **tình huống** | ★ ODD coverage — **phải có trục tình huống** |
| Tỷ lệ **kích hoạt được hành vi nguy hiểm mong muốn** | ★ Danger trigger rate |
| Kiểm soát chi phí gọi LLM và thời gian sinh | Cost/scenario · p95 latency |

**Mỗi metric phải có script/dataset chạy lại được, kết quả lưu trong `eval/results/`** — dashboard không phải nguồn bằng chứng duy nhất.

| Gate | Định nghĩa | Target |
|---|---|---:|
| Schema valid rate | Parse được `ScenarioSpec` | ≥ 0.98 |
| Static valid rate | Qua static validator (waypoint, speed, geometry) | ≥ 0.90 |
| `.xosc` parse rate | ScenarioRunner nạp được file converter sinh — **đo được không cần GPU** | ≥ 0.95 |
| ★ Sim valid rate | ScenarioRunner chạy xong, `success == true` (§4) | ≥ 0.80 |
| ★ **Danger trigger rate** | Kịch bản có tạo ra **đúng hành vi nguy hiểm người dùng yêu cầu** không — gõ "xe máy tạt đầu" thì trigger tạt đầu có bắn và có tình huống nguy hiểm thật không. Đo **không cần autopilot**, khác hẳn *Adversarial found* ở W5 | ≥ 0.70 |
| Recall@5 (improved) | Retrieval trên golden set | ≥ 0.85 **và > baseline** |
| Intent match rate | DeepEval GEval, hiệu chỉnh với người chấm | ≥ 0.85 |
| Repair success | Spec sai sửa được trong ≤3 vòng | ≥ 0.70 |
| **Cache hit rate** | Câu trùng trả bằng cache thay vì gọi LLM (*Tiết kiệm LLM*) | ≥ 0.25 |
| ★ **ODD coverage** | cells_covered / **`SupportPolicy.denominator()`** (*Phủ ODD*). **Bắt buộc báo cáo tách theo trục tình huống** — phủ 75% mà chưa từng sinh kịch bản người đi bộ băng ngang là không đạt yêu cầu "đa dạng tình huống". ⚠ Mẫu số **không** cố định bằng 560: 560 là số tổ hợp enum, còn mẫu số là số ô converter thật sự dựng được. Báo cáo **hai** số — *phạm vi hỗ trợ x/560* và *đã phủ y/x*. Hiệu chỉnh sau baseline W3, cùng lúc với catalog template | ≥ 0.75 ⚠ |
| **Adversarial found** | Scenario làm autopilot fail (*Săn lỗi xe tự hành*) | ≥ 3 |
| p95 latency | End-to-end generate, static mode | ≤ 25s |
| Cost / scenario | USD | ≤ $0.01 |
| Test coverage | pytest-cov trên `src/` | ≥ 60% |

Ba dòng in đậm là tiêu chí "xong" của **ba hạng mục nâng cao** — thiếu thì không biết đã làm xong hay chưa.

**Safety acceptance:**

- Prompt chứa dữ liệu cá nhân hoặc yêu cầu áp dụng tình huống lên xe/robot thật bị từ chối.
- Chỉ scenario đã qua cổng 1 mới được đưa vào library và quay lại làm few-shot.
- Mọi request bị giới hạn actor, tốc độ, thời lượng, số vòng repair và simulation timeout.
- Creator tạo/xem scenario; reviewer approve/reject; reject bắt buộc có lý do. Cấm self-approval là **chính sách đội bổ sung**, không phải câu chữ nguyên văn của đề.
- Generate, review và simulate đều có audit log; bộ test phải có prompt-injection và out-of-scope cases.

*Luật cho cổng duyệt:* reviewer phải quyết định được từ preview và diễn giải tiếng Việt, không cần đọc XML. **[Target nội bộ]** thời gian quyết định ≤15 giây trong user test; XML vẫn mở được ở màn chi tiết.

*Chọn index Qdrant:* corpus <10K nên giữ HNSW mặc định. Kiểm chứng bằng cách chạy lại đúng script eval với `search_params={"exact": True}` (Qdrant quét toàn bộ, bỏ qua index) — chênh recall <0.01 thì viết **ADR-009 ba dòng** và đóng vấn đề. Tốn ~15 phút vì dùng lại script cũ.

---

## §10. Rủi ro cần theo dõi

| Rủi ro | Trigger | Plan B |
|---|---|---|
| **CARLA/ScenarioRunner không ổn định** trên RTX 4060 8GB | Hết T3 28/7 chưa chạy được example `.xosc` | Static validator + export `.xosc` thành sản phẩm chính (converter không cần CARLA); sim thành tier 2 tuỳ chọn. **Sản phẩm vẫn đủ chấm** |
| **Một máy GPU = single point of failure** | Worker hoặc máy GPU duy nhất không sẵn sàng | Worker pull-based chạy được từ máy bất kỳ + fixtures + video backup. Xin GPU server chương trình ngay W1 |
| **Cloud thiếu RAM / sleep 15'** | `/health` hoặc telemetry fail | Image không có torch. UptimeRobot ping 5'. Đổi Railway / HF Spaces nếu cần |
| **Dùng Qdrant như database giao dịch** | Review/job state khó query hoặc mất tính nhất quán | PostgreSQL là nguồn thật cho user/review/job; Qdrant chỉ giữ vector và payload phục vụ retrieval |
| **Nhánh mô phỏng chậm hơn dự kiến** | **Hết W1 chưa xong `static_check.py`** (tín hiệu sớm hơn hẳn `runner.py`) | Nhánh này chỉ **2 file** ở **2 vùng độc lập** (converter ở `src/`, runner ở `worker/`), hỏng cái này không kéo cái kia. `converter.py` test được không cần GPU nên đo tiến độ hàng ngày. Nếu chậm: tách đôi — một người tiếp quản `runner.py` (cần máy GPU), người kia giữ `converter.py` + test + eval labeling + video |
| **Schema churn** | Interface đổi sau W1 T3 | PR riêng, `fixtures/` + tests cập nhật cùng PR, một người chốt rồi báo cả đội |
| **Scope creep 3 hạng mục nâng cao** | Core E2E hoặc deliverables trễ | Cắt *Săn lỗi xe tự hành* trước. **Không bao giờ cắt core/eval** |
| **Retrieval không có baseline** | Bắt đầu tối ưu trước khi đo | Chạy và lưu baseline **trước** mọi thay đổi |
| **`.xosc` không biểu diễn được scenario** (hành vi phản ứng phức tạp, pedestrian agent-based, điều kiện lồng nhau) | Converter từ chối một loại scenario | Chốt danh sách "supported / out of scope" **cuối W3** sau khi viết converter thật; ODD matrix đóng khung đúng bằng danh sách đó; prompt chỉ được sinh trong tập đó. Ghi vào `docs/odd.md` — đây là **điểm cộng PLO4/PLO6** (biết giới hạn hệ thống), không phải điểm trừ |
| **Hết quota LLM free tier** | Rate limit giữa tuần demo | Đổi `LLM_FALLBACK_MODEL` sang Groq/Gemini — **1 biến môi trường, không sửa code** |
| **Demo Day live demo chết** | Dry-run không ổn định | Video backup cho cả happy path lẫn failure path. Library seed sẵn 50 scenario |

---

## §11. Việc ngay trước mắt

> Xong ngày 29/7: 7 ADR · `schemas.py` + `fixtures/` + 27 test · đường nộp AI log (479 entry, server trả 202). Lịch sử chi tiết ở `JOURNAL.md`.

**Danh sách này chỉ nói *việc gì*, không nói *ai*.** Ai nhận cái nào sống ở GitHub
Issues. Thứ tự dưới đây là thứ tự phụ thuộc, không phải thứ tự quan trọng.

1. 🔴 **Chạy `fixtures/xosc/sample_001_cut_in.xosc` bằng ScenarioRunner thật** — cài
   CARLA, verify Python version của wheel, đo VRAM, chạy với `--json`. **Ghi lại
   command, output và giới hạn máy.** Báo cáo dù thành công hay thất bại.
   Việc này chặn hai thứ: mốc rủi ro ở §10 (**đã quá hạn 28/7**), và
   [ADR-012](adr/ADR-012-converter-dung-relativelaneposition.md) — pass thì
   `cache_waypoints.py` + `ResolvedScenario` rơi khỏi MVP vĩnh viễn; fail thì
   ADR-010 giữ nguyên và §1 phải sửa để thừa nhận converter là điểm rẽ nhánh thứ hai.
2. 🔴 **Viết ADR-011 (PostgreSQL)** — đang chặn review/job API, mà đó là đường găng
   của Deliverable #5 (§2).
3. **Viết `services/carla/static_check.py`** dựa trên `fixtures/invalid_drafts/`
   (không cần CARLA, không cần GPU — làm được ngay cả khi cài CARLA còn hỏng).
   **Đề bài đã có sẵn:** 12 file, mỗi file tự khai `expected_codes`; 3 file
   `caught_by: static_check` là phần phải viết code mới — chúng **hợp lệ hoàn toàn
   về schema**, chỉ số học mới bắt được. Xong thì sửa
   `test_geometry_bugs_pass_schema_and_need_static_check` thành assert hàm trả đúng code.
4. **Cài AI log cho 3 người còn lại** — tạo token ở `phoenix.note.transformerlabs.ai/api-keys`
   → dán vào `AI_LOG_API_KEY` trong `.env` → `bash scripts/setup_hooks.sh` → push một
   lần. **Khoá có sẵn trong `.env.example` đã hết hiệu lực, dùng sẽ bị 401.** Đây là
   Deliverable #4 và là thứ **duy nhất không ghi bù được** — code trước khi cài hook
   thì quãng đó mất vĩnh viễn. Log chỉ được nộp khi `git push`.
5. **`odd/matrix.py`** đếm phủ, mẫu số lấy từ `SupportPolicy.denominator()` chứ không
   hard-code 560. Hôm nay hàm đó trả đúng 560; nó đổi khi catalog template chốt xong
   cuối W3, và lúc đó `eval/` không phải sửa gì. Báo cáo coverage phải **tách được
   theo trục tình huống**, không chỉ một con số tổng.
6. **Tạo tài khoản Render + Vercel + Qdrant Cloud** (không cần thẻ) + dựng frontend
   scaffold. **Đọc kỹ hai yêu cầu cơ bản: preview 2D và 2 vai trò creator/reviewer**
   (§5, mốc W2).
7. **Dựng Qdrant store + smoke test bằng fixtures.**
8. **Tạo sẵn tài khoản Groq + Google AI Studio**, ghi tên biến với giá trị placeholder
   vào `.env.example`; key thật chỉ lưu trong `.env` đã được ignore. Làm sớm để không
   mất thời gian xử lý quota giữa tuần demo.
9. **Tạo Issues/Project cho task theo ngày.** Từ đó tiến độ **và phân công** sống ở
   GitHub, không cập nhật hai nơi.

---

## §12. Tra cứu

| Từ | Nghĩa |
|---|---|
| **`.xosc`** | File XML chuẩn **OpenSCENARIO 1.0** mô tả kịch bản giao thông. Chính là "file kịch bản chạy được" đề bài yêu cầu |
| **ScenarioRunner** | Công cụ chính thức của CARLA: nạp `.xosc`, chạy trong CARLA, chấm đạt/không đạt theo tiêu chí dựng sẵn (CollisionTest, DrivenDistanceTest…) |
| **ODD** | *Operational Design Domain* — vùng điều kiện vận hành xe tự hành được thiết kế để chạy an toàn. Với ta là bảng 4 trục **đúng theo `schemas.py`**: loại đường (5) × thời tiết (4) × loại chủ thể (4) × **tình huống (7)** = **560 tổ hợp**. ⚠ 560 là số tổ hợp *enum*, không phải mẫu số coverage — mẫu số là số ô converter thật sự dựng được, lấy từ `SupportPolicy.denominator()` (§9). Trục thứ 4 là *tình huống*, không phải *thời điểm trong ngày* — đề bài đo *"độ đa dạng của các tình huống"*. `TimeOfDay` vẫn nằm trong `ScenarioSpec` để dựng cảnh, chỉ thôi làm trục đo phủ |
| **Ego** | Chiếc xe đang được test. Các xe khác là diễn viên phụ |
| **Workflow / Agent / Multi-agent** | 3 mức, phân biệt bằng *ai quyết thứ tự bước*. Forge là **workflow**, có chủ đích — §3 |
| **RAG** | Trước khi bảo LLM sinh kịch bản mới, tìm 3 kịch bản cũ giống nhất đưa cho nó làm mẫu |
| **HITL** | *Human In The Loop* — bắt buộc có người thật phê duyệt trước hành động rủi ro |
| **LiteLLM** | Thư viện bọc mọi nhà cung cấp LLM vào chung một hàm gọi. Đổi nhà cung cấp = đổi chuỗi `model=` |
| **ADR** | *Architecture Decision Record* — biên bản 1 trang: "chọn X thay vì Y, vì…". Mẫu ở `docs/guide/chapter-03.md` |
| **PLO 1–8** | *Program Learning Outcome* — 8 tiêu chí chấm: kiến trúc · multi-agent · RAG · giá trị kinh doanh · hạ tầng · an toàn · đánh giá · làm việc nhóm |
| **p50 / p95** | Phân vị độ trễ. `p95 = 25s` nghĩa là 95/100 request nhanh hơn 25 giây |
| **Recall@5** | Trong 5 kết quả đầu, bao nhiêu phần trăm chứa đáp án đúng |
| **MRR@10** | Đáp án đúng thường nằm ở vị trí thứ mấy — càng gần đầu càng cao |
| **nDCG@10** | Như MRR nhưng tính cả mức độ liên quan, không chỉ đúng/sai |
