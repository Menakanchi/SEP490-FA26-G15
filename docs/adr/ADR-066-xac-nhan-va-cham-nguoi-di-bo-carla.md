# ADR-066 — Xác nhận va chạm người đi bộ trên CARLA

**Trạng thái:** Proposed 25/11/2026 — đã kiểm chứng với hai ca CARLA thật; chờ nhóm thống nhất.

## Bối cảnh

Lượt #2569 dùng `-xosc15` dừng ngay khi hình học xấp xỉ của xe và người đi bộ chồng lấn; cảm biến CARLA chưa ghi sự kiện. Chạy lại cùng kịch bản và seed tái hiện khác biệt. Khi thử cho mô phỏng tiếp tục đến tín hiệu cảm biến, cảm biến ghi va chạm lúc 3,46 s và lõi nhận lúc 3,47 s. Hai mốc không nhất thiết đồng thời do callback bất đồng bộ.

## Quyết định

- Tách `.xosc` v16 / `-xosc16`; giữ nguyên cách đọc và tính của v15 cùng dữ liệu đã lưu. Không chạy lại run v15 bằng exporter v16, không ghép kết quả hai phiên bản.
- Với người đi bộ trên v16, không kết thúc chỉ vì hình học xấp xỉ chồng lấn; tiếp tục chờ tín hiệu va chạm từ CARLA. Nếu đã có chồng lấn nhưng lượt đến điều kiện kết thúc mà không có tín hiệu, báo không xác nhận thay vì kết luận an toàn.
- Va chạm hình học và cảm biến vật lý là hai nguồn bằng chứng khác nhau. Không tạo sự kiện cảm biến giả và không sửa artifact của #2569. Callback bất đồng bộ có thể đến sau tick va chạm; vận tốc lõi tại tick nhận tín hiệu là giá trị xấp xỉ, không khẳng định trùng vận tốc trước tiếp xúc của cảm biến.
- Trường hợp xe phía trước giữ cách xác định hiện có; không suy rộng kết quả một ca người đi bộ cho mọi loại kịch bản.

## Kiểm chứng

Kiểm thử tương thích v15/v16 và trạng thái chưa xác nhận. Ca tương ứng #2569, seed 49082: cảm biến ghi va chạm lúc 3,46 s, lõi kết thúc `COLLISION` lúc 3,47 s. Ca an toàn tương ứng #2557, seed 49061: `EGO_STOPPED`, không có sự kiện va chạm. Ca #2570 được kiểm đối chứng, cảm biến ghi va chạm. Các lượt kiểm tra độc lập lưu ngoài DB; tiếp tục giữ trạng thái mâu thuẫn nếu hai nguồn bằng chứng không khớp.
