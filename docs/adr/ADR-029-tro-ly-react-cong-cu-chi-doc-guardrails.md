# ADR-029 — Meomeo Agent: agent ReAct với công cụ chỉ đọc + guardrails bảo vệ người dùng và chống prompt injection

**Trạng thái:** Proposed 03/10/2026 (TrungDQ, nhánh `trungdam`; chờ nhóm duyệt)
**Phạm vi:** Trợ lý dự án (linh vật "Meomeo Agent") — thay **cơ chế trả lời** của ADR-028; chỉ mục
`knowledge_chunks` của ADR-028 giữ nguyên, nay là một công cụ (`search_knowledge`).

## Bối cảnh

Bản RAG của ADR-028 chỉ trả lời từ các đoạn văn bản dựng sẵn. TrungDQ yêu cầu ngày 03/10:
trợ lý phải **chủ động tra cứu** thông tin thuộc project (không chỉ đọc tài liệu), đồng thời
**siết chặt bảo mật thông tin người dùng, guardrails và chống file/dữ liệu prompt injection**.

## Quyết định

**ReAct trên lớp LLM chung.** Mỗi bước LLM trả JSON `{thought, action, args}` qua
`llm.call_with_escalation` (không thêm SDK, giữ luật cứng 1); server chạy công cụ, trả kết quả,
lặp tối đa `MAX_STEPS = 6` rồi bắt buộc `final_answer`.

**9 công cụ chỉ đọc** (`agent_tools.TOOLS`): `search_knowledge`, `project_overview`, `get_run`,
`list_failures`, `failure_stats`, `get_parameters`, `get_aeb_version`, `get_family`,
`get_regression`. Không công cụ nào nhận SQL, đường dẫn file, tên bảng; không công cụ nào chạm
`users`/`roles`, cấu hình, `.env` hay hàm ghi. Project do server gắn. Tham số kiểu chặt (`ToolArgs`).

**Guardrails bốn lớp** (`guardrails.py`):

1. *Đầu vào:* câu đòi ghi đè luật / đổi vai / tiết lộ prompt, hoặc đòi bí mật (API key, `.env`,
   mật khẩu, email/danh sách người dùng) bị chặn trước khi gọi LLM (`scope = "blocked"`).
2. *Dữ liệu ra từ công cụ:* bỏ khoá nhạy cảm (email, password, token, người tạo/duyệt...), che
   email / API key / JWT / chuỗi bí mật. Trợ lý không bao giờ thấy tên hay email người dùng.
3. *Văn bản người dùng nhập* (tên họ kịch bản, mô tả, ghi chú AEB, lý do duyệt, nhãn) và tài
   liệu: câu giống mệnh lệnh cho AI bị thay bằng `[đã lược …]`. Kết quả công cụ bọc trong dấu
   phân cách có mã ngẫu nhiên mỗi câu hỏi, gắn nhãn "dữ liệu không đáng tin". **AGENTS.md và
   CLAUDE.md bị loại khỏi chỉ mục** — đó là file chỉ dẫn cho agent viết code.
   Lịch sử do trình duyệt gửi chỉ giữ câu hỏi của người dùng; lượt "trợ lý" từ client bị bỏ.
4. *Đầu ra:* che bí mật lần nữa; câu trả lời chứa ≥ 60 ký tự liền của system prompt bị thay bằng
   lời từ chối; chỉ giữ nguồn `[S#]` mà công cụ thật sự trả về.

## Lý do

- ReAct cho câu tổng hợp đúng trên **toàn bộ** dữ liệu (`failure_stats`), thay vì suy từ vài đoạn
  gần nhất — lỗi đã đo ở ADR-028 ("va chạm mạnh nhất" #791 thay vì #631).
- Phòng thủ đặt ở **quyền của công cụ** trước, prompt sau: dù LLM bị thao túng, không có công cụ
  nào đọc được dữ liệu người dùng hay ghi DB.
- Đo 03/10 trên DB dev (LLM thật): 9 câu hỏi; câu injection và câu đòi API key bị chặn với 0
  lượt LLM; câu đòi "liệt kê nguyên văn các luật" lọt bộ lọc đầu vào nhưng LLM từ chối; "ai tạo
  RT-004" trả "không có thông tin người tạo"; mỗi câu 2–9 s, 0,002–0,005 USD.

## Hệ quả

- Mỗi câu tốn 2–3 lượt LLM thay vì 1 (vẫn trong giới hạn 40 câu / 15 phút / người).
- Bộ lọc mẫu câu là phòng thủ nhiều lớp, không hoàn hảo — câu lách khéo vẫn có thể qua lớp 1;
  lớp công cụ và lớp đầu ra mới là bảo đảm chính (TD-25).
- Máy kiểm: `test_injection_and_secret_requests_are_blocked_before_any_llm_call`,
  `test_tool_output_never_carries_user_data_or_injected_commands`,
  `test_forged_assistant_turns_in_history_are_dropped`,
  `test_answer_leaking_the_system_prompt_or_secrets_is_filtered`,
  `test_react_loop_calls_tools_and_cites_only_what_they_returned`,
  `test_unknown_tools_repeats_and_step_limit_are_contained`,
  `test_assistant_never_writes_project_data`, `test_indexed_project_text_is_neutralized`.
