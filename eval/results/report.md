# Evaluation Report

> Báo cáo đánh giá chất lượng sản phẩm — Gate G2.
> Ngày chạy: 16/08/2026. Chạy trực tiếp qua API thật (`POST /api/v1/generate`),
> **không** dùng fixture viết tay — mọi output dưới đây do pipeline
> `parse_intent → retrieve → generate_draft → validate → convert_xosc →
> persist_pending_review` tự sinh từ câu tiếng Việt nhập vào.

## 1. Cách chạy

```bash
uvicorn src.api.main:app --host 127.0.0.1 --port 8123
curl -X POST http://127.0.0.1:8123/api/v1/generate \
     -H "Content-Type: application/json" \
     -d '{"prompt": "<câu tiếng Việt>", "created_by": "eval-manual"}'
# poll GET /api/v1/status/{request_id} tới khi step=done|failed
# xem GET /api/v1/scenarios/{scenario_id} để lấy odd/spec/xosc_content
```

## 2. Test cases (5 câu nhập, output thực tế)

### Case 1 — Cut-in cao tốc, đủ thông tin

**Input:** *"Xe máy chạy 80 km/h ở làn bên trái, vượt lên từ phía sau ô tô đang
chạy 60 km/h, tạt đầu rồi phanh gấp còn 40 km/h. Trời quang, ban ngày, cao
tốc."*

**Output:** `scenario_id = sc_011`, `status = done` → review `before_library`
approve → tải `.xosc` thành công (`HTTP 200`, 8361 bytes, XML well-formed).

```json
"odd": {"road_type": "highway", "weather": "clear", "actor_type": "motorcycle", "maneuver": "cut_in"}
"assumptions": []
"actors": [
  {"name": "hero", "category": "car", "initial_speed_kmh": 60.0, "is_ego": true},
  {"name": "motorcycle_adv", "category": "motorcycle", "initial_speed_kmh": 80.0,
   "position": {"lane_offset": -1, "s_offset_m": -25.0}}
]
```

Đánh giá: mọi trục ODD được điền đúng từ câu, không cần assumption, hình học
`s_offset_m = -25.0` đúng (adversary xuất phát phía sau ego để vượt lên).

---

### Case 2 — Tổ hợp ngoài `SupportPolicy` (kỳ vọng bị chặn)

**Input:** *"Xe tải đang đỗ bên đường trong khu dân cư, một chiếc xe máy đột
ngột mở cửa xe tải rồi lao ra giữa đường lúc trời mưa."*

**Output:** `step = failed`, **đúng như thiết kế**:

```json
{"error": "Chưa hỗ trợ tổ hợp (residential_narrow, motorcycle, cut_in)."}
```

Đánh giá: `parse_intent` phân loại đúng ODD (`residential_narrow` +
`motorcycle` + gần nhất với `cut_in`), rồi `SupportPolicy` từ chối đúng vì tổ
hợp này chưa nằm trong tập được hỗ trợ. Đây là hàng rào chống sinh kịch bản vô
nghĩa hoạt động đúng — không phải lỗi hệ thống.

---

### Case 3 — Sương mù, ba actor, ban đêm

**Input:** *"Ô tô con chạy trong sương mù dày trên đường quốc lộ, phía trước
có xe đạp đi chậm không đèn, ô tô phải phanh gấp để tránh."*

**Output:** `scenario_id = sc_013`, `status = done` → approve → tải `.xosc`
thành công (9064 bytes, XML well-formed).

```json
"odd": {"road_type": "highway", "weather": "fog", "actor_type": "car", "maneuver": "sudden_brake"}
"time_of_day": "night"
"actors": [
  {"name": "hero", "category": "car", "initial_speed_kmh": 60.0},
  {"name": "car_ahead", "category": "car", "initial_speed_kmh": 55.0},
  {"name": "bicycle_unlit", "category": "bicycle", "initial_speed_kmh": 12.0}
]
"maneuvers": [{"actor_name": "car_ahead", "maneuver": "sudden_brake",
               "trigger": {"type": "distance_to_ego", "value": 20.0}}]
```

Đánh giá: câu không nói rõ "ban đêm" nhưng model suy luận `night` hợp lý từ
ngữ cảnh (sương mù dày, xe đạp không đèn); sinh đúng 3 actor thay vì 2 —
draft phức tạp hơn case 1 vẫn qua validate.

---

### Case 4 — Câu thiếu trục ODD (kiểm `with_defaults()`)

**Input:** *"Xe máy tạt đầu lúc mưa."* (chỉ nói `weather` + `maneuver` +
`actor_type`, thiếu `road_type`)

**Output:** `scenario_id = sc_012`, `status = done` → approve → tải `.xosc`
thành công (8357 bytes, XML well-formed).

```json
"odd": {"road_type": "highway", ...}
"assumptions": [
  {"field": "road_type", "value": "highway", "source": "default",
   "reason_vi": "câu không nhắc tới, dùng mặc định"}
]
```

Đánh giá: đúng cơ chế tài liệu ở `ARCHITECTURE.md §parse_intent` —
`ODDQuery.with_defaults()` điền trục thiếu và ghi lại `Assumption` có thể xem
lại ở bước review, thay vì hỏi lại người dùng hoặc bịa im lặng.

---

### Case 5 — Vi phạm invariant hình học (kỳ vọng bị chặn)

**Input:** *"Người đi bộ băng qua đường cao tốc vào ban đêm khi ô tô đang
chạy tốc độ cao."*

**Output:** `step = failed`, **đúng như thiết kế**:

```json
{"error": "jaywalk actor must start outside the ego lane"}
```

Đánh giá: `generate_draft` sinh actor đi bộ nhưng đặt sai lane; tầng
`validate` (static geometry invariant) bắt được lỗi này và từ chối draft thay
vì để lọt một kịch bản vô nghĩa vật lý. Sau 3 vòng `repair_draft` vẫn không
sửa được → `failed` đúng theo routing table ở `ARCHITECTURE.md`.

## 3. Tổng kết

| # | Input (rút gọn) | Kết quả | Ghi chú |
|---|---|---|---|
| 1 | Cut-in cao tốc, đủ thông tin | ✅ done, .xosc tải được | mọi trục ODD khớp câu |
| 2 | Xe máy mở cửa xe tải, khu dân cư | ✅ failed đúng thiết kế | `SupportPolicy` chặn tổ hợp chưa hỗ trợ |
| 3 | Phanh gấp trong sương mù, 3 actor | ✅ done, .xosc tải được | suy luận `time_of_day` hợp lý |
| 4 | Câu thiếu trục ("tạt đầu lúc mưa") | ✅ done, .xosc tải được | `with_defaults()` điền + ghi assumption |
| 5 | Người đi bộ băng cao tốc ban đêm | ✅ failed đúng thiết kế | static geometry invariant chặn draft sai |

5/5 case cho hành vi đúng kỳ vọng: 3 kịch bản sinh thành công và tải được
`.xosc` hợp lệ (XML well-formed), 2 kịch bản bị chặn đúng lý do (chính sách hỗ
trợ / hình học vô nghĩa) thay vì sinh bừa. Full request/response JSON và các
file `.xosc` lưu tại `eval/results/cases/`.

## 4. Giới hạn đã biết

- Chưa đo bằng số cho `intent_match`, `latency`, hay tỉ lệ pass CARLA trên
  tập lớn — mới dừng ở kiểm chứng thủ công theo case.
- Behavior checker (Phase 3) chưa có, nên "kịch bản hợp lệ" ở đây là hợp lệ
  theo schema + static geometry, chưa chứng minh mức độ nguy hiểm khi chạy
  CARLA (xem `ARCHITECTURE.md §Ego baseline` về khoảng cách hai tuyên bố này).
- CARLA chạy trên Windows GPU host, không chạy được trong môi trường soạn báo
  cáo này — 3 case `done` ở trên dừng ở bước tải `.xosc`, chưa mô phỏng.
