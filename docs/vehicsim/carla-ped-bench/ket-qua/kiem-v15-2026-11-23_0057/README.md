# Kiểm `-xosc15` trên CARLA thật — 2026-11-23_0057

| Mục | Giá trị |
|---|---|
| Profile | `carla-0.9.16-xosc15` (`vehicsim.xosc/v15`), bộ động học `vehicsim-kinematic-1.4` bản `5f5cb25` (nhánh `fix/nguoi-tang-toc-dan`) |
| Bộ ca | `worker/cases/pedestrian-v9` (e-tron c1 / c3 / c7) và `worker/cases/pedestrian-xe` (Model 3 / Patrol / Sprinter × c1 / c3 / c7); seed 48846; mỗi ca 3 lần |
| Run | 36 / 36; chạy lặp lệch ≤ 0,05 m |
| Dữ liệu từng run | repo phutro, nhánh `phutro`, `runs/kiem-v15-2026-11-23_0057/` (commit `caa2e02`) |

Bảng đầy đủ: [etron/so-sanh.md](etron/so-sanh.md), [xe/so-sanh.md](xe/so-sanh.md). Cột bộ động học trong hai bảng là bản `5f5cb25`, trước khi bỏ đoạn chậm dần ở lề.

## Phanh (ADR-063): đạt

Quyết định trùng nhau ở mọi ca c1 / c7 (2,25 s). Quãng dừng CARLA − bộ động học:

| Xe | c1 khô | c7 mưa | Ngưỡng |
|---|---|---|---|
| e-tron | +0,04 m | +0,01 m | ≤ 0,1 m |
| Model 3 | +0,07 m | +0,06 m | ≤ 0,1 m |
| Patrol | +0,08 m (v14 +0,23) | +0,17 m (v14 +0,37) | ≤ 0,3 m |
| Sprinter | +0,03 m (v14 +0,55) | +0,27 m (v14 +0,69) | ≤ 0,3 m |

## Ca dừng ở lề c3 (ADR-062): bản `5f5cb25` không đạt → đã sửa trong 1.4

**Kết quả bản `5f5cb25`:** CARLA phanh ở cả 4 xe, còn bộ động học không phanh (`TARGET_CLEARED`). Thời điểm CARLA quyết định:

| Xe | Radar | Ground truth chạy bóng |
|---|---|---|
| e-tron | 2,30 s | 2,75 s |
| Model 3 | 2,25 s | 2,55 s |
| Patrol | 2,30 s | 2,55 s |
| Sprinter | 2,15 s | 2,75 s |

**Quỹ đạo người, e-tron c3:**
- Pha tăng tốc khớp: vận tốc ở 1,6 / 2,0 s là 0,18 / 1,07 m/s trên CARLA, 0,22 / 1,11 m/s trên bộ động học.
- Gần lề thì khác. Người CARLA giữ 1,5 m/s tới lề và dừng ở 2,8 s. Bộ động học chậm dần trong 0,8 m cuối từ 2,2 s, rồi bò 0,23 m/s tới 3,7 s. Vì vậy AEB của bộ động
  học thấy người sắp dừng.

**Sửa:** bộ động học 1.4 bỏ đoạn chậm dần, cho người đi đủ tốc độ tới lề rồi dừng. Fixture cũ giữ nguyên. Bộ động học sau khi sửa quyết định ở c3:

| Xe | Bộ động học (sau sửa) | Ground truth chạy bóng CARLA |
|---|---|---|
| e-tron | 2,75 s | 2,75 s |
| Model 3 | 2,40 s | 2,55 s |
| Patrol | 2,40 s | 2,55 s |
| Sprinter | 2,75 s | 2,75 s |

- Hai bên đều phanh. Thời điểm khớp ground truth chạy bóng; c1 / c7 không đổi.
- `.xosc` v15 không đổi nên không phải chạy lại CARLA.
- Radar CARLA quyết định sớm hơn 0,15–0,6 s do perception radar khác perception tổng hợp của bộ động học (TD-01), không do chuyển động người.
