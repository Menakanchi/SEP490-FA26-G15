# Evaluation Report — Scenario Forge

> Snapshot: 24/08/2026, lấy trực tiếp từ database phát triển qua
> `GET /api/v1/metrics/quality`. Không tính 10 scenario `seed-data` vào M1/M2.
> Mỗi scenario chỉ dùng lần chạy CARLA mới nhất để không tự bỏ phiếu nhiều lần.

## 1. Phạm vi đo

- Simulator: CARLA 0.9.15 + ScenarioRunner 0.9.15, Town04.
- Phạm vi converter: `highway`, 3 loại xe (`car`, `motorcycle`, `truck`),
  6 maneuver và 4 thời tiết = **72 ô hỗ trợ**.
- `jaywalk` không nằm trong phạm vi highway: tình huống không hợp lý trên anchor
  này và `AcquirePositionAction` định tuyến dọc làn thay vì băng ngang.
- Một execution `success=true` chỉ có nghĩa ScenarioRunner chạy hết. L4 mới trả
  lời hành vi có đúng ý định hay không.

## 2. Kết quả M1 — tính hợp lệ

| Mức | Định nghĩa | Kết quả |
|---|---|---:|
| L1 | Request sinh được draft qua schema và validate | **25/34 = 73,53%** |
| L2 | Scenario trong scope biên dịch được `.xosc` | **23/23 = 100%** |
| L3 | ScenarioRunner chạy hết, không crash/timeout | **22/24 = 91,67%** |
| L4 | Quỹ đạo CARLA tái hiện đúng maneuver | **13/22 = 59,09%** |

Hai lượt L3 chưa chấm được ở L4 được báo riêng, không tính thành sai. L4 hiện có
oracle cho `cut_in`, `lane_drift`, `sudden_brake`, `stop_in_lane` và
`wrong_way`; `run_red_light` còn thiếu tín hiệu đèn chuyên biệt.

## 3. Kết quả M2 — độ phủ ODD

| Cách đo | Kết quả |
|---|---:|
| Phủ toàn phần trong phạm vi converter | **10/72 = 13,89%** |
| Phủ theo cặp trục khả thi | **40/67 = 59,70%** |
| Ô có dữ liệu ở mọi scope | 13/560 |

Phủ toàn phần trả lời đã thử bao nhiêu tổ hợp hoàn chỉnh. Phủ theo cặp trả lời đã
thử bao nhiêu tương tác hai yếu tố; hai số không thay thế nhau.

## 4. Kết quả M3 — kích hoạt nguy hiểm

| Kết quả lần chạy mới nhất | Số lượng |
|---|---:|
| Có va chạm | 8 |
| Suýt va chạm, khe hở < 1 m | 7 |
| Không dựng được nguy hiểm | 7 |
| Tổng lượt chạy được | 22 |

Tỷ lệ kích hoạt nguy hiểm: **15/22 = 68,18%**. Collision riêng là
**8/22 = 36,36%**. `lane_drift` chủ đích dựng near-miss nên không thể chỉ dùng
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
anchor nên đã bị từ chối. Hai bản thay thế đặt ở +35 m. Lần chạy đầu phát hiện
một lỗi khác: teleport xoay xe đang chạy làm CARLA giữ vector quán tính cũ — xe
nhìn ngược đầu nhưng vẫn trôi theo hướng cũ.

Converter được sửa để đặt Orientation 180° ngay trong `Init`, trước SpeedAction.
Kết quả chạy lại:

| Scenario | Actor | Heading delta | Khe hở nhỏ nhất | Va chạm | L4 |
|---|---|---:|---:|---|---|
| `sc_038` | car | 180,0° | 0,416 m | không | đúng |
| `sc_039` | truck | 180,0° | 0,287 m | có | đúng |

## 7. Đối chiếu nhãn người

Sau khi ghi lại xác nhận cho bốn `cut_in`, behavior checker khớp người chấm
**6/9 = 66,67%**. Ba bất đồng còn lại là dữ liệu cần điều tra, không bị che:

- `sc_018`: người đúng, máy sai.
- `sc_023`: người đúng, máy sai sau khi sửa biểu diễn thời tiết.
- `sc_024`: người sai, máy đúng; người thấy xe mới gần vạch, chưa lấn đủ.

Nhãn `unsure` không vào mẫu số. Phán quyết máy không được gửi trước cho người
chấm để tránh bias.

## 8. Giới hạn và việc tiếp theo

1. Thêm oracle thực thi cho `run_red_light`.
2. Mở rộng nhãn người trên từng maneuver, không chỉ các case lỗi đã biết.
3. Tổng hợp cost/request và p50/p95 latency; log hiện mới ở cấp lần gọi.
4. Backend cần enforce token/role cho review, không chỉ phân vai trên frontend.
5. Closed-loop với mô hình lái chưa có; ego hiện là điều kiện đối chứng giữ tốc
   độ cố định.
6. Anchor thứ hai chỉ được thêm sau khi đo tầm dọc, mặt cắt ngang và chạy thật
   từng maneuver.

## 9. Cách tái tạo snapshot

```bash
curl http://127.0.0.1:8000/api/v1/metrics/quality
curl http://127.0.0.1:8000/api/v1/metrics/intent-agreement
curl http://127.0.0.1:8000/api/v1/library/audit
bash scripts/pre_push_check.sh
```
