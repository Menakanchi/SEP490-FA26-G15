# 19/10/2026 — Sửa quỹ đạo người đi bộ trong CARLA

## Vấn đề và phạm vi

Người dùng quan sát người đi bộ đi dọc hướng xe thay vì băng ngang đường. Giữ nguyên AEB và bộ động học.
Chỉnh bộ xuất OpenSCENARIO tại nơi tạo LanePosition, kiểm cả nhánh băng ngang và dừng lề.
Giữ các thay đổi/tài liệu hủy lô CARLA đang có trong checkout.

## Kiểm chứng và thực hiện

1. Đối chiếu XML với parser ScenarioRunner 0.9.16, tái hiện tọa độ quỹ đạo sai bằng parser thật trên Town04.
2. Bỏ Orientation xoay trục offset của LanePosition; regression test quỹ đạo ngang và golden XSD.
3. Đổi artifact sang `vehicsim.xosc/v2`, simulator sang `carla-0.9.16-xosc2`; không ghép run/baseline cũ với kết quả đã sửa.
4. Đo chuyển động người đi bộ trên CARLA thật: độ dịch chuyển dọc nhỏ và dịch chuyển ngang dương; xem ảnh đã ghi.
5. Chạy Python/Java/frontend gates liên quan, cập nhật tài liệu và khởi động lại backend với code hiện hành.

Hoàn thành 19/10/2026. Lô web cũ đã được hủy trước khi kiểm thử; không chạy CLI song song với lô web.

## Nguyên nhân và bản sửa

Parser ScenarioRunner v0.9.16 cộng Orientation vào góc waypoint trước khi áp dụng LanePosition.offset
(`srunner/tools/openscenario_parser.py`, khoảng dòng 839–857). Heading π/2 trên cả điểm spawn và hai đỉnh quỹ đạo
làm độ lệch ngang bị xoay thành tọa độ dọc đường. Controller người đi bộ đi đúng hai tọa độ sai này.

Bỏ Orientation khỏi LanePosition, để offset theo trục làn đường và controller tự hướng tới waypoint kế tiếp.
Không sửa installation ScenarioRunner, AEB hoặc kết quả động học. Artifact v1 bị từ chối với yêu cầu xuất lại.
Java tạo run/replay mới có identity xosc2, từ chối run xosc1 chưa chạy trước khi gọi worker, và UI nhận profile xosc2.

## Bằng chứng

- Parser thật trên map Town04, cùng hai điểm s=61,666… và offset ±3,6:
  XML cũ dịch **−7,18065 m dọc / 0,000002 m ngang**; XML mới **0,000001 m dọc / +7,19033 m ngang**.
- Đo CARLA thật ở 10 km/h, trigger 80 m, người đi bộ 1,5 m/s (case dài để quan sát hết lần băng ngang):
  **242 mẫu**, 206 mẫu đang đi; bắt đầu y=−3,595 m, đi sang bên trái; độ dao động dọc cả lượt **0,06155 m**,
  tốc độ dọc tối đa **0,04094 m/s**, tốc độ ngang tối đa **1,500 m/s**.
  Lượt này chủ ý quan sát tới hết cửa sổ 12 s, end_reason TIMEOUT; không phải lỗi tiến trình.
  Tọa độ thật, camera trên cao và bản tổng hợp ở `data/crossing-direction-proof/` (gitignore).
- Kiểm web sau đăng nhập trên DB sao chép: family 15 có một biến thể, bấm chạy tạo run **1584**, simulator
  `carla-0.9.16-xosc2`, **78 frame**, **16 ảnh RGB**, end_reason **EGO_STOPPED**, không va chạm trong ca thử.
  Người đi bộ từ y=−3,6 tới +2,274 m, tốc độ ngang tối đa 3 m/s; AEB quyết định ở 2,3 s.
  Tải `.xosc` bằng nút trên web xác nhận format v2, source simulator xosc2 và không có Orientation trên LanePosition.
- Ảnh UI: `data/crossing-direction-proof/web-xosc2-proof.png` và `web-crossing-detail.png`; đã xem camera và kéo thanh ảnh.
  Bố cục dùng token sẵn có, chỉ đổi điều kiện bật nút theo phiên bản; Figma riêng tư chưa truy cập được như lần kiểm trước.
- `mvnw.cmd clean package`: **122 test đạt**, gồm XSD, identity/replay và chặn run xosc1 cũ.
- Python: **78 test đạt**, ruff đạt; test hình học của cả băng ngang/dừng lề đã đỏ trước sửa và xanh sau sửa.
- Frontend: lint, `tsc --noEmit`, `next build` đạt (16 routes); backend chính đã khởi động lại, health UP.

## Giới hạn còn lại

Thay đổi này sửa hướng đường đi. Hành vi dừng ở waypoint cuối của controller mặc định cần sửa riêng (TD-47);
không dùng nhánh dừng lề làm bằng chứng phanh oan khi chưa kiểm chứng. Phanh chưa hiệu chuẩn vẫn theo TD-17.
Không dùng kết quả xosc1 để so regression với xosc2; cần tạo/chạy lại baseline bằng phiên bản hiện tại.
