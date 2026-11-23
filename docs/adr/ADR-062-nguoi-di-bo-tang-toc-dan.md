# ADR-062 — Bộ động học 1.4 / `.xosc` v15: người đi bộ tăng tốc dần, bỏ khởi hành sớm

**Trạng thái:** ✅ Accepted 23/11/2026 — chủ dự án chốt; kiểm CARLA thật `-xosc15` ([kết quả](../vehicsim/carla-ped-bench/ket-qua/kiem-v15-2026-11-23_0057/README.md)): tăng tốc khớp; ca dừng lề cần thêm mục 2 (đã sửa, không phải chạy lại CARLA).
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
   - Đường fixture Python (`relativeImpact = false`, định nghĩa 1.0) giữ người đạt tốc độ ngay.
2. **Người "dừng ở lề" không chậm dần (bổ sung 23/11 sau kiểm `-xosc15`):** đi đủ tốc độ tới lề rồi dừng như người CARLA (giữ 1,5 m/s tới lề, dừng trong
   ~0,1 s). Đoạn chậm dần 0,8 m (`CURB_SLOWDOWN_M`) chỉ còn ở định nghĩa cũ.
3. **`.xosc` v15 / `-xosc15`:** bỏ khởi hành sớm (`XoscExport.CURRENT_WALKER_START_LEAD_S` = 0), nên `DistanceCondition` = khoảng kích hoạt + nửa xe như
   trước v8. Hằng `CARLA_WALKER_START_LEAD_S` = 0,34 chỉ còn dùng để mô tả file v8–v14 đã xuất. Các phần khác của adapter vẫn giữ như v14.
4. Backend không chạy lại run `-xosc14` hoặc `kinematic-1.3`. `run_xosc.py` vẫn chạy được file v14.

## Hệ quả

- **Người vào đường đi muộn hơn ~0,3 s trong bộ động học.**
  - Ca c1 / c7 (40 km/h, e-tron): quyết định không đổi (2,25 / 2,30 s), quãng dừng c1 = 9,33 m, bằng số bộ động học 1.3 trên CARLA v13.
  - Ca c3 dừng ở lề:
    - Nếu chỉ có mục 1, bộ động học không phanh, trong khi CARLA v15 vẫn phanh (radar 2,15–2,30 s, ground truth chạy bóng 2,55–2,75 s).
    - Với mục 2, bộ động học quyết định ở 2,75 / 2,40 / 2,40 / 2,75 s (e-tron / Model 3 / Patrol / Sprinter), khớp ground truth chạy bóng.
    - Radar quyết định sớm hơn là do perception (TD-01).
- **Baseline / regression:** không ghép `kinematic-1.3` với `1.4`, không ghép `-xosc14` với `-xosc15`. Ở cùng cài đặt, tỉ lệ va chạm và phanh oan có thể giảm vì người
  tới muộn hơn. Phải chạy lại baseline.
- **Test hành vi:** 8 test trong `SimulatorBehaviorTest` / `AebCorridorTest` phải đổi sang tình huống khác để vẫn tạo ra đúng hành vi cần kiểm (va chạm vào hông
  xe, NEAR_MISS, đánh đổi TTC 1,5 → 1,8…). `KinematicParityTest` chỉ còn so tốc độ đầu và trễ phanh, vì quyết định đã được phép khác fixture.
- **Kiểm CARLA thật `-xosc15`:** c1 / c7 lệch quãng dừng ≤ 0,08 m ở e-tron / Model 3; c3 hai bên cùng phanh (sau mục 2).

Kiểm thử: `AebCorridorTest#pedestrianAcceleratesOverTheMeasuredRampTime`, `AebCorridorTest#curbStoppingPedestrianKeepsFullSpeedUntilTheCurb`, `XoscExportTest`, `CarlaWebTest`, `KinematicParityTest`, `SimulatorBehaviorTest`.
