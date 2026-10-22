# Phần 2 "Chạy baseline": việc của thành viên 2 theo kế hoạch 20/10 (22/10/2026)

**Trạng thái:** đang làm. Phạm vi: [kế hoạch 20/10](../../vehicsim/ke-hoach-sua-theo-pdf-va-quyet-dinh-2026-10-20.md) §6 "Thành viên 2" và
[phân chia 5 thành viên](../../vehicsim/phan-chia-cong-viec-5-thanh-vien.md) §4. Quyết định perception: [ADR-043](../../adr/ADR-043-perception-tu-radar-chay-bong-truoc.md) (Proposed).
Tất cả số đo trên CARLA 0.9.16 thật (Town04, file `data/hz100-20261020/scenario.xosc`: 40 km/h, kích hoạt 25 m, người đi bộ 3 m/s, seed 48846, AEB mặc định);
dữ liệu ở `data/` (ngoài git).

## Việc và trạng thái

| Việc | Trạng thái | Bằng chứng |
|---|---|---|
| 1. Perception từ radar | **Giai đoạn 1 (chạy bóng) xong, đo 6 ca; vận tốc hồi quy cửa sổ. Giai đoạn 2 bị chặn: track giả ở ca an toàn c6** | mục 1, 1b |
| 2. Hiệu chuẩn phanh | Có công cụ + số đo e-tron; **chưa ghi DB** (chờ quyết định) | mục 2 |
| 3. Chạy lặp, dung sai | Có công cụ; n=5 trên ca dừng, ca va chạm, ca an toàn; **đề xuất dung sai** chờ thành viên 3, 5 chốt | mục 3 |
| 4. Đọc lại physics | Xong: `physics_applied` (21/10) + `physics_check` so yêu cầu ↔ thực áp (22/10) | mục 4 |
| 5. AEB tắt | **Chưa code** — đề xuất, chờ định nghĩa chỉ số (mục 5) | — |
| TD-34 tắt backend giữa run | Xong: ghi cờ dừng trước, chờ `STOP_GRACE_S` rồi mới giết; xoá TD-34 | `CarlaWebTest.shuttingDownMidRunAsksTheWorkerToCleanUpBeforeKillingIt` |

## 1. Perception từ radar — chạy bóng (ADR-043 giai đoạn 1)

Thay đổi: `com.vehicsim.core.RadarTracker` (bộ bám, chỉ JDK); `AebStack.stepMeasured` (perception đo được, dùng chung code quyết định/điều khiển — tách hàm
không đổi phép tính nào của đường ground truth, `KinematicParityTest` xanh); `CarlaSession` chạy một `AebStack` bóng nạp từ radar và ghi
`case.carla.perception_shadow`; cầu nối nhận `radar` mỗi `step`, `open` trả thuộc tính radar (một nguồn); adapter gắn radar 90°/80 m/40 000 điểm/s ở mũi xe
và chỉ chuyển điểm thô. Test: `RadarTrackerTest` (5), `BridgeProtocolTest.radarShadowIsMeasuredButNeverChangesTheRealRun` (kết quả thật trùng từng trường
khi có/không radar), `test_radar_points_of_the_latest_measurement_are_forwarded_raw`.

| Chỉ số (CARLA thật) | Ground truth | Radar bóng α=0,5 / β=0,2 (mặc định) | Radar bóng α=0,2 / β=α²/(2−α) |
|---|---|---|---|
| Phát hiện lần đầu | 0,00 s | 1,65 s | 1,65 s |
| FCW | 1,95 s | 2,25 s | 1,80 s |
| Quyết định AEB | 2,25 s | **2,25 s** | 2,60 s |
| Sai số dọc / ngang TB | — | 0,167 / 0,065 m | 0,179 / 0,055 m |
| Sai số vận tốc ngang TB / max | — | 1,58 / 9,19 m/s | **0,36** / 1,42 m/s |
| Track bám nhầm | — | 0 | 0 |

- AEB thật không đổi (1,95/2,25/2,50/3,80 s; quãng dừng 10,203 m); thời gian run 46 s (trước 45 s).
- Radar Doppler không thấy người **đứng yên** ở lề (phần dư ≈ 0): phát hiện khi người bắt đầu đi (1,65 s). Mô hình tổng hợp "thấy" từ 0 s.
- Hệ số nhanh cho quyết định đúng giờ nhờ vận tốc nhiễu đoán dư; hệ số chậm cho vận tốc tốt nhưng vị trí trễ, quyết định muộn 0,35 s.

### 1b. Vận tốc từ hồi quy cửa sổ, 5 ca (22/10)

Sửa bộ bám: giữ α=0,5/β=0,2 cho vị trí và dự đoán cổng; vận tốc ngang đầu ra = độ dốc bình phương tối thiểu của tâm điểm đo trong 0,2 s gần nhất (≥ 5 mẫu,
thiếu thì dùng bộ lọc). Khi đã có track, tâm đo lấy **mọi** điểm trong cổng: lọc theo phần dư Doppler làm tâm nhảy giữa hai phản xạ khi người tới gần tim
làn (phần dư từng điểm lần lượt rơi dưới 0,25 m/s) — test tổng hợp cho vận tốc 3,70 thay vì 3,00 trước khi sửa. `RadarTrackerTest` siết sai số vận tốc còn 0,1 m/s.

IR ở `data/radar-cases-20261022/*.json`, xuất bằng `BridgeMain export`, cùng seed 48846, e-tron, AEB mặc định. Người đi bộ bắt đầu đi ở 1,54 s mọi ca
(ground truth "thấy" từ 0 s vì mô hình tổng hợp). Thời điểm (s) ground truth → radar bóng; sai số vận tốc ngang TB / max (m/s) trước → sau sửa:

| Ca | Kết thúc (AEB thật) | Phát hiện radar | FCW | Quyết định | v ngang trước | v ngang sau | Sai số ngang TB | Track giả |
|---|---|---|---|---|---|---|---|---|
| c1 40 km/h, 25 m | dừng, cách 2,63 m | 1,65 | 1,95 → 1,65 | 2,25 → **2,25** (trước sửa 2,40) | 1,53 / 8,54 | **0,29** / 1,09 | 0,069 m | 0 |
| c2 60 km/h, 15 m | va chạm 2,61 s, GT không quyết định | 1,80 | — → 2,35 | — → 2,35 | 0,99 / 3,21 | **0,31** / 0,73 | 0,047 m | 0 |
| c3 50 km/h, 25 m, dừng ở lề | va chạm (TD-47) | 1,85 | 2,10 → 1,85 | 2,10 → 1,85 | 1,14 / 5,77 | **0,27** / 1,55 | 0,036 m | 0 |
| c4 30 km/h, 35 m, 2 m/s | dừng, cách 5,69 m | 1,20 | 3,25 → 3,15 | 4,25 → **4,25** | 1,44 / 7,67 | **0,26** / 3,02 | 0,047 m | 0 |
| c5 50 km/h, 20 m, mưa đêm | va chạm 2,95 s | 1,80 | 2,20 → 2,05 | 2,20 → 2,05 | 1,11 / 5,42 | **0,34** / 2,20 | 0,035 m | 0 |

- Radar phát hiện 0,11–0,31 s sau khi người bắt đầu đi (c4 sớm hơn mốc `gt_start` vì mốc này cần v > 0,05 m/s). Không ca nào có track bám nhầm.
- Quyết định bóng trùng ground truth ở c1, c4; sớm hơn 0,15–0,25 s ở c3, c5 (lúc ground truth đang bị perception tổng hợp làm trễ ở trời mưa/đêm: c5
  phát hiện GT ở 1,10 s). **c2**: AEB ground truth không ra quyết định trước va chạm, bản bóng quyết định ở 2,35 s (va chạm 2,61 s). Đây là hành vi của
  luật quyết định AEB (phần 3/4 phân tích), ghi lại ở đây, không sửa ở phần 2.
- AEB thật giữa hai lượt: cùng thời điểm sự kiện; c1 khoảng cách nhỏ nhất 2,586 → 2,629 m, quãng dừng 11,469 → 11,405 m — trong dao động chạy lặp (mục 3).
- **Ca an toàn c6 (20 km/h, kích hoạt 50 m, 3 m/s) — track giả:** AEB thật và bản bóng đều không phanh (5/5 lần), nhưng radar mở track từ 0,58 s, trước khi người
  đi bộ chuyển động, và bám sai mục tiêu ~730/789 khung. `perception_shadow.first_off_target` (thêm để chẩn đoán): xe 5,66 m/s ổn định, track ở 27,95 m phía
  trước, lệch phải 5,64 m (lề đường), người đi bộ còn ở 55 m. Vì bộ bám chỉ bám một mục tiêu, track giả có thể che người đi bộ.
- **Thử và gỡ (22/10):** bỏ track có vận tốc mặt đất < 0,5 m/s và cấm mở lại 2 s. Trên CARLA: c6 vẫn 662 khung sai (bỏ 8 lần, mở lại ở vật khác — có thể
  dãy cột/rào), c4 xấu đi (bỏ nhầm người đi bộ, quyết định 4,25 → 4,35 s, 285 khung sai). Đã gỡ, giữ bộ bám hồi quy ở trên. Bước tiếp: ghi điểm radar thô
  quanh track giả để biết vì sao vật lề đường có phần dư Doppler > 0,25 m/s, và cân nhắc bám nhiều mục tiêu.
- **Chưa sang giai đoạn 2:** track giả trên ca an toàn là điều kiện chặn theo ADR-043. Sai số ngang (≤ 0,07 m) và vận tốc đã đạt mức đề xuất; tiêu chí "phát hiện ≤ 0,3 s sau ground truth" cần viết lại theo
  thời điểm người bắt đầu đi (radar Doppler không thấy người đứng yên — đặc tính cảm biến, không phải lỗi bám); ca an toàn ở mục 3. Đổi đầu vào sẽ làm
  quyết định khác ở 3/5 ca, nên cần nhóm chốt tiêu chí trước khi lên `-xosc4`.

## 2. Hiệu chuẩn phanh — `worker/measure_brake.py`

Đặt xe trên Town04 road 40, giữ tốc độ, phanh 100%, đo giảm tốc (hồi quy tốc độ–thời gian) trên dải 0,95·v0 → 6 m/s; bỏ dải ngắn hơn 0,5 s. Ép khối lượng
như lúc chạy thật. Test: `test_measure_brake.py`. `audi.etron`, 2100 kg (`data/brake-etron-20261022/brake_measurement.json`, đo hai lần ra cùng số):

| Tốc độ | 30 km/h | 40 km/h | 50 km/h | 60 km/h |
|---|---|---|---|---|
| Giảm tốc (m/s²) | 5,562 (dải 0,26 s — loại) | 4,723 | 4,649 | 4,637 |
| Quãng dừng (m) | 4,19 | 10,24 | 17,79 | 27,10 |

Đề xuất `carla_full_brake_decel_mps2 = 4,67` (chênh 0,086 giữa 40–60 km/h). Mặc định hiện tại 4,6 lệch 1,5%.
**Cần quyết định:** ghi 4,67 vào DB làm đổi bàn đạp ⇒ kết quả CARLA của xe đó đổi; baseline/candidate phải cùng giá trị. Đề xuất: ghi, và chạy lại baseline
CARLA của xe (không ghép run trước/sau khi đổi), hoặc giữ 4,6 vì lệch nhỏ hơn dung sai chạy lặp.
**Khuyến nghị của thành viên 2 (22/10):** chưa ghi DB. Lệch 1,5% bàn đạp nhỏ hơn dao động đã đo của chỉ số; ghi 4,67 cùng lúc với lần đổi lớn tiếp theo bắt
buộc chạy lại baseline CARLA (giai đoạn 2 radar `-xosc4`), để chỉ một lần mất khả năng so với run cũ. Ghi DB là thao tác của người quản lý dữ liệu xe, không
tự làm trên DB dev.

## 3. Chạy lặp — `worker/repeat_xosc.py`

Chạy N lần (mỗi lần một `run_xosc.py`), ghi `repeat_summary.json` (TB, độ lệch chuẩn mẫu, khoảng; thiếu số không thành 0; run lỗi đếm riêng). Test: `test_repeat_xosc.py`.
n=5 (`data/repeat-radar-20261022`, 121 s): FCW/quyết định/phanh 1,95/2,25/2,50 s cả 5 lần; quãng dừng 10,226 ± 0,052 m (khoảng 0,116); khoảng cách nhỏ nhất
3,558 ± 0,044 m; RMS jerk 38,385 ± 0,010; radar bóng: phát hiện 1,65 s và quyết định 2,25 s cả 5 lần. Khớp dung sai đo 20/10 (n=9).
Thêm 22/10, mỗi ca n=5 (`data/repeat-safe-20261022`, `data/repeat-collision-20261022`):

| Ca | Sự kiện (FCW/quyết định/phanh) | Kết thúc | Quãng dừng (m) | Vận tốc va chạm (m/s) | RMS jerk | Khoảng cách nhỏ nhất (m) |
|---|---|---|---|---|---|---|
| c6 an toàn 20 km/h, 50 m | không có, cả 5 lần | `TARGET_CLEARED` ×5 | — | — | — | 14,135 ± 0 |
| c5 va chạm 50 km/h, 20 m, mưa đêm | 2,20/2,20/2,45 cả 5 lần | `COLLISION` ×5 | 17,568 ± 0,045 (khoảng 0,085) | 12,270 ± 0,021 (0,041) | 17,61 ± 0,34 (0,70) | 0 |

Ca an toàn tất định tuyệt đối (không phanh oan ở AEB thật). Ca va chạm: sự kiện trùng tuyệt đối; số liên tục dao động nhỏ; **RMS jerk dao động 4%** (pha phanh
ngắn, kết thúc bằng va chạm) — lớn hơn nhiều so với ca dừng an toàn (±0,010 trên 38,4).

**Đề xuất của thành viên 2** (chờ thành viên 3 — chỉ số, 5 — regression chốt): (1) sự kiện rời rạc (phát hiện/FCW/quyết định/phanh, lý do kết thúc, có/không
va chạm) phải trùng tuyệt đối; (2) quãng dừng, khoảng cách nhỏ nhất, vận tốc va chạm: chênh ≤ 0,15 m / 0,15 m / 0,1 m/s coi là cùng kết quả (≈ 3 sd lớn nhất
đã đo); (3) RMS jerk: so tương đối ±5% ở ca va chạm, ±0,1 ở ca dừng; (4) ngoài dung sai mới tính là cải thiện/xấu đi. Số chỉ áp cho CARLA `-xosc3`, e-tron.

## 4. Đọc lại và so physics — `case.carla.physics_check`

`CarlaSession.physicsCheck` so thông số yêu cầu (DB → `.xosc`) với số CARLA đọc lại sau khi ép: trường ép được (khối lượng, hệ số cản, trọng tâm) phải khớp
trong 0,1% (`forced_ok`); kích thước mesh (dài, rộng, cao, cơ sở) chỉ báo lệch, ngưỡng 0,05 m (`dimensions_ok`), vì blueprint cố định mesh. Thiếu một trong hai
số thì ghi dòng nhưng không tính là lệch. Không chặn run, không sửa số. Test: `CarlaSessionLogicTest.physicsCheckFlags…`. Trên CARLA thật (5 ca IR không gắn
xe DB): `forced_ok = true`, mesh e-tron dài/rộng hơn kích thước mặc định của IR 0,106/0,103 m ⇒ `dimensions_ok = false`. Phạm vi đã kiểm: chỉ
`vehicle.audi.etron`; xe khác cần chạy `measure_brake.py` và xem `physics_check` trước khi dùng.

## 5. AEB tắt — chờ định nghĩa

Lý do chưa code (22/10): cắt bàn đạp thôi chưa đủ. `Simulator.buildOutcome` tính quãng dừng, thời điểm phanh, RMS jerk pha phanh và điều kiện kết thúc
`EGO_STOPPED` từ `brakeOnsetT`/quyết định của stack; ở chế độ tắt các số đó sẽ mang nghĩa sai nếu không định nghĩa lại. Phương án đề xuất: tham số `.xosc` `vs_aeb_mode = ON|OFF`; ở `OFF`, `CarlaSession` vẫn chạy perception/quyết định để ghi "AEB lẽ ra làm gì" nhưng không áp
bàn đạp; `result.json` ghi `aeb_mode`; regression/tối ưu từ chối run `OFF` làm baseline; đổi identity profile. Cần thành viên 3, 5 chốt: baseline đo "AEB hiện tại",
"AEB tắt" hay cả hai; có cần cột DB (quy trình schema đầy đủ) hay chỉ trong `.xosc`/`result.json`.
