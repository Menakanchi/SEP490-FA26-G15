# ADR-057 — Hành lang AEB theo bề rộng của xe chạy (bộ động học 1.2, `.xosc` v11)

**Trạng thái:** ✅ Accepted 22/11/2026 — chủ dự án chốt, không chờ thành viên phụ trách lõi AEB / tối ưu. Unit test đã chạy; chưa chạy CARLA thật
(gộp vào lần kiểm của [exec plan 22/11](../exec-plans/active/2026-11-22-kiem-carla-that-nguoi-di-bo.md)).
**Liên quan:** ADR-040 (4 tham số AEB), ADR-042 (lõi Java), ADR-055 (bộ động học 1.1); migration 017 (giới hạn phanh theo xe).

## Bối cảnh

AEB coi người đi bộ "trong đường đi" khi khoảng cách ngang ≤ nửa hành lang. Từ bản MVP Python (30/09/2026) tới lõi Java, nửa hành lang được gán cứng
theo bề rộng e-tron: `AebParams.corridorHalfWidth() = 0,5 · 1,93 + 0,25 · SAFETY_DISTANCE_MARGIN_M` = 1,465 m cho **mọi** xe. Phần chấm va chạm và khoảng
cách lại dùng bề rộng thật. Hệ quả với danh mục 5 xe (rộng 1,93–2,89 m): AEB quyết định cùng thời điểm ở mọi xe; xe rộng có thể va chạm mà AEB không
phản ứng. Ví dụ 30 km/h, kích hoạt 15 m, người 1,0 m/s, xe rộng 2,89 m: hành lang 1,93 m không ra quyết định và va chạm; hành lang theo xe quyết định ở
1,95 s và dừng cách người 2,9 m (`AebCorridorTest`).

## Quyết định

1. Nửa hành lang = `0,5 · bề rộng xe chạy + 0,25 · SAFETY_DISTANCE_MARGIN_M` (`AebParams.corridorHalfWidth(widthM)`). Hằng 0,25 và khoảng đệm 2,0 m
   giữ nguyên; chỉ bề rộng đổi. Áp cho người đi bộ và xe phía trước (cùng hàm `decide`).
2. Bộ động học đổi định danh `vehicsim-kinematic-1.1` → `vehicsim-kinematic-1.2`; CARLA `.xosc` v10 → v11 (`-xosc11`, file giống v10 trừ `vs_format`).
   Backend từ chối chạy lại run PENDING mang định danh cũ, không ghép với định danh mới.
3. Đường so fixture Python (`relativeImpact = false`, định nghĩa 1.0) và profile CARLA ≤ v10 giữ 1,93 m, để fixture parity và run cũ chạy lại ra đúng số.
   Run 1.1 không có đường chạy lại riêng (như TD-40).
4. Xe rộng đúng 1,93 m (e-tron) ra số y hệt trước.

## Hệ quả

- Baseline động học và CARLA của xe không phải e-tron cần chạy lại bằng `1.2` / `-xosc11`; baseline e-tron cũng phải chạy lại vì đổi định danh (số không đổi).
- Xe rộng hơn phát hiện người đi bộ ở mép làn sớm hơn — gồm cả người dừng ở lề — nên tỷ lệ phanh oan của xe rộng có thể tăng; phần tối ưu / regression
  cần xem lại theo từng xe.
- `KinematicParityTest#currentDefinitionOnlyChangesTheImpactSpeedKeys` chỉ còn khẳng định "chỉ đổi khóa vận tốc va chạm" với xe rộng 1,93 m.

## Cập nhật 23/11/2026 — phanh oan theo xe (bộ động học 1.3, TTC 1,5 s)

Lưới 2 100 ca mỗi xe (20–60 km/h × kích hoạt 10–60 m × người 0,8–3 m/s × khô / mưa × 3 seed, một nửa người băng qua, một nửa dừng ở lề). Phanh oan = AEB
quyết định phanh nhưng người không vào đường đi của xe (đường đi theo bề rộng thật):

| Xe (bề rộng) | Phanh oan — hành lang 1,93 m | — hành lang theo xe | Thay đổi | Riêng ca dừng ở lề | Bỏ sót |
|---|---|---|---|---|---|
| e-tron (1,93 m) | 11,3 % | 11,3 % | 0 | 21,4 → 21,4 % | 0 → 0 |
| Model 3 (2,16 m) | 11,1 % | 13,4 % | **+2,3 điểm %** | 21,4 → 25,6 % (+4,2) | 0 → 0 |
| Patrol (2,15 m) | 11,1 % | 13,3 % | **+2,2 điểm %** | 21,4 → 25,5 % (+4,1) | 0 → 0 |
| Sprinter (1,99 m) | 11,3 % | 11,9 % | +0,6 điểm % | 21,4 → 22,5 % (+1,1) | 0 → 0 |
| HGV (2,89 m, `is_supported = FALSE`) | 10,7 % | 22,7 % | +12,0 điểm % | 21,4 → 45,3 % | **33 → 0** |

4 xe dùng được tăng tối đa 2,3 điểm % (ngưỡng regression 5 điểm %, ADR-044); riêng ca dừng ở lề tăng tới 4,2 điểm % ở xe rộng 2,15–2,16 m. Phanh oan ở ca
dừng ở lề vốn cao (21 % kể cả e-tron) do AEB dự đoán quỹ đạo người 2 s — điểm nên xem ở phần tối ưu AEB. HGV: hành lang 1,93 m bỏ sót 33 ca người vào đường đi
của xe; hành lang theo xe hết bỏ sót nhưng phanh oan gấp đôi.

Kiểm thử: `AebCorridorTest`, `KinematicParityTest`, `CarlaWebTest`, `BridgeProtocolTest`, `XoscExportTest`.
