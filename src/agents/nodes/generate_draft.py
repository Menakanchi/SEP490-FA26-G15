"""Node sinh ScenarioDraft từ câu tiếng Việt."""

from __future__ import annotations

import json
from typing import Any

from src.agents.prompts.generate_draft import SYSTEM_PROMPT
from src.models.schemas import ODDCell, ScenarioDraft


def generate_draft_node(
    user_query: str,
    odd_cell: ODDCell,
    examples: list[ScenarioDraft] | None = None,
    actor_hints: list[dict[str, Any]] | None = None,
    kinematic_hints: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Sinh ScenarioDraft từ câu tiếng Việt.

    Args:
        user_query: Câu tiếng Việt mô tả tình huống
        odd_cell: ODDCell đầy đủ 4 trục (từ parse_intent + with_defaults)
        examples: Danh sách ScenarioDraft làm few-shot examples (tối đa 3)
        actor_hints: Phương tiện và vai trò đọc trực tiếp từ câu gốc
        kinematic_hints: Tốc độ và quan hệ trước/sau đọc trực tiếp từ câu gốc

    Returns:
        JSON object theo shape của ScenarioDraft nhưng chưa chạy các invariant
        liên trường. ``validate_node`` chịu trách nhiệm dựng ScenarioDraft và
        chuyển lỗi ngữ nghĩa thành ValidationIssue để repair được.
    """
    # Import ở đây để tránh circular import
    from src.services.llm import call_with_escalation

    # Tạo messages cho LLM
    messages = _create_messages(user_query, odd_cell, examples, actor_hints, kinematic_hints)

    # Dùng JSON Schema thay vì class Pydantic. ``with_structured_output`` với
    # ScenarioDraft sẽ chạy model_validator ngay trong lời gọi LLM; nếu model
    # lỡ gán maneuver cho ego thì ValidationError nổ ở đây và raw JSON bị mất,
    # dù EGO_HAS_MANEUVER là lỗi repairable. JSON Schema vẫn giữ chặt shape và
    # kiểu trường, còn invariant liên trường được validate_node xử lý.
    result = call_with_escalation(messages, ScenarioDraft.model_json_schema(), operation="generate_draft")
    if isinstance(result, ScenarioDraft):
        # Giữ đường mock/test cũ tương thích; provider thật trả dict khi schema
        # truyền vào là JSON Schema.
        return result.model_dump(mode="json")
    if not isinstance(result, dict):
        raise TypeError(f"generate_draft cần JSON object, LLM trả về {type(result).__name__}")
    return result


def _create_messages(
    user_query: str,
    odd_cell: ODDCell,
    examples: list[ScenarioDraft] | None = None,
    actor_hints: list[dict[str, Any]] | None = None,
    kinematic_hints: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    Tạo messages cho LLM từ input.

    Args:
        user_query: Câu tiếng Việt gốc
        odd_cell: ODDCell đầy đủ 4 trục
        examples: Few-shot examples (tối đa 3)
        actor_hints: Phương tiện và vai trò đọc trực tiếp từ câu gốc
        kinematic_hints: Tốc độ và quan hệ trước/sau đọc trực tiếp từ câu gốc

    Returns:
        List of messages theo format LangChain
    """
    # System message
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # User message với input
    user_content = _build_user_content(user_query, odd_cell, examples, actor_hints, kinematic_hints)
    messages.append({"role": "user", "content": user_content})

    return messages


def _build_user_content(
    user_query: str,
    odd_cell: ODDCell,
    examples: list[ScenarioDraft] | None = None,
    actor_hints: list[dict[str, Any]] | None = None,
    kinematic_hints: dict[str, Any] | None = None,
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

    if kinematic_hints:
        content += f"""

## Động học được nói rõ trong câu:
{json.dumps(kinematic_hints, ensure_ascii=False)}

Đây là ràng buộc bắt buộc, không phải gợi ý. Giữ nguyên các tốc độ đã nêu;
`adversary_relative_position=ahead` nghĩa là `s_offset_m > 0`, còn `behind`
nghĩa là `s_offset_m < 0`.
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
