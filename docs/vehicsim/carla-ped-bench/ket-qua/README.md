# Kết quả carla-ped-bench

Dữ liệu thu từ CARLA bằng công cụ `carla-ped-bench` (repo riêng [phutro](https://github.com/Menakanchi/phutro)), theo [thiết kế](../README.md).

| Lần chạy | Đợt | Run hợp lệ | Nội dung chính |
|---|---|---|---|
| [2026-11-14_1758](2026-11-14_1758/README.md) | 1 | 56 / 56 | e-tron: phanh theo tốc độ × mức, người đi bộ, xe + người, mưa, lặp |
| [2026-11-16_2229](2026-11-16_2229/README.md) | 3 | 498 / 500 | Quét dày: bảng bàn đạp e-tron, 4 xe ở physics mặc định, ma sát lốp, xe + người, người đi bộ, tải, thời tiết → ADR-054 |
| [2026-11-20_2217](2026-11-20_2217/README.md) | 2 | 205 / 205 | Quét mô-men 4 xe → migration 016; edge case; mưa trên 4 xe |
| [2026-11-22_2239](2026-11-22_2239/README.md) | 4 | 331 / 331 | Bảng bàn đạp theo tốc độ cho Model 3 / Patrol / Sprinter đã hiệu chuẩn → ADR-059 |
| [kiem-xosc11-2026-11-22_2318](kiem-xosc11-2026-11-22_2318/README.md) | Kiểm VehicSim | 21 / 21 | AEB thật (radar) trên `-xosc11` so với bộ động học 1.2, 7 ca × 3 lần → ADR-054 Accepted |
| [kiem-v13-2026-11-23_0008](kiem-v13-2026-11-23_0008/README.md) | Kiểm VehicSim | 90 / 90 | `-xosc13`: e-tron khớp bộ động học ≤ 0,03 m; Model 3 đạt; Patrol / Sprinter còn +0,5–1,0 m |

Mỗi lần chạy một thư mục `<YYYY-MM-DD_HHMM>/`, do lệnh `--publish` của công cụ tạo:

| File | Nội dung |
|---|---|
| `README.md` | Commit repo công cụ, máy, phiên bản server CARLA, số run hợp lệ / bị loại, nhận xét ngắn |
| `ket-qua.xlsx` | File Excel tổng hợp (sheet theo mục 8 của thiết kế) |
| `<id>/run.json` | Tham số ca, physics đọc lại, chỉ số, lý do loại (nếu có) |
| `<id>/frames.csv` | Dữ liệu từng tick 0,01 s |

Giới hạn dung lượng: quá 10 MB một lần chạy thì chỉ giữ `ket-qua.xlsx` và `run.json`, ghi đường dẫn tới `frames.csv` ở nơi khác.
Đây là dữ liệu bằng chứng có chọn lọc — khác thư mục `data/` ở gốc repo (artifact chạy web, không commit).
