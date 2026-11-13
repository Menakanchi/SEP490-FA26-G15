# ADR-052 — Chốt định nghĩa chỉ số và chế độ AEB tắt (13/11/2026)

**Trạng thái:** ✅ Accepted 13/11/2026 (TrungDQ chốt, Technical Leader).
**Bổ sung cho:** [ADR-040](ADR-040-rut-scope-4-tham-so-aeb-7-category.md) (ba mục tiêu MOBO), [ADR-043](ADR-043-perception-tu-radar-chay-bong-truoc.md) (radar,
`.xosc` v6), [ADR-044](ADR-044-nguong-phanh-oan-regression-5-diem.md) (ngưỡng phanh oan), kế hoạch
[20/10](../vehicsim/ke-hoach-sua-theo-pdf-va-quyet-dinh-2026-10-20.md) mục 5.3–5.4.

## Bối cảnh

Kế hoạch 20/10 mục 5.3–5.4 để mở bốn điểm cho thành viên 3/5 chốt: định nghĩa vận tốc va chạm, bộ lọc gia tốc, baseline có đo AEB tắt không, và ngưỡng phanh
oan dùng chung. Ngày 13/11/2026 Technical Leader chốt cả bốn để phần tối ưu (MOBO) và regression dùng cùng một định nghĩa.

## Quyết định

1. **Vận tốc va chạm = vận tốc tương đối.** `impact_speed_mps` (mục tiêu 2) là độ lớn hiệu hai vector vận tốc ego và mục tiêu lúc tiếp xúc (ISO 22733-1):
   người đi bộ băng ngang `hypot(v_ego, v_ped)` (CARLA: vector thật trong khung giao cắt), xe phía trước `max(0, v_ego − v_target)`. Tốc độ ego lúc va chạm
   giữ ở `ego_impact_speed_mps`. Đổi định danh: bộ động học **`vehicsim-kinematic-1.1`** (1.0 = tốc độ ego), CARLA `.xosc` **v6**. Telemetry
   (`frames.csv`/`collisions.json`) dùng `relative_speed_before_ms` của `sensor_recorder.py`.
2. **Bộ lọc gia tốc theo Euro NCAP AEB/LSS VRU v4.5.1** mục 4.4.1.2: "12-pole phaseless Butterworth, 10 Hz" — hiểu theo SAE J211: Butterworth bậc 6 chạy xuôi
   rồi ngược (pha 0), cutoff thiết kế 10 Hz mỗi lượt (đáp ứng tổng −6 dB ở 10 Hz), đệm biên phản xạ lẻ. `rms_jerk_mps3` (mục tiêu 1) trên CARLA v6 = RMS jerk
   của gia tốc đã lọc, cửa sổ từ **T_AEB** (mục 2: lần cuối gia tốc đã lọc xuống dưới −1 m/s², lùi về lúc vượt −0,3 m/s²) tới hết run; số chưa lọc ở
   `rms_jerk_raw_mps3`, mốc ở `t_aeb_s`. Bộ động học chạy bước 0,05 s (Nyquist 10 Hz) nên **không** lọc được 10 Hz — giữ RMS jerk chưa lọc từ lúc phanh
   tác dụng; hai bộ mô phỏng không bao giờ được so với nhau (bất biến 9).
3. **Baseline đo cả AEB bật lẫn AEB tắt.** `simulation_runs.aeb_mode` (`ON` | `OFF`, migration 015). Run OFF: perception và quyết định AEB vẫn chạy để ghi
   "AEB lẽ ra làm gì" (`fcw_t`, `aeb_decision_t`) nhưng không phanh; chỉ số pha phanh để trống (`AebMode.markOff`), `case.aeb_mode = OFF`. Run OFF là mốc
   tham chiếu (va chạm/vận tốc va chạm khi không có AEB, ca an toàn), **không bao giờ** là baseline của regression, tối ưu, dataset phân tích hay tiến trình
   project. Web: `POST /families/{id}/run` có `with_aeb_off`; ô chọn ở `/scenarios` mặc định bật. Bundle/`.xosc` chỉ mang khoá khi OFF nên run ON không đổi.
4. **Một ngưỡng phanh oan:** `RegressionCriteria.DEFAULT_FALSE_ACTIVATION_MAX_PTS` = 5 điểm %, cùng phép so `tăng ≤ ngưỡng + 1e-9` cho regression và ràng buộc
   tối ưu (ADR-044 Accepted).

## Hệ quả

- Run cũ giữ nguyên số đã lưu. Backend không chạy lại run PENDING mang định danh cũ (`vehicsim-kinematic-1.0`, `-xosc1`…`-xosc5`) và không ghép chúng với
  định danh mới: **mọi baseline (động học lẫn CARLA) phải chạy lại** nếu muốn regression/tối ưu với dữ liệu mới. DB đã có phải chạy migration 015.
- Parity với lõi Python cũ: chế độ `relativeImpact = false` của `Simulator`/`LeadVehicleSimulator` tái lập đúng fixture; test
  `KinematicParityTest#currentDefinitionOnlyChangesTheImpactSpeedKeys` chứng minh 1.1 chỉ khác 1.0 ở hai khoá vận tốc va chạm.
- `.xosc` v6 cũng gói thay đổi thời tiết và `decel_available` 11/11 (exec plan 11/11, điểm D1) vào định danh mới.
- Kiểm chứng: `EuroNcapFilterTest`, `AebModeTest`, `KinematicParityTest`, `CarlaWebTest#queuedLegacyKinematicRunFailsInsteadOfRunningUnderTheNewDefinition`;
  số đo CARLA thật ở exec plan thành viên 2 mục 1c/3b.
