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
4. API/UI hiển thị baseline cạnh kết quả BehaviorAgent. Khi baseline va chạm mà
   controller tránh được, vòng kế tiếp là một quyết định có người: tạo biến thể
   khó hơn qua cơ chế tuning hiện có. Chưa tự động chạy vô hạn.

## Bằng chứng nghiệm thu

Trên `sc_011` (xe máy vượt, tạt đầu rồi phanh):

- baseline: không phanh, va chạm ở 10,60 s;
- BehaviorAgent: phanh, giảm 5,43 m/s sau đỉnh, giữ khe hở 1,98 m, không va chạm;
- sau khi hiệu chỉnh tuyến/PID: góc lái cực đại 0,024, lệch tim làn 0,164 m,
  không còn đảo dấu góc lái vượt ngưỡng 0,05.

## Hệ quả

- Vòng ngoài ODD → batch → HITL → CARLA → feedback vẫn giữ nguyên; ADR này chỉ
  thêm vòng điều khiển trong từng lượt mô phỏng.
- Báo cáo M1/M2/M3 và `latest_execution_result` phải chỉ đọc
  `scenario_validation`, nếu không lượt controller sẽ làm sai số liệu sản phẩm.
- Muốn tích hợp controller khác chỉ cần thêm adapter worker và một giá trị enum;
  backend không được import CARLA hay object của mô hình lái.
