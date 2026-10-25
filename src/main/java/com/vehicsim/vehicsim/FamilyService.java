package com.vehicsim.vehicsim;

import com.vehicsim.core.Simulator;
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
 * Họ kịch bản "người đi bộ băng qua đường" (FE-07, bản tối thiểu cho vòng MVP).
 * <p>
 * Một họ = một dòng ``scenarios`` + một hay nhiều bản gốc (``scenario_versions`` source MANUAL / NATURAL_LANGUAGE, giữ không
 * gian tham số trong ``scenario_ir_json``) + các biến thể dạng lưới của từng bản gốc (source GENERATED, ``parent_version_id`` =
 * bản gốc). Sửa họ không sửa đè: tạo bản gốc mới với bộ biến thể mới (v2, v3…), bản cũ và run của nó giữ nguyên để baseline
 * cũ vẫn tái lập được; bộ biến thể đang dùng là con của bản gốc mới nhất.
 */
@Service
public class FamilyService {

    public static final String MOTIF = "pedestrian_crossing";
    public static final String MOTIF_NAME = "Pedestrian Crossing";
    /** Map CARLA mà bộ xuất .xosc nạp ({@code XoscExport}, Town04 road 40); run ghi map thật nạp vào {@code simulation_runs.map_name}. */
    public static final String DEFAULT_MAP = "Town04";
    public static final int MAX_VARIANTS = 300;
    /** Tốc độ người đi bộ lớn nhất đã đo trên CARLA (TD-47); xem {@link #IR_BOUNDS}. */
    public static final double MAX_PEDESTRIAN_SPEED_MPS = 6.0;
    /** Họ duy nhất của MVP là người đi bộ băng qua đường = category CP_CROSSING (Euro NCAP CPFA / CPNA / CPNCO). */
    public static final String CATEGORY = ScenarioRules.CP_CROSSING;
    public static final String TARGET_TYPE = ScenarioRules.PEDESTRIAN;

    public static final List<String> WEATHERS = List.of("CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG");
    public static final List<String> TIMES = List.of("DAY", "DUSK", "NIGHT");
    /**
     * Khoảng nhận khi tạo họ / trích xuất mô tả. Người đi bộ tối đa 6 m/s: hành vi trên CARLA mới đo tới 6 m/s (TD-47, 23/10/2026), nên
     * chưa cho tạo biến thể nhanh hơn. {@code Bundle} vẫn nhận tới 8 m/s để run cũ chạy lại / xuất .xosc được.
     */
    public static final Map<String, double[]> IR_BOUNDS = Map.of(
            "ego_speed_kmh", new double[]{10.0, 130.0},
            "trigger_distance_m", new double[]{5.0, 80.0},
            "pedestrian_speed_mps", new double[]{0.5, MAX_PEDESTRIAN_SPEED_MPS});

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
            List<String> late = unreachablePairs();
            if (!late.isEmpty()) {
                throw new InvalidRequestException("Xe không tới được điểm băng ngang trong " + g(Simulator.MAX_DURATION_S)
                        + " s mô phỏng (cần khoảng cách kích hoạt / tốc độ xe + " + g(Simulator.LEAD_TIME_S) + " s < " + g(Simulator.MAX_DURATION_S)
                        + " s): " + String.join("; ", late.subList(0, Math.min(5, late.size())))
                        + (late.size() > 5 ? " và " + (late.size() - 5) + " cặp khác" : "")
                        + ". Tăng tốc độ xe hoặc giảm khoảng cách kích hoạt.");
            }
        }

        /**
         * Cặp (tốc độ xe, khoảng cách kích hoạt) mà xe chạy đều không tới vạch băng ngang trước khi hết thời gian mô phỏng: run kết thúc
         * TIMEOUT mà xe chưa gặp người đi bộ, kết quả vô nghĩa. Cùng hằng số với bộ động học và bộ xuất .xosc (StopTrigger).
         */
        public List<String> unreachablePairs() {
            List<String> out = new ArrayList<>();
            for (double speed : new TreeSet<>(egoSpeedsKmh)) {
                for (double dist : new TreeSet<>(triggerDistancesM)) {
                    double arrival = arrivalSeconds(speed, dist);
                    if (arrival >= Simulator.MAX_DURATION_S) {
                        out.add(g(speed) + " km/h + " + g(dist) + " m (tới vạch sau " + String.format(java.util.Locale.ROOT, "%.1f", arrival) + " s)");
                    }
                }
            }
            return out;
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

    /** Giây từ đầu run tới khi mũi xe tới vạch băng ngang nếu chạy đều: {@code CrossingCase.crossingX() / v}. */
    static double arrivalSeconds(double egoSpeedKmh, double triggerDistanceM) {
        return triggerDistanceM / (egoSpeedKmh / 3.6) + Simulator.LEAD_TIME_S;
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
        checkRules(spec);
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
        long baseId = insertBase(scenarioId, 1, nlText.isEmpty() ? "MANUAL" : "NATURAL_LANGUAGE", nlText.isEmpty() ? null : nlText,
                llmModel, baseIr, nlText.isEmpty() ? "Family definition (parameter space)" : "Family from natural-language description",
                userId, ts);
        insertVariants(scenarioId, 2, baseId, spec, userId, ts);
        return Json.obj("scenario_id", scenarioId, "code", code, "base_version_id", baseId, "version", 1, "variants", spec.variantCount());
    }

    /** Run chưa xong của họ: còn run thì chưa cho tạo bản mới (kết quả đang chạy thuộc bộ biến thể cũ). */
    static final List<String> UNFINISHED_RUN_STATUSES = List.of("PENDING", "RUNNING", "PAUSED");

    /**
     * Sửa họ = tạo bản gốc mới (v2, v3…) với không gian tham số mới và bộ biến thể mới, trong **một** transaction. Bản cũ, biến thể
     * cũ và run của chúng giữ nguyên (baseline cũ vẫn tái lập được); từ đây chạy cơ sở / regression / tối ưu dùng bộ biến thể mới
     * vì chúng đều lấy {@link #latestBaseVersionId}. Chặn khi họ còn run chưa xong hoặc không gian tham số không đổi.
     */
    @Transactional
    public Map<String, Object> createVersion(long projectId, long scenarioId, FamilySpec spec, long userId) {
        spec.validate();
        // Khoá dòng họ: hai người sửa cùng lúc không lấy trùng version_no.
        Row scenario = db.first("SELECT id, code FROM scenarios WHERE id = ? AND project_id = ? FOR UPDATE", scenarioId, projectId);
        if (scenario == null) {
            throw new NotFoundException("scenario");
        }
        String code = scenario.str("code");
        Object unfinished = db.scalar("SELECT COUNT(*) FROM simulation_runs WHERE scenario_id = ? AND status IN ('"
                + String.join("','", UNFINISHED_RUN_STATUSES) + "')", scenarioId);
        long busy = unfinished == null ? 0 : ((Number) unfinished).longValue();
        if (busy > 0) {
            throw new InvalidRequestException("Họ " + code + " còn " + busy + " lượt chạy đang chờ / đang chạy; đợi chạy xong hoặc hủy rồi mới sửa");
        }
        Row current = db.first("SELECT scenario_ir_json FROM scenario_versions WHERE id = ?", latestBaseVersionId(scenarioId));
        if (sameSpace(spec.parameterSpace(), Json.asMap(current.json("scenario_ir_json").get("parameter_space")))) {
            throw new InvalidRequestException("Không gian tham số không đổi so với bản hiện hành; sửa ít nhất một giá trị rồi mới tạo bản mới");
        }
        checkRules(spec);
        LocalDateTime ts = Vs.now();
        Object maxNo = db.scalar("SELECT MAX(version_no) FROM scenario_versions WHERE scenario_id = ?", scenarioId);
        int next = (maxNo == null ? 0 : ((Number) maxNo).intValue()) + 1;
        long baseId = insertBase(scenarioId, next, "MANUAL", null, null, Json.obj("motif", MOTIF, "parameter_space", spec.parameterSpace()),
                "Edited parameter space (new family version)", userId, ts);
        insertVariants(scenarioId, next + 1, baseId, spec, userId, ts);
        if (spec.description() != null && !spec.description().isBlank()) {
            db.update("UPDATE scenarios SET description = ?, updated_at = ? WHERE id = ?", spec.description().strip(), ts, scenarioId);
        } else {
            db.update("UPDATE scenarios SET updated_at = ? WHERE id = ?", ts, scenarioId);
        }
        return Json.obj("scenario_id", scenarioId, "code", code, "base_version_id", baseId, "version", baseVersions(scenarioId).size(),
                "variants", spec.variantCount());
    }

    /** So hai không gian tham số theo giá trị (JSON đọc lại có thể trả 40 thay vì 40.0). */
    static boolean sameSpace(Map<String, Object> a, Map<String, Object> b) {
        return normalized(a).equals(normalized(b));
    }

    private static Map<String, List<Object>> normalized(Map<String, Object> space) {
        Map<String, List<Object>> out = new java.util.TreeMap<>();
        space.forEach((axis, values) -> out.put(axis, Json.asList(values).stream()
                .map(v -> v instanceof Number n ? (Object) n.doubleValue() : v).toList()));
        return out;
    }

    /** Luật theo category kiểm trước khi ghi gì (DB không biết category nào cần cột nào). */
    private static void checkRules(FamilySpec spec) {
        for (Map<String, Object> point : spec.grid()) {
            ScenarioRules.check(CATEGORY, TARGET_TYPE, new ScenarioRules.Point(
                    ((Number) point.get("ego_speed_kmh")).doubleValue(), targetSpeedKmh(point), null, null, null,
                    ((Number) point.get("trigger_distance_m")).doubleValue()));
        }
    }

    /** Bản gốc giữ không gian tham số trong IR; ego / thời tiết / giờ nhận giá trị giữ chỗ (DEFAULT) của bản chuẩn (TD-43). */
    private long insertBase(long scenarioId, int versionNo, String source, String nlText, Object llmModel, Map<String, Object> baseIr,
                            String statusMessage, long userId, LocalDateTime ts) {
        return db.insert(
                "INSERT INTO scenario_versions (scenario_id, version_no, source, natural_language_input, llm_model, scenario_ir_json, "
                        + "target_type, max_duration_s, map_name, validation_status, status_message, created_by_user_id, created_date) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                scenarioId, versionNo, source, nlText, llmModel, baseIr, TARGET_TYPE, RunService.MAX_DURATION_S, DEFAULT_MAP, "VALID",
                statusMessage, userId, ts);
    }

    /**
     * Cột lọc của biến thể = đúng điểm lưới trong IR (IR vẫn tính bằng m/s; cột target_speed_kmh = m/s × 3,6); ma sát suy từ thời
     * tiết như bộ động học. {@code version_no} nối tiếp từ {@code firstNo}.
     */
    private void insertVariants(long scenarioId, int firstNo, long baseId, FamilySpec spec, long userId, LocalDateTime ts) {
        List<Object[]> rows = new ArrayList<>();
        int index = firstNo;
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

    /** Các bản gốc của họ theo thứ tự tạo: phần tử thứ i là bản v(i+1). */
    public List<Row> baseVersions(long scenarioId) {
        return db.list("SELECT * FROM scenario_versions WHERE scenario_id = ? AND source != 'GENERATED' ORDER BY id", scenarioId);
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
