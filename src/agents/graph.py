"""Workflow của Forge: **thứ tự cố định, do code quyết, không do model quyết.**

Đây là chỗ ``ARCHITECTURE.md`` §"Workflow 7 nodes" chỉ vào khi trả lời *"ai
quyết thứ tự bước?"*. Toàn bộ rẽ nhánh nằm ở ``routing.py`` — code thuần, test
được mà không cần mock LLM. Nếu một ngày logic đó chạy qua một model thì Forge
không còn là workflow nữa, và câu trả lời PLO1/PLO2 mất bằng chứng.

::

    parse_intent -> retrieve -> generate_draft -> validate ->|-> promote -> convert_xosc -> persist -> END
                                                    ^        |
                                                    |        |-> repair_draft --+
                                                    +-------------------------- +
                                                             |
                                                             |-> END (failed)

**Vì sao các adapter ``_*`` nằm ở file này thay vì sửa chữ ký node gốc.**
``generate_draft_node(user_query, odd_cell, examples)`` và
``repair_draft(draft, issues)`` nhận tham số rời chứ không nhận ``ForgeState``.
Đổi chữ ký của chúng cho đồng bộ thì phải viết lại test của hai PR vừa merge
của hai người khác nhau — trả giá thật để đổi lấy sự gọn gàng trên giấy. Giữ
nguyên hàm thuần (dễ test, không phải dựng state) và bọc một lớp **không có
logic** ở đây thì graph vẫn chỉ thấy một giao diện duy nhất. ``_persist`` đã
theo đúng mẫu này từ trước.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from langgraph.graph import END, StateGraph

from src.agents.nodes.convert_xosc_node import convert_xosc_node
from src.agents.nodes.generate_draft import generate_draft_node
from src.agents.nodes.parse_intent import parse_intent_node
from src.agents.nodes.persist_node import persist_pending_review_node
from src.agents.nodes.repair_draft import NothingToRepairError, repair_draft
from src.agents.nodes.retrieve import retrieve_node
from src.agents.nodes.validate_node import validate_node
from src.agents.routing import blocking_errors, route_after_validate
from src.agents.state import ForgeState
from src.models.schemas import (
    PROVEN_BAD_FOR_FEW_SHOT,
    IssueCode,
    ScenarioDraft,
    ScenarioSpec,
    ValidationIssue,
    VerificationLevel,
)
from src.services.persistence import ScenarioRepository

logger = logging.getLogger(__name__)

DEFAULT_RETRIEVE_LIMIT = 3
"""FR-03: *"trả tối đa ba examples"*."""


# ---------------------------------------------------------------------------
# Adapter: hàm thuần -> node của graph
# ---------------------------------------------------------------------------


def _llm_failure(exc: Exception, node: str) -> dict[str, Any]:
    """Lỗi hạ tầng LLM là lỗi hệ thống, **không** phải đầu vào cho repair.

    Gửi một lỗi provider vào vòng sửa nghĩa là trả tiền cho LLM để nó sửa một
    thứ không nằm trong draft. ``repairable_by_llm`` mặc định theo ``code``, và
    ``LLM_PROVIDER_ERROR`` không nằm trong ``REPAIRABLE_CODES``.
    """
    logger.warning("%s thất bại: %s", node, exc, exc_info=True)
    issue = ValidationIssue(
        code=IssueCode.LLM_PROVIDER_ERROR,
        path=f"/{node}",
        message_vi=f"Gọi mô hình AI thất bại ở bước {node}.",
        suggestion="Kiểm tra API key, hạn ngạch và kết nối mạng rồi thử lại.",
    )
    return {"issues": [issue], "failed_reason": str(exc) or type(exc).__name__}


def _retrieve(state: ForgeState) -> dict[str, Any]:
    return retrieve_node(state, k=state.get("limit") or DEFAULT_RETRIEVE_LIMIT)


def _few_shot_examples(state: ForgeState) -> list[ScenarioDraft]:
    """Kết quả retrieval -> few-shot draft.

    Retriever trả về tóm tắt (id, title, điểm tương đồng) chứ không trả spec đầy
    đủ, nên phải nạp lại spec rồi hạ về ``ScenarioDraft`` — bỏ ``scenario_id`` và
    ``description_vi`` vì hai trường đó là của backend, đưa vào few-shot là dạy
    model tự cấp id (nó sẽ trả lại đúng ``sc_001`` nó vừa nhìn thấy).

    Nạp hỏng thì bỏ qua ví dụ đó. Zero-shot vẫn sinh được; chết cả request chỉ
    vì một hàng thư viện lỗi thì không đáng.
    """
    from src.services import db

    examples: list[ScenarioDraft] = []
    for item in state.get("retrieved_examples") or []:
        scenario_id = item.get("id") if isinstance(item, dict) else None
        if not scenario_id:
            continue
        try:
            stored = db.get_scenario(scenario_id)
            spec = (stored or {}).get("spec") or {}

            # Không dạy lại thứ đã CHỨNG MINH là hỏng (ADR-017). Kịch bản chạy
            # xong mà không dựng được nguy hiểm nào là kịch bản không tái hiện
            # đúng câu mô tả nó; đưa vào few-shot là bảo model sinh thêm thứ
            # tương tự, rồi thứ đó lại được duyệt và thành ví dụ mới.
            #
            # Chỉ loại thứ *đã chứng minh*, không loại thứ *chưa chứng minh* —
            # `unverified` vẫn dùng, nếu không few-shot chết ngay vì mọi kịch
            # bản mới đều bắt đầu ở đó.
            level = VerificationLevel((stored or {}).get("verification") or VerificationLevel.UNVERIFIED)
            if level in PROVEN_BAD_FOR_FEW_SHOT:
                logger.debug("Bỏ qua few-shot %s: mức kiểm chứng %s", scenario_id, level.value)
                continue

            core = {k: v for k, v in spec.items() if k not in ("scenario_id", "description_vi")}
            examples.append(ScenarioDraft.model_validate(core))
        except Exception as exc:
            logger.debug("Bỏ qua few-shot %s: %s", scenario_id, exc)
    return examples


def _generate_draft(state: ForgeState) -> dict[str, Any]:
    odd_hints = state.get("odd_hints")
    if odd_hints is None:
        return _llm_failure(RuntimeError("thiếu odd_hints từ parse_intent"), "generate_draft")
    try:
        draft = generate_draft_node(
            user_query=state.get("user_query", ""),
            odd_cell=odd_hints,
            examples=_few_shot_examples(state) or None,
        )
    except Exception as exc:
        return _llm_failure(exc, "generate_draft")
    return {"draft": draft, "iteration": 0, "issues": []}


def _repair_draft(state: ForgeState) -> dict[str, Any]:
    """Một vòng sửa. Tăng ``iteration`` và dồn issue của vòng này vào lịch sử.

    ``iteration`` tăng ở **đây** chứ không ở ``validate``: nó đếm số lần *sửa*
    đã dùng, và chỉ chỗ này mới biết một lần sửa thật sự đã chạy. Đếm ở validate
    thì lượt validate đầu tiên — lượt chưa sửa gì — cũng ăn mất một suất.
    """
    issues = list(state.get("issues", []))
    history = list(state.get("issue_history", [])) + issues
    try:
        draft = repair_draft(state["draft"], issues)
    except NothingToRepairError as exc:
        # Routing lẽ ra đã chặn. Tới được đây nghĩa là hai bên hiểu khác nhau —
        # dừng hẳn thay vì lặp vô ích cho hết trần.
        logger.warning("repair_draft không có gì để sửa: %s", exc)
        return {"issue_history": history, "failed_reason": str(exc)}
    except Exception as exc:
        return {"issue_history": history, **_llm_failure(exc, "repair_draft")}
    return {
        "draft": draft,
        "iteration": state.get("iteration", 0) + 1,
        "issue_history": history,
        "issues": [],
    }


def _promote(state: ForgeState, next_scenario_id: Callable[[], str]) -> dict[str, Any]:
    """``ScenarioDraft`` -> ``ScenarioSpec``. Code thuần, chỉ cấp id và câu gốc.

    Đây là ranh giới ADR-005/§3 của ``schemas.py``: LLM sinh draft, **backend**
    cấp ``scenario_id`` và giữ nguyên văn câu người dùng gõ. Câu gốc phải nguyên
    văn vì nó là thứ ``intent_match`` đem ra đối chiếu.
    """
    try:
        spec = ScenarioSpec.promote(
            state["draft"],
            scenario_id=next_scenario_id(),
            description_vi=state.get("user_query", ""),
        )
    except Exception as exc:
        logger.warning("promote thất bại: %s", exc, exc_info=True)
        issue = ValidationIssue(
            code=IssueCode.CONVERTER_ERROR,
            path="/promote",
            message_vi=f"Không thể cấp id cho kịch bản: {exc}",
            suggestion="Lỗi hệ thống, không gửi vào vòng sửa của LLM.",
        )
        return {"issues": [issue], "failed_reason": str(exc)}
    return {"spec": spec}


def _default_scenario_id() -> str:
    from src.services import db

    return f"sc_{db.get_scenario_count() + 1:03d}"


# ---------------------------------------------------------------------------
# Rẽ nhánh
# ---------------------------------------------------------------------------


def _after_parse_intent(state: ForgeState) -> str:
    """Thiếu trục bắt buộc hoặc tổ hợp ngoài phạm vi -> dừng, đừng gọi LLM tiếp."""
    return END if blocking_errors(state.get("issues", [])) else "retrieve"


def _after_generate_draft(state: ForgeState) -> str:
    return END if blocking_errors(state.get("issues", [])) else "validate"


def _after_validate(state: ForgeState) -> str:
    """Uỷ nguyên cho ``routing.route_after_validate``. Không có nhánh nào ở đây."""
    decision = route_after_validate(state.get("issues", []), state.get("iteration", 0))
    return {"promote": "promote", "repair_draft": "repair_draft", "failed": END}[decision]


def _after_repair(state: ForgeState) -> str:
    """Repair hỏng thì dừng; sửa xong thì validate lại — đây là chỗ khép vòng lặp."""
    return END if state.get("failed_reason") else "validate"


def _after_promote(state: ForgeState) -> str:
    return END if blocking_errors(state.get("issues", [])) else "convert_xosc"


def _after_convert(state: ForgeState) -> str:
    return END if blocking_errors(state.get("issues", [])) else "persist_pending_review"


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------


def build_forge_graph(
    repository: ScenarioRepository | None = None,
    next_scenario_id: Callable[[], str] | None = None,
):
    """Dựng đủ 7 node. Hai tham số để test tiêm được, không phải để cấu hình."""
    scenario_id_provider = next_scenario_id or _default_scenario_id

    async def _persist(state: ForgeState) -> dict[str, Any]:
        return await persist_pending_review_node(state, repository)

    def _promote_node(state: ForgeState) -> dict[str, Any]:
        return _promote(state, scenario_id_provider)

    graph = StateGraph(ForgeState)
    graph.add_node("parse_intent", parse_intent_node)
    graph.add_node("retrieve", _retrieve)
    graph.add_node("generate_draft", _generate_draft)
    graph.add_node("validate", validate_node)
    graph.add_node("repair_draft", _repair_draft)
    graph.add_node("promote", _promote_node)
    graph.add_node("convert_xosc", convert_xosc_node)
    graph.add_node("persist_pending_review", _persist)

    graph.set_entry_point("parse_intent")
    graph.add_conditional_edges("parse_intent", _after_parse_intent, {"retrieve": "retrieve", END: END})
    graph.add_edge("retrieve", "generate_draft")
    graph.add_conditional_edges("generate_draft", _after_generate_draft, {"validate": "validate", END: END})
    graph.add_conditional_edges(
        "validate",
        _after_validate,
        {"promote": "promote", "repair_draft": "repair_draft", END: END},
    )
    graph.add_conditional_edges("repair_draft", _after_repair, {"validate": "validate", END: END})
    graph.add_conditional_edges("promote", _after_promote, {"convert_xosc": "convert_xosc", END: END})
    graph.add_conditional_edges(
        "convert_xosc",
        _after_convert,
        {"persist_pending_review": "persist_pending_review", END: END},
    )
    graph.add_edge("persist_pending_review", END)
    return graph.compile()


def build_persistence_tail(repository: ScenarioRepository | None = None):
    """Đoạn đuôi durable: convert -> persist -> END.

    Giữ lại vì ``test_persist_node`` dựng đúng đoạn này để kiểm bất biến
    "graph kết thúc ở ``pending_review``, không chờ người trong RAM" mà không
    phải chạy cả bốn node phía trước — trong đó có hai node gọi LLM.
    """

    async def _persist(state: ForgeState) -> dict[str, Any]:
        return await persist_pending_review_node(state, repository)

    graph = StateGraph(ForgeState)
    graph.add_node("convert_xosc", convert_xosc_node)
    graph.add_node("persist_pending_review", _persist)
    graph.set_entry_point("convert_xosc")
    graph.add_conditional_edges(
        "convert_xosc",
        _after_convert,
        {"persist_pending_review": "persist_pending_review", END: END},
    )
    graph.add_edge("persist_pending_review", END)
    return graph.compile()


forge_finalization_agent = build_persistence_tail()
"""Exported Forge graph segment; successful execution durably ends at pending_review."""
