"""Điều kiện rẽ nhánh của workflow. **Code thuần, không có LLM trong này.**

Đây là chỗ `ARCHITECTURE.md` §"Workflow 7 nodes" chỉ vào khi trả lời *"ai quyết
thứ tự bước?"* (lập luận đầy đủ sẽ nằm ở ADR-007). Nếu logic
ở file này chạy qua một model thì Forge không còn là workflow nữa, và câu trả
lời PLO1/PLO2 mất bằng chứng.

Tách khỏi ``graph.py`` để test được mà không phải dựng graph, không phải mock LLM.
"""

from __future__ import annotations

from typing import Literal

from src.models.schemas import IssueSeverity, ValidationIssue

MAX_REPAIR = 3
"""PRD FR-06: *"dừng sau tối đa ba vòng"*. Trần cứng, không phải gợi ý.

Là thứ làm cost và p95 latency **đặt trần được** (PRD NFR-08) — lập luận chính
khi chọn workflow thay vì ReAct. Đổi số này là đổi một con số trong bài nộp.
"""

AfterValidate = Literal["promote", "repair_draft", "failed"]


def blocking_errors(issues: list[ValidationIssue]) -> list[ValidationIssue]:
    """Chỉ ``severity == error``. Warning không tham gia routing, không vào repair prompt."""
    return [i for i in issues if i.severity is IssueSeverity.ERROR]


def route_after_validate(issues: list[ValidationIssue], iteration: int) -> AfterValidate:
    """``validate`` -> đi tiếp / sửa / dừng.

    Thứ tự bốn nhánh này quan trọng, đặc biệt nhánh thứ hai:

    1. Không còn error  -> ``promote``. Warning vẫn còn thì đi tiếp, reviewer
       xem ở cổng 1.
    2. Có **bất kỳ** error nào không sửa được -> ``failed`` **ngay**.
       Không phải "mọi error đều không sửa được mới dừng": một lỗi sửa được đi
       kèm một lỗi hệ thống thì sửa xong lỗi đầu, lỗi thứ hai vẫn nguyên đó.
       Gọi LLM lúc này là trả tiền cho một vòng chắc chắn thất bại.
    3. Hết ``MAX_REPAIR`` -> ``failed``, trả toàn bộ issue.
    4. Còn lại -> ``repair_draft``.
    """
    errors = blocking_errors(issues)
    if not errors:
        return "promote"
    if any(not e.repairable_by_llm for e in errors):
        return "failed"
    if iteration >= MAX_REPAIR:
        return "failed"
    return "repair_draft"


def issues_for_repair_prompt(issues: list[ValidationIssue]) -> list[ValidationIssue]:
    """Lọc thứ được phép đưa vào prompt sửa lỗi.

    Bỏ warning (suy đoán — bắt model sửa theo suy đoán là dạy nó sai) và bỏ mọi
    thứ không sửa được. Bốn trường của ``ValidationIssue`` đều an toàn để gửi;
    tuyệt đối không nối thêm stack trace hay câu SQL vào đây.
    """
    return [i for i in blocking_errors(issues) if i.repairable_by_llm]
