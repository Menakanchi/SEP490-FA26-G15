# Range tham số AEB — nguồn và luận cứ

Tài liệu tổng hợp nguồn cho 10 tham số của lõi AEB. Theo
[ADR-040](../adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md), chỉ **4 tham số chỉnh được** (bộ tối ưu và
candidate được đổi); **6 tham số còn lại là hằng số** của lõi:

| Loại | Tham số | Nằm ở đâu |
|---|---|---|
| **Chỉnh được (4)** | 5 TTC Threshold, 6 Brake Activation Delay, 7 Max Deceleration, 8 Brake Build-up Rate | bảng `aeb_parameters` + `aeb_parameter_values` (seed: `BootstrapService.java`, khớp `01_schema.sql`) |
| **Hằng số (6)** | 1 Detection Confidence 0,70 · 2 Relative Velocity 2,0 m/s · 3 Prediction Horizon 2,0 s · 4 Safety Distance Margin 2,0 m · 9 Jerk Limit 20 m/s³ · 10 Actuator Response Time 0,10 s | `worker/vehicsim_core/aeb_stack.py` — không nằm trong DB, không có trong bundle |

> **Kiểm chứng nguồn (20/10/2026):** từng khẳng định dưới đây đã được mở lại trong văn bản gốc và ghi mức bằng chứng ở
> [sổ kiểm chứng](nguon-va-kiem-chung-du-lieu.md). Các chỗ **đã sửa** vì sai nguồn được đánh dấu "Đính chính 20/10".

Với 4 tham số chỉnh được, nguồn bên dưới là căn cứ cho **biên tối ưu**. Với 6 hằng số, nguồn là căn cứ cho
**giá trị cố định** đang chọn. Mục cuối đối chiếu nghiên cứu với code hiện tại.

## Tổng quan nguồn

- **4/10** tham số có range được nguồn chính thống ghi trực tiếp: TTC, Max
  Deceleration, Brake Activation Delay, Actuator Response Time.
- **4/10** tham số có range ghép từ nhiều paper.
- **2/10** tham số chỉ có giá trị đơn; range là đề xuất của nhóm.

| # | Tham số | Range nghiên cứu | Nguồn chính | Mức chứng minh |
|---|---|---|---|---|
| 1 | Detection Confidence Threshold | 0.2 – 0.7 | Safe Perception (2022); PointPillars adaptive threshold (2024) | Ghép từ paper perception |
| 2 | Relative Velocity Threshold | 10 – 60 km/h đã xác minh (R152); "10 – 70" chưa xác minh | UN R152; UN R131 | R152 đọc trực tiếp; số của MLIT/R131 chưa tìm thấy |
| 3 | Prediction Horizon | 0.5 – 5 s | Maschke 2024 (VW); luận văn JKU (NMPC) | Ghép, độ tin cậy thấp |
| 4 | Safety Distance Margin (d0) | 1 – 5 m | Mazda / Berkeley (Seiler 1998) | Chỉ có giá trị 5 m, cận dưới là đề xuất |
| 5 | TTC Threshold | 0.6 – 3.0 s | Lai 2024; Maschke 2024; UN R131; GB/T 39901-2021 | Có range trực tiếp |
| 6 | Brake Activation Delay | 0.1 – 0.5 s | Mazda, Honda (Seiler 1998); Maschke 2024; Taylor 2024 | Có range trực tiếp |
| 7 | Target/Max Deceleration | 3 – 10 m/s² | Maschke 2024; EU 347/2012; Mazda, Honda; Fei 2024 (μ) | Có range trực tiếp |
| 8 | Brake Build-up Rate | 12 m/s³ (quét 5 – 50) | Maschke 2024; Chen 2023 (EHB) | Giá trị đơn, range là suy luận |
| 9 | Jerk Limit | 1 – 12 m/s³ | Nghiên cứu comfort (arXiv 2112.09074); ISO 22179 theo arXiv 2011.06553; Maschke 2024 | Ghép comfort và vật lý |
| 10 | Actuator Response Time | 0.12 – 0.2 s | Maschke 2024; Chen 2023 (EHB) | Có range trực tiếp |

## Perception

### 1. Detection Confidence Threshold: 0.2 – 0.7 (hằng số 0,70)

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

### 2. Relative Velocity Threshold: 10 – 70 km/h (hằng số 2,0 m/s)

Không paper nào định nghĩa "ngưỡng vận tốc tương đối" như một tham số AEB. Range này
lấy từ dải vận tốc mà tiêu chuẩn bắt buộc AEB phải hoạt động.

- **UN R152** (xe con M1/N1), đọc trực tiếp trong Công báo EU (bản dịch tiếng Tây Ban Nha): hệ thống phải hoạt động
  trong dải **10 – 60 km/h** (đoạn 5.2.1.3) và **20 – 60 km/h** với người đi bộ (5.2.2.3). Bản hợp nhất 2020 thử xe đứng yên
  ở 20, 42 và 60 km/h; xe chạy 30 và 60 km/h với mục tiêu 20 km/h (chênh 10 và 40 km/h).
- **UN R131** (xe tải, xe buýt), bản gốc hiệu lực 13/02/2014: hệ thống phải hoạt động từ **15 km/h** (đoạn 5.2.3); bài thử
  bắt đầu ở 80 ± 2 km/h với mục tiêu 12 hoặc 67 km/h (Phụ lục 3). Chuỗi sửa đổi 02 (công bố 21/02/2023) nêu dải 10–100 km/h theo
  trích đoạn tìm kiếm, chưa đọc bản văn.
- **Đính chính 20/10:** các con số "10 km/h", "90 so với 20 km/h (chênh 70 km/h)" trong bản tóm tắt MLIT **không có** trong
  văn bản R131 đã đọc; do đó cận trên 70 km/h **chưa xác minh**.

**Luận cứ:** cận dưới 10 km/h là ngưỡng kích hoạt thấp nhất của R152 xe con. Cận trên được xác minh là 60 km/h (R152);
con số 70 km/h chưa có nguồn.

> Liên quan: sai số đo vận tốc của radar có σ = 0.1 km/h (Maschke 2024). Đây là mức
> nhiễu, không phải ngưỡng.

## Prediction / Risk

### 3. Prediction Horizon: 0.5 – 5 s (hằng số 2,0 s)

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

### 4. Safety Distance Margin (d0): 1 – 5 m (hằng số 2,0 m)

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
| UN R131, đoạn 6.4.5 và 6.5.4 (xe tải, xe buýt; đọc trực tiếp) | *"The emergency braking phase shall not start before a TTC equal to or less than 3,0 seconds."* | Cận trên 3.0 s (xe nặng) |
| Quy định (EU) 347/2012, Phụ lục II 2.4.4 và 2.5.4 (xe nặng; bản Công báo tiếng Tây Ban Nha) | Phanh khẩn cấp không bắt đầu cho tới khi TTC ≤ 3 s | Cận trên 3.0 s (xe nặng) |
| GB/T 39901-2021 (xe con, Trung Quốc) | Phanh khẩn cấp không sớm hơn 3 s trước va chạm | **Chỉ nguồn thứ cấp** (chưa mở được bản văn; đã bị GB 39901-2025 thay) |

**Luận cứ:** dưới 0.6 s thì giảm tốc tối đa của xe con không còn đủ để tránh va chạm
ở tốc độ thường gặp. Trên 3.0 s thì phanh khẩn cấp bị cấm **đối với xe nặng** (R131, EU 347/2012), vì rủi ro phanh
nhầm khi tài xế vẫn còn đủ thời gian tự xử lý.

> **Đính chính 20/10:** UN R152 (xe con) **không có** quy tắc này: TTC chỉ xuất hiện ở định nghĩa (2.12) và một điều kiện thử.
> Với xe con, cận 3.0 s chỉ dựa vào GB/T 39901-2021 (nguồn thứ cấp) và việc áp dụng tương tự từ xe nặng. Khi trình bày phải nói rõ.

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
- **Quy định EU 347/2012 và UN R131 (xe nặng):** pha phanh khẩn cấp bắt đầu khi AEBS yêu cầu ít nhất 4 m/s².
  **UN R152 (xe con, đoạn 5.2.1.2 và 5.2.2.2):** lệnh phanh tới hệ thống phanh phải đạt ít nhất **5,0 m/s²** (*Đính chính 20/10*).
- **Seiler et al. 1998:** Mazda giả định 6 m/s² (xe sau) và 8 m/s² (xe trước); Honda
  giả định 7.8 m/s².
- **Fei et al. 2024**, *Electronics*: giảm tốc tối đa B = μ·g. Paper mô phỏng μ từ 0.1
  đến 0.9, tương ứng khoảng 1–9 m/s².
- **Lai et al. 2024:** giảm tốc cực đại đo được 0.3g – 1.0g tùy thuật toán, trên mặt
  đường μ = 1.0.

**Luận cứ:** cận dưới 3 m/s² là mức phanh tầng đầu; cận trên 10 m/s² xấp xỉ 1g, giới
hạn vật lý trên đường khô. Khi chạy kịch bản đường ướt hoặc băng, cận trên phải giảm
theo μ·g.

### 8. Brake Build-up Rate: 12 m/s³ (quét đề xuất 5 – 50 m/s³; code chỉnh trong 5 – 20)

- **Maschke et al. 2024:** gradient giảm tốc giới hạn 12 m/s³ cùng thời gian đáp ứng
  0.12 s, để mô phỏng thời gian tăng áp của hệ phanh thật. Đây là giá trị duy nhất có
  nguồn trực tiếp.
- **Chen et al. 2023**, IJEHV: hệ phanh điện-thủy lực (EHB) đưa áp suất xi-lanh bánh xe
  tới mục tiêu trong vòng 0.2 s.

**Luận cứ:** cận trên 50 m/s³ là suy luận của nhóm: nếu phanh đạt khoảng 9–10 m/s²
trong 0.2 s (Chen 2023) thì tốc độ tăng là khoảng 45–50 m/s³. Cận dưới 5 m/s³ ban đầu
lấy theo giới hạn "ISO 15622" cho ACC (mục 9); sau 20/10 nguồn này **không còn xác minh được** (bài báo gốc nêu ISO 22179), nên
cận dưới là lựa chọn của nhóm.

### 9. Jerk Limit: 1 – 12 m/s³ (hằng số 20 m/s³)

- **Nghiên cứu driving simulator về cảnh báo va chạm người đi bộ** (arXiv 2112.09074):
  jerk ±1 m/s³ là thoải mái, ±2 m/s³ là chấp nhận được, vượt ±2 m/s³ bị xếp vào mức
  không an toàn.
- **Giới hạn gradient giảm tốc của ACC**, theo *Stress Testing Method* (arXiv 2011.06553): trung bình không vượt 2.5 m/s³ khi
  trên 20 m/s và 5 m/s³ khi dưới 5 m/s. *Đính chính 20/10:* bài báo gắn quan hệ giảm tốc–jerk–tốc độ với **ISO 22179** [33], không nêu
  ISO 15622; chưa đọc được bản ISO nên không khẳng định tiêu chuẩn nào chứa hai con số này.
- **Maschke et al. 2024:** hệ phanh khẩn cấp cho phép tới 12 m/s³.

**Luận cứ:** jerk là trade-off giữa êm ái và an toàn. Cận dưới 1 m/s³ là ngưỡng thoải
mái; 2.5–5 m/s³ là giới hạn cho hệ thống không khẩn cấp (ACC, theo bài báo trên); cận trên 12 m/s³ là mức
hệ phanh khẩn cấp thật. AEB không có giới hạn jerk theo tiêu chuẩn, nên tối ưu trong cả
khoảng là hợp lý.

> **Đính chính:** "J ≤ 10 m/s³" trong bản tóm tắt cũ không có trong paper Lai 2024.

## Vehicle / Actuation

### 10. Actuator Response Time: 0.12 – 0.2 s (hằng số 0,10 s)

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

## Đối chiếu với code hiện tại (sau ADR-040)

Cột cuối là nhận xét, **chưa sửa code**.

**4 tham số chỉnh được.** Biên lấy từ seed trong `BootstrapService.java` (min / max / mặc định; baseline v1.0 ghi đè
TTC = 1,5 s). Đổi biên thì sửa cùng lúc `BootstrapService.java`, `01_schema.sql`
(`test_java_parameter_seed_matches_sql_seed`) và thêm migration đánh số cho DB đang chạy.

| # | Tham số | Code hiện tại | Nghiên cứu | Nhận xét |
|---|---|---|---|---|
| 5 | TTC Threshold | 0.5 – 4.0 s, mặc định 1.8, baseline 1.5 | 0.6 – 3.0 s | **Cận trên 4.0 s vượt mức 3 s của UN R131 / EU 347/2012 (xe nặng)**; với xe con chỉ có nguồn thứ cấp (GB/T 39901) |
| 6 | Brake Activation Delay | 0.0 – 0.5 s, mặc định 0.15 | 0.1 – 0.5 s | Cận dưới 0 s phi thực tế |
| 7 | Max Deceleration | 3 – 10 m/s², mặc định 8 | 3 – 10 m/s² | Khớp |
| 8 | Brake Build-up Rate | 5 – 20 m/s³, mặc định 20 (migration 008) | 12 (quét 5 – 50) | Chặn ở 20 vì lõi giới hạn tốc độ tăng lực phanh bằng Jerk Limit cố định 20 |

**6 hằng số.** Giá trị trong `worker/vehicsim_core/aeb_stack.py`. Đổi một hằng số làm kết quả động học đổi, nên phải
đổi tên bộ mô phỏng (`KINEMATIC_SIMULATOR` trong `bundle.py`) để run cũ không bị ghép với run mới.

| # | Tham số | Hằng số | Nghiên cứu | Nhận xét |
|---|---|---|---|---|
| 1 | Detection Confidence | 0.70 | 0.2 – 0.7 | Nằm đúng cận trên |
| 2 | Relative Velocity | 2.0 m/s (7.2 km/h) | 10 – 70 km/h | Thấp hơn ngưỡng kích hoạt thấp nhất của tiêu chuẩn |
| 3 | Prediction Horizon | 2.0 s | 0.5 – 5 s | Khớp (horizon MPC thường dùng) |
| 4 | Safety Distance Margin | 2.0 m | 1 – 5 m | Khớp |
| 9 | Jerk Limit | 20 m/s³ | 1 – 12 m/s³ | **Vượt mức 12 m/s³ của mô hình phanh khẩn cấp trong Maschke 2024** (giá trị mô hình của một hãng, không phải giới hạn tiêu chuẩn) |
| 10 | Actuator Response Time | 0.10 s | 0.12 – 0.2 s | Thấp hơn cận dưới |

## Thu dữ liệu từ CARLA cho các tham số này

`worker/sensor_recorder.py` gắn sensor **built-in của CARLA** (không gọi dịch vụ
ngoài) lên xe ego và ghi `frames.csv` mỗi tick:

| Sensor CARLA | Cột dữ liệu | Tham số chỉnh được | Hằng số liên quan |
|---|---|---|---|
| `sensor.other.radar` | `radar_depth_m`, `radar_rel_velocity_ms`, `radar_ttc_s` | 5 | 2, 3 |
| `sensor.other.obstacle` | `obstacle_distance_m`, `obstacle_actor` | — | 4 |
| `sensor.other.imu` | `imu_accel_x_ms2`, `imu_jerk_ms3` | 7, 8 | 9 |
| `sensor.other.collision` | `collisions.json` | kết quả COLLISION | — |
| `sensor.camera.rgb` (`--camera`) | ảnh PNG | — | 1 — cần thêm detector (vd. YOLO) chạy trên ảnh mới ra confidence |
| ground truth | `ego_speed_ms`, `throttle`, `brake` | 6 | 10 |

Hằng số 1 là thứ duy nhất cần thành phần ngoài CARLA: CARLA không có sensor "phát hiện vật thể kèm confidence". Phải
chạy một mô hình nhận diện trên ảnh camera (chạy local trên GPU, không phải API ngoài), hoặc mô phỏng confidence như bộ
động học đang làm (`worker/vehicsim_core/aeb_stack.py`).

Ba mục tiêu MOBO tính từ `frames.csv` + `collisions.json` ở `TelemetryMetricsService.java`
(`POST /api/v1/vehicsim/telemetry/evaluate`), cùng định nghĩa ADR-040 mà bộ động học dùng
(`worker/vehicsim_core/simulator.py::brake_phase_metrics`). Riêng với CARLA, khung từ lúc va chạm trở đi bị loại vì IMU
đo xung lực đâm xe chứ không phải phanh.
