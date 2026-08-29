"""Unit tests cho Node 1 (parse_intent)."""

from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from src.agents.nodes.parse_intent import _load_taxonomy_rules, _rule_based_extract, parse_intent_node
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
    # Phương tiện gây hành vi khớp ODD là adversary; xe phía sau là ego.
    assert [a["role"] for a in result["actors"]] == ["adversary", "ego"]


def test_actor_after_lane_context_is_not_dropped():
    """ "làn giữa, xe máy" không phải cụm hạ tầng "làn xe máy"."""
    parsed = _rule_based_extract(
        "xe buýt tạt đầu ra làn giữa, xe máy phía sau không kịp tránh",
        _load_taxonomy_rules(),
    )

    assert [actor["specific_type"] for actor in parsed["actors"]] == ["xe buýt", "xe máy"]
    assert [actor["role"] for actor in parsed["actors"]] == ["adversary", "ego"]


def test_actor_roles_do_not_depend_on_mention_order():
    parsed = _rule_based_extract(
        "xe máy phía sau không kịp tránh khi xe buýt tạt đầu",
        _load_taxonomy_rules(),
    )

    assert [(actor["specific_type"], actor["role"]) for actor in parsed["actors"]] == [
        ("xe máy", "ego"),
        ("xe buýt", "adversary"),
    ]


def test_explicit_kinematics_survive_parse_for_the_sc052_sentence_shape():
    """Cụm "xe bị ảnh hưởng" không được đảo chiếc xe gây nguy hiểm thành ego."""
    parsed = _rule_based_extract(
        "Trên cao tốc trời quang, một ô tô con chạy 68 km/h từ phía trước bất ngờ "
        "cắt ngang sang làn xe bị ảnh hưởng đang chạy 96 km/h, ép xe sau phải giảm tốc "
        "và đánh lái né gấp.",
        _load_taxonomy_rules(),
    )

    assert [actor["role"] for actor in parsed["actors"]] == ["adversary"]
    assert parsed["kinematic_hints"] == {
        "adversary_speed_kmh": 68.0,
        "ego_speed_kmh": 96.0,
        "adversary_relative_position": "ahead",
    }


def test_explicit_zero_speeds_are_not_dropped_as_falsy():
    parsed = _rule_based_extract(
        "Xe máy chạy 0 km/h từ phía trước tạt đầu ô tô ego đang chạy 0 km/h rồi phanh xuống còn 0 km/h trên cao tốc.",
        _load_taxonomy_rules(),
    )

    assert parsed["kinematic_hints"] == {
        "adversary_speed_kmh": 0.0,
        "ego_speed_kmh": 0.0,
        "adversary_target_speed_kmh": 0.0,
        "adversary_relative_position": "ahead",
    }


def test_ambiguous_actor_roles_are_left_unknown():
    parsed = _rule_based_extract("xe máy và ô tô chạy trên cao tốc", _load_taxonomy_rules())

    assert [actor["role"] for actor in parsed["actors"]] == ["unknown", "unknown"]


def test_fixture_wording_keeps_explicit_ego_and_primary_cut_in_intent():
    """Regression cho đúng câu production từng đảo vai và chọn nhầm phanh gấp."""
    query = (
        "Trên cao tốc vào ban ngày, trời quang, một xe máy chạy 80 km/h ở làn bên trái, "
        "xuất phát cách phía sau ô tô ego 25 m đang chạy 60 km/h. Xe máy vượt lên, "
        "tạt vào trước đầu ô tô rồi phanh gấp xuống còn 40 km/h."
    )

    result = parse_intent_node({"user_query": query})

    assert result["odd_hints"].maneuver is ManeuverType.CUT_IN
    assert [(actor["specific_type"], actor["role"]) for actor in result["actors"]] == [
        ("xe máy", "adversary"),
        ("ô tô", "ego"),
    ]


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


def test_speed_after_a_bare_ego_marker_belongs_to_ego_only():
    """ "xe ego" không có span taxonomy, và segment của chủ thể liền trước nuốt nó.

    Sample 4 của benchmark hỏng đúng vì chuyện này: 45 km/h là của ego, nhưng
    ``adversary_speed_kmh`` cũng nhận 45. ``cut_in`` từ phía sau lại đòi adversary
    nhanh hơn ego, nên ``INTENT_SPEED_MISMATCH`` và ``GEOM_NO_CATCHUP`` loại trừ
    nhau — ba vòng repair dao động 60 -> 55 rồi chết.

    "ô tô ego" không dính lỗi này vì "ô tô" khớp taxonomy nên có span chặn sẵn;
    chỉ marker trần mới lọt.
    """
    parsed = _rule_based_extract(
        "Trên cao tốc sương mù, xe máy từ phía sau tạt đầu xe ego đang chạy 45 km/h.",
        _load_taxonomy_rules(),
    )

    assert parsed["kinematic_hints"] == {
        "ego_speed_kmh": 45.0,
        "adversary_relative_position": "behind",
    }


def test_adversary_speed_before_the_ego_marker_is_still_read():
    """Cắt ở marker ego không được làm mất tốc độ nói trước đó."""
    parsed = _rule_based_extract(
        "Trên cao tốc trời quang, xe máy chạy 80 km/h tạt đầu xe ego đang chạy 55 km/h.",
        _load_taxonomy_rules(),
    )

    assert parsed["kinematic_hints"]["adversary_speed_kmh"] == 80.0
    assert parsed["kinematic_hints"]["ego_speed_kmh"] == 55.0


def test_run_red_light_beats_a_cut_in_keyword_that_appears_earlier():
    """ "Vượt đèn đỏ" gọi tên hành vi; "cắt ngang" chỉ tả hệ quả của nó.

    Câu tiếng Việt tự nhiên hay nói hệ quả trước — *"trên nhánh đường cắt ngang
    vượt đèn đỏ lao qua nút giao"*. Sắp theo vị trí thì `cut_in` thắng, nhãn ODD
    thành `urban_straight + cut_in` — tổ hợp converter không dựng được — và
    request chết ngay ở bước đầu. Chiến dịch ODD 29/08 mất 10 ô vì đúng chuyện
    này.
    """
    parsed = _rule_based_extract(
        "Trên đường phố nội đô trời mưa, một xe máy chạy 33 km/h trên nhánh đường cắt ngang "
        "vượt đèn đỏ lao qua nút giao, cắt mặt xe bị ảnh hưởng đang đi hợp lệ 22 km/h.",
        _load_taxonomy_rules(),
    )

    assert parsed["maneuver"] is ManeuverType.RUN_RED_LIGHT


def test_cut_in_still_wins_when_no_decisive_signal_is_present():
    """Danh sách quyết định phải HẸP; nới rộng là biến sắp theo vị trí thành vô nghĩa."""
    parsed = _rule_based_extract(
        "Trên cao tốc trời quang, xe máy vượt lên tạt đầu ô tô ego đang chạy 55 km/h rồi phanh gấp.",
        _load_taxonomy_rules(),
    )

    assert parsed["maneuver"] is ManeuverType.CUT_IN
