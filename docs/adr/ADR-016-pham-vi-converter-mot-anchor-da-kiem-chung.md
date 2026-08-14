# ADR-016: Phạm vi converter bằng đúng số anchor đã smoke-test — `DEFAULT_SUPPORT_POLICY` từ 560 xuống 76 ô

**Ngày:** 2026-08-14
**Trạng thái:** Proposed — chốt cùng PR #35 (`convert_xosc`)

## Bối cảnh

`SupportPolicy` tồn tại từ đầu nhưng `unsupported` để rỗng, kèm ghi chú trong docstring:

> ⚠ Nội dung thật của mask do Tuấn Anh chốt **cuối W3**, sau khi viết `converter.py` — PRD §10, *"danh sách maneuver/map thực sự được converter hỗ trợ"*.

Converter giờ đã tồn tại, nên đây là lúc điền. Vấn đề là điền theo cái gì.

`ODDCell` có 5 × 4 × 4 × 7 = **560** tổ hợp enum. Nhưng converter không sinh `.xosc` từ không khí — nó cần một **anchor**: toạ độ spawn ego có thật trên một map có thật, đã chạy được qua ScenarioRunner. `templates.py` hiện có đúng **một**:

```python
# ADR-012 smoke-tested anchor: Town04 road=41, lane=-3
_TOWN04_ANCHOR = EgoSpawn(x=-510.7297, y=-177.5400, z=0.3000, h=-1.577036, lane_id=-3)
TEMPLATE_CATALOG = {RoadType.HIGHWAY: ScenarioTemplate(map_name="Town04", ...)}
```

Bốn `RoadType` còn lại — `intersection`, `urban_straight`, `residential_narrow`, `roundabout` — **không có anchor nào**. Không phải "chưa tối ưu", mà là converter sẽ không có toạ độ để ghi vào `WorldPosition`.

Câu hỏi của ADR này: mẫu số 560 kia có ý nghĩa gì khi 484 ô trong đó không thể sinh ra file?

## Vấn đề

Mẫu số sai không chỉ làm xấu một con số trên slide. Nó hỏng ba chỗ:

**1. `ODD coverage` tự thổi phồng theo chiều ngược.** Mẫu số 560 làm coverage trông *thấp* hơn thực tế — nhưng tệ hơn là nó mô tả sai bài toán. Nói "phủ 30/560" ngụ ý còn 530 ô đang chờ được phủ. Sự thật là 484 trong số đó **không phủ được bằng code hiện có**, và không lượng prompt engineering nào thay đổi điều đó.

**2. Người dùng nhận lỗi ở sai chỗ.** `parse_intent` nhận câu *"ô tô vượt đèn đỏ ở ngã tư"*, `SupportPolicy` nói hỗ trợ, `generate_draft` gọi LLM sinh draft, `validate` cho qua, rồi `convert_xosc` mới ném `TEMPLATE_CATALOG_INCONSISTENT` — một lỗi **terminal, không repairable**. Người dùng đợi hết vòng, tốn một lượt LLM, để nhận về "hệ thống lỗi". Đúng thứ mà `UNSUPPORTED_COMBINATION` ở cửa vào sinh ra để tránh.

**3. `with_defaults()` điền mặc định vào ô không sinh được.** Câu không nói rõ loại đường sẽ được điền `urban_straight` theo thứ tự ưu tiên cũ — một ô không có template. Mặc định đưa thẳng người dùng vào ngõ cụt.

## Các lựa chọn

**A. Giữ `SupportPolicy()` rỗng, để converter tự ném lỗi.**
- Ưu: không đổi gì; mẫu số vẫn là con số enum "trung thực".
- Nhược: cả ba vấn đề trên còn nguyên. Đây là trạng thái hôm nay, và nó đã sai — chỉ chưa ai chạm vào vì converter mới có.

**B. Mask theo `RoadType`: loại 4 road không có template, giữ nguyên actor × maneuver.**
- Ưu: đơn giản, một dòng.
- Nhược: cho qua `(highway, pedestrian, cut_in)` — người đi bộ tạt đầu trên cao tốc. Converter có builder cho `cut_in` nên nó **sinh được file**, chỉ là file mô tả một tình huống vô nghĩa. Mask phải chặn được cả tổ hợp actor × maneuver, đúng như `supported_cells()` đã lường trước trong docstring.

**C. Mask = đúng những gì catalog kiểm chứng được, cả ba trục.** ← **chọn**
- Ưu: mẫu số bằng đúng số ô sinh ra được file có nghĩa. Lỗi rơi ở cửa vào dưới dạng `UNSUPPORTED_COMBINATION`, trước khi tốn một lượt LLM.
- Nhược: thu hẹp sản phẩm xuống **một** `RoadType`. Phải nói thẳng chuyện này ra thay vì để nó ẩn trong một mask.

## Quyết định

`DEFAULT_SUPPORT_POLICY` loại mọi tổ hợp trừ:

| Trục | Được hỗ trợ | Lý do |
|---|---|---|
| `road_type` | `highway` | anchor duy nhất đã smoke-test (ADR-012, Town04 road=41 lane=-3) |
| `actor_type` × `maneuver` | `{car, motorcycle, truck}` × 6 maneuver | ba loại xe dùng chung `_add_vehicle`, đã có blueprint CARLA |
| | `pedestrian` × `jaywalk` | `_add_pedestrian` + `AcquirePositionAction`; đây là maneuver duy nhất có nghĩa cho người đi bộ |
| `weather` | cả 4 | `_add_init` map đủ 4 sang `cloudState`/`Precipitation`/`Fog` |

**Mẫu số = (6 × 3 + 1) × 4 = 76 ô.**

Tổ hợp bị loại rõ ràng: `pedestrian` với 6 maneuver xe (`cut_in`, `sudden_brake`, `run_red_light`, `wrong_way`, `lane_drift`, `stop_in_lane`), và `jaywalk` với 3 loại xe. Cả hai chiều đều vô nghĩa về mặt tình huống, không chỉ về mặt kỹ thuật.

Mask viết bằng `_HIGHWAY_ACTORS_BY_MANEUVER` — một dict `maneuver → set[actor]` — chứ không phải liệt kê 484 tuple bằng tay. Thêm một `ManeuverType` mới mà quên khai báo sẽ ném `KeyError` ngay lúc import, không im lặng rơi khỏi phạm vi.

## Ngưỡng đảo ngược

Mở rộng khi — và chỉ khi — có **anchor thứ hai đã chạy được qua ScenarioRunner**, tức đủ ba thứ:

1. Toạ độ `EgoSpawn` thật trên map đó, đo được chứ không phỏng đoán;
2. Một `.xosc` sinh từ template đó chạy hết trong CARLA 0.9.15 không lỗi;
3. Golden file kèm test XSD, cùng chuẩn với 7 file `fixtures/xosc/generated/` hiện có.

Lúc đó thêm entry vào `TEMPLATE_CATALOG`, mask tự nới theo, và **`eval/` phải đổi mẫu số trong cùng PR** — `test_default_support_policy_*` sẽ đỏ, và nó **nên** đỏ.

Không nới mask vì thấy con số 76 nhỏ. Con số nhỏ là thông tin đúng.

## Hệ quả

**`eval/`:** mẫu số `ODD coverage` là `DEFAULT_SUPPORT_POLICY.denominator()` = 76, không hard-code 560. Mọi báo cáo phải ghi rõ mẫu số bên cạnh tỉ lệ — "24/76" đọc được, "32%" thì không.

**`parse_intent`:** tổ hợp ngoài mask bị chặn ở cửa vào bằng `UNSUPPORTED_COMBINATION`, trả `422`, **không** gọi LLM. Đây là chỗ tiết kiệm thật: một câu về ngã tư giờ tốn 0 token thay vì một vòng generate + validate + convert.

**`with_defaults()`:** `road_type` mặc định đổi từ `urban_straight` sang `highway`, vì hàm này hỏi `SupportPolicy` trước — hành vi vốn đã được `test_default_road_type_asks_the_support_policy_first` khoá lại, chỉ là hôm nay policy rỗng nên nó rơi về ưu tiên cũ.

**Không đụng:** `ODDCell` vẫn có 560 tổ hợp enum, `test_odd_matrix_is_560_cells` giữ nguyên. Mask là **chính sách**, không phải kiểu dữ liệu — ADR này không thu hẹp enum, và không được thu hẹp, vì Phase 2–3 sẽ cần chúng khi có thêm anchor.

**Rủi ro chấp nhận, nói rõ để không ai tưởng đã xong:** demo chỉ chạy được kịch bản cao tốc. Câu *"xe máy vượt đèn đỏ ở ngã tư"* — một tình huống rất Việt Nam và rất dễ được hỏi khi trình bày — sẽ bị từ chối ở cửa vào. Đó là giá của việc không bịa toạ độ spawn cho một map chưa smoke-test, và là lý do §Ngưỡng đảo ngược ghi rõ ba điều kiện đo được thay vì "khi nào rảnh thì thêm".

**Liên quan:** [ADR-012](ADR-012-converter-dung-relativelaneposition.md) cung cấp anchor và ba bẫy converter. [ADR-010](ADR-010-vi-tri-tuong-doi-theo-lan-thay-vi-spawn-index.md) là lý do vị trí actor không cần anchor riêng — chỉ ego cần.
