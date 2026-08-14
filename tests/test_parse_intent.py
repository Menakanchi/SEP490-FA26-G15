"""Unit tests cho Node 1 (parse_intent)."""

from unittest.mock import MagicMock, patch

import pytest

from src.agents.nodes.parse_intent import parse_intent_node
from src.models.schemas import (
    DEFAULT_SUPPORT_POLICY,
    ActorType,
    AssumptionSource,
    IssueCode,
    ManeuverType,
    ODDQuery,
    RoadType,
    SupportPolicy,
    Weather,
)


def _get_cat(val):
    if val is None:
        return None
    return getattr(val, "category", str(val.value if hasattr(val, "value") else val))


def test_parse_intent_short_or_numeric_prompt():
    """Prompt < 10 ký tự, < 3 từ hoặc chỉ chứa chữ số ném ValueError."""
    for invalid in ["", "   ", "0", "abc", "123", "a", "alo123", "oto"]:
        with pytest.raises(ValueError, match="quá ngắn"):
            parse_intent_node({"user_query": invalid})


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_happy_path(mock_get_llm):
    """Test Case 1: Đủ 4 trục ODD -> không có assumption, không có issue."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type=RoadType.HIGHWAY,
        weather=Weather.HEAVY_RAIN,
        actor_type=ActorType.MOTORCYCLE,
        maneuver=ManeuverType.CUT_IN,
        inferred=[],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "Xe máy tạt đầu ô tô trên đường cao tốc lúc mưa lớn"}
    result = parse_intent_node(state)

    assert result["odd_query"].road_type == RoadType.HIGHWAY
    assert result["odd_query"].weather == Weather.HEAVY_RAIN
    assert result["odd_query"].actor_type == ActorType.MOTORCYCLE
    assert result["odd_query"].maneuver == ManeuverType.CUT_IN
    assert result["odd_hints"].road_type == RoadType.HIGHWAY
    assert result["odd_hints"].weather == Weather.HEAVY_RAIN
    assert result["odd_hints"].actor_type == ActorType.MOTORCYCLE
    assert result["odd_hints"].maneuver == ManeuverType.CUT_IN
    assert result["odd_hints"].key == "highway|heavy_rain|motorcycle|cut_in"
    assert result["assumptions"] == []
    assert result["issues"] == []


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_partial_defaults(mock_get_llm):
    """Test Case 2: Thiếu 2 trục bối cảnh (chỉ có actor + maneuver) -> với defaults bổ sung urban_straight + clear (AssumptionSource.DEFAULT)."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type=None,
        weather=None,
        actor_type=ActorType.MOTORCYCLE,
        maneuver=ManeuverType.CUT_IN,
        inferred=[],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "Xe máy tạt đầu ô tô"}
    result = parse_intent_node(state)

    assert result["odd_hints"].actor_type == ActorType.MOTORCYCLE
    assert result["odd_hints"].maneuver == ManeuverType.CUT_IN
    assert result["odd_hints"].road_type == RoadType.URBAN_STRAIGHT
    assert result["odd_hints"].weather == Weather.CLEAR
    assert result["odd_hints"].key == "urban_straight|clear|motorcycle|cut_in"
    assert len(result["assumptions"]) == 2
    sources = {a.source for a in result["assumptions"]}
    assert AssumptionSource.DEFAULT.value in sources or AssumptionSource.DEFAULT in sources
    assert result["issues"] == []


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_missing_actor_type(mock_get_llm):
    """Test Case 3: Thiếu actor_type -> trả về NEED_MORE_DETAIL issue."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type=RoadType.HIGHWAY,
        weather=Weather.HEAVY_RAIN,
        actor_type=None,
        maneuver=ManeuverType.CUT_IN,
        inferred=[],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "Tình huống tạt đầu trên đường cao tốc lúc trời mưa"}
    result = parse_intent_node(state)

    assert "issues" in result
    assert len(result["issues"]) == 1
    assert result["issues"][0].code == IssueCode.NEED_MORE_DETAIL


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_missing_maneuver(mock_get_llm):
    """Test Case 4: Thiếu maneuver -> trả về NEED_MORE_DETAIL issue (KHÔNG tự điền lane_drift)."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type=RoadType.HIGHWAY,
        weather=Weather.RAIN,
        actor_type=ActorType.BUS,
        maneuver=None,
        inferred=[],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "Xe khách chạy trên đường cao tốc lúc trời mưa"}
    result = parse_intent_node(state)

    assert "issues" in result
    assert len(result["issues"]) == 1
    assert result["issues"][0].code == IssueCode.NEED_MORE_DETAIL


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_missing_both_required_axes(mock_get_llm):
    """Test Case 5: Thiếu cả 2 trục bắt buộc -> trả về NEED_MORE_DETAIL issue."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type=RoadType.HIGHWAY,
        weather=None,
        actor_type=None,
        maneuver=None,
        inferred=[],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "Tình huống nguy hiểm trên đường cao tốc"}
    result = parse_intent_node(state)

    assert "issues" in result
    assert len(result["issues"]) == 1
    assert result["issues"][0].code == IssueCode.NEED_MORE_DETAIL


@patch("src.agents.nodes.parse_intent.DEFAULT_SUPPORT_POLICY")
@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_unsupported_combination(mock_get_llm, mock_policy):
    """Test Case 6: Tổ hợp ODD bị SupportPolicy từ chối -> trả về UNSUPPORTED_COMBINATION issue."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type=RoadType.ROUNDABOUT,
        weather=None,
        actor_type=ActorType.PEDESTRIAN,
        maneuver=ManeuverType.RUN_RED_LIGHT,
        inferred=[],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query
    mock_policy.supports.return_value = False

    state = {"user_query": "Người đi bộ vượt đèn đỏ ở vòng xuyến"}
    result = parse_intent_node(state)

    assert "issues" in result
    assert len(result["issues"]) == 1
    assert result["issues"][0].code == IssueCode.UNSUPPORTED_COMBINATION


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_slang_free_description(mock_get_llm):
    """Test Case 7: Câu dùng từ lóng / tự do ('Đoàn xe đạp đi hàng ba') -> trích xuất hợp lệ."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type=RoadType.URBAN_STRAIGHT,
        weather=None,
        actor_type=ActorType.MOTORCYCLE,
        maneuver=ManeuverType.LANE_DRIFT,
        inferred=["actor_type"],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "Đoàn xe đạp đi hàng ba chiếm trọn làn ô tô"}
    result = parse_intent_node(state)

    assert result["issues"] == []
    assert result["odd_hints"].actor_type == ActorType.MOTORCYCLE
    assert result["odd_hints"].maneuver == ManeuverType.LANE_DRIFT


def test_parse_intent_multi_actor():
    """Test Case 8: Multi-actor ('Xe khách phanh gấp làm xe máy phía sau đâm vào')."""
    state = {"user_query": "Xe khách phanh gấp làm xe máy phía sau đâm vào"}
    result = parse_intent_node(state)

    assert result["issues"] == []
    assert result["odd_hints"].actor_type == ActorType.BUS
    assert result["odd_hints"].maneuver == ManeuverType.SUDDEN_BRAKE


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_llm_exception_handled(mock_get_llm):
    """Bắt ngoại lệ nếu gọi provider LLM thất bại."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm
    mock_structured_llm.invoke.side_effect = RuntimeError("OpenAI API rate limit")

    state = {"user_query": "phuong tien troi toi phong nhanh qua ma"}
    result = parse_intent_node(state)

    assert "issues" in result
    assert len(result["issues"]) == 1
    assert result["issues"][0].code == IssueCode.LLM_PROVIDER_ERROR

