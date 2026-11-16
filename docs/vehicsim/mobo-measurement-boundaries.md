# Nghiên cứu Giá trị Biên và Phương pháp Đo đạc Chuẩn hóa

## 1. Phương pháp đo và Chuẩn hóa Đơn vị

| Đại lượng | Đơn vị đo SI | Phương pháp đo | Nguồn thu thập trong CARLA |
|---|:---:|---|---|
| **RMS Jerk** | $\text{m/s}^3$ | Căn bậc hai trung bình bình phương đạo hàm gia tốc $\Delta a/\Delta t$ trong pha phanh. | Cảm biến IMU (`sensor.other.imu`) hoặc sai phân telemetry 20 Hz. |
| **Impact Speed** | $\text{m/s}$ (quy đổi $\text{km/h}$) | Độ lớn vector vận tốc xe chủ thể tại tick xảy ra va chạm. | Cảm biến va chạm (`sensor.other.collision`) + `vehicle.get_velocity()`. |
| **Stopping Distance** | $\text{m}$ | Tích phân khoảng cách dọc từ lúc phanh kích hoạt tới khi xe dừng hẳn ($v = 0$). | Tọa độ `vehicle.get_location()`. |

## 2. Căn cứ Vật lý của các Giá trị Biên Tham số AEB

* **`TTC_THRESHOLD` $\in [0.5, 3.5]\text{ s}$**:
  * *Cận dưới 0.5 s*: Tổng thời gian trễ phần cứng (cảm biến $0.1\text{ s}$ + tính toán $0.15\text{ s}$ + cơ cấu chấp hành $0.1\text{ s}$ + tăng áp $0.1\text{ s}$) đã mất $0.45\text{ s}$. Đặt dưới $0.5\text{ s}$ xe sẽ đâm trước khi phanh kịp sinh lực.
  * *Cận trên 3.5 s*: Ở $50\text{ km/h}$, $3.5\text{ s}$ tương đương khoảng cách gần $50\text{ m}$. Đặt lớn hơn gây phanh oan liên tục khi người chưa bước xuống đường.
* **`BRAKE_ACTIVATION_DELAY` $\in [0.05, 0.45]\text{ s}$**:
  * *Cận dưới 0.05 s*: Chu kỳ trễ vòng lặp của CAN Bus và ECU trên ô tô ($20 \div 50\text{ Hz}$).
  * *Cận trên 0.45 s*: Ngưỡng thời gian an toàn tối đa theo ISO 26262 cho hệ thống an toàn tính mạng.
* **`BRAKE_BUILDUP_RATE` $\in [5.0, 20.0]\text{ m/s}^3$**:
  * *Cận dưới 5.0 m/s³*: Tăng áp quá chậm, mất tới $1.6\text{ s}$ mới đạt lực phanh tối đa, làm mất quãng đường vàng để dừng.
  * *Cận trên 20.0 m/s³*: Giới hạn bơm thủy lực phanh điện tử (iBooster) và ngưỡng an toàn chống chấn thương cổ hành khách (ISO 2631).
* **`MAX_DECELERATION` $\in [5.0, 10.0]\text{ m/s}^2$**:
  * *Cận dưới 5.0 m/s²*: Ngưỡng tối thiểu của Euro NCAP để được công nhận là phanh khẩn cấp (dưới mức này chỉ là phanh tiện nghi).
  * *Cận trên 10.0 m/s²*: Giới hạn ma sát định luật Coulomb giữa lốp cao su và đường nhựa khô ($\mu \cdot g \approx 0.9 \times 9.81 \approx 9\text{ m/s}^2$). Không thể phanh vượt quá $10\text{ m/s}^2$ do trượt lết.

## 3. Tiêu chuẩn Quốc tế Đối chiếu

* **Euro NCAP**: *AEB VRU Systems Test Protocol* (Version 4.2).
* **ISO 22733-2:2023**: *Test method for evaluating AEB performance: Car-to-vulnerable road user*.
* **UNECE Regulation 152 (R152)**: *Uniform provisions concerning AEB for M1/N1 vehicles*.
