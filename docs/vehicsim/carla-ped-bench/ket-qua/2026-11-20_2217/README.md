# Lần chạy 2026-11-20_2217 (đợt 2: 4 xe còn lại, ca bổ sung, edge case, ca lặp)

| Mục | Giá trị |
|---|---|
| Bắt đầu | 2026-11-20 22:17 |
| Commit công cụ (phutro) | `0651b31`, danh sách ca `cases_dot2.yaml` |
| Máy | DESKTOP-LULG63N — Windows 10 (19045) |
| GPU | NVIDIA GeForce RTX 5060 |
| CARLA server / gói | 0.9.16 / 0.9.16 |
| Run hợp lệ / tổng | 205 / 205 |
| Độ lặp lại | 26 run lặp (X4, R): dải lớn nhất 0,057 m quãng dừng (B2-80-max, X3-hgv-60, X1-model3-50), còn lại 0 |
| Dữ liệu từng run (`run.json`, `frames.csv`) | repo phutro, nhánh `phutro`, `runs/2026-11-20_2217/` (commit `b07594d`; sheet "Theo tốc độ" sửa ở `fcc3832`) |

File kết quả: [ket-qua.xlsx](ket-qua.xlsx) (bản sau `fcc3832`). Lệnh phanh cố định, không AEB, CARLA gốc.

## Nhóm ca

| Nhóm | Ca | Run |
|---|---|---|
| X1 | Model 3 / Patrol / Sprinter / HGV × mô-men × 1,0–3,0 × 40 / 50 / 60 / 70 km/h, phanh 100% | 80 |
| X2 | 4 xe ở physics mặc định × 20 / 40 / 60 km/h × 1,5 / 3,0 m/s² / 100% | 36 |
| X3 | 4 xe × 40 / 60 km/h × RAIN / HEAVY_RAIN, phanh 100% | 16 |
| X4 | Lặp X1 ×1,0 ở 50 km/h | 8 |
| B1–B5 | e-tron: 10–25 km/h, 80 km/h, bàn đạp nhẹ, tải × 1,15, ma trận Euro NCAP người 1,39 m/s | 21 |
| E1–E6 | Edge case: tốc độ, mức phanh, ma sát, người đi bộ, xe + người, thông số xe ở giá trị biên | 27 |
| R | Lặp các ca dễ dao động | 17 |

## Hiệu chuẩn mô-men (X1): a_dải phanh 100% (m/s²)

| Xe (mô-men gốc) | × 1,0 | × 1,5 | × 2,0 | × 2,5 | × 3,0 |
|---|---|---|---|---|---|
| Model 3 (700 N·m), 50 / 60 / 70 km/h | 3,57 / 3,58 / 3,58 | 5,65 / 5,63 / 5,62 | 7,85 / 7,72 / 7,68 | **10,01 / 9,83 / 9,77** | 11,82 / 11,74 / 11,74 |
| Patrol (1500 N·m) | 6,04 / 5,52 / 5,35 | **11,53 / 9,51 / 8,66** | 16,75 / 13,31 / 12,26 | 19,16 / 16,64 / 14,49 | — / 18,12 / 16,82 |
| Sprinter (1500 N·m) | 5,69 / 5,42 / 5,35 | **9,96 / 8,49 / 8,28** | 11,34 / 11,06 / 11,00 | 13,71 / 13,73 / 13,74 | 16,57 / 16,59 / 16,61 |
| HGV (1500 N·m) | 1,77 / 1,76 / 1,80 | 3,04 / 2,95 / 2,92 | 4,83 / 4,37 / 4,21 | 7,47 / 6,10 / 5,65 | 9,63 / 7,18 / 6,77 |

Chọn (đậm) đưa vào [migration 016](../../../../../database/mysql/migrations/016_2026-11-22_hieu-chuan-phanh-3-xe.sql): Model 3 1750 N·m
(phanh 100% trung bình 50–70 km/h 9,87), Patrol 2250 N·m (9,90), Sprinter 2250 N·m (8,91). Model 3 gần tuyến tính theo mô-men; Patrol và
Sprinter không tuyến tính và đổi theo tốc độ, nên chọn đúng mức đã đo. HGV chưa hiệu chuẩn được bằng một mô-men (giữ `is_supported = FALSE`).

## Kết quả khác

| Chỉ số | Kết quả |
|---|---|
| Mưa (X3) | Cả 4 xe phanh y như đường khô (Patrol / Sprinter 40 km/h mưa to thấp hơn 0,1–0,5 m/s²) → kẹp μ·g ở adapter (ADR-052) cần cho mọi xe |
| Vùng chết bàn đạp (X2, B3) | η = 0,62–0,86 ở 1,5–2 m/s² (mọi xe); e-tron 2 / 3 m/s²: η 0,77–0,85 |
| Giảm tốc dưới 6 m/s | Model 3 / Patrol ~25, Sprinter ~21, HGV ~15 m/s² ở mọi mức — cú dừng gấp có ở mọi xe (ADR-053 áp cho mọi xe) |
| Tốc độ cao (B2, E1) | 80–100 km/h, 100%: η 0,96–0,97 |
| Người đi bộ (B5, E4) | Vào hành lang muộn 0,338–0,340 s, kể cả 8 m/s; dừng lề 8 m/s nhô 0,376 m (mô hình 0,0564 · v dự đoán 0,45) |
| Xe + người | `E5-trig-5`: mô hình va chạm, CARLA không (người khởi động chậm, đã bù ở v8); `E5-tf0.3-40` lốp × 0,3: CARLA dừng cách người 0,63 m; `E5-hgv-40`: CARLA dừng cách 12,7 m (HGV dừng sớm hơn mô hình 10,7 m vì dừng gấp ở 15 m/s²) |
| Thông số biên (E6) | e-tron mô-men × 0,2 → 1,38 m/s²; khối lượng × 2 → 4,87 m/s²; HGV mô-men × 5 (7500 N·m) → 12,5 m/s² ở 50 km/h |
