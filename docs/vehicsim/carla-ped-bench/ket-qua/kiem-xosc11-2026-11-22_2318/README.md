# Kiểm `-xosc11` trên CARLA thật — 2026-11-22_2318

| Mục | Giá trị |
|---|---|
| Profile | `carla-0.9.16-xosc11` (`vehicsim.xosc/v11`), VehicSim `main` `4792bff` |
| Bộ ca | `worker/cases/pedestrian-v9` (c1–c7, e-tron 1800 N·m, seed 48846), mỗi ca 3 lần; so với bộ động học `vehicsim-kinematic-1.2` cùng bundle |
| Lệnh | `worker/verify_cases.py --out data/kiem-carla --runs 3` ([exec plan 22/11](../../../../exec-plans/active/2026-11-22-kiem-carla-that-nguoi-di-bo.md)) |
| Run | 21 / 21, `failures` rỗng |
| Dữ liệu từng run (`result.json`) | repo phutro, nhánh `phutro`, `runs/kiem-xosc11-2026-11-22_2318/` (commit `01fa482`) |

Bảng đầy đủ: [so-sanh.md](so-sanh.md) ([so-sanh.json](so-sanh.json)).

## Adapter bật đúng

Trong `result.json` (`outcome.case.carla`): `pedal_map` = `etron-1800nm-2026-11-16`; `ramp_lead_frames` 35–40; `low_speed_override_frames` 73–84 ở ca dừng;
`decel_cmd_capped_frames` 60 / 123 ở ca mưa c5 / c7; `perception_source` = `radar`, `perception_radar.status` = `PRIMARY`; không track bám nhầm.

## Kết quả

| Kiểm | Kết quả | Kết luận |
|---|---|---|
| Chạy lặp | Độ lệch chuẩn ≤ 0,04 m, sự kiện trùng tuyệt đối | Đạt dung sai ±0,2 m |
| Người khởi hành sớm (ADR-054) | Người vào đường đi: CARLA 3,07 s, bộ động học 3,05 s (trước lệch 0,34 s) | Đạt |
| Dừng ở lề, trượt 0,056 s (ADR-054, c3) | Người dừng ở y = −2,241 m, đích −2,250 m: nhô vào làn 9 mm, cả 3 lần | Đạt — giữ 0,056 s |
| Ca an toàn c2 / c4 / c6 | Không phanh, cùng kết quả với bộ động học | Đạt |
| Phanh khô c1 | Quyết định 2,25 s (trùng); quãng dừng 8,25 ± 0,02 m, bộ động học 8,78 m | Lệch −0,53 m, xem dưới |
| Phanh mưa c7 | Quyết định 2,25 s (trùng); quãng dừng 9,06 m, bộ động học 9,76 m | Lệch −0,70 m, xem dưới |
| Mưa đêm c5 | Cả hai va chạm: CARLA 8,75 m/s (quyết định 1,90 s), bộ động học 10,54 m/s (2,20 s) | Radar CARLA không bị mưa / đêm làm giảm như perception tổng hợp (ADR-043) |
| Radar phát hiện | 1,82–1,95 s, ~0,6–0,7 s sau khi người bắt đầu đi | Chưa đạt mục tiêu ≤ 0,3 s (ADR-043) |

**Pha tăng lực (ADR-056) — chưa chốt.** Giảm tốc đo được trên CARLA (c1) vẫn tăng chậm hơn mô hình: 4,8 / 7,6 m/s² ở 0,25 / 0,50 s sau khi phanh
tác dụng, mô hình 6,0 / 8,0 (đạt 8 m/s² ở 0,35 s). Sau đó CARLA vượt lên ≥ 9,81 m/s² (ngưỡng đo μ·g) ở ~40 km/h — khâu bù 0,05 × sai số và hàng 40 km/h của
bảng bàn đạp đẩy bàn đạp lên cao — nên quãng dừng cuối cùng ngắn hơn bộ động học 0,5–0,7 m. Không phải bù quá; cần tách ảnh hưởng của cửa sổ đo giảm tốc
0,1 s và xem lại khâu bù trước khi chỉnh `RAMP_LEAD_S`.

## Phân tích chênh vị trí dừng (c1, 22/11/2026)

CARLA dừng cách vạch băng qua 5,62 m, bộ động học 4,00 m (Δ 1,62 m; khoảng cách nhỏ nhất 5,35 / 3,70 m, cùng công thức `Simulator.summaryMetrics`).
Lúc AEB quyết định (2,25 s) hai bên ở **cùng vị trí** (x = 24,999 m). Δ 1,62 m tách được thành:

| Phần | Δ | Nguyên nhân | Ở đâu |
|---|---|---|---|
| Bộ động học bắt đầu phanh muộn 0,05 s | 0,55 m | `AebStack.control` so `t >= decisionT + 0,15 + 0,10` với `t` cộng dồn 0,05 s kiểu double: 2,4999999999999990 < 2,5 nên phanh ở 2,55 s thay vì 2,50 s. CARLA (bước 0,01 s, thời gian lấy từ timestamp) phanh đúng 2,50 s | Lõi bộ động học / AEB (bản Python cũng vậy) |
| Phanh trên CARLA mạnh hơn | 1,06 m | Quãng phanh thật từ lúc phanh: CARLA 8,28 m, bộ động học 9,34 m. CARLA tăng lực chậm (7,6 m/s² ở 0,5 s) rồi **vượt ≥ 9,81 m/s²** (ngưỡng đo μ·g) ở ~40 km/h | Adapter CARLA: khâu bù 0,05 × (lệnh − đo) với giảm tốc đo trễ (cửa sổ 0,1 s) + bù pha tăng lực (ADR-056) + hàng 40 km/h của bảng bàn đạp |

Ngoài ra **chỉ số `stopping_distance_m` của bộ động học lệch một bước**: khung ghi vị trí xe *sau* khi đã tiến thêm v·0,05 s (`Simulator`: `egoFront +=` trước
`frames.add`), nên quãng phanh báo 8,78 m trong khi quãng thật 9,34 m (ở 40 km/h lệch 0,56 m). So `stopping_distance_m` giữa CARLA và bộ động học vì vậy
thấy −0,53 m thay vì −1,06 m thật. Đây là định nghĩa giữ từ bản Python (ghi trong `brakePhaseMetrics`).

Ca mưa c7 không vọt (lệnh và ngưỡng đo cùng kẹp ở μ·g = 6,87 m/s²).

**Việc tiếp:** (1) cần nhật ký bàn đạp của một run c1 (`sensors/frames.csv`) để tách phần của khâu bù, bù pha tăng lực và bảng bàn đạp trước khi sửa adapter;
(2) sửa thời điểm phanh và chỉ số quãng dừng của bộ động học đổi kết quả mọi run động học (phải lên `vehicsim-kinematic-1.3`, cập nhật fixture parity) —
ghi vào TD-17, chưa sửa.
