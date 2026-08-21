"""Node sửa lỗi ScenarioDraft bằng LLM."""

from __future__ import annotations

from typing import Any

from src.agents.prompts.repair_draft import SYSTEM_PROMPT
from src.agents.routing import MAX_REPAIR, issues_for_repair_prompt
from src.models.schemas import ScenarioDraft, ValidationIssue


class NothingToRepairError(RuntimeError):
    """Không còn lỗi nào hợp lệ để gửi cho LLM sau khi lọc."""


def repair_draft(
    draft: ScenarioDraft,
    issues: list[ValidationIssue],
    repair_round: int = 1,
) -> ScenarioDraft:
    """Sửa ``draft`` theo ``issues``, trả về bản đã sửa.

    Hàm **tự lọc lại** ``issues`` qua ``issues_for_repair_prompt`` thay vì tin
    người gọi đã lọc. Không phải vì routing sai — ``route_after_validate`` chặn
    đúng — mà vì đây là chỗ tiền thật đi ra: một warning hay một
    ``GUARDRAIL_VIOLATION`` lọt vào prompt là một vòng LLM trả phí để bảo model
    sửa thứ không sửa được. Lọc hai lần rẻ hơn tin một lần.

    Ném ``NothingToRepairError`` nếu sau khi lọc không còn gì: gọi LLM với danh
    sách lỗi rỗng vừa tốn tiền vừa mời nó tự bịa ra thay đổi.

    Args:
        draft: ScenarioDraft hiện tại (bị lỗi)
        issues: Danh sách các lỗi cần sửa
        repair_round: Vòng sửa hiện tại (1, 2, hoặc 3)
    """
    from src.services.llm import call_with_escalation

    repairable = issues_for_repair_prompt(issues)
    if not repairable:
        raise NothingToRepairError(f"{len(issues)} issue nhưng không cái nào vừa là error vừa sửa được bằng LLM")

    messages = _create_messages(draft, repairable, repair_round)
    result = call_with_escalation(messages, ScenarioDraft)

    # `call_with_escalation` khai trả `BaseModel`. Thu hẹp lại ở đây, nếu không
    # lỗi sẽ nổ ở tận node sau với thông báo chẳng liên quan gì tới repair.
    if not isinstance(result, ScenarioDraft):
        raise TypeError(f"repair_draft cần ScenarioDraft, LLM trả về {type(result).__name__}")
    return result


def _create_messages(
    draft: ScenarioDraft,
    issues: list[ValidationIssue],
    repair_round: int = 1,
) -> list[dict[str, Any]]:
    """Dựng cặp message system + user gửi cho LLM."""
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _build_user_content(draft, issues, repair_round)},
    ]


def _build_user_content(
    draft: ScenarioDraft,
    issues: list[ValidationIssue],
    repair_round: int = 1,
) -> str:
    """Draft hỏng + danh sách lỗi, dưới dạng model đọc được.

    Cả bốn trường của ``ValidationIssue`` đều đi vào đây, và ``suggestion`` là
    trường quan trọng nhất — ``validate_node`` viết sẵn nó cho đúng việc này,
    nên đừng diễn giải lại bằng lời khác.

    Args:
        draft: ScenarioDraft hiện tại
        issues: Danh sách lỗi cần sửa
        repair_round: Vòng sửa hiện tại (1, 2, hoặc 3)
    """
    lines = [
        "# INPUT",
        "",
        f"## Vòng sửa: {repair_round}/{MAX_REPAIR}",
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

    # Thêm cảnh báo ở vòng cuối
    if repair_round == MAX_REPAIR:
        lines.extend(
            [
                "⚠️ **ĐÂY LÀ VÒNG CUỐI.** Nếu không sửa được, draft sẽ bị reject.",
                "",
            ]
        )

    lines.extend(
        [
            "# YÊU CẦU",
            "Sửa các lỗi trên và trả về ScenarioDraft đã sửa.",
        ]
    )

    return "\n".join(lines)
