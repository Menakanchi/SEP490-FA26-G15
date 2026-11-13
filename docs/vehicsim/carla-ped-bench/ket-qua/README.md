# Kết quả carla-ped-bench

Dữ liệu thu từ CARLA bằng công cụ `carla-ped-bench` (repo riêng [phutro](https://github.com/Menakanchi/phutro)), theo [thiết kế](../README.md). Chưa có lần chạy nào.

Mỗi lần chạy một thư mục `<YYYY-MM-DD_HHMM>/`, do lệnh `--publish` của công cụ tạo:

| File | Nội dung |
|---|---|
| `README.md` | Commit repo công cụ, máy, phiên bản server CARLA, số run hợp lệ / bị loại, nhận xét ngắn |
| `ket-qua.xlsx` | File Excel tổng hợp (sheet theo mục 8 của thiết kế) |
| `<id>/run.json` | Tham số ca, physics đọc lại, chỉ số, lý do loại (nếu có) |
| `<id>/frames.csv` | Dữ liệu từng tick 0,01 s |

Giới hạn dung lượng: quá 10 MB một lần chạy thì chỉ giữ `ket-qua.xlsx` và `run.json`, ghi đường dẫn tới `frames.csv` ở nơi khác.
Đây là dữ liệu bằng chứng có chọn lọc — khác thư mục `data/` ở gốc repo (artifact chạy web, không commit).
