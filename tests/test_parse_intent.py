"""Unit tests cho Node 1 (parse_intent)."""

from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from src.agents.nodes.parse_intent import parse_intent_node
from src.models.schemas import (
    ActorType,
    AssumptionSource,
    IssueCode,
    ManeuverType,
    ODDQuery,
    RoadType,
    Weather,
)


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
    """Case 2: thiếu 2 trục bối cảnh -> default điền theo phạm vi converter.

    Mặc định road_type **không** phải hằng số. `with_defaults` ưu tiên
    `urban_straight`, nhưng chỉ lấy nó nếu `SupportPolicy` chấp nhận; ADR-016
    chốt phạm vi đã kiểm chứng chỉ có cao tốc, nên câu không nói loại đường sẽ
    ra `highway`. Điền cứng `urban_straight` ở đây sẽ khiến chính câu này bị từ
    chối bằng UNSUPPORTED_COMBINATION — từ chối một yêu cầu vốn có lời giải.
    """
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
    assert result["odd_hints"].road_type == RoadType.HIGHWAY
    assert result["odd_hints"].weather == Weather.CLEAR
    assert result["odd_hints"].key == "highway|clear|motorcycle|cut_in"
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
        # "xe khách" quy về TRUCK ở biên parse: ODDCell chỉ nhận enum mà
        # converter có blueprint. Xem _ACTOR_ALIASES trong parse_intent.
        actor_type=ActorType.TRUCK,
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
    """Case 7: câu dùng từ lóng vẫn trích xuất được, nhưng ô ODD ngoài phạm vi.

    "Đoàn xe đạp đi hàng ba chiếm trọn làn ô tô" đọc ra đúng
    (motorcycle + lane_drift + urban_straight), nhưng ADR-016 chốt converter mới
    chỉ dựng được cao tốc. Hành vi đúng là **nói thẳng là chưa hỗ trợ**, không
    phải sinh một kịch bản mà convert_xosc chắc chắn sẽ hỏng ở cuối luồng.
    """
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

    # Trích xuất vẫn đúng — đó là việc của node này.
    assert result["odd_hints"].actor_type == ActorType.MOTORCYCLE
    assert result["odd_hints"].maneuver == ManeuverType.LANE_DRIFT
    assert result["odd_hints"].road_type == RoadType.URBAN_STRAIGHT
    # ...nhưng ô đó ngoài phạm vi converter, nên luồng dừng ở đây.
    assert [i.code for i in result["issues"]] == [IssueCode.UNSUPPORTED_COMBINATION]


def test_parse_intent_multi_actor():
    """Case 8: multi-actor, chạy hoàn toàn bằng rule-based (không gọi LLM).

    "Xe khách" quy về TRUCK — chữ gốc không mất, nó đi tiếp trong
    `specific_type`. Đây là lý do quy đổi nằm ở biên parse chứ không phải nới
    `ActorType`: thêm `bus` vào enum sẽ nở mẫu số ODD coverage bằng 140 ô mà
    converter không dựng nổi.
    """
    state = {"user_query": "Xe khách phanh gấp làm xe máy phía sau đâm vào trên đường cao tốc"}
    result = parse_intent_node(state)

    assert result["issues"] == []
    assert result["odd_hints"].actor_type == ActorType.TRUCK
    assert result["odd_hints"].maneuver == ManeuverType.SUDDEN_BRAKE
    assert result["odd_hints"].specific_type == "Xe khách"
    # Hai actor được nhận ra, ego đứng trước.
    assert [a["role"] for a in result["actors"]] == ["ego", "adversary"]


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


# ---------------------------------------------------------------------------
# Quy đổi taxonomy -> enum ở biên parse
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "user_query,expected_actor,expected_maneuver",
    [
        ("Xe khách phanh gấp trên đường cao tốc", ActorType.TRUCK, ManeuverType.SUDDEN_BRAKE),
        ("Xe buýt dừng chết giữa làn trên cao tốc", ActorType.TRUCK, ManeuverType.STOP_IN_LANE),
        ("Đoàn xe đạp lấn làn trên đường cao tốc", ActorType.MOTORCYCLE, ManeuverType.LANE_DRIFT),
        ("Xe con vượt ẩu trên đường cao tốc", ActorType.CAR, ManeuverType.CUT_IN),
    ],
    ids=["xe khách->truck", "xe buýt->truck", "xe đạp->motorcycle", "vượt ẩu->cut_in"],
)
def test_taxonomy_vocabulary_narrows_to_enum(user_query, expected_actor, expected_maneuver):
    """Từ vựng người dùng rộng hơn enum, và quy đổi phải xảy ra **ở đây**.

    `taxonomy_rules.json` cố ý biết cả "xe khách", "xe đạp", "vượt ẩu" — đó là
    chữ người ta gõ thật. Nhưng `ODDCell` chỉ nhận 4 ActorType và 7 ManeuverType
    mà converter có template, nên biên parse phải thu hẹp lại.

    Cách sai đã từng làm: nới enum trong `schemas.py` để nhận `bus`/`overtake`.
    Nó nở mẫu số `ODD coverage` bằng những ô converter không dựng nổi — coverage
    tụt vì đổi định nghĩa mẫu số chứ không phải vì hệ thống kém đi. Muốn nới
    thật thì cần template converter + errata cho ADR-016.
    """
    result = parse_intent_node({"user_query": user_query})

    assert result["issues"] == []
    assert result["odd_hints"].actor_type == expected_actor
    assert result["odd_hints"].maneuver == expected_maneuver


def test_original_wording_survives_the_narrowing():
    """Quy về enum không được làm mất chữ người dùng gõ."""
    result = parse_intent_node({"user_query": "Xe khách phanh gấp trên đường cao tốc"})

    hints = result["odd_hints"]
    assert hints.actor_type == ActorType.TRUCK
    assert hints.specific_type == "Xe khách"
    assert hints.specific_action == "phanh gấp"
    # Nhãn mô tả không được lọt vào `key` — coverage đếm theo ô enum.
    assert hints.key == "highway|clear|truck|sudden_brake"


def test_sentinel_unknown_from_llm_is_treated_as_empty():
    """Model hay trả "unknown" thay vì bỏ trống — đừng để nó làm chết cả request."""
    query = ODDQuery.model_validate(
        {"road_type": "unknown", "weather": "N/A", "actor_type": "motorcycle", "maneuver": "cut_in"}
    )
    assert query.road_type is None
    assert query.weather is None

    # Còn từ vựng tiếng Việt thì KHÔNG dịch ở tầng contract — đó là việc của
    # taxonomy_rules.json trong parse_intent.
    with pytest.raises(ValidationError):
        ODDQuery.model_validate({"weather": "mưa bão"})
