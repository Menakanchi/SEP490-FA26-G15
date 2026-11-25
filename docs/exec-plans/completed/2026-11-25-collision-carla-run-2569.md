# Kiểm tra sai lệch va chạm CARLA ở lượt #2569

## Kết quả

- `-xosc15` kết thúc theo hình học ở khoảng 3,42 s, trước khi cảm biến CARLA ghi tiếp xúc. Chạy lại tái hiện mâu thuẫn; #2570 có sự kiện va chạm thật.
- Theo [ADR-066](../../adr/ADR-066-xac-nhan-va-cham-nguoi-di-bo-carla.md), `-xosc16` chờ tín hiệu cảm biến cho ca người đi bộ; nếu chỉ có chồng lấn chưa xác nhận khi kết thúc, lượt báo lỗi. Không thay artifact cũ.
- CARLA thật với kịch bản/seed 49082 tương ứng #2569: cảm biến ghi va chạm 3,46 s, lõi ghi `COLLISION` 3,47 s. Tốc độ 7,415 m/s và 7,322 m/s lấy từ mẫu và nguồn khác nhau.
- CARLA thật với kịch bản/seed 49061 tương ứng #2557: `EGO_STOPPED`, người đã bước vào đường, không va chạm và không có sự kiện. Kết quả kiểm thử lưu ngoài DB, kèm video.
- Java: kiểm thử toàn bộ và kiểm thử riêng việc giữ tương thích v15/v16; worker: `ruff check worker`, `pytest worker/tests -q`. Backend đã khởi động lại, `/health` trả `UP`.

## Giới hạn

Callback cảm biến bất đồng bộ; thời điểm và vận tốc tại tick lõi nhận tín hiệu không nhất thiết là vận tốc trước tiếp xúc. Các kết quả cũ vẫn có thể chứa bằng chứng không khớp, không được tự sửa. Xe phía trước giữ cơ chế trước đây; chưa chứng minh mọi kịch bản và hình dạng xe.
