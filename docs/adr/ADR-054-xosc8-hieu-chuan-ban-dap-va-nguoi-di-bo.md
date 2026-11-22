# ADR-054 — `.xosc` v8 / `-xosc8`: bảng bàn đạp e-tron theo tốc độ, người đi bộ khởi hành sớm và hệ số trượt dừng lề theo đo 16/11

**Trạng thái:** Proposed 19/11/2026. Unit test đã chạy; chưa chạy CARLA thật qua web (xem "Còn phải kiểm").
**Liên quan:** bổ sung [ADR-051](ADR-051-hieu-chuan-phanh-carla-xosc5.md), [ADR-052](ADR-052-xosc6-kep-lenh-phanh-theo-ma-sat.md),
[ADR-053](ADR-053-xosc7-dieu-khien-toc-do-vung-thap.md); TD-17, TD-47.

## Bối cảnh

carla-ped-bench đợt 3 (16/11/2026, 500 run, 498 hợp lệ; CARLA 0.9.16 Windows, RTX 5060; lệnh phanh cố định, không AEB; 24 run lặp có dải 0).
Kết quả ở nhánh `phutro` của repo công cụ, `runs/2026-11-16_2229/ket-qua.xlsx`. Ba chỗ lệch còn sửa được ở adapter:

1. **Bàn đạp e-tron có vùng chết và đổi theo tốc độ** (nhóm D1, 170 run, 15–100 km/h × mức 1–9 m/s² và 100%). Giảm tốc đo được thấp hơn mức
   đích ≈ 0,45–0,5 m/s² ở mọi tốc độ (≥ 50 km/h, mức 2–9: −0,33 ± 0,15 m/s²). Ở 40–45 km/h bàn đạp lớn cho tới 10,3–10,6 m/s²; trên 80 km/h
   bàn đạp nhỏ được thêm lực cản gió. Sau ADR-053, phần quãng dừng trên 6 m/s ở mức 4–8 m/s², ≥ 50 km/h ước tính dài hơn mô hình
   +2,1 ± 2,0 m (vòng hở, tính từ khung hình). Khâu bù 0,05 × sai số hiện có chỉ kéo lệch ~0,45 về ~0,31 m/s².
2. **Người đi bộ CARLA tăng tốc dần** (nhóm D5, 25 run, 0,5–6 m/s): đạt 90% tốc độ sau 0,610 s, vào hành lang muộn hơn bộ động học
   0,340 ± 0,003 s ở mọi tốc độ, như tăng tốc đều trong ~0,68 s. Đây là nguồn chính của 11/93 ca xe + người (D4) khác loại kết quả.
3. **Người dừng ở lề nhô vào làn** = 0,0564 · v (12 tốc độ, độ lệch chuẩn dư 0,006 m) khi đặt tốc độ 0 tại mép làn.

## Quyết định

1. **Bảng bàn đạp** (`CarlaPedalMap`): mỗi tốc độ 30–100 km/h (bước 5) một hàng {bàn đạp, giảm tốc đo được} lấy thẳng từ D1; feed-forward bàn
   đạp nội suy tuyến tính theo giảm tốc rồi theo tốc độ; dưới điểm đo nhỏ nhất nội suy từ vùng chết (bàn đạp 0,0543 theo hồi quy
   `a_đo ≈ 1,032 · a_đích − 0,512`), trên điểm lớn nhất ngoại suy và kẹp [0, 1]; ngoài 30–100 km/h dùng hàng gần nhất. Khâu bù
   0,05 × (lệnh − đo) giữ nguyên (`DecelMeter.brakePedalFrom`). Chỉ áp khi xe khớp đúng cấu hình đã đo (`vehicle.audi.etron`, mô-men
   1800 N·m mọi bánh, phanh 100% 9,13); xe khác giữ giả định tuyến tính. `result.json` ghi `pedal_map` và `pedal_map_frames`.
   Leave-one-out 97 điểm giữa hàng: RMS 0,073 m/s² (hồi quy tuyến tính: 0,198).
2. **Người đi bộ khởi hành sớm:** `DistanceCondition` của event `StartCrossing` cộng thêm quãng xe đi trong
   `CARLA_WALKER_START_LEAD_S` = 0,34 s (xe chạy đều trước khi người khởi hành). Tham số `trigger_distance_m` trong file và bộ động học giữ
   nguyên. Sửa phía CARLA, không đổi `vehicsim-kinematic-1.0`.
3. **Hệ số trượt dừng lề** `CARLA_WALKER_STOP_LAG_S`: 0,07 → 0,056 s.
4. Tách identity `vehicsim.xosc/v8`, `carla-<x.y.z>-xosc8`. Kẹp μ·g áp v6–v8, đặt tốc độ dưới 6 m/s áp v7–v8, bảng bàn đạp chỉ v8. Backend
   từ chối chạy lại `-xosc1`…`-xosc7`, không ghép với `-xosc8`.

## Còn phải kiểm

Cách chạy và bộ ca: [exec plan 22/11](../exec-plans/active/2026-11-22-kiem-carla-that-nguoi-di-bo.md) (`worker/verify_cases.py`, profile `-xosc9`).

- Chạy CARLA thật qua web vài ca người đi bộ (khô, mưa, dừng ở lề) với `-xosc8` so với bộ động học cùng bundle, như bảng kiểm chứng của
  ADR-053. Số dự kiến là ước tính từ dữ liệu vòng hở, chưa phải đo vòng kín với AEB.
- **Hệ số trượt 0,056 s yếu nhất:** đo 23/10 qua ScenarioRunner (đúng đường web) cho 0,07 s; đo 16/11 dùng `WalkerControl` của công cụ đo,
  cách dừng khác. Nếu lần chạy web cho nhô vào làn > 0 thì trả về 0,07.
- Bảng chỉ cho e-tron; 4 xe còn lại chờ hiệu chuẩn mô-men (đợt 2 nhóm X1) rồi đo bảng riêng.

## Hệ quả

- Baseline CARLA `-xosc7` không ghép được với `-xosc8`; cần chạy lại.
- Thời điểm `gt_start` trên CARLA sớm hơn bộ động học 0,34 s theo thiết kế; thời điểm người vào hành lang mới là chỉ số so sánh.

Kiểm thử: `CarlaSessionLogicTest#pedalMapAppliesToTheMeasuredEtronFromV8Only`, `XoscExportTest#pedestrianMovementUsesDistanceTriggerAndRealXmlActions`,
`XoscReadParityTest`, `CarlaWebTest`, `BridgeProtocolTest`.
