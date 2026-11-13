# Đo độ lệch CARLA so với bộ động học sau hiệu chuẩn phanh (13/11/2026)

**Trạng thái:** kế hoạch — chưa chạy. **Nền:** `main` sau `58e11ff` (`.xosc` v5 / `-xosc5`,
[ADR-051](../../adr/ADR-051-hieu-chuan-phanh-carla-xosc5.md): e-tron 1800 N·m, phanh 100% đo được 9,13 m/s²).
**Liên quan:** [kế hoạch công thức CP_CROSSING trên CARLA](2026-11-11-cong-thuc-cp-crossing-carla.md) (TuDM) — bước 1 của kế hoạch đó
(mưa trên CARLA) trùng nhóm W dưới đây: chạy chung một lần, số liệu dùng cho cả hai; quyết định D2 (kẹp bàn đạp ở μ·g hay mưa chỉ là
hình ảnh) chốt sau khi có nhóm W.

## Vì sao

Kiểm chứng ADR-051 mới có 4 ca và độ lệch đổi cả độ lớn lẫn chiều (CCRs: CARLA dừng xa hơn 2,1 m; CCRb: CARLA va chạm nhanh hơn 1,2 km/h).
Muốn biết có lấy được công thức bù không, cần đo độ lệch **theo tốc độ, loại tình huống và mặt đường**, tách phần do CARLA (dừng tức thì
dưới ~6 m/s, lốp không giới hạn theo ma sát) khỏi phần do đặc tính xe.

**Kết quả của kế hoạch là số liệu để quyết định, không đổi AEB.** Nếu sau đó cần bù, bù bằng thông số xe áp dụng như nhau cho mọi bộ mô
phỏng (chỉnh tham số AEB hiện có hoặc ADR mới cho ngưỡng theo tốc độ) — không thêm nhánh riêng cho CARLA vào `AebStack` (ADR-042).

## Thiết lập chung (mọi ca)

| Mục | Giá trị |
|---|---|
| Xe | Audi e-tron (`vehicle.audi.etron`), 4,75 × 1,93 m, `mass` 2100, `wheels.max_brake_torque` 1800, `full_brake_decel_mps2` 9,13, `max_brake_decel_mps2` 9,5 |
| AEB | v1.0 mặc định: `TTC_THRESHOLD` 1,5 s, `BRAKE_ACTIVATION_DELAY` 0,15 s, `MAX_DECELERATION` 8,0 m/s², `BRAKE_BUILDUP_RATE` 20 m/s³ |
| Seed | 48846 cho mọi ca (nhóm R chạy lặp cùng seed) |
| Bộ động học | `BridgeMain kinematic <bundle.json>` — cùng bundle với CARLA |
| CARLA | 0.9.16, Town04 road 40 / lane −4, đồng bộ 0,01 s, `run_xosc.py <ca>.xosc --out <thư mục>` (`CARLA_ROOT` phải đặt) |
| Thời tiết | CLEAR / DAY trừ nhóm W |
| Chồng lấn | 100% trừ nhóm L |

Mỗi ca sinh **một** `bundle.json` → `BridgeMain export` ra `.xosc` → chạy cả hai bộ mô phỏng. Bộ xuất từ chối ca CCR làm xe mục tiêu ra khỏi
road 40 (228 m) trong 12 s: ghi ca đó là "không chạy được", không sửa tham số cho lọt.

## Danh sách ca

### BR — Đặc tính phanh (không AEB, `measure_brake.py`)

`measure_brake.py --mass 2100 --brake-torque 1800 --speeds 30 40 50 60 70 80 --pedals 0.5 0.7 0.85 1.0 --out data/brake-etron-1800`

| ID | Tốc độ (km/h) | Bàn đạp | Ghi chú |
|---|---|---|---|
| BR-01…06 | 30, 40, 50, 60, 70, 80 | 1,0 | Cho $a_{thực}(v)$ khi phanh hết cỡ |
| BR-07…12 | 30, 40, 50, 60, 70, 80 | 0,85 | ≈ bàn đạp khi AEB xin 8 m/s² |
| BR-13…18 | 30, 40, 50, 60, 70, 80 | 0,7 | Độ tuyến tính |
| BR-19…24 | 30, 40, 50, 60, 70, 80 | 0,5 | Độ tuyến tính |

### S — CCRs (xe trước đứng yên)

| ID | Ego (km/h) | Mục tiêu (km/h) | Khoảng cách (m) | Mục đích |
|---|---|---|---|---|
| S-01 | 20 | 0 | 50 | Vùng dưới ~22 km/h: đo mức "dừng tức thì" của CARLA |
| S-02 | 30 | 0 | 50 | Độ lệch theo tốc độ |
| S-03 | 40 | 0 | 50 | — (trùng ca kiểm chứng ADR-051 khác khoảng cách: 40 m) |
| S-04 | 50 | 0 | 50 | Ca tham chiếu (dùng lại ở W, L, R) |
| S-05 | 60 | 0 | 50 | — |
| S-06 | 70 | 0 | 50 | — |
| S-07 | 80 | 0 | 50 | Tốc độ cao nhất của lưới |

### M — CCRm (xe trước chạy chậm)

| ID | Ego (km/h) | Mục tiêu (km/h) | Khoảng cách (m) | Chênh tốc độ |
|---|---|---|---|---|
| M-01 | 30 | 20 | 50 | 10 |
| M-02 | 40 | 20 | 50 | 20 |
| M-03 | 50 | 20 | 50 | 30 |
| M-04 | 60 | 20 | 50 | 40 (dùng lại ở W) |
| M-05 | 70 | 20 | 50 | 50 |
| M-06 | 80 | 20 | 50 | 60 |

### B — CCRb (xe trước phanh từ giây thứ 1)

| ID | Ego = mục tiêu (km/h) | Khoảng cách (m) | Mục tiêu phanh (m/s²) | Ghi chú |
|---|---|---|---|---|
| B-01 | 50 | 12 | −2 | Ma trận Euro NCAP |
| B-02 | 50 | 12 | −6 | Ca kiểm chứng ADR-051 (dùng lại ở W, R) |
| B-03 | 50 | 40 | −2 | Ma trận Euro NCAP |
| B-04 | 50 | 40 | −6 | Ma trận Euro NCAP |
| B-05 | 70 | 12 | −6 | Có thể bị bộ xuất từ chối (road 40) |

### P — Người đi bộ băng ngang (CP_CROSSING)

| ID | Ego (km/h) | Người đi bộ (m/s) | Khoảng kích hoạt (m) | Dừng ở lề | Mục đích |
|---|---|---|---|---|---|
| P-01 | 20 | 1,5 | 25 | không | Vùng tốc độ thấp |
| P-02 | 30 | 1,5 | 25 | không | — |
| P-03 | 40 | 1,5 | 25 | không | Ca kiểm chứng ADR-051 (dùng lại ở W, R) |
| P-04 | 50 | 1,5 | 25 | không | — |
| P-05 | 60 | 1,5 | 25 | không | — |
| P-06 | 40 | 3,0 | 25 | không | Người chạy: mục tiêu vào đường đi muộn hơn |

### W — Mặt đường ướt (RAIN, `friction` 0,65)

| ID | Lặp lại ca | Thay đổi |
|---|---|---|
| W-01 | S-04 | `weather` RAIN, `friction` 0,65 |
| W-02 | M-04 | như trên |
| W-03 | B-02 | như trên |
| W-04 | P-03 | như trên |

Dự kiến: bộ động học kẹp giảm tốc ở 0,65 × 9,81 ≈ 6,4 m/s², CARLA không (TD-17) → nhóm có độ lệch lớn nhất. Chạy chung với bước 1 của kế
hoạch TuDM; nếu bước đó đã chạy thì dùng lại số liệu, chỉ bổ sung ca còn thiếu.

### L — Lệch làn

| ID | Ca gốc | Chồng lấn | Kỳ vọng |
|---|---|---|---|
| L-01 | S-04 | 50% | Mục tiêu chắn nửa làn: AEB vẫn phanh, đo độ lệch |
| L-02 | S-04 | −10% (làn bên) | **Không phanh** trên cả hai bộ mô phỏng (kiểm tra phanh nhầm); có phanh là lỗi, ghi riêng |

### R — Độ lặp lại (chỉ CARLA)

| ID | Ca | Số lần thêm |
|---|---|---|
| R-01, R-02 | S-04 | 2 (tổng 3) |
| R-03, R-04 | B-02 | 2 (tổng 3) |
| R-05, R-06 | P-03 | 2 (tổng 3) |

Dải dao động của 3 lần là ngưỡng nhiễu: độ lệch nhỏ hơn dải này không kết luận.

**Tổng:** 30 ca × 2 bộ mô phỏng + 6 lần lặp CARLA + 24 phép đo phanh. Ước lượng 30–40 phút CARLA (mỗi run 15–40 s).

## Dữ liệu CARLA phải trả về

### 1. Mỗi run — `result.json` (đã có)

| Đường dẫn | Trường | Dùng để |
|---|---|---|
| `simulator`, `seed`, `format` | định danh `carla-0.9.16-xosc5`, seed | Kiểm đúng profile / seed |
| `outcome.end_reason`, `outcome.duration_s` | EGO_STOPPED / COLLISION / TIMEOUT | Kết quả |
| `outcome.metrics` | `collision`, `impact_speed_mps`, `relative_impact_speed_mps` (CCR), `min_distance_m`, `min_ttc_s` | Kết quả cuối |
| `outcome.metrics` | `target_entered_path` / `pedestrian_entered_path`, `gt_in_path_t`, `first_detection_t`, `first_detection_distance_m` | Thời điểm mục tiêu thành nguy hiểm |
| `outcome.metrics` | `fcw_t`, `aeb_decision_t`, `aeb_decision_ttc_s`, `brake_onset_t`, `braking_latency_s` | Chuỗi quyết định |
| `outcome.metrics` | `max_deceleration_mps2`, `mean_deceleration_mps2`, `max_jerk_mps3`, `rms_jerk_mps3`, `stopping_distance_m` | Pha phanh |
| `outcome.metrics` | `ego_initial_speed_mps`, `ego_final_speed_mps`, `ego_distance_m`, `decel_available_mps2` | Điều kiện đầu / cuối |
| `outcome.events[]` | `t`, `kind` (detection, gt_start, fcw, aeb_decision, brake_onset, collision) | Mốc thời gian |
| `outcome.case` | toàn bộ tham số ca, `friction`, `road_friction` | Khớp ca với bundle |
| `outcome.case.carla` | `physics_check.forced_ok`, `physics_applied.wheels[].max_brake_torque`, `full_brake_decel` | **Điều kiện hợp lệ:** mô-men 1800 tới mọi bánh |
| `outcome.case.carla` | `measured_step_s` (min/max/mean), `decel_clamped_frames`, `jerk_filtered` | **Điều kiện hợp lệ:** bước 0,01 s, không kẹp |
| `outcome.case.carla.target` | `blueprint`, `length_m`, `width_m`, `initial_gap_m` (CCR) | Khoảng cách đầu đo được thật |
| `evaluation` | `outcome`, `verdict`, `failure.failure_type`, `failure.severity`, `chain` | So nhãn lỗi hai bên |

### 2. Mỗi khung — `outcome.frames[]` (đã có, 100 Hz)

`t`, `ego_x`, `ego_v`, `ego_a`, `ped_x` (CCR: vị trí đuôi xe mục tiêu), `ped_y`, `ped_vy`, `detected`, `confidence`, `perceived_y`, `ttc`,
`ttc_gt`, `fcw`, `aeb`.

### 3. Mỗi khung — `sensors/frames.csv` (đã có)

`sim_time_s`, `ego_speed_ms`, `throttle`, **`brake`** (bàn đạp thật đã áp), `imu_accel_x_ms2`, `imu_jerk_ms3`, `radar_*`,
`obstacle_distance_m`, `obstacle_actor`. `sensors/summary.json`: `max_deceleration_ms2`, `first_brake_time_s`, `first_collision_time_s`,
`impact_peak_accel_ms2`.

### 4. Còn thiếu — cần bổ sung trước khi chạy (việc riêng, nhỏ)

| Thiếu | Vì sao cần | Cách bổ sung đề xuất |
|---|---|---|
| Lệnh giảm tốc AEB mỗi khung (`decel_cmd`) | Tính tỷ số thực đạt / yêu cầu η = a_thực / a_cmd theo thời gian | Ghi `decel_cmd` và `pedal` của `CarlaSession.Tick` vào `outcome.frames` |
| Tốc độ xe mục tiêu mỗi khung (CCRm, CCRb) | Tốc độ tương đối, kiểm profile phanh của xe trước | Ghi `target_v` từ cầu nối (đã đọc vận tốc actor `lead`) |
| `ttc_gt` cho CCR | Hiện luôn `null` ở CCR; cần để so TTC thật hai bên | Tính từ khoảng cách và tốc độ tương đối thật |

Không có các trường này vẫn chạy được, nhưng η phải ước lượng từ `brake` và `ego_a`, còn `target_v` phải lấy vi phân `ped_x` (nhiễu ở 0,01 s).

### 5. `measure_brake.py` — `brake_measurement.json` (đã có)

`rows[]`: `speed_kmh`, `pedal`, `v0_mps`, `decel_mps2`, `samples`, `from_mps`, `to_mps`, `duration_s`, `stopping_distance_m`, `stopped`,
`physics_applied`; `pedal_linearity[]`; `proposed_full_brake_decel_mps2`, `spread_mps2`.

## Chỉ số tính sau khi chạy

| Chỉ số | Công thức | Ghi chú |
|---|---|---|
| $a_{dải}$ | Hồi quy tuyến tính `ego_v` theo `t` trên dải từ `brake_onset_t`, 0,95·v₀ xuống 6 m/s | Bỏ đoạn dừng tức thì; tính cho cả hai bộ mô phỏng |
| η | $a_{dải}$ / `MAX_DECELERATION` (hoặc trung bình `decel_cmd` khi có) | Tỷ lệ thực đạt / yêu cầu |
| Δd | `min_distance_m` (CARLA) − `min_distance_m` (động học) | Dương = CARLA an toàn hơn |
| Δv | `impact_speed_mps` (CARLA) − (động học), quy ra km/h | Chỉ ca có va chạm |
| Δt quyết định | `aeb_decision_t` (CARLA) − (động học) | Lệch do perception / quỹ đạo, tách khỏi lệch phanh |
| ΔTTC cần bù | $\frac{v}{2}\left(\frac{1}{a_{dải}} - \frac{1}{a_{giả\,định}}\right)$, v = tốc độ lúc bắt đầu phanh | Thời gian phải phanh sớm thêm nếu muốn bù |

## Quy tắc loại run

Loại (ghi lý do, không đưa vào bảng) khi: `physics_check.forced_ok` = false; `measured_step_s` khác 0,01; `decel_clamped_frames` > 0;
`end_reason` = TIMEOUT hoặc runner lỗi; bộ xuất từ chối ca. Ca L-02 có phanh không loại mà ghi là lỗi phanh nhầm.

## Đầu ra

1. `data/carla-vs-kinematic-2026-11/` — mỗi ca một thư mục (`bundle.json`, `.xosc`, `kin/`, `carla/`), giữ nguyên artifact.
2. `summary.csv`, mỗi ca × bộ mô phỏng một dòng: `id, nhom, simulator, ego_kmh, target_kmh, gap_m, decel_target, overlap, weather, friction,
   collision, impact_kmh, rel_impact_kmh, min_distance_m, min_ttc_s, aeb_decision_t, brake_onset_t, a_dai, max_decel, stopping_distance_m,
   failure_type, hop_le, ly_do_loai`.
3. Bảng phân tích: $a_{dải}(v)$, η(v), ΔTTC(v) theo tốc độ, tách khô / ướt; dải nhiễu từ nhóm R.

## Tiêu chí kết luận

- Độ lệch **ổn định theo tốc độ** (cùng chiều, biến thiên lớn hơn dải nhiễu R một cách có quy luật) → đủ để viết công thức ΔTTC(v).
- Độ lệch **đổi chiều giữa các loại tình huống** ở cùng tốc độ → lệch không chỉ do phanh; xem Δt quyết định trước khi bàn công thức.
- Nhóm W lệch lớn, các nhóm khô lệch nhỏ → ưu tiên D2 (mô hình ma sát ở adapter) hơn là bù trong AEB.
- Sau đó mới chọn: chỉnh tham số AEB hiện có (`TTC_THRESHOLD`, `MAX_DECELERATION`) cho thận trọng, hay ADR mới cho ngưỡng theo tốc độ.

## Việc

| Bước | Việc | Trạng thái |
|---|---|---|
| 0 | Chốt danh sách ca (tài liệu này) | Xong — chờ duyệt |
| 1 | Bổ sung `decel_cmd`, `target_v`, `ttc_gt` CCR vào `outcome.frames` (mục 4) | Chưa làm |
| 2 | Script sinh bundle + chạy lô + `summary.csv` | Chưa làm |
| 3 | Chạy BR, rồi S / M / B / P / L, rồi W (chung với TuDM bước 1), rồi R | Chưa làm (cần máy CARLA) |
| 4 | Phân tích, cập nhật TD-17 và đề xuất | Chưa làm |
