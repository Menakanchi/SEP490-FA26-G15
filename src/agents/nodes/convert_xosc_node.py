from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from io import BytesIO
from typing import Any
from xml.etree import ElementTree as ET

from src.agents.state import ForgeState
from src.models.schemas import (
    DEFAULT_SUPPORT_POLICY,
    ActorSpec,
    IssueCode,
    ManeuverSpec,
    ManeuverType,
    ScenarioSpec,
    TimeOfDay,
    ValidationIssue,
    VehicleCategory,
    Weather,
)
from src.services.scenario.geometry import (
    cut_in_cannot_catch_up,
    cut_in_never_slows_down,
    cut_in_starts_in_ego_lane,
    cut_in_trigger_is_unsigned,
)
from src.services.scenario.templates import ScenarioTemplate, get_template

DETERMINISTIC_XOSC_DATE = "2026-07-29"
"""Stable fixture date; ScenarioSpec intentionally has no calendar-date field."""

_GLOBAL_PARAMETERS: tuple[tuple[str, str, str], ...] = (
    ("distance_success", "double", "50"),
    ("max_velocity_allowed", "double", "30"),
)


@dataclass(frozen=True)
class ConversionError(Exception):
    code: IssueCode
    message: str


def _number(value: float) -> str:
    """Stable, locale-independent formatting used by golden files."""
    return f"{value:.6f}".rstrip("0").rstrip(".") or "0"


def _relative_lane_position(
    parent: ET.Element,
    actor: ActorSpec,
    template: ScenarioTemplate,
    *,
    lane_offset: int | None = None,
) -> ET.Element:
    """``<RelativeLanePosition>`` cho một actor, theo hệ làn của template.

    Ba chỗ dựng element này — spawn ở ``Init``, đích của ``jaywalk``, và chỗ
    xoay đầu của ``wrong_way`` — và cả ba đều phải nhân ``lane_offset`` với
    ``lane_sign``. Dấu đó là ADR-012: ScenarioRunner 0.9.15 làm số học thẳng
    trên ``lane_id``, nên quên nhân ở một chỗ sẽ đặt actor sang **phía đối
    diện** của ego. File .xosc vẫn hợp lệ, scenario vẫn chạy, chỉ là tình huống
    nguy hiểm xảy ra ở làn không có ai.

    ``lane_offset`` ghi đè chỉ dành cho ``jaywalk``, nơi actor đi **ngược** phía
    xuất phát của nó để băng qua trước mặt ego.
    """
    lane_sign = 1 if template.ego_spawn.lane_id > 0 else -1
    offset = actor.position.lane_offset if lane_offset is None else lane_offset
    return ET.SubElement(
        parent,
        "RelativeLanePosition",
        entityRef="hero",
        dLane=str(offset * lane_sign),
        ds=_number(actor.position.s_offset_m),
        offset="0",
    )


def _condition(parent: ET.Element, name: str) -> ET.Element:
    """``<ConditionGroup><Condition name=… delay="0" conditionEdge="rising">``.

    Năm chỗ trong file dựng đúng cặp element này với đúng hai thuộc tính cố
    định. ``conditionEdge`` gõ nhầm thành ``falling`` ở một bản sao là một
    trigger không bao giờ bắn — kịch bản chạy trót lọt và **không có gì xảy
    ra**, đúng cái bẫy mà ``TRIGGER_AFTER_END`` sinh ra để chặn.
    """
    group = ET.SubElement(parent, "ConditionGroup")
    return ET.SubElement(group, "Condition", name=name, delay="0", conditionEdge="rising")


def _simulation_time_condition(parent: ET.Element, name: str, value: str) -> None:
    """Điều kiện "quá giây thứ N". Dùng cho StartTrigger/StopTrigger của Act."""
    by_value = ET.SubElement(_condition(parent, name), "ByValueCondition")
    ET.SubElement(by_value, "SimulationTimeCondition", value=value, rule="greaterThan")


def _vehicle_blueprint(category: VehicleCategory) -> tuple[str, str]:
    mapping = {
        VehicleCategory.CAR: ("vehicle.tesla.model3", "car"),
        VehicleCategory.MOTORCYCLE: ("vehicle.yamaha.yzf", "motorbike"),
        VehicleCategory.TRUCK: ("vehicle.carlamotors.carlacola", "truck"),
        VehicleCategory.BICYCLE: ("vehicle.diamondback.century", "bicycle"),
    }
    try:
        return mapping[category]
    except KeyError as exc:
        raise ConversionError(IssueCode.CONVERTER_ERROR, f"No vehicle mapping for {category.value}") from exc


def _add_vehicle(parent: ET.Element, actor: ActorSpec) -> None:
    blueprint, osc_category = _vehicle_blueprint(actor.category)
    vehicle = ET.SubElement(parent, "Vehicle", name=blueprint, vehicleCategory=osc_category)
    ET.SubElement(vehicle, "ParameterDeclarations")
    ET.SubElement(vehicle, "Performance", maxSpeed="69.444", maxAcceleration="200", maxDeceleration="10")
    box = ET.SubElement(vehicle, "BoundingBox")
    ET.SubElement(box, "Center", x="1.5", y="0", z="0.9")
    ET.SubElement(box, "Dimensions", width="2.1", length="4.5", height="1.8")
    axles = ET.SubElement(vehicle, "Axles")
    ET.SubElement(
        axles, "FrontAxle", maxSteering="0.5", wheelDiameter="0.6", trackWidth="1.8", positionX="3.1", positionZ="0.3"
    )
    ET.SubElement(
        axles, "RearAxle", maxSteering="0", wheelDiameter="0.6", trackWidth="1.8", positionX="0", positionZ="0.3"
    )
    properties = ET.SubElement(vehicle, "Properties")
    ET.SubElement(properties, "Property", name="type", value="ego_vehicle" if actor.is_ego else "simulation")


def _add_pedestrian(parent: ET.Element, actor: ActorSpec) -> None:
    pedestrian = ET.SubElement(
        parent,
        "Pedestrian",
        name="walker.pedestrian.0001",
        model="walker.pedestrian.0001",
        mass="80",
        pedestrianCategory="pedestrian",
    )
    ET.SubElement(pedestrian, "ParameterDeclarations")
    box = ET.SubElement(pedestrian, "BoundingBox")
    ET.SubElement(box, "Center", x="0", y="0", z="0.9")
    ET.SubElement(box, "Dimensions", width="0.6", length="0.6", height="1.8")
    properties = ET.SubElement(pedestrian, "Properties")
    ET.SubElement(properties, "Property", name="type", value="simulation")


def _add_speed_action(parent: ET.Element, target_kmh: float, *, abrupt: bool = False) -> None:
    longitudinal = ET.SubElement(parent, "LongitudinalAction")
    speed = ET.SubElement(longitudinal, "SpeedAction")
    ET.SubElement(
        speed,
        "SpeedActionDynamics",
        dynamicsShape="step" if abrupt else "linear",
        value="0" if abrupt else "5",
        dynamicsDimension="time" if abrupt else "rate",
    )
    target = ET.SubElement(speed, "SpeedActionTarget")
    ET.SubElement(target, "AbsoluteTargetSpeed", value=_number(target_kmh / 3.6))


def _lane_change(parent: ET.Element, *, slow: bool, lane_change_value: int) -> None:
    if lane_change_value == 0:
        raise ConversionError(
            IssueCode.CONVERTER_ERROR,
            "RelativeTargetLane value=0 crashes ScenarioRunner 0.9.15",
        )
    lateral = ET.SubElement(parent, "LateralAction")
    action = ET.SubElement(lateral, "LaneChangeAction")
    ET.SubElement(
        action,
        "LaneChangeActionDynamics",
        dynamicsShape="linear" if slow else "sinusoidal",
        value="45" if slow else "30",
        dynamicsDimension="distance",
    )
    target = ET.SubElement(action, "LaneChangeTarget")
    # ScenarioRunner 0.9.15 treats this as signed lane count and crashes on 0.
    # Semantic lane_offset already has the physical sign needed to return to ego:
    # actor left (<0) moves right (<0), actor right (>0) moves left (>0).
    ET.SubElement(target, "RelativeTargetLane", entityRef="hero", value=str(lane_change_value))


def _sudden_brake(parent: ET.Element, m: ManeuverSpec, _actor: ActorSpec) -> None:
    _add_speed_action(parent, m.target_speed_kmh if m.target_speed_kmh is not None else 0, abrupt=False)


def _stop_in_lane(parent: ET.Element, m: ManeuverSpec, _actor: ActorSpec) -> None:
    _add_speed_action(parent, 0, abrupt=True)


def _run_red_light(parent: ET.Element, m: ManeuverSpec, actor: ActorSpec) -> None:
    """Keep moving through the junction instead of stopping for its signal."""
    target_speed = m.target_speed_kmh if m.target_speed_kmh is not None else actor.initial_speed_kmh
    if target_speed <= 0:
        raise ConversionError(IssueCode.CONVERTER_ERROR, "run_red_light requires a positive moving speed")
    _add_speed_action(parent, target_speed, abrupt=True)


def _lane_drift(parent: ET.Element, actor: ActorSpec) -> None:
    """Partially invade the ego side without completing a lane change."""
    lateral = ET.SubElement(parent, "LateralAction")
    action = ET.SubElement(lateral, "LaneOffsetAction", continuous="true")
    ET.SubElement(action, "LaneOffsetActionDynamics", maxLateralAcc="0.4", dynamicsShape="linear")
    target = ET.SubElement(action, "LaneOffsetTarget")
    # OpenSCENARIO offset is positive to the left, negative to the right.
    offset = 0.7 if actor.position.lane_offset > 0 else -0.7
    ET.SubElement(target, "AbsoluteTargetLaneOffset", value=_number(offset))


ActionBuilder = Callable[[ET.Element, ManeuverSpec, ActorSpec], None]
MANEUVER_BUILDERS: dict[ManeuverType, ActionBuilder] = {
    ManeuverType.SUDDEN_BRAKE: _sudden_brake,
    ManeuverType.RUN_RED_LIGHT: _run_red_light,
    ManeuverType.STOP_IN_LANE: _stop_in_lane,
}

SPECIAL_BUILDERS = frozenset(
    {
        ManeuverType.CUT_IN,
        ManeuverType.JAYWALK,
        ManeuverType.WRONG_WAY,
        ManeuverType.LANE_DRIFT,
    }
)


def _assert_catalog_consistent(template: ScenarioTemplate, maneuver: ManeuverType) -> None:
    ordinary_builders = frozenset(MANEUVER_BUILDERS)
    if ordinary_builders & SPECIAL_BUILDERS:
        raise ConversionError(
            IssueCode.TEMPLATE_CATALOG_INCONSISTENT,
            "A maneuver has both an ordinary and a special converter builder",
        )
    builder_keys = ordinary_builders | SPECIAL_BUILDERS
    if builder_keys != frozenset(ManeuverType):
        raise ConversionError(
            IssueCode.TEMPLATE_CATALOG_INCONSISTENT,
            "Maneuver enum and converter builders are out of sync",
        )
    if not template.supported_maneuvers <= builder_keys:
        raise ConversionError(
            IssueCode.TEMPLATE_CATALOG_INCONSISTENT,
            "Template catalog references a maneuver without a converter builder",
        )
    if maneuver not in template.supported_maneuvers:
        raise ConversionError(
            IssueCode.TEMPLATE_CATALOG_INCONSISTENT,
            f"Template {template.map_name}/{template.road_type.value} does not support {maneuver.value}",
        )


def _add_trigger(parent: ET.Element, m: ManeuverSpec) -> None:
    condition = _condition(parent, f"trigger_{m.maneuver.value}")
    if m.trigger.type == "distance_to_ego":
        by_entity = ET.SubElement(condition, "ByEntityCondition")
        entities = ET.SubElement(by_entity, "TriggeringEntities", triggeringEntitiesRule="any")
        ET.SubElement(entities, "EntityRef", entityRef="hero")
        entity_condition = ET.SubElement(by_entity, "EntityCondition")
        ET.SubElement(
            entity_condition,
            "RelativeDistanceCondition",
            entityRef=m.actor_name,
            relativeDistanceType="longitudinal",
            value=_number(m.trigger.value),
            freespace="true",
            rule="lessThan",
        )
    else:
        by_value = ET.SubElement(condition, "ByValueCondition")
        ET.SubElement(by_value, "SimulationTimeCondition", value=_number(m.trigger.value), rule="greaterThan")


def _add_init(storyboard: ET.Element, spec: ScenarioSpec, template: ScenarioTemplate) -> None:
    init = ET.SubElement(storyboard, "Init")
    actions = ET.SubElement(init, "Actions")
    global_action = ET.SubElement(actions, "GlobalAction")
    environment_action = ET.SubElement(global_action, "EnvironmentAction")
    environment = ET.SubElement(
        environment_action, "Environment", name=f"{spec.odd.weather.value}_{spec.time_of_day.value}"
    )
    hour = {TimeOfDay.DAY: 12, TimeOfDay.DUSK: 18, TimeOfDay.NIGHT: 23}[spec.time_of_day]
    ET.SubElement(
        environment,
        "TimeOfDay",
        animation="false",
        dateTime=f"{DETERMINISTIC_XOSC_DATE}T{hour:02d}:00:00",
    )
    cloud_state, precipitation_type, intensity, visual_range = {
        Weather.CLEAR: ("free", "dry", "0", "100000"),
        Weather.RAIN: ("cloudy", "rain", "0.5", "5000"),
        Weather.HEAVY_RAIN: ("overcast", "rain", "1", "1500"),
        Weather.FOG: ("overcast", "dry", "0", "200"),
    }[spec.odd.weather]
    weather = ET.SubElement(environment, "Weather", cloudState=cloud_state)
    ET.SubElement(weather, "Sun", intensity="0.85", azimuth="0", elevation="1.31")
    ET.SubElement(weather, "Fog", visualRange=visual_range)
    ET.SubElement(weather, "Precipitation", precipitationType=precipitation_type, intensity=intensity)
    ET.SubElement(environment, "RoadCondition", frictionScaleFactor="0.7" if precipitation_type == "rain" else "1")
    for actor in spec.actors:
        private = ET.SubElement(actions, "Private", entityRef=actor.name)
        teleport_private = ET.SubElement(private, "PrivateAction")
        teleport = ET.SubElement(teleport_private, "TeleportAction")
        position = ET.SubElement(teleport, "Position")
        if actor.is_ego:
            spawn = template.ego_spawn
            ET.SubElement(
                position,
                "WorldPosition",
                x=_number(spawn.x),
                y=_number(spawn.y),
                z=_number(spawn.z),
                h=_number(spawn.h),
            )
        else:
            _relative_lane_position(position, actor, template)
        speed_private = ET.SubElement(private, "PrivateAction")
        _add_speed_action(speed_private, actor.initial_speed_kmh, abrupt=True)


def _add_jaywalk_action(
    parent: ET.Element,
    actor: ActorSpec,
    template: ScenarioTemplate,
) -> None:
    if actor.category is not VehicleCategory.PEDESTRIAN:
        raise ConversionError(IssueCode.CONVERTER_ERROR, "jaywalk requires a pedestrian actor")
    if actor.position.lane_offset == 0:
        raise ConversionError(IssueCode.CONVERTER_ERROR, "jaywalk actor must start outside the ego lane")

    routing = ET.SubElement(parent, "RoutingAction")
    acquire = ET.SubElement(routing, "AcquirePositionAction")
    position = ET.SubElement(acquire, "Position")
    # Đích nằm ở phía đối diện chỗ xuất phát: người đi bộ băng ngang qua ego.
    _relative_lane_position(position, actor, template, lane_offset=-actor.position.lane_offset)


def _add_wrong_way_action(parent: ET.Element, actor: ActorSpec, template: ScenarioTemplate) -> None:
    """Rotate the actor 180 degrees at its semantic lane-relative position."""
    teleport = ET.SubElement(parent, "TeleportAction")
    position = ET.SubElement(teleport, "Position")
    relative = _relative_lane_position(position, actor, template)
    ET.SubElement(relative, "Orientation", h="3.141593", p="0", r="0", type="relative")


def _add_maneuver_action(
    parent: ET.Element,
    maneuver: ManeuverSpec,
    actor: ActorSpec,
    template: ScenarioTemplate,
) -> None:
    if maneuver.maneuver is ManeuverType.CUT_IN:
        if cut_in_starts_in_ego_lane(actor):
            raise ConversionError(
                IssueCode.CONVERTER_ERROR,
                f"{maneuver.maneuver.value} requires actor {actor.name} to start outside the ego lane",
            )
        _lane_change(
            parent,
            slow=False,
            lane_change_value=actor.position.lane_offset,
        )
        return
    if maneuver.maneuver is ManeuverType.LANE_DRIFT:
        if actor.position.lane_offset == 0:
            raise ConversionError(
                IssueCode.CONVERTER_ERROR,
                f"lane_drift requires actor {actor.name} to start beside the ego lane",
            )
        _lane_drift(parent, actor)
        return
    if maneuver.maneuver is ManeuverType.WRONG_WAY:
        _add_wrong_way_action(parent, actor, template)
        return
    MANEUVER_BUILDERS[maneuver.maneuver](parent, maneuver, actor)


def _add_event_actions(
    event: ET.Element,
    index: int,
    maneuver: ManeuverSpec,
    actor: ActorSpec,
    template: ScenarioTemplate,
) -> None:
    if maneuver.maneuver is ManeuverType.JAYWALK:
        speed = maneuver.target_speed_kmh if maneuver.target_speed_kmh is not None else actor.initial_speed_kmh
        if speed <= 0:
            raise ConversionError(IssueCode.CONVERTER_ERROR, "jaywalk requires a positive walking speed")
        speed_action = ET.SubElement(event, "Action", name=f"action_{index}_jaywalk_speed")
        _add_speed_action(ET.SubElement(speed_action, "PrivateAction"), speed, abrupt=True)
        route_action = ET.SubElement(event, "Action", name=f"action_{index}_jaywalk_route")
        _add_jaywalk_action(
            ET.SubElement(route_action, "PrivateAction"),
            actor,
            template,
        )
        return

    action = ET.SubElement(event, "Action", name=f"action_{index}_{maneuver.maneuver.value}")
    action_parent = ET.SubElement(action, "PrivateAction")
    _add_maneuver_action(action_parent, maneuver, actor, template)


def _add_cut_in_slowdown(maneuver_el: ET.Element, index: int, maneuver: ManeuverSpec) -> None:
    """Reduce speed only after the lane-change event has completed."""
    if maneuver.target_speed_kmh is None:
        return
    event = ET.SubElement(maneuver_el, "Event", name=f"event_{index}_brake_after_cut_in", priority="overwrite")
    action = ET.SubElement(event, "Action", name=f"action_{index}_slow_down")
    _add_speed_action(ET.SubElement(action, "PrivateAction"), maneuver.target_speed_kmh, abrupt=False)
    trigger = ET.SubElement(event, "StartTrigger")
    condition = _condition(trigger, f"trigger_{index}_after_cut_in")
    by_value = ET.SubElement(condition, "ByValueCondition")
    ET.SubElement(
        by_value,
        "StoryboardElementStateCondition",
        storyboardElementType="event",
        storyboardElementRef=f"event_{index}_{maneuver.maneuver.value}",
        state="completeState",
    )


def _add_criteria_stop_trigger(storyboard: ET.Element, spec: ScenarioSpec) -> None:
    stop = ET.SubElement(storyboard, "StopTrigger")
    group = ET.SubElement(stop, "ConditionGroup")
    # NOTE: mọi criterion nằm chung MỘT ConditionGroup, nên chỗ này dựng
    # `<Condition>` thẳng thay vì qua `_condition` (vốn mở group riêng mỗi lần).
    # ScenarioRunner 0.9.15 uses empty attributes as its no-argument criterion
    # adapter. With a non-empty parameterRef, it passes float(value) as the
    # criterion constructor's second positional argument. That would become
    # CollisionTest.other_actor or RunningRedLightTest.name and break runtime.
    criteria: list[tuple[str, str, str]] = [
        ("CollisionTest", "", ""),
        ("DrivenDistanceTest", "distance_success", "50"),
        ("MaxVelocityTest", "max_velocity_allowed", "30"),
    ]
    if any(m.maneuver is ManeuverType.LANE_DRIFT for m in spec.maneuvers):
        criteria.append(("KeepLaneTest", "", ""))
    if any(m.maneuver is ManeuverType.RUN_RED_LIGHT for m in spec.maneuvers):
        criteria.append(("RunningRedLightTest", "", ""))
    if any(m.maneuver is ManeuverType.WRONG_WAY for m in spec.maneuvers):
        criteria.append(("WrongLaneTest", "", ""))
    for name, parameter_ref, value in criteria:
        condition = ET.SubElement(group, "Condition", name=f"criteria_{name}", delay="0", conditionEdge="rising")
        by_value = ET.SubElement(condition, "ByValueCondition")
        ET.SubElement(by_value, "ParameterCondition", parameterRef=parameter_ref, value=value, rule="lessThan")


def convert_spec_to_xosc(spec: ScenarioSpec) -> str:
    ego = next(actor for actor in spec.actors if actor.is_ego)
    if ego.name != "hero":
        raise ConversionError(
            IssueCode.CONVERTER_ERROR,
            "ScenarioRunner 0.9.15 requires the ego actor to be named 'hero'",
        )
    if not DEFAULT_SUPPORT_POLICY.supports(
        spec.odd.road_type,
        spec.odd.actor_type,
        spec.odd.maneuver,
    ):
        raise ConversionError(
            IssueCode.TEMPLATE_CATALOG_INCONSISTENT,
            f"Unsupported converter combination: {spec.odd.key}",
        )
    template = get_template(spec.odd.road_type)
    if template is None:
        raise ConversionError(
            IssueCode.TEMPLATE_CATALOG_INCONSISTENT,
            f"No template for road type {spec.odd.road_type.value}",
        )
    for maneuver in spec.maneuvers:
        _assert_catalog_consistent(template, maneuver.maneuver)
        actor = next(a for a in spec.actors if a.name == maneuver.actor_name)
        if maneuver.maneuver is ManeuverType.CUT_IN:
            # Cùng bốn vị từ mà validate_node dùng — xem
            # ``services/scenario/geometry.py``. Tới đây thì không repair được
            # nữa, nên chúng là lỗi cứng thay vì ValidationIssue.
            if cut_in_trigger_is_unsigned(maneuver):
                raise ConversionError(
                    IssueCode.CONVERTER_ERROR,
                    "cut_in requires simulation_time because RelativeDistanceCondition is unsigned",
                )
            if cut_in_cannot_catch_up(actor, ego):
                raise ConversionError(
                    IssueCode.CONVERTER_ERROR,
                    "cut_in actor must start behind ego and move faster before cutting in",
                )
            if cut_in_never_slows_down(maneuver, actor, ego):
                raise ConversionError(
                    IssueCode.CONVERTER_ERROR,
                    "cut_in target_speed_kmh must be present and lower than ego speed",
                )

    root = ET.Element("OpenSCENARIO")
    ET.SubElement(
        root,
        "FileHeader",
        revMajor="1",
        revMinor="0",
        date=f"{DETERMINISTIC_XOSC_DATE}T00:00:00",
        description=spec.title,
        author="ScenarioForge",
    )
    parameter_declarations = ET.SubElement(root, "ParameterDeclarations")
    for name, parameter_type, value in _GLOBAL_PARAMETERS:
        ET.SubElement(
            parameter_declarations,
            "ParameterDeclaration",
            name=name,
            parameterType=parameter_type,
            value=value,
        )
    ET.SubElement(root, "CatalogLocations")
    road = ET.SubElement(root, "RoadNetwork")
    ET.SubElement(road, "LogicFile", filepath=template.map_name)
    ET.SubElement(road, "SceneGraphFile", filepath="")

    entities = ET.SubElement(root, "Entities")
    for actor in spec.actors:
        obj = ET.SubElement(entities, "ScenarioObject", name=actor.name)
        if actor.category is VehicleCategory.PEDESTRIAN:
            _add_pedestrian(obj, actor)
        else:
            _add_vehicle(obj, actor)

    storyboard = ET.SubElement(root, "Storyboard")
    _add_init(storyboard, spec, template)
    story = ET.SubElement(storyboard, "Story", name=f"story_{spec.scenario_id}")
    ET.SubElement(story, "ParameterDeclarations")
    act = ET.SubElement(story, "Act", name=f"act_{spec.scenario_id}")
    actors_by_name = {actor.name: actor for actor in spec.actors}
    for index, maneuver in enumerate(spec.maneuvers):
        group = ET.SubElement(
            act, "ManeuverGroup", maximumExecutionCount="1", name=f"group_{index}_{maneuver.actor_name}"
        )
        actors = ET.SubElement(group, "Actors", selectTriggeringEntities="false")
        ET.SubElement(actors, "EntityRef", entityRef=maneuver.actor_name)
        maneuver_el = ET.SubElement(group, "Maneuver", name=f"maneuver_{index}_{maneuver.maneuver.value}")
        ET.SubElement(maneuver_el, "ParameterDeclarations")
        event = ET.SubElement(
            maneuver_el, "Event", name=f"event_{index}_{maneuver.maneuver.value}", priority="overwrite"
        )
        _add_event_actions(
            event,
            index,
            maneuver,
            actors_by_name[maneuver.actor_name],
            template,
        )
        _add_trigger(ET.SubElement(event, "StartTrigger"), maneuver)
        if maneuver.maneuver is ManeuverType.CUT_IN:
            _add_cut_in_slowdown(maneuver_el, index, maneuver)

    _simulation_time_condition(ET.SubElement(act, "StartTrigger"), "start_act", "0")
    _simulation_time_condition(ET.SubElement(act, "StopTrigger"), "stop_act", _number(spec.duration_s))

    _add_criteria_stop_trigger(storyboard, spec)

    ET.indent(root, space="  ")
    buffer = BytesIO()
    ET.ElementTree(root).write(
        buffer,
        encoding="UTF-8",
        xml_declaration=True,
        short_empty_elements=True,
    )
    return buffer.getvalue().decode("UTF-8") + "\n"


async def convert_xosc_node(state: ForgeState) -> dict[str, Any]:
    """Convert a promoted spec; converter failures are terminal, never repairable."""
    try:
        value = state.get("spec")
        if value is None:
            raise ConversionError(IssueCode.CONVERTER_ERROR, "Missing promoted spec for conversion")
        spec = value if isinstance(value, ScenarioSpec) else ScenarioSpec.model_validate(value)
        return {"xosc_content": convert_spec_to_xosc(spec)}
    except ConversionError as exc:
        issue = ValidationIssue(code=exc.code, path="/converter", message_vi=exc.message)
    except Exception as exc:  # Converter bugs are system errors, not LLM repair input.
        issue = ValidationIssue(
            code=IssueCode.CONVERTER_ERROR, path="/converter", message_vi=str(exc) or type(exc).__name__
        )
    return {"issues": [issue], "failed_reason": issue.message_vi}
