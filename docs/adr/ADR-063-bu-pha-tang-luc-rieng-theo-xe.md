# ADR-063 — `.xosc` v15: bù pha tăng lực riêng cho Patrol (0,11 s) và Sprinter (0,17 s)

**Trạng thái:** ✅ Accepted 23/11/2026 — chủ dự án chốt; kiểm CARLA thật `-xosc15` đạt ([kết quả](../vehicsim/carla-ped-bench/ket-qua/kiem-v15-2026-11-23_0057/README.md)): Patrol +0,08 / +0,17 m, Sprinter +0,03 / +0,27 m (c1 / c7).
**Liên quan:** sửa mục 1 của [ADR-061](ADR-061-bu-pha-tang-luc-patrol-sprinter.md); [ADR-056](ADR-056-xosc10-bu-pha-tang-luc-phanh.md); đi cùng [ADR-062](ADR-062-nguoi-di-bo-tang-toc-dan.md) trong v15; TD-17.

## Bối cảnh

Kiểm CARLA thật `-xosc14` ([kết quả](../vehicsim/carla-ped-bench/ket-qua/kiem-v14-2026-11-23_0028/README.md)): với bù 0,055 s, quãng dừng vẫn dài hơn bộ động
học. Patrol +0,23 / +0,37 m, Sprinter +0,55 / +0,69 m (c1 khô / c7 mưa); trước khi bù là +0,49 / +0,66 và +0,80 / +1,01 m. Toàn bộ phần chênh hình thành trong
~0,5 s đầu, lúc lực phanh đang tăng (Sprinter 5,8 m/s² ở 0,4 s, mô hình 8). Sau đó giảm tốc khớp mô hình.

## Quyết định

1. Từ v15, thời gian bù pha tăng lực được đặt riêng theo xe (`CarlaPedalMap.Calibration.rampLeadV15S`): Patrol **0,11 s**, Sprinter **0,17 s**.
   - Hai con số ngoại suy tuyến tính từ v13 → v14 (0,055 s bớt ~0,25 m) để đưa quãng dừng c1 / c7 về khoảng 0 m.
   - e-tron, Model 3 và file v14 giữ `RAMP_LEAD_S` = 0,055 s.
2. Lệnh feed-forward = `a + lead · max(0, da/dt)`. Với lệnh tăng 20 m/s³, phần cộng thêm là 2,2 m/s² (Patrol) và 3,4 m/s² (Sprinter); phần này về 0 khi lệnh thôi tăng.
3. `result.json` của v15 ghi `case.carla.ramp_lead_s`.
4. Gộp vào v15 cùng ADR-062: v15 chưa phát hành nên không tạo v16.

## Hệ quả

- Kiểm CARLA thật `-xosc15` cho Patrol / Sprinter c1 / c7, đạt khi quãng dừng lệch ≤ 0,3 m.
  - Nếu vượt quá (bù quá tay), giảm thời gian bù.
  - Nếu tăng bù mà quãng dừng không giảm tương ứng, phần chênh không phải do trễ đạt lực; khi đó xem lại bảng bàn đạp ở vùng lệnh nhỏ (2–6 m/s²).
- Nhịp giảm tốc tụt của Patrol lúc ~1,0 s chưa rõ nguyên nhân (có thể do lúc chuyển sang đặt tốc độ); bù pha không sửa được nhịp này.

Kiểm thử: `CarlaSessionLogicTest#calibratedVehiclesGetTheirOwnPedalMapFromV13Only`.
