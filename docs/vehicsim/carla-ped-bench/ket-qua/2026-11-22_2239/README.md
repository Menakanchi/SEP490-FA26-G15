# Lần chạy 2026-11-22_2239 (đợt 4: bảng bàn đạp 3 xe đã hiệu chuẩn)

| Mục | Giá trị |
|---|---|
| Commit công cụ (phutro) | `78fe27d`, danh sách ca `cases_dot4.yaml` |
| CARLA | 0.9.16 Windows, Town04 road 40, lệnh phanh cố định (không AEB), CARLA gốc |
| Xe | `model3_hc` 1750 N·m (phanh 100% 9,87), `patrol_hc` 2250 N·m (9,90), `sprinter_hc` 2250 N·m (8,91) — migration 016 |
| Run hợp lệ / tổng | 331 / 331; 12 run lặp (R4) dải 0 |
| Bản gốc | repo phutro, nhánh `phutro`, `runs/2026-11-22_2239/ket-qua.xlsx` (commit `3e2651b`) |

File: [ket-qua.xlsx](ket-qua.xlsx).

## Kết quả (P1, 310 run, 30–80 km/h × mức 1–9 m/s² và 100%)

| Xe | Lệch giả định tuyến tính (RMS) | Hồi quy `a_đo = k·a + c` | Vùng chết bàn đạp | Bảng theo tốc độ (leave-one-out RMS) | Độ trễ đạt lực (≥ 50 km/h, mức ≥ 5) |
|---|---|---|---|---|---|
| Model 3 | 0,34 m/s² | 1,044·a − 0,511 | 0,050 | 0,047 m/s² | 0,046 ± 0,009 s |
| Patrol | 1,23 m/s² | 1,016·a − 0,997 | 0,099 | 0,197 m/s² | (1,56 s — do phanh mạnh dần khi chậm lại, không phải trễ) |
| Sprinter | 0,78 m/s² | 1,058·a − 0,747 | 0,079 | 0,166 m/s² | (1,30 s — như trên) |

Phanh 100% theo tốc độ (m/s²): Model 3 10,9 (45) → 9,7 (80); Patrol 12,9 (50) → 8,4 (80); Sprinter 12,9 (45) → 8,3 (80).

**Xe + người (P2, 8 m/s², người 1,5 m/s, kích hoạt 25 m):** không ca nào va chạm; Δ quãng dừng −0,4 đến −2,7 m (CARLA gốc, còn cú dừng gấp dưới 6 m/s).

## Dùng vào đâu

[ADR-059](../../../../adr/ADR-059-ban-dap-theo-toc-do-3-xe.md) (`.xosc` v13): bảng bàn đạp theo tốc độ cho 3 xe; bù pha tăng lực cho Model 3.
