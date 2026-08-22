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
                # Ego 30 km/h, chủ thể 40 km/h từ sau 10 m -> đi ngang nhau ở giây
                # 3,6. Trigger 7,0 cho nó vượt lên 9,4 m rồi mới tạt — trên ngưỡng
                # một thân xe. Bản cũ đặt 5,0 (vượt 3,89 m) và đó chính là hình học
                # đo được là TÔNG ĐUÔI trên CARLA, xem `MIN_CUT_IN_LEAD_M`.
                trigger=TriggerCondition(type="simulation_time", value=7.0),
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
async def test_cut_in_must_overtake_by_a_vehicle_length_not_just_by_a_hair() -> None:
    """Vượt qua thôi chưa đủ — vượt 5 m rồi tạt là cắt vào sườn ego, không phải trước mũi.

    Bốn kịch bản chạy thật ngày 22/08 tách thành hai cụm theo khoảng vượt lúc
    trigger: 4,67 m và 5,05 m đều thành tông đuôi; 8,33 m và 13,89 m đều tạt đầu
    đúng ý. Vị từ cũ chỉ đòi biên dương nên hai ca đầu đi lọt.
    """

    def draft(trigger_s: float) -> ScenarioDraft:
        # sc_021: ego 96, chủ thể 110 từ sau 28 m -> đi ngang nhau ở giây 7,2.
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
                    trigger=TriggerCondition(type="simulation_time", value=trigger_s),
                    target_speed_kmh=70.0,
                )
            ],
            duration_s=30.0,
        )

    async def codes(trigger_s: float) -> set[IssueCode]:
        result = await validate_node(
            {
                "draft": draft(trigger_s),
                "odd_query": ODDQuery(actor_type=ActorType.CAR, maneuver=ManeuverType.CUT_IN),
            }
        )
        return {i.code for i in result["issues"]}

    # 8,5 s = vượt 5,05 m, đúng hình học đã đo được là tông đuôi.
    assert IssueCode.GEOM_CUTIN_BEFORE_OVERTAKE in await codes(8.5)
    # 10,0 s = vượt 10,9 m, trên ngưỡng một thân xe.
    assert IssueCode.GEOM_CUTIN_BEFORE_OVERTAKE not in await codes(10.0)
