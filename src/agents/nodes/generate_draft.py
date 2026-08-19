"""Node sinh ScenarioDraft từ câu tiếng Việt."""

from __future__ import annotations

import json
from typing import Any

from src.models.schemas import ODDCell, ScenarioDraft

# =============================================================================
# System Prompt cho generate_draft
# =============================================================================

SYSTEM_PROMPT = """# System Prompt: Scenario Draft Generator

## VAI TRÒ
Bạn là chuyên gia sinh tình huống giao thông nguy hiểm cho xe tự hành.
Bạn có kiến thức sâu về các tình huống giao thông Việt Nam.

---

## NHIỆM VỤ
Sinh ScenarioDraft từ mô tả tiếng Việt của người dùng.

**ScenarioDraft gồm:**
- title: tiêu đề ngắn gọn
- odd: 4 trục ODD (đã được xác định, KHÔNG thay đổi)
- actors: danh sách actors (tối thiểu 2)
- maneuvers: danh sách maneuvers (tối thiểu 1)
- time_of_day: thời điểm trong ngày
- duration_s: thời gian mô phỏng (0-120 giây)

---

## RÀNG BUỘC BẮT BUỘC

### Về Actors
1. **Đúng 1 actor có is_ego=True**
   - Ego = xe đang được TEST, không phải kẻ gây nguy hiểm

2. **Tối thiểu 2 actors**
   - 1 ego + ít nhất 1 adversary

3. **Tên actors không trùng nhau**

4. **odd.actor_type phải khớp với ít nhất 1 actor KHÔNG PHẢI EGO**
   - Ví dụ: odd.actor_type=motorcycle → phải có 1 actor có category=motorcycle

### Về Maneuvers
5. **Tối thiểu 1 maneuver**

6. **Ego KHÔNG mang maneuver**
   - Ego là xe bị test, không gây nguy hiểm
   - Tất cả maneuvers phải thuộc về các actor KHÔNG PHẢI EGO

7. **actor_name trỏ tới actor tồn tại**

8. **odd.maneuver phải khớp với ít nhất 1 maneuver thực tế**
   - Ví dụ: odd.maneuver=cut_in → phải có 1 maneuver có maneuver=cut_in

9. **Chỉ dùng 7 ManeuverTypes sau:**
   - cut_in: tạt đầu
   - sudden_brake: phanh gấp
   - run_red_light: vượt đèn đỏ
   - jaywalk: băng qua đường bất ngờ
   - wrong_way: đi ngược chiều
   - lane_drift: lấn làn từ từ
   - stop_in_lane: dừng giữa làn

### Về Ranh giới
10. **KHÔNG tự cấp scenario_id**
    - Backend sẽ cấp khi promote

11. **KHÔNG tự cấp description_vi**
    - Backend sẽ copy nguyên câu gốc

12. **KHÔNG đổi ODD labels người dùng đã nói**
    - Giữ nguyên odd.road_type, odd.weather, odd.actor_type, odd.maneuver

---

## VỀ VỊ TRÍ (Position)

### lane_offset
- -4 đến +4 làn
- 0 = làn của ego
- Âm = làn bên trái, Dương = làn bên phải

### s_offset_m
- Khoảng cách dọc so với ego (âm đến +200 mét)
- **ÂM = phía SAU ego**
- **DƯƠNG = phía TRƯỚC ego**

---

## MỐI QUAN HỆ s_offset_m VÀ MANEUVER

Dựa trên quan hệ chuyển động, mỗi maneuver có ràng buộc hình học riêng:

| Maneuver | s_offset_m | Cơ sở |
|----------|-------------|--------|
| **cut_in vượt lên** | ÂM (phía sau), nhanh hơn ego | Chủ thể đuổi kịp rồi tạt vào. |
| **cut_in nhập làn** | DƯƠNG (phía trước), chậm hơn ego | Xe từ lề/làn bên cạnh nhập vào đường đi của ego. |
| **sudden_brake** | DƯƠNG (phía trước) | sc_003: s_offset_m=+30. |

**QUAN TRỌNG:** Đặt sai s_offset_m sẽ dẫn đến:
- GEOM_NO_CATCHUP: khoảng cách giữa adversary và ego không thu hẹp trước khi cut-in

---

## VỀ TỐC ĐỘ
- initial_speed_kmh: 0 đến 150 km/h
- target_speed_kmh: 0 đến 150 km/h (nếu có)

---

## VỀ TRIGGER

### simulation_time
- Kích hoạt sau X giây
- **Trigger phải < duration_s**
  - Nếu trigger >= duration_s → hành vi không bao giờ chạy

### distance_to_ego
- Kích hoạt khi cách ego X mét

---

## VỀ THỜI GIAN
- duration_s: 0 đến 120 giây
- Default: 30 giây

---

## TIME OF DAY
- day: ban ngày
- dusk: hoàng hôn
- night: ban đêm

---

## VEHICLE CATEGORIES
- car, motorcycle, truck, bicycle, pedestrian

---

## VÍ DỤ MINH HỌA (Few-Shot)

### Ví dụ 1: cut_in (CÓ CƠ SỞ TỪ sc_001)
**Input:**
- Câu: "Xe máy chạy 80 km/h ở làn bên trái, vượt lên từ phía sau ô tô đang chạy 60 km/h, tạt đầu rồi phanh gấp còn 40 km/h. Trời quang, ban ngày, cao tốc."
- ODDCell: highway, clear, motorcycle, cut_in

**Output:**
```json
{
  "title": "Xe máy vượt lên tạt đầu trên cao tốc",
  "odd": {"road_type": "highway", "weather": "clear", "actor_type": "motorcycle", "maneuver": "cut_in"},
  "time_of_day": "day",
  "actors": [
    {"name": "hero", "category": "car", "position": {"lane_offset": 0, "s_offset_m": 0.0}, "initial_speed_kmh": 60.0, "is_ego": true},
    {"name": "adversary", "category": "motorcycle", "position": {"lane_offset": -1, "s_offset_m": -25.0}, "initial_speed_kmh": 80.0, "is_ego": false}
  ],
  "maneuvers": [
    {"actor_name": "adversary", "maneuver": "cut_in", "trigger": {"type": "simulation_time", "value": 7.0}, "target_speed_kmh": 40.0}
  ],
  "duration_s": 30.0
}
```

### Ví dụ 2: sudden_brake (CÓ CƠ SỞ TỪ sc_003)
**Input:**
- Câu: "Xe tải chạy trước phanh gấp đột ngột khi trời sương mù, ego chạy 50 km/h phía sau."
- ODDCell: urban_straight, fog, truck, sudden_brake

**Output:**
```json
{
  "title": "Xe tải phanh gấp trong sương mù trên đường đô thị",
  "odd": {"road_type": "urban_straight", "weather": "fog", "actor_type": "truck", "maneuver": "sudden_brake"},
  "time_of_day": "dusk",
  "actors": [
    {"name": "hero", "category": "car", "position": {"lane_offset": 0, "s_offset_m": 0.0}, "initial_speed_kmh": 50.0, "is_ego": true},
    {"name": "truck_ahead", "category": "truck", "position": {"lane_offset": 0, "s_offset_m": 30.0}, "initial_speed_kmh": 50.0, "is_ego": false}
  ],
  "maneuvers": [
    {"actor_name": "truck_ahead", "maneuver": "sudden_brake", "trigger": {"type": "simulation_time", "value": 5.0}, "target_speed_kmh": 0.0}
  ],
  "duration_s": 25.0
}
```

---

## LƯU Ý QUAN TRỌNG

1. **Giữ nguyên ODDCell** - Không thay đổi bất kỳ trường nào trong odd
2. **Chọn s_offset_m đúng** - cut_in vượt lên ở phía sau; nhập làn từ lề có thể ở phía trước
3. **Trigger phải < duration_s** - Nếu không hành vi không chạy
4. **Ego không mang maneuver** - Ego là nạn nhân
5. **Không tự cấp scenario_id và description_vi**

---

## OUTPUT
Luôn trả về JSON theo format ScenarioDraft.
"""


def generate_draft_node(
    user_query: str,
    odd_cell: ODDCell,
    examples: list[ScenarioDraft] | None = None,
    actor_hints: list[dict[str, Any]] | None = None,
) -> ScenarioDraft:
    """
    Sinh ScenarioDraft từ câu tiếng Việt.

    Args:
        user_query: Câu tiếng Việt mô tả tình huống
        odd_cell: ODDCell đầy đủ 4 trục (từ parse_intent + with_defaults)
        examples: Danh sách ScenarioDraft làm few-shot examples (tối đa 3)

    Returns:
        ScenarioDraft đã được validate bằng Pydantic
    """
    # Import ở đây để tránh circular import
    from src.services.llm import call_with_escalation

    # Tạo messages cho LLM
    messages = _create_messages(user_query, odd_cell, examples, actor_hints)

    # Gọi LLM với escalation
    result = call_with_escalation(messages, ScenarioDraft)

    return result


def _create_messages(
    user_query: str,
    odd_cell: ODDCell,
    examples: list[ScenarioDraft] | None = None,
    actor_hints: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """
    Tạo messages cho LLM từ input.

    Args:
        user_query: Câu tiếng Việt gốc
        odd_cell: ODDCell đầy đủ 4 trục
        examples: Few-shot examples (tối đa 3)

    Returns:
        List of messages theo format LangChain
    """
    # System message
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # User message với input
    user_content = _build_user_content(user_query, odd_cell, examples, actor_hints)
    messages.append({"role": "user", "content": user_content})

    return messages


def _build_user_content(
    user_query: str,
    odd_cell: ODDCell,
    examples: list[ScenarioDraft] | None = None,
    actor_hints: list[dict[str, Any]] | None = None,
) -> str:
    """
    Xây dựng nội dung user message.

    Args:
        user_query: Câu tiếng Việt gốc
        odd_cell: ODDCell đầy đủ 4 trục
        examples: Few-shot examples (tối đa 3)

    Returns:
        Nội dung user message
    """
    # Giới hạn examples tối đa 3
    if examples is None:
        examples = []
    examples = examples[:3]

    # Header với câu gốc và ODDCell
    content = f"""# INPUT

## Câu tiếng Việt:
{user_query}

## ODDCell:
- road_type: {odd_cell.road_type.value}
- weather: {odd_cell.weather.value}
- actor_type: {odd_cell.actor_type.value}
- maneuver: {odd_cell.maneuver.value}
"""

    if actor_hints:
        mentions = [
            {
                "category": actor.get("category"),
                "specific_type": actor.get("specific_type"),
                "role": actor.get("role"),
            }
            for actor in actor_hints
        ]
        content += f"""

## Phương tiện đã được nhận diện trong câu:
{json.dumps(mentions, ensure_ascii=False)}

Phải giữ các phương tiện này trong `actors`. Vai trò khác `unknown` đã có bằng
chứng trong câu và phải được giữ: `adversary` thực hiện hành vi nguy hiểm;
`ego` phải có tên `hero`, là phương tiện không kịp tránh/bị đe doạ. Với vai trò
`unknown`, tự suy từ toàn câu. Không tạo thêm ô tô chung chung làm hero khi câu
đã nêu rõ phương tiện bị đe doạ.
"""

    # Thêm examples nếu có
    if examples:
        content += "\n\n## Examples (để tham khảo format):"
        for i, ex in enumerate(examples, 1):
            content += f"\n\n### Example {i}:"
            content += f"\n```json\n{ex.model_dump_json(indent=2)}\n```"
    else:
        content += "\n\n(Không có examples - chạy zero-shot)"

    content += (
        "\n\n# YÊU CẦU\nSinh ScenarioDraft dựa trên câu và ODDCell ở trên. Trả về JSON theo format ScenarioDraft."
    )

    return content
