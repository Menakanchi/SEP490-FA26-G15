# Sơ đồ kiến trúc — Scenario Forge

> Nguồn sự thật là `src/models/schemas.py` + `docs/adr/`. Sơ đồ ở đây chỉ vẽ lại
> thứ đã chốt ở đó. Vênh nhau thì **ADR đúng, sơ đồ sai** — sửa sơ đồ.

## Toàn hệ thống

Ranh giới module = **ranh giới GPU** (ADR-001). Đường đứt nét là chỗ đổi máy và
đổi venv; thứ đi qua nó là **chuỗi XML**, không phải object Python.

```mermaid
graph TB
    User([Người dùng]) --> UI["Frontend<br/>Next.js 14"]
    UI -->|REST| API["FastAPI<br/>Python 3.11 · cloud"]

    API --> Graph["LangGraph workflow<br/>thứ tự CỐ ĐỊNH, không ReAct"]
    Graph --> LLM["services/llm.py<br/>LiteLLM · mọi provider đi qua đây"]
    Graph --> Conv["services/scenario/converter.py<br/>xml.etree · KHÔNG import carla"]

    API --> PG[("PostgreSQL<br/>user · review · job · scenario state")]
    API --> QD[("Qdrant<br/>CHỈ vector + payload để retrieval")]

    API -.->|"GET /internal/jobs · WORKER_TOKEN"| W
    W["worker/run_worker.py<br/>Python 3.8 · máy có GPU"] -.->|"POST ExecutionResult"| API
    W --> SR["scenario_runner.py<br/>--openscenario --json"]
    SR --> CARLA["CARLA 0.9.15"]
```

- **PostgreSQL là nguồn thật cho dữ liệu giao dịch; Qdrant không phải** — `plan.md` §10. Chờ ADR-011.
- Worker **pull**, backend không gọi worker. Worker tắt thì Live URL vẫn phục vụ `validation_mode=static` (ADR-001).
- Không dùng ChromaDB của template — ADR-003 chọn Qdrant vì cần *payload filter kết hợp vector search*.

## Luồng xử lý

**Thứ tự do code quyết, không phải LLM.** Đây là bằng chứng PLO1/PLO2 — không có
node nào hỏi mô hình "bước tiếp theo là gì". Lập luận đầy đủ ở `plan.md` §3 + ADR-007.

```mermaid
graph TD
    START(["POST /generate"]) --> G{{"guardrails"}}
    G -->|"PII · injection · xe thật"| REJECT(["từ chối + audit log"])
    G --> PI["parse_intent 🤖"]
    PI --> DEF{{"with_defaults + support_policy"}}
    DEF -->|"thiếu actor/maneuver<br/>hoặc tổ hợp không hỗ trợ"| E422(["422 + gợi ý tương thích"])
    DEF --> RET["retrieve"]
    RET --> GEN["generate_draft 🤖"]
    GEN --> VAL{{"validate · static_check"}}

    VAL -->|"hết error"| PROM["promote → ScenarioSpec"]
    VAL -->|"có error KHÔNG sửa được"| FAIL(["failed + lý do"])
    VAL -->|"hết 3 vòng"| FAIL
    VAL -->|"error sửa được"| REP["repair_draft 🤖"]
    REP --> VAL

    PROM --> CONV["convert_xosc"]
    CONV --> PERS["persist_pending_review"]
    PERS --> ENDG(["GRAPH KẾT THÚC<br/>status = pending_review"])
```

🤖 = gọi LLM. **Đúng ba node**, tất cả đi qua `services/llm.py`. Phần còn lại là
code thuần — điều kiện rẽ nhánh ở `src/agents/routing.py`, test được mà không cần
mock LLM. Vòng lặp duy nhất là `validate ↔ repair_draft`, trần cứng 3 vòng.

## Hai cổng duyệt — KHÔNG nằm trong graph

Graph kết thúc ở `pending_review` và ghi xuống DB. Mọi thứ sau đó là **HTTP
transaction riêng**, vì Render free tier ngủ khi không có request: thứ gì "đứng
chờ" trong RAM đều chắc chắn chết (`schemas.py`, `ReviewDecision`).

```mermaid
graph LR
    P[("pending_review")] -->|"POST /review · BEFORE_LIBRARY"| D1{approve?}
    D1 -->|"có"| LIB["vào Qdrant<br/>+ cho tải .xosc"]
    D1 -->|"không"| REJ["rejected<br/>BẮT BUỘC có lý do"]

    LIB -->|"POST /review · BEFORE_SIM"| D2{approve?}
    D2 -->|"có"| RUN["POST /run → ScenarioJob"]
    RUN --> Q[["hàng đợi → worker GPU"]]
```

Cổng 1 là **[Đề bắt buộc]**; cổng 2 là **chính sách đội bổ sung** để kiểm soát GPU.

## Hợp đồng dữ liệu từng bước

| Bước | Vào | Ra |
|---|---|---|
| `parse_intent` | câu tiếng Việt | `ODDQuery` (kèm trục nào là suy luận) |
| `retrieve` | câu + `as_filter()` | ≤3 `ScenarioSpec` làm few-shot |
| `generate_draft` | câu + `ODDCell` + few-shot | `ScenarioDraft` — **không có `scenario_id`** |
| `validate` | `ScenarioDraft` | `list[ValidationIssue]` (error / warning) |
| `repair_draft` | draft + issue sửa được | `ScenarioDraft` |
| promote | draft | `ScenarioSpec` — backend cấp id, copy câu gốc |
| `convert_xosc` | `ScenarioSpec` | `.xosc` (chuỗi XML) |
| worker | `ScenarioJob.xosc_content` | `ExecutionResult` |

## Triển khai

```mermaid
graph LR
    subgraph Cloud["hạ tầng miễn phí, không GPU"]
        FE["Frontend · Vercel"] --> BE["Backend · Render"]
        BE --> QD[("Qdrant Cloud")]
        BE --> PG[("PostgreSQL")]
    end
    BE -.->|"pull job · HTTP"| W["Worker · máy có GPU<br/>bật khi cần"]
```

Worker offline **không** làm chết web: `validation_mode=static` phục vụ được toàn
bộ đường đi từ câu tiếng Việt tới file `.xosc` tải được. Đó là bất biến giữ
Deliverable #5 sống.

---

*File này chỉ chứa **sơ đồ**. Bảng thành phần, ranh giới, an toàn và trạng thái
nằm ở [`ARCHITECTURE.md`](../ARCHITECTURE.md) — cố ý không nhân đôi.*
