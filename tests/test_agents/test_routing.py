"""Điều kiện rẽ nhánh của workflow — test được mà không cần graph, không cần LLM.

`plan.md` §3 dùng chính chỗ này để trả lời *"ai quyết thứ tự bước?"*. Nếu file
được test ở đây mà có LLM trong đó thì câu trả lời PLO1/PLO2 mất bằng chứng.
"""

import pytest

from src.agents.routing import MAX_REPAIR, issues_for_repair_prompt, route_after_validate
from src.models.schemas import IssueCode, IssueSeverity, ValidationIssue


def issue(code: IssueCode) -> ValidationIssue:
    """Severity dẫn xuất từ code — không truyền vào được, và đó là chủ đích."""
    return ValidationIssue(code=code, message_vi="x")


REPAIRABLE = issue(IssueCode.GEOM_NO_CATCHUP)
SYSTEM = issue(IssueCode.CONVERTER_ERROR)
WARNING = issue(IssueCode.LANE_OFFSET_IMPLAUSIBLE)  # code này luôn là warning


def test_clean_run_goes_forward() -> None:
    assert route_after_validate([], iteration=0) == "promote"


def test_warning_alone_does_not_block() -> None:
    """Suy đoán không được chặn luồng — reviewer xem ở cổng 1, `ExecutionResult` chấm sau."""
    assert WARNING.severity is IssueSeverity.WARNING
    assert route_after_validate([WARNING], iteration=0) == "promote"


def test_repairable_error_goes_to_repair() -> None:
    assert route_after_validate([REPAIRABLE], iteration=0) == "repair_draft"


def test_one_system_error_stops_everything_even_beside_a_repairable_one() -> None:
    """Chỗ dễ viết sai nhất: phải là ``any(non-repairable)``, không phải ``all``.

    Sửa được lỗi hình học không làm bug converter biến mất. Route sang repair
    lúc này là trả tiền cho một vòng LLM chắc chắn thất bại, ba lần.
    """
    assert route_after_validate([REPAIRABLE, SYSTEM], iteration=0) == "failed"
    assert route_after_validate([SYSTEM], iteration=0) == "failed"


def test_guardrail_violation_never_reaches_the_model() -> None:
    """Lý do an toàn, không phải hiệu quả: repair là lượt thử thứ 2 và 3 cho attacker."""
    assert route_after_validate([issue(IssueCode.GUARDRAIL_VIOLATION)], iteration=0) == "failed"


@pytest.mark.parametrize("iteration", [MAX_REPAIR, MAX_REPAIR + 1])
def test_repair_budget_is_a_hard_cap(iteration: int) -> None:
    """Trần 3 vòng là thứ làm cost và p95 đặt trần được — lập luận chính của `plan.md` §3."""
    assert route_after_validate([REPAIRABLE], iteration=iteration) == "failed"


def test_last_allowed_repair_still_runs() -> None:
    assert route_after_validate([REPAIRABLE], iteration=MAX_REPAIR - 1) == "repair_draft"


def test_repair_prompt_gets_neither_warnings_nor_system_errors() -> None:
    """Đưa warning vào prompt là dạy model sửa theo suy đoán của ta."""
    assert issues_for_repair_prompt([REPAIRABLE, SYSTEM, WARNING]) == [REPAIRABLE]
