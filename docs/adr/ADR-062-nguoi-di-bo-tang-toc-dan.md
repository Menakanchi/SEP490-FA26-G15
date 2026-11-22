# ADR-062 — Bộ động học 1.4 / `.xosc` v15: người đi bộ tăng tốc dần, bỏ khởi hành sớm

**Trạng thái:** Proposed 23/11/2026 — unit test đã chạy; chờ kiểm CARLA thật `-xosc15`.
**Liên quan:** sửa mục "người đi bộ khởi hành sớm" của [ADR-054](ADR-054-xosc8-hieu-chuan-ban-dap-va-nguoi-di-bo.md); TD-17.

## Bối cảnh

Đo đợt 3 (16/11/2026): người đi bộ CARLA đạt 90% tốc độ sau 0,61 s ở mọi tốc độ và vào hành lang muộn hơn bộ động học 0,340 ± 0,003 s. ADR-054 bù bằng cách
cho người CARLA khởi hành sớm v × 0,34 s. Cách bù này khớp được vị trí người, nhưng vận tốc người lúc vào hành lang vẫn khác: bộ động học cho người đạt tốc độ ngay,
còn người CARLA vẫn đang tăng tốc. Kiểm `-xosc13` ([kết quả](../vehicsim/carla-ped-bench/ket-qua/kiem-v13-2026-11-23_0008/README.md)), ca dừng ở lề c3
(50 km/h): bộ lọc vận tốc của AEB ước lượng người chậm hơn trên CARLA, nên CARLA quyết định ở 1,95 s, còn bộ động học ở 1,85 s, dừng gần người hơn 1,4–1,7 m.
Ground truth chạy bóng trên CARLA cũng quyết định ở 1,95 s, nên nguyên nhân không nằm ở radar.

## Quyết định

1. **Bộ động học `vehicsim-kinematic-1.4`:**
   - Người đi bộ tăng tốc đều từ 0 lên tốc độ đặt trong `Simulator.PEDESTRIAN_ACCEL_TIME_S` = 0,678 s. Với tăng tốc tuyến tính, mốc 90% rơi vào 0,61 s, đúng số đo.
   - Người dừng ở lề vẫn đi chậm dần trong 0,8 m cuối như trước.
   - Đường fixture Python (`relativeImpact = false`, định nghĩa 1.0) giữ người đạt tốc độ ngay.
2. **`.xosc` v15 / `-xosc15`:** bỏ khởi hành sớm (`XoscExport.CURRENT_WALKER_START_LEAD_S` = 0), nên `DistanceCondition` = khoảng kích hoạt + nửa xe như
   trước v8. Hằng `CARLA_WALKER_START_LEAD_S` = 0,34 chỉ còn dùng để mô tả file v8–v14 đã xuất. Các phần khác của adapter vẫn giữ như v14.
3. Backend không chạy lại run `-xosc14` hoặc `kinematic-1.3`. `run_xosc.py` vẫn chạy được file v14.

## Hệ quả

- **Người vào đường đi muộn hơn ~0,3 s trong bộ động học.**
  - Ca c1 / c7 (40 km/h, e-tron): quyết định không đổi (2,25 / 2,30 s), quãng dừng c1 = 9,33 m, bằng số bộ động học 1.3 trên CARLA v13.
  - Ca c3 dừng ở lề: bộ động học 1.4 **không còn ra quyết định** (1.3 quyết định ở 1,85 s). CARLA v15 dự kiến cũng không, vì người CARLA giờ xuất phát cùng lúc với
    bộ động học. Phải kiểm CARLA thật.
- **Baseline / regression:** không ghép `kinematic-1.3` với `1.4`, không ghép `-xosc14` với `-xosc15`. Ở cùng cài đặt, tỉ lệ va chạm và phanh oan có thể giảm vì người
  tới muộn hơn. Phải chạy lại baseline.
- **Test hành vi:** 8 test trong `SimulatorBehaviorTest` / `AebCorridorTest` phải đổi sang tình huống khác để vẫn tạo ra đúng hành vi cần kiểm (va chạm vào hông
  xe, NEAR_MISS, đánh đổi TTC 1,5 → 1,8…). `KinematicParityTest` chỉ còn so tốc độ đầu và trễ phanh, vì quyết định đã được phép khác fixture.
- **Kiểm CARLA thật `-xosc15`:** e-tron c1 / c3 / c7 và 3 xe c3. Đạt khi c3 cùng có hoặc cùng không có quyết định với bộ động học, và c1 / c7 vẫn lệch ≤ 0,1 m.

Kiểm thử: `AebCorridorTest#pedestrianAcceleratesOverTheMeasuredRampTime`, `XoscExportTest`, `CarlaWebTest`, `KinematicParityTest`, `SimulatorBehaviorTest`.
