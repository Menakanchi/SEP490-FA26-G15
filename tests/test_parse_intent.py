"""Unit tests cho Node 1 (parse_intent)."""

from unittest.mock import MagicMock, patch

import pytest

from src.agents.nodes.parse_intent import parse_intent_node
from src.models.schemas import (
    ActorType,
    IssueCode,
    ManeuverType,
    ODDQuery,
    RoadType,
    Weather,
)


def _get_cat(val):
    return getattr(val, "category", str(val.value if hasattr(val, "value") else val))


def test_parse_intent_short_or_numeric_prompt():
    """Prompt < 10 ký tự, < 3 từ hoặc chỉ chứa chữ số ném ValueError."""
    for invalid in ["", "   ", "0", "abc", "123", "a", "alo123", "oto"]:
        with pytest.raises(ValueError, match="quá ngắn"):
            parse_intent_node({"user_query": invalid})


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_happy_path(mock_get_llm):
    """Happy path: Trích xuất đủ 4 trục ODD."""
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

    assert str(result["odd_query"].road_type) == "highway"
    assert str(result["odd_query"].weather) == "heavy_rain"
    assert _get_cat(result["odd_query"].actor_type) == "motorcycle"
    assert _get_cat(result["odd_query"].maneuver) == "cut_in"
    assert result["odd_hints"].road_type == RoadType.HIGHWAY
    assert result["odd_hints"].weather == Weather.HEAVY_RAIN
    assert result["odd_hints"].actor_type == ActorType.MOTORCYCLE
    assert result["odd_hints"].maneuver == ManeuverType.CUT_IN
    assert result["issues"] == []


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_partial_defaults(mock_get_llm):
    """Điền mặc định cho trục bối cảnh thiếu (road_type, weather) khi qua LLM Fallback."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type=None,
        weather=None,
        actor_type=ActorType.MOTORCYCLE,
        maneuver=ManeuverType.SUDDEN_BRAKE,
        inferred=["actor_type"],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "xe la phong nhanh qua ma"}
    result = parse_intent_node(state)

    assert _get_cat(result["odd_query"].actor_type) == "motorcycle"
    assert result["odd_hints"].actor_type == ActorType.MOTORCYCLE
    assert result["odd_hints"].maneuver == ManeuverType.SUDDEN_BRAKE
    assert result["odd_hints"].road_type == RoadType.URBAN_STRAIGHT
    assert result["odd_hints"].weather == Weather.CLEAR
    assert len(result["assumptions"]) > 0


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_missing_required_axis(mock_get_llm):
    """Thiếu trục bắt buộc (actor_type hoặc maneuver) -> trả về ValidationIssue."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type=RoadType.URBAN_STRAIGHT,
        weather=Weather.CLEAR,
        actor_type=None,
        maneuver=ManeuverType.CUT_IN,
        inferred=[],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "Một chiếc xe lạ nào đó tạt đầu"}
    result = parse_intent_node(state)

    assert "issues" in result
    assert len(result["issues"]) == 1
    assert result["issues"][0].code == IssueCode.NEED_MORE_DETAIL


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_unparsable_all_none(mock_get_llm):
    """Cả 4 trục đều là None / unknown -> ném ValueError."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type=None,
        weather=None,
        actor_type=None,
        maneuver=None,
        inferred=[],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "Một ngày đẹp trời như bao ngày khác"}
    with pytest.raises(ValueError, match="Không thể nhận diện tình huống giao thông"):
        parse_intent_node(state)


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_subject_object_distinction(mock_get_llm):
    """Test case 1: 'o to tat dau xe may troi mua' -> actor_type là 'car' (chủ thể gây nguy hiểm), weather: 'heavy_rain'."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type=None,
        weather=Weather.HEAVY_RAIN,
        actor_type=ActorType.CAR,
        maneuver=ManeuverType.CUT_IN,
        inferred=[],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "o to tat dau xe may troi mua"}
    result = parse_intent_node(state)

    assert _get_cat(result["odd_query"].actor_type) == ActorType.CAR
    assert _get_cat(result["odd_query"].maneuver) == ManeuverType.CUT_IN
    assert result["odd_query"].weather == Weather.HEAVY_RAIN
    assert result["odd_query"].road_type in (None, "unknown")


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_strict_zero_default(mock_get_llm):
    """Test case 2: 'Container mất lái va chạm xe sedan' -> actor_type: 'truck', road_type & weather: None/unknown."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type="unknown",
        weather="unknown",
        actor_type=ActorType.TRUCK,
        maneuver=ManeuverType.LANE_DRIFT,
        inferred=[],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "Container mất lái va chạm xe sedan"}
    result = parse_intent_node(state)

    assert _get_cat(result["odd_query"].actor_type) == ActorType.TRUCK
    assert _get_cat(result["odd_query"].maneuver) == ManeuverType.LANE_DRIFT
    assert result["odd_query"].weather in (None, "unknown")
    assert result["odd_query"].road_type in (None, "unknown")


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_hybrid_reasoning(mock_get_llm):
    """Test Hybrid Model: 'xe ben chan dau xe dien troi nang' -> actor_type: truck, maneuver: cut_in, weather: clear, road_type: None/unknown."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type="unknown",
        weather=Weather.CLEAR,
        actor_type=ActorType.TRUCK,
        maneuver=ManeuverType.CUT_IN,
        inferred=[],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "xe ben chan dau xe dien troi nang"}
    result = parse_intent_node(state)

    assert _get_cat(result["odd_query"].actor_type) == ActorType.TRUCK
    assert _get_cat(result["odd_query"].maneuver) == ManeuverType.CUT_IN
    assert result["odd_query"].weather == Weather.CLEAR
    assert result["odd_query"].road_type in (None, "unknown")


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_complex_sentence_evade(mock_get_llm):
    """Test Complex Sentence: 'xe 16 cho dam phanh ne nguoi di bo' -> actor_type: car (xe 16 chỗ/bus), maneuver: sudden_brake."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm

    mock_odd_query = ODDQuery(
        road_type="unknown",
        weather="unknown",
        actor_type=ActorType.CAR,
        maneuver=ManeuverType.SUDDEN_BRAKE,
        inferred=[],
    )
    mock_structured_llm.invoke.return_value = mock_odd_query

    state = {"user_query": "xe 16 cho dam phanh ne nguoi di bo"}
    result = parse_intent_node(state)

    assert _get_cat(result["odd_query"].actor_type) in ("bus", "car")
    assert _get_cat(result["odd_query"].maneuver) == ManeuverType.SUDDEN_BRAKE
    assert result["odd_query"].weather in (None, "unknown")
    assert result["odd_query"].road_type in (None, "unknown")
    assert result["odd_hints"].actor_type in (ActorType.BUS, ActorType.CAR)


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_llm_exception_handled(mock_get_llm):
    """Bắt ngoại lệ nếu gọi provider LLM thất bại."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm
    mock_structured_llm.invoke.side_effect = RuntimeError("OpenAI API rate limit")

    state = {"user_query": "phuong tien la phong nhanh phanh gap qua ma"}
    result = parse_intent_node(state)

    assert "issues" in result
    assert len(result["issues"]) == 1
    assert result["issues"][0].code == IssueCode.LLM_PROVIDER_ERROR


@patch("src.agents.nodes.parse_intent.get_llm")
def test_parse_intent_llm_graceful_fallback(mock_get_llm):
    """Khi LLM bị lỗi rate limit / 429 quota, nếu Bước 1 trích xuất được actor_type thì Graceful Fallback về rule_odd."""
    mock_structured_llm = MagicMock()
    mock_get_llm.return_value.with_structured_output.return_value = mock_structured_llm
    mock_structured_llm.invoke.side_effect = RuntimeError("429 RESOURCE_EXHAUSTED")

    state = {"user_query": "xe tải chở hàng bị bung thùng làm rơi kiện hàng ra đường"}
    result = parse_intent_node(state)

    assert "odd_query" in result
    assert _get_cat(result["odd_query"].actor_type) == "truck"
    assert result["issues"] == []
