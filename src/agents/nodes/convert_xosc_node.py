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
    MIN_CUT_IN_LEAD_M,
    actor_beyond_anchor_reach,
    cut_in_cannot_catch_up,
    cut_in_lead_too_short,
    cut_in_never_slows_down,
    cut_in_starts_in_ego_lane,
    cut_in_trigger_is_not_positional,
)
from src.services.scenario.templates import ScenarioTemplate, get_template

DETERMINISTIC_XOSC_DATE = "2026-07-29"
"""Stable fixture date; ScenarioSpec intentionally has no calendar-date field."""

CUT_IN_REACH_TOLERANCE_M = 2.5
"""Bán kính trigger vị trí; converter bù để sự kiện bắn đúng ``lead_distance``."""

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
    s_offset_m: float | None = None,
) -> ET.Element:
    """``<RelativeLanePosition>`` cho một actor, theo hệ làn của template.

    Hai chỗ dựng element này — spawn ở ``Init`` và đích của ``jaywalk`` — đều
    phải nhân ``lane_offset`` với
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
        ds=_number(actor.position.s_offset_m if s_offset_m is None else s_offset_m),
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


_WEATHER_TABLE: dict[Weather, tuple[str, str, str, str, str]] = {
    # (cloudState, kiểu mưa, cường độ mưa, tầm nhìn, CƯỜNG ĐỘ NẮNG)
    Weather.CLEAR: ("free", "dry", "0", "100000", "0.85"),
    Weather.RAIN: ("cloudy", "rain", "0.5", "5000", "0.35"),
    Weather.HEAVY_RAIN: ("overcast", "rain", "1", "1500", "0.10"),
    Weather.FOG: ("overcast", "dry", "0", "25", "0.15"),
}
"""Thời tiết quy ra thuộc tính OpenSCENARIO.

**``cloudState`` bị ScenarioRunner bỏ qua hoàn toàn.** Nó tính độ mây bằng
``cloudiness = 100 - Sun.intensity * 100`` (`openscenario_parser.py:485`) và
không hề đọc ``cloudState``. Bản trước hardcode ``Sun intensity="0.85"`` cho mọi
kiểu thời tiết, nên **mây luôn 15% kể cả khi trời mưa**: đo trên ``sc_023`` ngày
23/08/2026 ra ``cloudiness=15``, ``sun_altitude=75°`` — mưa lất phất dưới nắng
giữa trưa. Người xem nói thẳng "tôi không thấy trời mưa", và họ đúng.

Giữ ``cloudState`` lại dù ScenarioRunner không dùng: nó là thuộc tính chuẩn của
OpenSCENARIO, và công cụ khác (esmini) có đọc.

``visualRange`` cũng bị ScenarioRunner hiểu khác chuẩn: nó gán thẳng vào
``carla_weather.fog_distance``, mà trong CARLA đó là **khoảng cách sương bắt đầu
xuất hiện**, không phải tầm nhìn xa. Bản trước ghi 200 (ý là "nhìn xa 200 m") nên
CARLA hiểu thành "trong 200 m quanh xe không có sương" — đo ngày 23/08/2026:
``fog_density=100`` mà người xem nói "tôi không thấy fog", và họ đúng. 25 đưa
sương lại sát xe.

Lưu ý khi đọc file bằng công cụ khác: chuẩn OpenSCENARIO định nghĩa
``Sun@intensity`` là **độ rọi tính bằng lux**, còn ScenarioRunner diễn giải nó
như một tỉ lệ 0..1. Giá trị ở đây chọn theo cách hiểu của ScenarioRunner vì đó là
thứ thật sự chạy kịch bản.
"""

_SUN_ELEVATION_RAD: dict[TimeOfDay, str] = {
    TimeOfDay.DAY: "1.31",  # 75 độ, nắng giữa trưa
    TimeOfDay.DUSK: "0.17",  # 10 độ, mặt trời sát chân trời
    TimeOfDay.NIGHT: "-0.26",  # -15 độ; CARLA hiểu góc âm là đêm
}
"""Góc mặt trời theo thời điểm trong ngày, radian.

Cùng một lỗi với ``Sun@intensity``: bản trước hardcode ``elevation="1.31"`` nên
**kịch bản ban đêm cũng hiện ra giữa trưa nắng**. ``dateTime`` có đổi theo giờ
(12/18/23) nhưng ScenarioRunner chỉ dùng nó cho animation, còn góc mặt trời thì
đọc thẳng từ thuộc tính này.
"""


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


DRIFT_OFFSET_M = 0.95
"""Xe ``lane_drift`` lấn bao nhiêu mét khỏi tim làn của nó.

Con số này rơi vào một **cửa sổ hẹp**, và ba lần đầu đều trượt:

    lệnh 0,70 m  ->  mép thân còn cách vạch ~0,08 m   (chưa đè vạch)
    lệnh 0,95 m  ->  đè vạch ~0,35 m, khe hở ~0,37 m  (bản này)
    lệnh 1,35 m  ->  đè vạch  0,68 m, khe hở  0,04 m  (đo thật: CHẠM)
    lệnh 2,20 m  ->  khe hở âm                        (đâm hẳn)

Người xem trên CARLA bắt được cả hai đầu: bản 0,7 m — *"vẫn chưa lấn sang làn của
ego, chỉ gần chạm vạch thôi"*; bản 2,2 m (lấy mốc **tâm** xe vượt vạch) — *"lần
này thì tôi thấy nó còn va chạm nhau rồi"*. Cả hai nhận xét đều đúng.

Cửa sổ hẹp hơn tính trên giấy vì hai lý do chỉ lộ ra khi **đo thật** trên CARLA:

- tổng nửa thân hai xe là **2,00 m**, không phải 1,80 như giả định theo cỡ xe
  danh nghĩa — nên khoảng trống giữa hai làn chỉ còn 1,50 m chứ không phải 1,70;
- ``LaneOffsetAction`` **vượt quá lệnh ~0,18 m** trước khi ổn định.

Hai sai số đó cùng ăn về một phía, nên bản tính lý thuyết "1,35 m còn dư 0,35 m
khe hở" thực tế cho **0,04 m** — tức là chạm.

Xe rộng hơn (xe tải) vẫn có thể chạm ở cùng biên độ. Đó là hệ quả đúng của hình
học, không phải lỗi cần vá.
"""

DRIFT_LATERAL_ACC = 0.8
"""Gia tốc ngang tối đa của ``LaneOffsetAction``.

Thời gian lấn thành hình là ``2*sqrt(offset/acc)`` = 2,6 s với các hằng số ở đây.
Giữ 0,4 như cũ thì mất 3,7 s — dài hơn cửa sổ hai xe còn ở gần nhau trong nhiều
kịch bản, nên hành vi không kịp xảy ra.
"""


def _lane_drift(parent: ET.Element, actor: ActorSpec) -> None:
    """Partially invade the ego side without completing a lane change."""
    lateral = ET.SubElement(parent, "LateralAction")
    action = ET.SubElement(lateral, "LaneOffsetAction", continuous="true")
    ET.SubElement(action, "LaneOffsetActionDynamics", maxLateralAcc=_number(DRIFT_LATERAL_ACC), dynamicsShape="linear")
    target = ET.SubElement(action, "LaneOffsetTarget")
    # ScenarioRunner 0.9.15 dùng dấu NGƯỢC với quy ước OpenSCENARIO:
    # `ChangeActorLaneOffset` ghi rõ "positive distance imply a displacement to
    # the right" (atomic_behaviors.py:1122), và openscenario_parser.py:1405
    # truyền thẳng giá trị trong XML không đổi dấu.
    #
    # Bản trước lấy dấu theo quy ước chuẩn nên lấn NGƯỢC HƯỚNG trong mọi trường
    # hợp: xe ở bên trái ego dạt thêm sang trái, xe bên phải dạt thêm sang phải.
    # Hỏng im lặng — kịch bản vẫn chạy, XML vẫn hợp lệ, `CollisionTest` vẫn 0,
    # nên không có gì báo. Đo trên CARLA 22/08 với sc_906: khe hở ngang giữa hai
    # thân xe NỞ RỘNG từ 1,05 m lên 2,3 m sau khi "lấn".
    #
    # Actor bên trái ego (lane_offset < 0) muốn lấn về phía ego thì phải đi sang
    # phải, tức offset dương.
    offset = DRIFT_OFFSET_M if actor.position.lane_offset < 0 else -DRIFT_OFFSET_M
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


def _add_trigger(
    parent: ET.Element,
    m: ManeuverSpec,
    actor: ActorSpec,
    template: ScenarioTemplate,
) -> None:
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
    elif m.trigger.type == "lead_distance":
        by_entity = ET.SubElement(condition, "ByEntityCondition")
        entities = ET.SubElement(by_entity, "TriggeringEntities", triggeringEntitiesRule="any")
        ET.SubElement(entities, "EntityRef", entityRef=actor.name)
        entity_condition = ET.SubElement(by_entity, "EntityCondition")
        reach = ET.SubElement(
            entity_condition,
            "ReachPositionCondition",
            tolerance=_number(CUT_IN_REACH_TOLERANCE_M),
        )
        position = ET.SubElement(reach, "Position")

        # ReachPositionCondition bắn khi actor đi vào hình cầu tolerance. Actor
        # vượt từ phía sau tiếp cận biên dưới, nên đặt tâm xa hơn đúng tolerance;
        # actor vốn ở trước và bị ego đuổi tiếp cận biên trên, nên bù ngược lại.
        direction = 1.0 if actor.position.s_offset_m < m.trigger.value else -1.0
        target_lead_m = m.trigger.value + direction * CUT_IN_REACH_TOLERANCE_M
        _relative_lane_position(
            position,
            actor,
            template,
            s_offset_m=target_lead_m,
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
    cloud_state, precipitation_type, intensity, visual_range, sun_intensity = _WEATHER_TABLE[spec.odd.weather]
    weather = ET.SubElement(environment, "Weather", cloudState=cloud_state)
    ET.SubElement(
        weather,
        "Sun",
        intensity=sun_intensity,
        azimuth="0",
        elevation=_SUN_ELEVATION_RAD[spec.time_of_day],
    )
    ET.SubElement(weather, "Fog", visualRange=visual_range)
    ET.SubElement(weather, "Precipitation", precipitationType=precipitation_type, intensity=intensity)
    ET.SubElement(environment, "RoadCondition", frictionScaleFactor="0.7" if precipitation_type == "rain" else "1")
    if any(maneuver.maneuver is ManeuverType.RUN_RED_LIGHT for maneuver in spec.maneuvers):
        if not template.traffic_signal_name:
            raise ConversionError(
                IssueCode.TEMPLATE_CATALOG_INCONSISTENT,
                f"run_red_light template {template.road_type.value} has no traffic signal",
            )
        signal_global = ET.SubElement(actions, "GlobalAction")
        infrastructure = ET.SubElement(signal_global, "InfrastructureAction")
        signal_action = ET.SubElement(infrastructure, "TrafficSignalAction")
        ET.SubElement(
            signal_action,
            "TrafficSignalStateAction",
            name=template.traffic_signal_name,
            state="RED",
        )
        if template.ego_traffic_signal_name:
            ego_signal_global = ET.SubElement(actions, "GlobalAction")
            ego_infrastructure = ET.SubElement(ego_signal_global, "InfrastructureAction")
            ego_signal_action = ET.SubElement(ego_infrastructure, "TrafficSignalAction")
            ET.SubElement(
                ego_signal_action,
                "TrafficSignalStateAction",
                name=template.ego_traffic_signal_name,
                state="GREEN",
            )
    wrong_way_actors = {
        maneuver.actor_name for maneuver in spec.maneuvers if maneuver.maneuver is ManeuverType.WRONG_WAY
    }
    run_red_light_actors = {
        maneuver.actor_name for maneuver in spec.maneuvers if maneuver.maneuver is ManeuverType.RUN_RED_LIGHT
    }
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
        elif actor.name in run_red_light_actors:
            spawn = template.maneuver_actor_spawn
            if spawn is None:
                raise ConversionError(
                    IssueCode.TEMPLATE_CATALOG_INCONSISTENT,
                    f"run_red_light template {template.road_type.value} has no crossing actor spawn",
                )
            ET.SubElement(
                position,
                "WorldPosition",
                x=_number(spawn.x),
                y=_number(spawn.y),
                z=_number(spawn.z),
                h=_number(spawn.h),
            )
        else:
            relative = _relative_lane_position(position, actor, template)
            if actor.name in wrong_way_actors:
                # Xoay ngay trong Init, TRƯỚC khi SpeedAction đặt vận tốc. Bản cũ
                # teleport xoay ở Event sau khi xe đã chạy: CARLA đổi transform
                # nhưng giữ vector quán tính cũ, nên xe tải nhìn ngược đầu mà vẫn
                # trôi ra xa ego (sc_037: khe hở nhỏ nhất 20,42 m). Spawn đúng
                # hướng làm lệnh tốc độ ban đầu tác dụng dọc theo hướng ngược.
                ET.SubElement(relative, "Orientation", h="3.141593", p="0", r="0", type="relative")
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
    _relative_lane_position(position, actor, template, lane_offset=_far_shoulder_offset(actor, template))


def _far_shoulder_offset(actor: ActorSpec, template: ScenarioTemplate) -> int:
    """``lane_offset`` của lề bên kia đường — đích thật sự của người băng đường.

    Cách cũ lấy đích bằng ``-lane_offset``. Nó ngầm giả định ego nằm giữa mặt
    cắt ngang, mà điều đó **sai**: đo trên anchor Town04 thì hai lề nằm ở
    ``lane_offset`` +1 và -2, không đối xứng. Nên người đi bộ xuất phát ở lề (+1)
    lại đi tới -1 và **dừng giữa làn xe chạy** — nhìn ra ngay là vô lý, và cũng
    không phải "băng qua đường" theo bất kỳ nghĩa nào.

    Chọn lề xa hơn so với chỗ xuất phát, để đường đi cắt qua toàn bộ phần xe
    chạy — kể cả làn ego.
    """
    start = actor.position.lane_offset
    return max(template.shoulder_lane_offsets, key=lambda offset: abs(start - offset))


def _add_wrong_way_action(parent: ET.Element, maneuver: ManeuverSpec, actor: ActorSpec) -> None:
    """Giữ tốc độ xe chạy theo hướng ngược đã đặt trong ``Init``.

    Không teleport một xe đang chuyển động để xoay đầu: CARLA giữ quán tính cũ,
    nên hướng thân xe và hướng vận tốc có thể ngược nhau. ``Init`` đặt transform
    trước, còn action này chỉ khẳng định lại tốc độ mục tiêu. Route bám làn được
    dựng riêng bởi ``_add_wrong_way_route`` để chạy song song với action tốc độ.
    """
    target = maneuver.target_speed_kmh if maneuver.target_speed_kmh is not None else actor.initial_speed_kmh
    _add_speed_action(parent, target, abrupt=True)


def _add_wrong_way_route(
    parent: ET.Element,
    actor: ActorSpec,
    template: ScenarioTemplate,
) -> None:
    """Cấp chuỗi waypoint giảm dần để xe ngược chiều bám đúng làn đường cong.

    Chỉ xoay actor 180 độ là chưa đủ. ``NpcVehicleControl`` của ScenarioRunner
    không tự sinh lộ trình khi danh sách waypoint rỗng; nó giữ ga theo hướng
    thân xe. Ở khúc cong Town04, hướng đó là tiếp tuyến nên xe cắt ngang nhiều
    làn rồi đâm hộ lan. Route ``shortest`` dưới đây được giữ nguyên đúng thứ tự
    thay vì đưa qua GlobalRoutePlanner (planner chỉ biết chiều giao thông hợp
    lệ). Các ``ds`` giảm dần buộc LocalPlanner chạy ngược tuyến nhưng vẫn bám
    tâm chính làn actor đã được spawn.
    """
    route_lower_bound = template.s_offset_reach_m[0] + 5.0
    first_waypoint = actor.position.s_offset_m - 8.0
    if first_waypoint - route_lower_bound < 10.0:
        raise ConversionError(
            IssueCode.CONVERTER_ERROR,
            "wrong_way actor needs at least 18 m of backward route inside the template anchor",
        )

    routing = ET.SubElement(parent, "RoutingAction")
    assign = ET.SubElement(routing, "AssignRouteAction")
    route = ET.SubElement(assign, "Route", name=f"{actor.name}_wrong_way_route", closed="false")

    offsets: list[float] = []
    cursor = first_waypoint
    while cursor > route_lower_bound:
        # ScenarioRunner gọi ``waypoint.next(ds)[-1]`` cho ds >= 0, nhưng CARLA
        # cấm ``next(0)`` bằng ``RuntimeError: distance > 0.0``. Mốc 0 không
        # mang thêm hình học so với hai mốc ±10 m, nên bỏ nó khỏi route.
        if abs(cursor) > 1e-6:
            offsets.append(cursor)
        cursor -= 10.0
    offsets.append(route_lower_bound)

    for s_offset_m in offsets:
        waypoint = ET.SubElement(route, "Waypoint", routeStrategy="shortest")
        position = ET.SubElement(waypoint, "Position")
        _relative_lane_position(position, actor, template, s_offset_m=s_offset_m)


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
        _add_wrong_way_action(parent, maneuver, actor)
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

    if maneuver.maneuver is ManeuverType.WRONG_WAY:
        speed_action = ET.SubElement(event, "Action", name=f"action_{index}_wrong_way_speed")
        _add_wrong_way_action(
            ET.SubElement(speed_action, "PrivateAction"),
            maneuver,
            actor,
        )
        route_action = ET.SubElement(event, "Action", name=f"action_{index}_wrong_way_route")
        _add_wrong_way_route(
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


def _add_hold_open_event(maneuver_el: ET.Element, index: int, actor: ActorSpec, duration_s: float) -> None:
    """Giữ kịch bản chạy đủ ``duration_s`` thay vì đóng khi hết việc.

    ScenarioRunner dựng Act là ``Parallel(SUCCESS_ON_ONE, [Maneuvers, EndConditions])``
    (`srunner/scenarios/open_scenario.py`). Nên ``StopTrigger`` của Act là **nhánh
    OR**, không phải sàn thời gian: hành động cuối của adversary xong là toàn bộ
    kịch bản đóng ngay, kể cả khi mới ở giây thứ 2,6.

    Đo được ngày 22/08: bốn maneuver có hành động hoàn tất tức thì
    (`stop_in_lane`, `run_red_light`, `wrong_way` dùng `SpeedAction` step;
    `jaywalk` dùng `AcquirePositionAction`) đều kết thúc sau
    ~2,6 s với ego mới đi 16,6 m — chưa kịp tới chỗ adversary, nên không có cách
    nào xảy ra nguy hiểm. Chúng "chạy xong" mà không mô phỏng được gì.

    Event này không chạm vào vật lý. Trong ScenarioRunner, Event là
    ``Sequence([StartTrigger, Actions])`` nên nó ở trạng thái RUNNING suốt thời
    gian chờ trigger, giữ maneuver group không hoàn tất. Tới ``duration_s`` thì
    trigger và ``StopTrigger`` của Act cùng bắn trong một tick, nên hành động bên
    trong không kịp có hiệu lực — nó ở đây vì XSD bắt Event phải có ít nhất một
    ``Action``, không phải vì cần nó chạy.
    """
    event = ET.SubElement(maneuver_el, "Event", name=f"event_{index}_hold_open", priority="overwrite")
    action = ET.SubElement(event, "Action", name=f"action_{index}_hold_open")
    _add_speed_action(ET.SubElement(action, "PrivateAction"), actor.initial_speed_kmh, abrupt=True)
    trigger = ET.SubElement(event, "StartTrigger")
    condition = _condition(trigger, f"trigger_{index}_hold_open")
    by_value = ET.SubElement(condition, "ByValueCondition")
    ET.SubElement(by_value, "SimulationTimeCondition", value=_number(duration_s), rule="greaterThan")


def _add_collision_stop_conditions(stop_trigger: ET.Element, spec: ScenarioSpec) -> None:
    """Đóng Act ngay khi ego va chạm, thay vì chạy nốt cho đủ ``duration_s``.

    Mọi thứ sau va chạm đầu tiên là **dữ liệu bỏ đi**: xe bị hất khỏi làn nên
    ``adversary_lane_deviation_m`` của ``sc_001`` đọc ra 21,18 m trong khi giá trị
    thật là 1,689 m — đó là lý do ``trajectory.summarise`` cắt chuỗi mẫu tại điểm
    chạm. Mô phỏng tiếp phần đã biết chắc sẽ vứt chỉ đốt GPU: ``sc_001`` chạm ở
    giây 11,3 rồi chạy thêm 19 giây nữa.

    Đây là ``StopTrigger`` của Act, mà trigger trong OpenSCENARIO là **OR giữa các
    ConditionGroup** — nên thêm nhóm ở đây không đụng gì tới điều kiện hết giờ đã
    có: cái nào tới trước thì đóng.

    An toàn với cách đọc kết quả (``CollisionTest``, xem CLAUDE.md): trong
    ScenarioRunner, ``CollisionTest._count_collisions`` đặt ``test_status`` ngay
    trong callback của sensor chứ không đợi ``update()``, nên criterion đã ghi
    nhận va chạm trước khi cây hành vi kịp dừng.

    Không dùng thuộc tính ``delay`` để nán lại vài giây sau va chạm:
    ScenarioRunner hiện thực nó thành ``Sequence([TimeOut(delay), condition])``
    (`openscenario_parser.py:874`), tức là **bỏ qua** mọi va chạm trong ``delay``
    giây đầu — ngược hẳn với ý muốn.

    Chỉ đếm va chạm với diễn viên trong kịch bản, không dùng ``ByType``: đâm phải
    lan can hay xe nền không phải tình huống ta dựng ra, và đóng kịch bản vì
    chuyện đó là mất phần thú vị.
    """
    for actor in spec.actors:
        if actor.is_ego:
            continue
        condition = _condition(stop_trigger, f"stop_on_collision_{actor.name}")
        by_entity = ET.SubElement(condition, "ByEntityCondition")
        entities = ET.SubElement(by_entity, "TriggeringEntities", triggeringEntitiesRule="any")
        ET.SubElement(entities, "EntityRef", entityRef="hero")
        entity_condition = ET.SubElement(by_entity, "EntityCondition")
        collision = ET.SubElement(entity_condition, "CollisionCondition")
        ET.SubElement(collision, "EntityRef", entityRef=actor.name)


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
    # Không thêm RunningRedLightTest: OpenScenarioParser luôn gắn criterion này
    # vào ``ego_vehicles``, trong khi validator cấm ego mang maneuver và actor
    # vượt đèn đỏ nằm ở ``other_actors``. Giữ criterion sẽ báo SUCCESS cho sai
    # chiếc xe. Worker đo trực tiếp adversary và phát ``adversary_ran_red_light``.
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
    for actor in spec.actors:
        if not actor.is_ego and actor_beyond_anchor_reach(actor, template.s_offset_reach_m):
            raise ConversionError(
                IssueCode.CONVERTER_ERROR,
                f"{actor.name} ở s_offset_m={actor.position.s_offset_m} nằm ngoài đoạn đường "
                f"anchor phủ được {template.s_offset_reach_m} — ScenarioRunner sẽ không spawn được",
            )

    for maneuver in spec.maneuvers:
        _assert_catalog_consistent(template, maneuver.maneuver)
        actor = next(a for a in spec.actors if a.name == maneuver.actor_name)
        if maneuver.maneuver is ManeuverType.CUT_IN:
            # Cùng bốn vị từ mà validate_node dùng — xem
            # ``services/scenario/geometry.py``. Tới đây thì không repair được
            # nữa, nên chúng là lỗi cứng thay vì ValidationIssue.
            if cut_in_trigger_is_not_positional(maneuver):
                raise ConversionError(
                    IssueCode.CONVERTER_ERROR,
                    "cut_in requires lead_distance so it starts only after the actor is ahead of ego",
                )
            if cut_in_lead_too_short(maneuver):
                raise ConversionError(
                    IssueCode.CONVERTER_ERROR,
                    f"cut_in lead_distance must be at least {MIN_CUT_IN_LEAD_M} m",
                )
            if cut_in_cannot_catch_up(actor, ego):
                raise ConversionError(
                    IssueCode.CONVERTER_ERROR,
                    "cut_in actor and ego must be moving toward the same longitudinal meeting point",
                )
            if cut_in_never_slows_down(maneuver, actor, ego):
                raise ConversionError(
                    IssueCode.CONVERTER_ERROR,
                    "cut_in target_speed_kmh must be present and lower than ego speed",
                )
        if maneuver.maneuver is ManeuverType.RUN_RED_LIGHT and (
            actor.position.lane_offset != 0 or abs(actor.position.s_offset_m) > 1e-6
        ):
            raise ConversionError(
                IssueCode.CONVERTER_ERROR,
                "run_red_light actor position must be lane_offset=0, s_offset_m=0; "
                "the verified urban template places it on the perpendicular red-light approach",
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
        _add_trigger(
            ET.SubElement(event, "StartTrigger"),
            maneuver,
            actors_by_name[maneuver.actor_name],
            template,
        )
        if maneuver.maneuver is ManeuverType.CUT_IN:
            _add_cut_in_slowdown(maneuver_el, index, maneuver)
        _add_hold_open_event(maneuver_el, index, actors_by_name[maneuver.actor_name], spec.duration_s)

    _simulation_time_condition(ET.SubElement(act, "StartTrigger"), "start_act", "0")
    act_stop = ET.SubElement(act, "StopTrigger")
    _simulation_time_condition(act_stop, "stop_act", _number(spec.duration_s))
    _add_collision_stop_conditions(act_stop, spec)

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
