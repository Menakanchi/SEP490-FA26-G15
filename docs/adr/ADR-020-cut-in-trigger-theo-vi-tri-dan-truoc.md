# ADR-020: Cut-in kích hoạt theo vị trí dẫn trước, không theo thời gian suy từ tốc độ lệnh

**Ngày:** 2026-08-24

**Trạng thái:** Accepted 2026-08-24

**Liên quan:** [ADR-001](ADR-001-carla-worker-tach-khoi-backend.md), [ADR-012](ADR-012-converter-dung-relativelaneposition.md)

## Bối cảnh

`cut_in` từng dùng `simulation_time`: lấy vị trí và tốc độ ban đầu trong spec để
tính giây actor đã vượt ego rồi mới tạt. Giả định đó sai vì tốc độ trong spec là
lệnh điều khiển, không phải tốc độ CARLA bảo đảm đạt được.

Ngày 23/08/2026, `sc_021` có tốc độ tiếp cận theo spec là 3,89 m/s nhưng đo thật
chỉ 2,68 m/s. Trigger 9,5 s vì thế bắn khi actor vẫn sau ego khoảng 2,4 m; actor
nhập làn phía sau rồi đâm đuôi. `sc_022` mắc cùng họ lỗi. `CollisionTest` vẫn có
thể báo va chạm, nên kết quả trông thành công dù sai ý định.

Ba chỗ cùng dựa trên giả định này: validator hình học, gợi ý repair và phép dò
tham số. Chỉ sửa converter không đủ.

## Các lựa chọn

1. Giữ `simulation_time`, hiệu chỉnh bằng tốc độ đo trung bình. Loại: hệ số phụ
   thuộc actor, map và trạng thái controller; sai số cũ chỉ được chuyển chỗ.
2. Dùng `distance_to_ego`. Loại: `RelativeDistanceCondition` là độ lớn không dấu,
   không phân biệt actor ở trước hay sau ego.
3. Thêm `lead_distance`, ánh xạ sang vị trí tương đối động neo vào ego.

## Quyết định

Chọn lựa chọn 3.

`TriggerCondition.type` có thêm `lead_distance`; `value` là số mét actor phải dẫn
trước ego. `cut_in` bắt buộc dùng loại này và giá trị tối thiểu 7 m (một thân xe
cộng biên an toàn). Các maneuver khác giữ `simulation_time` hoặc
`distance_to_ego` như trước.

Converter sinh:

```xml
<ByEntityCondition>
  <TriggeringEntities triggeringEntitiesRule="any">
    <EntityRef entityRef="adversary" />
  </TriggeringEntities>
  <EntityCondition>
    <ReachPositionCondition tolerance="2.5">
      <Position>
        <RelativeLanePosition entityRef="hero" dLane="..." ds="..." offset="0" />
      </Position>
    </ReachPositionCondition>
  </EntityCondition>
</ByEntityCondition>
```

ScenarioRunner 0.9.15 phân giải `RelativeLanePosition` mỗi tick, nên điểm đích di
chuyển cùng `hero`. `ReachPositionCondition` dùng bán kính 2,5 m; converter bù
dung sai theo hướng actor tiếp cận để biên hình cầu ứng với đúng `value`. Với ca
vượt từ phía sau như `sc_021/sc_022`, `ds = value + 2,5`.

Validator không còn phát `GEOM_CUTIN_BEFORE_OVERTAKE` từ phép tính thời gian.
Thay vào đó nó báo loại trigger không theo vị trí hoặc khoảng dẫn trước dưới 7 m.
Tuning của `cut_in` dò trực tiếp các giá trị 7–10 m; không gọi
`time_until_alongside` cho maneuver này.

## Lý do

- Điều kiện kiểm đúng đại lượng cần bảo đảm: vị trí thật, không phải thời gian đại
  diện cho vị trí.
- Spec vẫn độc lập CARLA và độc lập map: nó chỉ nói “dẫn trước N mét”; lane id,
  dấu lane và XML nằm ở converter theo ADR-001/ADR-012.
- Actor không bao giờ vượt đủ thì trigger không bắn. Đây là kết quả ngữ nghĩa
  đúng và được tầng intent chấm “chưa vào làn ego”, thay vì dựng nhầm một cú đâm
  đuôi rồi coi là adversarial.

## Hệ quả

- Prompt generate/repair phải dạy `lead_distance` cho `cut_in`.
- Spec `cut_in` cũ cần dựng lại `.xosc`; không được chỉ thay XML mà để JSON nói
  `simulation_time`.
- Khoá gần-trùng phải so `trigger.type` trước `value`, vì `lead_distance` dùng mét
  giống `distance_to_ego` nhưng có ngữ nghĩa có hướng khác.
- Chỉ số nghiệm thu là `adversary_entry_longitudinal_m > 0` và không có
  `contact_longitudinal_m < 0`; `GLOBAL RESULT` không dùng để kết luận.
