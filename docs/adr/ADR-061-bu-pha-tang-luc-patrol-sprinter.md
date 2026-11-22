# ADR-061 — `.xosc` v14: bù pha tăng lực cho Patrol và Sprinter

**Trạng thái:** Accepted 23/11/2026 — chủ dự án chốt. Unit test đã chạy; chưa chạy CARLA thật.
**Liên quan:** ADR-056 (bù pha tăng lực), ADR-059 (bảng bàn đạp 3 xe — sửa mục 2), ADR-060.

## Bối cảnh

ADR-059 không bật bù pha tăng lực cho Patrol / Sprinter vì "Δ đạt lực 1,3–1,6 s" được giải thích là do phanh mạnh dần khi tốc độ giảm. Kiểm CARLA thật `-xosc13`
([kết quả](../vehicsim/carla-ped-bench/ket-qua/kiem-v13-2026-11-23_0008/README.md)) cho thấy giải thích đó sai một phần: quãng dừng ca c1 / c7 dài hơn bộ động
học +0,49 / +0,66 m (Patrol) và +0,80 / +1,01 m (Sprinter), trong khi e-tron và Model 3 (có bù) lệch ≤ 0,11 m. Nhật ký bàn đạp Sprinter c1: giảm tốc 4,2 / 6,4 m/s²
ở 0,25 / 0,40 s sau khi phanh tác dụng, mô hình 5,0 / 8,0 — tăng lực chậm thật.

## Quyết định

1. Từ v14 bật bù pha tăng lực (`RAMP_LEAD_S` = 0,055 s, như ADR-056) cho Patrol 2250 N·m và Sprinter 2250 N·m (`CarlaPedalMap.Calibration.rampLeadFromV14`).
2. Định danh `.xosc` v13 → v14 (`-xosc14`, file giống v13 trừ `vs_format`); e-tron, Model 3 và xe chưa có bảng ra số giống v13. Bộ động học không đổi (`1.3`).

## Hệ quả

- Run `-xosc13` của Patrol / Sprinter không ghép với `-xosc14`.
- Cần chạy CARLA thật lại 6 ca Patrol / Sprinter (`worker/cases/pedestrian-xe`, `--only patrol-c1,patrol-c3,patrol-c7,sprinter-c1,sprinter-c3,sprinter-c7`); nếu
  còn dài hơn bộ động học > 0,3 m thì tăng `RAMP_LEAD_S` riêng cho hai xe.

Kiểm thử: `CarlaSessionLogicTest#calibratedVehiclesGetTheirOwnPedalMapFromV13Only`, `CarlaWebTest`, `BridgeProtocolTest`, `XoscExportTest`.
