"""Chạy thông cả 7 node, LLM được mock.

Test ở đây trả lời đúng một câu: *"một câu tiếng Việt có ra được một scenario
``pending_review`` trong database không, và vòng sửa có dừng đúng không."*

LLM mock chứ không gọi thật, vì thứ đang kiểm là **thứ tự và rẽ nhánh** — phần
code thuần — chứ không phải chất lượng sinh của model. Đo chất lượng model là
việc của ``eval/``, và nó cần tiền.
"""

from __future__ import annotations

import sqlite3
from unittest.mock import patch

import pytest

from src.agents.graph import build_forge_graph
from src.agents.routing import MAX_REPAIR
from src.config import get_settings
from src.models.schemas import (
    ActorType,
    IssueCode,
    ManeuverType,
    RoadType,
    ScenarioDraft,
    ScenarioStatus,
    TimeOfDay,
    VerificationLevel,
    Weather,
)

# Câu này khớp hoàn toàn bằng rule-based (`taxonomy_rules.json`) nên `parse_intent`
# không gọi LLM — giữ test offline và nhanh. Tổ hợp (highway, motorcycle, cut_in)
# nằm trong phạm vi converter đã kiểm chứng của ADR-016.
USER_QUERY = "Xe máy tạt đầu ô tô trên đường cao tốc"


def _draft(*, s_offset_m: float, adv_speed: float) -> ScenarioDraft:
    """Draft cut_in trên cao tốc. Hai tham số là đúng hai vế của GEOM_NO_CATCHUP."""
    return ScenarioDraft.model_validate(
        {
            "title": "Xe máy tạt đầu trên cao tốc",
            "odd": {
                "road_type": RoadType.HIGHWAY,
                "weather": Weather.CLEAR,
                "actor_type": ActorType.MOTORCYCLE,
                "maneuver": ManeuverType.CUT_IN,
            },
            "time_of_day": TimeOfDay.DAY,
            "actors": [
                {
                    "name": "hero",
                    "category": "car",
                    "position": {"lane_offset": 0, "s_offset_m": 0.0},
                    "initial_speed_kmh": 60.0,
                    "is_ego": True,
                },
                {
                    "name": "adv",
                    "category": "motorcycle",
                    "position": {"lane_offset": -1, "s_offset_m": s_offset_m},
                    "initial_speed_kmh": adv_speed,
                    "is_ego": False,
                },
            ],
            "maneuvers": [
                {
                    "actor_name": "adv",
                    "maneuver": ManeuverType.CUT_IN,
                    "trigger": {"type": "simulation_time", "value": 7.0},
                    "target_speed_kmh": 40.0,
                }
            ],
            "duration_s": 30.0,
        }
    )


def good_draft() -> ScenarioDraft:
    """Xuất phát sau ego (-25m) và nhanh hơn ego (80 > 60) — validate cho qua."""
    return _draft(s_offset_m=-25.0, adv_speed=80.0)


def broken_draft() -> ScenarioDraft:
    """Đặt trước ego -> GEOM_NO_CATCHUP, sửa được bằng LLM."""
    return _draft(s_offset_m=20.0, adv_speed=80.0)


def _scenarios_in_db() -> list[sqlite3.Row]:
    path = get_settings().database_url.removeprefix("sqlite:///")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute("SELECT * FROM scenarios").fetchall()
    finally:
        conn.close()


async def _run(llm_returns: list[ScenarioDraft]):
    """Chạy graph với LLM trả về lần lượt các draft đã cho."""
    graph = build_forge_graph(next_scenario_id=lambda: "sc_001")
    with patch("src.services.llm.call_with_escalation", side_effect=llm_returns) as mock_llm:
        final = await graph.ainvoke({"user_query": USER_QUERY, "limit": 3})
    return final, mock_llm


# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_one_vietnamese_sentence_becomes_a_pending_scenario():
    """Đường hạnh phúc: câu tiếng Việt -> .xosc -> pending_review trong DB.

    Đây là bất biến của NFR-05: workflow **không** giữ trạng thái chờ người
    duyệt trong RAM. Chạy xong là dữ liệu đã nằm trên đĩa, kể cả khi process
    chết ngay sau đó.
    """
    final, mock_llm = await _run([good_draft()])

    assert mock_llm.call_count == 1, "draft đúng ngay thì không được gọi repair"
    assert final["scenario_status"] is ScenarioStatus.PENDING_REVIEW
    assert final["scenario_id"] == "sc_001"
    assert final["xosc_content"].startswith("<?xml")
    assert not final.get("failed_reason")

    rows = _scenarios_in_db()
    assert len(rows) == 1
    assert rows[0]["scenario_id"] == "sc_001"
    assert rows[0]["status"] == ScenarioStatus.PENDING_REVIEW.value
    # ADR-011: chưa duyệt thì chưa có vector, nên chưa tìm lại được.
    assert rows[0]["embedding"] is None
    # FR-01: câu gốc phải nguyên văn — `intent_match` đối chiếu với nó.
    assert rows[0]["description_vi"] == USER_QUERY


@pytest.mark.asyncio
async def test_broken_draft_goes_through_repair_and_then_succeeds():
    """Vòng sửa khép kín: validate -> repair -> validate lại -> đi tiếp."""
    final, mock_llm = await _run([broken_draft(), good_draft()])

    assert mock_llm.call_count == 2, "một lần sinh, một lần sửa"
    assert final["iteration"] == 1
    assert final["scenario_status"] is ScenarioStatus.PENDING_REVIEW

    # Lỗi của vòng đầu phải còn trong lịch sử, kể cả khi vòng sau đã sửa xong.
    # Failure analysis ở W5 đọc chính chỗ này.
    assert [i.code for i in final["issue_history"]] == [IssueCode.GEOM_NO_CATCHUP]
    assert len(_scenarios_in_db()) == 1


@pytest.mark.asyncio
async def test_repair_stops_at_the_cap_and_writes_nothing():
    """FR-06: trần 3 vòng là trần cứng.

    Không có trần thì một draft mà model không sửa nổi sẽ quay vòng vô hạn —
    mất tiền không giới hạn, và p95 latency không đặt trần được (NFR-08).

    Và quan trọng không kém: hỏng thì **không được** đẻ ra scenario giả trong
    thư viện (FR-14/PRD §8).
    """
    final, mock_llm = await _run([broken_draft()] * (MAX_REPAIR + 1))

    assert final["iteration"] == MAX_REPAIR
    # 1 lần sinh + đúng MAX_REPAIR lần sửa, không hơn.
    assert mock_llm.call_count == MAX_REPAIR + 1
    assert final.get("scenario_status") is None
    assert [i.code for i in final["issues"]] == [IssueCode.GEOM_NO_CATCHUP]
    assert _scenarios_in_db() == []


@pytest.mark.asyncio
async def test_unsupported_odd_stops_before_spending_anything():
    """Ngoài phạm vi converter -> dừng ở node 1, không gọi LLM lần nào.

    ADR-016 chốt phạm vi đã kiểm chứng chỉ có cao tốc. Sinh một kịch bản đô thị
    rồi để `convert_xosc` hỏng ở cuối luồng là trả tiền cho ba lần gọi model để
    biết một điều đã biết từ đầu.
    """
    graph = build_forge_graph(next_scenario_id=lambda: "sc_001")
    with patch("src.services.llm.call_with_escalation") as mock_llm:
        final = await graph.ainvoke({"user_query": "Đoàn xe đạp lấn làn trên đường đô thị"})

    mock_llm.assert_not_called()
    assert [i.code for i in final["issues"]] == [IssueCode.UNSUPPORTED_COMBINATION]
    assert _scenarios_in_db() == []


@pytest.mark.asyncio
async def test_llm_failure_is_not_sent_into_the_repair_loop():
    """Lỗi provider là lỗi hệ thống. Bảo model tự sửa lỗi mạng của chính nó là vô nghĩa."""
    graph = build_forge_graph(next_scenario_id=lambda: "sc_001")
    with patch("src.services.llm.call_with_escalation", side_effect=RuntimeError("rate limit")) as mock_llm:
        final = await graph.ainvoke({"user_query": USER_QUERY, "limit": 3})

    assert mock_llm.call_count == 1, "hỏng ở generate thì dừng, không vào vòng sửa"
    issue = final["issues"][0]
    assert issue.code is IssueCode.LLM_PROVIDER_ERROR
    assert issue.repairable_by_llm is False
    assert _scenarios_in_db() == []


@pytest.mark.asyncio
async def test_every_workflow_node_is_wired():
    """Đủ 7 node của ARCHITECTURE.md, cộng `promote` (code thuần, không gọi LLM)."""
    nodes = set(build_forge_graph().get_graph().nodes) - {"__start__", "__end__"}
    assert nodes == {
        "parse_intent",
        "retrieve",
        "generate_draft",
        "validate",
        "repair_draft",
        "promote",
        "convert_xosc",
        "persist_pending_review",
    }


# ---------------------------------------------------------------------------
# Few-shot lọc theo mức kiểm chứng (ADR-017)
# ---------------------------------------------------------------------------


def _library_row(scenario_id: str, verification: str) -> None:
    """Nhét thẳng một kịch bản đã duyệt vào thư viện, khỏi chạy cả workflow."""
    from src.services import db

    db.save_scenario(
        scenario_id=scenario_id,
        title=f"Mẫu {scenario_id}",
        description_vi="Xe máy tạt đầu ô tô trên cao tốc",
        spec=good_draft().model_dump(mode="json") | {"scenario_id": scenario_id, "description_vi": "x"},
        odd=good_draft().odd.model_dump(mode="json"),
        xosc_content="<OpenSCENARIO/>",
    )
    db.set_verification(scenario_id, VerificationLevel(verification))


@pytest.mark.parametrize(
    "level,expected",
    [
        ("adversarial", 1),
        ("unverified", 1),
        ("ran_no_hazard", 0),
        ("execution_failed", 0),
    ],
)
def test_few_shot_drops_only_what_is_proven_bad(level: str, expected: int):
    """Loại thứ **đã chứng minh** hỏng; giữ thứ **chưa chứng minh**.

    Đây là chỗ cắt vòng tự khẳng định: kịch bản chạy xong mà không dựng được
    nguy hiểm nào là kịch bản không tái hiện đúng câu mô tả nó — đưa vào few-shot
    là bảo model sinh thêm thứ tương tự, rồi thứ đó lại được duyệt và thành ví dụ
    mới, không ai phát hiện được từ bên trong.

    Nhưng loại cả ``unverified`` thì few-shot chết ngay: mọi kịch bản mới sinh
    đều bắt đầu ở đó, và phần lớn seed cũng chưa chạy được vì ngoài phạm vi
    converter. "Chưa chứng minh" khác hẳn "đã chứng minh là hỏng".
    """
    from src.agents.graph import _few_shot_examples

    _library_row("sc_501", level)
    state = {"retrieved_examples": [{"id": "sc_501"}]}

    assert len(_few_shot_examples(state)) == expected


def test_few_shot_drops_example_that_invents_generic_hero_for_multi_actor_prompt():
    from src.agents.graph import _few_shot_examples

    _library_row("sc_502", "unverified")
    state = {
        "retrieved_examples": [{"id": "sc_502"}],
        "actors": [
            {"category": "bus", "specific_type": "xe buýt"},
            {"category": "motorcycle", "specific_type": "xe máy"},
        ],
    }

    # Fixture sc_501/sc_502 có car + motorcycle; ``car`` không hề xuất hiện
    # trong câu bus + motorcycle nên không được dùng để dạy model.
    assert _few_shot_examples(state) == []
