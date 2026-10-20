"""VehicSim CP_CROSSING -> OpenSCENARIO 1.0, tất định, không cần CARLA/LLM.

XML là cảnh thực thi (entities, môi trường, hành vi và trigger khoảng cách), không phải JSON đổi đuôi.
ParameterDeclarations giữ seed/AEB/xe/source để controller tái dùng đúng lõi của dự án.
Chạy file bằng ``python worker/run_xosc.py scenario.xosc`` trên máy CARLA.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from xml.etree import ElementTree as ET

from vehicsim_core.aeb_stack import AebParams
from vehicsim_core.bundle import BundleError, RunSpec, read_spec
from vehicsim_core.simulator import CURB_STOP_Y_M, MAX_DURATION_S, PEDESTRIAN_START_Y_M

FORMAT = "vehicsim.xosc/v3"
SIMULATOR_SUFFIX = "-xosc3"
# v3: bước mô phỏng 0,01 s (100 Hz, kế hoạch 20/10 D3); perception/quyết định AEB vẫn theo chu kỳ cảm biến 0,05 s.
STEP_S = 0.01
PERCEPTION_PERIOD_S = 0.05
# v2 (20 Hz) chỉ còn để chạy lại bằng chứng cũ ngoài web; backend không tạo run mới bằng profile này và không ghép với v3.
LEGACY_FORMAT = "vehicsim.xosc/v2"
LEGACY_SIMULATOR_SUFFIX = "-xosc2"
LEGACY_STEP_S = 0.05
# Town04 road 40: đoạn line dài 228 m, bốn làn phải, lane -4 ngoài cùng.
# Dùng LanePosition để ScenarioRunner lấy đúng cao độ đường (đoạn này có dốc), không đặt WorldPosition phẳng.
ROAD_ID = "40"
LANE_ID = "-4"
START_S = 20.0
SOURCE_KEYS = ("run_id", "scenario_id", "scenario_version_id", "aeb_version_id", "carla_vehicle_model_id")


def node(parent: ET.Element, tag: str, **attrs) -> ET.Element:
    return ET.SubElement(parent, tag, {k: str(v) for k, v in attrs.items()})


def number(value: float) -> str:
    return repr(float(value))


def position(parent: ET.Element, along: float, left: float) -> None:
    # ScenarioRunner 0.9.16 rotates Orientation before applying lane offset.
    # Keep the road frame here; its pedestrian controller faces the next waypoint.
    node(node(parent, "Position"), "LanePosition", roadId=ROAD_ID, laneId=LANE_ID,
         s=number(START_S + along), offset=number(-left))


def speed_action(parent: ET.Element, speed: float) -> None:
    action = node(node(node(parent, "PrivateAction"), "LongitudinalAction"), "SpeedAction")
    node(action, "SpeedActionDynamics", dynamicsShape="step", value="0", dynamicsDimension="time")
    node(node(action, "SpeedActionTarget"), "AbsoluteTargetSpeed", value=number(speed))


def time_trigger(parent: ET.Element, tag: str, name: str, at: float) -> None:
    condition = node(node(node(parent, tag), "ConditionGroup"), "Condition", name=name, delay="0", conditionEdge="rising")
    node(node(condition, "ByValueCondition"), "SimulationTimeCondition", value=number(at), rule="greaterThan")


def export_xosc(spec: RunSpec) -> str:
    root = ET.Element("OpenSCENARIO")
    node(root, "FileHeader", revMajor="1", revMinor="0", date="2026-10-18T00:00:00",
         description="VehicSim CP_CROSSING", author="VehicSim")
    declarations = node(root, "ParameterDeclarations")
    values: dict[str, object] = {
        "format": FORMAT, "fixed_delta_seconds": STEP_S, "perception_period_s": PERCEPTION_PERIOD_S, "seed": spec.seed, "ego_speed_kmh": spec.case.ego_speed_kmh,
        "trigger_distance_m": spec.case.trigger_distance_m, "pedestrian_speed_mps": spec.case.pedestrian_speed_mps,
        "stops_at_curb": str(spec.case.stops_at_curb).lower(), "weather": spec.case.weather,
        "time_of_day": spec.case.time_of_day, "friction": "" if spec.case.friction is None else spec.case.friction,
        "vehicle_length_m": spec.vehicle.length_m, "vehicle_width_m": spec.vehicle.width_m,
        "vehicle_max_brake_decel_mps2": spec.vehicle.max_brake_decel_mps2,
        "vehicle_name": spec.vehicle_name or "", "aeb_label": spec.aeb_label or "",
        "blueprint": spec.vehicle_carla.get("blueprint", "vehicle.audi.etron"),
        "carla_configured": str(bool(spec.vehicle_carla)).lower(),
        **spec.params.as_codes(),
    }
    values.update({key: spec.source[key] for key in SOURCE_KEYS if key in spec.source})
    if "simulator" in spec.source:
        values["source_simulator"] = spec.source["simulator"]
    physics = spec.vehicle_carla.get("physics") or {}
    for key in ("mass", "drag_coefficient"):
        if key in physics:
            values["physics_" + key] = physics[key]
    for key, value in (physics.get("center_of_mass") or {}).items():
        values["center_of_mass_" + key] = value
    for key, value in (spec.vehicle_carla.get("dimensions") or {}).items():
        if value is not None:
            values["dimension_" + key] = value
    # string giữ nguyên BIGINT/seed, không đi qua float của ParameterRef trong ScenarioRunner.
    for key, value in values.items():
        node(declarations, "ParameterDeclaration", name="vs_" + key, parameterType="string",
             value=number(value) if isinstance(value, float) else str(value))
    node(declarations, "ParameterDeclaration", name="vs_done", parameterType="double", value="0")
    node(root, "CatalogLocations")
    network = node(root, "RoadNetwork")
    node(network, "LogicFile", filepath="Town04")
    node(network, "SceneGraphFile", filepath="")
    entities = node(root, "Entities")
    ego = node(node(entities, "ScenarioObject", name="hero"), "Vehicle", name=values["blueprint"], vehicleCategory="car")
    node(ego, "ParameterDeclarations")
    box = node(ego, "BoundingBox")
    node(box, "Center", x="0", y="0", z="0.9")
    node(box, "Dimensions", width=number(spec.vehicle.width_m), length=number(spec.vehicle.length_m), height="1.8")
    node(ego, "Performance", maxSpeed="70", maxAcceleration="200", maxDeceleration=number(spec.vehicle.max_brake_decel_mps2))
    axles = node(ego, "Axles")
    for name, x in (("FrontAxle", "3.1"), ("RearAxle", "0")):
        node(axles, name, maxSteering="0.5" if name == "FrontAxle" else "0", wheelDiameter="0.6",
             trackWidth="1.8", positionX=x, positionZ="0.3")
    node(node(ego, "Properties"), "Property", name="type", value="ego_vehicle")
    pedestrian = node(node(entities, "ScenarioObject", name="pedestrian"), "Pedestrian", name="walker.pedestrian.0001",
                      model="walker.pedestrian.0001", mass="75", pedestrianCategory="pedestrian")
    node(pedestrian, "ParameterDeclarations")
    box = node(pedestrian, "BoundingBox")
    node(box, "Center", x="0", y="0", z="0.9")
    node(box, "Dimensions", width="0.6", length="0.6", height="1.8")
    node(node(pedestrian, "Properties"), "Property", name="type", value="simulation")

    storyboard = node(root, "Storyboard")
    actions = node(node(storyboard, "Init"), "Actions")
    environment = node(node(node(actions, "GlobalAction"), "EnvironmentAction"), "Environment", name="VehicSim")
    hour, elevation = {"DAY": (12, 1.05), "DUSK": (18, 0.07), "NIGHT": (0, -0.7)}[spec.case.time_of_day]
    node(environment, "TimeOfDay", animation="false", dateTime=f"2026-10-18T{hour:02d}:00:00")
    weather = node(environment, "Weather", cloudState="overcast" if spec.case.weather != "CLEAR" else "free")
    node(weather, "Sun", intensity="1", azimuth="0", elevation=number(elevation))
    node(weather, "Fog", visualRange="30" if spec.case.weather == "FOG" else "100000")
    rain = {"RAIN": "0.5", "HEAVY_RAIN": "1"}.get(spec.case.weather, "0")
    node(weather, "Precipitation", precipitationType="rain" if rain != "0" else "dry", intensity=rain)
    node(environment, "RoadCondition", frictionScaleFactor=number(spec.case.road_friction))
    hero_init = node(actions, "Private", entityRef="hero")
    position(node(node(hero_init, "PrivateAction"), "TeleportAction"), -spec.vehicle.length_m / 2, 0)
    controller_action = node(node(hero_init, "PrivateAction"), "ControllerAction")
    controller = node(node(controller_action, "AssignControllerAction"), "Controller", name="VehicSimAEB")
    properties = node(controller, "Properties")
    node(properties, "Property", name="module", value="vehicsim_aeb_control")
    node(properties, "Property", name="xosc_file", value="")
    node(properties, "Property", name="out_dir", value="")
    overrides = node(controller_action, "OverrideControllerValueAction")
    for control in ("Throttle", "Brake", "Clutch", "ParkingBrake", "SteeringWheel"):
        node(overrides, control, value="0", active="false")
    node(overrides, "Gear", number="0", active="false")
    speed_action(hero_init, spec.case.ego_speed_kmh / 3.6)
    ped_init = node(actions, "Private", entityRef="pedestrian")
    position(node(node(ped_init, "PrivateAction"), "TeleportAction"), spec.case.crossing_x, PEDESTRIAN_START_Y_M)
    speed_action(ped_init, 0)

    act = node(node(storyboard, "Story", name="PedestrianCrossing"), "Act", name="Crossing")
    group = node(act, "ManeuverGroup", name="Pedestrian", maximumExecutionCount="1")
    node(node(group, "Actors", selectTriggeringEntities="false"), "EntityRef", entityRef="pedestrian")
    maneuver = node(group, "Maneuver", name="Cross")
    event = node(maneuver, "Event", name="StartCrossing", priority="overwrite")
    speed_action(node(event, "Action", name="Walk"), spec.case.pedestrian_speed_mps)
    routing = node(node(node(event, "Action", name="CrossRoad"), "PrivateAction"), "RoutingAction")
    follow = node(routing, "FollowTrajectoryAction")
    trajectory = node(follow, "Trajectory", name="CrossingPath", closed="false")
    polyline = node(node(trajectory, "Shape"), "Polyline")
    finish_y = CURB_STOP_Y_M if spec.case.stops_at_curb else -PEDESTRIAN_START_Y_M
    for at, left in ((0, PEDESTRIAN_START_Y_M), (abs(finish_y - PEDESTRIAN_START_Y_M) / spec.case.pedestrian_speed_mps, finish_y)):
        position(node(polyline, "Vertex", time=number(at)), spec.case.crossing_x, left)
    node(node(follow, "TimeReference"), "None")
    node(follow, "TrajectoryFollowingMode", followingMode="position")
    condition = node(node(node(event, "StartTrigger"), "ConditionGroup"), "Condition", name="RelativeGap", delay="0", conditionEdge="rising")
    by_entity = node(condition, "ByEntityCondition")
    node(node(by_entity, "TriggeringEntities", triggeringEntitiesRule="any"), "EntityRef", entityRef="hero")
    distance = node(node(by_entity, "EntityCondition"), "DistanceCondition", value=number(spec.case.trigger_distance_m + spec.vehicle.length_m / 2),
                    freespace="false", alongRoute="false", rule="lessThan")
    position(distance, spec.case.crossing_x, 0)
    # Event chưa kết thúc giữ Act mở, không kết thúc scenario ngay khi người đi bộ đi hết route.
    hold = node(maneuver, "Event", name="HoldMeasurement", priority="parallel")
    speed_action(node(hold, "Action", name="Hold"), 0)
    time_trigger(hold, "StartTrigger", "HoldUntilEnd", MAX_DURATION_S + 1)
    time_trigger(act, "StartTrigger", "Start", 0)
    time_trigger(act, "StopTrigger", "End", MAX_DURATION_S)
    condition = node(node(act.find("StopTrigger"), "ConditionGroup"), "Condition", name="MeasurementComplete", delay="0", conditionEdge="rising")
    node(node(condition, "ByValueCondition"), "ParameterCondition", parameterRef="vs_done", value="1", rule="equalTo")
    condition = node(node(node(storyboard, "StopTrigger"), "ConditionGroup"), "Condition", name="criteria_CollisionTest", delay="0", conditionEdge="rising")
    node(node(condition, "ByValueCondition"), "ParameterCondition", parameterRef="", value="", rule="lessThan")
    ET.indent(root, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode") + "\n"


def read_xosc(path: Path) -> RunSpec:
    root = ET.parse(path).getroot()
    values = {p.attrib["name"].removeprefix("vs_"): p.attrib["value"] for p in root.findall("./ParameterDeclarations/ParameterDeclaration")}
    if values.get("format") == "vehicsim.xosc/v1":
        raise BundleError("File .xosc v1 có hướng đi bộ cũ; cần xuất lại từ web để chạy người đi bộ băng ngang đường")
    if values.get("format") not in (FORMAT, LEGACY_FORMAT):
        raise BundleError("Cần file .xosc VehicSim xuất từ web (thiếu vs_format)")
    try:
        variant = {key: float(values[key]) for key in ("ego_speed_kmh", "trigger_distance_m", "pedestrian_speed_mps")}
        variant["friction"] = float(values["friction"]) if values["friction"] else None
        variant.update(stops_at_curb=values["stops_at_curb"] == "true", weather=values["weather"], time_of_day=values["time_of_day"])
        physics = {key: float(values["physics_" + key]) for key in ("mass", "drag_coefficient") if "physics_" + key in values}
        center = {key: float(values["center_of_mass_" + key]) for key in ("x", "y", "z") if "center_of_mass_" + key in values}
        if center:
            physics["center_of_mass"] = center
        source = {key: int(values[key]) for key in SOURCE_KEYS if key in values}
        if "source_simulator" in values:
            source["simulator"] = values["source_simulator"]
        return read_spec({
            "variant": variant, "seed": int(values["seed"]), "source": source,
            "aeb": {"label": values["aeb_label"] or None, "params": {key: float(values[key]) for key in AebParams().as_codes()}},
            "vehicle": {"name": values["vehicle_name"] or None, **{key: float(values["vehicle_" + key]) for key in ("length_m", "width_m", "max_brake_decel_mps2")},
                        "carla": {"blueprint": values["blueprint"], "physics": physics,
                                  "dimensions": {key: float(values["dimension_" + key]) for key in ("height_m", "wheelbase_m") if "dimension_" + key in values}}
                        if values["carla_configured"] == "true" else {}},
        })
    except (KeyError, ValueError) as exc:
        raise BundleError(f"Metadata .xosc không hợp lệ: {exc}") from exc


def read_profile(path: Path) -> tuple[str, float, float]:
    """(hậu tố identity simulator, bước mô phỏng s, chu kỳ perception s) của file .xosc theo định dạng của nó."""
    root = ET.parse(path).getroot()
    values = {p.attrib["name"].removeprefix("vs_"): p.attrib["value"] for p in root.findall("./ParameterDeclarations/ParameterDeclaration")}
    if values.get("format") == LEGACY_FORMAT:
        return LEGACY_SIMULATOR_SUFFIX, LEGACY_STEP_S, LEGACY_STEP_S
    if values.get("format") != FORMAT:
        raise BundleError("Cần file .xosc VehicSim xuất từ web (thiếu vs_format)")
    try:
        step, period = float(values["fixed_delta_seconds"]), float(values["perception_period_s"])
    except (KeyError, ValueError) as exc:
        raise BundleError(f"Metadata thời gian .xosc không hợp lệ: {exc}") from exc
    if not 0 < step <= period or abs(round(period / step) * step - period) > 1e-9:
        raise BundleError(f"Bước {step} s và chu kỳ perception {period} s không tương thích")
    return SIMULATOR_SUFFIX, step, period


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    args.out.write_text(export_xosc(read_spec(json.loads(args.bundle.read_text(encoding="utf-8")))), encoding="utf-8")


if __name__ == "__main__":
    main()
