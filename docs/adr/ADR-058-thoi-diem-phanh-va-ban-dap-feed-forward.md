# ADR-058 — Phanh đúng mốc, quãng dừng đúng bước và bàn đạp thuần feed-forward (bộ động học 1.3, `.xosc` v12)

**Trạng thái:** Accepted 22/11/2026 — chủ dự án chốt. Unit test đã chạy; phần adapter CARLA chưa chạy CARLA thật.
**Liên quan:** ADR-054 (bảng bàn đạp), ADR-056 (bù pha tăng lực), ADR-057 (hành lang theo xe); kết quả kiểm
[`-xosc11`](../vehicsim/carla-ped-bench/ket-qua/kiem-xosc11-2026-11-22_2318/README.md).

## Bối cảnh

Kiểm CARLA thật `-xosc11` (22/11/2026, ca c1): CARLA dừng cách vạch 5,62 m, bộ động học 4,00 m. Lúc AEB quyết định hai bên cùng vị trí; Δ 1,62 m gồm:

1. **Bộ động học phanh trễ 0,05 s (0,55 m).** `AebStack.control` so `t >= decisionT + 0,15 + 0,10` với `t` cộng dồn 0,05 s kiểu double: 2,4999999999999990 < 2,5
   nên phanh ở 2,55 s thay vì 2,50 s. Có từ bản Python.
2. **CARLA phanh mạnh hơn (1,06 m).** Giảm tốc đo được tăng chậm rồi vượt ≥ 9,81 m/s² ở ~40 km/h. Adapter cộng khâu bù 0,05 × (lệnh − đo) lên bảng bàn đạp
   (đo vòng hở, ADR-054): giảm tốc đo trễ (cửa sổ 0,1 s) nên khâu bù đẩy bàn đạp lên trong pha tăng lực và giữ cao khi xe đã phanh đủ.
3. **`stopping_distance_m` của bộ động học lệch một bước.** Khung ghi vị trí sau khi xe đã tiến v·0,05 s, nên quãng phanh báo thiếu ~v·0,05 (0,56 m ở 40 km/h).

## Quyết định

1. `AebStack` có cờ `exactTiming`: so mốc phanh tác dụng với dung sai 1e-9 s. Bật ở bộ động học 1.3 và CARLA v12.
2. Bộ động học 1.3 tính quãng phanh từ vị trí đầu bước phanh tác dụng (`egoX − egoV·dt` của khung đầu pha phanh); CARLA ghi vị trí đo thật nên giữ nguyên.
3. Từ v12, xe có bảng bàn đạp (`CarlaPedalMap`, hiện e-tron) đổi lệnh ra bàn đạp thuần feed-forward: bảng + bù pha tăng lực, không cộng khâu bù theo giảm tốc đo.
   Xe chưa có bảng giữ khâu bù như cũ.
4. Định danh: `vehicsim-kinematic-1.2` → `1.3`, `.xosc` v11 → v12 (`-xosc12`, file giống v11 trừ `vs_format`). Đường so fixture Python (định nghĩa 1.0) và
   profile cũ giữ hành vi cũ; backend từ chối chạy lại run PENDING mang định danh cũ.

## Hệ quả

- Bộ động học phanh sớm hơn tối đa 0,05 s ở mọi ca có phanh và quãng dừng báo dài hơn ~v·0,05 → số động học đổi, cần chạy lại baseline.
- `analysis-api-contract.json.gz` (fixture hợp đồng phân tích cho test frontend) sinh lại.
- Phần adapter (mục 3) dựa trên phân tích dữ liệu khung hình, chưa có nhật ký bàn đạp; cần chạy CARLA thật kiểm lại (c1, c7) — nếu pha tăng lực quá chậm
  khi bỏ khâu bù thì tăng `RAMP_LEAD_S` (ADR-056).

Kiểm thử: `AebCorridorTest#brakesExactlyAtDecisionPlusDelayAndMeasuresTheWholeBrakingDistance`, `SimulatorBehaviorTest`, `KinematicParityTest`,
`AnalysisApiContractTest`, `CarlaWebTest`, `BridgeProtocolTest`, `XoscExportTest`.
