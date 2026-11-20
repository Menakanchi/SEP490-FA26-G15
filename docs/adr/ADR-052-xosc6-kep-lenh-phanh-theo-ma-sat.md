# ADR-052 — `.xosc` v6 / `-xosc6`: kẹp lệnh giảm tốc ra bàn đạp CARLA ở μ·g

**Trạng thái:** Accepted 15/11/2026 — chủ dự án chốt.
**Liên quan:** bổ sung [ADR-051](ADR-051-hieu-chuan-phanh-carla-xosc5.md) (v5, hiệu chuẩn phanh); quyết định D2/R1 của
[kế hoạch công thức CP_CROSSING trên CARLA](../exec-plans/active/2026-11-11-cong-thuc-cp-crossing-carla.md); TD-17.

## Bối cảnh

CARLA không giảm bám đường theo thời tiết. Đo 14/11/2026 bằng
[carla-ped-bench](../vehicsim/carla-ped-bench/ket-qua/2026-11-14_1758/README.md) (nhóm G5): trời mưa (μ 0,65 / 0,55) xe vẫn phanh 7,8–9,3 m/s²,
dừng sớm hơn mô hình 3,7–5,3 m, trong khi xe thật trên đường ướt dừng xa hơn khi ma sát giảm
([cơ sở lý thuyết](../vehicsim/carla-ped-bench/co-so-ly-thuyet.md), Greibe 2007). `DecelMeter` đã kẹp **số đo** giảm tốc ở μ·g, nhưng **lệnh**
gửi ra bàn đạp thì không.

## Quyết định

1. `CarlaSession.frictionLimitedCommand`: lệnh giảm tốc AEB đưa ra bàn đạp bị kẹp ở μ·g của mặt đường trước khi đổi ra bàn đạp
   (`DecelMeter.brakePedal`). AEB vẫn tính và ghi lệnh gốc; `case.carla.decel_cmd_capped_frames` đếm số tick bị kẹp. Đây là phần vật lý bổ sung
   ở adapter cho chỗ CARLA thiếu, không phải thay đổi AEB.
2. Tách identity: `vehicsim.xosc/v6`, `carla-<x.y.z>-xosc6`. File v6 giống v5 trừ `vs_format`. Kẹp μ·g chỉ áp cho v6; v5 giữ đúng hành vi
   đã có (gồm a_avail theo phanh 100% đo được từ 11/11), nên run `-xosc5` chạy lại ngoài web ra đúng kết quả đã lưu. Backend từ chối chạy lại run
   `-xosc1`…`-xosc5` và không ghép chúng với `-xosc6`, như tiền lệ ADR-051.

## Kiểm chứng (CARLA 0.9.16 thật, 14/11/2026)

Người đi bộ 40 km/h, 1,5 m/s, kích hoạt 25 m, AEB thật của project, e-tron đã hiệu chuẩn:

| Ca | Bàn đạp tối đa | Quãng dừng | Khoảng cách tới người | Tick bị kẹp |
|---|---|---|---|---|
| RAIN μ 0,65, chưa kẹp | 0,96 | 7,13 m | 6,48 m | — |
| RAIN μ 0,65, kẹp μ·g | 0,80 | 8,37 m | 5,23 m | 77 |
| CLEAR, kẹp μ·g | — | 7,44 m | 6,17 m | 0 |

## Hệ quả

- Ca đường ướt trên CARLA phanh gần giới hạn bám như xe thật; đường khô không đổi.
- Baseline CARLA cũ (`-xosc5`) không ghép được với run mới; cần chạy lại bằng `-xosc6` nếu muốn so.
- Còn lại của TD-17: cú dừng gấp dưới ~6 m/s (CARLA lạc quan ~1,7 m trên đường khô).

Kiểm thử: `CarlaSessionLogicTest#pedalCommandIsCappedAtRoadFrictionFromV6Only`, `XoscExportTest` (đọc v3/v4/v5 với identity riêng, profile hiện
hành `-xosc6`), `CarlaWebTest`, `BridgeProtocolTest`, test worker.
