# ADR-059 — `.xosc` v13: bảng bàn đạp theo tốc độ cho Model 3, Patrol, Sprinter

**Trạng thái:** Accepted 22/11/2026 — chủ dự án chốt. Unit test đã chạy; chưa chạy CARLA thật với 3 xe.
**Liên quan:** ADR-054 (bảng bàn đạp e-tron), ADR-056 (bù pha tăng lực), ADR-058 (bàn đạp thuần feed-forward); migration 016 (mô-men 3 xe).

## Bối cảnh

Migration 016 hiệu chuẩn mô-men phanh Model 3 (1750 N·m), Patrol (2250 N·m), Sprinter (2250 N·m), nhưng adapter vẫn đổi lệnh ra bàn đạp theo giả định
tuyến tính `a / a_100%`. carla-ped-bench đợt 4 ([2026-11-22_2239](../vehicsim/carla-ped-bench/ket-qua/2026-11-22_2239/README.md), 331 / 331 run, nhóm P1 310 run,
30–80 km/h × mức 1–9 m/s² và 100%) cho thấy giả định đó lệch RMS 0,34 / 1,23 / 0,78 m/s²: vùng chết bàn đạp 0,050 / 0,099 / 0,079 và phanh 100% đổi mạnh theo
tốc độ (Patrol 12,9 m/s² ở 50 km/h, 8,4 ở 80; Sprinter 10,9 → 8,3).

## Quyết định

1. `CarlaPedalMap` thành danh sách cấu hình theo xe (blueprint, mô-men, phanh 100%, vùng chết, bảng theo tốc độ). Thêm bảng 3 xe từ P1, cùng cách dựng với
   e-tron. Leave-one-out RMS: Model 3 0,047, Patrol 0,197, Sprinter 0,166 m/s² (tuyến tính hồi quy: 0,136 / 0,701 / 0,540).
2. Bù pha tăng lực (ADR-056) chỉ cho xe đo được độ trễ đạt lực sau bàn đạp: e-tron và Model 3 (0,046 ± 0,009 s). Patrol / Sprinter có "Δ đạt lực" 1,3–1,6 s
   nhưng đó là do phanh mạnh dần khi tốc độ giảm, không phải độ trễ — không bật.
3. Bảng 3 xe chỉ dùng từ `.xosc` v13 (`-xosc13`, file giống v12 trừ `vs_format`); v12 trở về trước giữ tuyến tính cho 3 xe. Bàn đạp thuần feed-forward
   (ADR-058) áp cho mọi xe có bảng. Bộ động học không đổi (`vehicsim-kinematic-1.3`).

## Hệ quả

- Run CARLA `-xosc12` của 3 xe không ghép với `-xosc13`; e-tron ra số giống v12.
- Bảng chỉ đúng cho đúng cấu hình đã đo; đổi mô-men một xe thì đo lại.
- Cần chạy CARLA thật bộ ca người đi bộ với 3 xe để xác nhận (cùng lần kiểm ADR-058).

Kiểm thử: `CarlaSessionLogicTest#calibratedVehiclesGetTheirOwnPedalMapFromV13Only`, `CarlaWebTest`, `BridgeProtocolTest`, `XoscExportTest`.
