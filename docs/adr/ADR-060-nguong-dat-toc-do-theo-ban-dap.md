# ADR-060 — Ngưỡng adapter đặt tốc độ theo xe và bàn đạp; khôi phục khâu bù (`.xosc` v13)

**Trạng thái:** ✅ Accepted 22/11/2026 — chủ dự án chốt; kiểm CARLA thật `-xosc13` 23/11 ([kết quả](../vehicsim/carla-ped-bench/ket-qua/kiem-v13-2026-11-23_0008/README.md)): e-tron c1 / c7 hết vọt giảm tốc, vị trí dừng lệch ≤ 0,03 m (trước 1,6–1,8 m).
**Liên quan:** sửa ADR-053 (ngưỡng 6 m/s), đính chính ADR-058 (bỏ khâu bù); cùng định danh v13 với ADR-059.

## Bối cảnh

Nhật ký bàn đạp của c1 trên CARLA thật `-xosc11` (`sensors/frames.csv`, repo phutro commit `2f4c08c`): giảm tốc tăng đều tới ~8 m/s² khi tốc độ còn 8,1 m/s,
rồi **18,8 m/s² từ ~8 m/s xuống 5,3 m/s** trong khi bàn đạp đứng ở 0,833 (khâu bù lúc đó kéo bàn đạp xuống, không đẩy lên); dưới 6 m/s adapter đặt tốc độ và
xe giảm đều 7,8 m/s². Như vậy:

- Giả thuyết của ADR-058 (khâu bù 0,05 × sai số gây vọt) **sai**.
- Cú dừng gấp của CARLA (TD-17, ADR-053) bắt đầu ở tốc độ **phụ thuộc bàn đạp và xe**, không cố định 6 m/s. Khung hình carla-ped-bench (giảm tốc > 12 m/s²,
  cửa sổ 0,04 s), không phụ thuộc tốc độ đầu:

| Xe | Bàn đạp ~0,4 | ~0,6 | ~0,8–0,9 | 1,0 |
|---|---|---|---|---|
| e-tron (đợt 3, 40–80 km/h) | 6,6 m/s | 7,6 | 8,3 | 8,6 |
| Model 3 (đợt 4, 50 / 70 km/h) | 6,3 | 7,2 | 7,9 | 7,9 |
| Patrol | 7,6 | 8,9 | 9,9 | 10,4 |
| Sprinter | 7,3 | 8,6 | 9,4 | 9,6 |

## Quyết định

1. Từ v13, xe có bảng bàn đạp (`CarlaPedalMap`) chuyển sang đặt tốc độ khi tốc độ dưới **điểm dừng gấp đo được ở bàn đạp đang đạp + 0,3 m/s** (nội suy theo
   bàn đạp, lấy tốc độ lớn nhất trong các tốc độ đầu đã đo, không dưới 6 m/s). Xe chưa có bảng và file cũ giữ 6 m/s.
2. Khôi phục khâu bù 0,05 × (lệnh − đo) ở v13; chỉ v12 bỏ khâu bù.
3. Thời điểm phanh đúng mốc và quãng dừng động học đúng bước (ADR-058) giữ nguyên.

## Hệ quả

- Đoạn đặt tốc độ (mô hình lý tưởng, không phải vật lý CARLA) dài hơn: ở phanh mạnh từ ~8,6 m/s (31 km/h) thay vì 6 m/s (22 km/h). Va chạm ở dải tốc độ này
  có phản ứng vật lý kém thật hơn (như ghi ở ADR-053).
- Cần chạy CARLA thật kiểm lại c1 / c7 và bộ ca 3 xe (exec plan 22/11, bước 4).

Kiểm thử: `CarlaSessionLogicTest#lowSpeedOverrideStartsBeforeTheMeasuredAbruptStop`.
