# 19/10/2026 — Hủy lô CARLA theo yêu cầu

Hủy phần chưa hoàn thành của lô BASELINE thuộc scenario 14: run 1743 đang chạy và run 1744–1781 đang chờ khi kiểm tra.
Giữ các lượt đã hoàn thành. Không xóa kịch bản hoặc kết quả.

1. Lưu trạng thái vào `data/maintenance/` (gitignore), chuyển các lượt chờ sang STOPPED để executor không nhận tiếp.
2. Dừng cây tiến trình worker của lượt đang chạy, chờ backend ghi nhận tiến trình đã kết thúc, rồi ghi STOPPED do người dùng hủy.
3. Kiểm không còn worker/hàng đợi của lô, trả CARLA về trạng thái sẵn sàng và kiểm backend health.

Hoàn thành 19/10/2026 lúc khoảng 20:10 (Asia/Saigon).

- Khi khóa phần hàng đợi để hủy, run 1743–1746 đã kết thúc; run 1747 đang chạy và 34 run 1748–1781 còn chờ.
  Chỉ hủy **35 run chưa hoàn thành**, giữ nguyên các run đã kết thúc.
- Snapshot trạng thái cũ ở `data/maintenance/cancel-carla-20261019-200949.json` (gitignore).
- Chuyển 34 run PENDING sang STOPPED trước; executor chỉ nhận PENDING nên không khởi động thêm biến thể khi worker hiện tại dừng.
- Dừng cây Python của run 1747, chờ backend ghi nhận worker đã kết thúc, rồi chuyển run này sang STOPPED cùng lý do `Cancelled by user`.
- Kiểm DB: 35 run STOPPED, 0 PENDING/RUNNING của lô. Không còn Python run_xosc/ScenarioRunner/follow_hero chạy.
- CARLA ở Town04 trả về chế độ thường (`synchronous_mode=False`), không còn actor hero/pedestrian của lượt chạy.
  Backend `/health` vẫn UP; không cần khởi động lại backend hoặc xóa dữ liệu.
- Chưa có route/nút hủy trong sản phẩm; tiếp tục theo TD-37.
