package com.vsos.core.bridge;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.vsos.core.aeb.AebParams;
import com.vsos.core.common.Py;
import com.vsos.core.evaluation.Evaluation;
import com.vsos.core.simulation.CarlaSession;
import com.vsos.core.simulation.CrossingCase;
import com.vsos.core.simulation.SimulationOutcome;
import com.vsos.core.simulation.VehicleSpec;

/**
 * Hợp đồng JSON giữa web và bộ mô phỏng: một biến thể vào ({@code vehicsim.variant/v1}), một kết quả ra ({@code vehicsim.result/v1}) — port 1:1 từ
 * {@code worker/vehicsim_core/bundle.py} (ADR-042), kể cả câu thông báo lỗi (dùng {@code repr} và {@code :g} của Python).
 *
 * <p>Ngoài bundle đầy đủ, {@link #readSpec} còn nhận Scenario IR trần: khi đó AEB là baseline v1.0 mặc định, xe là mặc định, seed = 0 trừ khi truyền.
 * {@code vehicle.carla} (tuỳ chọn) là phần CHỈ runner CARLA đọc: blueprint, các trường {@code VehiclePhysicsControl} và kích thước cấu hình.</p>
 */
public final class Bundle {

    public static final String VARIANT_FORMAT = "vehicsim.variant/v1";
    public static final String RESULT_FORMAT = "vehicsim.result/v1";

    /** Danh tính bộ mô phỏng, ghi vào {@code simulation_runs.simulator_version}. Regression chỉ ghép hai run cùng giá trị này. */
    public static final String KINEMATIC_SIMULATOR = "vehicsim-kinematic-1.0";

    /**
     * Phiên bản cài đặt lõi, ghi vào {@code result.json} (khóa {@code engine}) để phân biệt run do lõi Java với run do lõi Python cũ kể cả khi
     * định danh simulator không đổi. Đổi chuỗi này mỗi khi hành vi lõi đổi.
     */
    public static final String ENGINE = "vsos-core-java/1";

    public static final List<String> WEATHERS = List.of("CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG");
    public static final List<String> TIMES = List.of("DAY", "DUSK", "NIGHT");
    /** Khớp FamilySpec.validate — biến thể ngoài khoảng này không dựng được họ kịch bản. */
    private static final Map<String, double[]> IR_BOUNDS = irBounds();
    private static final Set<String> PHYSICS_SCALARS = Set.of("mass", "drag_coefficient", "max_rpm", "moi", "final_ratio");
    private static final Set<String> WHEEL_FIELDS = Set.of("tire_friction", "max_brake_torque", "max_handbrake_torque", "max_steer_angle", "radius",
            "damping_rate", "long_stiff_value", "lat_stiff_value", "lat_stiff_max_load");
    private static final Set<String> CONFIG_DIMENSIONS = Set.of("height_m", "wheelbase_m");
    /**
     * {@code vehicle.carla.full_brake_decel_mps2}: giảm tốc đo được khi phanh 100% trên CARLA cho xe này ({@code carla_vehicle_models.carla_full_brake_decel_mps2},
     * TD-17). Controller dùng nó đổi lệnh giảm tốc AEB ra bàn đạp; thiếu thì {@link CarlaSession#DEFAULT_FULL_BRAKE_DECEL}.
     */
    public static final String FULL_BRAKE_DECEL = "full_brake_decel_mps2";
    private static final Pattern VERSION = Pattern.compile("^\\d+\\.\\d+\\.\\d+");

    private Bundle() {
    }

    private static Map<String, double[]> irBounds() {
        Map<String, double[]> bounds = new LinkedHashMap<>();
        bounds.put("ego_speed_kmh", new double[] {10.0, 130.0});
        bounds.put("trigger_distance_m", new double[] {5.0, 80.0});
        bounds.put("pedestrian_speed_mps", new double[] {0.5, 8.0});
        return bounds;
    }

    /** File JSON không đọc được thành một lần chạy. Thông điệp liệt kê mọi lỗi. */
    public static final class BundleError extends IllegalArgumentException {
        public BundleError(String message) {
            super(message);
        }
    }

    /** Đủ để chạy một lần, ở bất kỳ bộ mô phỏng nào. */
    public record RunSpec(CrossingCase caseSpec, AebParams params, VehicleSpec vehicle, long seed, Object aebLabel, Object vehicleName, Map<String, Object> source,
                          Map<String, Object> vehicleCarla) {
    }

    /** {@code "0.9.16"} hoặc {@code "0.9.16-12-gabc"} ({@code client.get_server_version()}) → {@code "carla-0.9.16"}. */
    public static String carlaSimulator(String version) {
        String stripped = version.strip();
        Matcher m = VERSION.matcher(stripped);
        String name = "carla-" + (m.find() ? m.group() : stripped);
        return name.length() > 30 ? name.substring(0, 30) : name;
    }

    public static Map<String, Object> makeBundle(RunSpec spec) {
        Map<String, Object> variant = new LinkedHashMap<>();
        variant.put("ego_speed_kmh", spec.caseSpec().egoSpeedKmh());
        variant.put("trigger_distance_m", spec.caseSpec().triggerDistanceM());
        variant.put("pedestrian_speed_mps", spec.caseSpec().pedestrianSpeedMps());
        variant.put("stops_at_curb", spec.caseSpec().stopsAtCurb());
        variant.put("weather", spec.caseSpec().weather());
        variant.put("time_of_day", spec.caseSpec().timeOfDay());
        variant.put("friction", spec.caseSpec().friction());
        Map<String, Object> aeb = new LinkedHashMap<>();
        aeb.put("label", spec.aebLabel());
        aeb.put("params", spec.params().asCodes());
        Map<String, Object> vehicle = new LinkedHashMap<>();
        vehicle.put("name", spec.vehicleName());
        vehicle.putAll(spec.vehicle().asDict());
        if (spec.vehicleCarla() != null && !spec.vehicleCarla().isEmpty()) {
            vehicle.put("carla", spec.vehicleCarla());
        }
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("format", VARIANT_FORMAT);
        doc.put("variant", variant);
        doc.put("aeb", aeb);
        doc.put("vehicle", vehicle);
        doc.put("seed", spec.seed());
        doc.put("source", spec.source() == null ? Map.of() : spec.source());
        return doc;
    }

    public static RunSpec readSpec(Object doc) {
        return readSpec(doc, null, null);
    }

    /** JSON → {@link RunSpec}. {@code aebOverride}/{@code seedOverride} (nếu có) ghi đè giá trị trong file. */
    @SuppressWarnings("unchecked")
    public static RunSpec readSpec(Object docObject, Map<String, Object> aebOverride, Long seedOverride) {
        if (!(docObject instanceof Map)) {
            throw new BundleError("file JSON phải là một object");
        }
        Map<String, Object> doc = (Map<String, Object>) docObject;
        Object fmt = doc.get("format");
        if (fmt != null && !fmt.equals(VARIANT_FORMAT)) {
            throw new BundleError("không đọc được định dạng " + Py.repr(fmt) + " (cần " + VARIANT_FORMAT + ")");
        }
        Map<String, Object> variant = doc.get("variant") instanceof Map ? (Map<String, Object>) doc.get("variant")
                : doc.get("ir") instanceof Map ? (Map<String, Object>) doc.get("ir") : doc;

        List<String> errors = new ArrayList<>();
        CrossingCase caseSpec = readCase(variant, errors);
        Object aebDoc = aebOverride != null ? aebOverride : doc.get("aeb");
        Object[] aeb = readAeb(aebDoc, errors);
        Object vehicleDoc = doc.get("vehicle");
        Object[] vehicle = readVehicle(vehicleDoc, errors);
        Map<String, Object> vehicleCarla = vehicleDoc instanceof Map<?, ?> vd ? readVehicleCarla(vd.get("carla"), errors) : new LinkedHashMap<>();
        Object runSeed = seedOverride != null ? (Object) seedOverride : doc.containsKey("seed") ? doc.get("seed") : (Object) 0;
        long seed = 0;
        if (runSeed instanceof Boolean || !(runSeed instanceof Integer || runSeed instanceof Long || runSeed instanceof BigInteger)) {
            errors.add("seed phải là số nguyên, nhận " + Py.repr(runSeed));
        } else if (runSeed instanceof BigInteger big && big.bitLength() > 63) {
            errors.add("seed ngoài khoảng 64 bit, nhận " + big);
        } else {
            seed = ((Number) runSeed).longValue();
        }
        if (!errors.isEmpty()) {
            throw new BundleError(String.join("; ", errors));
        }
        Object source = doc.get("source");
        return new RunSpec(caseSpec, (AebParams) aeb[0], (VehicleSpec) vehicle[0], seed, aeb[1], vehicle[1],
                truthy(source) && source instanceof Map ? (Map<String, Object>) source : new LinkedHashMap<>(), vehicleCarla);
    }

    /** Python {@code bool(x)}: None, False, 0, "", [], {} là sai. */
    public static boolean truthy(Object x) {
        if (x == null) {
            return false;
        }
        if (x instanceof Boolean b) {
            return b;
        }
        if (x instanceof Number n) {
            return n.doubleValue() != 0.0;
        }
        if (x instanceof String s) {
            return !s.isEmpty();
        }
        if (x instanceof List<?> l) {
            return !l.isEmpty();
        }
        if (x instanceof Map<?, ?> m) {
            return !m.isEmpty();
        }
        return true;
    }

    private static Double number(Map<?, ?> data, String key, List<String> errors, boolean required) {
        Object value = data.get(key);
        if (value == null) {
            if (required) {
                errors.add("thiếu " + key);
            }
            return null;
        }
        if (value instanceof Boolean || !(value instanceof Number n) || !Double.isFinite(n.doubleValue())) {
            errors.add(key + " phải là số, nhận " + Py.repr(value));
            return null;
        }
        return ((Number) value).doubleValue();
    }

    private static CrossingCase readCase(Map<String, Object> variant, List<String> errors) {
        Map<String, Double> values = new LinkedHashMap<>();
        for (Map.Entry<String, double[]> bound : IR_BOUNDS.entrySet()) {
            double lo = bound.getValue()[0];
            double hi = bound.getValue()[1];
            Double value = number(variant, bound.getKey(), errors, true);
            if (value != null && !(lo <= value && value <= hi)) {
                errors.add(bound.getKey() + " = " + Py.g(value) + " ngoài khoảng [" + Py.g(lo) + ", " + Py.g(hi) + "]");
            }
            values.put(bound.getKey(), value != null ? value : lo);
        }
        Object stops = variant.containsKey("stops_at_curb") ? variant.get("stops_at_curb") : (Object) Boolean.FALSE;
        if (!(stops instanceof Boolean)) {
            errors.add("stops_at_curb phải là true/false, nhận " + Py.repr(stops));
        }
        Object weather = truthy(variant.get("weather")) ? variant.get("weather") : "CLEAR";
        if (!WEATHERS.contains(weather)) {
            errors.add("weather phải thuộc " + Py.repr(WEATHERS) + ", nhận " + Py.repr(weather));
        }
        Object timeOfDay = truthy(variant.get("time_of_day")) ? variant.get("time_of_day") : "DAY";
        if (!TIMES.contains(timeOfDay)) {
            errors.add("time_of_day phải thuộc " + Py.repr(TIMES) + ", nhận " + Py.repr(timeOfDay));
        }
        Double friction = number(variant, "friction", errors, false);
        if (friction != null && !(0.1 <= friction && friction <= 1.2)) {
            errors.add("friction = " + Py.g(friction) + " ngoài khoảng [0.1, 1.2]");
        }
        return new CrossingCase(values.get("ego_speed_kmh"), values.get("trigger_distance_m"), values.get("pedestrian_speed_mps"), truthy(stops),
                WEATHERS.contains(weather) ? (String) weather : "CLEAR", TIMES.contains(timeOfDay) ? (String) timeOfDay : "DAY", friction);
    }

    /** {@code {"label", "params": {...}}}, một bundle khác, hoặc dict phẳng {@code {"TTC_THRESHOLD": 1.5}} → {params, label}. */
    @SuppressWarnings("unchecked")
    private static Object[] readAeb(Object aebDocObject, List<String> errors) {
        if (aebDocObject == null) {
            return new Object[] {AebParams.DEFAULT, "v1.0 (mặc định)"};
        }
        if (!(aebDocObject instanceof Map)) {
            errors.add("aeb phải là một object");
            return new Object[] {AebParams.DEFAULT, null};
        }
        Map<String, Object> aebDoc = (Map<String, Object>) aebDocObject;
        if (aebDoc.get("aeb") instanceof Map) { // truyền cả một bundle khác làm file AEB
            aebDoc = (Map<String, Object>) aebDoc.get("aeb");
        }
        Object label = aebDoc.get("label");
        Map<String, Object> raw = aebDoc.get("params") instanceof Map ? (Map<String, Object>) aebDoc.get("params") : aebDoc;
        Map<String, Double> codes = new LinkedHashMap<>();
        for (String key : raw.keySet()) {
            if (key.equals("label") || key.equals("params")) {
                continue;
            }
            String code = key.toUpperCase(Locale.ROOT);
            if (AebParams.RETIRED_CODES.contains(code)) { // bundle cũ (10 tham số): 6 mã này nay là hằng số của lõi, bỏ qua
                continue;
            }
            if (!AebParams.CODES.contains(code)) {
                errors.add("tham số AEB không tồn tại: " + key);
                continue;
            }
            Double number = number(raw, key, errors, true);
            if (number != null) {
                codes.put(code, number);
            }
        }
        return new Object[] {AebParams.fromCodes(codes), label};
    }

    private static Object[] readVehicle(Object vehicleDocObject, List<String> errors) {
        if (vehicleDocObject == null) {
            return new Object[] {VehicleSpec.DEFAULT, null};
        }
        if (!(vehicleDocObject instanceof Map<?, ?> vehicleDoc)) {
            errors.add("vehicle phải là một object");
            return new Object[] {VehicleSpec.DEFAULT, null};
        }
        VehicleSpec def = VehicleSpec.DEFAULT;
        double[] dims = {def.lengthM(), def.widthM(), def.maxBrakeDecelMps2()};
        String[] keys = {"length_m", "width_m", "max_brake_decel_mps2"};
        for (int i = 0; i < keys.length; i++) {
            Double value = number(vehicleDoc, keys[i], errors, false);
            if (value != null && value <= 0) {
                errors.add("vehicle." + keys[i] + " phải dương");
            }
            if (value != null && value > 0) {
                dims[i] = value;
            }
        }
        return new Object[] {new VehicleSpec(dims[0], dims[1], dims[2]), vehicleDoc.get("name")};
    }

    /** {@code vehicle.carla} → map đã kiểm. Trường lạ bị từ chối thay vì lặng lẽ bỏ qua. */
    private static Map<String, Object> readVehicleCarla(Object carlaDocObject, List<String> errors) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (carlaDocObject == null) {
            return out;
        }
        if (!(carlaDocObject instanceof Map<?, ?> carlaDoc)) {
            errors.add("vehicle.carla phải là một object");
            return out;
        }
        for (Object key : carlaDoc.keySet()) {
            if (!Set.of("blueprint", "physics", "dimensions", FULL_BRAKE_DECEL).contains(key)) {
                errors.add("vehicle.carla." + key + " không tồn tại");
            }
        }
        if (carlaDoc.get(FULL_BRAKE_DECEL) != null) {
            Double full = number(carlaDoc, FULL_BRAKE_DECEL, errors, true);
            if (full != null && full > 0 && full <= 15) {
                out.put(FULL_BRAKE_DECEL, full);
            } else if (full != null) {
                errors.add("vehicle.carla." + FULL_BRAKE_DECEL + " phải trong (0, 15] m/s²");
            }
        }
        Object blueprint = carlaDoc.get("blueprint");
        if (blueprint != null) {
            if (!(blueprint instanceof String s) || !s.startsWith("vehicle.")) {
                errors.add("vehicle.carla.blueprint phải là blueprint xe 'vehicle.…', nhận " + Py.repr(blueprint));
            } else {
                out.put("blueprint", blueprint);
            }
        }
        Map<String, Object> physics = readPhysics(carlaDoc.get("physics"), errors);
        if (!physics.isEmpty()) {
            out.put("physics", physics);
        }
        Object dimsDoc = carlaDoc.get("dimensions");
        if (dimsDoc != null) {
            if (!(dimsDoc instanceof Map<?, ?> dd)) {
                errors.add("vehicle.carla.dimensions phải là một object");
            } else {
                Map<String, Object> dims = new LinkedHashMap<>();
                for (Object key : dd.keySet()) {
                    if (!CONFIG_DIMENSIONS.contains(key)) {
                        errors.add("vehicle.carla.dimensions." + key + " không tồn tại");
                        continue;
                    }
                    Double number = number(dd, (String) key, errors, true);
                    if (number != null && number > 0) {
                        dims.put((String) key, number);
                    } else if (number != null) {
                        errors.add("vehicle.carla.dimensions." + key + " phải dương");
                    }
                }
                if (!dims.isEmpty()) {
                    out.put("dimensions", dims);
                }
            }
        }
        return out;
    }

    private static Map<String, Object> readPhysics(Object physicsDocObject, List<String> errors) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (physicsDocObject == null) {
            return out;
        }
        if (!(physicsDocObject instanceof Map<?, ?> physicsDoc)) {
            errors.add("vehicle.carla.physics phải là một object");
            return out;
        }
        for (Map.Entry<?, ?> entry : physicsDoc.entrySet()) {
            String key = (String) entry.getKey();
            Object value = entry.getValue();
            if (PHYSICS_SCALARS.contains(key)) {
                Double number = number(physicsDoc, key, errors, true);
                if (number != null && number <= 0) {
                    errors.add("vehicle.carla.physics." + key + " phải dương");
                } else if (number != null) {
                    out.put(key, number);
                }
            } else if (key.equals("center_of_mass")) {
                Map<?, ?> com = value instanceof Map<?, ?> m ? m : null;
                if (com == null || !com.keySet().equals(Set.of("x", "y", "z"))) {
                    errors.add("vehicle.carla.physics.center_of_mass phải có đúng x, y, z");
                    continue;
                }
                Map<String, Object> coords = new LinkedHashMap<>();
                boolean complete = true;
                for (String axis : List.of("x", "y", "z")) {
                    Double number = number(com, axis, errors, true);
                    coords.put(axis, number);
                    complete &= number != null;
                }
                if (complete) {
                    out.put(key, coords);
                }
            } else if (key.equals("wheels")) {
                List<?> wheels = value instanceof Map ? List.of(value) : value instanceof List<?> l ? l : null;
                if (wheels == null || wheels.isEmpty() || !wheels.stream().allMatch(w -> w instanceof Map)) {
                    errors.add("vehicle.carla.physics.wheels phải là một object (mọi bánh) hoặc danh sách object");
                    continue;
                }
                List<Object> parsed = new ArrayList<>();
                for (int i = 0; i < wheels.size(); i++) {
                    Map<?, ?> wheel = (Map<?, ?>) wheels.get(i);
                    Map<String, Object> item = new LinkedHashMap<>();
                    for (Object fieldName : wheel.keySet()) {
                        if (!WHEEL_FIELDS.contains(fieldName)) {
                            errors.add("vehicle.carla.physics.wheels[" + i + "]." + fieldName + " không tồn tại");
                            continue;
                        }
                        Double number = number(wheel, (String) fieldName, errors, true);
                        if (number != null && number < 0) {
                            errors.add("vehicle.carla.physics.wheels[" + i + "]." + fieldName + " không được âm");
                        } else if (number != null) {
                            item.put((String) fieldName, number);
                        }
                    }
                    parsed.add(item);
                }
                out.put(key, value instanceof Map ? parsed.get(0) : parsed);
            } else {
                errors.add("vehicle.carla.physics." + key + " không ép được vào CARLA");
            }
        }
        return out;
    }

    /** {@code result.json} mà mọi bộ mô phỏng ghi ra. {@code evaluation} (từ {@code Evaluation.toDocument}) là kết quả chấm bằng đúng luật của lõi. */
    public static Map<String, Object> resultDocument(RunSpec spec, SimulationOutcome outcome, String simulator, Map<String, Object> artifacts,
                                                     Map<String, Object> evaluation) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("format", RESULT_FORMAT);
        doc.put("simulator", simulator);
        doc.put("seed", spec.seed());
        doc.put("source", spec.source());
        doc.put("outcome", outcome.asDict());
        doc.put("artifacts", artifacts == null ? Map.of() : artifacts);
        if (evaluation != null) {
            doc.put("evaluation", evaluation);
        }
        return doc;
    }

    public record ResultDoc(String simulator, SimulationOutcome outcome, Map<String, Object> artifacts) {
    }

    /** {@code result.json} → (tên simulator, outcome, artifacts). Sai định dạng thì {@link BundleError}. */
    @SuppressWarnings("unchecked")
    public static ResultDoc readResult(Object docObject) {
        if (!(docObject instanceof Map<?, ?> doc) || !RESULT_FORMAT.equals(doc.get("format"))) {
            throw new BundleError("result.json không đúng định dạng " + RESULT_FORMAT);
        }
        Object outcome = doc.get("outcome");
        if (!(outcome instanceof Map<?, ?> o) || !o.keySet().containsAll(Set.of("frames", "events", "metrics", "end_reason"))) {
            throw new BundleError("result.json thiếu outcome.frames/events/metrics/end_reason");
        }
        Object simulator = doc.get("simulator");
        Object artifacts = doc.get("artifacts");
        return new ResultDoc(truthy(simulator) ? simulator.toString() : "unknown", SimulationOutcome.fromDict((Map<String, Object>) outcome),
                truthy(artifacts) ? (Map<String, Object>) artifacts : Map.of());
    }
}
