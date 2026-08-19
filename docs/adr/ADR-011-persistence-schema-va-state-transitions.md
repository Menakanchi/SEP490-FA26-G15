# ADR-011: Persistence schema, state transitions, và tiêu chí SQLite → PostgreSQL

**Ngày:** 2026-08-04
**Trạng thái:** Accepted

## Bối cảnh

Đây là ADR duy nhất trong `README.md` được đánh dấu **đang chặn** một phần code cụ thể: review API và job API không viết được khi chưa biết ghi vào bảng nào và transition nào hợp lệ. NFR-05 cấm giữ trạng thái chờ người duyệt trong RAM (Render free tier ngủ sau 15 phút không có traffic), nên **mọi** thứ phải durable — không có đường vòng.

Bốn thứ chưa chốt, và cả bốn đều đang mâu thuẫn với chính tài liệu của dự án:

1. **Trạng thái scenario không tồn tại trong code.** `schemas.py` có `JobStatus` (pending/running/done/failed) và `ReviewGate`, nhưng **không có `ScenarioStatus`**. Tám trạng thái ở sơ đồ `03-wireframe-ui-flow.md` §7 chỉ sống trong một khối mermaid — không enum, không test, không gì chặn code viết sai.
2. **`.xosc` lưu ở đâu.** `LibraryEntry.xosc_path` là *đường dẫn file*, trong khi FR-08 bắt lưu *"spec, **XML**, provenance, assumptions và issue history"*, và điều kiện nghiệm thu MVP bắt *"backend restart không làm mất pending scenario"*.
3. **SQLite hay PostgreSQL.** `ARCHITECTURE.md` viết *"MVP dùng SQLite"*; `.env.example` viết *"PostgreSQL là nguồn thật (chờ ADR-011). SQLite chỉ để chạy local"*. Hai câu ngược nhau trong cùng một repo.
4. **Sinh lỗi thì ghi gì.** PRD §8: *"Converter lỗi → báo lỗi hệ thống có request ID; **không tạo pending scenario giả**"*. Nghĩa là phải có chỗ ghi một lần sinh **thất bại**, mà chỗ đó không thể là bảng `scenarios`.

Thêm một ràng buộc hạ tầng vừa kiểm chứng lại từ tài liệu chính thức của Render:

> *"By default, Render services have an ephemeral filesystem. This means that without a persistent disk, any changes you make to a service's local files are lost every time the service redeploys or restarts."* — và persistent disk **chỉ có ở paid instance**.

Tức là trên Render free, file SQLite nằm cạnh app **cũng bị xoá** mỗi lần redeploy hoặc wake-up sau khi ngủ. "MVP dùng SQLite" + "deploy lên Render free" + "restart không mất pending scenario" là ba câu **không thể cùng đúng**.

## Các lựa chọn

### Lựa chọn 1: SQLite file ở mọi môi trường
- Ưu: một file, không hạ tầng, đúng tinh thần ADR-013.
- Nhược: **mất dữ liệu trên Live URL**. Deliverable #5 được chấm bằng cách mở từ máy lạ; scenario duyệt hôm trước biến mất hôm sau là hỏng đúng thứ đang được chấm.

### Lựa chọn 2: PostgreSQL ở mọi môi trường
- Ưu: một backend duy nhất, không lệch hành vi giữa dev và production.
- Nhược: test suite và người mới clone repo phải dựng Postgres mới chạy được `pytest`. Đang từ 0.15 giây lên vài chục giây và một container.

### Lựa chọn 3: SQLite cho local/test, PostgreSQL quản lý cho bản deploy, chung một repository layer
- Ưu: `pytest` vẫn chạy trong tích tắc không cần hạ tầng; Live URL durable thật.
- Nhược: hai backend SQL nghĩa là phải tránh cú pháp riêng của từng bên và phải test ít nhất một lần trên Postgres trước khi tin.

### Lựa chọn 4: Render PostgreSQL free
- **Loại.** Tài liệu Render: *"Free Render Postgres databases expire 30 days after creation."* Tạo hôm nay (04/08) thì hết hạn **03/09** — ba ngày trước hạn W6 (06/09). `docs/guide/free-accounts.md` của chương trình cũng cảnh báo đúng chỗ này và khuyên Supabase.

## Quyết định

**Lựa chọn 3.** Cụ thể:

### 3.1 Hai backend, một repository layer

| Môi trường | Store |
|---|---|
| Local dev, `pytest`, CI | SQLite (`data/app.db`) |
| Bản deploy có Live URL | **Supabase PostgreSQL** (500 MB free, không hết hạn theo ngày) |

Truy cập qua **SQLAlchemy Core** trong `src/services/`. Không viết SQL thô rải rác; không dùng cú pháp riêng của một backend. Embedding dùng `LargeBinary` — ánh xạ sang `BLOB` ở SQLite và `BYTEA` ở Postgres, cùng một code.

### 3.2 Bốn bảng

**`generation_requests`** — một lần bấm "Sinh kịch bản".
`request_id` (PK) · `description_vi` · `validation_mode` · `status` (`running` | `failed` | `done`) · `scenario_id` (NULL cho tới khi thành công) · `issue_history` (JSON) · `node_metrics` (JSON: tokens, cost, latency theo node) · `failed_reason` · `created_at` · `updated_at`

**`scenarios`** — kết quả sinh thành công.
`scenario_id` (PK) · `status` (`ScenarioStatus`) · `title` · `description_vi` · `spec` (JSON) · **`xosc_content` (TEXT)** · `assumptions` (JSON) · `tags` (JSON) · **`road_type`, `weather`, `actor_type`, `maneuver` (cột riêng, có index)** · `embedding` (BLOB, **NULL** cho tới khi duyệt) · `embedding_model` · `created_at`

**`review_decisions`** — append-only, không update, không xoá.
`id` (PK) · `scenario_id` · `gate` (`ReviewGate`) · `approved` · `reviewer` · `reason` · `created_at`

**`scenario_jobs`** — một lần chạy sim.
`job_id` (PK) · `scenario_id` · `status` (`JobStatus`) · `claimed_by` · `claimed_at` · `result` (JSON `ExecutionResult`) · `created_at` · `updated_at`

### 3.3 `ScenarioStatus` có đúng **bốn** trạng thái

```
pending_review · rejected · approved_library · pending_sim_review
```

`queued` / `running` / `done` / `failed` **không** phải trạng thái của scenario — chúng là `JobStatus`, đã có sẵn. Sơ đồ ở wireframe §7 gộp hai tầng vào một hình cho dễ nhìn; ADR này tách ra.

Transition hợp lệ, **không có đường nào khác**:

| Từ | Sự kiện | Sang |
|---|---|---|
| *(tạo)* | workflow kết thúc | `pending_review` |
| `pending_review` | reject `BEFORE_LIBRARY` | `rejected` *(kết thúc)* |
| `pending_review` | approve `BEFORE_LIBRARY` | `approved_library` *(+ ghi embedding)* |
| `approved_library` | yêu cầu chạy CARLA | `pending_sim_review` |
| `pending_sim_review` | reject `BEFORE_SIM` | `approved_library` |
| `pending_sim_review` | approve `BEFORE_SIM` | `approved_library` *(+ tạo `ScenarioJob`)* |

Khoá của bảng gồm **cả cổng**, không chỉ cặp trạng thái. Một quyết định gửi nhầm cổng — bấm `BEFORE_SIM` lên scenario đang `pending_review` — phải bị từ chối, nếu không hai cổng HITL trở thành hoán đổi được cho nhau và ràng buộc *"kỹ sư phải phê duyệt trước khi đưa vào bộ kiểm thử"* của đề bài mất hiệu lực. Trong code là `next_status_after_review(current, gate, approved)`, trả `None` cho mọi tổ hợp không hợp lệ.

### 3.4 `.xosc` nằm trong DB

`xosc_content` là TEXT trong bảng `scenarios`. **Đây là nguồn thật duy nhất** của nội dung file — không phải một đường dẫn trỏ ra filesystem.

`LibraryEntry.xosc_path` **tạm thời giữ nguyên nghĩa cũ** (đường dẫn) trong phiên bản này. Đổi nó thành URL tải về là thay đổi contract, phải đi kèm migration cho fixtures (`fixtures/execution_results/*.json`) và các test đang sinh ra `outputs/sc_999.xosc` — làm ở PR hiện thực API download, không nhét lẫn vào đây. `ExecutionResult.xosc_path` thì **không đổi**: nó là đường dẫn trên máy worker và đúng là một đường dẫn thật.

### 3.5 Embedding NULL cho tới khi duyệt

FR-03 và FR-11 bắt *"chỉ scenario qua `BEFORE_LIBRARY` mới được tìm lại"*. Thay vì trông vào một mệnh đề `WHERE status='approved_library'` mà ai cũng có thể quên, `scenarios.embedding` để **NULL** cho tới đúng lúc approve. Chưa duyệt thì không có vector, không có vector thì không thể lọt vào kết quả retrieval — dù người viết truy vấn có quên điều kiện.

### 3.6 Tiêu chí chuyển sang PostgreSQL — viết lại

`ARCHITECTURE.md` đang ghi *"chỉ chuyển khi cần durable storage ngoài process hoặc có concurrent writes"*. Điều kiện thứ nhất **đã đúng ngay từ lần deploy đầu tiên**, nên câu đó gây hiểu nhầm là "còn lâu mới cần". Viết lại thành:

- **Ngay khi deploy lên hạ tầng có filesystem ephemeral** (Render free) → PostgreSQL. Không chờ gì cả.
- Local, test, CI, và demo chạy trên máy có ổ đĩa thật → SQLite là đủ, không dựng Postgres cho vui.

## Lý do

1. **Deliverable #5 quyết định lựa chọn, không phải sở thích kỹ thuật.** Live URL được chấm bằng cách mở từ máy lạ. Một store mất dữ liệu sau mỗi lần redeploy thì không có gì để mở ra xem.
2. **`pytest` phải chạy được bằng `git clone` + `uv sync --locked`.** Bộ test hiện chạy trong 0.15 giây và không cần hạ tầng nào. Đánh đổi tính chất đó lấy sự đồng nhất môi trường là lỗ.
3. **Tách `generation_requests` khỏi `scenarios` là cách duy nhất tôn trọng FR-14.** Một lần sinh hỏng ở vòng repair thứ ba vẫn phải để lại dấu vết đầy đủ (issue history, cost đã tiêu) mà **không** đẻ ra một scenario giả trong thư viện. Hai vòng đời khác nhau thì hai bảng.
4. **Bốn trạng thái thay vì tám** vì `JobStatus` đã tồn tại. Nhân đôi `running`/`failed` ở hai tầng là mời gọi đúng loại bug khó thấy: hai cột cùng tên lệch nhau, và không ai biết cột nào mới là thật.
5. **Cột ODD riêng thay vì JSON** vì ADR-013 chốt lọc bằng `WHERE`. Nhét bốn trục vào một cột JSON thì `WHERE` phải đào vào JSON — chậm hơn, không index được, và mất luôn ràng buộc kiểu.
6. **Embedding NULL là ràng buộc cấu trúc, không phải quy ước.** Repo này đã chọn cách đó ở mọi chỗ khác (test chặn `import carla`, `extra="forbid"`). Một quy ước chỉ sống trong đầu người viết truy vấn thì sớm muộn cũng bị quên.

## Hệ quả

**Việc phải làm ngay trong PR hiện thực repository:**

- Thêm `ScenarioStatus` và bảng transition vào `schemas.py`, kèm test chặn transition sai — làm cùng ADR này.
- Đưa `sqlalchemy`, `alembic`, `psycopg2-binary` vào dependency backend trong `pyproject.toml`.
- Sửa `.env.example`: `DATABASE_URL` mặc định là SQLite cho local; ghi rõ bản deploy dùng chuỗi kết nối Supabase.
- Sửa `ARCHITECTURE.md` theo §3.6.
- `LibraryEntry.xosc_path` đổi thành URL tải về — **PR riêng**, phải migrate cùng lúc `fixtures/execution_results/*.json` và các test đang sinh `outputs/sc_999.xosc`, nếu không UI sẽ nhận về đường dẫn đĩa và dựng ra link chết.
- `data/` bị `.gitignore` nhưng SQLite không tự tạo thư mục cha; đã thêm `data/.gitkeep` để `git clone` + copy `.env.example` là chạy được ngay. Nếu sau này đổi đường dẫn DB thì kiểm lại chỗ này.

**Chi phí chấp nhận:**

- Hai backend SQL nghĩa là phải chạy thử ít nhất một lần trên Supabase trước tuần demo, không được tin rằng "SQLite pass thì Postgres cũng pass". Đưa vào W3 cùng batch CARLA.
- Supabase free có 500 MB và ngủ khi không dùng lâu — chấp nhận được ở quy mô dưới 1000 scenario, nhưng phải đánh thức trước buổi demo.

**Quan hệ với ADR-013:** không mâu thuẫn. ADR-013 chốt *không có vector store riêng*; embedding vẫn nằm cùng bảng với dữ liệu giao dịch, chỉ là bảng đó có thể là Postgres thay vì SQLite. Nếu về sau chạm ngưỡng đảo ngược của ADR-013, bước rẻ nhất là bật **pgvector** ngay trong Supabase (đã có sẵn) chứ không phải dựng lại Qdrant.
