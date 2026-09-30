# ADR-026 — Bước 1 "Sinh từ mô tả" dùng lớp LLM chung, không dùng graph 7 node của Forge

**Trạng thái:** Proposed 30/09/2026
**Phạm vi:** `src/services/vehicsim/describe.py`, `POST /api/v1/vehicsim/scenarios/describe`, màn `/scenarios/new`

## Bối cảnh

Kế hoạch MVP: câu mô tả → LLM → **Scenario IR** (kiểm tra, tối đa 3 lần sửa, liệt kê
giá trị giả định) → sinh biến thể. Forge đã có `POST /generate` chạy graph 7 node
(parse_intent → … → `.xosc`), lưu vào SQLite và theo taxonomy ODD của Forge — taxonomy
này không có motif người đi bộ băng ngang (ADR-016). IR của VehicSim là đúng các tham
số mà simulator dùng.

## Các lựa chọn

1. Gọi `POST /generate` của Forge rồi dịch kết quả sang IR VehicSim.
2. Thêm node mới vào graph Forge.
3. Service riêng trong VehicSim, **dùng lại** hạ tầng LLM chung: `llm.call_with_escalation`
   (provider theo `LLM_PROVIDER`, structured output, leo model), `is_too_vague_to_generate`,
   đo chi phí, và lùi về luật khi LLM lỗi như `parse_intent`.

## Quyết định

Chọn (3). IR là `DescribedScenario` (Pydantic); LLM trả `null` cho trường câu không nói
tới, server điền mặc định và đánh dấu `assumed`; trường suy từ từ ngữ là `inferred`.
IR sai giới hạn được gửi lại cho LLM kèm lỗi, tối đa 3 lần. Họ tạo từ bước này lưu bản
gốc `NATURAL_LANGUAGE` với câu gốc, model và IR. Chỉ ENGINEER/ADMIN gọi được, 30 lượt /
15 phút / người.

## Lý do

- Tránh đi vòng qua `.xosc` và taxonomy không có motif cần dùng.
- Không thêm node gọi LLM vào graph Forge (graph giữ đúng 3 node LLM —
  `test_only_three_nodes_are_allowed_to_call_an_llm`).
- Vẫn một cửa cho provider: `test_nothing_imports_the_llm_provider_directly`.

## Hệ quả

- `ARCHITECTURE.md` nói "chỉ 3 node được gọi LLM" — đúng cho graph, nhưng repo có caller
  ngoài graph (`services/campaign.py`, `services/vehicsim/describe.py`); cần sửa câu chữ (TD-05).
- Test luôn mock `src.services.llm.call_with_escalation` (fixture chặn LLM thật vẫn hiệu
  lực vì `describe.py` gọi qua tên module).
- IR mới chỉ biểu diễn một motif; chi tiết khác đi vào `notes` (TD-14).
