# Kiểm `-xosc14` trên CARLA thật — 2026-11-23_0028

| Mục | Giá trị |
|---|---|
| Profile | `carla-0.9.16-xosc14` (`vehicsim.xosc/v14`), bộ động học `vehicsim-kinematic-1.3`; VehicSim `main` `74efe34` |
| Bộ ca | `worker/cases/pedestrian-xe`, Patrol / Sprinter × c1 khô 40 km/h, c3 dừng ở lề 50 km/h, c7 mưa 40 km/h; seed 48846; mỗi ca 3 lần |
| Run | 18 / 18; chạy lặp lệch ≤ 0,065 m |
| Dữ liệu từng run | repo phutro, nhánh `phutro`, `runs/kiem-v14-2026-11-23_0028/` (commit `317a7c5`), gồm `sensors/frames.csv` của c1 |

Bảng đầy đủ: [so-sanh.md](so-sanh.md).

## Kết quả

Quyết định và phanh trùng bộ động học (c1 / c7: 2,25 / 2,50 s). Quãng dừng CARLA − bộ động học:

| Xe | c1 khô: v13 → v14 | c7 mưa: v13 → v14 |
|---|---|---|
| Patrol | +0,49 → +0,23 m | +0,66 → +0,37 m |
| Sprinter | +0,80 → +0,55 m | +1,01 → +0,69 m |

Bù pha tăng lực 0,055 s (ADR-061) bớt được ~0,25 m, nhưng 3 / 4 ca còn vượt 0,3 m.

**Chênh nằm ở pha tăng lực.** So từng khung `result.json` với bộ động học (Sprinter c1), giảm tốc ở 0,1 / 0,2 / 0,3 / 0,4 s sau khi phanh tác dụng:

| | 0,1 s | 0,2 s | 0,3 s | 0,4 s |
|---|---|---|---|---|
| CARLA (m/s²) | 1,7 | 3,8 | 4,8 | 5,8 |
| Mô hình (m/s²) | 3 | 5 | 7 | 8 |

- Đến 0,6 s, Sprinter chậm lại ít hơn mô hình 0,68 m/s. Sau đó giảm tốc khớp mô hình (7,95–8,03 m/s²), nên phần chênh vận tốc giữ nguyên tới lúc dừng.
- Patrol chênh ~0,2 m/s ở pha tăng lực, thêm một nhịp giảm tốc tụt còn 5,9 m/s² lúc ~1,0 s (ca mưa ~1,2 s). Nhịp này chưa rõ nguyên nhân.
- → Tăng thời gian bù riêng ở v15: Patrol 0,11 s, Sprinter 0,17 s ([ADR-063](../../../../adr/ADR-063-bu-pha-tang-luc-rieng-theo-xe.md)).

**Ca dừng ở lề c3:** CARLA quyết định 1,95 s, bộ động học 1,85 s; min distance 0,87 / 0,95 m so với 2,53 / 2,57 m. Lệch giống `-xosc13`, xử lý ở
[ADR-062](../../../../adr/ADR-062-nguoi-di-bo-tang-toc-dan.md).
