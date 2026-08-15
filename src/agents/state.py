from __future__ import annotations

from typing import TypedDict

from src.models.schemas import (
    Assumption,
    ODDCell,
    ODDQuery,
    ScenarioDraft,
    ScenarioSpec,
    ScenarioStatus,
    ValidationIssue,
)


class ForgeState(TypedDict, total=False):
    """State đi qua workflow graph. Mỗi node đọc vài khoá, ghi vài khoá.

    Ba tầng ``raw_text -> raw_draft -> draft`` là có chủ đích, không phải thừa.

    ``ScenarioDraft.model_validate()`` **ném** ``ValidationError`` khi model sinh
    sai — tức là đúng lúc ta gọi lỗi đó "sửa được bằng repair" thì lại không còn
    object nào để đưa cho repair sửa. Giữ nguyên liệu ở tầng dưới thì mới sửa được::

        hỏng ở json.loads      -> còn raw_text   -> KHÔNG repair (1 retry ở llm.py)
        hỏng ở model_validate  -> còn raw_draft  -> repair (SCHEMA_*)
        hỏng ở static_check    -> còn draft      -> repair (GEOM_*, ODD_*)

    Tầng 1 không repair vì nó không phải lỗi ngữ nghĩa: với structured output nó
    gần như phải bằng 0, và nếu khác 0 thì phải sửa cấu hình chứ không sửa prompt.
    """

    # -- vào ---------------------------------------------------------------
    user_query: str
    limit: int
    """Top-k cho ``retrieve``. Người dùng chọn ở FE; mặc định 3 (FR-03)."""

    # -- parse_intent (LLM) rồi with_defaults (code thuần) -----------------
    odd_query: ODDQuery
    """Chỉ trục người dùng nói ra. Đây là thứ ``retrieve`` lọc theo."""
    odd_hints: ODDCell
    """``odd_query.with_defaults()``. Đây là thứ ``generate_draft`` được thấy."""
    assumptions: list[Assumption]
    parsed_intent: dict
    """Bốn trục dạng dict, kèm nhãn mô tả thô. Dành cho FE và cho ``retrieve``."""
    actors: list[dict]
    """Dàn diễn viên ``parse_intent`` đọc ra được, kèm vai ego/adversary.

    Không nằm trong ``ODDQuery`` vì model đó mô tả bốn trục ODD, không mô tả
    dàn diễn viên. Phải khai ở đây: LangGraph chỉ giữ những khoá được khai
    trong schema, khoá lạ bị **bỏ im lặng** giữa hai node.
    """

    # -- retrieve (code) ---------------------------------------------------
    examples: list[ScenarioSpec]
    retrieved_examples: list[dict]
    """Kết quả thô của retriever (id, title, similarity_score...). Đây là thứ FE
    hiển thị; ``examples`` mới là spec đầy đủ dùng làm few-shot."""

    # -- generate_draft / repair_draft (LLM) -------------------------------
    raw_text: str
    raw_draft: dict
    draft: ScenarioDraft
    iteration: int
    """Số vòng repair đã dùng. Chỉ tăng khi repair **thật sự** chạy — retry vì lỗi
    provider không tính, nếu không thì một lần rate limit ăn mất một lượt sửa."""

    # -- validate (code) ---------------------------------------------------
    issues: list[ValidationIssue]

    # -- promote + convert + persist (code) --------------------------------
    spec: ScenarioSpec
    xosc_content: str
    scenario_id: str
    request_id: str
    validation_mode: str
    model_used: str
    node_metrics: dict
    tags: list[str]
    scenario_status: ScenarioStatus

    # -- kết ---------------------------------------------------------------
    issue_history: list[ValidationIssue]
    """Mọi issue của mọi vòng, kể cả vòng sau đó đã sửa xong.

    Không phải để debug: **failure analysis 20 case ở W5** cần dữ liệu tích luỹ
    từ W2. Không lưu từ bây giờ thì tới W5 không có gì để phân tích, và đó đúng
    là mục PLO7 dễ bị bỏ nhất khi hết giờ.
    """
    failed_reason: str


class AgentState(TypedDict, total=False):
    """Còn sót từ template — chỉ ``nodes/example_node.py`` và ``build_graph()``
    trong ``agents/graph.py`` còn dùng.

    Route ``/chat`` đã bỏ cùng ``ChatRequest``/``ChatResponse``. Xoá nốt khối
    này khi ``build_persistence_tail()`` nối xong đủ 7 node và graph mẫu không
    còn ai gọi.
    """

    query: str
    context: str
    analysis: str
    response: str
    error: str
    metadata: dict
