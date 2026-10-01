# ADR-028 — Trợ lý dự án: RAG chỉ đọc trên dữ liệu project + tài liệu repo, vector trong MySQL

**Trạng thái:** Proposed 02/10/2026 — **cơ chế trả lời bị thay bởi ADR-029** (03/10: ReAct + guardrails); chỉ mục `knowledge_chunks` vẫn theo ADR này
**Phạm vi:** VehicSim — cửa sổ hội thoại trên trang Tổng quan, `src/services/vehicsim/{knowledge,assistant}.py`

## Bối cảnh

Kỹ sư cần hỏi nhanh về chính project đang làm ("lượt chạy #1055 lỗi gì?", "TTC_THRESHOLD
được phép trong khoảng nào?", "regression nào đạt?") mà không phải lục qua 6 màn hình hay
đọc ADR. Câu trả lời phải đúng với dữ liệu thật, có nguồn để kiểm, và không được trở
thành đường tắt để thay đổi hệ thống (luật "không bao giờ tự Accept", ADR-025).

## Các lựa chọn đã cân nhắc (TrungDQ chọn ngày 02/10)

| Câu hỏi | Chọn | Bỏ |
|---|---|---|
| Quyền của trợ lý | **Chỉ đọc + giải thích** | Soạn đề xuất tham số; tự tạo candidate/chạy regression |
| Nguồn tri thức | **Dữ liệu project (DB) + tài liệu repo** | Chỉ DB; chỉ tài liệu/code |
| Lưu vector | **Bảng `knowledge_chunks` trong MySQL** (28 bảng) | Qdrant (thêm container); không vector (chỉ từ khoá) |

## Quyết định

- **Đoạn tri thức** dựng từ chính các view màn hình (`views.py`), nên số trợ lý đọc là số
  kỹ sư thấy: tổng quan, danh mục 10 tham số, từng AEB version, từng họ kịch bản, từng ca
  lỗi, **đoạn thống kê toàn bộ ca lỗi**, từng regression + khuyến nghị. Tài liệu chỉ lấy
  từ danh sách trắng `DOC_SOURCES` (không bao giờ `.env`, code).
- **Chỉ mục tăng dần:** so `content_hash`, chỉ nhúng đoạn mới/đổi; dấu vân tay dữ liệu
  lưu Redis nên câu hỏi không dựng lại khi không có gì đổi. Lần đầu trên DB dev: 795
  đoạn, 16,5 s, 0,0022 USD.
- **Vector** `text-embedding-3-small` (ADR-006) dạng BLOB + cosine NumPy như Forge
  (ADR-013); không có OpenAI key thì `hashing-bow-v1` offline (test dùng).
- **Truy xuất:** cosine top 8, tối đa 2 đoạn mỗi tài liệu và 5 ca lẻ; mã được nhắc thẳng
  (#1055, RT-004, v1.3, mã tham số) luôn vào ngữ cảnh; câu tổng hợp ("nhất", "bao nhiêu",
  "tỉ lệ") luôn kèm đoạn thống kê + tổng quan.
- **Trả lời** qua `llm.call_with_escalation` với schema `{scope, answer, citations}`;
  backend chỉ giữ nguồn có thật trong ngữ cảnh, gỡ mã bịa. Câu không chạm đoạn nào đủ gần
  (dưới `MIN_SCORE`) bị từ chối **trước khi** gọi LLM.

## Lý do

- Đo trên DB dev: câu đúng chủ đề có điểm 0,351–0,664, câu lạc đề 0,207–0,434; ngưỡng 0,30
  chặn nửa số câu lạc đề mà không chặn câu đúng nào, phần còn lại LLM tự từ chối.
- Hai lỗi đo được trong lúc làm đã thành luật truy xuất: ADR dài chiếm hết ngữ cảnh
  (→ trần 2 đoạn/tài liệu); "va chạm mạnh nhất" trả sai #791 68,9 km/h vì suy từ 8 ca lẻ,
  thật là #631 73,5 km/h (→ ghim đoạn thống kê + luật prompt cấm suy cực trị từ ca lẻ).
- MySQL thay vì Qdrant: không thêm dịch vụ trên máy dev đã chật RAM (CARLA ~4–8 GB), dữ
  liệu ~800 đoạn quá nhỏ để cần vector DB riêng.

## Hệ quả

- Báo cáo §2.1.3 ghi Qdrant cho vector — nay là bảng MySQL; cần cập nhật báo cáo (TD-24).
- Trợ lý chỉ biết những gì nằm trong đoạn tri thức: câu tổng hợp ngoài các chiều của đoạn
  thống kê (vd. theo tháng) sẽ được trả lời "không có trong dữ liệu".
- Máy kiểm: `test_assistant_never_writes_project_data`,
  `test_react_loop_calls_tools_and_cites_only_what_they_returned`,
  `test_off_topic_question_is_refused_without_calling_the_llm`,
  `test_aggregate_questions_always_get_the_statistics`,
  `test_index_is_incremental_and_follows_data_changes`, `test_only_whitelisted_docs_are_indexed`.
