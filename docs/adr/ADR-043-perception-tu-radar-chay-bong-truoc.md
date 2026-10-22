# ADR-043 — Perception AEB trên CARLA lấy từ radar, chạy bóng trước khi thay ground truth

**Trạng thái:** Proposed 22/10/2026 (TrungDQ, phần 2 "Chạy baseline"; kế hoạch 20/10 việc 1, quyết định D1/D2).
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
  `perception_source = radar`, profile lên **`-xosc4`** (`RunService.XOSC_SUFFIX`, `Xosc.SIMULATOR_SUFFIX`, `CarlaRunnerPanel`, `CarlaWebTest`).
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
