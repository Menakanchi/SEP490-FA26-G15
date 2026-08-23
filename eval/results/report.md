# Evaluation Report — Scenario Forge

> Snapshot: 24/08/2026, lấy trực tiếp từ database phát triển qua
> `GET /api/v1/metrics/quality`. Không tính 10 scenario `seed-data` vào M1/M2.
> Mỗi scenario chỉ dùng lần chạy CARLA mới nhất để không tự bỏ phiếu nhiều lần.

## 1. Phạm vi đo

- Simulator: CARLA 0.9.15 + ScenarioRunner 0.9.15, Town04.
- Phạm vi converter: 5 maneuver xe trên anchor `highway` và
  `run_red_light` trên anchor `urban_straight`, cùng 3 loại xe
  (`car`, `motorcycle`, `truck`) × 4 thời tiết = **72 ô hỗ trợ**.
- `jaywalk` không nằm trong phạm vi highway: tình huống không hợp lý trên anchor
  này và `AcquirePositionAction` định tuyến dọc làn thay vì băng ngang.
- Một execution `success=true` chỉ có nghĩa ScenarioRunner chạy hết. L4 mới trả
  lời hành vi có đúng ý định hay không.

## 2. Kết quả M1 — tính hợp lệ

| Mức | Định nghĩa | Kết quả |
|---|---|---:|
| L1 | Request sinh được draft qua schema và validate | **25/34 = 73,53%** |
| L2 | Scenario trong scope biên dịch được `.xosc` | **31/31 = 100%** |
| L3 | ScenarioRunner chạy hết, không crash/timeout | **30/32 = 93,75%** |
| L4 | Quỹ đạo CARLA tái hiện đúng maneuver | **16/30 = 53,33%** |

Hai lượt L3 chưa chấm được ở L4 được báo riêng, không tính thành sai. L4 hiện có
oracle cho đủ 6 maneuver trong phạm vi: `cut_in`, `lane_drift`, `sudden_brake`,
`stop_in_lane`, `wrong_way` và `run_red_light`.

## 3. Kết quả M2 — độ phủ ODD

| Cách đo | Kết quả |
|---|---:|
| Phủ toàn phần trong phạm vi converter | **12/72 = 16,67%** |
| Phủ theo cặp trục khả thi | **50/74 = 67,57%** |
| Ô có dữ liệu ở mọi scope | 15/560 |

Phủ toàn phần trả lời đã thử bao nhiêu tổ hợp hoàn chỉnh. Phủ theo cặp trả lời đã
thử bao nhiêu tương tác hai yếu tố; hai số không thay thế nhau.

## 4. Kết quả M3 — kích hoạt nguy hiểm

| Kết quả lần chạy mới nhất | Số lượng |
|---|---:|
| Có va chạm | 12 |
| Suýt va chạm, khe hở < 1 m | 7 |
| Không dựng được nguy hiểm | 11 |
| Tổng lượt chạy được | 30 |

Tỷ lệ kích hoạt nguy hiểm: **19/30 = 63,33%**. Collision riêng là
**12/30 = 40,00%**. `lane_drift` chủ đích dựng near-miss nên không thể chỉ dùng
`CollisionTest` làm M3.

## 5. Bằng chứng sửa `cut_in`

Trigger thời gian từng làm adversary nhập làn sau ego rồi tông đuôi. Converter
hiện dùng `lead_distance` + `ReachPositionCondition`, chỉ kích hoạt khi actor đã
dẫn trước ít nhất 7 m. Bốn lượt chạy lại đều được người xem trực tiếp xác nhận:

| Scenario | Vị trí dọc lúc vào làn | Vị trí dọc lúc chạm | Kết luận |
|---|---:|---:|---|
| `sc_011` | +11,767 m | +3,066 m | đúng |
| `sc_012` | +14,287 m | +3,472 m | đúng |
| `sc_021` | +9,707 m | +4,979 m | đúng |
| `sc_022` | +10,341 m | +3,440 m | đúng |

Số dương nghĩa là adversary ở trước ego. Cả bốn trường hợp là adversary vượt
lên, nhập làn rồi giảm tốc; ego chạm vào đuôi adversary.

## 6. Bằng chứng sửa `wrong_way`

Hai bản lịch sử `sc_020` và `sc_025` đặt actor ở +120 m, ngoài tầm +40 m của
anchor nên đã bị từ chối. Các lượt thay thế sau đó tìm ra **hai lỗi độc lập**:

1. Teleport xoay xe ở Event sau khi đã cấp tốc độ làm CARLA giữ vector quán
   tính cũ. Sửa bằng cách đặt Orientation 180° ngay trong `Init`.
2. Chỉ xoay đầu và cấp tốc độ vẫn không đủ trên đường cong: khi không có route,
   `NpcVehicleControl` chạy theo tiếp tuyến, cắt ngang nhiều làn rồi đâm hộ lan.
   Người xem trực tiếp phát hiện lỗi này ở `sc_038`–`sc_041`; độ lệch tim làn
   trước va chạm là **1,754–3,006 m**.

Converter hiện phát đồng thời SpeedAction và một `AssignRouteAction` gồm các
`RelativeLanePosition` giảm dần, `routeStrategy="shortest"`. Route đi đúng thứ
tự waypoint ngược tuyến, không qua GlobalRoutePlanner một chiều; mốc `ds=0`
được bỏ vì ScenarioRunner gọi `waypoint.next(0)` và CARLA từ chối. Kết quả cuối:

| Scenario | Actor | Heading delta | Lệch tim làn lớn nhất | Khe hở nhỏ nhất | Va chạm | Người xem |
|---|---|---:|---:|---:|---|---|
| `sc_042` | car | 180,0° | 0,188 m | 0,000 m | có | đúng |
| `sc_043` | truck | 180,0° | 0,194 m | 0,000 m | có | đúng |

Cả hai đã được duyệt vào thư viện. Oracle `wrong_way` cũng được siết lại: ngoài
heading ≥150° và khe hở <1 m, actor phải lệch tim làn không quá 1 m. Vì vậy bốn
lượt cũ lao vào hộ lan không còn bị chấm nhầm là đúng ý định.

## 7. Bằng chứng `run_red_light` cắt ngang đường ego

Anchor highway không có đèn trong tầm dùng được: đèn gần nhất cách 211,8 m,
trong khi đoạn tiến chỉ tới +40 m. Vì vậy `run_red_light` được chuyển sang anchor
`urban_straight` đã đo trên Town04: ego đi theo đèn xanh `id=118`, adversary từ
approach vuông góc vượt đèn đỏ `id=122`, hai quỹ đạo cắt nhau quanh
CARLA `(258, -169)`.

Hai bản hiệu chuẩn cùng làn `sc_044`/`sc_045` bị từ chối vì có vượt đèn đỏ nhưng
không tạo xung đột với ego. Hai bản cuối dùng đúng giao cắt:

| Scenario | Actor | Qua đèn đỏ | Chạm ego | Khe hở nhỏ nhất | Người xem |
|---|---|---:|---:|---:|---|
| `sc_046` | car | 3,983 s | 5,361 s | 0,000 m | đúng |
| `sc_047` | truck | 4,140 s | 5,451 s | 0,000 m | đúng |

Worker theo dõi trạng thái đèn của adversary và chỉ ghi
`adversary_ran_red_light=true` khi xe qua vạch lúc đèn vẫn đỏ; chờ tới xanh rồi
đi không được chấm là vượt đèn đỏ. Không dùng `RunningRedLightTest` mặc định của
ScenarioRunner vì criterion đó gắn vào ego, trong khi maneuver thuộc adversary.
Cả hai bản cuối đã được người xem xác nhận và duyệt vào thư viện.

## 8. Đối chiếu nhãn người

Sau khi ghi thêm xác nhận cho hai `run_red_light`, behavior checker khớp người
chấm **10/13 = 76,92%**. Ba bất đồng còn lại là dữ liệu cần điều tra, không bị che:

- `sc_018`: người đúng, máy sai.
- `sc_023`: người đúng, máy sai sau khi sửa biểu diễn thời tiết.
- `sc_024`: người sai, máy đúng; người thấy xe mới gần vạch, chưa lấn đủ.

Nhãn `unsure` không vào mẫu số. Phán quyết máy không được gửi trước cho người
chấm để tránh bias.

## 9. Giới hạn và việc tiếp theo

1. Mở rộng nhãn người trên từng maneuver, không chỉ các case lỗi đã biết.
2. Tổng hợp cost/request và p50/p95 latency; log hiện mới ở cấp lần gọi.
3. Backend cần enforce token/role cho review, không chỉ phân vai trên frontend.
4. Closed-loop với mô hình lái chưa có; ego hiện là điều kiện đối chứng giữ tốc
   độ cố định.
5. Chỉ mở thêm maneuver/road type khi đã đo hình học và chạy thật trên anchor
   tương ứng; hiện anchor đô thị chỉ cam kết cho `run_red_light`.

## 10. Cách tái tạo snapshot

```bash
curl http://127.0.0.1:8000/api/v1/metrics/quality
curl http://127.0.0.1:8000/api/v1/metrics/intent-agreement
curl http://127.0.0.1:8000/api/v1/library/audit
bash scripts/pre_push_check.sh
```
