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
                trigger=TriggerCondition(type="simulation_time", value=5.0),
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


@pytest.mark.asyncio
@pytest.mark.parametrize("path", VALID_SPEC_FIXTURES, ids=lambda path: path.stem)
async def test_valid_fixture_files_return_no_validation_errors(path: Path) -> None:
    spec = _json(path)
    spec.pop("_comment", None)
    draft = {key: value for key, value in spec.items() if key not in {"scenario_id", "description_vi"}}
    odd_query = {**draft["odd"], "inferred": []}

    result = await validate_node({"draft": draft, "odd_query": odd_query})

    assert result["issues"] == []


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


@pytest.mark.asyncio
async def test_cut_in_distance_trigger_is_rejected(valid_draft: ScenarioDraft) -> None:
    draft = valid_draft.model_dump()
    draft["maneuvers"][0]["trigger"] = {"type": "distance_to_ego", "value": 15.0}
    result = await validate_node({"draft": draft})
    assert any(i.code is IssueCode.TRIGGER_DISTANCE_UNSIGNED for i in result["issues"])
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
