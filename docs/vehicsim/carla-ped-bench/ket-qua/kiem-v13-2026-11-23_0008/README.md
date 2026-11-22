# Kiểm `-xosc13` trên CARLA thật — 2026-11-23_0008

| Mục | Giá trị |
|---|---|
| Profile | `carla-0.9.16-xosc13` (`vehicsim.xosc/v13`), bộ động học `vehicsim-kinematic-1.3`; VehicSim `main` `2e67ce3` trở đi |
| Bộ ca | `worker/cases/pedestrian-v9` (e-tron c1–c7) và `worker/cases/pedestrian-xe` (Model 3 / Patrol / Sprinter × c1 khô 40 km/h, c3 dừng ở lề 50 km/h, c7 mưa 40 km/h); seed 48846; mỗi ca 3 lần |
| Run | 90 / 90, `failures` rỗng; chạy lặp lệch ≤ 0,13 m |
| Dữ liệu từng run | repo phutro, nhánh `phutro`, `runs/kiem-v13-2026-11-23_0008/` (commit `78ff930`), gồm `sensors/frames.csv` của e-tron c1 / c7 và 3 xe c1 |

Bảng đầy đủ: [etron/so-sanh.md](etron/so-sanh.md), [xe/so-sanh.md](xe/so-sanh.md).

## Kết quả

**e-tron — khớp bộ động học** (trước ở `-xosc11` lệch 1,62 / 1,82 m vị trí dừng):

| Ca | Phanh tác dụng CARLA / bộ động học | Quãng dừng | Cách người |
|---|---|---|---|
| c1 khô 40 km/h | 2,50 / 2,50 s | 9,36 / 9,33 m (+0,03) | 4,24 / 4,26 m (−0,02) |
| c7 mưa 40 km/h | 2,50 / 2,50 s | 10,31 / 10,31 m (0,00) | 3,28 / 3,28 m (+0,01) |

→ Xác nhận ADR-058 (phanh đúng mốc, quãng dừng đúng bước), ADR-060 (ngưỡng đặt tốc độ theo bàn đạp), ADR-056 (bù pha tăng lực).

**3 xe (ADR-059)** — quãng dừng CARLA − bộ động học, ca c1 / c7:

| Xe | c1 khô | c7 mưa | Ghi chú |
|---|---|---|---|
| Model 3 | +0,11 m | +0,06 m | Có bù pha tăng lực — đạt |
| Patrol | +0,49 m | +0,66 m | Không bật bù pha tăng lực |
| Sprinter | +0,80 m | +1,01 m | Không bật bù pha tăng lực; nhật ký bàn đạp: 6,4 m/s² sau 0,4 s (mô hình 8,0) |

Patrol / Sprinter tăng lực chậm hơn mô hình; kết luận "không có độ trễ riêng" của ADR-059 sai một phần → bật bù pha tăng lực cho hai xe (việc tiếp theo).

**Ca dừng ở lề c3 (50 km/h), mọi xe:** CARLA quyết định 1,95 s, bộ động học 1,85 s → dừng gần người hơn 1,4–1,7 m. Đường ground truth chạy bóng trên CARLA cũng
quyết định 1,95 s, nên không do radar — nghi do chuyển động người gần lề khác nhau (bộ động học chậm dần trong 0,8 m cuối, CARLA dừng theo waypoint); đang xem.

**Mưa đêm c5:** cả hai va chạm; CARLA 8,85 m/s, bộ động học 10,20 m/s — radar CARLA không bị mưa / đêm làm giảm (ADR-043). **Ca an toàn c2 / c4 / c6:** không phanh,
cùng kết quả với bộ động học.
