# Kết quả carla-ped-bench

Bản chép các thư mục kết quả từ repo phụ trợ [Menakanchi/phutro](https://github.com/Menakanchi/phutro), gồm các nhánh `main`, `phutro` và `aeb-doi-chieu`. Công cụ và cấu hình ca chạy vẫn nằm ở repo phutro. Nhánh này chỉ chứa dữ liệu, không merge vào `main`.

| Thư mục | Nội dung |
|---|---|
| `runs/2026-11-14_1758` | Đợt 1, chạy thử: `frames.csv` và `run.json` của từng ca |
| `runs/2026-11-20_2217` | Đợt 2 (205 run): dữ liệu từng ca |
| `runs/2026-11-16_2229` | Đợt 3 (500 run): `ket-qua.xlsx` |
| `runs/2026-11-22_2239` | Đợt 4 (331 run), bảng bàn đạp: `ket-qua.xlsx` |
| `runs/kiem-xosc11-…`, `kiem-v13-…`, `kiem-v14-…`, `kiem-v15-…` | Kiểm tra VehicSim sau các bản `-xosc11` / `13` / `14` / `15` |
| `runs/aeb-v15-2026-11-23_2258` | Đối chiếu AEB, 197 biến thể chạy trên CARLA `-xosc15` và bộ động học `kinematic-1.4`: `runs.csv`, `so_sanh.xlsx` |
| `result.xlsx` | Bảng tổng hợp đợt 2 |
