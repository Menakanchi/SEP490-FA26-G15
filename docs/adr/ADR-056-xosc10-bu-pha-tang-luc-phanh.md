# ADR-056 — `.xosc` v10 / `-xosc10`: bù pha tăng lực phanh của e-tron trên CARLA

**Trạng thái:** ✅ Accepted 23/11/2026 — kiểm CARLA thật `-xosc13` ([kết quả](../vehicsim/carla-ped-bench/ket-qua/kiem-v13-2026-11-23_0008/README.md)): e-tron và Model 3 (có bù) quãng dừng lệch bộ động học ≤ 0,11 m; Patrol / Sprinter (chưa bật) +0,5 đến +1,0 m.
**Liên quan:** bổ sung [ADR-054](ADR-054-xosc8-hieu-chuan-ban-dap-va-nguoi-di-bo.md) (bảng bàn đạp e-tron); TD-17.

## Bối cảnh

carla-ped-bench đợt 3 ([2026-11-16_2229](../vehicsim/carla-ped-bench/ket-qua/2026-11-16_2229/README.md), nhóm D1, e-tron 1800 N·m, ≥ 50 km/h): bàn đạp
tăng theo đúng pha tăng lực của mô hình (trễ 0,15 s rồi 20 m/s³) nhưng CARLA đạt 90% lực phanh **muộn hơn mô hình** 0,049 ± 0,004 s ở mức 7–9 m/s² (n = 33)
và 0,064 ± 0,009 s ở mức 5–7 (n = 22). Độ trễ này nằm sau bàn đạp (động học phanh / lốp của CARLA), bảng bàn đạp của ADR-054 — đo ở trạng thái ổn
định — không bù được. Ở 50–60 km/h nó làm quãng dừng dài thêm khoảng 0,8 m.

## Quyết định

1. Từ v10, với xe có bảng bàn đạp (`CarlaPedalMap`, hiện chỉ e-tron), feed-forward bàn đạp lấy theo lệnh
   `a + RAMP_LEAD_S · max(0, da/dt)` thay cho `a`, với `RAMP_LEAD_S` = 0,055 s (trung bình có trọng số hai nhóm đo) và `da/dt` là độ tăng của lệnh
   (đã kẹp μ·g) so với tick trước. Lệnh AEB tăng mượt theo `decelRampRate` ≤ 20 m/s³, nên phần cộng thêm ≤ 1,1 m/s² và về 0 ngay khi lệnh thôi tăng;
   lệnh giữ nguyên hoặc giảm thì không cộng. Khâu bù 0,05 × (lệnh − đo) vẫn so với lệnh gốc.
2. Xe chưa có bảng bàn đạp giữ nguyên (chưa đo độ trễ của chúng).
3. Tách identity `vehicsim.xosc/v10`, `carla-<x.y.z>-xosc10`; file giống v9 trừ `vs_format`. Mọi phần của v9 giữ nguyên (radar, kẹp μ·g, vùng thấp,
   bảng bàn đạp). Backend từ chối chạy lại `-xosc1`…`-xosc9`, không ghép với `-xosc10`. `result.json` ghi `case.carla.ramp_lead_frames`.

## Còn phải kiểm

**Cập nhật 22/11/2026 — kiểm CARLA thật `-xosc11`** ([kết quả](../vehicsim/carla-ped-bench/ket-qua/kiem-xosc11-2026-11-22_2318/README.md)): phần bù có chạy
(`ramp_lead_frames` 35–40) nhưng giảm tốc đo được vẫn tăng chậm hơn mô hình (7,6 so với 8,0 m/s² ở 0,5 s), rồi vượt ≥ 9,81 m/s² ở ~40 km/h, quãng dừng ngắn hơn
bộ động học 0,5–0,7 m. Không bù quá; chưa chốt — cần tách ảnh hưởng cửa sổ đo 0,1 s và khâu bù 0,05 × sai số trước khi chỉnh `RAMP_LEAD_S`.

- CARLA thật: ca c1 / c4 / c7 của bộ kiểm 22/11 — thời điểm đạt lực và quãng dừng so với bộ động học; `ramp_lead_frames` > 0. Nếu quãng dừng ngắn
  hơn bộ động học (bù quá) thì giảm `RAMP_LEAD_S`.
- Ở mức thấp (3–5 m/s²) độ trễ đo được lớn hơn nhiều (~2 s) do vùng chết bàn đạp; phần đó do bảng bàn đạp xử lý, không do hằng số này.

Kiểm thử: `CarlaSessionLogicTest#rampLeadOnlyWhileTheCommandRisesFromV10`, `CarlaWebTest`, `BridgeProtocolTest`, `XoscExportTest`.
