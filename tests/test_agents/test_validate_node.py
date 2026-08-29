import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from src.agents.nodes.validate_node import validate_node
from src.models.schemas import (
    ActorSpec,
    ActorType,
    IssueCode,
    IssueSeverity,
    ManeuverSpec,
    ManeuverType,
    ODDCell,
    ODDQuery,
    Position,
    RoadType,
    ScenarioDraft,
    TimeOfDay,
    TriggerCondition,
    VehicleCategory,
    Weather,
)

FIXTURES = Path(__file__).parents[2] / "fixtures"


def _json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


INVALID_FIXTURES = sorted((FIXTURES / "invalid_drafts").glob("*.json"))
VALID_SPEC_FIXTURES = sorted((FIXTURES / "scenario_specs").glob("*.json"))


@pytest.fixture
def valid_draft() -> ScenarioDraft:
    return ScenarioDraft(
        title="valid scenario",
        odd=ODDCell(
            road_type=RoadType.INTERSECTION,
            weather=Weather.CLEAR,
            actor_type=ActorType.CAR,
            maneuver=ManeuverType.CUT_IN,
        ),
        time_of_day=TimeOfDay.DAY,
        actors=[
            ActorSpec(
                name="hero",
                category=VehicleCategory.CAR,
                position=Position(lane_offset=0, s_offset_m=0.0),
                initial_speed_kmh=30.0,
                is_ego=True,
            ),
            ActorSpec(
                name="other",
                category=VehicleCategory.CAR,
                position=Position(lane_offset=1, s_offset_m=-10.0),
                initial_speed_kmh=40.0,
                is_ego=False,
            ),
        ],
        maneuvers=[
            ManeuverSpec(
                actor_name="other",
                maneuver=ManeuverType.CUT_IN,
                trigger=TriggerCondition(type="lead_distance", value=7.0),
                target_speed_kmh=20.0,
            )
        ],
        duration_s=30.0,
    )


@pytest.mark.asyncio
async def test_validate_node_accepts_valid_draft(valid_draft: ScenarioDraft) -> None:
    result = await validate_node(
        {
            "draft": valid_draft,
            "odd_query": ODDQuery(actor_type=ActorType.CAR, maneuver=ManeuverType.CUT_IN),
        }
    )
    assert result["issues"] == []
    assert isinstance(result["draft"], ScenarioDraft)


@pytest.mark.asyncio
async def test_validate_rejects_speed_and_position_drift_from_explicit_intent(
    valid_draft: ScenarioDraft,
) -> None:
    """Hình học có thể gây va chạm nhưng vẫn sai intent như hiện vật sc_052."""
    draft = valid_draft.model_dump()
    draft["actors"][0]["initial_speed_kmh"] = 96.0
    draft["actors"][1]["initial_speed_kmh"] = 110.0
    draft["actors"][1]["position"]["s_offset_m"] = -25.0
    draft["maneuvers"][0]["target_speed_kmh"] = 40.0

    result = await validate_node(
        {
            "draft": draft,
            "odd_query": ODDQuery(actor_type=ActorType.CAR, maneuver=ManeuverType.CUT_IN),
            "kinematic_hints": {
                "ego_speed_kmh": 96.0,
                "adversary_speed_kmh": 68.0,
                "adversary_relative_position": "ahead",
            },
        }
    )

    intent_issues = [issue for issue in result["issues"] if issue.code.value.startswith("INTENT_")]
    assert [(issue.code, issue.path) for issue in intent_issues] == [
        (IssueCode.INTENT_SPEED_MISMATCH, "/actors/1/initial_speed_kmh"),
        (IssueCode.INTENT_POSITION_MISMATCH, "/actors/1/position/s_offset_m"),
    ]
    assert all(issue.repairable_by_llm for issue in intent_issues)


@pytest.mark.asyncio
async def test_validate_accepts_kinematics_that_preserve_explicit_intent(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    draft["actors"][0]["initial_speed_kmh"] = 96.0
    draft["actors"][1]["initial_speed_kmh"] = 68.0
    draft["actors"][1]["position"]["s_offset_m"] = 25.0
    draft["maneuvers"][0]["target_speed_kmh"] = 40.0

    result = await validate_node(
        {
            "draft": draft,
            "odd_query": ODDQuery(actor_type=ActorType.CAR, maneuver=ManeuverType.CUT_IN),
            "kinematic_hints": {
                "ego_speed_kmh": 96.0,
                "adversary_speed_kmh": 68.0,
                "adversary_target_speed_kmh": 40.0,
                "adversary_relative_position": "ahead",
            },
        }
    )

    assert not [issue for issue in result["issues"] if issue.code.value.startswith("INTENT_")]


@pytest.mark.asyncio
async def test_ego_maneuver_raw_draft_becomes_repairable_issue(valid_draft: ScenarioDraft) -> None:
    raw = valid_draft.model_dump(mode="json")
    raw["maneuvers"][0]["actor_name"] = "hero"

    result = await validate_node({"draft": raw})

    assert [(issue.code, issue.path) for issue in result["issues"]] == [
        (IssueCode.EGO_HAS_MANEUVER, "/maneuvers/0/actor_name")
    ]
    assert "draft" not in result, "draft chưa hợp lệ phải được giữ ở dạng raw trong state"


@pytest.mark.asyncio
@pytest.mark.parametrize("path", INVALID_FIXTURES, ids=lambda path: path.stem)
async def test_invalid_fixture_returns_declared_codes_and_paths(path: Path) -> None:
    case = _json(path)
    odd_query = case.get("odd_query") or {
        **case["draft"]["odd"],
        "inferred": [],
    }
    state = {"draft": case["draft"], "odd_query": odd_query}

    first = await validate_node(state)
    second = await validate_node(state)
    actual = [(issue.code.value, issue.path) for issue in first["issues"]]
    expected = list(zip(case["expected_codes"], case["expected_paths"], strict=True))

    assert actual == expected
    assert [issue.model_dump() for issue in first["issues"]] == [issue.model_dump() for issue in second["issues"]]
    assert all(issue.message_vi and issue.suggestion for issue in first["issues"])


# sc_002 là hiện vật của câu hỏi Phase 3, ARCHITECTURE.md mô tả nguyên văn: "hợp
# lệ, chạy xong, success=true, và vô dụng". Nó cố ý mang hình học vô hại — người
# đi bộ cách 2 làn, ego 30 km/h chỉ còn 8 m lúc trigger bắn trong khi cần 42 m.
#
# Từ khi có `jaywalk_trigger_too_close`, validate **bắt được nó trước khi chạy**.
# Đó là tiến bộ, không phải hồi quy: fixture giữ nguyên để vẫn là hiện vật, và
# việc nó bị chặn được khẳng định bằng một test riêng bên dưới.
_USELESS_BY_DESIGN = {"sc_002"}


@pytest.mark.asyncio
@pytest.mark.parametrize("path", VALID_SPEC_FIXTURES, ids=lambda path: path.stem)
async def test_valid_fixture_files_return_no_validation_errors(path: Path) -> None:
    if path.stem in _USELESS_BY_DESIGN:
        pytest.skip("hình học vô hại có chủ đích — xem test_the_useless_by_design_fixture_is_now_caught")
    spec = _json(path)
    spec.pop("_comment", None)
    draft = {key: value for key, value in spec.items() if key not in {"scenario_id", "description_vi"}}
    odd_query = {**draft["odd"], "inferred": []}

    result = await validate_node({"draft": draft, "odd_query": odd_query})

    assert result["issues"] == []


@pytest.mark.asyncio
async def test_the_useless_by_design_fixture_is_now_caught_before_it_runs() -> None:
    """Kịch bản "chạy xong mà chẳng có gì xảy ra" giờ bị chặn ở validate.

    Trước đây chỉ phát hiện được sau khi tốn một lượt GPU và đọc criteria — mà
    criteria cũng không nói được vì sao. Giờ nó chết ở tầng spec, kèm con số.
    """
    spec = _json(FIXTURES / "scenario_specs" / "sc_002.json")
    spec.pop("_comment", None)
    draft = {key: value for key, value in spec.items() if key not in {"scenario_id", "description_vi"}}

    result = await validate_node({"draft": draft, "odd_query": {**draft["odd"], "inferred": []}})

    issue = next(i for i in result["issues"] if i.code is IssueCode.GEOM_JAYWALK_TRIGGER_TOO_CLOSE)
    assert issue.repairable_by_llm


@pytest.mark.asyncio
async def test_missing_odd_query_is_a_terminal_context_error(valid_draft: ScenarioDraft) -> None:
    result = await validate_node({"draft": valid_draft})
    issue = result["issues"][0]
    assert issue.code is IssueCode.VALIDATION_CONTEXT_MISSING
    assert issue.path == "/odd_query"
    assert issue.repairable_by_llm is False


@pytest.mark.asyncio
async def test_schema_constraint_suggestion_uses_pydantic_context(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    draft["actors"][1]["initial_speed_kmh"] = 151.0
    result = await validate_node({"draft": draft})

    issue = next(i for i in result["issues"] if i.path == "/actors/1/initial_speed_kmh")
    assert issue.code is IssueCode.SCHEMA_INVALID
    assert issue.suggestion == "Đặt /actors/1/initial_speed_kmh nhỏ hơn hoặc bằng 150.0."


@pytest.mark.asyncio
async def test_missing_field_suggestion_names_json_path(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    del draft["title"]
    result = await validate_node({"draft": draft})

    issue = next(i for i in result["issues"] if i.path == "/title")
    assert issue.code is IssueCode.SCHEMA_INVALID
    assert issue.suggestion == "Bổ sung trường bắt buộc /title."


@pytest.mark.asyncio
async def test_trigger_distance_unsigned(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    draft["maneuvers"][0]["trigger"] = {"type": "distance_to_ego", "value": -5.0}
    result = await validate_node({"draft": draft})
    assert any(i.code is IssueCode.TRIGGER_DISTANCE_UNSIGNED for i in result["issues"])
    assert any(i.path == "/maneuvers/0/trigger/value" for i in result["issues"])


@pytest.mark.asyncio
async def test_negative_simulation_time_is_generic_schema_error(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    draft["maneuvers"][0]["trigger"] = {"type": "simulation_time", "value": -5.0}
    result = await validate_node({"draft": draft})

    issue = next(i for i in result["issues"] if i.path == "/maneuvers/0/trigger/value")
    assert issue.code is IssueCode.SCHEMA_INVALID
    assert issue.suggestion == "Đặt /maneuvers/0/trigger/value lớn hơn 0.0."


def _run_red_light_draft(valid_draft: ScenarioDraft, *, lane_offset: int, s_offset_m: float) -> ScenarioDraft:
    draft = valid_draft.model_dump()
    draft["odd"]["road_type"] = RoadType.URBAN_STRAIGHT
    draft["odd"]["maneuver"] = ManeuverType.RUN_RED_LIGHT
    draft["actors"][1]["position"] = {"lane_offset": lane_offset, "s_offset_m": s_offset_m}
    draft["maneuvers"][0]["maneuver"] = ManeuverType.RUN_RED_LIGHT
    draft["maneuvers"][0]["trigger"] = {"type": "simulation_time", "value": 1.0}
    draft["maneuvers"][0]["target_speed_kmh"] = 30.0
    return ScenarioDraft.model_validate(draft)


@pytest.mark.asyncio
async def test_run_red_light_must_select_the_measured_crossing_approach(valid_draft: ScenarioDraft) -> None:
    result = await validate_node(
        {
            "draft": _run_red_light_draft(valid_draft, lane_offset=1, s_offset_m=-10.0),
            "odd_query": ODDQuery(
                road_type=RoadType.URBAN_STRAIGHT,
                actor_type=ActorType.CAR,
                maneuver=ManeuverType.RUN_RED_LIGHT,
            ),
        }
    )

    issue = next(i for i in result["issues"] if i.code is IssueCode.GEOM_RUN_RED_LIGHT_NOT_CROSSING_APPROACH)
    assert issue.path == "/actors/1/position"
    assert issue.repairable_by_llm
    assert "lane_offset = 0" in issue.suggestion
    assert "s_offset_m = 0" in issue.suggestion


@pytest.mark.asyncio
async def test_run_red_light_accepts_the_measured_crossing_approach(valid_draft: ScenarioDraft) -> None:
    result = await validate_node(
        {
            "draft": _run_red_light_draft(valid_draft, lane_offset=0, s_offset_m=0.0),
            "odd_query": ODDQuery(
                road_type=RoadType.URBAN_STRAIGHT,
                actor_type=ActorType.CAR,
                maneuver=ManeuverType.RUN_RED_LIGHT,
            ),
        }
    )

    assert IssueCode.GEOM_RUN_RED_LIGHT_NOT_CROSSING_APPROACH not in [i.code for i in result["issues"]]


@pytest.mark.asyncio
async def test_lane_offset_implausible(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    draft["actors"][1]["position"]["lane_offset"] = 4
    result = await validate_node(
        {
            "draft": draft,
            "odd_query": ODDQuery(actor_type=ActorType.CAR, maneuver=ManeuverType.CUT_IN),
        }
    )
    assert len(result["issues"]) == 1
    issue = result["issues"][0]
    assert issue.code is IssueCode.LANE_OFFSET_IMPLAUSIBLE
    assert issue.severity == IssueSeverity.WARNING
    assert issue.path == "/actors/1/position/lane_offset"


@pytest.mark.asyncio
async def test_faster_actor_behind_can_catch_up_then_slow_after_cutin(valid_draft: ScenarioDraft) -> None:
    """Initial speed governs catch-up; target speed governs the post-cut-in gap."""
    result = await validate_node(
        {
            "draft": valid_draft,
            "odd_query": ODDQuery(actor_type=ActorType.CAR, maneuver=ManeuverType.CUT_IN),
        }
    )
    geometry_codes = {
        issue.code
        for issue in result["issues"]
        if issue.code in {IssueCode.GEOM_NO_CATCHUP, IssueCode.GEOM_NO_COLLISION_AFTER_CUTIN}
    }
    assert geometry_codes == set()


@pytest.mark.asyncio
async def test_geom_no_collision_after_cutin(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    # Tạt đầu xong vẫn nhanh hơn ego nên khoảng cách tiếp tục nới rộng.
    draft["actors"][1]["position"]["s_offset_m"] = -5.0
    draft["maneuvers"][0]["target_speed_kmh"] = 40.0
    result = await validate_node({"draft": draft})
    issue = next(i for i in result["issues"] if i.code is IssueCode.GEOM_NO_COLLISION_AFTER_CUTIN)
    assert issue.path == "/maneuvers/0"
    assert "tốc độ sau maneuver" in issue.message_vi
    assert "lane_offset=0" not in issue.message_vi


@pytest.mark.asyncio
async def test_cutin_collision_message_only_names_invalid_lane(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    draft["actors"][1]["position"]["lane_offset"] = 0
    result = await validate_node({"draft": draft})

    issue = next(i for i in result["issues"] if i.code is IssueCode.GEOM_NO_COLLISION_AFTER_CUTIN)
    assert "lane_offset=0" in issue.message_vi
    assert "tốc độ sau maneuver" not in issue.message_vi


@pytest.mark.asyncio
async def test_cutin_collision_message_names_both_invalid_conditions(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    draft["actors"][1]["position"]["lane_offset"] = 0
    draft["maneuvers"][0]["target_speed_kmh"] = 40.0
    result = await validate_node({"draft": draft})

    issue = next(i for i in result["issues"] if i.code is IssueCode.GEOM_NO_COLLISION_AFTER_CUTIN)
    assert "lane_offset=0" in issue.message_vi
    assert "tốc độ sau maneuver" in issue.message_vi


@pytest.mark.asyncio
async def test_equal_speed_cannot_close_gap_after_cutin(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    draft["maneuvers"][0]["target_speed_kmh"] = valid_draft.actors[0].initial_speed_kmh
    result = await validate_node({"draft": draft})
    assert any(i.code is IssueCode.GEOM_NO_COLLISION_AFTER_CUTIN for i in result["issues"])


@pytest.mark.asyncio
async def test_missing_target_speed_falls_back_to_initial_speed(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    draft["actors"][1]["position"]["s_offset_m"] = 10.0
    draft["actors"][1]["initial_speed_kmh"] = 20.0
    draft["maneuvers"][0]["target_speed_kmh"] = None

    result = await validate_node(
        {
            "draft": draft,
            "odd_query": ODDQuery(actor_type=ActorType.CAR, maneuver=ManeuverType.CUT_IN),
        }
    )
    assert not any(i.code is IssueCode.GEOM_NO_COLLISION_AFTER_CUTIN for i in result["issues"])
    assert not any(i.code is IssueCode.GEOM_NO_CATCHUP for i in result["issues"])


@pytest.mark.asyncio
async def test_explicit_victim_actor_must_be_ego(valid_draft: ScenarioDraft) -> None:
    result = await validate_node(
        {
            "draft": valid_draft,
            "actors": [
                {"category": "car", "specific_type": "ô tô", "role": "adversary"},
                {"category": "motorcycle", "specific_type": "xe máy", "role": "ego"},
            ],
        }
    )

    issue = next(i for i in result["issues"] if i.code is IssueCode.ACTOR_ROLE_MISMATCH)
    assert issue.path == "/actors/0/is_ego"
    assert "xe máy" in issue.message_vi


@pytest.mark.asyncio
async def test_cut_in_distance_trigger_is_rejected(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    draft["maneuvers"][0]["trigger"] = {"type": "distance_to_ego", "value": 15.0}
    result = await validate_node({"draft": draft})
    assert any(i.code is IssueCode.TRIGGER_CUTIN_NOT_POSITIONAL for i in result["issues"])
    assert any(i.path == "/maneuvers/0/trigger/type" for i in result["issues"])


@pytest.mark.asyncio
async def test_odd_label_drift(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    state = {
        "draft": draft,
        # Workflow thật truyền ODDQuery, không phải dict thô.
        "odd_query": ODDQuery(
            road_type=RoadType.HIGHWAY,
            weather=Weather.RAIN,
            actor_type=ActorType.MOTORCYCLE,
            maneuver=ManeuverType.SUDDEN_BRAKE,
        ),
    }
    result = await validate_node(state)
    drift_paths = {i.path for i in result["issues"] if i.code is IssueCode.ODD_LABEL_DRIFT}
    assert drift_paths == {"/odd/road_type", "/odd/weather", "/odd/actor_type", "/odd/maneuver"}


@pytest.mark.asyncio
async def test_missing_ego_is_guarded_if_schema_validation_is_bypassed(
    monkeypatch: pytest.MonkeyPatch, valid_draft: ScenarioDraft
) -> None:
    non_ego_actor = SimpleNamespace(
        name="other",
        is_ego=False,
        category="car",
        position=SimpleNamespace(lane_offset=1, s_offset_m=-10.0),
        initial_speed_kmh=40.0,
    )
    fake_draft = SimpleNamespace(
        actors=[non_ego_actor],
        maneuvers=valid_draft.maneuvers,
        odd=valid_draft.odd,
    )
    monkeypatch.setattr("src.agents.nodes.validate_node.ScenarioDraft.model_validate", lambda _: fake_draft)

    result = await validate_node(
        {
            "draft": valid_draft.model_dump(),
            "odd_query": ODDQuery(actor_type=ActorType.CAR, maneuver=ManeuverType.CUT_IN),
        }
    )
    assert any(i.code is IssueCode.EGO_COUNT and i.path == "/actors" for i in result["issues"])


@pytest.mark.asyncio
async def test_missing_position_is_handled(monkeypatch: pytest.MonkeyPatch, valid_draft: ScenarioDraft) -> None:
    missing_position_actor = SimpleNamespace(
        name="other",
        is_ego=False,
        category="car",
        position=None,
        initial_speed_kmh=40.0,
    )
    ego_actor = SimpleNamespace(
        name="hero",
        is_ego=True,
        category="car",
        position=SimpleNamespace(lane_offset=0, s_offset_m=0.0),
        initial_speed_kmh=30.0,
    )
    fake_draft = SimpleNamespace(
        actors=[ego_actor, missing_position_actor],
        maneuvers=[],
        odd=valid_draft.odd,
    )

    monkeypatch.setattr("src.agents.nodes.validate_node.ScenarioDraft.model_validate", lambda _: fake_draft)

    result = await validate_node({"draft": valid_draft.model_dump()})
    assert any(i.code is IssueCode.SCHEMA_INVALID for i in result["issues"])
    assert any(i.path == "/actors/1/position" for i in result["issues"])


def _lane_drift_draft(trigger_s: float) -> ScenarioDraft:
    """Hình học của sc_906: xe tải trước ego 20 m, chậm hơn 10 km/h.

    Ego bắt kịp ở giây 20 / ((70-60)/3.6) = 7,2. Đo trên CARLA 22/08: lấn ở giây
    5,5 cho khe hở ngang 0,36 m (suýt quẹt thật), lấn ở giây 8,0 cho 0,51 m với
    độ lệch chỉ thành hình khi ego đã qua.
    """
    return ScenarioDraft(
        title="xe ben lấn làn",
        odd=ODDCell(
            road_type=RoadType.HIGHWAY,
            weather=Weather.CLEAR,
            actor_type=ActorType.TRUCK,
            maneuver=ManeuverType.LANE_DRIFT,
        ),
        time_of_day=TimeOfDay.DAY,
        actors=[
            ActorSpec(
                name="hero",
                category=VehicleCategory.CAR,
                position=Position(lane_offset=0, s_offset_m=0.0),
                initial_speed_kmh=70.0,
                is_ego=True,
            ),
            ActorSpec(
                name="adv",
                category=VehicleCategory.TRUCK,
                position=Position(lane_offset=-1, s_offset_m=20.0),
                initial_speed_kmh=60.0,
                is_ego=False,
            ),
        ],
        maneuvers=[
            ManeuverSpec(
                actor_name="adv",
                maneuver=ManeuverType.LANE_DRIFT,
                trigger=TriggerCondition(type="simulation_time", value=trigger_s),
                target_speed_kmh=None,
            )
        ],
        duration_s=30.0,
    )


@pytest.mark.asyncio
async def test_lane_drift_after_ego_passes_is_flagged() -> None:
    """Lấn làn sau lúc hai xe đi ngang nhau là lấn vào chỗ trống."""
    result = await validate_node(
        {
            "draft": _lane_drift_draft(trigger_s=8.0),
            "odd_query": ODDQuery(actor_type=ActorType.TRUCK, maneuver=ManeuverType.LANE_DRIFT),
        }
    )
    issue = next(i for i in result["issues"] if i.code is IssueCode.GEOM_DRIFT_AFTER_PASS)
    assert issue.path == "/maneuvers/0/trigger/value"
    assert issue.repairable_by_llm, "hạ trigger là sửa được, không phải lỗi chặn hẳn"


@pytest.mark.asyncio
async def test_lane_drift_before_ego_passes_is_accepted() -> None:
    """5,5 s là bản đã đo được 0,36 m trên CARLA — không được chặn nhầm nó."""
    result = await validate_node(
        {
            "draft": _lane_drift_draft(trigger_s=5.5),
            "odd_query": ODDQuery(actor_type=ActorType.TRUCK, maneuver=ManeuverType.LANE_DRIFT),
        }
    )
    assert not [i for i in result["issues"] if i.code is IssueCode.GEOM_DRIFT_AFTER_PASS]


@pytest.mark.asyncio
async def test_cut_in_geometry_untouched_by_lane_drift_check(valid_draft: ScenarioDraft) -> None:
    """Vị từ mới chỉ chạy cho lane_drift; cut_in không được đổi hành vi."""
    result = await validate_node(
        {
            "draft": valid_draft,
            "odd_query": ODDQuery(actor_type=ActorType.CAR, maneuver=ManeuverType.CUT_IN),
        }
    )
    assert not [i for i in result["issues"] if i.code is IssueCode.GEOM_DRIFT_AFTER_PASS]


@pytest.mark.asyncio
async def test_jaywalk_in_ego_lane_is_repairable_not_terminal(valid_draft: ScenarioDraft) -> None:
    """Converter chặn lỗi này nhưng chặn kiểu terminal — workflow chết, không sửa lần nào.

    Đo trên chiến dịch ODD 22/08: ô jaywalk hỏng hai lần liên tiếp vì LLM đặt
    lane_offset=0, và cả hai lần không có vòng repair nào chạy. Ở validate thì nó
    sửa được bằng đúng một số.
    """
    draft = valid_draft.model_dump()
    draft["odd"]["actor_type"] = ActorType.PEDESTRIAN
    draft["odd"]["maneuver"] = ManeuverType.JAYWALK
    draft["actors"][1]["category"] = VehicleCategory.PEDESTRIAN
    draft["actors"][1]["position"]["lane_offset"] = 0
    draft["maneuvers"][0]["maneuver"] = ManeuverType.JAYWALK

    result = await validate_node(
        {
            "draft": ScenarioDraft.model_validate(draft),
            "odd_query": ODDQuery(actor_type=ActorType.PEDESTRIAN, maneuver=ManeuverType.JAYWALK),
        }
    )
    issue = next(i for i in result["issues"] if i.code is IssueCode.GEOM_JAYWALK_IN_EGO_LANE)
    assert issue.repairable_by_llm
    assert "lane_offset" in issue.suggestion


@pytest.mark.asyncio
async def test_cut_in_lead_distance_must_cover_a_vehicle_length() -> None:
    """Dẫn trước 5 m rồi tạt là cắt vào sườn ego, không phải trước mũi.

    Bốn kịch bản chạy thật ngày 22/08 tách thành hai cụm theo khoảng vượt lúc
    trigger: 4,67 m và 5,05 m đều thành tông đuôi; 8,33 m và 13,89 m đều tạt đầu
    đúng ý. Vị từ cũ chỉ đòi biên dương nên hai ca đầu đi lọt.
    """

    def draft(lead_m: float) -> ScenarioDraft:
        return ScenarioDraft(
            title="tạt đầu cao tốc",
            odd=ODDCell(
                road_type=RoadType.HIGHWAY,
                weather=Weather.CLEAR,
                actor_type=ActorType.CAR,
                maneuver=ManeuverType.CUT_IN,
            ),
            time_of_day=TimeOfDay.DAY,
            actors=[
                ActorSpec(
                    name="hero",
                    category=VehicleCategory.CAR,
                    position=Position(lane_offset=0, s_offset_m=0.0),
                    initial_speed_kmh=96.0,
                    is_ego=True,
                ),
                ActorSpec(
                    name="adv",
                    category=VehicleCategory.CAR,
                    position=Position(lane_offset=-1, s_offset_m=-28.0),
                    initial_speed_kmh=110.0,
                    is_ego=False,
                ),
            ],
            maneuvers=[
                ManeuverSpec(
                    actor_name="adv",
                    maneuver=ManeuverType.CUT_IN,
                    trigger=TriggerCondition(type="lead_distance", value=lead_m),
                    target_speed_kmh=70.0,
                )
            ],
            duration_s=30.0,
        )

    async def codes(lead_m: float) -> set[IssueCode]:
        result = await validate_node(
            {
                "draft": draft(lead_m),
                "odd_query": ODDQuery(actor_type=ActorType.CAR, maneuver=ManeuverType.CUT_IN),
            }
        )
        return {i.code for i in result["issues"]}

    assert IssueCode.GEOM_CUTIN_LEAD_TOO_SHORT in await codes(5.0)
    assert IssueCode.GEOM_CUTIN_LEAD_TOO_SHORT not in await codes(7.0)


@pytest.mark.asyncio
async def test_jaywalk_trigger_too_close_is_flagged_with_the_computed_distance(
    valid_draft: ScenarioDraft,
) -> None:
    """Người đi bộ bước xuống muộn thì ego đã đi qua trước khi họ sang tới làn.

    Đo trên sc_026 ngày 22/08: ego 88 km/h, người đi bộ 6 km/h lệch một làn,
    trigger 18 m. Cần 51,3 m. Kết quả chạy thật: khe hở nhỏ nhất 107 m — hai bên
    chưa bao giờ ở gần nhau, dù kịch bản chạy hết và không lỗi.

    Gợi ý sửa phải mang CON SỐ: đo trên output LLM thật thì model không tự làm
    phép chia, nên nói "đặt xa hơn" là đi hết ba vòng repair mà lỗi vẫn nguyên.
    """
    draft = valid_draft.model_dump()
    draft["odd"]["actor_type"] = ActorType.PEDESTRIAN
    draft["odd"]["maneuver"] = ManeuverType.JAYWALK
    draft["actors"][0]["initial_speed_kmh"] = 88.0
    draft["actors"][1]["category"] = VehicleCategory.PEDESTRIAN
    draft["actors"][1]["position"]["lane_offset"] = 1
    draft["actors"][1]["initial_speed_kmh"] = 6.0
    draft["maneuvers"][0]["maneuver"] = ManeuverType.JAYWALK
    draft["maneuvers"][0]["trigger"] = {"type": "distance_to_ego", "value": 18.0}
    draft["maneuvers"][0]["target_speed_kmh"] = 6.0

    result = await validate_node(
        {
            "draft": ScenarioDraft.model_validate(draft),
            "odd_query": ODDQuery(actor_type=ActorType.PEDESTRIAN, maneuver=ManeuverType.JAYWALK),
        }
    )
    issue = next(i for i in result["issues"] if i.code is IssueCode.GEOM_JAYWALK_TRIGGER_TOO_CLOSE)
    assert issue.repairable_by_llm
    assert "51" in issue.suggestion, "phải nói khoảng cách cần thiết, không chỉ nói 'xa hơn'"


@pytest.mark.asyncio
async def test_jaywalk_with_enough_room_is_accepted(valid_draft: ScenarioDraft) -> None:
    """Cùng hình học, đứng đủ xa VÀ trigger đủ rộng thì không được chặn.

    Cả hai điều kiện đều cần: trigger rộng mà đứng gần thì nó bắn ngay giây 0.
    """
    draft = valid_draft.model_dump()
    draft["odd"]["actor_type"] = ActorType.PEDESTRIAN
    draft["odd"]["maneuver"] = ManeuverType.JAYWALK
    draft["actors"][0]["initial_speed_kmh"] = 88.0
    draft["actors"][1]["category"] = VehicleCategory.PEDESTRIAN
    draft["actors"][1]["position"]["lane_offset"] = 1
    draft["actors"][1]["position"]["s_offset_m"] = 60.0
    draft["actors"][1]["initial_speed_kmh"] = 6.0
    draft["maneuvers"][0]["maneuver"] = ManeuverType.JAYWALK
    draft["maneuvers"][0]["trigger"] = {"type": "distance_to_ego", "value": 50.0}
    draft["maneuvers"][0]["target_speed_kmh"] = 6.0

    result = await validate_node(
        {
            "draft": ScenarioDraft.model_validate(draft),
            "odd_query": ODDQuery(actor_type=ActorType.PEDESTRIAN, maneuver=ManeuverType.JAYWALK),
        }
    )
    assert not [i for i in result["issues"] if i.code is IssueCode.GEOM_JAYWALK_TRIGGER_TOO_CLOSE]


@pytest.mark.asyncio
async def test_jaywalk_trigger_wider_than_the_starting_gap_is_still_flagged(
    valid_draft: ScenarioDraft,
) -> None:
    """Trigger 55 m mà người đi bộ đứng cách 18 m thì trigger bắn ngay giây 0.

    Đo trên sc_033 ngày 23/08: đúng cấu hình này lọt qua bản kiểm đầu tiên vì nó
    chỉ nhìn `trigger.value`. Khoảng cách THẬT lúc bắn là min(s_offset, trigger).
    """
    draft = valid_draft.model_dump()
    # highway là road_type duy nhất có anchor; gợi ý sửa cần biết tầm với của nó.
    draft["odd"]["road_type"] = RoadType.HIGHWAY
    draft["odd"]["actor_type"] = ActorType.PEDESTRIAN
    draft["odd"]["maneuver"] = ManeuverType.JAYWALK
    draft["actors"][0]["initial_speed_kmh"] = 78.0
    draft["actors"][1]["category"] = VehicleCategory.PEDESTRIAN
    draft["actors"][1]["position"]["lane_offset"] = -1
    draft["actors"][1]["position"]["s_offset_m"] = 18.0
    draft["actors"][1]["initial_speed_kmh"] = 5.0
    draft["maneuvers"][0]["maneuver"] = ManeuverType.JAYWALK
    draft["maneuvers"][0]["trigger"] = {"type": "distance_to_ego", "value": 55.0}
    draft["maneuvers"][0]["target_speed_kmh"] = 5.0

    result = await validate_node(
        {
            "draft": ScenarioDraft.model_validate(draft),
            "odd_query": ODDQuery(actor_type=ActorType.PEDESTRIAN, maneuver=ManeuverType.JAYWALK),
        }
    )
    issue = next(i for i in result["issues"] if i.code is IssueCode.GEOM_JAYWALK_TRIGGER_TOO_CLOSE)
    # Cần 55 m nhưng anchor Town04 chỉ với tới 40 m, nên dời chỗ đứng là bất khả
    # thi — gợi ý phải chỉ lối thoát thật thay vì đẩy repair vào vòng lặp.
    assert "anchor" in issue.suggestion
    assert "km/h" in issue.suggestion


@pytest.mark.asyncio
async def test_jaywalk_time_trigger_after_ego_passed_is_flagged(valid_draft: ScenarioDraft) -> None:
    """Trigger theo THỜI GIAN cũng phải kiểm: giây 3 thì ego đã qua từ giây 0,74.

    Đo trên sc_034 ngày 23/08: ego 88 km/h, người đi bộ cách 18 m, trigger giây 3.
    Bản vá trước chỉ bắt trigger theo khoảng cách nên ca này lọt nguyên.
    """
    draft = valid_draft.model_dump()
    draft["odd"]["actor_type"] = ActorType.PEDESTRIAN
    draft["odd"]["maneuver"] = ManeuverType.JAYWALK
    draft["actors"][0]["initial_speed_kmh"] = 88.0
    draft["actors"][1]["category"] = VehicleCategory.PEDESTRIAN
    draft["actors"][1]["position"]["lane_offset"] = -1
    draft["actors"][1]["position"]["s_offset_m"] = 18.0
    draft["actors"][1]["initial_speed_kmh"] = 5.0
    draft["maneuvers"][0]["maneuver"] = ManeuverType.JAYWALK
    draft["maneuvers"][0]["trigger"] = {"type": "simulation_time", "value": 3.0}
    draft["maneuvers"][0]["target_speed_kmh"] = 5.0

    result = await validate_node(
        {
            "draft": ScenarioDraft.model_validate(draft),
            "odd_query": ODDQuery(actor_type=ActorType.PEDESTRIAN, maneuver=ManeuverType.JAYWALK),
        }
    )
    assert [i for i in result["issues"] if i.code is IssueCode.GEOM_JAYWALK_TRIGGER_TOO_CLOSE]


def _jaywalk_draft(valid_draft: ScenarioDraft, lane_offset: int) -> dict:
    draft = valid_draft.model_dump()
    # HIGHWAY chứ không phải INTERSECTION: chỉ road_type có template mới biết lề ở đâu.
    draft["odd"]["road_type"] = RoadType.HIGHWAY
    draft["odd"]["actor_type"] = ActorType.PEDESTRIAN
    draft["odd"]["maneuver"] = ManeuverType.JAYWALK
    draft["actors"][1]["category"] = VehicleCategory.PEDESTRIAN
    draft["actors"][1]["position"]["lane_offset"] = lane_offset
    draft["maneuvers"][0]["maneuver"] = ManeuverType.JAYWALK
    return draft


async def _jaywalk_issues(valid_draft: ScenarioDraft, lane_offset: int) -> list:
    result = await validate_node(
        {
            "draft": ScenarioDraft.model_validate(_jaywalk_draft(valid_draft, lane_offset)),
            "odd_query": ODDQuery(actor_type=ActorType.PEDESTRIAN, maneuver=ManeuverType.JAYWALK),
        }
    )
    return result["issues"]


@pytest.mark.asyncio
async def test_jaywalk_starting_on_the_carriageway_is_flagged(valid_draft: ScenarioDraft) -> None:
    """Xuất phát giữa làn xe chạy là "đi bộ trên đường", không phải băng qua đường.

    Lỗi này có nguồn gốc là một GỢI Ý SAI: chỗ chặn ``lane_offset=0`` từng khuyên
    "đặt -1 (bên lề trái)", mà trên anchor Town04 thì -1 là làn xe chạy — hai lề ở
    +1 và -2. ``sc_035`` sinh ra đúng từ câu đó. Một gợi ý sai trong vòng repair
    không dừng ở một kịch bản, nó đẻ ra cả một họ kịch bản sai.
    """
    issues = await _jaywalk_issues(valid_draft, -1)
    issue = next(i for i in issues if i.code is IssueCode.GEOM_JAYWALK_NOT_FROM_SHOULDER)
    assert issue.repairable_by_llm
    assert "1" in issue.suggestion and "-2" in issue.suggestion, "phải nói rõ lề nằm ở đâu"


@pytest.mark.asyncio
async def test_a_pedestrian_standing_on_the_shoulder_is_accepted(valid_draft: ScenarioDraft) -> None:
    """Lề đường là chỗ đúng để đứng — không được báo lỗi ở đó."""
    issues = await _jaywalk_issues(valid_draft, 1)
    assert IssueCode.GEOM_JAYWALK_NOT_FROM_SHOULDER not in [i.code for i in issues]


@pytest.mark.asyncio
async def test_the_repair_suggestion_never_points_at_a_driving_lane(valid_draft: ScenarioDraft) -> None:
    """Bản cũ khuyên -1 kèm chú thích 'bên lề trái' — sai, và sai một cách tự tin."""
    issues = await _jaywalk_issues(valid_draft, 0)
    suggestion = next(i.suggestion for i in issues if i.code is IssueCode.GEOM_JAYWALK_IN_EGO_LANE)
    assert "lề" in suggestion
    assert "-1" not in suggestion.replace("-2", ""), "-1 là làn xe chạy trên anchor này"


@pytest.mark.asyncio
async def test_the_cut_in_positional_suggestion_actually_satisfies_the_rule_it_just_raised(
    valid_draft: ScenarioDraft,
) -> None:
    """Gợi ý phải đổi cả loại trigger lẫn đơn vị, và thật sự làm lỗi biến mất."""
    draft = valid_draft.model_dump()
    draft["odd"]["road_type"] = RoadType.HIGHWAY
    draft["actors"][0]["initial_speed_kmh"] = 76.0
    draft["actors"][1]["initial_speed_kmh"] = 88.0
    draft["actors"][1]["position"]["s_offset_m"] = -22.0
    draft["maneuvers"][0]["trigger"] = {"type": "simulation_time", "value": 8.0}

    result = await validate_node(
        {
            "draft": ScenarioDraft.model_validate(draft),
            "odd_query": ODDQuery(actor_type=ActorType.CAR, maneuver=ManeuverType.CUT_IN),
        }
    )
    issue = next(i for i in result["issues"] if i.code is IssueCode.TRIGGER_CUTIN_NOT_POSITIONAL)
    assert "lead_distance" in issue.suggestion

    # Áp gợi ý vào rồi kiểm lại: lỗi phải biến mất.
    draft["maneuvers"][0]["trigger"] = {"type": "lead_distance", "value": 7.0}
    again = await validate_node(
        {
            "draft": ScenarioDraft.model_validate(draft),
            "odd_query": ODDQuery(actor_type=ActorType.CAR, maneuver=ManeuverType.CUT_IN),
        }
    )
    assert IssueCode.TRIGGER_CUTIN_NOT_POSITIONAL not in [i.code for i in again["issues"]]


def _wrong_way_draft(valid_draft: ScenarioDraft, *, s_offset_m: float) -> ScenarioDraft:
    draft = valid_draft.model_dump()
    draft["odd"]["road_type"] = RoadType.HIGHWAY
    draft["odd"]["maneuver"] = ManeuverType.WRONG_WAY
    draft["actors"][1]["position"] = {"lane_offset": 0, "s_offset_m": s_offset_m}
    draft["maneuvers"][0]["maneuver"] = ManeuverType.WRONG_WAY
    draft["maneuvers"][0]["trigger"] = {"type": "simulation_time", "value": 1.0}
    return ScenarioDraft.model_validate(draft)


@pytest.mark.asyncio
async def test_actor_beyond_anchor_reach_is_repairable_not_terminal(valid_draft: ScenarioDraft) -> None:
    """Converter bắt lỗi này, nhưng bắt sau ``promote`` nên workflow chết không sửa lần nào.

    Benchmark 26/08: ba mô tả ``wrong_way`` hỏng đúng kiểu đó — s_offset_m 80,
    120 và 80 trên anchor chỉ với tới +40. Sample 16 còn chạy trọn một vòng
    repair cho lỗi khác rồi mới chết ở converter: vòng lặp đã ở ngay đó, chỉ là
    lỗi này không với tới được.
    """
    result = await validate_node(
        {
            "draft": _wrong_way_draft(valid_draft, s_offset_m=80.0),
            "odd_query": ODDQuery(road_type=RoadType.HIGHWAY, maneuver=ManeuverType.WRONG_WAY),
        }
    )

    issue = next(i for i in result["issues"] if i.code is IssueCode.GEOM_ACTOR_BEYOND_ANCHOR_REACH)
    assert issue.repairable_by_llm
    assert issue.path == "/actors/1/position/s_offset_m"
    assert "[-120, 40]" in issue.suggestion


@pytest.mark.asyncio
async def test_wrong_way_suggestion_pairs_the_bound_with_a_speed(valid_draft: ScenarioDraft) -> None:
    """Kéo về trong tầm thôi thì đổi lỗi convert lấy một lần chạy vô ích.

    ``sc_036``/``sc_038`` đặt actor ở 35 m — hợp lệ, convert trót lọt — nhưng để
    hai xe đối đầu ở 95/85 km/h nên chạy xong vẫn ``ran_no_hazard``. Cặp dựng
    được va chạm thật là ``sc_042``/``sc_043``: 38 m kèm cả hai xe ~25 km/h.
    """
    result = await validate_node(
        {
            "draft": _wrong_way_draft(valid_draft, s_offset_m=120.0),
            "odd_query": ODDQuery(road_type=RoadType.HIGHWAY, maneuver=ManeuverType.WRONG_WAY),
        }
    )

    issue = next(i for i in result["issues"] if i.code is IssueCode.GEOM_ACTOR_BEYOND_ANCHOR_REACH)
    assert "38" in issue.suggestion
    assert "25 km/h" in issue.suggestion


@pytest.mark.asyncio
async def test_actor_inside_anchor_reach_raises_nothing(valid_draft: ScenarioDraft) -> None:
    result = await validate_node(
        {
            "draft": _wrong_way_draft(valid_draft, s_offset_m=38.0),
            "odd_query": ODDQuery(road_type=RoadType.HIGHWAY, maneuver=ManeuverType.WRONG_WAY),
        }
    )

    assert not [i for i in result["issues"] if i.code is IssueCode.GEOM_ACTOR_BEYOND_ANCHOR_REACH]


@pytest.mark.asyncio
async def test_run_red_light_ignores_the_positional_intent_hint(valid_draft: ScenarioDraft) -> None:
    """Hai luật của chính dự án đòi ngược nhau, và model không thoát được.

    `run_red_light` bắt buộc position 0/0 vì converter đặt actor lên approach
    vuông góc đã đo. Nhưng câu tiếng Việt tự nhiên nói "từ phía trước vượt đèn đỏ
    cắt ngang đầu xe ego", nên parse_intent sinh hint `ahead` và
    `INTENT_POSITION_MISMATCH` đòi `s_offset_m > 0` — đúng thứ luật kia cấm.

    Chiến dịch ODD 29/08: ba ô `run_red_light` chết vì cặp này, không ô nào
    repair thoát.
    """
    draft = valid_draft.model_dump()
    draft["odd"]["road_type"] = RoadType.URBAN_STRAIGHT
    draft["odd"]["maneuver"] = ManeuverType.RUN_RED_LIGHT
    draft["actors"][1]["position"] = {"lane_offset": 0, "s_offset_m": 0.0}
    draft["maneuvers"][0]["maneuver"] = ManeuverType.RUN_RED_LIGHT
    draft["maneuvers"][0]["trigger"] = {"type": "simulation_time", "value": 1.0}

    result = await validate_node(
        {
            "draft": ScenarioDraft.model_validate(draft),
            "odd_query": ODDQuery(road_type=RoadType.URBAN_STRAIGHT, maneuver=ManeuverType.RUN_RED_LIGHT),
            "kinematic_hints": {"adversary_relative_position": "ahead"},
        }
    )

    assert not [i for i in result["issues"] if i.code is IssueCode.INTENT_POSITION_MISMATCH]


@pytest.mark.asyncio
async def test_positional_intent_hint_still_applies_to_other_maneuvers(valid_draft: ScenarioDraft) -> None:
    """Chỉ `run_red_light` được miễn; miễn rộng hơn là mất một guard thật."""
    result = await validate_node(
        {
            "draft": valid_draft,
            "odd_query": ODDQuery(road_type=RoadType.INTERSECTION, maneuver=ManeuverType.CUT_IN),
            "kinematic_hints": {"adversary_relative_position": "ahead"},
        }
    )

    assert [i for i in result["issues"] if i.code is IssueCode.INTENT_POSITION_MISMATCH]
