package com.vsos.core.xosc;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.vsos.core.bridge.Bundle;
import com.vsos.core.common.Py;
import com.vsos.core.simulation.CrossingCase;
import com.vsos.core.simulation.Simulator;
import com.vsos.core.simulation.VehicleSpec;

/**
 * Xuất {@code .xosc} (OpenSCENARIO 1.0) tất định cho một lần chạy, không cần CARLA hay LLM — port 1:1 từ {@code export_xosc} của
 * {@code worker/openscenario_export.py} (ADR-042), ghi cùng từng byte. XML là cảnh thực thi (entities, môi trường, hành vi và trigger khoảng cách);
 * {@code ParameterDeclarations} giữ seed/AEB/xe/nguồn để controller tái dùng đúng lõi của dự án.
 */
public final class XoscExport {

    /** Town04 road 40: đoạn line dài 228 m, bốn làn phải, lane -4 ngoài cùng. LanePosition để ScenarioRunner lấy đúng cao độ đường (đoạn này có dốc). */
    private static final String ROAD_ID = "40";
    private static final String LANE_ID = "-4";
    private static final double START_S = 20.0;
    /** {@code PedestrianControl.run_step} (ScenarioRunner 0.9.16) bỏ waypoint khi còn cách dưới 1,0 m theo mặt phẳng ngang. */
    static final double SR_WALKER_ARRIVAL_RADIUS_M = 1.0;
    /**
     * Người đi bộ trên CARLA 0.9.16 còn đi thêm khoảng v × 0,07 s sau khi bị đặt tốc độ 0 (đo 23/10/2026: 0,8 / 1,5 / 3 m/s trượt
     * 0,04 / 0,10 / 0,21 m), nên điểm dừng lùi lại đúng đoạn đó.
     */
    static final double CARLA_WALKER_STOP_LAG_S = 0.07;

    private XoscExport() {
    }

    /** Phần tử XML tối thiểu, đủ để ghi giống {@code xml.etree.ElementTree} của Python (thuộc tính giữ thứ tự chèn, " />" cho phần tử rỗng). */
    private static final class El {
        final String tag;
        final Map<String, String> attrs = new LinkedHashMap<>();
        final List<El> children = new ArrayList<>();

        El(String tag) {
            this.tag = tag;
        }
    }

    private static El node(El parent, String tag, String... keyValues) {
        El el = new El(tag);
        for (int i = 0; i < keyValues.length; i += 2) {
            el.attrs.put(keyValues[i], keyValues[i + 1]);
        }
        if (parent != null) {
            parent.children.add(el);
        }
        return el;
    }

    /** {@code repr(float(value))}. */
    private static String number(double value) {
        return Py.reprFloat(value);
    }

    private static void position(El parent, double along, double left) {
        // ScenarioRunner 0.9.16 xoay Orientation trước khi áp offset làn: giữ hệ đường; controller người đi bộ tự quay theo waypoint kế.
        // 0.0 - left (không phải -left): bản Python truyền số nguyên 0 nên offset là 0.0, không phải -0.0.
        node(node(parent, "Position"), "LanePosition", "roadId", ROAD_ID, "laneId", LANE_ID, "s", number(START_S + along), "offset", number(0.0 - left));
    }

    private static void speedAction(El parent, double speed) {
        El action = node(node(node(parent, "PrivateAction"), "LongitudinalAction"), "SpeedAction");
        node(action, "SpeedActionDynamics", "dynamicsShape", "step", "value", "0", "dynamicsDimension", "time");
        node(node(action, "SpeedActionTarget"), "AbsoluteTargetSpeed", "value", number(speed));
    }

    private static void timeTrigger(El parent, String tag, String name, double at) {
        El condition = node(node(node(parent, tag), "ConditionGroup"), "Condition", "name", name, "delay", "0", "conditionEdge", "rising");
        node(node(condition, "ByValueCondition"), "SimulationTimeCondition", "value", number(at), "rule", "greaterThan");
    }

    /** StartTrigger "xe đã vào trong khoảng kích hoạt của điểm băng ngang", trễ {@code delay} giây. */
    private static void relativeGapTrigger(El event, String name, double delay, CrossingCase c, VehicleSpec vehicle) {
        El condition = node(node(node(event, "StartTrigger"), "ConditionGroup"), "Condition", "name", name, "delay",
                delay == 0 ? "0" : number(delay), "conditionEdge", "rising");
        El byEntity = node(condition, "ByEntityCondition");
        node(node(byEntity, "TriggeringEntities", "triggeringEntitiesRule", "any"), "EntityRef", "entityRef", "hero");
        El distance = node(node(byEntity, "EntityCondition"), "DistanceCondition", "value", number(c.triggerDistanceM() + vehicle.lengthM() / 2),
                "freespace", "false", "alongRoute", "false", "rule", "lessThan");
        position(distance, c.crossingX(), 0);
    }

    private static String valueText(Object value) {
        return value instanceof Double d ? number(d) : String.valueOf(value);
    }

    private static String textOrEmpty(Object value) {
        return Bundle.truthy(value) ? String.valueOf(value) : "";
    }

    public static String export(Bundle.RunSpec spec) {
        CrossingCase c = spec.caseSpec();
        VehicleSpec vehicle = spec.vehicle();
        El root = new El("OpenSCENARIO");
        node(root, "FileHeader", "revMajor", "1", "revMinor", "0", "date", "2026-10-18T00:00:00", "description", "VehicSim CP_CROSSING", "author", "VehicSim");
        El declarations = node(root, "ParameterDeclarations");
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("format", Xosc.FORMAT);
        values.put("fixed_delta_seconds", Xosc.STEP_S);
        values.put("perception_period_s", Xosc.PERCEPTION_PERIOD_S);
        values.put("seed", spec.seed());
        values.put("ego_speed_kmh", c.egoSpeedKmh());
        values.put("trigger_distance_m", c.triggerDistanceM());
        values.put("pedestrian_speed_mps", c.pedestrianSpeedMps());
        values.put("stops_at_curb", String.valueOf(c.stopsAtCurb()));
        values.put("weather", c.weather());
        values.put("time_of_day", c.timeOfDay());
        values.put("friction", c.friction() == null ? "" : c.friction());
        values.put("vehicle_length_m", vehicle.lengthM());
        values.put("vehicle_width_m", vehicle.widthM());
        values.put("vehicle_max_brake_decel_mps2", vehicle.maxBrakeDecelMps2());
        values.put("vehicle_name", textOrEmpty(spec.vehicleName()));
        values.put("aeb_label", textOrEmpty(spec.aebLabel()));
        Object blueprint = spec.vehicleCarla().get("blueprint");
        values.put("blueprint", blueprint != null ? blueprint : "vehicle.audi.etron");
        values.put("carla_configured", String.valueOf(!spec.vehicleCarla().isEmpty()));
        values.putAll(spec.params().asCodes());
        for (String key : Xosc.SOURCE_KEYS) {
            if (spec.source().containsKey(key)) {
                values.put(key, spec.source().get(key));
            }
        }
        if (spec.source().containsKey("simulator")) {
            values.put("source_simulator", spec.source().get("simulator"));
        }
        Map<?, ?> physics = spec.vehicleCarla().get("physics") instanceof Map<?, ?> p ? p : Map.of();
        for (String key : List.of("mass", "drag_coefficient")) {
            if (physics.containsKey(key)) {
                values.put("physics_" + key, physics.get(key));
            }
        }
        if (physics.get("center_of_mass") instanceof Map<?, ?> com) {
            for (Map.Entry<?, ?> e : com.entrySet()) {
                values.put("center_of_mass_" + e.getKey(), e.getValue());
            }
        }
        if (spec.vehicleCarla().get("dimensions") instanceof Map<?, ?> dims) {
            for (Map.Entry<?, ?> e : dims.entrySet()) {
                if (e.getValue() != null) {
                    values.put("dimension_" + e.getKey(), e.getValue());
                }
            }
        }
        if (spec.vehicleCarla().get(Bundle.FULL_BRAKE_DECEL) != null) {  // chỉ khi xe đã đo: xe chưa đo giữ nguyên XML cũ từng byte
            values.put(Bundle.FULL_BRAKE_DECEL, spec.vehicleCarla().get(Bundle.FULL_BRAKE_DECEL));
        }
        // string giữ nguyên BIGINT/seed, không đi qua float của ParameterRef trong ScenarioRunner.
        for (Map.Entry<String, Object> e : values.entrySet()) {
            node(declarations, "ParameterDeclaration", "name", "vs_" + e.getKey(), "parameterType", "string", "value", valueText(e.getValue()));
        }
        node(declarations, "ParameterDeclaration", "name", "vs_done", "parameterType", "double", "value", "0");
        node(root, "CatalogLocations");
        El network = node(root, "RoadNetwork");
        node(network, "LogicFile", "filepath", "Town04");
        node(network, "SceneGraphFile", "filepath", "");
        El entities = node(root, "Entities");
        El ego = node(node(entities, "ScenarioObject", "name", "hero"), "Vehicle", "name", String.valueOf(values.get("blueprint")), "vehicleCategory", "car");
        node(ego, "ParameterDeclarations");
        El box = node(ego, "BoundingBox");
        node(box, "Center", "x", "0", "y", "0", "z", "0.9");
        node(box, "Dimensions", "width", number(vehicle.widthM()), "length", number(vehicle.lengthM()), "height", "1.8");
        node(ego, "Performance", "maxSpeed", "70", "maxAcceleration", "200", "maxDeceleration", number(vehicle.maxBrakeDecelMps2()));
        El axles = node(ego, "Axles");
        for (String name : List.of("FrontAxle", "RearAxle")) {
            boolean front = name.equals("FrontAxle");
            node(axles, name, "maxSteering", front ? "0.5" : "0", "wheelDiameter", "0.6", "trackWidth", "1.8", "positionX", front ? "3.1" : "0",
                    "positionZ", "0.3");
        }
        node(node(ego, "Properties"), "Property", "name", "type", "value", "ego_vehicle");
        El pedestrian = node(node(entities, "ScenarioObject", "name", "pedestrian"), "Pedestrian", "name", "walker.pedestrian.0001",
                "model", "walker.pedestrian.0001", "mass", "75", "pedestrianCategory", "pedestrian");
        node(pedestrian, "ParameterDeclarations");
        box = node(pedestrian, "BoundingBox");
        node(box, "Center", "x", "0", "y", "0", "z", "0.9");
        node(box, "Dimensions", "width", "0.6", "length", "0.6", "height", "1.8");
        node(node(pedestrian, "Properties"), "Property", "name", "type", "value", "simulation");

        El storyboard = node(root, "Storyboard");
        El actions = node(node(storyboard, "Init"), "Actions");
        El environment = node(node(node(actions, "GlobalAction"), "EnvironmentAction"), "Environment", "name", "VehicSim");
        int hour = switch (c.timeOfDay()) {
            case "DAY" -> 12;
            case "DUSK" -> 18;
            default -> 0;
        };
        double elevation = switch (c.timeOfDay()) {
            case "DAY" -> 1.05;
            case "DUSK" -> 0.07;
            default -> -0.7;
        };
        node(environment, "TimeOfDay", "animation", "false", "dateTime", String.format("2026-10-18T%02d:00:00", hour));
        El weather = node(environment, "Weather", "cloudState", c.weather().equals("CLEAR") ? "free" : "overcast");
        node(weather, "Sun", "intensity", "1", "azimuth", "0", "elevation", number(elevation));
        node(weather, "Fog", "visualRange", c.weather().equals("FOG") ? "30" : "100000");
        String rain = c.weather().equals("RAIN") ? "0.5" : c.weather().equals("HEAVY_RAIN") ? "1" : "0";
        node(weather, "Precipitation", "precipitationType", rain.equals("0") ? "dry" : "rain", "intensity", rain);
        node(environment, "RoadCondition", "frictionScaleFactor", number(c.roadFriction()));
        El heroInit = node(actions, "Private", "entityRef", "hero");
        position(node(node(heroInit, "PrivateAction"), "TeleportAction"), -vehicle.lengthM() / 2, 0);
        El controllerAction = node(node(heroInit, "PrivateAction"), "ControllerAction");
        El controller = node(node(controllerAction, "AssignControllerAction"), "Controller", "name", "VehicSimAEB");
        El properties = node(controller, "Properties");
        node(properties, "Property", "name", "module", "value", "vehicsim_aeb_control");
        node(properties, "Property", "name", "xosc_file", "value", "");
        node(properties, "Property", "name", "out_dir", "value", "");
        El overrides = node(controllerAction, "OverrideControllerValueAction");
        for (String control : List.of("Throttle", "Brake", "Clutch", "ParkingBrake", "SteeringWheel")) {
            node(overrides, control, "value", "0", "active", "false");
        }
        node(overrides, "Gear", "number", "0", "active", "false");
        speedAction(heroInit, c.egoSpeedKmh() / 3.6);
        El pedInit = node(actions, "Private", "entityRef", "pedestrian");
        position(node(node(pedInit, "PrivateAction"), "TeleportAction"), c.crossingX(), Simulator.PEDESTRIAN_START_Y_M);
        speedAction(pedInit, 0);

        El act = node(node(storyboard, "Story", "name", "PedestrianCrossing"), "Act", "name", "Crossing");
        El group = node(act, "ManeuverGroup", "name", "Pedestrian", "maximumExecutionCount", "1");
        node(node(group, "Actors", "selectTriggeringEntities", "false"), "EntityRef", "entityRef", "pedestrian");
        El maneuver = node(group, "Maneuver", "name", "Cross");
        El event = node(maneuver, "Event", "name", "StartCrossing", "priority", "overwrite");
        speedAction(node(event, "Action", "name", "Walk"), c.pedestrianSpeedMps());
        El routing = node(node(node(event, "Action", "name", "CrossRoad"), "PrivateAction"), "RoutingAction");
        El follow = node(routing, "FollowTrajectoryAction");
        El trajectory = node(follow, "Trajectory", "name", "CrossingPath", "closed", "false");
        El polyline = node(node(trajectory, "Shape"), "Polyline");
        // Dừng ở lề: waypoint cuối đặt quá lề đúng bán kính "đã tới" của PedestrianControl, để action CrossRoad kết thúc khi người đi bộ
        // tới lề (TD-47, xem StopAtCurb bên dưới). Người đi bộ không tới điểm này vì bị đặt tốc độ 0 ngay khi action kết thúc.
        double finishY = c.stopsAtCurb()
                ? Simulator.CURB_STOP_Y_M + SR_WALKER_ARRIVAL_RADIUS_M - c.pedestrianSpeedMps() * CARLA_WALKER_STOP_LAG_S
                : -Simulator.PEDESTRIAN_START_Y_M;
        double[][] vertices = {{0, Simulator.PEDESTRIAN_START_Y_M}, {Math.abs(finishY - Simulator.PEDESTRIAN_START_Y_M) / c.pedestrianSpeedMps(), finishY}};
        for (double[] vertex : vertices) {
            position(node(polyline, "Vertex", "time", number(vertex[0])), c.crossingX(), vertex[1]);
        }
        node(node(follow, "TimeReference"), "None");
        node(follow, "TrajectoryFollowingMode", "followingMode", "position");
        relativeGapTrigger(event, "RelativeGap", 0, c, vehicle);
        if (c.stopsAtCurb()) {
            // TD-47: PedestrianControl của ScenarioRunner 0.9.16 đi tiếp theo hướng cũ sau waypoint cuối, nên người "dừng ở lề" từng
            // bước vào làn ego. Khi action CrossRoad kết thúc (người đi bộ tới lề), đặt tốc độ 0 và giữ tới hết kịch bản. Không dùng
            // delay của Condition: ScenarioRunner tính delay từ lúc bắt đầu kiểm điều kiện, không phải từ lúc điều kiện đúng.
            El stand = node(maneuver, "Event", "name", "StopAtCurb", "priority", "parallel");
            speedAction(node(stand, "Action", "name", "Stand"), 0);
            El reached = node(node(node(stand, "StartTrigger"), "ConditionGroup"), "Condition", "name", "ReachedCurb", "delay", "0",
                    "conditionEdge", "rising");
            node(node(reached, "ByValueCondition"), "StoryboardElementStateCondition", "storyboardElementType", "action",
                    "storyboardElementRef", "CrossRoad", "state", "endTransition");
        }
        // Event chưa kết thúc giữ Act mở, không kết thúc scenario ngay khi người đi bộ đi hết route.
        El hold = node(maneuver, "Event", "name", "HoldMeasurement", "priority", "parallel");
        speedAction(node(hold, "Action", "name", "Hold"), 0);
        timeTrigger(hold, "StartTrigger", "HoldUntilEnd", Simulator.MAX_DURATION_S + 1);
        timeTrigger(act, "StartTrigger", "Start", 0);
        timeTrigger(act, "StopTrigger", "End", Simulator.MAX_DURATION_S);
        El stop = act.children.stream().filter(e -> e.tag.equals("StopTrigger")).findFirst().orElseThrow();
        El condition = node(node(stop, "ConditionGroup"), "Condition", "name", "MeasurementComplete", "delay", "0", "conditionEdge", "rising");
        node(node(condition, "ByValueCondition"), "ParameterCondition", "parameterRef", "vs_done", "value", "1", "rule", "equalTo");
        condition = node(node(node(storyboard, "StopTrigger"), "ConditionGroup"), "Condition", "name", "criteria_CollisionTest", "delay", "0",
                "conditionEdge", "rising");
        node(node(condition, "ByValueCondition"), "ParameterCondition", "parameterRef", "", "value", "", "rule", "lessThan");

        StringBuilder out = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        serialize(out, root, 0);
        return out.append('\n').toString();
    }

    /** Như {@code ET.indent(root, space="  ")} rồi {@code ET.tostring(root, encoding="unicode")}. */
    private static void serialize(StringBuilder out, El el, int level) {
        out.append('<').append(el.tag);
        for (Map.Entry<String, String> a : el.attrs.entrySet()) {
            out.append(' ').append(a.getKey()).append("=\"").append(escapeAttribute(a.getValue())).append('"');
        }
        if (el.children.isEmpty()) {
            out.append(" />");
            return;
        }
        out.append('>');
        for (El child : el.children) {
            out.append('\n').append("  ".repeat(level + 1));
            serialize(out, child, level + 1);
        }
        out.append('\n').append("  ".repeat(level)).append("</").append(el.tag).append('>');
    }

    private static String escapeAttribute(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("\r", "&#13;")
                .replace("\n", "&#10;").replace("\t", "&#09;");
    }
}
