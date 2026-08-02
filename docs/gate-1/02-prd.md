# Product Requirements Document — Scenario Forge

> **Mã đề tài:** P-130 · RAV-03<br>
> **Phiên bản:** Gate 1<br>
> **Trạng thái:** Target requirements — không phải tuyên bố implementation đã hoàn tất

## 1. Tổng quan

Scenario Forge chuyển mô tả tiếng Việt về một tình huống giao thông nguy hiểm
thành file OpenSCENARIO 1.0 (`.xosc`) để kỹ sư review, tải về và tuỳ chọn kiểm
chứng bằng CARLA ScenarioRunner.

### 1.1 Mục tiêu sản phẩm

- Giảm thao tác viết XML và cấu hình kịch bản bằng tay.
- Phát hiện sớm lỗi schema, logic và hình học trước khi dùng GPU.
- Tạo kho scenario đã được con người duyệt để retrieval ngày càng hữu ích.
- Giữ web generate/review/download hoạt động khi GPU worker offline.
- Tạo bằng chứng đo lường được về validity, retrieval và độ phủ ODD.

### 1.2 Không phải mục tiêu của MVP

- Điều khiển xe hoặc thiết bị thật.
- Hỗ trợ Isaac Sim hoặc simulator thứ hai.
- Sinh XML trực tiếp bằng LLM.
- Multi-agent/ReAct tự quyết định thứ tự công việc.
- Bao phủ mọi map và mọi topology của CARLA ngay trong phiên bản đầu.

## 2. Người dùng và nhu cầu

### 2.1 Creator — kỹ sư kiểm thử

**Nhu cầu:** diễn đạt tình huống bằng tiếng Việt, biết hệ thống đang xử lý đến
đâu, xem kết quả dễ hiểu và tải `.xosc` mà không phải đọc/sửa XML thủ công.

### 2.2 Reviewer — người chịu trách nhiệm duyệt

**Nhu cầu:** thấy câu gốc, các giả định, cảnh báo, nhãn ODD và preview 2D để quyết
định approve/reject có ghi nhận người chịu trách nhiệm và lý do.

## 3. Hành trình chính

### 3.1 Sinh kịch bản

1. Creator nhập mô tả tiếng Việt và chọn `validation_mode` là `static` hoặc
   `sim`.
2. Hệ thống trả một ID để client theo dõi trạng thái bất đồng bộ.
3. Workflow tạo draft, validate, repair tối đa ba vòng và convert thành `.xosc`.
4. Hệ thống lưu durable record ở trạng thái `pending_review`; workflow kết thúc.
5. UI hiển thị câu gốc, nội dung đã chuẩn hoá, warning và preview 2D.

### 3.2 Duyệt vào thư viện

1. Reviewer mở scenario `pending_review`.
2. Reviewer chọn Approve hoặc Reject; Reject bắt buộc có lý do.
3. Approve tại `BEFORE_LIBRARY` cho phép tải `.xosc` và đưa một projection của
   scenario vào Qdrant để retrieval.
4. Reject giữ bằng chứng quyết định nhưng không đưa scenario vào Qdrant.

### 3.3 Chạy mô phỏng

1. Người dùng yêu cầu chạy một scenario đã qua `BEFORE_LIBRARY`.
2. Reviewer quyết định tại `BEFORE_SIM`.
3. Nếu được duyệt, backend tạo `ScenarioJob` chứa `xosc_content`.
4. GPU worker pull job, chạy ScenarioRunner và báo `ExecutionResult` về backend.
5. UI hiển thị trạng thái chạy và các criteria; worker offline không ảnh hưởng
   generate/review/download ở static path.

## 4. Workflow mục tiêu

```text
parse_intent
  → retrieve
  → generate_draft
  → validate ↔ repair_draft
  → convert_xosc
  → persist_pending_review
```

- Chỉ `parse_intent`, `generate_draft` và `repair_draft` gọi LLM.
- `generate_draft` sinh `ScenarioDraft`; LLM không cấp `scenario_id`.
- Backend dùng `ScenarioSpec.promote()` để cấp ID và giữ nguyên câu tiếng Việt.
- Routing, validation, điều kiện dừng và trần ba vòng repair do code kiểm soát.
- Review, library admission và CARLA job là HTTP transactions sau workflow,
  không phải node đứng chờ trong RAM.

## 5. Yêu cầu chức năng

| ID | Yêu cầu | Acceptance criteria |
|---|---|---|
| FR-01 | Nhận mô tả tiếng Việt | Không nhận input rỗng; giữ nguyên câu gốc trong record hoàn chỉnh |
| FR-02 | Parse ODD | Trả `ODDQuery`; chỉ trường explicit/non-null mới thành Qdrant filter; thiếu dữ liệu bắt buộc phải làm rõ hoặc dùng default có ghi assumption |
| FR-03 | Retrieval | Chỉ tìm trong scenario đã qua `BEFORE_LIBRARY`; trả tối đa ba examples; không có kết quả vẫn đi tiếp được |
| FR-04 | Structured generation | LLM trả `ScenarioDraft` đúng schema, không tự sinh ID và không sinh XML |
| FR-05 | Static validation | Kiểm tra schema, actor references, trigger, ODD consistency và hình học; lỗi trả `ValidationIssue` có `code`, `path`, `message_vi`, `suggestion` |
| FR-06 | Repair | Chỉ lỗi sửa được mới gửi lại LLM; validate lại sau mỗi lần; dừng sau tối đa ba vòng |
| FR-07 | Conversion | Converter deterministic nhận `ScenarioSpec` và trả `xosc_content`; không gọi LLM và không cần CARLA |
| FR-08 | Durable pending state | Lưu spec, XML, provenance, assumptions và issue history trước khi kết thúc workflow |
| FR-09 | Preview 2D | Hiển thị làn, ego, các actor, vị trí tương đối, tốc độ và maneuver từ dữ liệu semantic |
| FR-10 | Review | Reviewer không được rỗng; Reject bắt buộc có reason; quyết định và gate được lưu lại |
| FR-11 | Library | Chỉ scenario approve tại `BEFORE_LIBRARY` mới được tìm lại và tải `.xosc` |
| FR-12 | Simulation job | Chỉ tạo job sau `BEFORE_SIM`; worker nhận `xosc_content`, không nhận `ScenarioSpec` và không cần chia sẻ filesystem |
| FR-13 | Result | Phân biệt `success` của lần chạy với `CollisionTest=FAILURE`; va chạm có thể là bằng chứng scenario đã tái hiện nguy hiểm |
| FR-14 | Failure handling | Lỗi validation, hết repair, converter lỗi, worker offline và simulation lỗi có trạng thái riêng; không báo thành công giả |

## 6. Quy tắc dữ liệu và nghiệp vụ

### 6.1 ODD

Ma trận đo phủ mục tiêu có bốn trục:

- `road_type`: 5 giá trị.
- `weather`: 4 giá trị.
- `actor_type`: 4 giá trị.
- `maneuver`: 7 giá trị.

Tổng không gian danh nghĩa là `5 × 4 × 4 × 7 = 560` ô. Mẫu số đánh giá thực tế
phải dùng `SupportPolicy.denominator()` để loại tổ hợp không được hỗ trợ.
`time_of_day` phục vụ dựng cảnh, không phải trục đo phủ ODD.

### 6.2 ScenarioDraft và ScenarioSpec

- `ScenarioDraft` chứa phần ngữ nghĩa do LLM sinh: title, ODD, thời điểm, actors,
  maneuvers và duration.
- `ScenarioSpec` là draft đã hợp lệ cộng `scenario_id` do backend cấp và
  `description_vi` được copy nguyên văn từ input.
- Đúng một actor có `is_ego=true`; ego không mang maneuver.
- `duration_s` phải lớn hơn 0 và không quá 120 giây.
- `lane_offset` thuộc `[-4, 4]`; `s_offset_m` thuộc `[-200, 200]` mét.

### 6.3 Persistence và retrieval

- Transactional store là nguồn thật của scenario, review và job; MVP dùng
  SQLite.
- Qdrant chỉ giữ embedding và payload/projection phục vụ retrieval.
- Chỉ scenario được duyệt mới trở thành positive few-shot example.
- Điều kiện chuyển SQLite sang PostgreSQL là quyết định mở, phụ thuộc deployment,
  concurrent writes và yêu cầu durable storage.

## 7. Yêu cầu phi chức năng

| ID | Yêu cầu |
|---|---|
| NFR-01 | `src/` không được `import carla`; CARLA chỉ nằm ở GPU worker riêng |
| NFR-02 | Static path phải hoạt động khi worker offline |
| NFR-03 | API keys và worker token chỉ đi qua secret/environment; không commit vào repo hoặc log |
| NFR-04 | Data contracts dùng validation nghiêm ngặt và từ chối trường lạ |
| NFR-05 | Workflow không giữ trạng thái chờ người duyệt trong process memory |
| NFR-06 | Cùng input đã chuẩn hoá và cùng template phải cho conversion deterministic |
| NFR-07 | Mọi kết quả đánh giá phải có dataset, lệnh chạy và artifact tái kiểm tra được |
| NFR-08 | Latency/cost phải được đo p50/p95 theo node và end-to-end trước khi chốt target |

## 8. Chỉ số đánh giá

| Metric | Định nghĩa |
|---|---|
| Schema-valid rate | Số draft qua schema validation / tổng draft |
| Static-valid rate | Số draft không còn blocking issue / tổng draft |
| Simulation validity | Số job có `ExecutionResult.success=true` / tổng job |
| Danger trigger rate | Tỷ lệ maneuver đạt oracle riêng của loại tình huống |
| Retrieval quality | Recall@k, MRR và nDCG trên golden queries cố định |
| ODD coverage | Số ô đủ điều kiện đã có scenario hợp lệ / `SupportPolicy.denominator()` |
| Cost/latency | Tokens, cost/request, p50 và p95 theo node và toàn luồng |

Ngưỡng pass chỉ được chốt sau baseline. Không trình bày target chưa đo như kết quả
đã đạt.

## 9. Trạng thái và lộ trình

- **Đã có:** data contracts, fixtures, routing, CI và CARLA smoke test với
  ScenarioRunner 0.9.15.
- **Đang triển khai:** static validator, converter, workflow đầy đủ, persistence,
  review/download/job API, Qdrant retrieval, frontend và GPU worker.
- **Vertical slice ưu tiên:** fixture/draft → validate → convert → pending review
  → approve → download; sau đó mới nối LLM/RAG và simulation worker.

## 10. Quyết định còn mở

- Persistence schema và tiêu chí SQLite → PostgreSQL.
- Durable storage cho `.xosc` khi deploy.
- Prompt, model và provider policy sau khi có baseline validity/cost/latency.
- Qdrant index parameters sau retrieval baseline.
- Danh sách maneuver/map thực sự được converter hỗ trợ.
- Oracle near-miss và controller cho adversarial evaluation.

## 11. Điều kiện nghiệm thu MVP

- Draft hợp lệ đi tới `.xosc` tải được.
- Draft lỗi dừng với đúng `ValidationIssue`; không tạo XML hoặc record thành công
  giả.
- Backend restart không làm mất pending scenario.
- Chỉ scenario qua `BEFORE_LIBRARY` mới xuất hiện trong retrieval.
- Không có job CARLA nếu chưa qua `BEFORE_SIM`.
- Worker offline không làm chết static path.
- Có bằng chứng thật cho happy path, failure path và các metric sản phẩm chính.
