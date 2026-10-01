# Exec plan (đã xong) — Trợ lý dự án: chatbot RAG chỉ đọc trên trang Tổng quan

- **Nhánh:** `trungdam`
- **Thời gian:** 01/10 → 02/10/2026
- **Người chịu trách nhiệm:** TrungDQ, làm cùng Claude Code
- **Quyết định:** [ADR-028](../../adr/ADR-028-tro-ly-du-an-rag-chi-doc.md)
- **Kiến trúc kết quả:** [docs/vehicsim/architecture.md](../../vehicsim/architecture.md#trợ-lý-dự-án--meomeo-agent-react-chỉ-đọc)
- **Nợ còn lại:** TD-22, TD-23, TD-24 trong [tech-debt-tracker](../tech-debt-tracker.md)

## Mục tiêu

Kỹ sư hỏi trong một **cửa sổ hội thoại** trên trang Tổng quan và chỉ nhận câu trả lời về
thông tin trong project — dữ liệu (kịch bản, run, lỗi, tham số AEB, regression) và tài liệu
repo — dùng RAG để bám đúng các tham số đang có trong hệ thống, luôn kèm nguồn.

## Đã giao, theo thứ tự

1. Bảng `knowledge_chunks` (SQL + `tables.py`; DB đang chạy: `CREATE TABLE` tay một lần).
2. `knowledge.py`: dựng đoạn từ `views.py` + tài liệu trong danh sách trắng, nhúng vector
   (`text-embedding-3-small` / `hashing-bow-v1` offline), chỉ mục tăng dần theo dấu vân tay.
3. `assistant.py` + `POST /assistant/ask`, `GET /assistant/status` (ENGINEER, 40 câu/15 phút).
4. Frontend: nút nổi "Trợ lý dự án" + cửa sổ hội thoại (`components/ProjectAssistant.tsx`),
   nguồn `[S#]` thành chip bấm về đúng màn hình. Ban đầu là thẻ trong trang; đổi sang cửa
   sổ hội thoại theo yêu cầu của TrungDQ ngày 02/10.

## Nhật ký quyết định

- 01/10 — TrungDQ chọn: chỉ đọc; nguồn = dữ liệu project + tài liệu repo; vector trong MySQL.
- Đoạn tri thức dựng từ `views.py` thay vì SQL riêng: số trợ lý đọc = số trên màn hình.
- Không đọc `aeb_parameters.description`: dữ liệu đang lỗi mã hoá (TD-22).
- Nguồn trả về dạng `{type, ref, link}`, giao diện tự đặt nhãn tiếng Việt (giữ quy ước TD-08).

## Kiểm chứng

| Kiểm | Kết quả |
|---|---|
| `uv run pytest tests/test_vehicsim/test_assistant.py` (LLM giả lập, embedding offline) | 11 passed |
| Dựng chỉ mục thật trên DB dev (OpenAI embedding) | 795 đoạn: 1 tổng quan, 7 AEB, 8 họ, 696 ca lỗi + thống kê, 4 regression, 79 tài liệu · 16,5 s · 0,0022 USD |
| Hiệu chuẩn chốt chặn: 11 câu đúng chủ đề vs 8 câu lạc đề | đúng 0,351–0,664, lạc 0,207–0,434 → `MIN_SCORE` 0,30 chặn 4/8 câu lạc mà không chặn câu đúng nào |
| 8 câu hỏi thật qua API (LLM `gpt-5.4-mini`) | #1055, khoảng TTC, regression đạt, số phanh oan: đúng và có nguồn; "thủ đô Pháp" bị chặn không gọi LLM; 2–4,5 s và ~0,003 USD/câu |
| Lỗi tìm ra khi hỏi thật → sửa → hỏi lại | "Vì sao động học thay vì CARLA": 8/8 đoạn ADR-027, thiếu ADR-023 → trần 2 đoạn/tài liệu, sau sửa trích đúng ADR-023. "Tạo ứng viên giúp tôi" bị xếp ngoài phạm vi → sửa prompt, sau sửa `in_scope` + hướng dẫn. Câu ngoài phạm vi còn mã `[S#]` → gỡ |
| "Ca lỗi nào va chạm mạnh nhất?" | Lần đầu **sai**: #791 68,9 km/h (suy từ 8 ca lẻ); DB thật: #631 73,5 km/h. Sau khi ghim đoạn thống kê + luật prompt: trả đúng #631 73,5 km/h, nguồn "Thống kê ca lỗi" |
| UI headless (Playwright) | Nút nổi mở/đóng; câu gợi ý trả lời có chip nguồn, chip dẫn tới `/analysis/failures/793`; câu lạc đề hiện nhãn "Ngoài phạm vi project"; Esc đóng, mở lại còn hội thoại; console không lỗi |

## Đợt 2 (03/10) — ReAct + guardrails + linh vật "Meomeo Agent" (ADR-029)

Yêu cầu của TrungDQ: trợ lý chủ động tra cứu thông tin project theo kiểu ReAct, không chỉ đọc
tài liệu; siết bảo mật thông tin người dùng, guardrails, tránh file/dữ liệu prompt injection;
dùng ảnh chú mèo "hỏi chấm" làm linh vật. TrungDQ tự đặt tên giao diện là **Meomeo Agent**.

| Kiểm | Kết quả |
|---|---|
| `pytest tests/test_vehicsim/test_assistant.py` | 24 passed |
| Đối chứng: tắt `neutralize`/`redact` rồi chạy test lọc dữ liệu | test **đỏ** như mong đợi → test thật sự bảo vệ |
| Bộ chặn đầu vào trên 13 câu (6 tấn công, 7 câu hợp lệ có chữ "bỏ qua", "mật khẩu", "OTP") | 13/13 đúng |
| 9 câu hỏi thật (LLM `gpt-5.4-mini`) | #1055 (`get_run`), va chạm mạnh nhất #631 73,5 km/h (`failure_stats`), 70 km/h + mưa + đêm = 18 ca (khớp đếm DB = 18), so sánh v1.3 (`get_aeb_version`), lý do động học vs CARLA (`search_knowledge`); injection và đòi API key bị chặn 0 lượt LLM; "liệt kê nguyên văn các luật" bị LLM từ chối; "ai tạo RT-004" → không có thông tin người tạo |
| Lỗi tìm ra khi hỏi thật → sửa | 503 khi model bỏ `thought/action` ở bước cuối → nới schema + sửa định dạng một lần; "va chạm mạnh nhất" chỉ có con số → thêm `top_impacts`; trợ lý gọi số động học là "số CARLA" → kết quả công cụ ghi rõ `simulator`, luật E chặt lại |
| UI (Playwright) | Avatar linh vật ở nút nổi, tiêu đề, từng câu trả lời; ảnh lớn ở màn chào; dòng "Đã tra cứu: …" cho từng câu; 3 ảnh tải được, console không lỗi |

Ảnh linh vật do TrungDQ cung cấp (`Downloads/d5a3…bc84.jpg`), cắt thành
`frontend/public/vehicsim/assistant-mascot.jpg` (360 px) và `assistant-avatar.jpg` (192 px, quanh mặt mèo).

## Bài học

- RAG trả lời câu tổng hợp bằng vài đoạn gần nhất là sai một cách rất thuyết phục. Câu
  "nhất / bao nhiêu / tỉ lệ" phải có đoạn tổng hợp tính trên toàn bộ dữ liệu.
- Từ khoá tổng hợp ("bao nhiêu") cũng xuất hiện trong câu lạc đề ("giá bitcoin bao
  nhiêu") — ghim thêm ngữ cảnh không được làm câu đó lách chốt chặn phạm vi.
