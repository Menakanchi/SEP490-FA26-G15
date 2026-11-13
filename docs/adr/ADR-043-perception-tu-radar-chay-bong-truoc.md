# ADR-043 — Perception AEB trên CARLA lấy từ radar, chạy bóng trước khi thay ground truth

**Trạng thái:** Proposed 22/10/2026 (TrungDQ, phần 2 "Chạy baseline"; kế hoạch 20/10 việc 1, quyết định D1/D2).
**Cập nhật 13/11/2026:** ✅ **Accepted** (TrungDQ chốt). Giai đoạn 2 đã triển khai ở `.xosc` v6 / `-xosc6` (mục "Giai đoạn 2 — triển khai 13/11" cuối
file). Tiêu chí "phát hiện ≤ 0,3 s sau khi người bắt đầu đi" **thay** bằng tiêu chí theo quyết định AEB (mục "Tiêu chí chốt 13/11").
**Liên quan:** [ADR-042](ADR-042-loi-aeb-mo-phong-cham-diem-chuyen-sang-java.md) (một AEB, ở Java), TD-01, kế hoạch
[20/10](../vehicsim/ke-hoach-sua-theo-pdf-va-quyet-dinh-2026-10-20.md) mục 5.2.

## Bối cảnh

Trên CARLA, controller đưa **vị trí/vận tốc ground truth** của người đi bộ vào `AebStack`; perception là mô hình tổng hợp (độ tin cậy theo
thời tiết, nhiễu theo seed). Kế hoạch 20/10 yêu cầu ground truth chỉ dùng để **chấm**, còn đầu vào AEB phải là thứ cảm biến **đo được**
(tiêu chí nghiệm thu đầu tiên của thành viên 2). Radar recorder hiện có (±15°, chỉ lấy điểm trong nón ±4°) chỉ để ghi dữ liệu, không nhìn
thấy người đi bộ khi họ còn ở lề.

Radar CARLA trả mỗi điểm: `depth`, `azimuth`, `altitude`, `velocity` (vận tốc **xuyên tâm**, âm = tiến lại gần). Doppler không phân biệt người
đang băng ngang với vật đứng yên ở cùng góc: cả hai có `v_r ≈ −v_ego·cos(az)`. Thứ phân biệt được là **phần dư Doppler**
`r = v_r + v_ego·cos(az)` (≈ 0 với vật tĩnh) và sự thay đổi vị trí giữa các lần đo.

## Lựa chọn

1. Đổi thẳng AEB sang radar trong một bước. Loại: không có số đo sai số trước khi đổi; mọi run CARLA đổi kết quả cùng lúc, không tách được
   "lỗi bộ bám" với "lỗi AEB".
2. Camera + mô hình nhận diện (YOLO). Loại cho giai đoạn này: cần GPU/mô hình ngoài CARLA, nặng cho máy dev; có thể làm sau.
3. **Radar toàn góc nhìn + bộ bám mục tiêu trong lõi Java, hai giai đoạn** — chọn.

## Quyết định

- **Cảm biến:** một radar riêng gắn mũi xe ego, FOV ngang 90°, tầm 80 m (= `AebStack.SENSOR_RANGE_M`), tách khỏi radar ±15° của recorder.
  Adapter Python chỉ đọc điểm thô của tick trước rồi gửi qua cầu nối; **không** lọc hay bám ở Python (luật cứng 8).
- **Bộ bám (`com.vehicsim.core.RadarTracker`, chỉ JDK):** đổi điểm sang khung giao cắt (dọc/ngang theo xe), bỏ điểm mặt đường (altitude < −1°)
  và điểm phi vật lý; khởi tạo track từ cụm điểm có |phần dư Doppler| vượt ngưỡng; bám bằng cổng vị trí (mọi điểm trong cổng); ước lượng vị trí
  (alpha–beta), vận tốc ngang (hồi quy tuyến tính tâm điểm đo trong cửa sổ 0,2 s — sửa 22/10 sau đo CARLA, xem exec plan 22/10) và độ tin cậy (số lần đo liên tiếp, mất mục tiêu thì giảm dần). Hằng số của bộ bám là hằng số lõi, ghi trong
  `result.json`.
- **Giai đoạn 1: chạy bóng.** `AebStack` vẫn nhận ground truth; `RadarTracker` chạy song song mỗi tick và ghi vào `result.json`
  `case.carla.perception_shadow`: nguồn (`radar`), thời điểm phát hiện đầu tiên, sai số dọc/ngang/vận tốc ngang so với ground truth (trung bình,
  lớn nhất), tỉ lệ khung có track, và thời điểm AEB **sẽ** quyết định nếu dùng radar. Quyết định AEB và mọi chỉ số đã lưu không đổi ⇒ giữ `-xosc3`.
- **Giai đoạn 2: đổi đầu vào.** Chỉ khi số đo chạy bóng trên CARLA thật đạt ngưỡng nhóm chốt (đề xuất của thành viên 2: phát hiện ≤ 0,3 s sau khi
  người bắt đầu chuyển động — radar Doppler không thấy người đứng yên nên không so với mốc 0 s của mô hình tổng hợp; sai số ngang trung bình ≤ 0,3 m;
  không track giả trên ca an toàn; ghi rõ những ca quyết định bóng khác ground truth): `AebStack` nhận đầu vào từ `RadarTracker`, `result.json` ghi
  `perception_source = radar`, profile lên định danh mới (viết 22/10 là `-xosc4`; số này đã dùng cho TD-47 và `-xosc5` cho ADR-051, nên thực tế là
  **`-xosc6`**, xem cuối file).
  Bộ động học không đổi (vẫn mô hình tổng hợp, `vehicsim-kinematic-1.0`).

## Hệ quả

- Có bằng chứng định lượng về perception trước khi đổi hành vi; run `-xosc3` cũ vẫn so được với nhau.
- Mỗi tick thêm một radar 90° và một mảng điểm qua cầu nối; phải đo thời gian chạy (100 Hz) trước khi kết luận.
- Giới hạn đã thấy ở test (`RadarTrackerTest.aCrossingTargetFirstSeenNearTheLaneCentreCannotStartATrack`): người băng ngang ở gần tim làn
  có phần dư Doppler ~0,15 m/s (dưới ngưỡng 0,25) nên không **mở** được track ở đó; ở lề (−3,6 m, 20–25 m phía trước) phần dư ~0,4 m/s mở được,
  rồi cổng vị trí giữ track khi người đi vào giữa làn. Người xuất hiện đột ngột ngay giữa làn (bị che) là ca radar Doppler bỏ sót.
- Ca **băng ngang** là ca khó nhất của radar (vận tốc chủ yếu vuông góc với tia): nếu chạy bóng cho thấy không đạt, ghi rõ giới hạn và cân nhắc
  camera, không chỉnh hằng số cho khớp một ca.
- Đo 22/10 (exec plan 22/10 mục 1b): ca an toàn 20 km/h có track giả trên vật lề đường (~28 m trước, 5,6 m bên phải) từ 0,58 s; luật "bỏ track tĩnh" không
  sửa được và làm hỏng ca khác nên đã gỡ. Giai đoạn 2 chờ chẩn đoán điểm thô và/hoặc bám nhiều mục tiêu.
- Bộ động học và CARLA dùng hai perception khác nhau sau giai đoạn 2: đúng với luật 9 (không ghép kết quả hai bộ), nhưng báo cáo phải ghi rõ.

## Giai đoạn 2 — triển khai 13/11/2026 (`.xosc` v6, `-xosc6`)

### Nguyên nhân track giả ở ca an toàn c6 (đo bằng điểm radar thô)

Ghi điểm radar thô mỗi tick (`VSOS_RADAR_DUMP=1` → `radar_dump.jsonl`) trên 6 ca CARLA thật (`data/radar-mtt-20261113/dump-*`). Phần dư Doppler của **mọi**
điểm có độ lệch chuẩn 0,34 m/s và 89% vượt ngưỡng 0,25 ở c6, dù trung bình ≈ 0: lỗi không nằm ở một vật lề đường. Tốc độ ego của CARLA dao động răng cưa từng
tick và lệch pha với lần đo radar (trung bình thì `egoV` khớp quãng dịch chuyển thật 5,543 m/s; từng tick radar thấy 5,36 khi `egoV` báo 5,75), nên bù theo
`egoV` của tick làm mọi điểm lệch cùng một lượng. Trừ trung vị Doppler của cùng lần đo thì độ lệch chuẩn trong tick còn 0,05 m/s và chỉ 0,3% điểm vượt ngưỡng.
Bộ bám một mục tiêu còn khuếch đại lỗi: vật tĩnh trả điểm mỗi tick nên track không bao giờ mất và che người đi bộ.

### Thay đổi

- **Tốc độ radar từ cảnh tĩnh** (`RadarTracker.sensorSpeed`): trung vị `−v_r/(cos az·cos alt)` của lần đo (≥ 10 điểm gần trục), thay `egoV` khi tính phần dư —
  cách radar ô tô ước lượng chuyển động của chính nó. Ngưỡng mở track hạ 0,25 → 0,15 m/s (3σ của nhiễu trong tick đã đo).
- **Nhiều mục tiêu, chặn vật tĩnh:** mọi track được giữ (track tĩnh "hút" điểm của vật đó nên không mở lại); chỉ báo track **chuyển động so với mặt đất**:
  thành phần ngang từ hồi quy vị trí, thành phần dọc từ Doppler (tâm cụm điểm trên thân người dao động dọc 0,1–0,17 m; Doppler của người đi bộ khớp vận
  tốc thật trong 0,03 m/s). Điều kiện: ≥ 0,3 m/s (dưới tốc độ người đi bộ nhỏ nhất 0,5 m/s của kịch bản), ≥ 4σ, ≥ 15 mẫu, đạt liên tục 0,1 s; thôi báo sau
  0,3 s đứng yên. Báo track chuyển động gần nhất phía trước.
- **v6:** với người đi bộ, `AebStack` thật nhận ước lượng radar (`stepMeasured`), ground truth chạy bóng; `result.json` ghi `case.carla.perception_source` và
  `perception_radar` (`status = PRIMARY`). Thiếu radar là lỗi bridge, không chạy "mù". File ≤ v5 giữ nguyên hành vi và `result.json` (`perception_shadow`).
  Xe phía trước (ADR-050) vẫn dùng ground truth: bộ bám chặn vật tĩnh nên không thấy xe đứng yên (CCRs).
- Trạng thái của chính ego (`egoV`, độ lệch ngang `egoY` để quy về khung giao cắt) vẫn lấy từ CARLA — tương ứng odometry/định vị của xe thật, không phải
  perception mục tiêu. Khi không phát hiện, khoảng cách ground truth không đi vào quyết định (`AebStack.decide` chỉ dùng khoảng cách khi `detected`).

### Bằng chứng

Hằng số chọn trên dữ liệu thô 6 ca và một hàng rào tổng hợp khắc nghiệt (lệch Doppler chung ±0,35 m/s, 40 điểm/tick); cấu hình 3σ/10 mẫu báo nhầm hàng rào ở
6/20 seed, cấu hình chọn 0/100. Phát lại 6 ca: không track bám nhầm, tối đa 1 track. CARLA 0.9.16 thật, Town04, e-tron, seed 48846, v6 xuất lại từ
`data/radar-cases-20261022/c*.json` (`data/radar-v6-20261113/`), so với cùng ca ở v5 (`data/radar-mtt-20261113/shadow-*`):

| Ca | v6 (radar): kết thúc / quyết định / chỉ số | v5 (ground truth) | Ghi chú |
|---|---|---|---|
| c1 40 km/h, 25 m | dừng / 2,25 s / quãng dừng 11,413 m | dừng / 2,25 / 11,421 | trùng (trong dao động chạy lặp) |
| c2 60 km/h, 15 m | va chạm 16,627 m/s / 2,35 s | va chạm 16,625 / không quyết định | radar quyết định nhưng quá muộn để giảm va chạm |
| c3 50 km/h, 25 m, dừng ở lề | qua / 2,10 s / khoảng cách nhỏ nhất 0,99 m | qua / 2,10 / 0,99 | trùng |
| c4 30 km/h, 35 m | dừng / 4,25 s / 5,692 m | dừng / 4,25 / 5,690 | trùng |
| c5 50 km/h, 20 m, mưa đêm | va chạm 11,577 m/s / 2,05 s | va chạm 12,252 / 2,20 | radar sớm hơn: perception tổng hợp giảm theo thời tiết, radar CARLA **không** mô phỏng mưa |
| c6 20 km/h, 50 m, an toàn | qua, không phanh, 0 khung bám nhầm | qua, không phanh | track giả 22/10 đã hết |

Đối chiếu tiêu chí đề xuất ở mục Quyết định: không track giả trên ca an toàn — **đạt**; sai số ngang trung bình 0,03–0,09 m (≤ 0,3) — **đạt**; quyết định khác
ground truth — ghi ở bảng (không ca nào muộn hơn); phát hiện ≤ 0,3 s sau khi người bắt đầu đi — **không đạt**: 0,39–0,74 s. Phần lớn là vật lý Doppler:
người đi bộ CARLA tăng tốc từ 0 (~4,4 m/s²) và ở xa đi gần vuông góc với tia, phần dư chỉ vượt ngưỡng ở 1,64–1,97 s; từ lúc mở track tới lúc báo thêm
~0,25 s để chứng minh chuyển động. Vì AEB còn chờ TTC xuống ngưỡng nên trễ này chưa làm muộn quyết định ở 6 ca, nhưng ca người xuất hiện sát xe sẽ chịu
trễ đó — nhóm cần chốt lại tiêu chí theo quyết định AEB thay vì thời điểm phát hiện.

Giới hạn: radar CARLA không chịu thời tiết; một radar, bám người đi bộ băng ngang; vật đứng yên trong làn không được báo; tập kiểm 6 ca, một xe, một seed.
Run `-xosc5` cũ giữ nguyên, không ghép với `-xosc6`; baseline CARLA cần chạy lại bằng `-xosc6` nếu muốn so.

### Tiêu chí chốt 13/11/2026 (thay tiêu chí "phát hiện ≤ 0,3 s")

Thời điểm phát hiện của radar Doppler bị chặn dưới bởi vật lý (người đứng yên/vừa bước không có phần dư Doppler), nên không dùng làm tiêu chí. Perception radar
đạt khi, trên tập ca CARLA thật đã chốt (hiện 6 ca `data/radar-cases-20261022`, xuất lại theo profile hiện hành):

1. **Không track bám nhầm** (`frames_far_from_target = 0`) trên mọi ca, đặc biệt ca an toàn; ca an toàn không phanh.
2. **Sai số ngang trung bình ≤ 0,3 m** khi đã phát hiện.
3. **Quyết định AEB theo radar không muộn hơn đường ground truth quá 0,1 s** (`aeb_decision_t` so với `ground_truth_aeb_decision_t` trong
   `perception_radar`); ca ground truth không quyết định thì radar không được tạo quyết định ở ca an toàn.
4. Thời điểm phát hiện vẫn ghi lại để phân tích, không chặn.

Đối chiếu 13/11 (bảng trên): 1–3 đạt ở 6/6 ca (radar trùng hoặc sớm hơn ground truth). Kiểm lại cả bốn mục khi đổi bộ bám, profile hoặc tập ca.

**Sau ADR-052 (13/11/2026):** từ `-xosc6` `impact_speed_mps` là vận tốc va chạm tương đối và RMS jerk lọc Euro NCAP. Bảng giai đoạn 2 ở trên ghi vận tốc
va chạm theo định nghĩa cũ (tốc độ ego); chạy lại cùng 6 ca bằng v6 hiện hành (`data/v6-final-20261113`): c2 16,915 m/s (ego 16,627), c5 11,965 m/s (ego
11,565); quyết định AEB và 0 khung bám nhầm không đổi ở cả 6 ca.
