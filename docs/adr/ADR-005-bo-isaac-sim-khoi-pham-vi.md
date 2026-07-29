# ADR-005: Chỉ hỗ trợ CARLA/ScenarioRunner, đưa Isaac Sim ra ngoài phạm vi

**Ngày:** 2026-07-28
**Trạng thái:** Accepted

## Bối cảnh

Đề bài RAV-03 ghi tech stack là "CARLA/Isaac", có thể hiểu là hỗ trợ một trong hai hoặc cả hai.

Phần cứng khả dụng của nhóm: **một** laptop RTX 4060 **8GB VRAM**. Thời gian: 6 tuần cho 4 người, chưa ai trong nhóm từng cài và vận hành simulator.

## Các lựa chọn

### Lựa chọn 1: Hỗ trợ cả CARLA và Isaac Sim
- Ưu: phủ trọn cách đọc rộng nhất của đề bài; nghe "đầy đủ" hơn.
- Nhược: 8GB VRAM không kham nổi hai simulator; Isaac Sim đòi cấu hình nặng hơn CARLA đáng kể. Phải viết hai converter (OpenSCENARIO và USD), hai runner, hai bộ test. Nhân đôi phần rủi ro nhất của dự án trong khi chưa chắc phần đầu tiên chạy được.

### Lựa chọn 2: Chỉ Isaac Sim
- Ưu: —
- Nhược: đề bài nêu rõ "ScenarioRunner/OpenSCENARIO" và "file kịch bản chạy được"; ScenarioRunner là công cụ của CARLA. Chọn Isaac là đi ngược mô tả deliverable.

### Lựa chọn 3: Chỉ CARLA/ScenarioRunner, ghi rõ Isaac ngoài phạm vi
- Ưu: dồn toàn bộ thời gian vào một đường; `.xosc` là **chuẩn công nghiệp mở**, không khoá vào một simulator; ScenarioRunner lo sẵn spawn/weather/timeout/criteria nên lượng code tự viết ít hơn hẳn.
- Nhược: nếu người chấm đọc "CARLA/Isaac" là "phải có cả hai" thì thiếu — trừ khi nói rõ vì sao.

## Quyết định

**Lựa chọn 3.** Phạm vi dự án chỉ gồm CARLA + ScenarioRunner. Isaac Sim **ngoài phạm vi**, ghi rõ trong `docs/prd.md` mục "nằm ngoài phạm vi" và trong ADR này.

## Lý do

1. **Ràng buộc phần cứng là thật và đo được**: 8GB VRAM. Không phải ưu tiên mềm mà là trần vật lý.
2. Đề bài mô tả deliverable là "**file** kịch bản chạy được" và nêu "ScenarioRunner/OpenSCENARIO" — cả hai đều trỏ về CARLA.
3. Sản phẩm chính là **file `.xosc` theo chuẩn OpenSCENARIO 1.0**, không phải một tích hợp riêng cho CARLA. Bất kỳ công cụ nào đọc được OpenSCENARIO đều dùng được đầu ra của Forge. Giá trị không bị khoá vào một simulator.
4. Chọn phạm vi có chủ đích và **ghi lý do** là bằng chứng của PLO4/PLO6 (biết giới hạn hệ thống). Im lặng bỏ qua Isaac mới là thiếu sót.

## Hệ quả

- `docs/prd.md` phải có mục "Nằm ngoài phạm vi" nêu đích danh Isaac Sim kèm lý do phần cứng.
- Khi bị hỏi ở Demo Day, câu trả lời là **scoping decision có số liệu**, không phải "chúng em không kịp".
- Nếu sau này có GPU mạnh hơn (đang xin GPU server từ chương trình), việc thêm Isaac là **mở rộng converter thứ hai**, không phải viết lại — vì `ScenarioSpec` đã là biểu diễn trung gian độc lập simulator.
- Đường mở rộng đó **không** nằm trong 6 tuần này và không được phép chiếm thời gian của phần cơ bản.
