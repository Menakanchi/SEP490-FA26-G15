# ADR-040 — Rút scope: 4 tham số AEB, 3 mục tiêu MOBO, 7 category kịch bản

**Trạng thái:** Proposed 15/10/2026 (TrungDQ, nhánh `trungdam`; nguồn: tab DATABASE của Google Doc "dtb" do PhuongNA sửa 15/10 và
tài liệu "Tham số kịch bản và Category" của TuDM; code + kiểm chứng ở
[exec plan 15/10](../exec-plans/completed/2026-10-15-rut-scope-4-tham-so-aeb.md))
**Phạm vi:** thay một phần ADR-036 (schema 29 bảng) về tham số AEB, mục tiêu tối ưu và cột kịch bản. Số bảng giữ nguyên (29),
5 role (ADR-035), hợp đồng bundle `vehicsim.variant/v1` và luật regression không đổi.

## Bối cảnh

Nhóm chuẩn hoá scope luận văn: chỉ tối ưu **4 tham số AEB** có cơ sở từ paper, với **3 mục tiêu** (độ êm — RMS jerk, giảm thiểu va
chạm — vận tốc va chạm, quãng phanh dừng) bằng **MOBO** (Multi-Objective Bayesian Optimization); kịch bản chia **7 category**
theo Euro NCAP (CCRs, CCRm, CCRb, băng qua, cùng chiều, rẽ cắt, cắt làn). Schema cũ có 10 tham số, mục tiêu "va chạm ↔ phanh oan
↔ độ êm", và chỉ biểu diễn được kịch bản người đi bộ băng qua đường.

## Quyết định

1. **AEB còn 4 tham số chỉnh được:** `TTC_THRESHOLD`, `BRAKE_ACTIVATION_DELAY`, `MAX_DECELERATION`, `BRAKE_BUILDUP_RATE`
   (`aeb_parameters` còn 4 dòng, bỏ nhóm `PERCEPTION`). Sáu tham số còn lại — ngưỡng phát hiện 0,70, vận tốc tương đối 2,0 m/s,
   tầm dự đoán 2,0 s, biên an toàn 2,0 m, giới hạn jerk 20 m/s³, phản hồi actuator 0,10 s — thành **hằng số của lõi AEB**
   (`worker/vehicsim_core/aeb_stack.py`), đúng giá trị mặc định cũ nên mọi run từng dùng mặc định tái lập y hệt. Bundle chỉ mang 4
   mã; bundle cũ có 10 mã vẫn đọc được (6 mã đã rút bị bỏ qua).
2. **Lỗi Perception không có tham số nào để chỉnh:** khi nguyên nhân là hằng số cố định, `parameter_code` của khâu đó là `null` và
   `root_causes.aeb_parameter_id` là `NULL` (cause_code giữ nguyên).
3. **3 mục tiêu MOBO:** `optimization_trials.rms_jerk_mps3 / impact_speed_mps / stopping_distance_m`; `algorithm` = `MOBO | NSGA_II |
   RANDOM_SEARCH`; hàm thu nhận EHVI / qEHVI / MESMO / USEMO / PAREGO. `simulation_runs.rms_jerk_mps3` thêm vào (worker ghi từ migration 008).
   Phanh oan vẫn đo ở `is_false_positive` nhưng không còn là trục tối ưu.
4. **7 category:** `scenarios.category`; `scenario_versions` thêm `target_type`, `target_speed_kmh` (km/h), `initial_distance_m`,
   `lateral_overlap_pct`, `target_decel_mps2`, `max_duration_s`, bỏ `pedestrian_speed_mps`. **IR vẫn tính người đi bộ bằng m/s** (hợp
   đồng với worker, không đổi 1.380 run); cột `target_speed_kmh` = m/s × 3,6 để lọc.
5. **Vá chỗ hở mà bản chuẩn để lại:** `ck_sv_ranges` / `ck_sv_decel` chặn giá trị vô nghĩa ở DB; luật theo category (CCRB bắt buộc gia
   tốc phanh + khoảng cách, CP_CROSSING bắt buộc cự ly kích hoạt, `target_type` khớp category…) kiểm ở `ScenarioRules` (Java) vì category
   nằm ở bảng `scenarios`, không ép được bằng CHECK trên `scenario_versions` mà không thêm cột ngoài bản chuẩn.

6. **`BRAKE_BUILDUP_RATE` biên [5, 20] m/s³, mặc định 20 (migration 008).** Lõi chặn tốc độ tăng lực phanh ở `JERK_LIMIT` cố định = 20 nên
   biên [10, 100] cũ chỉ có tác dụng ở 11 % khoảng (đo: cùng kết quả với 20–100; tương quan hạng với mọi mục tiêu ≈ 0). Biên mới phủ đúng vùng
   có tác dụng; giá trị đang lưu 50 → 20 cho kết quả y hệt, không run nào đổi.
7. **Định nghĩa ba mục tiêu** (cũng ghi ở comment cột và `docs/vehicsim/database-schema.md` §3.6):
   - *RMS jerk* (`rms_jerk_mps3`, mỗi run): căn trung bình bình phương `Δa/dt` trong **pha phanh** (từ khung phanh bắt đầu tác dụng tới hết run);
     `NULL` nếu không phanh. Gộp theo họ: trung bình các run có phanh.
   - *Vận tốc va chạm* (`impact_speed_mps`, giữ nguyên): `NULL` nếu không va chạm. Gộp theo họ: trung bình trên **mọi** run, không va chạm = 0.
   - *Quãng phanh dừng* (`stopping_distance_m`): quãng từ lúc phanh tác dụng tới lúc dừng; run kết thúc khi xe còn chạy (va chạm, người đi bộ đã
     qua) thì cộng `v²/(2·decel_available)`. **Có cả ca va chạm** — định nghĩa cũ chỉ có khi không va chạm nên cấu hình hay va chạm lại "đẹp" nhất
     (TTC 0,5 s: 26/96 va chạm nhưng quãng phanh nhỏ nhất, tính trên 10 run). Gộp theo họ: trung bình các run có phanh.
   - *Ràng buộc mặc định* (`optimization_runs.objective_config_json`): số va chạm không vượt baseline và phanh oan tăng ≤ 5 điểm %; trial vi phạm
     ghi `constraint_violated = TRUE` và bị loại khỏi mặt Pareto. Phanh oan không phải mục tiêu nhưng là ràng buộc (cùng cổng regression).
   Công thức tính trong `worker/vehicsim_core/simulator.py::brake_phase_metrics`; migration 008 tính lại hai cột cho 1.380 run cũ từ
   `telemetry_json` bằng SQL (đã đối chiếu với hàm Python: trùng cả 1.380 run).

## Hệ quả

- Migration 007 chuyển DB đang chạy: họ cũ thành `CP_CROSSING`, `target_type = PEDESTRIAN`, `max_duration_s = 12` (đúng hằng số bộ
  động học đã dùng), 226 root cause trỏ `PREDICTION_HORIZON` thành `aeb_parameter_id NULL`. Giá trị khác mặc định của 6 tham số đã bỏ ghi vào
  `aeb_versions.notes`.
- **Mất khả năng tái lập:** v1.3 đặt tầm dự đoán 1,5 s và biên an toàn 0,5 m. Nay là hằng số 2,0 / 2,0, nên 60 trong 192 run của v1.3
  chạy lại từ JSON ra kết quả khác (số đã lưu không đổi). Luật 9 của AGENTS.md không còn đúng với các run đó (TD-40). v5, v6, V9292 (chưa có run)
  mất ngưỡng phát hiện 0,8 / 0,9. Không đổi tên `KINEMATIC_SIMULATOR` vì kết quả mọi run dùng mặc định không đổi.
- Kết quả thử trên họ thật (400 cấu hình ngẫu nhiên × 96 biến thể, bộ động học): với định nghĩa trên, 8 cấu hình thỏa ràng buộc và mặt Pareto khả thi
  có 7 điểm (định nghĩa cũ: 127 / 400). Ứng viên tốt nhất giảm va chạm 12 → 8 trên họ tối ưu và 106 → 90 trên 10 họ còn lại, không va chạm mới.
  Đánh đổi thật là độ êm ↔ quãng phanh (tương quan hạng −0,67), không còn là độ êm ↔ vận tốc va chạm.
- Bản gốc của họ kịch bản mang giá trị giữ chỗ 50 km/h / CLEAR / DAY vì bản chuẩn đặt các cột đó NOT NULL (TD-43).
- Chỉ category `CP_CROSSING` có bộ mô phỏng; 6 category còn lại cần simulator và bộ sinh `.xosc` riêng (TD-42). Nghĩa của
  `lateral_overlap_pct` còn mở (TD-41).
