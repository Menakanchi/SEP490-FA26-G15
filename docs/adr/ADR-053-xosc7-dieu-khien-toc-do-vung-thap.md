# ADR-053 — `.xosc` v7 / `-xosc7`: adapter điều khiển tốc độ xe dưới 6 m/s thay cho cú dừng gấp của CARLA

**Trạng thái:** Accepted 15/11/2026 — chủ dự án chốt.
**Liên quan:** bổ sung [ADR-051](ADR-051-hieu-chuan-phanh-carla-xosc5.md), [ADR-052](ADR-052-xosc6-kep-lenh-phanh-theo-ma-sat.md); đóng phần
"dừng gấp ở tốc độ thấp" của TD-17.

## Bối cảnh

Đo 14/11/2026 bằng [carla-ped-bench](../vehicsim/carla-ped-bench/ket-qua/2026-11-14_1758/README.md): từ lúc ra lệnh phanh tới khi xe còn
~22 km/h, CARLA khớp mô hình động học (trễ, tăng lực, η ≈ 1 từ 50 km/h). Dưới **6 m/s** xe CARLA dừng gần như tức thì: giảm tốc 23–25 m/s²
trong ~0,24 s **ở mọi mức bàn đạp** (0,44 → 1,0), vượt xa giới hạn bám lốp (~1 g). Hệ quả: CARLA dừng sớm hơn xe thật 1,72 ± 0,42 m
(20–70 km/h) — lạc quan, chiều nguy hiểm khi đánh giá AEB. Vì cú dừng không phụ thuộc bàn đạp nên điều tiết bàn đạp không sửa được.

## Quyết định

1. Từ v7, khi xe đang phanh và tốc độ xuống dưới `LOW_SPEED_OVERRIDE_MPS` = 6 m/s, `CarlaSession` tính tốc độ cần đặt cho tick kế:
   v ← max(0, v − a·Δt), a = lệnh giảm tốc AEB đã kẹp μ·g (ADR-052), điểm bắt đầu = tốc độ đo được lúc xuống dưới ngưỡng (liên tục).
   Trả qua cầu nối trong trường `override_speed` của mỗi bước; `case.carla.low_speed_override_frames` đếm số tick.
2. Worker (`vehicsim_aeb_control.py`) chỉ thực thi: `override_speed` > 0 → `enable_constant_velocity` và nhả bàn đạp; = 0 → nhả chế độ đặt tốc
   độ, phanh 100% giữ xe. Logic nằm ở lõi Java (ADR-042); worker không chứa logic AEB.
3. Tách identity `vehicsim.xosc/v7`, `carla-<x.y.z>-xosc7`; file giống v6 trừ `vs_format`. v6 trở về trước giữ hành vi cũ; backend từ chối chạy
   lại `-xosc1`…`-xosc6`, không ghép với `-xosc7`.

Đoạn dưới 6 m/s trên CARLA từ v7 là **mô hình lý tưởng do adapter áp**, không còn là vật lý CARLA. Đây là bù có chủ đích cho chỗ CARLA sai,
có số tick ghi trong kết quả.

## Kiểm chứng (CARLA 0.9.16 thật, 15/11/2026)

Người đi bộ 40 km/h, 1,5 m/s, kích hoạt 25 m, AEB thật của project, e-tron đã hiệu chuẩn; so với bộ động học cùng bundle:

| Ca | Quãng dừng (m) | Khoảng cách tới người (m) | Tick đặt tốc độ |
|---|---|---|---|
| CLEAR, v6 (còn cú dừng gấp) | 7,44 | 6,17 | — |
| CLEAR, v7 | 9,08 | 4,52 | 74 |
| CLEAR, bộ động học | 8,78 | 3,70 | — |
| RAIN μ 0,65, v6 | 8,37 | 5,23 | — |
| RAIN μ 0,65, v7 | 10,66 | 2,94 | 90 |
| RAIN μ 0,65, bộ động học | 10,33 | 2,15 | — |

Δ quãng dừng so với bộ động học: −1,34 → +0,30 m (khô), −1,96 → +0,33 m (mưa). Phần còn lại của Δ khoảng cách tới người (~0,8 m) đến từ người
đi bộ CARLA khởi động chậm hơn mô hình 0,34 s, không phải từ phanh.

## Hệ quả

- Số CARLA không còn lạc quan ~1,7 m ở cuối pha phanh; ca va chạm dưới 22 km/h vẫn ghi đúng tốc độ va chạm, nhưng phản ứng vật lý sau va chạm
  ở vùng này kém thật (xe đang bị đặt tốc độ).
- Baseline CARLA cũ không ghép được với `-xosc7`; cần chạy lại bằng `-xosc7`.

Kiểm thử: `CarlaSessionLogicTest#lowSpeedPhaseFollowsTheCommandedDecelerationFromV7Only`,
`test_aeb_control_adapter.py::test_low_speed_override_sets_speed_then_holds_the_brake`, `XoscExportTest`, `CarlaWebTest`, `BridgeProtocolTest`.
