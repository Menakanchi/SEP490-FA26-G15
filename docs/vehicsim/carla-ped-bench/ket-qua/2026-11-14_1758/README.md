# Lần chạy 2026-11-14_1758

| Mục | Giá trị |
|---|---|
| Bắt đầu | 2026-11-14 17:58 |
| Commit công cụ (phutro) | `07d717c` |
| Máy | DESKTOP-LULG63N — Windows 10 (19045) |
| GPU | NVIDIA GeForce RTX 5060 |
| CARLA server / gói | 0.9.16 / 0.9.16 |
| Run hợp lệ / tổng | 56 / 56 |
| Dữ liệu từng run (`run.json`, `frames.csv`) | repo phutro, `runs/2026-11-14_1758/` (commit `2357f4b`) |

File kết quả: [ket-qua.xlsx](ket-qua.xlsx). Chỉ số tính lại bằng code phutro hiện tại khớp file Excel.

## Kết quả chính

| Nhóm | Kết quả |
|---|---|
| Độ lặp lại (G6) | 3 lần chạy cùng ca cho kết quả giống hệt (dải dao động 0) — chế độ đồng bộ của CARLA là tất định |
| Tái lập giữa hai máy | G3-25 trùng từng số với lần chạy trên máy khác (quãng dừng 9,518 m, khoảng cách nhỏ nhất 4,041 m) |
| Phanh 8 m/s² (G1), η = a_dải / a_e | 40 km/h: 1,28 · 50: 1,01 · 60: 0,98 · 70: 0,97 — gần đúng mức đích từ 50 km/h trở lên |
| Δ quãng dừng CARLA − mô hình (G1, 8 m/s²) | 20 km/h: −1,6 m · 30: −2,1 · 40: −2,2 · 50: −1,8 · 60: −1,5 · 70: −1,1 m — CARLA luôn dừng sớm hơn |
| Giảm tốc dưới 6 m/s (G1) | 23–25 m/s² ở mọi tốc độ — cú dừng gấp của CARLA (TD-17), nguồn chính của Δ quãng dừng |
| Đạt 90% lực phanh | Chậm hơn mô hình 0,05–0,06 s ở 40–70 km/h |
| Đường ướt (G5) | CARLA vẫn phanh 7,8–9,3 m/s² trong khi mô hình kẹp ở 6,4 (RAIN) / 5,4 (HEAVY_RAIN) m/s² → dừng sớm hơn 3,7–5,3 m; thời tiết CARLA không làm giảm bám đường |
| Giảm ma sát lốp × 0,65 (G5-TF) | a_dải 7,5–7,6 m/s², quãng dừng chỉ lệch −0,3 đến −0,6 m — ma sát lốp có tác dụng nhưng nhỏ |
| Người đi bộ (G2) | Đạt 90% tốc độ sau 0,61 s, vào hành lang muộn hơn mô hình 0,34 s ở mọi tốc độ 1,0–5,0 m/s |
| Dừng ở lề (G4) | Nhô vào làn 0,05 / 0,08 / 0,12 / 0,18 m ở 1,0 / 1,5 / 2,2 / 3,0 m/s — tăng theo tốc độ người |
| Xe + người (G3) | Không ca nào khác loại kết quả; CARLA dừng xa người hơn mô hình khoảng 2 m (15–30 m kích hoạt) |

## Nhận xét

- Mô hình phanh hằng số khớp CARLA ở pha phanh đều từ 50 km/h trở lên (η ≈ 1). Lệch chủ yếu ở cuối pha phanh: dưới 6 m/s CARLA dừng gấp
  ~24 m/s², làm quãng dừng ngắn hơn 1–2 m. Đây là lệch của bộ mô phỏng, không bù trong AEB.
- Mưa trên CARLA chỉ là hình ảnh: quãng dừng không dài ra như xe thật (Greibe 2007). Cần mô hình ma sát ở adapter (quyết định D2 trong
  kế hoạch công thức CP_CROSSING) trước khi dùng số CARLA cho ca đường ướt.
- Người đi bộ CARLA khởi động chậm ~0,34 s so với mô hình "đạt ngay tốc độ"; theo
  [cơ sở lý thuyết](../../co-so-ly-thuyet.md) điều này gần người thật hơn mô hình.
