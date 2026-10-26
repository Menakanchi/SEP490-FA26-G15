package com.vehicsim.vehicsim;

import com.vehicsim.service.RegressionService;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Mô hình đọc cho giao diện VehicSim — mỗi hàm trả đúng dữ liệu một màn Figma cần. Port của ``views.py``.
 * <p>
 * MVP chỉ có một project mặc định. Lọc theo thời tiết / kết quả làm trong bộ nhớ sau khi đọc: ở quy mô MVP (vài trăm lần
 * chạy) như vậy đủ nhanh. Dạng JSON trả về giữ nguyên như backend Python (khoá snake_case) để frontend không phải đổi.
 */
@Service
public class ViewsService {

    private static final List<String> STAGE_ORDER = List.of("PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS");
    private static final String AEB_SYSTEM_NAME = "AEB";

    private final Db db;
    private final Queries queries;
    private final FamilyService families;
    private final RegressionService regression;
    private final RunService runs;

    public ViewsService(Db db, Queries queries, FamilyService families, RegressionService regression, RunService runs) {
        this.db = db;
        this.queries = queries;
        this.families = families;
        this.regression = regression;
        this.runs = runs;
    }

    // ------------------------------------------------------------------ ngữ cảnh

    public Map<String, Object> context() {
        Row project = queries.currentProject();
        Row workspace = db.first("SELECT * FROM workspaces WHERE id = ?", project.lng("workspace_id"));
        Row vehicle = queries.activeVehicle(project.lng("id"));
        List<Row> versions = queries.versions(project.lng("id"), false);
        Row baseline = versions.stream().filter(v -> "BASELINE".equals(v.str("status"))).findFirst().orElse(null);
        List<Row> fams = db.list("SELECT * FROM scenarios WHERE project_id = ? ORDER BY id", project.lng("id"));

        List<Map<String, Object>> parameters = new ArrayList<>();
        for (Row p : queries.parameterCatalog()) {
            parameters.add(Json.obj("code", p.str("code"), "name", p.str("name"), "category", p.str("category"), "unit", p.str("unit"),
                    "min_value", p.dbl("min_value"), "max_value", p.dbl("max_value"), "default_value", p.dbl("default_value")));
        }
        String vehicleName = vehicle.str("display_name") != null && !vehicle.str("display_name").isEmpty()
                ? vehicle.str("display_name") : vehicle.str("carla_blueprint_id");
        return Json.obj(
                "project", Json.obj("id", project.lng("id"), "name", project.str("name")),
                "workspace", workspace == null ? null : Json.obj("id", workspace.lng("id"), "name", workspace.str("name")),
                "vehicle", Json.obj("id", vehicle.lng("id"), "name", vehicleName),
                // Bộ mô phỏng mà run MỚI sẽ dùng (màn chạy baseline hiện ra trước khi bấm chạy).
                "simulator", runs.configuredSimulator(),
                "system", Json.obj("id", project.lng("id"), "name", AEB_SYSTEM_NAME, "baseline", baseline == null ? null : versionBrief(baseline)),
                "versions", versions.stream().map(this::versionBrief).toList(),
                "families", fams.stream().map(f -> Json.obj("id", f.lng("id"), "code", f.str("code"), "name", f.str("name"))).toList(),
                "parameters", parameters);
    }

    private Map<String, Object> versionBrief(Row v) {
        return Json.obj("id", v.lng("id"), "label", Vs.versionLabel(v), "version_number", v.lng("version_no"), "status", v.str("status"),
                "source", v.str("source"), "parent_version_id", v.getLong("parent_version_id"), "notes", v.str("notes"),
                "created_at", Vs.iso(v.ts("created_date")));
    }

    // ------------------------------------------------------------------ họ kịch bản + AEB versions

    public List<Map<String, Object>> families() {
        Row project = queries.currentProject();
        Row baseline = queries.baselineVersion(project.lng("id"));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Row f : db.list("SELECT * FROM scenarios WHERE project_id = ?", project.lng("id"))) {
            List<Row> bases = families.baseVersions(f.lng("id"));
            Row base = bases.get(bases.size() - 1);
            long baseId = base.lng("id");
            List<Row> variantRows = families.variantsOf(baseId);
            List<Long> variantIds = variantRows.stream().map(v -> v.lng("id")).toList();
            // Lượt chạy của bộ biến thể hiện hành; bản cũ xem ở /families/{id}/versions.
            Map<String, Object> runStats = runStatsOf(f.lng("id"), baseId);
            // Đếm theo baseline hiện hành, không cộng lỗi của các run regression của candidate.
            int failing = baseline == null ? 0 : regression.criticalVariantIds(baseline, variantIds).size();
            out.add(Json.obj(
                    "id", f.lng("id"), "code", f.str("code"), "name", f.str("name"), "description", f.str("description"),
                    "version", bases.size(), "version_count", bases.size(), "base_version_id", baseId,
                    "variants", variantIds.size(), "risk_counts", FamilyService.riskCounts(variantRows),
                    "parameter_space", Json.asMap(base.json("scenario_ir_json").get("parameter_space")),
                    "runs", runStats, "failures", failing,
                    "baseline", baseline == null ? null : Vs.versionLabel(baseline),
                    "created_at", Vs.iso(f.ts("created_date"))));
        }
        return out;
    }

    /** Số run theo trạng thái của các biến thể thuộc một bản gốc (mọi mục đích: cơ sở, regression, tối ưu). */
    private Map<String, Object> runStatsOf(long scenarioId, long baseVersionId) {
        Map<String, Object> runStats = new LinkedHashMap<>();
        for (Row r : db.list("SELECT r.status, COUNT(*) AS n FROM simulation_runs r JOIN scenario_versions v ON v.id = r.scenario_version_id "
                + "WHERE r.scenario_id = ? AND v.parent_version_id = ? GROUP BY r.status", scenarioId, baseVersionId)) {
            runStats.put(r.str("status"), r.lng("n"));
        }
        return runStats;
    }

    /** Lịch sử bản của một họ (task 4): v1, v2… với không gian tham số, số biến thể và lượt chạy của từng bản; bản cuối là hiện hành. */
    public List<Map<String, Object>> familyVersions(long scenarioId) {
        Row project = queries.currentProject();
        if (db.first("SELECT id FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, project.lng("id")) == null) {
            throw new NotFoundException("scenario");
        }
        List<Row> bases = families.baseVersions(scenarioId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < bases.size(); i++) {
            Row b = bases.get(i);
            Row creator = db.first("SELECT CONCAT_WS(' ', last_name, middle_name, first_name) AS name FROM users WHERE id = ?",
                    b.lng("created_by_user_id"));
            out.add(Json.obj("version", i + 1, "base_version_id", b.lng("id"), "source", b.str("source"),
                    "current", i == bases.size() - 1,
                    "parameter_space", Json.asMap(b.json("scenario_ir_json").get("parameter_space")),
                    "variants", families.variantIdsOf(b.lng("id")).size(), "risk_counts", FamilyService.riskCounts(families.variantsOf(b.lng("id"))),
                    "runs", runStatsOf(scenarioId, b.lng("id")),
                    "created_by", creator == null ? null : creator.str("name"), "created_at", Vs.iso(b.ts("created_date"))));
        }
        return out;
    }

    /**
     * Biến thể của một bản (mặc định bản hiện hành) kèm nhãn tập thử (task 5): nhãn đang dùng, nhãn tự suy và có phải sửa tay không.
     */
    public Map<String, Object> familyVariants(long scenarioId, Long baseVersionId) {
        Row project = queries.currentProject();
        Row scenario = db.first("SELECT id, code FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, project.lng("id"));
        if (scenario == null) {
            throw new NotFoundException("scenario");
        }
        List<Row> bases = families.baseVersions(scenarioId);
        int index = baseIndex(bases, baseVersionId);
        List<Row> rows = families.variantsOf(bases.get(index).lng("id"));
        List<Map<String, Object>> variants = new ArrayList<>();
        for (Row v : rows) {
            Map<String, Object> ir = v.json("scenario_ir_json");
            variants.add(Json.obj("scenario_version_id", v.lng("id"), "version_no", v.lng("version_no"), "summary", Vs.variantSummary(ir),
                    "ego_speed_kmh", ir.get("ego_speed_kmh"), "trigger_distance_m", ir.get("trigger_distance_m"),
                    "pedestrian_speed_mps", ir.get("pedestrian_speed_mps"), "stops_at_curb", ir.get("stops_at_curb"),
                    "weather", ir.get("weather"), "time_of_day", ir.get("time_of_day"),
                    "risk_label", FamilyService.riskLabel(ir), "auto_label", FamilyService.autoRiskLabel(ir),
                    "manual", FamilyService.riskLabelManual(ir)));
        }
        return Json.obj("scenario_id", scenarioId, "code", scenario.str("code"), "version", index + 1,
                "base_version_id", bases.get(index).lng("id"), "current", index == bases.size() - 1,
                "risk_counts", FamilyService.riskCounts(rows), "variants", variants);
    }

    /** Vị trí bản gốc {@code baseVersionId} trong danh sách bản của họ (null = bản mới nhất); không thuộc họ thì 404. */
    private static int baseIndex(List<Row> bases, Long baseVersionId) {
        if (baseVersionId == null) {
            return bases.size() - 1;
        }
        for (int i = 0; i < bases.size(); i++) {
            if (bases.get(i).lng("id") == baseVersionId) {
                return i;
            }
        }
        throw new NotFoundException("scenario base version");
    }

    public List<Map<String, Object>> aebVersions() {
        Row project = queries.currentProject();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Row v : queries.versions(project.lng("id"), true)) {
            Map<String, Object> m = versionBrief(v);
            m.put("parameters", queries.aebValues(v.lng("id")));
            out.add(m);
        }
        return out;
    }

    // ------------------------------------------------------------------ 01 · Failure Cases

    private static String outcomeOf(boolean collision, Double minTtc, Double minDistance, boolean falseActivation) {
        return falseActivation ? "FALSE_BRAKING" : Vs.classifyOutcome(collision, minTtc, minDistance);
    }

    /**
     * Kết quả của một ca lỗi tính ngay trong SQL, cùng luật với {@link #outcomeOf} (ngưỡng lấy từ {@link Vs}) — để đếm, lọc và
     * phân trang không phải nạp mọi ca lỗi lên bộ nhớ (TD-44).
     */
    private static final String OUTCOME_SQL = "(CASE WHEN r.is_false_positive = 1 THEN 'FALSE_BRAKING' "
            + "WHEN r.collision_occurred = 1 THEN '" + Vs.OUTCOME_COLLISION + "' "
            + "WHEN (r.min_ttc_s IS NOT NULL AND r.min_ttc_s < " + Vs.NEAR_MISS_TTC_S + ") "
            + "OR (r.min_distance_m IS NOT NULL AND r.min_distance_m < " + Vs.NEAR_MISS_DISTANCE_M + ") THEN '" + Vs.OUTCOME_NEAR_MISS + "' "
            + "ELSE '" + Vs.OUTCOME_SAFE + "' END)";

    private static final String WEATHER_SQL = "JSON_UNQUOTE(JSON_EXTRACT(r.run_config_json, '$.weather'))";

    /** Ca lỗi trong phạm vi một project (+ lọc theo phiên bản AEB / số ngày), dùng chung cho KPI, đếm và phân trang. */
    private static final String FAILURE_FROM = "FROM failures f "
            + "JOIN simulation_runs r ON r.id = f.simulation_run_id "
            + "JOIN scenarios s ON s.id = r.scenario_id "
            + "LEFT JOIN (SELECT failure_id, category FROM root_causes WHERE is_primary = 1) pc ON pc.failure_id = f.id "
            + "WHERE r.project_id = ?";

    private static final int SIMILAR_CANDIDATES = 2000;

    /** Các ca lỗi (một dòng mỗi run, kèm nguyên nhân chính) thoả `where`, mới nhất trước; `where` chỉ chứa điều kiện cố định. */
    private List<Map<String, Object>> failureRows(String where, Integer limit, Object... args) {
        List<Row> rows = db.list(
                "SELECT f.id AS failure_id, f.failure_type, f.severity, f.description AS failure_description, f.created_date, "
                        + "r.id AS run_id, r.purpose, r.random_seed, r.aeb_version_id, r.run_config_json, r.collision_occurred, r.min_ttc_s, "
                        + "r.min_distance_m, r.impact_speed_mps, r.is_false_positive, "
                        + "s.id AS scenario_id, s.code AS scenario_code, s.name AS scenario_name, sv.version_no, "
                        + "av.label AS aeb_label, av.version_no AS aeb_version_no, "
                        + "pc.category AS cause_category, pc.cause_code, pc.description AS cause_description, pc.confidence "
                        + "FROM failures f "
                        + "JOIN simulation_runs r ON r.id = f.simulation_run_id "
                        + "JOIN scenarios s ON s.id = r.scenario_id "
                        + "JOIN scenario_versions sv ON sv.id = r.scenario_version_id "
                        + "JOIN aeb_versions av ON av.id = r.aeb_version_id "
                        + "LEFT JOIN (SELECT failure_id, category, cause_code, description, confidence FROM root_causes WHERE is_primary = 1) pc "
                        + "ON pc.failure_id = f.id "
                        + "WHERE " + where + " ORDER BY r.id DESC, f.id DESC" + (limit == null ? "" : " LIMIT " + limit), args);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Row r : rows) {
            Map<String, Object> ir = r.json("run_config_json");
            Double impact = r.dbl("impact_speed_mps");
            Double ttc = r.dbl("min_ttc_s");
            String causeDescription = r.str("cause_description");
            out.add(Json.obj(
                    "run_id", r.lng("run_id"),
                    "failure_id", r.lng("failure_id"),
                    "failure_type", r.str("failure_type"),
                    "severity", r.str("severity"),
                    "outcome", outcomeOf(r.bool("collision_occurred"), ttc, r.dbl("min_distance_m"), r.bool("is_false_positive")),
                    "failure_class", r.str("cause_category"),
                    "cause_code", r.str("cause_code"),
                    "root_cause", causeDescription != null && !causeDescription.isEmpty() ? causeDescription : r.str("failure_description"),
                    "confidence", r.dbl("confidence"),
                    "impact_kmh", impact == null ? null : Vs.round(impact * 3.6, 1),
                    "min_ttc_s", ttc == null ? null : Vs.round(ttc, 2),
                    "scenario_id", r.lng("scenario_id"),
                    "family", r.str("scenario_name"),
                    "variant", Vs.variantLabel(r.str("scenario_code"), r.lng("version_no")),
                    "summary", Vs.variantSummary(ir),
                    "weather", ir.get("weather"),
                    "time_of_day", ir.get("time_of_day"),
                    "parameters", ir,
                    "aeb_version_id", r.lng("aeb_version_id"),
                    "config", r.str("aeb_label") != null && !r.str("aeb_label").isEmpty() ? r.str("aeb_label") : "v" + r.lng("aeb_version_no"),
                    "purpose", r.str("purpose"),
                    "created_at", Vs.iso(r.ts("created_date"))));
        }
        return out;
    }

    private static long count(Row row, String column) {
        Object v = row.get(column);
        return v instanceof Number n ? n.longValue() : 0L;
    }

    public Map<String, Object> failureList(Long scenarioId, String failureClass, String outcome, String weather, Long aebVersionId,
                                           Integer days, int page, int pageSize) {
        Row project = queries.currentProject();
        long projectId = project.lng("id");

        // Phạm vi: project + phiên bản AEB + số ngày. KPI và danh sách họ đếm trên phạm vi này, còn bộ lọc của bảng thì không.
        StringBuilder scope = new StringBuilder(FAILURE_FROM);
        List<Object> scopeArgs = new ArrayList<>();
        scopeArgs.add(projectId);
        if (aebVersionId != null) {
            scope.append(" AND r.aeb_version_id = ?");
            scopeArgs.add(aebVersionId);
        }
        if (days != null && days > 0) {
            scope.append(" AND f.created_date >= ?");
            scopeArgs.add(Vs.now().minusDays(days));
        }

        if (scenarioId != null) { scope.append(" AND r.scenario_id = ?"); scopeArgs.add(scenarioId); }
        if (failureClass != null) { scope.append(" AND pc.category = ?"); scopeArgs.add(failureClass); }
        if (outcome != null) { scope.append(" AND ").append(OUTCOME_SQL).append(" = ?"); scopeArgs.add(outcome); }
        if (weather != null) { scope.append(" AND ").append(WEATHER_SQL).append(" = ?"); scopeArgs.add(weather); }

        Map<String, Object> byClass = new LinkedHashMap<>();
        STAGE_ORDER.forEach(stage -> byClass.put(stage, 0));
        long total = 0;
        long thisWeek = 0;
        long collisions = 0;
        long nearMisses = 0;
        long falseBraking = 0;
        List<Object> kpiArgs = new ArrayList<>();
        kpiArgs.add(Vs.now().minusDays(7));
        kpiArgs.addAll(scopeArgs);
        for (Row g : db.list("SELECT pc.category AS cause_category, " + OUTCOME_SQL + " AS outcome, COUNT(*) AS n, "
                + "SUM(f.created_date >= ?) AS this_week " + scope + " GROUP BY pc.category, " + OUTCOME_SQL, kpiArgs.toArray())) {
            long n = count(g, "n");
            total += n;
            thisWeek += count(g, "this_week");
            String o = g.str("outcome");
            if (Vs.OUTCOME_COLLISION.equals(o)) {
                collisions += n;
            } else if (Vs.OUTCOME_NEAR_MISS.equals(o)) {
                nearMisses += n;
            } else if ("FALSE_BRAKING".equals(o)) {
                falseBraking += n;
            }
            String cls = g.str("cause_category");
            if (cls != null && byClass.containsKey(cls)) {
                byClass.merge(cls, (int) n, (x, y) -> (Integer) x + (Integer) y);
            }
        }
        Map<String, Object> kpis = Json.obj(
                "total", total,
                "this_week", thisWeek,
                "collisions", collisions,
                "near_misses", nearMisses,
                "false_braking", falseBraking,
                "by_class", byClass);

        // Họ có nhiều ca lỗi nhất trước; hoà thì họ có run mới hơn (đúng thứ tự xuất hiện trong danh sách mới-nhất-trước).
        List<Map<String, Object>> familyList = new ArrayList<>();
        for (Row f : db.list("SELECT r.scenario_id, s.name, COUNT(*) AS failures, MAX(r.id) AS last_run " + scope
                + " GROUP BY r.scenario_id, s.name ORDER BY failures DESC, last_run DESC", scopeArgs.toArray())) {
            familyList.add(Json.obj("id", f.lng("scenario_id"), "name", f.str("name"), "failures", (int) count(f, "failures")));
        }

        // Bộ lọc của bảng + phân trang, tất cả ở SQL; chỉ nạp đầy đủ các dòng của trang hiện tại.
        StringBuilder filtered = new StringBuilder(scope);
        List<Object> filterArgs = new ArrayList<>(scopeArgs);
        if (scenarioId != null) {
            filtered.append(" AND r.scenario_id = ?");
            filterArgs.add(scenarioId);
        }
        if (failureClass != null) {
            filtered.append(" AND pc.category = ?");
            filterArgs.add(failureClass);
        }
        if (outcome != null) {
            filtered.append(" AND ").append(OUTCOME_SQL).append(" = ?");
            filterArgs.add(outcome);
        }
        if (weather != null) {
            filtered.append(" AND ").append(WEATHER_SQL).append(" = ?");
            filterArgs.add(weather);
        }
        long matched = count(db.first("SELECT COUNT(*) AS n " + filtered, filterArgs.toArray()), "n");
        int size = Math.max(1, pageSize);
        int p = Math.max(1, page);
        List<Map<String, Object>> items = List.of();
        long start = (long) (p - 1) * size;
        if (start < matched) {
            List<Object> pageArgs = new ArrayList<>(filterArgs);
            pageArgs.add(size);
            pageArgs.add(start);
            List<Long> ids = db.list("SELECT f.id " + filtered + " ORDER BY r.id DESC, f.id DESC LIMIT ? OFFSET ?", pageArgs.toArray())
                    .stream().map(r -> r.lng("id")).toList();
            if (!ids.isEmpty()) {
                items = failureRows("f.id IN (" + Db.placeholders(ids.size()) + ")", null, ids.toArray());
            }
        }
        return Json.obj(
                "kpis", kpis,
                "families", familyList,
                "total", matched,
                "page", p,
                "page_size", pageSize,
                "pages", Math.max(1, (int) Math.ceil(matched / (double) size)),
                "items", items);
    }

    // ------------------------------------------------------------------ 02 · Failure detail + 06 · Playback

    /** Run + các dòng liên quan của nó. */
    private record RunBundle(Row run, Row scenario, Row variant, Row version, Row vehicle, Row failure, Map<String, Object> raw) {
    }

    private RunBundle runBundle(long projectId, long runId) {
        Row run = db.first("SELECT * FROM simulation_runs WHERE id = ? AND project_id = ?", runId, projectId);
        if (run == null) {
            throw new NotFoundException("simulation run");
        }
        if (!"COMPLETED".equals(run.str("status"))) {
            throw new NotFoundException("kết quả mô phỏng (run chưa chạy xong)");
        }
        return new RunBundle(
                run,
                db.first("SELECT * FROM scenarios WHERE id = ?", run.lng("scenario_id")),
                db.first("SELECT * FROM scenario_versions WHERE id = ?", run.lng("scenario_version_id")),
                db.first("SELECT * FROM aeb_versions WHERE id = ?", run.lng("aeb_version_id")),
                queries.vehicleById(run.lng("carla_vehicle_model_id")),
                db.first("SELECT * FROM failures WHERE simulation_run_id = ?", runId),
                run.json("telemetry_json"));
    }

    private Map<String, Object> header(RunBundle b) {
        Row run = b.run();
        Map<String, Object> raw = b.raw();
        Map<String, Object> ir = run.json("run_config_json");
        Object outcome = raw.get("outcome") != null && !"".equals(raw.get("outcome")) ? raw.get("outcome")
                : Vs.classifyOutcome(run.bool("collision_occurred"), run.dbl("min_ttc_s"), run.dbl("min_distance_m"));
        Map<String, Object> primary = Json.asList(raw.get("chain")).stream().map(Json::asMap)
                .filter(s -> !Boolean.TRUE.equals(s.get("passed"))).findFirst().orElse(null);
        Row vehicle = b.vehicle();
        return Json.obj(
                "run_id", run.lng("id"),
                "evaluation_valid", com.vehicsim.core.AnalysisMetrics.valid(AnalysisService.sample(run))
                        && com.vehicsim.core.AnalysisMetrics.evidenceComplete(List.of(AnalysisService.sample(run))),
                "purpose", run.str("purpose"),
                "status", run.str("status"),
                "seed", run.getLong("random_seed"),
                "family", b.scenario().str("name"),
                "scenario_id", b.scenario().lng("id"),
                "variant", Vs.variantLabel(b.scenario().str("code"), b.variant().lng("version_no")),
                "variant_id", b.variant().lng("id"),
                "summary", Vs.variantSummary(ir),
                "vehicle", vehicle.str("display_name") != null && !vehicle.str("display_name").isEmpty() ? vehicle.str("display_name") : vehicle.str("carla_blueprint_id"),
                "config", Vs.versionLabel(b.version()),
                "aeb_version_id", b.version().lng("id"),
                "simulator", run.str("simulator_version"),
                "date", Vs.iso(run.ts("queued_at")),
                "outcome", run.bool("is_false_positive") ? "FALSE_BRAKING" : outcome,
                "verdict", run.str("verdict"),
                "failure_type", b.failure() == null ? null : b.failure().str("failure_type"),
                "failure_class", primary == null ? null : primary.get("stage"),
                "headline", raw.get("headline") == null ? "" : raw.get("headline"));
    }

    /** Kết quả phân loại của run, giữ riêng trường hợp dữ liệu không đủ để kết luận. */
    private static String analysisOutcome(Row run) {
        if (run.boolOrNull("is_false_positive") == null || run.boolOrNull("collision_occurred") == null) return "UNCLASSIFIED";
        if (run.bool("is_false_positive")) return "FALSE_BRAKING";
        if (run.bool("collision_occurred")) return "COLLISION";
        return Vs.classifyOutcome(false, run.dbl("min_ttc_s"), run.dbl("min_distance_m"));
    }

    private static String analysisClassificationStatus(Row run) {
        return run.str("verdict") == null || run.boolOrNull("collision_occurred") == null
                || run.boolOrNull("is_false_positive") == null || run.boolOrNull("is_false_negative") == null
                ? "INCOMPLETE" : "CLASSIFIED";
    }

    /**
     * Baseline snapshot cho màn phân tích: một dòng mỗi biến thể trong họ, kể cả biến thể an toàn chưa có run.
     * Chỉ chọn run baseline đã hoàn tất cùng AEB baseline, xe và bộ mô phỏng của baseline tham chiếu.
     */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> analysisDataset(long scenarioId) {
        return analysisDataset(scenarioId, null);
    }

    /** {@code baseVersionId}: bản gốc của họ cần xem (null = bản mới nhất); chỉ lấy biến thể của bản đó, không trộn bản cũ / mới. */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> analysisDataset(long scenarioId, Long baseVersionId) {
        Row project = queries.currentProject();
        long projectId = project.lng("id");
        Row scenario = db.first("SELECT * FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, projectId);
        if (scenario == null) {
            throw new NotFoundException("scenario");
        }
        List<Row> bases = families.baseVersions(scenarioId);
        int versionIndex = baseIndex(bases, baseVersionId);
        long baseId = bases.get(versionIndex).lng("id");
        Row baseline = queries.baselineVersion(projectId);
        if (baseline == null) {
            throw new NotFoundException("AEB baseline");
        }
        Row reference = db.first(
                "SELECT carla_vehicle_model_id, simulator_version, COUNT(*) AS completed_runs "
                        + "FROM simulation_runs WHERE project_id = ? AND scenario_id = ? AND aeb_version_id = ? "
                        + "AND purpose = 'BASELINE' AND status = 'COMPLETED' "
                        + "AND scenario_version_id IN (SELECT id FROM scenario_versions WHERE parent_version_id = ?) "
                        + "GROUP BY carla_vehicle_model_id, simulator_version ORDER BY completed_runs DESC, carla_vehicle_model_id, simulator_version LIMIT 1",
                projectId, scenarioId, baseline.lng("id"), baseId);

        List<Map<String, Object>> variants = new ArrayList<>();
        if (reference != null) {
            long vehicleId = reference.lng("carla_vehicle_model_id");
            String simulator = reference.str("simulator_version");
            for (Row variant : db.list("SELECT id, version_no, source, scenario_ir_json FROM scenario_versions "
                    + "WHERE parent_version_id = ? ORDER BY version_no", baseId)) {
                Row run = db.first("SELECT id, random_seed, simulator_type, simulator_version, carla_vehicle_model_id, "
                                + "status, verdict, end_reason, collision_occurred, is_false_positive, is_false_negative, "
                                + "rms_jerk_mps3, impact_speed_mps, stopping_distance_m, min_distance_m, min_ttc_s, "
                                + "max_deceleration_mps2, mean_deceleration_mps2, aeb_activation_time_s "
                                + "FROM simulation_runs WHERE project_id = ? AND scenario_id = ? AND scenario_version_id = ? "
                                + "AND aeb_version_id = ? AND purpose = 'BASELINE' AND status = 'COMPLETED' "
                                + "AND carla_vehicle_model_id = ? AND simulator_version = ? "
                                + "ORDER BY id DESC LIMIT 1",
                        projectId, scenarioId, variant.lng("id"), baseline.lng("id"), vehicleId, simulator);
                Map<String, Object> ir = variant.json("scenario_ir_json");
                Map<String, Object> metrics = run == null ? null : Json.obj(
                        "verdict", run.str("verdict"), "end_reason", run.str("end_reason"),
                        "collision_occurred", run.boolOrNull("collision_occurred"),
                        "false_activation", run.boolOrNull("is_false_positive"), "missed_activation", run.boolOrNull("is_false_negative"),
                        "outcome", analysisOutcome(run),
                        "classification_status", analysisClassificationStatus(run),

                        "rms_jerk_mps3", run.dbl("rms_jerk_mps3"), "impact_speed_mps", run.dbl("impact_speed_mps"),
                        "stopping_distance_m", run.dbl("stopping_distance_m"), "min_distance_m", run.dbl("min_distance_m"),
                        "min_ttc_s", run.dbl("min_ttc_s"), "max_deceleration_mps2", run.dbl("max_deceleration_mps2"),
                        "mean_deceleration_mps2", run.dbl("mean_deceleration_mps2"), "aeb_activation_time_s", run.dbl("aeb_activation_time_s"));
                variants.add(Json.obj(
                        "scenario_version_id", variant.lng("id"), "version_no", variant.lng("version_no"),
                        "source", variant.str("source"), "summary", Vs.variantSummary(ir),
                        "ego_speed_kmh", ir.get("ego_speed_kmh"), "trigger_distance_m", ir.get("trigger_distance_m"),
                        "pedestrian_speed_mps", ir.get("pedestrian_speed_mps"), "stops_at_curb", ir.get("stops_at_curb"),
                        "weather", ir.get("weather"), "time_of_day", ir.get("time_of_day"),
                        "risk_label", FamilyService.riskLabel(ir),
                        "status", run == null ? "NOT_RUN" : "COMPLETED",
                        "run_id", run == null ? null : run.lng("id"), "seed", run == null ? null : run.getLong("random_seed"),
                        "metrics", metrics));
            }
        } else {
            for (Row variant : db.list("SELECT id, version_no, source, scenario_ir_json FROM scenario_versions WHERE parent_version_id = ? ORDER BY version_no", baseId)) {
                Map<String, Object> ir = variant.json("scenario_ir_json");
                variants.add(Json.obj(
                        "scenario_version_id", variant.lng("id"), "version_no", variant.lng("version_no"),
                        "source", variant.str("source"), "summary", Vs.variantSummary(ir),
                        "ego_speed_kmh", ir.get("ego_speed_kmh"), "trigger_distance_m", ir.get("trigger_distance_m"),
                        "pedestrian_speed_mps", ir.get("pedestrian_speed_mps"), "stops_at_curb", ir.get("stops_at_curb"),
                        "weather", ir.get("weather"), "time_of_day", ir.get("time_of_day"),
                        "risk_label", FamilyService.riskLabel(ir),
                        "status", "NOT_RUN", "run_id", null, "seed", null, "metrics", null));
            }
        }
        long completed = variants.stream().filter(v -> "COMPLETED".equals(v.get("status"))).count();
        long classified = variants.stream().filter(v -> {
            Object metrics = v.get("metrics");
            return metrics instanceof Map<?, ?> m && "CLASSIFIED".equals(m.get("classification_status"));
        }).count();
        long failed = variants.stream().filter(v -> {
            Object metrics = v.get("metrics");
            return metrics instanceof Map<?, ?> m && "CLASSIFIED".equals(m.get("classification_status"))
                    && ("COLLISION".equals(m.get("outcome")) || "NEAR_MISS".equals(m.get("outcome")) || "FALSE_BRAKING".equals(m.get("outcome"))
                    || Boolean.TRUE.equals(m.get("missed_activation")) || "FAIL".equals(m.get("verdict")));
        }).count();
        long unclassified = completed - classified;
        Map<String, Object> snapshot = Json.obj(
                "schema", "vehicsim.analysis-dataset/v1",
                "metric_policy", "AS_STORED",
                "scenario", Json.obj("id", scenarioId, "code", scenario.str("code"), "name", scenario.str("name"), "category", scenario.str("category"),
                        "version", versionIndex + 1, "base_version_id", baseId),
                "baseline", Json.obj("id", baseline.lng("id"), "label", Vs.versionLabel(baseline)),
                "reference", reference == null ? null : Json.obj(
                        "vehicle_id", reference.lng("carla_vehicle_model_id"), "simulator", reference.str("simulator_version")),
                "risk_counts", Json.obj(FamilyService.RISK_DANGEROUS,
                        variants.stream().filter(v -> FamilyService.RISK_DANGEROUS.equals(v.get("risk_label"))).count(),
                        FamilyService.RISK_SAFE, variants.stream().filter(v -> FamilyService.RISK_SAFE.equals(v.get("risk_label"))).count()),
                "counts", Json.obj("total", variants.size(), "completed", completed, "not_run", variants.size() - completed,
                        "classified", classified, "unclassified", unclassified, "failures", failed, "safe", classified - failed),
                "variants", variants);
        snapshot.put("preview_token", datasetToken(snapshot));
        return snapshot;
    }

    private static String datasetToken(Map<String, Object> snapshot) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(Json.write(snapshot).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Freeze exactly the preview the user reviewed; never replace an existing snapshot. */
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> freezeAnalysisDataset(long scenarioId, String previewToken, long userId) {
        Map<String, Object> snapshot = analysisDataset(scenarioId);
        if (!java.util.Objects.equals(previewToken, snapshot.get("preview_token"))) {
            throw new Vs.InvalidRequestException("Baseline data changed; refresh the analysis dataset before saving");
        }
        long projectId = queries.currentProject().lng("id");
        long baselineId = ((Number) Json.asMap(snapshot.get("baseline")).get("id")).longValue();
        long id = db.insert("INSERT INTO analysis_results "
                        + "(project_id, analysis_type, method, scenario_id, aeb_version_id, title, config_json, summary_json, status, created_by_user_id) "
                        + "VALUES (?, 'BASELINE_DATASET', 'IMMUTABLE_SNAPSHOT', ?, ?, ?, ?, ?, 'COMPLETED', ?)",
                projectId, scenarioId, baselineId, "Baseline analysis dataset",
                Json.obj("schema", "vehicsim.analysis-dataset/v1", "preview_token", previewToken,
                        "metric_policy", "AS_STORED", "selection", "ALL_FAMILY_VARIANTS"),
                snapshot, userId);
        Map<String, Object> out = new LinkedHashMap<>(snapshot);
        out.put("id", id);
        out.put("baseline_current", true);
        return out;
    }

    /** Load stored run IDs/seeds/metrics, never rebuild them from the current baseline. */
    @Transactional(readOnly = true)
    public Map<String, Object> savedAnalysisDataset(long datasetId) {
        long projectId = queries.currentProject().lng("id");
        Row saved = db.first("SELECT id, aeb_version_id, summary_json, created_date FROM analysis_results "
                + "WHERE id = ? AND project_id = ? AND analysis_type = 'BASELINE_DATASET' AND status = 'COMPLETED'",
                datasetId, projectId);
        if (saved == null) throw new NotFoundException("analysis dataset");
        Map<String, Object> out = new LinkedHashMap<>(saved.json("summary_json"));
        Row current = queries.baselineVersion(projectId);
        out.put("id", saved.lng("id"));
        out.put("baseline_current", current != null
                && java.util.Objects.equals(current.getLong("id"), saved.getLong("aeb_version_id")));
        out.put("created_at", Vs.iso(saved.ts("created_date")));
        return out;
    }

    public Map<String, Object> failureDetail(long runId) {
        Row project = queries.currentProject();
        RunBundle b = runBundle(project.lng("id"), runId);
        Map<String, Double> params = queries.aebValues(b.run().getLong("aeb_version_id"));
        List<Row> catalog = queries.parameterCatalog();
        List<Map<String, Object>> similar = similarFailures(project.lng("id"), b, 3);

        Row run = b.run();
        Map<String, Object> raw = b.raw();
        Map<String, Object> m = Json.asMap(raw.get("metrics"));
        Map<String, Object> ir = run.json("run_config_json");
        Map<String, Object> caseDoc = Json.asMap(raw.get("case"));
        List<Object> chain = Json.asList(raw.get("chain"));
        Object rootConfidence = chain.stream().map(Json::asMap).filter(s -> !Boolean.TRUE.equals(s.get("passed")))
                .map(s -> s.get("confidence")).findFirst().orElse(null);

        List<Object> frames = Json.asList(raw.get("frames"));
        List<Map<String, Object>> telemetry = new ArrayList<>();
        for (Object o : frames) {
            Map<String, Object> f = Json.asMap(o);
            if (!(f.get("t") instanceof Number time) || !Double.isFinite(time.doubleValue())) continue;
            Double velocity = Json.asDouble(f.get("ego_v"));
            telemetry.add(Json.obj("t", f.get("t"), "ttc", f.get("ttc"),
                    "speed_kmh", velocity == null || !Double.isFinite(velocity) ? null : Vs.round(velocity * 3.6, 2)));
        }
        Double impact = run.dbl("impact_speed_mps");
        List<Map<String, Object>> configuration = new ArrayList<>();
        for (Row p : catalog) {
            configuration.add(Json.obj("code", p.str("code"), "name", p.str("name"), "unit", p.str("unit"), "value", params.get(p.str("code"))));
        }

        Map<String, Object> out = new LinkedHashMap<>(header(b));
        out.put("metrics", Json.obj(
                "impact_speed_kmh", impact == null ? null : Vs.round(impact * 3.6, 1),
                "min_distance_m", run.dbl("min_distance_m"),
                "min_ttc_s", run.dbl("min_ttc_s"),
                "first_detection_t", run.dbl("first_detection_time_s"),
                "first_detection_distance_m", run.dbl("first_detection_distance_m"),
                "aeb_activation_t", run.dbl("aeb_activation_time_s"),
                "aeb_activation_ttc_s", m.get("aeb_decision_ttc_s"),
                "fcw_t", run.dbl("fcw_time_s"),
                "brake_onset_t", m.get("brake_onset_t"),
                "max_deceleration_mps2", run.dbl("max_deceleration_mps2"),
                "mean_deceleration_mps2", run.dbl("mean_deceleration_mps2"),
                "rms_jerk_mps3", run.dbl("rms_jerk_mps3"),
                "impact_speed_mps", impact,
                "stopping_distance_m", run.dbl("stopping_distance_m"),
                "metric_source", "SIMULATOR_RESULT",
                "false_activation", run.bool("is_false_positive"),
                "missed_activation", run.bool("is_false_negative")));
        out.put("chain", chain);
        out.put("chain_confidence", rootConfidence);
        out.put("stage_evidence", List.of(
                Json.obj("stage","PERCEPTION","values",Json.obj("first_detection_t",run.dbl("first_detection_time_s"),
                        "first_detection_distance_m",run.dbl("first_detection_distance_m"))),
                Json.obj("stage","DECISION","values",Json.obj("decision_t",run.dbl("aeb_activation_time_s"),
                        "decision_ttc_s",m.get("aeb_decision_ttc_s"))),
                Json.obj("stage","CONTROL","values",Json.obj("brake_onset_t",m.get("brake_onset_t"),
                        "response_time_s",run.dbl("braking_response_time_s"))),
                Json.obj("stage","VEHICLE_DYNAMICS","values",Json.obj("max_deceleration_mps2",run.dbl("max_deceleration_mps2"),
                        "road_friction",caseDoc.get("road_friction")))));
        out.put("evidence_policy","RULE_BASED_HYPOTHESIS_NOT_CAUSAL_PROOF");
        out.put("evaluation_version",com.vehicsim.core.AnalysisMetrics.VERSION);

        out.put("configuration", configuration);
        Object weather = ir.get("weather");
        Object tod = ir.get("time_of_day");
        out.put("environment", Json.obj(
                "ego_speed_kmh", ir.get("ego_speed_kmh"),
                "trigger_distance_m", ir.get("trigger_distance_m"),
                "pedestrian_speed_mps", ir.get("pedestrian_speed_mps"),
                "stops_at_curb", ir.get("stops_at_curb"),
                "weather", Vs.WEATHER_LABELS.getOrDefault(weather == null ? "" : weather.toString(), weather == null ? null : weather.toString()),
                "time_of_day", Vs.TIME_LABELS.getOrDefault(tod == null ? "" : tod.toString(), tod == null ? null : tod.toString()),
                "road_friction", caseDoc.get("road_friction")));
        out.put("ttc_threshold_s", params.get("TTC_THRESHOLD"));
        out.put("motion_telemetry", com.vehicsim.core.RecordedTelemetry.project(frames, Json.asDouble(raw.get("crossing_x"))));
        out.put("telemetry", telemetry);
        out.put("events", raw.get("events") == null ? List.of() : raw.get("events"));
        out.put("scene", scene(raw, b.vehicle()));
        out.put("similar", similar);
        return out;
    }

    /** Display only: preserve unknown values and distinguish GT from perceived TTC. */
    static List<Map<String, Object>> motionTelemetry(List<Object> frames) {
        return com.vehicsim.core.RecordedTelemetry.project(frames, null);
    }

    private Map<String, Object> scene(Map<String, Object> raw, Row vehicle) {
        List<Object> frames = Json.asList(raw.get("frames"));
        int stride = Math.max(1, frames.size() / 60);
        List<Map<String, Object>> path = new ArrayList<>();
        for (int i = 0; i < frames.size(); i += stride) {
            Map<String, Object> f = Json.asMap(frames.get(i));
            path.add(Json.obj("t", f.get("t"), "x", f.get("ego_x"), "ped_y", f.get("ped_y")));
        }
        return Json.obj(
                "crossing_x", raw.get("crossing_x"),
                "lane_width_m", Vs.LANE_WIDTH_M,
                "vehicle_length_m", vehicle.dbl("length_m"),
                "vehicle_width_m", vehicle.dbl("width_m"),
                "path", path,
                "end", frames.isEmpty() ? null : frames.get(frames.size() - 1));
    }

    /** Ca lỗi gần nhất theo tham số kịch bản, trong cùng họ (tối đa {@value #SIMILAR_CANDIDATES} ca mới nhất), ưu tiên cùng nhóm nguyên nhân chính. */
    private List<Map<String, Object>> similarFailures(long projectId, RunBundle b, int limit) {
        Map<String, Object> me = b.run().json("run_config_json");
        Object myClass = Json.asList(b.raw().get("chain")).stream().map(Json::asMap)
                .filter(s -> !Boolean.TRUE.equals(s.get("passed"))).map(s -> s.get("stage")).findFirst().orElse(null);
        record Scored(double distance, Map<String, Object> row) {
        }
        List<Scored> scored = new ArrayList<>();
        for (Map<String, Object> r : failureRows("r.project_id = ? AND r.scenario_id = ?", SIMILAR_CANDIDATES,
                projectId, b.run().lng("scenario_id"))) {
            if (r.get("run_id").equals(b.run().lng("id"))) {
                continue;
            }
            Map<String, Object> ir = Json.asMap(r.get("parameters"));
            double distance = Math.abs((num(ir, "ego_speed_kmh") - num(me, "ego_speed_kmh")) / 40)
                    + Math.abs((num(ir, "trigger_distance_m") - num(me, "trigger_distance_m")) / 30)
                    + Math.abs((num(ir, "pedestrian_speed_mps") - num(me, "pedestrian_speed_mps")) / 4)
                    + (java.util.Objects.equals(ir.get("weather"), me.get("weather")) ? 0 : 0.5)
                    + (java.util.Objects.equals(ir.get("time_of_day"), me.get("time_of_day")) ? 0 : 0.5)
                    + (java.util.Objects.equals(r.get("failure_class"), myClass) ? 0 : 0.5);
            scored.add(new Scored(distance, r));
        }
        scored.sort(Comparator.comparingDouble(Scored::distance)); // sort ổn định như Python
        List<Map<String, Object>> out = new ArrayList<>();
        for (Scored s : scored.subList(0, Math.min(limit, scored.size()))) {
            out.add(Json.obj("run_id", s.row().get("run_id"), "variant", s.row().get("variant"), "summary", s.row().get("summary"),
                    "similarity_pct", Math.max(0, Vs.roundToLong(100 * (1 - s.distance() / 3.5)))));
        }
        return out;
    }

    private static double num(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v instanceof Number n ? n.doubleValue() : 0.0;
    }

    /** Các lần chạy khác đã xong của CÙNG biến thể — để so sánh giữa các AEB version. */
    private List<Map<String, Object>> relatedRuns(Row run) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Row r : db.list("SELECT r.id, r.purpose, r.collision_occurred, r.min_ttc_s, r.min_distance_m, r.is_false_positive, av.label, av.version_no "
                + "FROM simulation_runs r JOIN aeb_versions av ON av.id = r.aeb_version_id "
                + "WHERE r.scenario_version_id = ? AND r.id != ? AND r.status = 'COMPLETED' ORDER BY r.id DESC",
                run.lng("scenario_version_id"), run.lng("id"))) {
            out.add(Json.obj("run_id", r.lng("id"),
                    "config", r.str("label") != null && !r.str("label").isEmpty() ? r.str("label") : "v" + r.lng("version_no"),
                    "purpose", r.str("purpose"),
                    "outcome", outcomeOf(r.bool("collision_occurred"), r.dbl("min_ttc_s"), r.dbl("min_distance_m"), r.bool("is_false_positive"))));
        }
        return out;
    }

    /** JSON của nút "Tải JSON chạy CARLA" — đúng đầu vào backend đưa cho bộ mô phỏng (ADR-027). */
    public Map<String, Object> runVariantBundle(long runId) {
        Row project = queries.currentProject();
        Row run = db.first("SELECT * FROM simulation_runs WHERE id = ? AND project_id = ?", runId, project.lng("id"));
        if (run == null) {
            throw new NotFoundException("simulation run");
        }
        Map<String, Object> doc = runs.bundleForRun(run);
        Row scenario = db.first("SELECT * FROM scenarios WHERE id = ?", run.lng("scenario_id"));
        Row variant = db.first("SELECT * FROM scenario_versions WHERE id = ?", run.lng("scenario_version_id"));
        Json.asMap(doc.get("source")).putAll(Json.obj(
                "family", scenario.str("name"),
                "variant", Vs.variantLabel(scenario.str("code"), variant.lng("version_no")),
                "exported_at", Vs.isoSeconds(Vs.now())));
        return doc;
    }

    public Map<String, Object> playback(long runId) {
        Row project = queries.currentProject();
        RunBundle b = runBundle(project.lng("id"), runId);
        List<Map<String, Object>> related = relatedRuns(b.run());
        Map<String, Object> raw = b.raw();
        Double simulated = b.run().dbl("simulated_duration_s");
        Map<String, Object> out = new LinkedHashMap<>(header(b));
        out.put("related_runs", related);
        out.put("motion_telemetry", com.vehicsim.core.RecordedTelemetry.project(Json.asList(raw.get("frames")), Json.asDouble(raw.get("crossing_x"))));
        out.put("source","RECORDED_SIMULATOR_RESULT");

        List<Object> recorded = Json.asList(raw.get("frames"));
        Double lastTime = recorded.isEmpty() ? null : Json.asDouble(Json.asMap(recorded.get(recorded.size()-1)).get("t"));
        out.put("duration_s", lastTime != null ? lastTime : simulated == null ? 0.0 : simulated);
        out.put("frames", raw.get("frames") == null ? List.of() : raw.get("frames"));
        out.put("events", raw.get("events") == null ? List.of() : raw.get("events"));
        out.put("crossing_x", raw.get("crossing_x"));
        out.put("lane_width_m", Vs.LANE_WIDTH_M);
        out.put("vehicle_length_m", b.vehicle().dbl("length_m"));
        out.put("vehicle_width_m", b.vehicle().dbl("width_m"));
        out.put("ttc_threshold_s", Json.asMap(raw.get("params")).get("ttc_threshold"));
        out.put("ego_speed_kmh", b.run().json("run_config_json").get("ego_speed_kmh"));
        return out;
    }

    // Màn regression / khuyến nghị (16, 04, 17, 18): com.vehicsim.service.RegressionViewService.
}
