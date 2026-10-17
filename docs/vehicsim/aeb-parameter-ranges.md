# Range tham số AEB — nguồn và luận cứ

Tài liệu tổng hợp nguồn cho range của **10 tham số AEB** mà VehicSim tối ưu
(`AEB_PARAMETER_SEED` trong `src/services/vehicsim/bootstrap.py`, mirror bảng
`aeb_parameters` trong `database/mysql/01_schema.sql`). Mục cuối đối chiếu range
nghiên cứu với range đang seed trong code.

## Tổng quan

- **4/10** tham số có range được nguồn chính thống ghi trực tiếp: TTC, Max
  Deceleration, Brake Activation Delay, Actuator Response Time.
- **4/10** tham số có range ghép từ nhiều paper.
- **2/10** tham số chỉ có giá trị đơn; range là đề xuất của nhóm.

| # | Tham số | Range đề xuất | Nguồn chính | Mức chứng minh |
|---|---|---|---|---|
| 1 | Detection Confidence Threshold | 0.2 – 0.7 | Safe Perception (2022); PointPillars adaptive threshold (2024) | Ghép từ paper perception |
| 2 | Relative Velocity Threshold | 10 – 70 km/h | UN R152, UN R131 (qua MLIT Nhật) | Lấy từ dải test của tiêu chuẩn |
| 3 | Prediction Horizon | 0.5 – 5 s | Maschke 2024 (VW); luận văn JKU (NMPC) | Ghép, độ tin cậy thấp |
| 4 | Safety Distance Margin (d0) | 1 – 5 m | Mazda / Berkeley (Seiler 1998) | Chỉ có giá trị 5 m, cận dưới là đề xuất |
| 5 | TTC Threshold | 0.6 – 3.0 s | Lai 2024; Maschke 2024; UN R131; GB/T 39901-2021 | Có range trực tiếp |
| 6 | Brake Activation Delay | 0.1 – 0.5 s | Mazda, Honda (Seiler 1998); Maschke 2024; Taylor 2024 | Có range trực tiếp |
| 7 | Target/Max Deceleration | 3 – 10 m/s² | Maschke 2024; EU 347/2012; Mazda, Honda; Fei 2024 (μ) | Có range trực tiếp |
| 8 | Brake Build-up Rate | 12 m/s³ (quét 5 – 50) | Maschke 2024; Chen 2023 (EHB) | Giá trị đơn, range là suy luận |
| 9 | Jerk Limit | 1 – 12 m/s³ | Nghiên cứu comfort (arXiv 2112.09074); ISO 15622; Maschke 2024 | Ghép comfort và vật lý |
| 10 | Actuator Response Time | 0.12 – 0.2 s | Maschke 2024; Chen 2023 (EHB) | Có range trực tiếp |

## Perception

### 1. Detection Confidence Threshold: 0.2 – 0.7

**Nguồn**

- *Safe Perception – A Hierarchical Monitor Approach* (arXiv 2208.00824): với
  PointPillars, ngưỡng 0.5 bỏ sót 90 vật thể và có 9 false positive. Hạ xuống 0.2
  thì chỉ bỏ sót 20 nhưng false positive tăng lên 115. Paper cũng ghi nhận lệch 0.1
  có thể làm mất phát hiện cả một xe tải ngay phía trước.
- *Density-Aware Adaptive Thresholding* (arXiv 2404.13852): khảo sát 3 mức 0.3, 0.5,
  0.7 trên KITTI. Ngưỡng 0.7 tăng precision ở gần nhưng recall giảm mạnh với vật thể
  xa hơn 40 m.

**Luận cứ:** cận dưới 0.2 là điểm false positive bùng nổ (phantom braking); cận
trên 0.7 là điểm bắt đầu bỏ sót vật thể xa (không phanh). Đây chính là trade-off mà
bộ tối ưu cần cân bằng.

> Cả hai paper dùng LiDAR 3D, không phải camera trong CARLA. Range chỉ mang tính
> tham khảo cho detector của nhóm.

### 2. Relative Velocity Threshold: 10 – 70 km/h

Không paper nào định nghĩa "ngưỡng vận tốc tương đối" như một tham số AEB. Range này
lấy từ dải vận tốc mà tiêu chuẩn bắt buộc AEB phải hoạt động.

- **UN R152** (xe con M1/N1), theo bản tóm tắt của Bộ Giao thông Nhật (MLIT): không
  được va chạm với xe đứng yên khi chạy 40 km/h, và với xe đang chạy 20 km/h khi xe
  test chạy 60 km/h (chênh lệch 40 km/h).
- **UN R131** sửa đổi (xe tải, xe buýt), theo MLIT: phải hoạt động từ 10 km/h đến vận
  tốc tối đa. Bài test xe đang chạy dùng 90 km/h so với 20 km/h (chênh lệch 70 km/h).

**Luận cứ:** cận dưới 10 km/h là ngưỡng kích hoạt thấp nhất tiêu chuẩn yêu cầu; cận
trên 70 km/h là chênh lệch vận tốc lớn nhất trong bài test chính thức.

> Liên quan: sai số đo vận tốc của radar có σ = 0.1 km/h (Maschke 2024). Đây là mức
> nhiễu, không phải ngưỡng.

## Prediction / Risk

### 3. Prediction Horizon: 0.5 – 5 s

- **Maschke et al. 2024**, *Vehicles* (VW), Table 3: prediction time 0.5 s, cycle time
  0.06 s, consideration time 0.1 s. Ở đây 0.5 s là thời gian sensor tiếp tục ngoại
  suy vị trí vật thể sau khi mất tín hiệu.
- **Luận văn JKU Linz** – *Collision avoidance by autonomous braking and steering*:
  NMPC đánh giá rủi ro dùng horizon 5 s; tầng điều khiển phanh/lái dùng horizon ngắn
  hơn, 2 s.
- **Tiêu chuẩn chặn phía trên:** UN R131 và GB/T 39901 cấm phanh khẩn cấp khi TTC còn
  trên 3 s (xem mục 5). Nhìn xa hơn 3 s chỉ phục vụ cảnh báo, không phục vụ quyết định
  phanh.

**Luận cứ:** đây là range ghép, độ tin cậy thấp. Cần ghi rõ: 0.5 s là horizon ngắn
nhất để bù mất tín hiệu sensor; 2–5 s là horizon thường dùng trong MPC tránh va chạm.

> Nguồn JKU là luận văn, không phải bài báo bình duyệt. Nếu hội đồng khắt khe, nên
> tìm thêm một paper MPC-AEB có ghi horizon.

### 4. Safety Distance Margin (d0): 1 – 5 m

- **Seiler, Song, Hedrick 1998** – *Development of a Collision Avoidance System*
  (SAE): trình bày thuật toán Mazda với α1 = 6 m/s², α2 = 8 m/s², τ1 = 0.1 s,
  τ2 = 0.6 s. Giá trị d0 = 5 m của Mazda được IJ3C 2016 trích lại đầy đủ.
- **Thuật toán Berkeley** dùng khoảng cách tối thiểu R_min = 5 m và giảm tốc 6 m/s²,
  theo AVASTRA (arXiv 2412.02574).
- **Lai et al. 2024**, WEVJ: khoảng cách dừng đo được trong mô phỏng từ khoảng 2 m
  (thuật toán Quad) đến 15.8 m (PDF). Đây là kết quả, không phải tham số đầu vào.

**Luận cứ:** cận trên 5 m có nguồn (Mazda, Berkeley). Cận dưới 1 m là đề xuất của
nhóm, dựa trên việc các thuật toán hiện đại dừng cách vật cản khoảng 2 m.

> **Đính chính:** con số "1.0 – 2.5 m" trong bản tóm tắt cũ không có trong paper
> Electronics 2024.

## Decision

### 5. TTC Threshold: 0.6 – 3.0 s

Đây là tham số có luận cứ mạnh nhất: cận dưới lấy từ paper, cận trên lấy từ tiêu chuẩn.

| Nguồn | Giá trị | Vai trò |
|---|---|---|
| Maschke et al. 2024 (VW) | TTC ≤ 1.5 s: phanh tối đa 3 m/s²; TTC ≤ 0.6 s: tới 10 m/s² | Cận dưới 0.6 s |
| Lai et al. 2024, WEVJ | > 2 s không kích hoạt; 1.6–2 s phanh nhẹ; 0.7–1.6 s phanh vừa; < 0.7 s phanh toàn phần; ngưỡng chuyển PDF 2.6 s | Các mốc ở giữa |
| UN R131 (xe tải, xe buýt), theo giải trình của Úc | Phanh khẩn cấp không được bắt đầu khi TTC > 3.0 s | Cận trên 3.0 s |
| GB/T 39901-2021 (xe con, Trung Quốc) | Phanh khẩn cấp không được bắt đầu sớm hơn 3 s trước va chạm | Cận trên 3.0 s |

**Luận cứ:** dưới 0.6 s thì giảm tốc tối đa của xe con không còn đủ để tránh va chạm
ở tốc độ thường gặp. Trên 3.0 s thì phanh khẩn cấp bị tiêu chuẩn cấm, vì rủi ro phanh
nhầm khi tài xế vẫn còn đủ thời gian tự xử lý.

**Gợi ý thiết kế:** nếu AEB của nhóm có nhiều tầng như Lai 2024, tối ưu từng ngưỡng
con trong [0.6, 3.0] với ràng buộc ngưỡng tầng sau nhỏ hơn tầng trước.

## Timing / Control

### 6. Brake Activation Delay: 0.1 – 0.5 s

- **Seiler et al. 1998:** thuật toán Mazda dùng độ trễ hệ thống τ1 = 0.1 s. Thuật toán
  Honda dùng độ trễ hệ thống τ1 = 0.5 s (τ2 = 1.5 s là thời gian phanh, không phải độ
  trễ).
- **Maschke et al. 2024:** cycle time 0.06 s + consideration time 0.1 s = 0.16 s từ lúc
  vật thể xuất hiện tới lúc AEB nhận dữ liệu. Giá trị này nằm trong range trên.
- **Đối chiếu xe thật — Taylor 2024, EVU:** đo 195 lần AEB kích hoạt trên 10 mẫu xe
  2019–2022. Toàn bộ thời gian từ lúc người nộm xuất hiện tới khi đạt phanh tối đa là
  0.76–1.97 s (P10 = 0.88 s, P50 = 1.17 s, P90 = 1.50 s).

**Luận cứ:** 0.1–0.5 s là độ trễ của riêng khâu xử lý và truyền lệnh, lấy từ hai thuật
toán kinh điển. Số liệu Taylor là tổng thời gian nhận diện + quyết định + tăng áp, dùng
để kiểm chứng mô phỏng CARLA có sát xe thật không.

### 7. Target/Max Deceleration: 3 – 10 m/s²

- **Maschke et al. 2024:** tầng 1 giới hạn 3 m/s², tầng 2 giới hạn 10 m/s².
- **Quy định EU 347/2012:** pha phanh khẩn cấp bắt đầu khi AEBS yêu cầu ít nhất 4 m/s².
- **Seiler et al. 1998:** Mazda giả định 6 m/s² (xe sau) và 8 m/s² (xe trước); Honda
  giả định 7.8 m/s².
- **Fei et al. 2024**, *Electronics*: giảm tốc tối đa B = μ·g. Paper mô phỏng μ từ 0.1
  đến 0.9, tương ứng khoảng 1–9 m/s².
- **Lai et al. 2024:** giảm tốc cực đại đo được 0.3g – 1.0g tùy thuật toán, trên mặt
  đường μ = 1.0.

**Luận cứ:** cận dưới 3 m/s² là mức phanh tầng đầu; cận trên 10 m/s² xấp xỉ 1g, giới
hạn vật lý trên đường khô. Khi chạy kịch bản đường ướt hoặc băng, cận trên phải giảm
theo μ·g.

### 8. Brake Build-up Rate: 12 m/s³ (quét đề xuất 5 – 50 m/s³)

- **Maschke et al. 2024:** gradient giảm tốc giới hạn 12 m/s³ cùng thời gian đáp ứng
  0.12 s, để mô phỏng thời gian tăng áp của hệ phanh thật. Đây là giá trị duy nhất có
  nguồn trực tiếp.
- **Chen et al. 2023**, IJEHV: hệ phanh điện-thủy lực (EHB) đưa áp suất xi-lanh bánh xe
  tới mục tiêu trong vòng 0.2 s.

**Luận cứ:** cận trên 50 m/s³ là suy luận của nhóm: nếu phanh đạt khoảng 9–10 m/s²
trong 0.2 s (Chen 2023) thì tốc độ tăng là khoảng 45–50 m/s³. Cận dưới 5 m/s³ lấy theo
giới hạn ISO 15622 cho ACC (mục 9).

### 9. Jerk Limit: 1 – 12 m/s³

- **Nghiên cứu driving simulator về cảnh báo va chạm người đi bộ** (arXiv 2112.09074):
  jerk ±1 m/s³ là thoải mái, ±2 m/s³ là chấp nhận được, vượt ±2 m/s³ bị xếp vào mức
  không an toàn.
- **ISO 15622 (ACC)**, theo *Stress Testing Method* (arXiv 2011.06553): gradient giảm
  tốc trung bình không vượt 2.5 m/s³ khi trên 20 m/s và 5 m/s³ khi dưới 5 m/s.
- **Maschke et al. 2024:** hệ phanh khẩn cấp cho phép tới 12 m/s³.

**Luận cứ:** jerk là trade-off giữa êm ái và an toàn. Cận dưới 1 m/s³ là ngưỡng thoải
mái; 2.5–5 m/s³ là giới hạn cho hệ thống không khẩn cấp (ACC); cận trên 12 m/s³ là mức
hệ phanh khẩn cấp thật. AEB không có giới hạn jerk theo tiêu chuẩn, nên tối ưu trong cả
khoảng là hợp lý.

> **Đính chính:** "J ≤ 10 m/s³" trong bản tóm tắt cũ không có trong paper Lai 2024.

## Vehicle / Actuation

### 10. Actuator Response Time: 0.12 – 0.2 s

- **Maschke et al. 2024:** response time 0.12 s, dùng để mô phỏng thời gian tăng áp
  trong hệ phanh thật (trích từ giáo trình Küçükay 2022).
- **Chen et al. 2023**, IJEHV: EHB đưa áp suất tới mục tiêu trong vòng 0.2 s.
- **Krakowiak & Dębowski 2022:** đo trên băng thử, hệ phanh xe máy cần trung bình 0.2 s
  từ lúc bóp phanh tới lực phanh đầy đủ. Đây là xe máy, chỉ dùng làm đối chiếu.

**Luận cứ:** 0.12 s ứng với hệ phanh nhanh (theo VW), 0.2 s ứng với EHB hiện đại. Nếu
muốn mô phỏng hệ phanh chậm hoặc đã xuống cấp, có thể nới cận trên, nhưng phần nới thêm
là đề xuất của nhóm.

> **Phân biệt với tham số 6:** activation delay là trễ *trước khi* lệnh phanh được gửi;
> actuator response time là trễ *từ lúc có lệnh* tới khi áp suất phanh đạt mức yêu cầu.

## Đối chiếu với range đang seed trong code

Số trong code lấy từ `AEB_PARAMETER_SEED` (min / max / default; baseline v1.0 ghi đè
TTC = 1.5 s). Cột cuối là nhận xét, **chưa sửa code**. Đổi range phải sửa đồng thời
`bootstrap.py` và `01_schema.sql` (`test_python_parameter_seed_matches_sql_seed`), và
DB MySQL đang chạy phải `UPDATE` tay vì chưa có migration (TD-02).

| # | Tham số | Code hiện tại | Nghiên cứu | Nhận xét |
|---|---|---|---|---|
| 1 | Detection Confidence | 0.30 – 0.99, mặc định 0.70 | 0.2 – 0.7 | Mặc định nằm đúng cận trên; dải 0.7–0.99 không có nguồn |
| 2 | Relative Velocity | 0.5 – 10 m/s (1.8 – 36 km/h), mặc định 2 m/s | 10 – 70 km/h (2.78 – 19.4 m/s) | **Lệch nhiều**: code cho phép dưới ngưỡng tiêu chuẩn, không phủ được chênh lệch 40–70 km/h |
| 3 | Prediction Horizon | 0.5 – 4.0 s, mặc định 2.0 | 0.5 – 5 s | Khớp; cận trên thấp hơn 1 s |
| 4 | Safety Distance Margin | 0.5 – 5.0 m, mặc định 2.0 | 1 – 5 m | Khớp; cận dưới thấp hơn |
| 5 | TTC Threshold | 0.5 – 4.0 s, mặc định 1.8, baseline 1.5 | 0.6 – 3.0 s | **Cận trên 4.0 s vượt mức UN R131 / GB/T 39901 cấm (> 3 s)** |
| 6 | Brake Activation Delay | 0.0 – 0.5 s, mặc định 0.15 | 0.1 – 0.5 s | Cận dưới 0 s phi thực tế |
| 7 | Max Deceleration | 3 – 10 m/s², mặc định 8 | 3 – 10 m/s² | Khớp |
| 8 | Brake Build-up Rate | 10 – 100 m/s³, mặc định 50 | 12 (quét 5 – 50) | Mặc định nằm ở cận trên nghiên cứu; 50–100 không có nguồn |
| 9 | Jerk Limit | 5 – 50 m/s³, mặc định 20 | 1 – 12 m/s³ | **Lệch nhiều**: mặc định 20 vượt mức hệ phanh khẩn cấp thật (12) |
| 10 | Actuator Response Time | 0.02 – 0.30 s, mặc định 0.10 | 0.12 – 0.2 s | Mặc định thấp hơn cận dưới |

## Thu dữ liệu từ CARLA cho các tham số này

`worker/sensor_recorder.py` gắn sensor **built-in của CARLA** (không gọi dịch vụ
ngoài) lên xe ego và ghi `frames.csv` mỗi tick:

| Sensor CARLA | Cột dữ liệu | Tham số liên quan |
|---|---|---|
| `sensor.other.radar` | `radar_depth_m`, `radar_rel_velocity_ms`, `radar_ttc_s` | 2, 3, 5 |
| `sensor.other.obstacle` | `obstacle_distance_m`, `obstacle_actor` | 4 |
| `sensor.other.imu` | `imu_accel_x_ms2`, `imu_jerk_ms3` | 7, 8, 9 |
| `sensor.other.collision` | `collisions.json` | kết quả COLLISION |
| `sensor.camera.rgb` (`--camera`) | ảnh PNG | 1 — cần thêm detector (vd. YOLO) chạy trên ảnh mới ra confidence |
| ground truth | `ego_speed_ms`, `throttle`, `brake` | 6, 10 |

Tham số 1 là tham số duy nhất cần thêm thành phần ngoài CARLA: CARLA không có sensor
"phát hiện vật thể kèm confidence". Phải chạy một mô hình nhận diện trên ảnh camera
(chạy local trên GPU, không phải API ngoài), hoặc mô phỏng confidence như simulator
động học hiện tại đang làm (`src/services/vehicsim/simulator.py`).
