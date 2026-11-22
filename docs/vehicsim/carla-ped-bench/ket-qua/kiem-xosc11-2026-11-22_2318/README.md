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

**Khoảng cách nhỏ nhất tới người** ở c1 / c7 trên CARLA lớn hơn bộ động học ~1,7–1,8 m, trong khi quãng dừng chỉ chênh 0,5–0,7 m — cần kiểm cách tính hai bên.
