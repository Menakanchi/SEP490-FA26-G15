# Kiến trúc — Scenario Forge (RAV-03)

**Deliverable #3.** Sơ đồ chi tiết ở [`docs/architecture_diagram.md`](docs/architecture_diagram.md);
lý do từng quyết định ở [`docs/adr/`](docs/adr/README.md); kế hoạch và phân công ở
[`docs/plan.md`](docs/plan.md). Tài liệu này nối ba thứ đó lại.

> Nguồn sự thật về **hình dạng dữ liệu** là `src/models/schemas.py`.
> Nguồn sự thật về **quyết định** là `docs/adr/`. Tài liệu này vênh với chúng
> thì tài liệu này sai.

## 1. Tóm tắt

Kỹ sư gõ một câu tiếng Việt mô tả tình huống giao thông nguy hiểm. Hệ thống sinh
file **OpenSCENARIO 1.0 (`.xosc`)** chạy được bằng CARLA ScenarioRunner, bắt người
duyệt trước khi file được tải về, rồi lưu vào thư viện tìm lại được theo ngữ nghĩa
và theo nhãn ODD.

Ba ràng buộc định hình toàn bộ kiến trúc:

1. **Live URL phải sống trên hạ tầng miễn phí không GPU** ⇒ backend không bao giờ
   `import carla`; CARLA nằm ở worker riêng, pull job qua HTTP (ADR-001).
2. **Sản phẩm là file, không phải lần chạy sim** ⇒ `.xosc` tải được sau cổng duyệt 1
   là đủ để hệ thống có giá trị; simulation là tầng kiểm chứng tuỳ chọn.
3. **Người phải duyệt trước hành động rủi ro** ⇒ HITL không phải một màn hình, nó là
   một trạng thái trong database mà mọi đường đi đều phải qua.

## 2. Phân loại: workflow AI, không phải agent

Phân loại bằng một câu hỏi vận hành: **ai quyết thứ tự bước?**

| Mức | Ai quyết thứ tự | Forge? |
|---|---|:---:|
| Workflow AI | Người viết code quyết trước; LLM lo phần hiểu và sinh ngôn ngữ | ✅ |
| Agent (ReAct) | LLM tự quyết mỗi vòng gọi tool nào hay dừng | ❌ |
| Multi-agent | Nhiều LLM có vai riêng đàm phán với nhau | ❌ |

Với phạm vi hiện tại **không có** tình huống nào mà thứ tự bước phải khác đi, nên
để code điều phối cho dễ test, dễ đặt trần chi phí và dễ tìm lỗi. Đây là lựa chọn
có chủ đích, **không** phải làm cho dễ — lập luận đầy đủ + *điều kiện để phải đổi ý*
nằm ở `plan.md` §3 và ADR-007.

Hệ quả: **đúng 3 node được phép gọi LLM**, và điều kiện rẽ nhánh là hàm thuần.
Phần *điều kiện rẽ nhánh* đã có thật và có test — `src/agents/routing.py` +
`tests/test_agents/test_routing.py`, chạy không cần mock LLM. Phần *3 node* còn là
mục tiêu: `src/agents/graph.py` hiện vẫn là graph mẫu của template (§10).

## 3. Luồng xử lý

> ⚠ **Đây là kiến trúc mục tiêu, không phải mô tả hệ thống đã chạy.** Hôm nay mới
> có hợp đồng dữ liệu, fixtures và `routing.py`. Trạng thái từng phần ở §10.

```
POST /generate
  → guardrails            code   PII · injection · yêu cầu áp lên xe thật → từ chối
  → parse_intent          LLM    câu tiếng Việt → ODDQuery
  → with_defaults         code   điền trục bối cảnh, ghi lại thành assumptions
  → support_policy.check  code   không hỗ trợ / thiếu nội dung → 422 + gợi ý
  → retrieve              code   Qdrant: vector + payload filter → ≤3 few-shot
  → generate_draft        LLM    → ScenarioDraft
  → validate ↔ repair     code/LLM   tối đa 3 vòng
  → promote               code   cấp scenario_id, copy câu gốc → ScenarioSpec
  → convert_xosc          code   → .xosc
  → persist_pending_review code  → PostgreSQL, GRAPH KẾT THÚC
```

Sau đó là ba HTTP transaction độc lập — cổng duyệt 1, cổng duyệt 2, tạo job.
**Không** phải node trong graph: workflow kết thúc và ghi xuống DB, vì Render free
tier ngủ khi không có request nên mọi thứ "đứng chờ" trong RAM đều chắc chắn chết.

### Phân loại lỗi

Một câu hỏi quyết định tất cả: *sửa nội dung LLM sinh ra có làm lỗi này biến mất không?*

- **Có** → vào vòng repair. Lỗi schema, lỗi tham chiếu actor, lỗi hình học
  (chủ thể không bắt kịp ego, trigger bắn sau khi hết giờ, nhãn ODD không khớp thực tế).
- **Không** → dừng ngay, **không** đốt hết 3 vòng. Rate limit, lỗi DB, bug template
  converter, vượt ngân sách. Riêng vi phạm guardrail nằm ngoài vì lý do **an toàn**:
  đưa một prompt injection vào vòng repair là tặng cho người tấn công lượt thử thứ 2 và 3.

Danh sách code ở `REPAIRABLE_CODES` trong `schemas.py` — một chỗ duy nhất, và
`repairable_by_llm` là property dẫn xuất chứ không phải cờ ai cũng tự set được.

## 4. Ranh giới hệ thống

| Ranh giới | Đi qua nó là gì | Vì sao |
|---|---|---|
| cloud ↔ worker GPU | `ScenarioJob.xosc_content` (chuỗi XML) | Hai venv khác version không chia sẻ object Python được (ADR-001, ADR-002) |
| `ScenarioSpec` ↔ simulator | không có khái niệm riêng của CARLA trong spec | Thêm Isaac sau = viết converter thứ hai, không phải viết lại (ADR-005) |
| LLM ↔ backend | `ScenarioDraft` | `scenario_id` và `description_vi` do backend cấp — để model tự đặt id là trùng khoá chính |
| retrieval ↔ giao dịch | Qdrant chỉ giữ vector + payload | PostgreSQL là nguồn thật cho user/review/job (chờ ADR-011) |
| app ↔ provider LLM | `src/services/llm.py` | Đổi provider = đổi chuỗi `model=`, không sửa code (ADR-008) |

## 5. Thành phần

| Thành phần | Công nghệ | Quyết định |
|---|---|---|
| Frontend | Next.js 14 + Tailwind | Preview 2D vẽ từ `ScenarioSpec`, không parse XML |
| Backend | FastAPI, Python 3.11 | Không `import carla` — ADR-001 |
| Workflow | LangGraph | Thứ tự cố định, không ReAct — §2 |
| LLM gateway | LiteLLM | ADR-008 |
| Embeddings | OpenAI `text-embedding-3-small` | Không kéo torch vào image backend — ADR-006 |
| Vector store | Qdrant | Payload filter + vector search một lượt — ADR-003 |
| Dữ liệu giao dịch | PostgreSQL | Qdrant không phải DB giao dịch — chờ ADR-011 |
| Converter | `xml.etree` thuần | Test trong CI không cần GPU |
| Simulator | CARLA 0.9.15 + ScenarioRunner | Isaac ngoài phạm vi — ADR-005 |
| Worker | Python 3.8, venv riêng | Theo wheel CARLA — ADR-002 |

## 6. An toàn

- **HITL hai cổng.** Cổng 1 trước khi vào thư viện (yêu cầu của đề). Cổng 2 trước khi
  chạy simulation (chính sách đội, để kiểm soát GPU). Từ chối **bắt buộc** ghi lý do,
  và `reviewer` rỗng bị schema chặn — cổng duyệt không có người chịu trách nhiệm thì
  không phải cổng duyệt.
- **Chỉ scenario đã qua cổng 1** mới vào thư viện và mới quay lại làm few-shot. Rác
  lọt vào đây là rác nhân lên theo thời gian.
- **Guardrails chạy trước LLM call đầu tiên**, và vi phạm không bao giờ đi vào repair.
- Trần cứng: số actor, tốc độ, thời lượng, **3 vòng repair**, timeout simulation.
- Chỉ dữ liệu mô phỏng/công khai. Không có dữ liệu cá nhân thật trong hệ thống.
- Generate, review, simulate đều có audit log.

## 7. Chống bịa (hallucination)

Bốn tầng, xếp theo thứ tự rẻ trước:

1. **Biểu diễn không có chỗ để bịa.** Vị trí là `lane_offset` (−4…4) + `s_offset_m`
   (±200) tương đối so với ego, không phải toạ độ tự do. Không tồn tại giá trị "sai
   bản đồ" để sinh ra (ADR-010).
2. **Danh sách đóng.** Mọi trục ODD là enum; giá trị ngoài phạm vi thành lỗi schema.
3. **Static validator** kiểm *quan hệ hình học*: chủ thể có bắt kịp ego không, trigger
   có bắn kịp không, tạt xong có va được không. Loại lỗi này **hợp lệ hoàn toàn về
   schema** — chạy trót lọt, `success=true`, và không có gì xảy ra.
4. **CARLA thật**, khi có GPU.

## 8. Bảo mật

- Khoá API chỉ trong `.env` (đã ignore); `.env.example` chỉ có placeholder.
- Mọi input qua Pydantic với `extra="forbid"` — gõ sai tên trường là lỗi, không bị
  bỏ qua im lặng.
- Endpoint worker (`/internal/jobs`) bảo vệ bằng `WORKER_TOKEN`.
- Hai vai trò creator/reviewer; cấm tự duyệt scenario của chính mình.
- CORS giới hạn theo domain frontend.

## 9. Triển khai

Sơ đồ ở [`docs/architecture_diagram.md`](docs/architecture_diagram.md#triển-khai).
Backend + Qdrant + PostgreSQL chạy trên hạ tầng miễn phí không GPU; worker bật khi
cần và **pull** job. Worker offline không làm chết web — `validation_mode=static`
phục vụ được toàn bộ đường đi tới file `.xosc` tải được.

## 10. Trạng thái hiện tại

| Phần | Trạng thái |
|---|---|
| Hợp đồng dữ liệu (`schemas.py`) + fixtures | ✅ |
| Điều kiện rẽ nhánh (`routing.py`) | ✅ |
| ADR nền tảng (001–006, 010) | ✅ |
| `static_check.py` · `converter.py` · `templates.py` | ⏳ Tuấn Anh |
| Node LLM + nối graph | ⏳ Công |
| PostgreSQL + review/job API | ⏳ chặn bởi ADR-011 |
| Retrieval Qdrant + baseline | ⏳ Linh Đan |
| ADR-007 · ADR-008 · ADR-009 · ADR-011 | ⏳ |
| ADR-012 (`RelativeLanePosition`) | ⏳ Proposed — chờ smoke test `.xosc` |
