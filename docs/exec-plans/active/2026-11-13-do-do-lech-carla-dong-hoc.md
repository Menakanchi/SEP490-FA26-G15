# Đo độ lệch CARLA so với bộ động học — ca người đi bộ băng ngang (13/11/2026)

**Trạng thái:** kế hoạch — chưa chạy. **Phạm vi:** chỉ `CP_CROSSING` (người đi bộ băng ngang); CCRs / CCRm / CCRb để sau.
**Nền:** `main` sau `58e11ff` (`.xosc` v5 / `-xosc5`, [ADR-051](../../adr/ADR-051-hieu-chuan-phanh-carla-xosc5.md): e-tron 1800 N·m,
phanh 100% đo được 9,13 m/s²). **Liên quan:** [kế hoạch công thức CP_CROSSING trên CARLA](2026-11-11-cong-thuc-cp-crossing-carla.md)
(TuDM) — bước 1 của kế hoạch đó (mưa trên CARLA) trùng nhóm W dưới đây: chạy chung một lần, số liệu dùng cho cả hai; quyết định D2 (kẹp bàn
đạp ở μ·g hay mưa chỉ là hình ảnh) chốt sau khi có nhóm W.

**Bổ trợ không AEB:** [carla-ped-bench](../../vehicsim/carla-ped-bench/README.md) — công cụ chạy ngoài (repo riêng [phutro](https://github.com/Menakanchi/phutro)) đo độ lệch của chính CARLA
(phanh, người đi bộ) so với mô hình lý tưởng bằng lệnh phanh cố định; dữ liệu đưa về [ket-qua/](../../vehicsim/carla-ped-bench/ket-qua/).

## Vì sao

Mục tiêu là tối ưu AEB cho người đi bộ. Trước khi chỉnh tham số, cần biết kết quả CARLA lệch bộ động học bao nhiêu và vì sao, để không chỉnh
AEB theo một sai lệch của bộ mô phỏng. Kiểm chứng ADR-051 mới có một ca người đi bộ (40 km/h, 1,5 m/s, kích hoạt 25 m): CARLA dừng cách
6,4 m, bộ động học 3,7 m. Với người đi bộ, độ lệch đến từ bốn nguồn chồng lên nhau, cần tách riêng:

| Nguồn lệch | Biểu hiện | Nhóm ca đo |
|---|---|---|
| Phanh (TD-17) | Mức phanh đổi theo tốc độ; dưới ~6 m/s CARLA dừng gần như tức thì | BR, V |
| Người đi bộ tăng tốc dần trên CARLA | Ca ADR-051: người bắt đầu đi lúc 1,55 s, tới 2,16 s mới đạt 1,4 m/s → vào đường đi muộn hơn bộ động học | S, T |
| Dừng ở lề (TD-47, sửa ở xosc4) | Waypoint cuối trừ quãng trượt v × 0,07 s; người có thể nhô vào hành lang | C |
| Ma sát mặt đường | Bộ động học kẹp ở μ·g, CARLA không giới hạn theo ma sát | W |

**Kết quả của kế hoạch là số liệu để quyết định, không đổi AEB.** Bù (nếu cần) bằng tham số AEB áp dụng như nhau cho mọi bộ mô phỏng — không
thêm nhánh riêng cho CARLA vào `AebStack` (ADR-042).

## Thiết lập chung (mọi ca)

| Mục | Giá trị |
|---|---|
| Xe | Audi e-tron (`vehicle.audi.etron`), 4,75 × 1,93 m, `mass` 2100, `wheels.max_brake_torque` 1800, `full_brake_decel_mps2` 9,13, `max_brake_decel_mps2` 9,5 |
| AEB | v1.0 mặc định: `TTC_THRESHOLD` 1,5 s, `BRAKE_ACTIVATION_DELAY` 0,15 s, `MAX_DECELERATION` 8,0 m/s², `BRAKE_BUILDUP_RATE` 20 m/s³ |
| Seed | 48846 cho mọi ca (nhóm R chạy lặp cùng seed) |
| Bộ động học | `BridgeMain kinematic <bundle.json>` — cùng bundle với CARLA |
| CARLA | 0.9.16, Town04 road 40 / lane −4, đồng bộ 0,01 s, `run_xosc.py <ca>.xosc --out <thư mục>` (`CARLA_ROOT` phải đặt) |
| Mặc định ca | `pedestrian_speed_mps` 1,5, `trigger_distance_m` 25, `stops_at_curb` false, CLEAR / DAY, `friction` 1,0 |

`trigger_distance_m` là khoảng cách từ mũi xe tới vạch băng qua khi người bắt đầu đi; người xuất phát trên vỉa hè (y = −3,6 m, cách mép
làn ego 1,85 m). Mỗi ca sinh **một** `bundle.json` → `BridgeMain export` ra `.xosc` → chạy cả hai bộ mô phỏng. Miền hợp lệ (`IR_BOUNDS`):
ego 10–130 km/h, kích hoạt 5–80 m, người đi bộ 0,5–8 m/s.

## Danh sách ca

### BR — Đặc tính phanh (không AEB, `measure_brake.py`)

`measure_brake.py --mass 2100 --brake-torque 1800 --speeds 20 30 40 50 60 --pedals 0.5 0.7 0.85 1.0 --out data/brake-etron-1800`

| ID | Tốc độ (km/h) | Bàn đạp | Ghi chú |
|---|---|---|---|
| BR-01…05 | 20, 30, 40, 50, 60 | 1,0 | $a_{thực}(v)$ khi phanh hết cỡ (dải tốc độ AEB người đi bộ) |
| BR-06…10 | 20, 30, 40, 50, 60 | 0,85 | ≈ bàn đạp khi AEB xin 8 m/s² |
| BR-11…15 | 20, 30, 40, 50, 60 | 0,7 | Độ tuyến tính |
| BR-16…20 | 20, 30, 40, 50, 60 | 0,5 | Độ tuyến tính |

20 km/h có dải đo ngắn (dưới 0,5 s thì công cụ loại khỏi số đề xuất) — vẫn ghi để thấy vùng dừng tức thì.

### V — Theo tốc độ xe (người 1,5 m/s, kích hoạt 25 m)

| ID | Ego (km/h) | Mục đích |
|---|---|---|
| V-01 | 20 | Vùng dưới ~22 km/h: đo mức "dừng tức thì" của CARLA |
| V-02 | 30 | Độ lệch theo tốc độ |
| V-03 | 40 | **Ca tham chiếu** — trùng ca kiểm chứng ADR-051 (dùng lại ở W, N, R) |
| V-04 | 50 | — |
| V-05 | 60 | Biên trên dải Euro NCAP người đi bộ (dùng lại ở W, R) |
| V-06 | 70 | Ngoài dải: kiểm xu hướng |

### S — Theo tốc độ người đi bộ (ego 40 km/h, kích hoạt 25 m)

| ID | Người đi bộ (m/s) | Tương ứng |
|---|---|---|
| S-01 | 1,0 | Người già / đi chậm |
| S-02 | 2,2 | Đi nhanh (≈ 8 km/h, tốc độ người lớn phía xa của Euro NCAP) |
| S-03 | 3,0 | Chạy |
| S-04 | 5,0 | Chạy nhanh — đo rõ ảnh hưởng tăng tốc dần của người đi bộ CARLA |

(1,5 m/s là V-03.)

### T — Theo khoảng kích hoạt (ego 40 km/h, người 1,5 m/s)

| ID | Kích hoạt (m) | Kỳ vọng |
|---|---|---|
| T-01 | 15 | Người kích hoạt muộn: xe có thể qua trước khi người vào hành lang → ca **an toàn**, kiểm tra phanh nhầm |
| T-02 | 20 | Sát ranh giới va chạm / an toàn |
| T-03 | 30 | Người vào đường đi sớm hơn |
| T-04 | 40 | — |
| T-05 | 60 | Người đã ở giữa làn khi xe tới gần |

(25 m là V-03.) Ghi ca nào hai bộ mô phỏng cho **kết quả khác loại** (một bên va chạm, một bên an toàn) — đó là ca nguy hiểm nhất khi tối ưu.

### C — Dừng ở lề (`stops_at_curb` = true, kích hoạt 25 m) — ca an toàn

| ID | Ego (km/h) | Kỳ vọng |
|---|---|---|
| C-01 | 30 | Người đứng lại ở lề: **không** phanh mạnh; có phanh là phanh nhầm (FALSE_BRAKING) |
| C-02 | 40 | — (dùng lại ở R) |
| C-03 | 50 | — |
| C-04 | 60 | — |

Đây là tập giữ cho tối ưu (bất biến: tập tối ưu / regression phải giữ ca an toàn để kiểm phanh oan).

### W — Mặt đường ướt (người 1,5 m/s, kích hoạt 25 m)

| ID | Ego (km/h) | Thời tiết | `friction` |
|---|---|---|---|
| W-01 | 40 | RAIN | 0,65 |
| W-02 | 60 | RAIN | 0,65 |
| W-03 | 40 | HEAVY_RAIN | 0,55 |

Dự kiến bộ động học kẹp giảm tốc ở 6,4 / 5,4 m/s², CARLA không → nhóm lệch lớn nhất. Chạy chung với bước 1 kế hoạch TuDM.

### N — Ban đêm

| ID | Ca | Kỳ vọng |
|---|---|---|
| N-01 | V-03 với NIGHT | Perception CARLA lấy ground truth (TD-01) nên kết quả phải trùng V-03; khác là dấu hiệu lỗi dựng cảnh |

### R — Độ lặp lại (chỉ CARLA)

| ID | Ca | Số lần thêm |
|---|---|---|
| R-01, R-02 | V-03 | 2 (tổng 3) |
| R-03, R-04 | V-05 | 2 (tổng 3) |
| R-05, R-06 | C-02 | 2 (tổng 3) |

Dải dao động của 3 lần là ngưỡng nhiễu: độ lệch nhỏ hơn dải này không kết luận.

**Tổng:** 23 ca × 2 bộ mô phỏng + 6 lần lặp CARLA + 20 phép đo phanh. Ước lượng 25–35 phút CARLA (mỗi run 15–40 s).

## Dữ liệu CARLA phải trả về

### 1. Mỗi run — `result.json` (đã có)

| Đường dẫn | Trường | Dùng để |
|---|---|---|
| `simulator`, `seed`, `format` | `carla-0.9.16-xosc5`, seed | Kiểm đúng profile / seed |
| `outcome.end_reason`, `outcome.duration_s` | EGO_STOPPED / COLLISION / TIMEOUT | Kết quả |
| `outcome.metrics` | `collision`, `impact_speed_mps`, `min_distance_m`, `min_ttc_s` | Kết quả cuối |
| `outcome.metrics` | `pedestrian_entered_path`, `gt_in_path_t`, `first_detection_t`, `first_detection_distance_m` | Lúc người thành nguy hiểm — so với bộ động học để đo ảnh hưởng tăng tốc dần |
| `outcome.metrics` | `fcw_t`, `aeb_decision_t`, `aeb_decision_ttc_s`, `brake_onset_t`, `braking_latency_s` | Chuỗi quyết định |
| `outcome.metrics` | `max_deceleration_mps2`, `mean_deceleration_mps2`, `max_jerk_mps3`, `rms_jerk_mps3`, `stopping_distance_m` | Pha phanh (RMS jerk là một mục tiêu tối ưu) |
| `outcome.metrics` | `ego_initial_speed_mps`, `ego_final_speed_mps`, `ego_distance_m`, `decel_available_mps2` | Điều kiện đầu / cuối |
| `outcome.events[]` | `t`, `kind` (detection, gt_start, fcw, aeb_decision, brake_onset, stopped / collision) | Mốc thời gian |
| `outcome.crossing_x`, `outcome.case` | vạch băng qua; tham số ca, `friction`, `road_friction` | Khớp ca với bundle |
| `outcome.case.carla` | `physics_check.forced_ok`, `physics_applied.wheels[].max_brake_torque`, `full_brake_decel` | **Điều kiện hợp lệ:** mô-men 1800 tới mọi bánh |
| `outcome.case.carla` | `measured_step_s`, `decel_clamped_frames`, `jerk_filtered` | **Điều kiện hợp lệ:** bước 0,01 s, không kẹp |
| `outcome.case.carla.perception_shadow` | `first_detection_t`, `aeb_decision_t` so với `ground_truth_*`, `frames_detected_in_view`, `mean_abs_err_forward_m`, `max_abs_err_forward_m` | Radar chạy bóng (ADR-043): chỉ quan sát, không điều khiển AEB |
| `evaluation` | `outcome`, `verdict`, `failure.failure_type`, `failure.severity`, `chain[]` (nguyên nhân, kể cả `SIDE_ENTRY_NOT_PREDICTED` của TD-18) | So nhãn lỗi hai bên |

### 2. Mỗi khung — `outcome.frames[]` (đã có, 100 Hz)

`t`, `ego_x`, `ego_v`, `ego_a`, **`ped_x`, `ped_y`, `ped_vy`** (vị trí / tốc độ người đi bộ thật), `detected`, `confidence`, `perceived_y`,
`ttc`, `ttc_gt` (chỉ có giá trị khi người đã trong đường đi — ca ADR-051: 3/345 khung), `fcw`, `aeb`.

### 3. Mỗi khung — `sensors/frames.csv` (đã có)

`sim_time_s`, `ego_speed_ms`, `throttle`, **`brake`** (bàn đạp thật đã áp), `imu_accel_x_ms2`, `imu_jerk_ms3`, `radar_*`,
`obstacle_distance_m`, `obstacle_actor`. `sensors/summary.json`: `max_deceleration_ms2`, `first_brake_time_s`, `first_collision_time_s`,
`impact_peak_accel_ms2`.

### 4. Còn thiếu — cần bổ sung trước khi chạy (việc riêng, nhỏ)

| Thiếu | Vì sao cần | Cách bổ sung đề xuất |
|---|---|---|
| Lệnh giảm tốc AEB mỗi khung (`decel_cmd`) | Tỷ số thực đạt / yêu cầu η = a_thực / a_cmd theo thời gian | Ghi `decel_cmd` và `pedal` của `CarlaSession.Tick` vào `outcome.frames` |
| TTC theo dự đoán quỹ đạo người đi bộ trước khi vào đường đi | `ttc_gt` hiện chỉ có khi người đã trong đường đi; cần biết TTC thật lúc AEB quyết định | Ghi thời điểm dự kiến người vào hành lang và TTC tương ứng mỗi khung |

Không có hai trường này vẫn chạy được: η ước lượng từ `brake` và `ego_a`; thời điểm người vào đường đi lấy từ `gt_in_path_t` và `ped_y`.

### 5. `measure_brake.py` — `brake_measurement.json` (đã có)

`rows[]`: `speed_kmh`, `pedal`, `v0_mps`, `decel_mps2`, `samples`, `from_mps`, `to_mps`, `duration_s`, `stopping_distance_m`, `stopped`,
`physics_applied`; `pedal_linearity[]`; `proposed_full_brake_decel_mps2`, `spread_mps2`.

## Chỉ số tính sau khi chạy

| Chỉ số | Công thức | Ghi chú |
|---|---|---|
| $a_{dải}$ | Hồi quy tuyến tính `ego_v` theo `t` trên dải từ `brake_onset_t`, 0,95·v₀ xuống 6 m/s | Bỏ đoạn dừng tức thì; tính cho cả hai bộ mô phỏng |
| η | $a_{dải}$ / `MAX_DECELERATION` (hoặc trung bình `decel_cmd` khi có) | Tỷ lệ thực đạt / yêu cầu |
| Δ vào đường đi | `gt_in_path_t` (CARLA) − (động học) | Lệch do người đi bộ tăng tốc dần, tách khỏi lệch phanh |
| Δt quyết định | `aeb_decision_t` (CARLA) − (động học) | Lệch do perception / quỹ đạo |
| Δd | `min_distance_m` (CARLA) − (động học) | Dương = CARLA an toàn hơn |
| Δv | `impact_speed_mps` (CARLA) − (động học), quy ra km/h | Chỉ ca có va chạm |
| ΔTTC cần bù | $\frac{v}{2}\left(\frac{1}{a_{dải}} - \frac{1}{a_{giả\,định}}\right)$, v = tốc độ lúc bắt đầu phanh | Thời gian phải phanh sớm thêm nếu muốn bù phần lệch phanh |
| Khác loại kết quả | Một bên COLLISION, bên kia SAFE / NEAR_MISS (hoặc phanh nhầm ở C, T-01) | Ca phải xem riêng trước khi tối ưu |

## Quy tắc loại run

Loại (ghi lý do, không đưa vào bảng) khi: `physics_check.forced_ok` = false; `measured_step_s` khác 0,01; `decel_clamped_frames` > 0;
`end_reason` = TIMEOUT hoặc runner lỗi. Ca C hoặc T-01 có phanh không loại mà ghi là phanh nhầm.

## Đầu ra

1. `data/carla-vs-kinematic-ped-2026-11/` — mỗi ca một thư mục (`bundle.json`, `.xosc`, `kin/`, `carla/`), giữ nguyên artifact.
2. `summary.csv`, mỗi ca × bộ mô phỏng một dòng: `id, nhom, simulator, ego_kmh, ped_mps, trigger_m, stops_at_curb, weather, friction,
   collision, impact_kmh, min_distance_m, min_ttc_s, gt_in_path_t, aeb_decision_t, brake_onset_t, a_dai, max_decel, rms_jerk,
   stopping_distance_m, failure_type, hop_le, ly_do_loai`.
3. Bảng phân tích: $a_{dải}(v)$, η(v), ΔTTC(v) theo tốc độ; Δ vào đường đi theo tốc độ người đi bộ; tách khô / ướt; dải nhiễu từ nhóm R.

## Dùng kết quả để tối ưu AEB cho người đi bộ

- Chỉ 4 tham số theo ADR-040; ba mục tiêu: RMS jerk, vận tốc va chạm, quãng dừng; ràng buộc phanh oan dùng nhóm C và T-01.
- Lệch do **phanh** ổn định theo tốc độ → cân nhắc `TTC_THRESHOLD` lớn hơn hoặc `MAX_DECELERATION` thận trọng hơn, áp như nhau cho cả hai bộ
  mô phỏng; ngưỡng theo tốc độ cần ADR mới (đổi lõi AEB).
- Lệch do **người đi bộ tăng tốc dần** hay **dừng ở lề** là lệch của bộ mô phỏng, không bù trong AEB — ghi vào TD-17 / TD-18 / TD-47 và
  xem lại mô hình người đi bộ ở adapter.
- Lệch do **ma sát** → quyết định D2 của kế hoạch TuDM (mô hình ma sát ở adapter), không bù trong AEB.
- Candidate tối ưu xong vẫn phải qua regression cùng xe, cùng biến thể, cùng seed, cùng phiên bản simulator; không ghép động học với CARLA.

## Tiêu chí kết luận

- Độ lệch **ổn định theo tốc độ** (cùng chiều, biến thiên lớn hơn dải nhiễu R một cách có quy luật) → đủ để viết công thức ΔTTC(v).
- Δ vào đường đi lớn và tăng theo tốc độ người đi bộ → phần lớn lệch là do mô hình người đi bộ, không phải phanh.
- Nhóm W lệch lớn, các nhóm khô lệch nhỏ → ưu tiên D2 hơn là bù trong AEB.
- Có ca khác loại kết quả ở nhóm T hoặc C → không tối ưu theo CARLA cho các ca đó cho tới khi hiểu nguyên nhân.

## Việc

| Bước | Việc | Trạng thái |
|---|---|---|
| 0 | Chốt danh sách ca (tài liệu này) | Xong — chờ duyệt |
| 1 | Bổ sung `decel_cmd` và TTC dự đoán vào `outcome.frames` (mục 4) | Chưa làm |
| 2 | Script sinh bundle + chạy lô + `summary.csv` | Chưa làm |
| 3 | Chạy BR, rồi V / S / T / C / N, rồi W (chung với TuDM bước 1), rồi R | Chưa làm (cần máy CARLA) |
| 4 | Phân tích, cập nhật TD-17 và đề xuất tham số AEB cho người đi bộ | Chưa làm |
