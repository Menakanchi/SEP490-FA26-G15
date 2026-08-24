# ADR-021 — Đánh giá controller tách khỏi xác minh kịch bản

**Trạng thái:** Accepted 24/08/2026
**Phạm vi:** closed-loop với mô hình lái trên worker CARLA

## Bối cảnh

Lượt CARLA hiện có trả lời câu hỏi *"artifact có tái hiện đúng nguy hiểm không?"*.
Closed-loop lại hỏi câu khác: *"mô hình lái có tránh được nguy hiểm đó không?"*.
Nếu dùng kết quả BehaviorAgent để cập nhật `VerificationLevel`, một controller tốt
sẽ làm kịch bản từ `adversarial` thành `ran_no_hazard` và xoá chính bằng chứng cần
dùng làm baseline.

ScenarioRunner cũng không cho dùng CLI `--agent` cùng OpenSCENARIO. Chạy một tiến
trình ngoài để cùng điều khiển ego tạo hai chủ sở hữu lệnh ga/phanh/lái trong một
tick và kết quả không còn truy được nguyên nhân.

## Quyết định

1. Có hai loại job bền vững:
   - `scenario_validation`: controller mặc định của ScenarioRunner, được phép mở
     cổng thư viện và cập nhật `VerificationLevel`;
   - `controller_evaluation`: chạy sau khi scenario đã `approved_library`, chỉ lưu
     kết quả mô hình lái, không đổi trạng thái duyệt hay mức xác minh.
2. Worker chèn `ControllerAction` vào **bản XOSC tạm lúc runtime**. Artifact đã
   review không đổi và không chứa đường dẫn module cục bộ của máy GPU.
3. `BehaviorAgentControl` thực thi bên trong tick loop `ActorControl` của
   ScenarioRunner. Tốc độ mục tiêu vẫn lấy từ scenario để phép A/B chỉ đổi
   controller; PID ngang dùng bộ hệ số ổn định của `NpcVehicleControl`.
4. Mỗi lần đánh giá xếp một **cặp job mới**: controller mặc định và
   BehaviorAgent trên cùng artifact/worker. Không so controller hiện tại với
   baseline lịch sử có thể được đo bằng code khác phiên bản.
5. API/UI kiểm chênh vận tốc ego ở giây 2 trước khi kết luận. Controller tránh
   được thì đề xuất biến thể khó hơn; controller va chạm thì giữ scenario làm ca
   regression. Chưa tự động chạy vô hạn.

## Bằng chứng nghiệm thu

Trên `sc_011` (xe máy vượt, tạt đầu rồi phanh), cặp chạy cuối:

- vận tốc ego ở giây 2 chỉ lệch **0,019 m/s** giữa hai lượt;
- baseline: không phanh, va chạm ở 10,823 s;
- BehaviorAgent: phanh 0,5, giảm 3,676 m/s sau đỉnh nhưng vẫn va chạm ở
  10,750 s — một controller failure thật;
- sau khi hiệu chỉnh tuyến/PID: góc lái cực đại 0,024, lệch tim làn 0,164 m,
  không còn đảo dấu góc lái vượt ngưỡng 0,05.

Lượt thử trước từng cho kết quả tránh được với khe hở 1,98 m, nhưng bị loại khỏi
bằng chứng nghiệm thu: adapter đã bỏ qua `set_init_speed()` nên BehaviorAgent chỉ
đạt khoảng 16,5 m/s trong khi baseline đạt gần 25 m/s. Kết quả đó đo lệch nhịp,
không đo năng lực tránh va chạm.

## Hệ quả

- Vòng ngoài ODD → batch → HITL → CARLA → feedback vẫn giữ nguyên; ADR này chỉ
  thêm vòng điều khiển trong từng lượt mô phỏng.
- Báo cáo M1/M2/M3 và `latest_execution_result` phải chỉ đọc
  `scenario_validation`, nếu không lượt controller sẽ làm sai số liệu sản phẩm.
- Muốn tích hợp controller khác chỉ cần thêm adapter worker và một giá trị enum;
  backend không được import CARLA hay object của mô hình lái.
