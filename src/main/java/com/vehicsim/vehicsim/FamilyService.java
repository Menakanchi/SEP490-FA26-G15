package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Họ kịch bản "người đi bộ băng qua đường" (FE-07, bản tối thiểu cho vòng MVP). Port của ``family.py``.
 * <p>
 * Một họ = một dòng ``scenarios`` + một bản gốc (``scenario_versions`` source MANUAL / NATURAL_LANGUAGE, giữ không
 * gian tham số trong ``scenario_ir_json``) + các biến thể dạng lưới (source GENERATED, ``parent_version_id`` = bản gốc).
 */
@Service
public class FamilyService {

    public static final String MOTIF = "pedestrian_crossing";
    public static final String MOTIF_NAME = "Pedestrian Crossing";
    public static final String DEFAULT_MAP = "Town10HD";
    public static final int MAX_VARIANTS = 300;
    /** Họ duy nhất của MVP là người đi bộ băng qua đường = category CP_CROSSING (Euro NCAP CPFA / CPNA / CPNCO). */
    public static final String CATEGORY = ScenarioRules.CP_CROSSING;
    public static final String TARGET_TYPE = ScenarioRules.PEDESTRIAN;

    public static final List<String> WEATHERS = List.of("CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG");
    public static final List<String> TIMES = List.of("DAY", "DUSK", "NIGHT");
    /** Khớp ``bundle.IR_BOUNDS`` của worker — biến thể ngoài khoảng này không dựng được họ kịch bản. */
    public static final Map<String, double[]> IR_BOUNDS = Map.of(
            "ego_speed_kmh", new double[]{10.0, 130.0},
            "trigger_distance_m", new double[]{5.0, 80.0},
            "pedestrian_speed_mps", new double[]{0.5, 8.0});

    /** Không gian tham số. Mỗi trục là danh sách giá trị; biến thể = tích Descartes. */
    public record FamilySpec(
            String name,
            String description,
            List<Double> egoSpeedsKmh,
            List<Double> triggerDistancesM,
            List<Double> pedestrianSpeedsMps,
            List<Boolean> stopsAtCurb,
            List<String> weathers,
            List<String> timesOfDay) {

        public void validate() {
            checkAxis("ego_speeds_kmh", egoSpeedsKmh, IR_BOUNDS.get("ego_speed_kmh"));
            checkAxis("trigger_distances_m", triggerDistancesM, IR_BOUNDS.get("trigger_distance_m"));
            checkAxis("pedestrian_speeds_mps", pedestrianSpeedsMps, IR_BOUNDS.get("pedestrian_speed_mps"));
            if (stopsAtCurb == null || stopsAtCurb.isEmpty() || stopsAtCurb.stream().anyMatch(java.util.Objects::isNull)) {
                throw new InvalidRequestException("stops_at_curb cần ít nhất một giá trị");
            }
            if (weathers == null || weathers.isEmpty() || weathers.stream().anyMatch(w -> !WEATHERS.contains(w))) {
                throw new InvalidRequestException("weathers phải thuộc " + WEATHERS);
            }
            if (timesOfDay == null || timesOfDay.isEmpty() || timesOfDay.stream().anyMatch(x -> !TIMES.contains(x))) {
                throw new InvalidRequestException("times_of_day phải thuộc " + TIMES);
            }
            if (variantCount() > MAX_VARIANTS) {
                throw new InvalidRequestException(variantCount() + " biến thể vượt trần " + MAX_VARIANTS);
            }
        }

        private static void checkAxis(String name, List<Double> values, double[] bounds) {
            if (values == null || values.isEmpty() || values.stream().anyMatch(java.util.Objects::isNull)) {
                throw new InvalidRequestException(name + " cần ít nhất một giá trị, không được để trống");
            }
            List<Double> bad = values.stream().filter(v -> v < bounds[0] || v > bounds[1]).toList();
            if (!bad.isEmpty()) {
                throw new InvalidRequestException(name + " ngoài khoảng [" + g(bounds[0]) + ", " + g(bounds[1]) + "]: " + bad);
            }
        }

        public int variantCount() {
            return new TreeSet<>(egoSpeedsKmh).size()
                    * new TreeSet<>(triggerDistancesM).size()
                    * new TreeSet<>(pedestrianSpeedsMps).size()
                    * new TreeSet<>(stopsAtCurb).size()
                    * new LinkedHashSet<>(weathers).size()
                    * new LinkedHashSet<>(timesOfDay).size();
        }

        public List<Map<String, Object>> grid() {
            List<Map<String, Object>> out = new ArrayList<>();
            for (double speed : new TreeSet<>(egoSpeedsKmh)) {
                for (double dist : new TreeSet<>(triggerDistancesM)) {
                    for (double ped : new TreeSet<>(pedestrianSpeedsMps)) {
                        for (boolean stop : new TreeSet<>(stopsAtCurb)) {
                            for (String weather : new LinkedHashSet<>(weathers)) {
                                for (String tod : new LinkedHashSet<>(timesOfDay)) {
                                    out.add(Json.obj("motif", MOTIF, "ego_speed_kmh", speed, "trigger_distance_m", dist,
                                            "pedestrian_speed_mps", ped, "stops_at_curb", stop, "weather", weather, "time_of_day", tod));
                                }
                            }
                        }
                    }
                }
            }
            return out;
        }

        public Map<String, Object> parameterSpace() {
            return Json.obj(
                    "ego_speed_kmh", new ArrayList<>(new TreeSet<>(egoSpeedsKmh)),
                    "trigger_distance_m", new ArrayList<>(new TreeSet<>(triggerDistancesM)),
                    "pedestrian_speed_mps", new ArrayList<>(new TreeSet<>(pedestrianSpeedsMps)),
                    "stops_at_curb", new ArrayList<>(new TreeSet<>(stopsAtCurb)),
                    "weather", new ArrayList<>(new LinkedHashSet<>(weathers)),
                    "time_of_day", new ArrayList<>(new LinkedHashSet<>(timesOfDay)));
        }
    }

    /** Tốc độ người đi bộ của một điểm lưới đổi sang km/h cho cột {@code target_speed_kmh} (IR giữ m/s). */
    static double targetSpeedKmh(Map<String, Object> point) {
        return Vs.round(((Number) point.get("pedestrian_speed_mps")).doubleValue() * 3.6, 2);
    }

    /** Python ``f"{x:g}"`` cho thông báo lỗi (bỏ ".0" ở số nguyên). */
    static String g(double x) {
        return x == Math.rint(x) && Math.abs(x) < 1e15 ? String.valueOf((long) x) : String.valueOf(x);
    }

    private final Db db;

    public FamilyService(Db db) {
        this.db = db;
    }

    /**
     * Tạo họ + bản gốc + toàn bộ biến thể trong **một** transaction.
     * ``origin`` (từ bước 1 "Sinh từ mô tả"): natural_language_input, llm_model, described.
     */
    @Transactional
    public Map<String, Object> createFamily(long projectId, FamilySpec spec, long userId, Map<String, Object> origin) {
        spec.validate();
        String nlText = origin == null ? "" : String.valueOf(origin.getOrDefault("natural_language_input", "")).trim();
        if ("null".equals(nlText)) {
            nlText = "";
        }
        LocalDateTime ts = Vs.now();
        if (db.first("SELECT id FROM projects WHERE id = ?", projectId) == null) {
            throw new NotFoundException("project");
        }
        // Luật theo category kiểm trước khi ghi gì (DB không biết category nào cần cột nào).
        for (Map<String, Object> point : spec.grid()) {
            ScenarioRules.check(CATEGORY, TARGET_TYPE, new ScenarioRules.Point(
                    ((Number) point.get("ego_speed_kmh")).doubleValue(), targetSpeedKmh(point), null, null, null,
                    ((Number) point.get("trigger_distance_m")).doubleValue()));
        }
        String code = nextCode(projectId);
        long scenarioId = db.insert(
                "INSERT INTO scenarios (project_id, category, code, name, description, created_by_user_id, created_date, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                projectId, CATEGORY, code, familyName(projectId, spec.name(), code),
                spec.description() == null || spec.description().isEmpty() ? null : spec.description(), userId, ts, ts);

        Map<String, Object> baseIr = Json.obj("motif", MOTIF, "parameter_space", spec.parameterSpace());
        if (!nlText.isEmpty() && origin.get("described") != null) {
            baseIr.put("described", origin.get("described"));
        }
        Object llmModel = nlText.isEmpty() || origin.get("llm_model") == null || String.valueOf(origin.get("llm_model")).isEmpty()
                ? null : origin.get("llm_model");
        // Bản gốc giữ không gian tham số trong IR; ego / thời tiết / giờ nhận giá trị giữ chỗ (DEFAULT) của bản chuẩn.
        long baseId = db.insert(
                "INSERT INTO scenario_versions (scenario_id, version_no, source, natural_language_input, llm_model, scenario_ir_json, "
                        + "target_type, max_duration_s, map_name, validation_status, status_message, created_by_user_id, created_date) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                scenarioId, 1, nlText.isEmpty() ? "MANUAL" : "NATURAL_LANGUAGE", nlText.isEmpty() ? null : nlText, llmModel,
                baseIr, TARGET_TYPE, RunService.MAX_DURATION_S, DEFAULT_MAP, "VALID",
                nlText.isEmpty() ? "Family definition (parameter space)" : "Family from natural-language description", userId, ts);

        // Cột lọc của biến thể = đúng điểm lưới trong IR (IR vẫn tính bằng m/s; cột target_speed_kmh = m/s × 3,6);
        // ma sát suy từ thời tiết như bộ động học.
        List<Object[]> rows = new ArrayList<>();
        int index = 2;
        for (Map<String, Object> ir : spec.grid()) {
            rows.add(new Object[]{scenarioId, index++, "GENERATED", baseId, ir, TARGET_TYPE, ir.get("ego_speed_kmh"), targetSpeedKmh(ir),
                    ir.get("trigger_distance_m"), ir.get("stops_at_curb"), ir.get("weather"), ir.get("time_of_day"),
                    Vs.WEATHER_FRICTION.getOrDefault((String) ir.get("weather"), 1.0), RunService.MAX_DURATION_S, DEFAULT_MAP, "VALID",
                    userId, ts});
        }
        db.batchInsert(
                "INSERT INTO scenario_versions (scenario_id, version_no, source, parent_version_id, scenario_ir_json, target_type, "
                        + "ego_speed_kmh, target_speed_kmh, trigger_distance_m, stops_at_curb, weather, time_of_day, road_friction, "
                        + "max_duration_s, map_name, validation_status, created_by_user_id, created_date) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                rows);
        return Json.obj("scenario_id", scenarioId, "code", code, "base_version_id", baseId, "variants", spec.variantCount());
    }

    private String nextCode(long projectId) {
        Set<String> taken = new LinkedHashSet<>();
        for (Row r : db.list("SELECT code FROM scenarios WHERE project_id = ?", projectId)) {
            taken.add(r.str("code"));
        }
        if (!taken.contains("PX")) {
            return "PX";
        }
        int n = 2;
        while (taken.contains("PX" + n)) {
            n++;
        }
        return "PX" + n;
    }

    /** ``scenarios`` UNIQUE (project_id, name): tên đã có thì thêm mã họ, như migration 005. */
    private String familyName(long projectId, String rawName, String code) {
        String name = rawName == null ? "" : rawName.strip();
        name = name.length() > 150 ? name.substring(0, 150) : name;
        if (name.isEmpty()) {
            name = MOTIF_NAME;
        }
        boolean taken = db.first("SELECT id FROM scenarios WHERE project_id = ? AND name = ?", projectId, name) != null;
        return taken ? (name.length() > 140 ? name.substring(0, 140) : name) + " (" + code + ")" : name;
    }

    /** Bản gốc mới nhất của họ — bộ biến thể đang dùng là con của nó. */
    public long latestBaseVersionId(long scenarioId) {
        Object base = db.scalar("SELECT MAX(id) FROM scenario_versions WHERE scenario_id = ? AND source != 'GENERATED'", scenarioId);
        if (base == null) {
            throw new NotFoundException("scenario base version");
        }
        return ((Number) base).longValue();
    }

    public List<Row> variantsOf(long baseVersionId) {
        return db.list("SELECT * FROM scenario_versions WHERE parent_version_id = ? ORDER BY version_no", baseVersionId);
    }

    /** Chỉ id các biến thể (theo version_no) — cho màn chỉ cần đếm, khỏi kéo IR của từng biến thể. */
    public List<Long> variantIdsOf(long baseVersionId) {
        return db.list("SELECT id FROM scenario_versions WHERE parent_version_id = ? ORDER BY version_no", baseVersionId)
                .stream().map(r -> r.lng("id")).toList();
    }

    /** Bản đồ id -> dòng, giữ thứ tự version_no. */
    public Map<Long, Row> variantsById(long baseVersionId) {
        Map<Long, Row> out = new LinkedHashMap<>();
        for (Row v : variantsOf(baseVersionId)) {
            out.put(v.lng("id"), v);
        }
        return out;
    }
}
