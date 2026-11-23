# Kiểm profile CARLA hiện hành (`-xosc11`) trên CARLA thật — ca người đi bộ (22/11/2026)

**Mục tiêu:** chạy CARLA thật một lần với profile hiện hành `-xosc10` (radar + kẹp μ·g + đặt tốc độ dưới 6 m/s + bảng bàn đạp e-tron + người đi
bộ khởi hành sớm + trượt dừng lề 0,056 s + bù pha tăng lực, ADR-056), so với bộ động học cùng bundle và với số CARLA thật 13/11. Đây là phần "Còn phải kiểm" của
[ADR-054](../../adr/ADR-054-xosc8-hieu-chuan-ban-dap-va-nguoi-di-bo.md) và [ADR-056](../../adr/ADR-056-xosc10-bu-pha-tang-luc-phanh.md); các bản sửa v7–v8 và radar (ADR-043) mới chạy thật riêng lẻ, chưa chạy chung.

## Bộ ca

`worker/cases/pedestrian-v9/` — bundle `vehicsim.variant/v1`, e-tron đã hiệu chuẩn (1800 N·m, phanh 100% 9,13), seed 48846. c1–c6 dựng lại từ bảng
ADR-043 (file gốc `data/radar-cases-20261022` không có trong repo); c7 = c1 trời mưa để kiểm kẹp μ·g.

| Ca | Xe (km/h) | Kích hoạt (m) | Người (m/s) | Khác | CARLA 13/11 (radar, trước v7/v8) |
|---|---|---|---|---|---|
| c1 | 40 | 25 | 1,5 | | dừng, quyết định 2,25 s, quãng dừng 11,413 m, cách 2,609 m |
| c2 | 60 | 15 | 1,5 | | va chạm 16,627 m/s, quyết định 2,35 s |
| c3 | 50 | 25 | 1,5 | dừng ở lề | quyết định 2,10 s, cách 0,99 m |
| c4 | 30 | 35 | 2,0 | | dừng, quyết định 4,25 s, cách 5,692 m |
| c5 | 50 | 20 | 1,5 | mưa, đêm | va chạm 11,577 m/s, quyết định 2,05 s |
| c6 | 20 | 50 | 3,0 | an toàn | không phanh, cách 14,135 m |
| c7 | 40 | 25 | 1,5 | mưa | — (ADR-053 đo ở v7, ground truth: quãng dừng 10,66 m) |

## Cách chạy (máy có CARLA 0.9.16)

```powershell
git fetch origin
git checkout main
.\mvnw.cmd -B compile                       # target/classes cho bộ xuất và bộ động học
# Bật CarlaUE4.exe (Town04), tắt web VehicSim và mọi runner khác đang dùng CARLA
worker\.venv-carla\Scripts\python.exe worker\run_xosc.py --status
worker\.venv-carla\Scripts\python.exe worker\verify_cases.py --out data\kiem-carla --skip-carla   # kiểm trước, không cần CARLA (~10 s)
worker\.venv-carla\Scripts\python.exe worker\verify_cases.py --out data\kiem-carla --runs 3      # 7 ca × 3 lần, khoảng 15–25 phút
```

- Bị dừng giữa chừng: chạy lại phần còn thiếu bằng `--only c5,c6,c7` vào cùng `--out`.
- Gửi lại: nén cả thư mục `data\kiem-carla` (có `so-sanh.md`, `so-sanh.json`, `<ca>/carla/run-NN/result.json`). `data/` không commit vào repo.

## Đọc kết quả

| Kiểm | Đạt khi |
|---|---|
| Chạy lặp | Sự kiện trùng tuyệt đối; khoảng cách / quãng dừng ±0,2 m; vận tốc va chạm ±0,05 m/s (dung sai chốt 13/11) |
| Phanh (c1, c4, c7) so với bộ động học | Quãng dừng lệch ≤ ~1 m (trước v7: −1,3 đến −2,0 m). `case.carla.pedal_map` = `etron-1800nm-2026-11-16`, `low_speed_override_frames` > 0, `ramp_lead_frames` > 0. Quãng dừng ngắn hơn bộ động học → bù pha tăng lực quá tay, giảm `RAMP_LEAD_S` |
| Mưa (c5, c7) | `decel_cmd_capped_frames` > 0; quãng dừng c7 dài hơn c1 |
| Người đi bộ | Thời điểm người vào hành lang gần bộ động học (trước: muộn 0,34 s); c2, c4 có thể đổi kết quả so với 13/11 vì người tới sớm hơn |
| Dừng ở lề (c3) | Người không nhô vào làn: khoảng cách nhỏ nhất > 0, không phanh oan vì người bước vào làn. Nhô vào làn → trả hệ số trượt về 0,07 s (commit `495032e`) |
| Radar | `perception_radar.status` = `PRIMARY`; c6 không phanh, không track bám nhầm; phần lệch còn lại so với bộ động học ghi là lệch do radar |

## Việc

| Bước | Việc | Trạng thái |
|---|---|---|
| 1 | Bộ ca, `verify_cases.py`, sửa `repeat_xosc.py` đọc `perception_radar` của v9 | Xong 22/11 (nhánh `test/kiem-xosc9-carla-that`) |
| 1b | Bù pha tăng lực (ADR-056, `-xosc10`); kiểm cùng lần chạy này | Xong 22/11 (nhánh `fix/carla-bu-pha-tang-luc`) |
| 2 | Chạy trên CARLA thật (`-xosc11`, 21 run) | **Xong 22/11** — [kết quả](../../vehicsim/carla-ped-bench/ket-qua/kiem-xosc11-2026-11-22_2318/README.md) |
| 3 | Ghi kết quả; ADR-054 Proposed → Accepted hoặc sửa (hệ số trượt) | **Xong 22/11** — ADR-054 Accepted (giữ 0,056 s); ADR-056 giữ Proposed (pha tăng lực còn chậm rồi vọt ≥ 9,81 m/s²) |
| 4 | Kiểm lại trên `-xosc13`: e-tron (`worker/cases/pedestrian-v9`, phanh đúng mốc ADR-058, ngưỡng đặt tốc độ theo bàn đạp ADR-060) và 3 xe (`worker/cases/pedestrian-xe`, 9 ca, bảng bàn đạp ADR-059, hành lang theo xe ADR-057) | **Xong 23/11** — [kết quả](../../vehicsim/carla-ped-bench/ket-qua/kiem-v13-2026-11-23_0008/README.md): e-tron khớp ≤ 0,03 m; Model 3 đạt; Patrol / Sprinter +0,5–1,0 m (bật bù pha tăng lực); ca dừng lề c3 lệch 1,4–1,7 m (đang xem) |
| 5 | Kiểm `-xosc14` 6 ca Patrol / Sprinter (`worker/cases/pedestrian-xe`, bù pha tăng lực ADR-061) | **Xong 23/11** — [kết quả](../../vehicsim/carla-ped-bench/ket-qua/kiem-v14-2026-11-23_0028/README.md): bớt ~0,25 m, Patrol +0,23 / +0,37 m, Sprinter +0,55 / +0,69 m → bù riêng ở v15 (ADR-063) |
| 6 | Kiểm `-xosc15` / bộ động học 1.4: e-tron c1 / c3 / c7 và 3 xe c1 / c3 / c7 — ca dừng lề cùng có / cùng không có quyết định với bộ động học (ADR-062); Patrol / Sprinter c1 / c7 lệch ≤ 0,3 m (ADR-063) | **Xong 23/11** — [kết quả](../../vehicsim/carla-ped-bench/ket-qua/kiem-v15-2026-11-23_0057/README.md): phanh đạt; c3 đạt sau khi 1.4 bỏ chậm dần trước lề |
