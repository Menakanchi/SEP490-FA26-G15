# Lần chạy 2026-11-16_2229 (đợt 3: 500 run quét dày các chỗ còn lệch)

| Mục | Giá trị |
|---|---|
| Bắt đầu | 2026-11-16 22:29 |
| Commit công cụ (phutro) | `06cb28a`, danh sách ca `cases_dot3.yaml` |
| Máy | DESKTOP-LULG63N — Windows 10 (19045) |
| GPU | NVIDIA GeForce RTX 5060 |
| CARLA server / gói | 0.9.16 / 0.9.16 |
| Run hợp lệ / tổng | 498 / 500 (`D2-patrol-30-0.5`, `D2-sprinter-30-0.5`: hết thời gian mô phỏng, xe gần như không ăn phanh) |
| Độ lặp lại | 24 run lặp (nhóm R3): dải dao động 0 ở mọi chỉ số |
| File đầy đủ (kèm sheet "Khung hình", 14,7 MB) | repo phutro, nhánh `phutro`, `runs/2026-11-16_2229/ket-qua.xlsx` (commit `0651b31`) |

File ở đây: [ket-qua.xlsx](ket-qua.xlsx), bỏ sheet "Khung hình" để dưới giới hạn 10 MB ([quy ước](../README.md)); mọi sheet khác giữ nguyên.
Lệnh phanh cố định, không AEB, CARLA gốc (chưa có kẹp μ·g, đặt tốc độ vùng thấp, bảng bàn đạp của adapter).

## Nhóm ca

| Nhóm | Ca | Run |
|---|---|---|
| D1 | e-tron, 15–100 km/h (bước 5) × mức 1–9 m/s² và 100% | 170 |
| D2 | Model 3 / Patrol / Sprinter / HGV ở physics mặc định, 20–60 km/h × các mức | 118 |
| D3 | e-tron, ma sát lốp × 0,3–1,5 × 30 / 50 / 70 km/h × 6 m/s² và 100% | 36 |
| D4 | Xe + người: 20–60 km/h × người 0,8–3,5 m/s × kích hoạt 15 / 25 / 40 m | 90 |
| D5 | Người đi bộ 0,5–6 m/s, đi thẳng và dừng ở lề | 24 |
| D6 | e-tron, khối lượng × 0,7–1,5 | 20 |
| D7 | e-tron, RAIN / HEAVY_RAIN × 30 / 50 / 70 km/h × 4 / 8 m/s² và 100% | 18 |
| R3 | Lặp 14 ca đại diện | 24 |

## Độ lệch (CARLA − mô hình, trung bình ± độ lệch chuẩn)

Quãng dừng tách tại 6 m/s từ khung hình: phần dưới 6 m/s là cú dừng gấp ADR-053 đã thay; phần trên 6 m/s là phần còn lại sau v7.

| Điều kiện | n | Δ quãng dừng tổng (m) | Phần < 6 m/s | Phần ≥ 6 m/s |
|---|---|---|---|---|
| e-tron khô, mức 4–8 m/s², ≥ 50 km/h | 55 | −0,43 ± 1,43 | −2,52 ± 0,81 | +2,09 ± 2,03 |
| e-tron khô, phanh 100% | 16 | −1,36 ± 0,63 | −1,30 ± 0,02 | −0,06 ± 0,64 |
| e-tron khô, mức 1–2 m/s² | 22 | +14,3 ± 14,8 | −6,3 ± 2,4 | +20,6 ± 16,9 |
| Xe + người (D4) | 72 | −1,94 ± 0,28 | −1,58 ± 0,02 | −0,36 ± 0,29 |
| Mưa (D7) | 18 | −5,05 ± 3,80 | −2,89 ± 0,73 | −2,16 ± 4,22 |

| Chỉ số | Kết quả |
|---|---|
| Giảm tốc dưới 6 m/s (D1) | 20,4 ± 6,9 m/s², tới 25 — mọi mức bàn đạp |
| a_dải − a_đích, e-tron ≥ 50 km/h, mức 2–9 | −0,33 ± 0,15 m/s² (vùng chết bàn đạp ≈ 0,05). Hồi quy `a_đo ≈ 1,032 · a_đích − 0,512`, dư 0,136 |
| Bảng bàn đạp theo tốc độ (leave-one-out 97 điểm) | RMS 0,073 m/s² (hồi quy tuyến tính: 0,198) |
| 40–45 km/h, bàn đạp lớn | 10,3–10,6 m/s² (+0,8 đến +2,3 so với đích): quá độ hệ treo trong dải đo ngắn |
| Đạt 90% lực phanh, mức 5–9, ≥ 50 km/h | Chậm hơn mô hình 0,05–0,06 s (độ lệch chuẩn ≤ 0,009 s) |
| Người vào hành lang (D5) | Muộn 0,340 ± 0,003 s ở mọi tốc độ; đạt 90% tốc độ sau 0,610 s |
| Dừng ở lề, nhô vào làn | 0,0564 · v (dư 0,006 m); 6 m/s → 0,35 m |
| Khoảng cách nhỏ nhất xe–người (D4) | +0,77 ± 2,99 m; độ lệch chuẩn tăng theo tốc độ (± 1,6 m ở 20 km/h, ± 4,3 m ở 60 km/h) |
| Khác loại kết quả (D4) | 11/93: kích hoạt 15 m ở 50–60 km/h — mô hình va chạm, CARLA không (người CARLA khởi động chậm + dừng gấp) |
| Thời tiết (D7) | Ở 4 m/s² giống hệt đường khô; 8 m/s² / 100% chỉ thấp hơn 0,1–0,6 m/s² — mưa CARLA không giảm bám |
| Ma sát lốp (D3) | Lốp × 0,3 vẫn phanh 7,6 m/s² ở 50 km/h; × 1,5 lên 10,8 — không giả lập được μ thấp bằng physics |
| Khối lượng (D6) | a · m gần như không đổi (8,8–9,2 khi × 0,7–1,5): phanh giới hạn bởi lực, đúng vật lý |
| Xe chưa hiệu chuẩn (D2, 50 km/h, 100%) | Model 3 3,57; Patrol 6,04; Sprinter 5,69; HGV 1,77 m/s² |

## Dùng vào đâu

[ADR-054](../../../../adr/ADR-054-xosc8-hieu-chuan-ban-dap-va-nguoi-di-bo.md) (`.xosc` v8): bảng bàn đạp e-tron theo tốc độ (D1), người đi bộ khởi
hành sớm v × 0,34 s (D5), hệ số trượt dừng lề 0,056 s (D5). D3 / D7 xác nhận giữ kẹp μ·g ở adapter (ADR-052). D2 là đầu vào cho đợt 2
nhóm X1 ([2026-11-20_2217](../2026-11-20_2217/README.md)).
