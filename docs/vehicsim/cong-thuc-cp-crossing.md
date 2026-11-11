# Sổ tay công thức theo quy trình — người đi bộ băng ngang (CP_CROSSING)

**Cập nhật:** 11/11/2026, đối chiếu code nhánh `TuDM` sau khi gộp ADR-051 (hiệu chuẩn phanh) và
[exec plan 11/11](../exec-plans/active/2026-11-11-cong-thuc-cp-crossing-carla.md).
**Nguồn:** bản HTML "Sổ tay công thức theo quy trình CP_CROSSING" (10/11/2026) của nhóm, đã sửa các chỗ khác code.

Đi theo thứ tự một run trên CARLA: thông số người dùng nhập → `.xosc` → ScenarioRunner/CARLA → nhận thức → quyết định →
phanh → kết thúc → chỉ số → chấm điểm. CARLA chỉ tính vật lý; mọi công thức còn lại do VehicSim tính trong lõi Java
`com.vsos.core` (ADR-042). Bộ động học dùng chung lõi AEB và luật chấm nhưng không còn là bộ mô phỏng chính (10/11/2026).

**Nhãn nguồn:** *Euro NCAP*, *FMVSS/UN*, *CARLA*, *ScenarioRunner* (mã nguồn tag `v0.9.16`), *Chuẩn ngành*, *Đo CARLA*
(số đo của nhóm), *Toán*, *Tham khảo* (bài báo), *Mô hình* (giả định của nhóm, chưa có chuẩn). Mức bằng chứng của từng
nguồn ở [sổ kiểm chứng nguồn](nguon-va-kiem-chung-du-lieu.md).

**Trạng thái:** ✅ khớp code · 🔧 đã sửa ngày 11/11 · ⚠️ còn sai, chưa sửa · ❓ cần nhóm quyết định ·
➡️ thuộc phần khác (phân tích lỗi / MOBO), chỉ ghi bàn giao.

## 1. Nhập thông số kịch bản

| Trường | Ký hiệu | Đơn vị · dải | Dùng ở |
|---|---|---|---|
| Tốc độ xe | $V_{ego}$ | km/h · 10–130 | 1, 6, 19, 33 |
| Khoảng cách kích hoạt | $d_{trigger}$ | m · 5–80 | 6, 8 |
| Tốc độ người đi bộ | $v_{ped}$ | m/s · 0,5–6 | 7, 9, 12 |
| Dừng tại lề | — | có / không | 7, 36 |
| Thời tiết | $w$ | CLEAR · CLOUDY · RAIN · HEAVY_RAIN · FOG | 2, 4, 5, 17 |
| Thời điểm | — | DAY · DUSK · NIGHT | 3, 17 |

Dải nằm ở `FamilyService.IR_BOUNDS`; category CP_CROSSING, đối tượng PEDESTRIAN.

**CT 1 — Đổi đơn vị** (Toán) ✅ $v_{ego} = V_{ego}/3{,}6$.

## 2. Dựng kịch bản: thông số → `.xosc` (`XoscExport`)

**CT 2 — Ma sát mặt đường theo thời tiết** (Chuẩn ngành) 🔧

$$\mu = \begin{cases} 1{,}00 & \text{CLEAR, CLOUDY, FOG} \\ 0{,}65 & \text{RAIN} \\ 0{,}55 & \text{HEAVY\_RAIN} \end{cases}$$

- μ được **lưu theo biến thể** lúc tạo họ (`Vs.WEATHER_FRICTION` → `scenario_versions.road_friction`); bundle và `.xosc` mang nó
  tường minh (`vs_friction`, `RoadCondition frictionScaleFactor`). Đổi RAIN 0,70 → 0,65 ngày 11/11/2026 chỉ áp cho **họ tạo mới**;
  họ cũ giữ 0,70 và chạy lại ra đúng kết quả cũ. Không cần đổi định danh vì định dạng file không đổi.
- `CrossingCase.WEATHER_FRICTION` là bảng dự phòng khi bundle không ghi μ (dòng DB cũ để trống, CLI, fixture parity); cố ý giữ 0,70.
- Lõi dùng μ ở $\mu g$: bộ động học kẹp giảm tốc thật; trên CARLA kẹp số đo (CT 26) và $a_{avail}$ (CT 24b). `AebStack` không dùng μ.
- Nguồn: Bosch (Reif 2014, Bảng 1: khô 0,85 · ướt 0,65 · mưa to 0,55; nhóm chưa mở sách gốc). Đường khô dùng 1,0
  (Euro NCAP PBC ≥ 0,9; FMVSS 127 PFC 1,02), không phải 0,85 của Bosch. CARLA mặc định `tire_friction` 3,5 cho các xe trong DB,
  không phải 1,0; `frictionScaleFactor` đi vào thang ma sát riêng của CARLA (`ChangeRoadFriction`).
- ❓ ADR-051 đo thấy ma sát lốp gần như không đổi quãng phanh CARLA, nên mưa trên CARLA hiện chưa làm xe phanh yếu hơn (mục 10).

**CT 3 — Độ cao mặt trời** (CARLA) 🔧 `XoscExport.sunElevationRad`

$$\text{elevation} = 45^\circ\ (\text{DAY, ClearNoon}),\quad 15^\circ\ (\text{DUSK, ClearSunset}),\quad -90^\circ\ (\text{NIGHT, ClearNight})$$

Trước 11/11 code dùng 1,05 / 0,07 / −0,70 rad (≈ 60° / 4° / −40°), không trùng preset nào.

**CT 4 — Mây và mưa** (CARLA, ScenarioRunner) 🔧 `XoscExport.sunIntensity`, `rainIntensity`

$$I_{sun} = 1 - \frac{\text{cloudiness}}{100}\qquad I_{rain} = \frac{\text{precipitation}}{100}$$

| Form | Preset CARLA | Sun intensity | Precipitation |
|---|---|---|---|
| CLEAR | ClearNoon (mây 5) | 0,95 | dry · 0 |
| CLOUDY | CloudyNoon (60) | 0,40 | dry · 0 |
| RAIN | MidRainyNoon (60 / 60) | 0,40 | rain · 0,6 |
| HEAVY_RAIN | HardRainNoon (100 / 100) | 0,00 | rain · 1,0 |
| FOG | không có preset; mây như CloudyNoon (Mô hình) | 0,40 | dry · 0 |

Trước 11/11 Sun intensity luôn là 1, ScenarioRunner tính mây = 0 ở mọi thời tiết nên **CLOUDY giống hệt CLEAR**; mưa 0,5 / 1,0.
Thuộc tính `cloudState` không được ScenarioRunner đọc. Số preset lấy theo `WeatherParameters.cpp` 0.9.16, **cần kiểm lại trên
máy CARLA** (`carla.WeatherParameters.CloudyNoon`…) trước khi merge.

**CT 5 — Tầm nhìn sương mù** (Chuẩn ngành) ✅ visualRange = 30 m khi FOG (Met Office: < 50 m là sương mù dày đặc), còn lại 100 000 m.

**CT 6 — Vị trí vạch người băng ngang** (CARLA, Mô hình) ✅

$$s_{cross} = s_0 + d_{trigger} + v_{ego}\,t_{lead}\qquad s_0 = 20\text{ m (mũi xe)},\ t_{lead} = 1{,}5\text{ s}$$

Town04 road 40 / lane −4, đoạn thẳng 228 m, làn 3,5 m. Tâm xe ở $s_0 - L/2$. `Simulator.LEAD_TIME_S`, `CrossingCase.crossingX`.

**CT 7 — Quỹ đạo người và bù dừng ở lề** (ScenarioRunner, Đo CARLA) ✅

$$y_{start} = -3{,}60\text{ m}\qquad y_{finish} = \begin{cases} +3{,}60 & \text{băng hết đường} \\ y_{curb} + r_{arrival} - v_{ped}\,t_{lag} & \text{dừng tại lề} \end{cases}$$

$y_{curb} = -2{,}25$ m; $r_{arrival} = 1{,}0$ m (`PedestrianControl` bỏ waypoint sớm); $t_{lag} = 0{,}07$ s (đo 23/10/2026).
Euro NCAP CPNA đặt người cách đường đi 4,0 m, hệ thống dùng 3,6 m. `XoscExport.crossingStory`.

**CT 8 — Điều kiện người bắt đầu đi** (ScenarioRunner) ✅

$$\lVert \mathbf p_{tâm\ xe} - \mathbf p_{vạch} \rVert < d_{trigger} + L_{ego}/2$$

`DistanceCondition` đo từ tâm xe (`freespace="false"`), nên cộng $L/2$ để mũi xe cách vạch đúng $d_{trigger}$.

**CT 9 — Tốc độ người tham chiếu** (Euro NCAP, FMVSS/UN) ✅ CPNA 5 km/h ≈ 1,39 m/s; CPFA 8 km/h ≈ 2,22 m/s. Hệ thống cho 0,5–6 m/s
(6 m/s là mức đã đo ổn định trên CARLA).

## 3. CARLA chạy kịch bản (ScenarioRunner + CARLA)

**CT 10 — Đặt xe và người** ✅ $\mathbf P = \mathbf P_{waypoint}(40, -4, s) + \text{offset}\cdot\hat{\mathbf r}$, offset $= -y$.
Không ghi Orientation vì ScenarioRunner xoay trước rồi mới dời offset.

**CT 11 — ScenarioRunner đọc thời tiết** (`openscenario_parser.py:486-502`) ✅

$$\text{sun\_altitude} = \deg(\text{elevation})\quad \text{cloudiness} = 100 - 100\,I_{sun}\quad \text{precipitation} = \text{wetness} = 100\,I_{rain}\quad \text{fog\_density} = 100 \text{ nếu visualRange} < 1000$$

Có mưa thì ScenarioRunner đặt `precipitation_deposits` = 100. "Thời tiết chỉ tác động camera, không đổi vật lý" mới có ở tài liệu
CARLA 0.9.15, **chưa kiểm lại trên 0.9.16** (sổ kiểm chứng M7).

**CT 12 — Người đi theo waypoint** ✅ hướng về waypoint kế với tốc độ ra lệnh, gần như đạt tốc độ ngay; bỏ waypoint khi còn < 1,0 m.

**CT 13 — Nhịp mô phỏng và vật lý** (CARLA, Đo CARLA) 🔧

$\Delta t = 0{,}01$ s (đồng bộ 100 Hz); kịch bản dừng khi `vs_done = 1` hoặc $t \ge 12$ s. CARLA không có thông số "giảm tốc":
VehicSim gửi bàn đạp 0–1, PhysX tính lực phanh ở bánh rồi chia khối lượng.

| Đặc tính CARLA 0.9.16 | Giá trị |
|---|---|
| e-tron 2100 kg, mô-men 1800 N·m (ADR-051, 08/11/2026) | phanh 100%: 10,64 / 9,46 / 9,04 / 8,89 m/s² ở 40 / 50 / 60 / 70 km/h; $a_{full}$ = 9,13 |
| e-tron trước hiệu chuẩn (1000 N·m mặc định) | 4,64–4,72 m/s² (2100 kg); 4,08 m/s² (2370 kg) |
| Dưới khoảng 6 m/s | xe dừng gần như tức thì (21–27 m/s²), TD-17 |
| Ma sát lốp ×2, ×3 | gần như không đổi quãng dừng (ADR-051) |
| Chạy lặp 9 lần | cùng quyết định AEB; lệch chuẩn quãng dừng 0,066 m |

## 4. Nhận thức (`AebStack`, perception tổng hợp từ ground truth)

Radar chạy bóng (`RadarTracker`, ADR-043) chỉ ghi vào `perception_shadow`, không điều khiển xe.

**CT 14 — Chiếu toạ độ CARLA về khung giao cắt** (Toán) ✅ `CarlaSession.step`, `CrossingFrame`

$$\text{gap} = -(\mathbf p_{ego} + L_f\hat{\mathbf f} - \mathbf O)\cdot\hat{\mathbf f}\qquad y_{ped} = -(\mathbf p_{ped} - \mathbf O)\cdot\hat{\mathbf r}\qquad v_y = -\mathbf v_{ped}\cdot\hat{\mathbf r}$$

**CT 15 — Độ trễ nhận thức** (Mô hình) ✅

$$\text{lag\_frames} = \operatorname{round}(0{,}10 / \Delta t)$$

Lịch sử ghi mỗi bước mô phỏng: CARLA ($\Delta t$ = 0,01) lùi 10 khung, bộ động học (0,05) lùi 2 khung; cả hai đúng 0,10 s.
AEB ra quyết định mỗi 0,05 s (`perception_period_s`).

**CT 16 — Tầm cảm biến** ✅ $d_{sensor} = \sqrt{\text{gap}^2 + y^2} \le 80$ m và gap $> -L_{ego}$ (`SENSOR_RANGE_M`).

**CT 17 — Nhiễu và độ tin cậy** (Mô hình) ✅

$$y_{seen} = y_{ped} + \mathcal N(0, \sigma_w^2)\qquad \text{conf} = \operatorname{clamp}\big(c_0(w) + c_t - 0{,}004\max(0, d_{sensor} - 15) + \mathcal N(0, 0{,}05^2),\ 0,\ 1\big)\qquad \text{detected} \iff \text{conf} \ge 0{,}70$$

| Thời tiết | CLEAR | CLOUDY | RAIN | HEAVY_RAIN | FOG |
|---|---|---|---|---|---|
| $c_0$ | 0,93 | 0,91 | 0,84 | 0,74 | 0,70 |
| $\sigma_w$ (m) | 0,05 | 0,06 | 0,10 | 0,16 | 0,14 |

$c_t$: DAY 0, DUSK −0,06, NIGHT −0,14. Nhiễu rút từ bộ sinh số theo seed. ❓ FOG + NIGHT (0,56) và HEAVY_RAIN + NIGHT (0,60) dưới
ngưỡng nên AEB gần như không thấy người; giữ hay loại khỏi tập dữ liệu là việc của màn 3 / MOBO ➡️.

**CT 18 — Lọc vận tốc ngang** (Mô hình) ✅ $v_{y,f}^{(k)} = 0{,}6\,v_{y,f}^{(k-1)} + 0{,}4\,v_y^{(k)}$, chỉ cập nhật ở khung cảm biến có phát hiện.

## 5. Quyết định

**CT 19 — TTC** (Euro NCAP, UN R152) ✅ $\text{TTC} = \text{gap} / (v_{ego} - v_{target,x})$; người băng ngang $v_{target,x} = 0$.
Chỉ tính khi phát hiện, gap > 0 và tốc độ tiếp cận ≥ 2,0 m/s.

**CT 20 — Dự đoán vị trí ngang** (Mô hình) ✅ $y_{pred} = y_{seen} + v_{y,f}\min(\text{TTC}, 2{,}0)$.

**CT 21 — Hành lang nguy hiểm** (Mô hình) ✅ ❓

$$\text{inPath} = (|y_{pred}| \le w_c) \lor (|y_{seen}| \le w_c)\qquad w_c = 0{,}5 \times 1{,}93 + 0{,}25 \times 2{,}0 = 1{,}465\text{ m}$$

1,93 m viết cứng trong `AebParams.corridorHalfWidth`, không theo xe đang chạy. Lấy bề rộng từ DB là quyết định chưa chốt (D4).

**CT 22 — FCW và AEB** (Mô hình) ✅ FCW ⇔ inPath ∧ TTC ≤ TTC_th + 1,0 s; AEB chốt $t_{decision}$ ⇔ inPath ∧ TTC ≤ TTC_th
(TTC_th là tham số tối ưu 1, baseline 1,5 s).

**Vì sao thấy người mà chưa phanh.** Ca 40 km/h, kích hoạt 25 m, người 1,5 m/s, AEB mặc định (bộ động học, seed 48001, 11/11/2026):
thấy người từ $t$ = 0 (cách 41 m, người đứng trên vỉa hè ngoài hành lang) → người bước đi 1,50 s → FCW 1,70 s → quyết định phanh
2,25 s (TTC = 1,5 s) → phanh tác dụng 2,55 s → dừng 4,10 s, cách vạch 4,0 m. Hai điều kiện của CT 22 phải cùng đúng; phanh mỗi
khi thấy người là phanh oan (CT 36).

## 6. Phanh: lệnh AEB → bàn đạp CARLA

**CT 23 — Thời điểm phanh tác dụng** (Mô hình, Tham khảo) ✅ $t_{onset} = t_{decision} + \tau + 0{,}10$ s, với $\tau$ =
BRAKE_ACTIVATION_DELAY (tham số 2) và 0,10 s trễ cơ cấu chấp hành.

**CT 24 — Mức AEB xin** (Mô hình) ✅

$$a_{cmd}(t) = \min\big(a_{lim},\ a_{cmd}(t - \Delta t) + \min(J, 20)\,\Delta t\big)\qquad a_{lim} = \min(a_{max},\ a_{xe,DB})$$

$J$ = BRAKE_BUILDUP_RATE (tham số 3), $a_{max}$ = MAX_DECELERATION (tham số 4), $a_{xe,DB}$ = `max_brake_decel_mps2` (9,5).
$\mu g$ không nằm trong lệnh.

**CT 24b — Mức xe làm được** (Toán, Đo CARLA) 🔧 `CarlaSession.decelAvailable`

$$a_{avail} = \min(a_{max},\ a_{xe,DB},\ \mu g,\ a_{full})\quad\text{(CARLA, từ định dạng v5)}\qquad a_{avail} = \min(a_{max},\ a_{xe,DB},\ \mu g)\quad\text{(bộ động học, file cũ)}$$

Dùng cho phần ngoại suy quãng dừng (CT 31) và ghi vào `decel_available_mps2` cho chuỗi nguyên nhân (CT 33, 37). Ví dụ: e-tron
đã hiệu chuẩn, đường khô: $\min(8;\ 9{,}5;\ 9{,}81;\ 9{,}13) = 8$ (không đổi so với trước); Tesla Model 3 ($a_{full}$ 3,56):
trước 8, nay 3,56; e-tron khi mưa: $0{,}70 \times 9{,}81 = 6{,}87$ (biến thể cũ) hoặc 6,38 (biến thể mới μ 0,65).

**CT 25 — Đổi lệnh thành bàn đạp** (Đo CARLA, Mô hình) ✅ `DecelMeter.brakePedal`

$$\text{Pedal} = \operatorname{clamp}\Big(\frac{a_{cmd}}{a_{full}} + 0{,}05\,(a_{cmd} - a_{meas}),\ 0,\ 1\Big)$$

| Xe (CARLA 0.9.16) | Khối lượng | $a_{full}$ = `carla_full_brake_decel_mps2` |
|---|---|---|
| Audi e-tron (1800 N·m, ADR-051) | 2100 kg | 9,13 |
| Tesla Model 3 (mô-men mặc định) | 1845 kg | 3,56 |
| Nissan Patrol 2021 | 2355 kg | 6,01 |
| Mercedes Sprinter | 3000 kg | 5,69 |
| Xe chưa đo | — | 4,6 (`CarlaSession.DEFAULT_FULL_BRAKE_DECEL`) |

$a_{full}$ chỉ đúng với khối lượng và mô-men lúc đo; đổi `mass_kg` hoặc `max_brake_torque_nm` thì đo lại bằng
`worker/measure_brake.py`. Mức phanh 100% đổi theo tốc độ (e-tron 10,6 → 8,9 m/s² từ 40 → 70 km/h), nên bàn đạp tỉ lệ chỉ gần đúng.

**CT 26 — Đo giảm tốc trên CARLA** (Toán, CARLA) ✅ `DecelMeter.update`

$$a_{meas} = \min\Big(\mu g,\ \max\big(0,\ \tfrac{v_{k-n} - v_k}{n\,\Delta t}\big)\Big)\qquad n = \max\big(2,\ \operatorname{round}(0{,}1/\Delta t)\big) = 10$$

Trả 0 trước khi AEB phanh (xe giữ tốc độ bằng `enable_constant_velocity`, lái do `LocalPlanner`). Số vượt $\mu g$ bị kẹp và đếm
vào `carla.decel_clamped_frames`.

## 7. Va chạm và kết thúc run (`CarlaSession.step`)

**CT 27 — Va chạm** (CARLA, Mô hình) ✅ người chồng lấn thân xe theo chiều dọc và $|y_{ped} - y_{ego}| \le W/2 + 0{,}30$, hoặc
`sensor.other.collision` báo trúng người.

**CT 28 — Kết thúc** (Mô hình) 🔧 (sổ tay cũ ghi sai TARGET_CLEARED)

- EGO_STOPPED ⇔ $v_{ego} \le 0{,}05$ m/s và AEB đã quyết định phanh.
- TARGET_CLEARED ⇔ đuôi xe đã vượt qua vạch người đi hơn 1,0 m (xe đã đi qua chỗ người băng).
- TIMEOUT ⇔ $t \ge 11{,}9$ s. Khi kết thúc, lõi ghi `result.json` và đặt `vs_done = 1`.

**CT 29 — Khoảng cách nhỏ nhất** (Toán) ✅

$$d_{min} = \min_t \max\big(0,\ \sqrt{dx^2 + dy^2} - r\big)\qquad dy = \max(0,\ |y_{ped}| - W/2)$$

$dx$ = 0 khi người nằm trong chiều dài xe. `Simulator.summaryMetrics`, dùng chung cho CARLA.

## 8. Chỉ số kết quả (3 mục tiêu)

**CT 30 — RMS jerk** (Toán) ⚠️ ➡️ `Simulator.brakePhaseMetrics`

$$j_i = \frac{a_i - a_{i-1}}{\Delta t}\qquad \text{Jerk}_{RMS} = \sqrt{\tfrac{1}{N}\textstyle\sum j_i^2}\qquad i \in [t_{onset},\ t_{end}]$$

Chỉ số chính thức chưa lọc và gồm cả đoạn CARLA dừng gấp dưới khoảng 6 m/s. Có hai bản phụ: `carla.jerk_filtered` (Butterworth
bậc 2 một chiều, chưa đúng "12 cực không lệch pha" của Euro NCAP) và số telemetry IMU (`TelemetryMetricsService`). Đổi định nghĩa
là việc chung của màn 3 và MOBO; phía run chỉ đo `decel_clamped_frames` để định lượng.

**CT 31 — Quãng dừng** (Toán) 🔧

$$d_{stop} = (x_{last} - x_{onset}) + \frac{v_{last}^2}{2\,a_{avail}}$$

Tính từ lúc phanh tác dụng nên $\tau$ và TTC_th không ảnh hưởng. Phần ngoại suy được cộng mỗi khi run kết thúc mà xe còn chạy
(va chạm, TARGET_CLEARED, hết giờ). Trên CARLA $a_{avail}$ lấy theo CT 24b, khớp với ngoại suy của telemetry
(`RunService.carlaData`).

**CT 31b — Quãng dừng tính từ lúc quyết định** (Toán; không có trong code, dùng để giải thích)

$$d_{tổng} = v_0(\tau + 0{,}10) + \Big(v_0 t_r - \frac{\min(J,20)\,t_r^3}{6}\Big) + \frac{v_1^2}{2a}\qquad t_r = \frac{a}{\min(J,20)},\ v_1 = v_0 - \frac{a\,t_r}{2}$$

Ba đoạn: chờ phanh ăn, lực tăng tuyến tính, phanh đều; $a = a_{avail}$. Với e-tron đã hiệu chuẩn $a$ = 8 như bộ động học; khác
biệt thật trên CARLA nằm ở đoạn dừng gấp dưới 6 m/s và mức phanh đổi theo tốc độ.

**CT 32 — Tốc độ va và mức nguy hiểm** (Euro NCAP, Chuẩn ngành) ✅ $v_{impact} = v_{ego}(t_{collision})$;
CRITICAL ≥ 30 km/h (WHO), HIGH 15–30, MEDIUM < 15 (Mô hình). `Evaluation.evaluate`.

**CT 33 — TTC tối thiểu để kịp dừng** (Toán) ➡️ `Evaluation.hazardChain`

$$\text{TTC}_{needed} = \tau + 0{,}10 + \frac{t_r}{2} + \frac{v_0}{2a}\qquad t_r = \frac{a_{max}}{\min(J,20)}$$

Code tính $t_r$ bằng $a_{max}$; "nominal" dùng $a = a_{max}$, "actual" dùng $a = a_{avail}$. Từ 11/11 $a_{avail}$ trên CARLA đã
đúng theo CT 24b; dùng $a_{avail}$ cho cả hai vế là việc của màn 3.

**CT 34 — Thời điểm phanh thật $T_{AEB}$** (Euro NCAP) ❓ chưa có trong code. Euro NCAP AEB/LSS VRU v4.5.1 (đã kiểm, sổ kiểm chứng R15):
lấy điểm cuối cùng gia tốc đã lọc < −1 m/s², rồi lùi về lúc nó vượt −0,3 m/s². Ngưỡng −3 / −1 m/s² của bản sổ tay cũ (theo protocol
2026 v1.2) chưa xác minh.

## 9. Chấm điểm (`Evaluation`) ➡️ phần phân tích lỗi, chỉ mô tả

**CT 35 — Outcome** (Chuẩn ngành, Mô hình) ✅ COLLISION nếu va; NEAR_MISS nếu min TTC < 1,0 s hoặc $d_{min}$ < 0,5 m; còn lại SAFE.
Min TTC là TTC ground truth, chỉ tính khi người trong $|y| \le W/2 + 0{,}30$. FHWA SSAM mặc định 1,5 s.

**CT 36 — Phanh oan, bỏ lọt, phán quyết** (Mô hình) ✅

- hazard ⇔ có khung người ở $|y| \le W/2 + 0{,}30$ (1,265 m với e-tron) khi gap > 0 và $v$ > 0,1 m/s, hoặc có va chạm.
- FalseActivation ⇔ đã phanh ∧ ¬hazard; MissedActivation ⇔ hazard ∧ $t_{ideal}$ ≠ null ∧ chưa phanh.
- Verdict = FAIL ⇔ COLLISION ∨ FalseActivation ∨ MissedActivation.

**CT 37 — Chuỗi nguyên nhân 4 khâu** (Mô hình) — chấm đủ 4 khâu, khâu hỏng đầu tiên là nguyên nhân chính.

| Khâu | Điều kiện (code) | Mã |
|---|---|---|
| Nhận thức | không phát hiện; hoặc phát hiện muộn hơn mốc lý tưởng > 0,15 s | OBJECT_NOT_DETECTED · OBJECT_DETECTED_LATE |
| Quyết định | người vào hông xe · không phanh · phanh muộn > 0,15 s · TTC_th < TTC cần (CT 33) · người vào đường quá muộn; phanh oan có chuỗi riêng | SIDE_ENTRY_NOT_PREDICTED · NO_TRIGGER · TRIGGERED_TOO_LATE · THRESHOLD_TOO_LOW · PATH_ENTERED_LATE · PATH_PREDICTION_TOO_CONSERVATIVE |
| Điều khiển | $\tau + 0{,}10 + \frac{a_{max}/\min(J,20)}{2} > 0{,}50$ s | SLOW_BRAKE_BUILDUP |
| Động lực học | $a_{avail} < a_{max} - 0{,}05$ | LOW_FRICTION |

⚠️ Bàn giao màn 3: từ 11/11 $a_{avail}$ trên CARLA có thể nhỏ vì **xe** (Tesla 3,56…) chứ không vì đường, nhưng khâu 4 vẫn báo
`LOW_FRICTION` "Road friction μ … capped". Cần tách mã "do xe"; số $a_{full}$ có sẵn ở `case.carla.full_brake_decel` của `result.json`.
Trong lúc chờ, chỉ chạy CARLA bằng e-tron (đã hiệu chuẩn).

## 10. Mưa trên CARLA (chưa xử lý)

Sau ADR-051 AEB xin 8 m/s² và xe làm được, trong khi $\mu g$ khi mưa là 6,38–6,87 (HEAVY_RAIN 5,40) và lốp CARLA gần như không giới
hạn lực phanh. Hệ quả: số đo bị kẹp ở $\mu g$ (CT 26), khâu bù bàn đạp đẩy phanh mạnh thêm, khâu 4 báo LOW_FRICTION dù xe thật trong
CARLA phanh khoảng 8. ❓ Hai hướng: (R1) kẹp lệnh gửi xuống bàn đạp ở $\mu g$ trong `CarlaSession`, giống bộ động học; (R2) coi mưa
chỉ là hình ảnh và bỏ kẹp $\mu g$ khi đo. Chốt sau khi đo trên CARLA (exec plan, bước 1).

So sánh μ 0,70 với 0,65 trên bộ động học (người 1,5 m/s, kích hoạt 25 m, seed 48001): 40 km/h dừng cách vạch 2,72 → 2,15 m;
50 km/h va 3,0 → 12,9 km/h; 60 km/h va 41,4 → 42,4 km/h. Ca không phanh kịp hoặc không cần phanh không đổi.

## Phụ lục A — Bốn tham số AEB (ADR-040) ➡️ MOBO

| Tham số | CT | DB (`aeb_parameters`) | MOBO (`ParameterBounds.DEFAULT`) | Baseline |
|---|---|---|---|---|
| TTC_THRESHOLD (s) | 22 | 0,5–4,0 (mặc định 1,80) | 0,5–3,5 | 1,5 |
| BRAKE_ACTIVATION_DELAY (s) | 23 | 0–0,50 | 0,05–0,45 | 0,15 |
| BRAKE_BUILDUP_RATE (m/s³) | 24 | 5–20 | 5–20 | 20 |
| MAX_DECELERATION (m/s²) | 24 | 3–10 | 5–10 | 8 |

`corridor_half_width` không phải tham số tối ưu. Baseline seed TTC 1,5 s (`BootstrapService`, `RunService.AEB_DEFAULTS`), không
mâu thuẫn với mặc định 1,80 của bảng tham số. MAX_DECELERATION chỉ bão hòa trên CARLA khi lớn hơn $a_{full}$ của xe.

## Phụ lục B — Việc và trạng thái (11/11/2026)

| # | Việc | CT | Trạng thái |
|---|---|---|---|
| 1 | μ RAIN 0,65 cho họ tạo mới | 2 | 🔧 xong (code); họ cũ giữ 0,70 |
| 2 | Độ cao mặt trời theo preset | 3 | 🔧 xong; cần kiểm preset trên máy CARLA |
| 3 | Sun / Rain intensity theo preset | 4 | 🔧 xong; cần kiểm preset trên máy CARLA |
| 4 | $a_{avail}$ trên CARLA dùng $a_{full}$ | 24b, 31 | 🔧 xong (chỉ file v5) |
| 5 | Ghi $a_{full}$ e-tron vào DB | 25 | Xong (ADR-051, migration 014) |
| 6 | Mưa trên CARLA (R1 / R2) | 10 | ❓ chờ đo CARLA |
| 7 | Hành lang theo bề rộng xe | 21 | ❓ chờ quyết định |
| 8 | Tách khâu Động lực học "do đường / do xe"; TTC cần dùng $a_{avail}$ | 33, 37 | ➡️ màn 3 |
| 9 | RMS jerk bỏ đoạn dừng gấp, chốt bộ lọc | 30 | ➡️ màn 3 + MOBO |
| 10 | MOBO chấm bằng CARLA, khoảng tham số | A | ➡️ MOBO |
| 11 | Đổi mặc định `VEHICSIM_SIMULATOR` | — | ❓ chờ quyết định |
| 12 | Chạy lại baseline CARLA bằng `-xosc5` (sau migration 014) | — | Chưa làm |

## Phụ lục C — Giá trị là tham số mô hình (chưa có chuẩn)

Trễ nhận thức 0,10 s · trễ cơ cấu chấp hành 0,10 s · bảng tin cậy và nhiễu · lọc 0,6 / 0,4 · tầm dự đoán 2,0 s · hành lang
1,465 m · khoảng FCW 1,0 s · giới hạn jerk 20 m/s³ · tốc độ tiếp cận tối thiểu 2,0 m/s · ngưỡng tin cậy 0,70 · tầm 80 m ·
hệ số bù bàn đạp 0,05 · $t_{lead}$ 1,5 s · bán kính người 0,30 m · ngưỡng chẩn đoán 0,15 / 0,50 s · near-miss 1,0 s / 0,5 m ·
mốc 15 km/h · thời gian tối đa 12 s · mây FOG.

## Tài liệu tham khảo

1. Euro NCAP, *AEB/LSS VRU Test Protocol* v4.5.1 (2024); *Crash Avoidance – Frontal Collisions* v1.2 (2026).
2. NHTSA, FMVSS No. 127 (49 CFR 571.127); UN Regulation No. 152.
3. CARLA 0.9.16 Python API và `LibCarla/source/carla/rpc/WeatherParameters.cpp`; ScenarioRunner tag `v0.9.16`
   (`openscenario_parser.py`, `atomic_behaviors.py`, `pedestrian_control.py`).
4. K. Reif (Ed.), *Brakes, Brake Control and Driver Assistance Systems*, Bosch, Springer Vieweg, 2014, Bảng 1.
5. Met Office, *How fog affects travel*; WMO; FHWA-HRT-08-051 (SSAM); WHO *Pedestrian Safety Manual* (2013).
6. Seiler, Song, Hedrick, SAE 980853 (1998); Taylor, EVU 2024; Maschke và cộng sự, *Vehicles* 6(4), 2024.
7. Nội bộ: [ADR-040](../adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md), [ADR-043](../adr/ADR-043-perception-tu-radar-chay-bong-truoc.md),
   [ADR-051](../adr/ADR-051-hieu-chuan-phanh-carla-xosc5.md), [tham số AEB](aeb-parameter-ranges.md),
   [sổ kiểm chứng nguồn](nguon-va-kiem-chung-du-lieu.md), [CARLA local](carla-local.md).
