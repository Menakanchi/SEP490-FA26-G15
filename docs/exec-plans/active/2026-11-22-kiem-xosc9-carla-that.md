# Kiểm `-xosc9` trên CARLA thật — ca người đi bộ (22/11/2026)

**Mục tiêu:** chạy CARLA thật một lần với profile hiện hành `-xosc9` (radar + kẹp μ·g + đặt tốc độ dưới 6 m/s + bảng bàn đạp e-tron + người đi
bộ khởi hành sớm + trượt dừng lề 0,056 s), so với bộ động học cùng bundle và với số CARLA thật 13/11. Đây là phần "Còn phải kiểm" của
[ADR-054](../../adr/ADR-054-xosc8-hieu-chuan-ban-dap-va-nguoi-di-bo.md); các bản sửa v7–v8 và radar (ADR-043) mới chạy thật riêng lẻ, chưa chạy chung.

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
git checkout test/kiem-xosc9-carla-that
.\mvnw.cmd -B compile                       # target/classes cho bộ xuất và bộ động học
# Bật CarlaUE4.exe (Town04), tắt web VehicSim và mọi runner khác đang dùng CARLA
worker\.venv-carla\Scripts\python.exe worker\run_xosc.py --status
worker\.venv-carla\Scripts\python.exe worker\verify_cases.py --out data\kiem-xosc9 --skip-carla   # kiểm trước, không cần CARLA (~10 s)
worker\.venv-carla\Scripts\python.exe worker\verify_cases.py --out data\kiem-xosc9 --runs 3      # 7 ca × 3 lần, khoảng 15–25 phút
```

- Bị dừng giữa chừng: chạy lại phần còn thiếu bằng `--only c5,c6,c7` vào cùng `--out`.
- Gửi lại: nén cả thư mục `data\kiem-xosc9` (có `so-sanh.md`, `so-sanh.json`, `<ca>/carla/run-NN/result.json`). `data/` không commit vào repo.

## Đọc kết quả

| Kiểm | Đạt khi |
|---|---|
| Chạy lặp | Sự kiện trùng tuyệt đối; khoảng cách / quãng dừng ±0,2 m; vận tốc va chạm ±0,05 m/s (dung sai chốt 13/11) |
| Phanh (c1, c4, c7) so với bộ động học | Quãng dừng lệch ≤ ~1 m (trước v7: −1,3 đến −2,0 m). `case.carla.pedal_map` = `etron-1800nm-2026-11-16`, `low_speed_override_frames` > 0 |
| Mưa (c5, c7) | `decel_cmd_capped_frames` > 0; quãng dừng c7 dài hơn c1 |
| Người đi bộ | Thời điểm người vào hành lang gần bộ động học (trước: muộn 0,34 s); c2, c4 có thể đổi kết quả so với 13/11 vì người tới sớm hơn |
| Dừng ở lề (c3) | Người không nhô vào làn: khoảng cách nhỏ nhất > 0, không phanh oan vì người bước vào làn. Nhô vào làn → trả hệ số trượt về 0,07 s (commit `495032e`) |
| Radar | `perception_radar.status` = `PRIMARY`; c6 không phanh, không track bám nhầm; phần lệch còn lại so với bộ động học ghi là lệch do radar |

## Việc

| Bước | Việc | Trạng thái |
|---|---|---|
| 1 | Bộ ca, `verify_cases.py`, sửa `repeat_xosc.py` đọc `perception_radar` của v9 | Xong 22/11 (nhánh `test/kiem-xosc9-carla-that`) |
| 2 | Chạy trên CARLA thật, gửi `data\kiem-xosc9` | Chưa làm |
| 3 | Ghi kết quả vào đây; ADR-054 Proposed → Accepted hoặc sửa (hệ số trượt) | Chưa làm |
