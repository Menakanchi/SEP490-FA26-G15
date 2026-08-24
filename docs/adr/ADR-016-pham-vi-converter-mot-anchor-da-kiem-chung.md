# ADR-016: Phạm vi converter bằng đúng các anchor đã đo — 72 ô hỗ trợ

**Ngày:** 2026-08-14
**Cập nhật:** 2026-08-24
**Trạng thái:** Accepted

## Bối cảnh

`ODDCell` có 5 × 4 × 4 × 7 = **560** tổ hợp enum. Converter không thể dựng mọi
tổ hợp chỉ từ nhãn ngữ nghĩa: mỗi loại đường và maneuver cần một anchor có toạ
độ, topology và hành vi đã chạy được trên CARLA/ScenarioRunner.

Bản đầu của quyết định chỉ có anchor highway Town04 và đặt mẫu số hỗ trợ là 76.
Đo thực tế sau đó cho thấy hai giả định trong 76 ô đó sai:

- `jaywalk` trên highway không hợp lý, và `AcquirePositionAction` định tuyến dọc
  đồ thị đường thay vì cắt ngang mặt đường;
- `run_red_light` không thể xảy ra ở anchor highway: đèn gần nhất cách 211,8 m,
  ngoài tầm tiến +40 m của đoạn lane ổn định.

Ngày 24/08 đã đo thêm một giao cắt đô thị trên cùng Town04. Ego đi theo đèn xanh
`id=118`; adversary đi từ approach vuông góc qua đèn đỏ `id=122`; hai quỹ đạo
cắt nhau quanh CARLA `(258, -169)`. Hai kịch bản cuối đã chạy, va chạm, được xem
trực tiếp và duyệt vào thư viện.

## Vấn đề

Mẫu số sai gây lỗi ở ba tầng:

1. Coverage mô tả những ô code không thể dựng, nên tỷ lệ không còn ý nghĩa.
2. Request ngoài hình học thật đi qua LLM và validate rồi mới chết ở converter,
   vừa tốn chi phí vừa trả lỗi ở sai chỗ.
3. Một template được gắn nhãn road type khác với topology thật tạo file hợp lệ
   nhưng tình huống sai — ví dụ xe “vượt đèn đỏ” chạy cùng làn ego.

## Quyết định

`DEFAULT_SUPPORT_POLICY` chỉ chứa các tổ hợp đã đo:

| Anchor | Road type | Maneuver | Actor | Weather | Số ô |
|---|---|---|---|---|---:|
| Town04 highway, road 23 lane -3 | `highway` | `cut_in`, `sudden_brake`, `wrong_way`, `lane_drift`, `stop_in_lane` | car, motorcycle, truck | 4 | 60 |
| Town04 giao cắt đèn 118/122 | `urban_straight` | `run_red_light` | car, motorcycle, truck | 4 | 12 |
| **Tổng** | | | | | **72** |

Mask được biểu diễn bằng `_SUPPORTED_ACTORS_BY_ROAD_MANEUVER`, tức khoá
`(road_type, maneuver) → set[actor]`. Không liệt kê thủ công 560 tuple và không
suy ra support chỉ từ việc enum có giá trị.

Với `run_red_light`, `Position(lane_offset=0, s_offset_m=0)` là khoá chọn
approach vuông góc đã đo, không phải spawn tương đối theo ego. Validator trả lỗi
repairable nếu LLM sinh giá trị khác; converter cũng kiểm lại trước khi phát
`WorldPosition` tường minh cho adversary.

Không dùng `RunningRedLightTest` mặc định của ScenarioRunner làm oracle vì nó
luôn gắn criterion vào ego. Worker theo dõi tín hiệu của adversary và chỉ ghi
`adversary_ran_red_light=true` khi actor qua vạch lúc đèn vẫn đỏ; chờ đèn xanh
rồi đi không được chấm đúng.

## Ngưỡng mở rộng

Một road type hoặc maneuver mới chỉ được thêm khi có đủ:

1. Toạ độ spawn và topology thật đã đo trên map;
2. tầm dọc, mặt cắt ngang hoặc approach giao cắt cần thiết;
3. `.xosc` do converter sinh chạy hết trên CARLA 0.9.15;
4. oracle đo đúng actor gây tình huống;
5. golden fixture, test converter/validator và cập nhật mẫu số eval trong cùng
   thay đổi.

Không mở rộng chỉ vì enum đã có hoặc vì muốn coverage nhìn lớn hơn.

## Hệ quả

- `SupportPolicy.denominator()` là **72**, còn enum đầy đủ vẫn là 560.
- Pairwise denominator khả thi là **74**, suy từ policy thay vì hard-code.
- Request `jaywalk` trên highway bị chặn trước LLM.
- `run_red_light` chỉ được nhận ở `urban_straight`; năm maneuver còn lại chỉ ở
  highway.
- Catalog có hai anchor hình học nhưng vẫn chỉ một map Town04. Đây chưa phải hỗ
  trợ đô thị tổng quát: anchor đô thị hiện chỉ cam kết cho `run_red_light`.

**Liên quan:** [ADR-010](ADR-010-vi-tri-tuong-doi-theo-lan-thay-vi-spawn-index.md),
[ADR-012](ADR-012-converter-dung-relativelaneposition.md).
