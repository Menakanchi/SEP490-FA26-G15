# ADR-012: Converter dùng thẳng `RelativeLanePosition`, không tự phân giải offset

**Ngày:** 2026-07-30
**Trạng thái:** **Accepted 2026-07-31** — smoke test đã chạy, xem *Kết quả kiểm chứng*
**Quan hệ:** thay một phần mục *Quyết định* của [ADR-010](ADR-010-vi-tri-tuong-doi-theo-lan-thay-vi-spawn-index.md). Trục biểu diễn (`lane_offset`, `s_offset_m`) của ADR-010 **giữ nguyên** — ADR này chỉ đổi *ai* phân giải nó.

## Bối cảnh

ADR-010 chốt vị trí trong `ScenarioSpec` là offset tương đối theo làn. Phần
*Quyết định* nói thêm cách hiện thực:

> Converter chọn một điểm xuất phát hợp lệ cho ego, rồi dùng API waypoint của
> bản đồ (`waypoint.next(d)`, `get_left_lane()`) để phân giải offset thành vị
> trí thật.

Câu đó mâu thuẫn với hai thứ đã chốt trước nó:

1. **ADR-001** — `src/` không bao giờ `import carla`, mà `converter.py` nằm
   trong `src/`. Chỉ hoà giải được qua một lane-graph cache
   (`scripts/cache_waypoints.py`) — thứ chưa ai bắt đầu và không có trong mốc nào.
2. **`plan.md` §1** — *"`validate` là điểm rẽ nhánh duy nhất"*. Nhưng mục *Hệ quả*
   của ADR-010 lại bắt converter *"trả lỗi rõ ràng để vòng repair sửa được"*, tức
   là biến converter thành điểm rẽ nhánh thứ hai.

Mâu thuẫn thứ hai không phải lỗi diễn đạt: nếu converter thật sự phải phân giải
offset thì nó **buộc** phải fail được, và câu §1 thành sai.

## Các lựa chọn

### Lựa chọn 1: giữ nguyên ADR-010 — converter phân giải bằng lane-graph cache
- Ưu: `.xosc` sinh ra chứa toạ độ tuyệt đối, không phụ thuộc ScenarioRunner phân giải đúng.
- Nhược: cần `scripts/cache_waypoints.py` (chưa có, chưa ai được giao thời gian);
  phải xử lý offset không phân giải được ⇒ thêm điểm rẽ nhánh ⇒ sửa `plan.md` §1;
  thêm một phụ thuộc chéo giữa hai người mà `plan.md` §6 cấm (*"không ai được chờ module khác"*).

### Lựa chọn 2: dùng `RelativeLanePosition` của OpenSCENARIO
- Ưu: **không phân giải gì cả.** `Position` map gần 1-1 sang phần tử có sẵn của
  chuẩn; ScenarioRunner phân giải lúc chạy bằng chính CARLA map. Converter thành
  hàm toàn phần ⇒ `plan.md` §1 đúng nguyên văn, không phải sửa. Bỏ được cả
  `cache_waypoints.py` lẫn `ResolvedScenario` khỏi MVP.
- Nhược: phụ thuộc ScenarioRunner phân giải đúng — **phải kiểm chứng**, không được
  suy luận. `dLane` trỏ ra ngoài số làn thật của đoạn đường là lỗi chỉ lộ lúc chạy.

### Lựa chọn 3: LLM sinh thẳng toạ độ tuyệt đối
- Ưu: —
- Nhược: đã bị ADR-010 loại. Không xem lại.

## Quyết định

**Lựa chọn 2**, với điều kiện dưới đây.

Fixture viết tay của chính đội đã dùng đúng cách này và tự ghi lại kết luận ở
đầu file (`fixtures/xosc/sample_001_cut_in.xosc`):

> Xe máy đặt theo vị trí TƯƠNG ĐỐI so với hero (`RelativeLanePosition`) nên nó
> tự đi theo. **KHÔNG cần sửa gì khác.**

Thứ duy nhất cần vị trí tuyệt đối là **ego**, vì ego không có gì để tham chiếu.
Đó là **một** `WorldPosition` cho mỗi template, không phải một đồ thị làn.

## Kết quả kiểm chứng (31/7)

Đã chạy thật, **không suy luận**:

```
CARLA 0.9.15 server   : Windows native, RTX 4060 8GB
ScenarioRunner        : v0.9.15
client                : WSL2 Ubuntu 24.04, Python 3.10.19, carla 0.9.15 (PyPI)
map                   : Town04, road=41 lane=-3 (4 làn cùng chiều)
VRAM                  : ~2.9 GB / 8.2 GB
```

**Cơ chế `RelativeLanePosition` hoạt động đúng và chính xác.** Đo lại vị trí thật
của xe máy so với ego:

```
lệch ngang  = -3.50 m   (TRÁI, đúng một làn)
lệch dọc    = -25.00 m  (PHÍA SAU, khớp ds=-25.0)
```

Converter **không cần** phân giải offset, **không cần** lane-graph cache,
**không cần** `import carla`. Quyết định ở trên đứng vững.

ScenarioRunner chạy trọn kịch bản và xuất JSON đúng hình dạng `ExecutionResult`
(`success`, `criteria[]` gồm CollisionTest / CheckDrivenDistance /
CheckMaximumVelocity / Duration) — tức là hợp đồng ở `plan.md` §4 khớp thực tế.

### Ba bẫy phải trả giá mới biết — converter BẮT BUỘC theo

Cả ba đều là chỗ ScenarioRunner **không** làm theo chuẩn OpenSCENARIO. Viết XML
đúng chuẩn thì hỏng; phải viết theo cách ScenarioRunner hiểu.

| # | Bẫy | Triệu chứng | Quy tắc cho converter |
|---|---|---|---|
| 1 | `dLane` là **số học thuần** trên `lane_id` (`target = ref_lane_id + dLane`), nên nghĩa trái/phải đảo theo dấu `lane_id` | xe đặt nhầm bên, không có lỗi nào báo | `dLane = lane_offset × sign(ego_lane_id)` |
| 2 | `RelativeTargetLane.value` = **số làn cần đổi có dấu** (>0 trái, <0 phải), `entityRef` **bị bỏ qua** | `value="0"` (đúng chuẩn: "vào làn ego") ⇒ `ZeroDivisionError` | value = số làn, dấu = hướng vật lý |
| 3 | `LaneChangeActionDynamics` phải là `dynamicsDimension="distance"` | `"time"` ⇒ `distance_lane_change=inf` ⇒ `waypoint.next(inf)` ⇒ **SEGFAULT trong libcarla** | luôn dùng `distance`, mét |
| 4 | **`WorldPosition` dùng hệ toạ độ NGƯỢC với Python API**: CARLA/UE4 thuận tay trái, OpenSCENARIO/OpenDRIVE thuận tay phải | Đo bằng client rồi chép thẳng vào XML ⇒ xe rơi cách **362 m**, ra giữa hồ Town04. Không lỗi nào báo | `xosc_y = -api_y` và `xosc_h = -api_yaw`. x, z giữ nguyên |

Bẫy #4 đã được xác nhận cả bằng đo đạc lẫn tài liệu CARLA:
*"CARLA internally uses a left-hand coordinate system (Unreal), but OpenSCENARIO
and OpenDRIVE are intended for right-hand coordinate system. Hence, the
coordinates need to be inverted."* Nó nguy hiểm vì **im lặng**: xe vẫn spawn
thành công, vẫn nằm trên một con đường nào đó, kịch bản vẫn `success=true`.

Đo trước/sau khi sửa dấu:

| | trước | sau |
|---|---|---|
| hero lệch khỏi điểm đích | 362 m | **6.5 m** |
| khoảng cách hero ↔ xe máy | ~200 m | **23.3 m** (đặt 25) |

Bẫy #3 nguy hiểm nhất: **segfault, không phải exception.** Server vẫn sống, client
chết câm không stack trace Python. Không có lần chạy thật này thì nó sẽ nổ ở W4
lúc converter đã viết xong và không ai biết nhìn vào đâu.

### Một phát hiện ngoài phạm vi ADR này

`CarlaUE4.exe -quality-level=Low` làm **server** sập trên Town04:

```
EXCEPTION_ACCESS_VIOLATION
FLandscapeRenderSystem::FGetSectionLODBiasesTask::AnyThreadTask()
```

Low quality bỏ tải vật liệu landscape trong khi tác vụ tính LOD vẫn trỏ vào nó.
**Không dùng `-quality-level=Low` với Town04.** Đây là cờ mà tài liệu CARLA và
`fixtures/README.md` đang khuyên dùng — phải sửa lại.

### Việc còn lại (không chặn ADR này)

Kịch bản chạy xong nhưng `couldn't perform the expected lane change` ở giây 7 ⇒
`success=true`, `CollisionTest=0` — đúng loại "chạy được nhưng vô dụng" mà
`fixtures/execution_results/sc_002` mô tả. Đây là **tinh chỉnh template cut_in**
(khoảng cách đổi làn, điểm spawn), thuộc việc converter, không phải câu hỏi của
ADR này.

## Hệ quả

- `ResolvedScenario` **không tồn tại**. Converter nhận đúng `ScenarioSpec`, một đầu vào.
- `scripts/cache_waypoints.py` và tool `map_waypoints` rơi khỏi phạm vi MVP.
- Thay bằng `src/services/scenario/templates.py` — catalog `ScenarioTemplate`
  gồm `map_name`, `road_type`, `supported_maneuvers`, `ego_spawn`.
  ⚠ **Không** đưa vào `src/models/schemas.py`: nó chứa `map_name`, khái niệm
  riêng của CARLA — để lọt vào hợp đồng chung là phá ADR-005.
- `supported_maneuvers` của catalog trở thành **mẫu số ODD coverage**
  (`SupportPolicy` trong `schemas.py`, `plan.md` §9) và trở thành cửa chặn
  `422 UNSUPPORTED_COMBINATION` **trước** khi tiêu một LLM call nào.
- Rủi ro còn lại — `dLane` vượt số làn thật — không bắt được bằng số học thuần.
  Xử bằng `LANE_OFFSET_IMPLAUSIBLE` ở mức **warning**, không chặn luồng, rồi đối
  chiếu với `ExecutionResult.success` thật ở W3. Có số rồi mới quyết có nâng lên
  chặn hay không. Heuristic mà chặn ngay thì mỗi lần nó đoán sai là ba vòng
  repair đốt vào việc sửa một kịch bản vốn đã đúng.
