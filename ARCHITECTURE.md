# Kiến trúc — Scenario Forge (RAV-03)

Tài liệu này là Deliverable Architecture duy nhất: chứa sơ đồ, workflow,
contracts, ranh giới hệ thống và trạng thái triển khai. Lý do từng quyết định nằm
trong [`docs/adr/`](docs/adr/README.md).

> Nguồn sự thật về dữ liệu là `src/models/schemas.py`. Nguồn sự thật về quyết
> định là ADR. Nếu tài liệu này vênh với hai nguồn đó, tài liệu này sai.

## Mục tiêu

Kỹ sư nhập một câu tiếng Việt mô tả tình huống giao thông nguy hiểm. Hệ thống
sinh file OpenSCENARIO 1.0 (`.xosc`), lưu ở trạng thái chờ review, cho tải sau
khi được duyệt và có thể gửi sang CARLA ScenarioRunner để kiểm chứng.

Sản phẩm chính là file `.xosc`; CARLA là tầng kiểm chứng tuỳ chọn.

## Sơ đồ hệ thống mục tiêu

```mermaid
graph TB
    U([Creator / Reviewer]) --> UI[Frontend]
    UI --> API[FastAPI backend · Python 3.11]
    API --> G[LangGraph workflow]
    G --> LLM[LLM gateway]
    G --> CONV[Deterministic converter]
    API --> DB[(Transactional store · SQLite MVP<br/>scenario + review + job + embedding BLOB)]
    API --> RET[Retriever · WHERE theo ODD + cosine numpy]
    RET --> DB

    W[GPU worker · Python 3.10] -. pull job .-> API
    W --> SR[ScenarioRunner 0.9.15]
    SR --> C[CARLA 0.9.15]
    W -. ExecutionResult .-> API
```

- Backend cloud không `import carla`.
- Worker nhận chuỗi XML, không nhận object Python.
- Worker offline không làm chết đường generate/review/download ở chế độ static.
- Transactional store là nguồn thật duy nhất: state giao dịch và embedding nằm cùng một `.db`, nên không có index ngoài để lệch (ADR-013).
- MVP dùng SQLite. Chỉ chuyển sang PostgreSQL khi deployment cần durable storage ngoài process hoặc có concurrent writes.

## Workflow 7 nodes

Đây là kiến trúc mục tiêu. Graph hiện tại vẫn là graph mẫu `analyze → respond`;
`routing.py`, data contracts và fixtures đã có thật.

```mermaid
graph LR
    A[parse_intent 🤖] --> B[retrieve]
    B --> C[generate_draft 🤖]
    C --> D{validate}
    D -->|error sửa được| E[repair_draft 🤖]
    E --> D
    D -->|hợp lệ| F[convert_xosc]
    D -->|lỗi hệ thống / hết 3 vòng| X([failed])
    F --> G[persist_pending_review]
    G --> H([graph kết thúc])
```

`parse_intent` bao gồm hai thao tác code thuần ngay sau structured output:

- Điền mặc định cho trục bối cảnh được phép thiếu và ghi `Assumption`.
- Kiểm thiếu actor/maneuver hoặc tổ hợp ngoài `SupportPolicy`; thất bại trả lỗi
  có cấu trúc để API chuyển thành `422`.

Hai thao tác này không có retry/checkpoint/I/O độc lập nên không phải nodes.
`ScenarioSpec.promote()` cũng chỉ là hàm backend chạy sau validation, không phải node.

### Contract từng node

| Node | Input | Output | Trách nhiệm |
|---|---|---|---|
| `parse_intent` | `user_query` | `ODDQuery`, `ODDCell`, assumptions hoặc lỗi hỗ trợ | Hiểu câu và chuẩn hoá intent |
| `retrieve` | câu + `ODDQuery.as_filter()` | tối đa 3 `ScenarioSpec` | Vector search + payload filter |
| `generate_draft` | câu + ODD + examples | `ScenarioDraft` | Sinh nội dung semantic có cấu trúc |
| `validate` | `ScenarioDraft` | `list[ValidationIssue]` | Schema, invariants và static geometry |
| `repair_draft` | draft + lỗi sửa được | `ScenarioDraft` mới | Sửa nội dung, tối đa ba vòng |
| `convert_xosc` | `ScenarioSpec` đã promote | `xosc_content: str` | Biên dịch deterministic sang XML |
| `persist_pending_review` | spec + XML + provenance | scenario `pending_review` | Ghi durable state rồi kết thúc graph |

### Routing sau validate

```text
không còn error                 → promote → convert_xosc
có lỗi không sửa được           → failed ngay
còn lỗi sửa được, iteration < 3 → repair_draft
iteration >= 3                  → failed
```

Warning không chặn flow; reviewer nhìn thấy warning ở cổng duyệt.

## Sau workflow

Review và simulation là các HTTP transaction độc lập, không phải nodes đứng chờ
trong graph.

```mermaid
graph LR
    P[(pending_review)] --> R1{BEFORE_LIBRARY}
    R1 -->|reject + reason| RJ[rejected]
    R1 -->|approve| LIB[Library: embedding BLOB + cho tải .xosc]
    LIB --> R2{BEFORE_SIM}
    R2 -->|approve| JOB[ScenarioJob]
    JOB --> W[GPU worker]
    W --> RES[ExecutionResult]
```

- `BEFORE_LIBRARY`: yêu cầu sản phẩm, ngăn dữ liệu xấu quay lại làm few-shot.
- `BEFORE_SIM`: chính sách đội để kiểm soát tài nguyên GPU.

## Data lifecycle

```text
câu gốc
→ ODDQuery
→ ScenarioDraft
→ ScenarioSpec
→ xosc_content
→ ScenarioJob
→ ExecutionResult
→ LibraryEntry
```

LLM không cấp `scenario_id` và không viết lại `description_vi`. Backend cấp ID
và copy nguyên văn câu người dùng khi promote draft thành spec.

## Ranh giới hệ thống

| Ranh giới | Dữ liệu đi qua | Bất biến |
|---|---|---|
| LLM ↔ backend | `ODDQuery`, `ScenarioDraft` | structured output, `extra="forbid"` |
| Spec ↔ converter | `ScenarioSpec` | spec không chứa khái niệm riêng của CARLA |
| Cloud ↔ GPU worker | `ScenarioJob.xosc_content` | không chia sẻ Python object/venv |
| Transaction ↔ retrieval | truy cập qua interface `Retriever` | chỉ scenario qua `BEFORE_LIBRARY` mới có embedding để tìm lại |
| Workflow ↔ human | durable `pending_review` state | không chờ trong process memory |

## Converter và CARLA

Converter chạy trên CPU backend và dùng template catalog để ánh xạ semantic spec
sang subset OpenSCENARIO mà ScenarioRunner 0.9.15 hỗ trợ. `RelativeLanePosition`
cho phép giữ actor tương đối theo ego; chỉ ego cần một `WorldPosition` anchor theo
template.

Smoke test ngày 31/07/2026 đã xác nhận:

- Windows CARLA server ↔ WSL2 ScenarioRunner client hoạt động.
- Python 3.10 wheel tương thích CARLA 0.9.15.
- `RelativeLanePosition` đặt actor đúng làn và khoảng cách.
- ScenarioRunner xuất criteria JSON có thể chuẩn hoá thành `ExecutionResult`.

Smoke test chưa chứng minh converter tự động hoặc outcome cut-in/collision ổn định.
Các parser traps và giới hạn nằm ở
[ADR-012](docs/adr/ADR-012-converter-dung-relativelaneposition.md).

## Bất biến được kiểm bằng CI

- `src/` không import `carla`.
- HTTP layer không truy vấn retrieval store trực tiếp; mọi tìm kiếm đi qua `Retriever`. *(Test hiện tại chặn `import qdrant` trong router — sẽ đổi sang chặn import implementation của `Retriever` khi hiện thực, xem §Hệ quả của ADR-013.)*
- Chỉ `parse_intent`, `generate_draft`, `repair_draft` được phép gọi LLM.
- Mọi provider call đi qua `src/services/llm.py`.
- Fixtures phải validate theo `schemas.py`.

## Trạng thái hiện tại

| Thành phần | Trạng thái |
|---|---|
| `schemas.py`, fixtures | ✅ Có |
| Routing và architecture tests | ✅ Có |
| CARLA/ScenarioRunner smoke test | ✅ Toolchain pass |
| Graph 7 nodes | ⏳ Graph hiện vẫn là template |
| Static validator, templates, converter | ⏳ Chưa có |
| `Retriever` (SQLite BLOB + cosine) và retrieval baseline | ⏳ Chưa có |
| SQLite persistence, review/download/job API | ⏳ Chưa có |
| Frontend và preview | ⏳ Chưa có |
| GPU worker | ⏳ Chưa có implementation |
| Evaluation report bằng số thật | ⏳ Chưa có |

## Quy tắc thay đổi

- Đổi hình dạng dữ liệu: sửa `schemas.py`, fixtures và tests trong cùng PR.
- Đổi quyết định Accepted: viết ADR mới và supersede ADR cũ.
- Đổi workflow: cập nhật graph, routing tests và bảng contract ở đây.
- Ownership, deadline và tiến độ theo ngày chỉ nằm trong GitHub Issues/Project.
