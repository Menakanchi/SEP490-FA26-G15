"""Node sửa lỗi ScenarioDraft bằng LLM."""

from __future__ import annotations

from typing import Any

from src.agents.routing import issues_for_repair_prompt
from src.models.schemas import REPAIRABLE_CODES, ScenarioDraft, ValidationIssue

# Danh sách mã lỗi trong prompt **sinh từ enum**, không gõ tay.
#
# Bản đầu liệt kê 13 mã bằng văn xuôi. Lúc viết thì khớp, nhưng
# ``REPAIRABLE_CODES`` là thứ sẽ đổi — thêm một mã sửa được mà quên sửa prompt
# thì model không biết mình được phép sửa nó, và vòng repair lặng lẽ bỏ qua một
# loại lỗi. Không có test nào bắt được kiểu lệch đó, nên sinh từ nguồn.
_REPAIRABLE_LIST = "\n".join(f"- {code.value}" for code in sorted(REPAIRABLE_CODES, key=lambda c: c.value))

SYSTEM_PROMPT = f"""# System Prompt: Repair Draft Generator

## VAI TRÒ
Bạn là chuyên gia sửa lỗi ScenarioDraft cho xe tự hành.

## NHIỆM VỤ
Sửa lỗi trong ScenarioDraft dựa trên danh sách ValidationIssue.

## INPUT
- draft: ScenarioDraft hiện tại (bị lỗi)
- issues: Danh sách các lỗi cần sửa

## CÁC LỖI CÓ THỂ SỬA (REPAIRABLE_CODES)
{_REPAIRABLE_LIST}

## RÀNG BUỘC BẮT BUỘC
1. **Chỉ sửa lỗi được liệt kê** - Không bịa thêm lỗi mới
2. **KHÔNG thay đổi phần nào không bị lỗi** - Giữ nguyên các trường hợp lệ
3. **Giữ nguyên ODDCell** - Không đổi odd.road_type, odd.weather, odd.actor_type, odd.maneuver
4. **Không tự cấp scenario_id** - Backend sẽ cấp khi promote
5. **Dùng suggestion** - Đây là đầu vào chính, không phải message_vi
6. **Sửa cho HẾT điều kiện của lỗi** - Nhiều lỗi hình học có hai vế; sửa một vế
   thì validate vẫn đỏ và tốn thêm một vòng. Xem ví dụ 1.

## VÍ DỤ MINH HỌA

### Ví dụ 1: GEOM_NO_CATCHUP — lỗi có HAI điều kiện
Muốn tạt đầu thì chủ thể phải **vừa xuất phát sau ego, vừa chạy nhanh hơn ego**.
Thiếu một trong hai thì khoảng cách không bao giờ khép lại.

**Draft bị lỗi:**
- ego: initial_speed_kmh 60.0
- adv: s_offset_m 20.0 (phía TRƯỚC ego), initial_speed_kmh 50.0 (CHẬM hơn ego)

**Draft đã sửa — đổi CẢ HAI:**
- adv: s_offset_m -25.0 (phía sau ego), initial_speed_kmh 80.0 (nhanh hơn ego)

Chỉ đổi s_offset_m thành âm mà để nguyên tốc độ chậm hơn ego là **chưa sửa xong**.

### Ví dụ 2: TRIGGER_AFTER_END
**Draft bị lỗi:**
- trigger.value: 50.0, duration_s: 30.0

**Draft đã sửa:**
- trigger.value: 5.0 (phải NHỎ HƠN duration_s, không phải bằng)

## OUTPUT
Trả về JSON theo format ScenarioDraft đã sửa.
"""


class NothingToRepairError(RuntimeError):
    """Không còn lỗi nào hợp lệ để gửi cho LLM sau khi lọc."""


def repair_draft(
    draft: ScenarioDraft,
    issues: list[ValidationIssue],
) -> ScenarioDraft:
    """Sửa ``draft`` theo ``issues``, trả về bản đã sửa.

    Hàm **tự lọc lại** ``issues`` qua ``issues_for_repair_prompt`` thay vì tin
    người gọi đã lọc. Không phải vì routing sai — ``route_after_validate`` chặn
    đúng — mà vì đây là chỗ tiền thật đi ra: một warning hay một
    ``GUARDRAIL_VIOLATION`` lọt vào prompt là một vòng LLM trả phí để bảo model
    sửa thứ không sửa được. Lọc hai lần rẻ hơn tin một lần.

    Ném ``NothingToRepairError`` nếu sau khi lọc không còn gì: gọi LLM với danh
    sách lỗi rỗng vừa tốn tiền vừa mời nó tự bịa ra thay đổi.
    """
    from src.services.llm import call_with_escalation

    repairable = issues_for_repair_prompt(issues)
    if not repairable:
        raise NothingToRepairError(f"{len(issues)} issue nhưng không cái nào vừa là error vừa sửa được bằng LLM")

    messages = _create_messages(draft, repairable)
    result = call_with_escalation(messages, ScenarioDraft)

    # `call_with_escalation` khai trả `BaseModel`. Thu hẹp lại ở đây, nếu không
    # lỗi sẽ nổ ở tận node sau với thông báo chẳng liên quan gì tới repair.
    if not isinstance(result, ScenarioDraft):
        raise TypeError(f"repair_draft cần ScenarioDraft, LLM trả về {type(result).__name__}")
    return result


def _create_messages(
    draft: ScenarioDraft,
    issues: list[ValidationIssue],
) -> list[dict[str, Any]]:
    """Dựng cặp message system + user gửi cho LLM."""
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _build_user_content(draft, issues)},
    ]


def _build_user_content(
    draft: ScenarioDraft,
    issues: list[ValidationIssue],
) -> str:
    """Draft hỏng + danh sách lỗi, dưới dạng model đọc được.

    Cả bốn trường của ``ValidationIssue`` đều đi vào đây, và ``suggestion`` là
    trường quan trọng nhất — ``validate_node`` viết sẵn nó cho đúng việc này,
    nên đừng diễn giải lại bằng lời khác.
    """
    lines = [
        "# INPUT",
        "",
        "## Draft hiện tại (có lỗi):",
        "```json",
        draft.model_dump_json(indent=2),
        "```",
        "",
        "## Các lỗi cần sửa:",
    ]

    for i, issue in enumerate(issues, 1):
        lines.append(f"### Lỗi {i}: {issue.code.value}")
        lines.append(f"- path: {issue.path}")
        lines.append(f"- message: {issue.message_vi}")
        lines.append(f"- suggestion: {issue.suggestion}")
        lines.append("")

    lines.extend(
        [
            "# YÊU CẦU",
            "Sửa các lỗi trên và trả về ScenarioDraft đã sửa.",
        ]
    )

    return "\n".join(lines)
