# ADR-041 — Xuất OpenSCENARIO và chạy ScenarioRunner từ web

**Trạng thái:** Proposed 18/10/2026, theo yêu cầu người dùng.
**Phạm vi:** bổ sung ADR-027/039; giữ backend Java, lõi AEB Python và JSON kết quả nội bộ.

## Bối cảnh

Người dùng muốn tải `.xosc` thay cho JSON chạy CARLA và khởi chạy CARLA 0.9.16 local từ web, tương tự nhánh
`feature/carla-0.9.16-local`. Converter Forge cũ không hỗ trợ CP_CROSSING của IR hiện tại; lấy lại toàn Forge sẽ
đưa thêm FastAPI, SQLite và taxonomy không khớp vào sản phẩm.

## Quyết định

- Sinh OpenSCENARIO 1.0 bằng thư viện chuẩn ở worker, không LLM. XML mô tả cảnh thật và mang seed/source/AEB/xe bằng
  ParameterDeclarations. Chỉ hỗ trợ motif IR đã có, không tự diễn giải các category chưa được mô phỏng.
- Profile `carla-xosc` chạy ScenarioRunner, controller gọi lại AEB và bộ chấm hiện có. Runner trực tiếp và động học
  giữ nguyên; profile hiện tại có suffix `-xosc2` trong simulator identity nên không ghép regression với runner trực tiếp
  hoặc bản `-xosc1` có lỗi hướng người đi bộ. Artifact v2 yêu cầu xuất lại file v1.
- `.xosc` là artifact tải xuống/chạy ScenarioRunner; JSON bundle/result vẫn là giao tiếp nội bộ Java ↔ Python để
  giữ đủ metadata, kiểm seed/source và lưu kết quả bằng một luật chấm.
- Chạy từ web chỉ dành cho role được ghi, có hạn mức. Một server CARLA chạy tuần tự. Server GPU và ScenarioRunner
  ở cùng máy Windows chạy backend cho cấu hình local; không điều khiển GPU của máy khác qua trình duyệt.

## Hệ quả và kiểm chứng

File `.xosc` cần controller của repo để kiểm AEB của dự án (không thay bằng controller mặc định của ScenarioRunner).
Số CARLA vẫn dùng quan sát/đối chiếu vì TD-17. XML được kiểm schema/round-trip và luồng web được kiểm bằng mock cùng
CARLA thật; bằng chứng ở [exec plan](../exec-plans/completed/2026-10-18-xosc-carla-tren-web.md).
