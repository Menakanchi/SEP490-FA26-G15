# One-page Brief — Scenario Forge

> **Mã đề tài:** P-130 · RAV-03<br>
> **Sản phẩm:** Scenario Forge<br>
> **Giai đoạn:** Gate 1 — Chốt bài toán và thiết kế

## Bài toán

Kỹ sư kiểm thử xe tự hành cần biến các corner case giao thông thành kịch bản mô
phỏng có cấu trúc. Viết OpenSCENARIO XML thủ công khó kiểm soát lỗi ngữ nghĩa,
lỗi hình học và độ phủ tình huống. CARLA lại cần máy có GPU nên không phù hợp để
đặt trong luồng web bắt buộc.

## Người dùng

- **Creator — kỹ sư kiểm thử:** mô tả tình huống bằng tiếng Việt, xem trước kết
  quả và tải file kịch bản.
- **Reviewer — người chịu trách nhiệm duyệt:** kiểm tra ý nghĩa, cảnh báo và bố
  trí phương tiện trước khi cho kịch bản vào thư viện hoặc chạy mô phỏng.

## Input → Output

> **Input:** “Xe máy chạy từ phía sau, vượt lên, tạt đầu ô tô rồi phanh gấp.”<br>
> **Output:** `scenario.xosc` — file OpenSCENARIO 1.0 mô tả actors, vị trí, tốc
> độ, hành vi, trigger, môi trường và tiêu chí đánh giá.

## Giải pháp

Scenario Forge dùng workflow có thứ tự cố định:

1. Hiểu ý định, chuẩn hoá ODD và tìm tối đa ba scenario đã duyệt làm ví dụ.
2. LLM sinh `ScenarioDraft`; code kiểm tra schema, bất biến và hình học.
3. Lỗi sửa được quay lại LLM tối đa ba vòng; lỗi không sửa được dừng rõ ràng.
4. Backend cấp ID, tạo `ScenarioSpec`; converter deterministic sinh `.xosc`.
5. Lưu `pending_review` để con người duyệt, thay vì giữ graph chờ trong RAM.

Chỉ scenario qua `BEFORE_LIBRARY` mới được tải và dùng cho retrieval. Khi người
dùng yêu cầu kiểm chứng 3D, scenario phải qua `BEFORE_SIM` trước khi GPU worker
chạy CARLA ScenarioRunner. Web vẫn sinh/review/download được khi worker offline.

## Phạm vi MVP

| Trong phạm vi | Ngoài phạm vi |
|---|---|
| Nhập mô tả tiếng Việt | Điều khiển xe/thiết bị thật |
| Sinh, validate, repair và tải `.xosc` | Isaac Sim hoặc simulator thứ hai |
| Preview 2D và hai cổng HITL | Multi-agent/ReAct tự do |
| Retrieval + ODD filters | LLM sinh trực tiếp XML |
| CARLA worker tuỳ chọn | Hỗ trợ ngay mọi CARLA map |

## Giá trị và dấu hiệu thành công

- LLM xử lý ngữ nghĩa; code giữ thứ tự, validation và XML.
- Draft hợp lệ tạo được `.xosc` không cần GPU; draft lỗi trả `ValidationIssue`
  có cấu trúc.
- Chỉ scenario được duyệt mới vào thư viện; kết quả có bằng chứng thật về
  validity, retrieval, ODD coverage, latency và cost.

> **Trạng thái Gate 1:** contracts, fixtures, routing, CI và CARLA smoke test đã
> có. Workflow đầy đủ, converter, RAG, review API, frontend và worker vẫn đang
> được triển khai.
