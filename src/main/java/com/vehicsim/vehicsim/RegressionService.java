package com.vehicsim.vehicsim;

import com.vehicsim.audit.AuditLog;
import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Regression test + khuyến nghị + quyết định của Reviewer (FE-14). Port của ``regression.py``.
 * <p>
 * Luồng: {@link #createTest} chốt một xe và một bộ mô phỏng, tạo run baseline còn thiếu và run REGRESSION chạy candidate với
 * đúng seed của run baseline; mỗi run xong gọi {@link #tryFinalize} — đủ cặp thì ghi từng cặp, số ca fixed/regressed, verdict
 * và tạo một ``engineering_recommendations``. {@link #decide}: Reviewer Accept / Reject / Request more tests — không bao giờ tự
 * Accept, test không PASSED thì không Accept được, người tạo không tự duyệt.
 */
@Service
public class RegressionService {

    private static final Map<String, Integer> RANK = new LinkedHashMap<>();

    static {
        RANK.put(Vs.OUTCOME_SAFE, 0);
        RANK.put(Vs.OUTCOME_NEAR_MISS, 1);
        RANK.put(Vs.OUTCOME_COLLISION, 2);
    }

    static final Map<String, String> CRITERIA_LABELS = new LinkedHashMap<>();

    static {
        CRITERIA_LABELS.put("no_new_collision", "No previously safe scenario may collide");
        CRITERIA_LABELS.put("collision_rate_not_increase", "Collision rate must not increase");
        CRITERIA_LABELS.put("false_activation_increase_max_pts", "False activation increase ≤");
        CRITERIA_LABELS.put("median_min_ttc_change_min_s", "Median min TTC change ≥");
        CRITERIA_LABELS.put("identical_seeds", "Use identical random seeds for both versions");
    }

    private static final List<String> REQUIRED_CRITERIA = List.of("no_new_collision", "identical_seeds");

    /** Phanh oan tăng tối đa (điểm %) mặc định của regression — cùng ràng buộc với tối ưu (ADR-040 §7, ADR-042). */
    public static final double DEFAULT_FALSE_ACTIVATION_MAX_PTS = 5.0;

    private static final Map<String, String> DECISION_OF = Map.of(
            "PENDING_REVIEW", "PENDING", "ACCEPTED", "ACCEPT", "REJECTED", "REJECT", "MORE_TESTS_REQUESTED", "REQUEST_MORE_TESTS");
    private static final Map<String, String> STATUS_OF_DECISION = Map.of(
            "PENDING", "PENDING_REVIEW", "ACCEPT", "ACCEPTED", "REJECT", "REJECTED", "REQUEST_MORE_TESTS", "MORE_TESTS_REQUESTED");
    private static final List<String> DECISIONS = List.of("ACCEPT", "REJECT", "REQUEST_MORE_TESTS");

    /**
     * Cột của simulation_runs mà logic regression cần. Không dùng SELECT *: mỗi run mang ``telemetry_json`` ~20 KB
     * (toàn bộ khung hình), và các màn họ kịch bản / khuyến nghị đọc hàng trăm run mỗi lần mở.
     */
    private static final String RUN_LIGHT_COLUMNS =
            "id, scenario_version_id, status, random_seed, simulator_version, carla_vehicle_model_id, baseline_run_id, regression_test_id";

    private final Db db;
    private final Queries queries;
    private final FamilyService families;
    private final RunService runs;
    private final TransactionTemplate tx;

    public RegressionService(Db db, Queries queries, FamilyService families, RunService runs, TransactionTemplate tx) {
        this.db = db;
        this.queries = queries;
        this.families = families;
        this.runs = runs;
        this.tx = tx;
    }

    public static String testCode(long testId) {
        return String.format(java.util.Locale.ROOT, "RT-%03d", testId);
    }

    public static String recommendationCode(long testId) {
        return String.format(java.util.Locale.ROOT, "REC-%03d", testId);
    }

    /** PENDING / RUNNING / PASSED / FAILED / ERROR — trạng thái mà giao diện dùng. */
    public static String displayStatus(Row test) {
        String exec = test.str("execution_status");
        if ("COMPLETED".equals(exec)) {
            return "PASSED".equals(test.str("verdict")) ? "PASSED" : "FAILED";
        }
        if ("FAILED".equals(exec) || "CANCELLED".equals(exec)) {
            return "ERROR";
        }
        return exec;
    }

    /** PENDING / ACCEPT / REJECT / REQUEST_MORE_TESTS — chưa có khuyến nghị thì PENDING. */
    public static String displayDecision(Row recommendation) {
        return recommendation == null ? "PENDING" : DECISION_OF.get(recommendation.str("status"));
    }

    public Row recommendationFor(long testId) {
        return db.first("SELECT * FROM engineering_recommendations WHERE regression_test_id = ?", testId);
    }

    // ------------------------------------------------------------------ tạo test

    private static Map<String, Map<String, Object>> defaultCriteria() {
        Map<String, Map<String, Object>> d = new LinkedHashMap<>();
        d.put("no_new_collision", Json.obj("enabled", true, "required", true));
        d.put("collision_rate_not_increase", Json.obj("enabled", true, "required", false));
        d.put("false_activation_increase_max_pts", Json.obj("enabled", true, "required", false, "value", DEFAULT_FALSE_ACTIVATION_MAX_PTS));
        d.put("median_min_ttc_change_min_s", Json.obj("enabled", true, "required", false, "value", -0.1));
        d.put("identical_seeds", Json.obj("enabled", true, "required", true));
        return d;
    }

    static Map<String, Map<String, Object>> mergeCriteria(Map<String, Map<String, Object>> overrides) {
        Map<String, Map<String, Object>> merged = defaultCriteria();
        if (overrides != null) {
            for (Map.Entry<String, Map<String, Object>> e : overrides.entrySet()) {
                Map<String, Object> target = merged.get(e.getKey());
                if (target == null) {
                    throw new InvalidRequestException("tiêu chí không tồn tại: " + e.getKey());
                }
                if (e.getValue().containsKey("enabled")) {
                    target.put("enabled", Boolean.TRUE.equals(e.getValue().get("enabled")));
                }
                if (e.getValue().containsKey("value") && target.containsKey("value")) {
                    if (!(e.getValue().get("value") instanceof Number number)) {
                        throw new InvalidRequestException("tiêu chí " + e.getKey() + ": value phải là một số");
                    }
                    target.put("value", number.doubleValue());
                }
            }
        }
        for (String key : REQUIRED_CRITERIA) { // tiêu chí bắt buộc không tắt được
            merged.get(key).put("enabled", true);
        }
        return merged;
    }

    /**
     * Run baseline mới nhất (không phải run regression, không FAILED) của mỗi biến thể. Chỉ lấy run của bộ mô phỏng đang cấu hình
     * và của xe đang dùng: đổi sang CARLA (hay đổi xe) thì regression dựng baseline mới, không bao giờ ghép candidate CARLA với
     * baseline động học hay với xe khác.
     */
    Map<Long, Row> latestBaselineRuns(Row baseline, List<Long> variantIds) {
        Map<Long, Row> out = new LinkedHashMap<>();
        if (variantIds.isEmpty()) {
            return out;
        }
        List<Object> args = new ArrayList<>();
        args.add(baseline.lng("id"));
        args.addAll(variantIds);
        args.add(runs.configuredSimulator());
        args.add(queries.activeVehicle(baseline.lng("project_id")).lng("id"));
        for (Row r : db.list("SELECT " + RUN_LIGHT_COLUMNS + " FROM simulation_runs WHERE aeb_version_id = ? AND scenario_version_id IN ("
                + Db.placeholders(variantIds.size()) + ") AND purpose IN ('BASELINE','EVALUATION') AND status != 'FAILED' "
                + "AND simulator_version = ? AND carla_vehicle_model_id = ? ORDER BY id", args.toArray())) {
            out.put(r.lng("scenario_version_id"), r); // id tăng dần -> giữ run mới nhất
        }
        return out;
    }

    /** Biến thể mà run baseline mới nhất (đã COMPLETED) có ghi nhận lỗi — "old critical". */
    public Set<Long> criticalVariantIds(Row baseline, List<Long> variantIds) {
        List<Long> completed = latestBaselineRuns(baseline, variantIds).values().stream()
                .filter(r -> "COMPLETED".equals(r.str("status"))).map(r -> r.lng("id")).toList();
        return failedVariantIds(completed);
    }

    private Set<Long> failedVariantIds(List<Long> runIds) {
        Set<Long> out = new LinkedHashSet<>();
        if (runIds.isEmpty()) {
            return out;
        }
        for (Row r : db.list("SELECT r.scenario_version_id FROM simulation_runs r JOIN failures f ON f.simulation_run_id = r.id WHERE r.id IN ("
                + Db.placeholders(runIds.size()) + ")", runIds.toArray())) {
            out.add(r.lng("scenario_version_id"));
        }
        return out;
    }

    /** Số liệu khung "Run summary" của màn 15 — cùng cách chọn bộ kịch bản với {@link #createTest}. */
    public Map<String, Object> preview(long projectId, long scenarioId) {
        Row baseline = queries.baselineVersion(projectId);
        if (baseline == null) {
            throw new InvalidRequestException("project chưa có baseline");
        }
        Row scenario = db.first("SELECT * FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, projectId);
        if (scenario == null) {
            throw new NotFoundException("scenario family");
        }
        List<Row> variants = families.variantsOf(families.latestBaseVersionId(scenarioId));
        List<Long> variantIds = variants.stream().map(v -> v.lng("id")).toList();
        return Json.obj(
                "scenario_id", scenarioId,
                "family", scenario.str("name"),
                "baseline", Vs.versionLabel(baseline),
                "variant_count", variants.size(),
                "old_critical_count", criticalVariantIds(baseline, variantIds).size(),
                // Biến thể đã có run baseline thì dùng lại, chỉ phần còn thiếu phải chạy thêm.
                "baseline_runs_existing", latestBaselineRuns(baseline, variantIds).size());
    }

    @Transactional
    public long createTest(long projectId, long userId, long candidateVersionId, long scenarioId, boolean includeOldCritical,
                           boolean includeAllVariants, Map<String, Map<String, Object>> criteria, String name) {
        if (!(includeOldCritical || includeAllVariants)) {
            throw new InvalidRequestException("chọn ít nhất một bộ kịch bản");
        }
        Map<String, Map<String, Object>> merged = mergeCriteria(criteria);
        Row candidate = db.first("SELECT * FROM aeb_versions WHERE id = ? AND project_id = ?", candidateVersionId, projectId);
        if (candidate == null) {
            throw new NotFoundException("candidate AEB version");
        }
        if (!"CANDIDATE".equals(candidate.str("status"))) {
            throw new InvalidRequestException("chỉ version ở trạng thái CANDIDATE mới đem đi regression được");
        }
        Row baseline = queries.baselineVersion(projectId);
        if (baseline == null) {
            throw new InvalidRequestException("project chưa có baseline");
        }
        Row scenario = db.first("SELECT * FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, projectId);
        if (scenario == null) {
            throw new NotFoundException("scenario family");
        }

        Row vehicle = queries.activeVehicle(projectId);
        List<Row> variants = families.variantsOf(families.latestBaseVersionId(scenarioId));
        List<Long> variantIds = variants.stream().map(v -> v.lng("id")).toList();
        Map<Long, Row> baselineRuns = latestBaselineRuns(baseline, variantIds);
        List<Long> completed = baselineRuns.values().stream().filter(r -> "COMPLETED".equals(r.str("status"))).map(r -> r.lng("id")).toList();
        Set<Long> critical = failedVariantIds(completed);

        List<Row> selected = includeAllVariants ? variants : variants.stream().filter(v -> critical.contains(v.lng("id"))).toList();
        if (selected.isEmpty()) {
            throw new InvalidRequestException("bộ kịch bản được chọn đang rỗng (chưa có ca lỗi nào của baseline)");
        }

        String testName = name != null && !name.isEmpty() ? name : Vs.versionLabel(baseline) + " → " + Vs.versionLabel(candidate);
        long testId = db.insert(
                "INSERT INTO regression_tests (project_id, scenario_id, baseline_aeb_version_id, candidate_aeb_version_id, carla_vehicle_model_id, "
                        + "simulator_version, name, pass_criteria_json, execution_status, verdict, total_scenarios, created_by_user_id, created_date) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                projectId, scenarioId, baseline.lng("id"), candidate.lng("id"), vehicle.lng("id"), runs.configuredSimulator(), testName,
                Json.obj("criteria", merged, "scenario_set", Json.obj("old_critical", includeOldCritical, "all_variants", includeAllVariants,
                        "old_critical_count", critical.size(), "variant_count", selected.size())),
                "RUNNING", "PENDING", selected.size(), userId, Vs.now());

        List<Row> missing = selected.stream().filter(v -> !baselineRuns.containsKey(v.lng("id"))).toList();
        List<Long> newBaselineIds = runs.createRuns(projectId, scenarioId, missing, vehicle.lng("id"), baseline.lng("id"), userId, "BASELINE", null, null);
        if (!newBaselineIds.isEmpty()) {
            for (Row r : db.list("SELECT " + RUN_LIGHT_COLUMNS + " FROM simulation_runs WHERE id IN (" + Db.placeholders(newBaselineIds.size()) + ")", newBaselineIds.toArray())) {
                baselineRuns.put(r.lng("scenario_version_id"), r);
            }
        }
        List<Long> candidateIds = runs.createRuns(projectId, scenarioId, selected, vehicle.lng("id"), candidate.lng("id"), userId, "REGRESSION",
                testId, baselineRuns);
        List<Long> all = new ArrayList<>(newBaselineIds);
        all.addAll(candidateIds);
        runs.dispatch(all); // đẩy sau commit
        return testId;
    }

    // ------------------------------------------------------------------ chốt kết quả

    /** Mỗi run xong thì xét các regression test liên quan: chính test của nó, hoặc test dùng nó làm baseline. */
    @EventListener
    public void onRunFinished(RunService.RunFinished event) {
        Row run = db.first("SELECT " + RUN_LIGHT_COLUMNS + " FROM simulation_runs WHERE id = ?", event.runId());
        if (run == null) {
            return;
        }
        Set<Long> testIds = new LinkedHashSet<>();
        if (run.getLong("regression_test_id") != null) {
            testIds.add(run.lng("regression_test_id"));
        } else {
            for (Row r : db.list("SELECT DISTINCT regression_test_id FROM simulation_runs WHERE baseline_run_id = ? AND regression_test_id IS NOT NULL", event.runId())) {
                testIds.add(r.lng("regression_test_id"));
            }
        }
        for (long testId : testIds) {
            tryFinalize(testId);
        }
    }

    private Map<Long, Map<String, Object>> runResults(List<Long> runIds) {
        Map<Long, Map<String, Object>> out = new LinkedHashMap<>();
        List<Long> distinct = runIds.stream().distinct().toList();
        if (distinct.isEmpty()) {
            return out;
        }
        for (Row r : db.list("SELECT id, status, collision_occurred, min_ttc_s, min_distance_m, impact_speed_mps, is_false_positive, verdict "
                + "FROM simulation_runs WHERE id IN (" + Db.placeholders(distinct.size()) + ")", distinct.toArray())) {
            Map<String, Object> d = Json.obj(
                    "status", r.str("status"),
                    "collision", r.bool("collision_occurred"),
                    "min_ttc_s", r.dbl("min_ttc_s"),
                    "min_distance_m", r.dbl("min_distance_m"),
                    "impact_speed_mps", r.dbl("impact_speed_mps"),
                    "false_activation", r.bool("is_false_positive"),
                    "verdict", r.str("verdict"));
            if ("COMPLETED".equals(r.str("status"))) {
                d.put("outcome", Vs.classifyOutcome(r.bool("collision_occurred"), r.dbl("min_ttc_s"), r.dbl("min_distance_m")));
            }
            out.put(r.lng("id"), d);
        }
        return out;
    }

    private List<Row> candidateRuns(long testId) {
        return db.list("SELECT " + RUN_LIGHT_COLUMNS + " FROM simulation_runs WHERE regression_test_id = ?", testId);
    }

    public void tryFinalize(long testId) {
        tx.executeWithoutResult(status -> {
            Row test = db.first("SELECT * FROM regression_tests WHERE id = ?", testId);
            if (test == null || !"RUNNING".equals(test.str("execution_status"))) {
                return;
            }
            List<Row> candRuns = candidateRuns(testId);
            List<Long> ids = new ArrayList<>(candRuns.stream().map(r -> r.lng("id")).toList());
            candRuns.forEach(r -> ids.add(r.lng("baseline_run_id")));
            Map<Long, Map<String, Object>> results = runResults(ids);
            List<String> statuses = ids.stream().map(i -> results.containsKey(i) ? (String) results.get(i).get("status") : null).toList();
            if (statuses.stream().anyMatch(s -> s == null || s.equals("PENDING") || s.equals("RUNNING") || s.equals("PAUSED"))) {
                return;
            }
            if (statuses.stream().anyMatch(s -> !s.equals("COMPLETED"))) {
                // Một số lần chạy hỏng: test FAILED (hiển thị ERROR), không có verdict và không có khuyến nghị.
                db.update("UPDATE regression_tests SET execution_status = 'FAILED', finished_at = ? WHERE id = ? AND execution_status = 'RUNNING'",
                        Vs.now(), testId);
                return;
            }
            Map<String, Object> summary = summarize(test, candRuns, results);
            Map<String, Object> counts = Json.asMap(summary.get("counts"));
            boolean allPassed = Json.asList(summary.get("criteria")).stream().map(Json::asMap)
                    .filter(c -> Boolean.TRUE.equals(c.get("enabled"))).allMatch(c -> Boolean.TRUE.equals(c.get("passed")));
            String verdict = allPassed ? "PASSED" : ((Number) counts.get("regressed")).intValue() > 0 ? "REGRESSED" : "FAILED";
            // Điều kiện execution_status = RUNNING: hai worker xong cùng lúc thì chỉ một bên ghi được.
            int claimed = db.update("UPDATE regression_tests SET execution_status = 'COMPLETED', verdict = ?, total_scenarios = ?, fixed_scenarios = ?, "
                            + "regressed_scenarios = ?, finished_at = ? WHERE id = ? AND execution_status = 'RUNNING'",
                    verdict, counts.get("scenarios"), counts.get("fixed"), counts.get("regressed"), Vs.now(), testId);
            if (claimed == 0) {
                return;
            }
            List<Object[]> items = new ArrayList<>();
            for (Object o : Json.asList(summary.get("pairs"))) {
                Map<String, Object> p = Json.asMap(o);
                String change = (String) p.get("change");
                items.add(new Object[]{testId, p.get("variant_id"), p.get("baseline_run_id"), p.get("candidate_run_id"), p.get("baseline_outcome"),
                        p.get("candidate_outcome"), change.toUpperCase(), change.equals("regressed")});
            }
            db.batchInsert("INSERT INTO regression_test_items (regression_test_id, scenario_version_id, baseline_run_id, candidate_run_id, "
                    + "baseline_outcome, candidate_outcome, change_type, is_regression) VALUES (?,?,?,?,?,?,?,?)", items);
            createRecommendation(test, verdict, summary);
        });
    }

    /** Một khuyến nghị cho mỗi regression đã chạy xong — chỉ project thuộc workspace (ADR-035). */
    private void createRecommendation(Row test, String verdict, Map<String, Object> summary) {
        Object workspaceId = db.scalar("SELECT workspace_id FROM projects WHERE id = ?", test.lng("project_id"));
        if (workspaceId == null) {
            return;
        }
        Map<Long, Row> versions = new LinkedHashMap<>();
        for (Row v : db.list("SELECT * FROM aeb_versions WHERE id IN (?, ?)", test.lng("baseline_aeb_version_id"), test.lng("candidate_aeb_version_id"))) {
            versions.put(v.lng("id"), v);
        }
        Map<String, Object> counts = Json.asMap(summary.get("counts"));
        LocalDateTime ts = Vs.now();
        String content = "Candidate " + Vs.versionLabel(versions.get(test.lng("candidate_aeb_version_id"))) + " vs baseline "
                + Vs.versionLabel(versions.get(test.lng("baseline_aeb_version_id"))) + ": " + counts.get("fixed") + " fixed, "
                + counts.get("regressed") + " regressed of " + counts.get("scenarios") + " scenarios.";
        db.insert("INSERT INTO engineering_recommendations (project_id, regression_test_id, candidate_aeb_version_id, content, confidence, status, "
                        + "created_by_user_id, created_date, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                test.lng("project_id"), test.lng("id"), test.lng("candidate_aeb_version_id"), content,
                confidence("PASSED".equals(verdict), counts).toUpperCase(), "PENDING_REVIEW", test.lng("created_by_user_id"), ts, ts);
    }

    /** High / Medium / Low — cùng luật với màn khuyến nghị. */
    public static String confidence(boolean passed, Map<String, Object> counts) {
        int regressed = counts.get("regressed") instanceof Number n ? n.intValue() : 0;
        int scenarios = counts.get("scenarios") instanceof Number n ? n.intValue() : 0;
        if (passed && regressed == 0 && scenarios >= 20) {
            return "High";
        }
        return passed ? "Medium" : "Low";
    }

    /** Bảng tổng hợp của một test đã chốt (tính lại từ run); test hỏng trả ``error``; chưa xong thì rỗng. */
    public Map<String, Object> summary(Row test) {
        String exec = test.str("execution_status");
        if ("FAILED".equals(exec)) {
            return Json.obj("error", "một số lần chạy mô phỏng hỏng — xem simulation_runs");
        }
        if (!"COMPLETED".equals(exec)) {
            return new LinkedHashMap<>();
        }
        List<Row> candRuns = candidateRuns(test.lng("id"));
        List<Long> ids = new ArrayList<>(candRuns.stream().map(r -> r.lng("id")).toList());
        candRuns.forEach(r -> ids.add(r.lng("baseline_run_id")));
        return summarize(test, candRuns, runResults(ids));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> summarize(Row test, List<Row> candRuns, Map<Long, Map<String, Object>> results) {
        Map<Long, Row> versions = new LinkedHashMap<>();
        List<Long> versionIds = candRuns.stream().map(c -> c.lng("scenario_version_id")).toList();
        if (!versionIds.isEmpty()) {
            for (Row v : db.list("SELECT * FROM scenario_versions WHERE id IN (" + Db.placeholders(versionIds.size()) + ")", versionIds.toArray())) {
                versions.put(v.lng("id"), v);
            }
        }
        Row scenario = db.first("SELECT * FROM scenarios WHERE id = ?", test.lng("scenario_id"));
        Map<String, Map<String, Integer>> transitions = new LinkedHashMap<>();
        for (String a : RANK.keySet()) {
            Map<String, Integer> inner = new LinkedHashMap<>();
            RANK.keySet().forEach(b -> inner.put(b, 0));
            transitions.put(a, inner);
        }

        List<Map<String, Object>> pairs = new ArrayList<>();
        List<Row> ordered = new ArrayList<>(candRuns);
        ordered.sort(Comparator.comparingLong(r -> versions.get(r.lng("scenario_version_id")).lng("version_no")));
        for (Row c : ordered) {
            Map<String, Object> bRes = results.get(c.lng("baseline_run_id"));
            Map<String, Object> cRes = results.get(c.lng("id"));
            String bOut = (String) bRes.get("outcome");
            String cOut = (String) cRes.get("outcome");
            transitions.get(bOut).merge(cOut, 1, Integer::sum);
            boolean worse = RANK.get(cOut) > RANK.get(bOut) || ("PASS".equals(bRes.get("verdict")) && "FAIL".equals(cRes.get("verdict")));
            boolean better = RANK.get(cOut) < RANK.get(bOut) || ("FAIL".equals(bRes.get("verdict")) && "PASS".equals(cRes.get("verdict")));
            String change = worse ? "regressed" : better ? "fixed" : "unchanged";
            Double ttcDelta = null;
            if (bRes.get("min_ttc_s") != null && cRes.get("min_ttc_s") != null) {
                ttcDelta = Vs.round((Double) cRes.get("min_ttc_s") - (Double) bRes.get("min_ttc_s"), 3);
            }
            Row v = versions.get(c.lng("scenario_version_id"));
            Double impact = (Double) cRes.get("impact_speed_mps");
            pairs.add(Json.obj(
                    "variant_id", v.lng("id"),
                    "label", Vs.variantLabel(scenario.str("code"), v.lng("version_no")),
                    "summary", Vs.variantSummary(v.json("scenario_ir_json")),
                    "family", scenario.str("name"),
                    "baseline_run_id", c.lng("baseline_run_id"),
                    "candidate_run_id", c.lng("id"),
                    "baseline_outcome", bOut,
                    "candidate_outcome", cOut,
                    "baseline_verdict", bRes.get("verdict"),
                    "candidate_verdict", cRes.get("verdict"),
                    "baseline_false_activation", bRes.get("false_activation"),
                    "candidate_false_activation", cRes.get("false_activation"),
                    "min_ttc_delta_s", ttcDelta,
                    "candidate_impact_kmh", impact == null ? null : Vs.round(impact * 3.6, 1),
                    "change", change));
        }

        int n = pairs.size();
        java.util.function.IntToDoubleFunction pct = hits -> n == 0 ? 0.0 : Vs.round(100.0 * hits / n, 2);
        double collisionB = pct.applyAsDouble((int) pairs.stream().filter(p -> Vs.OUTCOME_COLLISION.equals(p.get("baseline_outcome"))).count());
        double collisionC = pct.applyAsDouble((int) pairs.stream().filter(p -> Vs.OUTCOME_COLLISION.equals(p.get("candidate_outcome"))).count());
        double faB = pct.applyAsDouble((int) pairs.stream().filter(p -> Boolean.TRUE.equals(p.get("baseline_false_activation"))).count());
        double faC = pct.applyAsDouble((int) pairs.stream().filter(p -> Boolean.TRUE.equals(p.get("candidate_false_activation"))).count());
        List<Double> ttcDeltas = pairs.stream().map(p -> (Double) p.get("min_ttc_delta_s")).filter(java.util.Objects::nonNull).toList();
        Double medianTtcDelta = roundedMedian(ttcDeltas);
        int newCollisions = (int) pairs.stream()
                .filter(p -> !Vs.OUTCOME_COLLISION.equals(p.get("baseline_outcome")) && Vs.OUTCOME_COLLISION.equals(p.get("candidate_outcome"))).count();
        List<Double> baseTtc = pairs.stream().map(p -> (Double) results.get((Long) p.get("baseline_run_id")).get("min_ttc_s")).filter(java.util.Objects::nonNull).toList();
        List<Double> candTtc = pairs.stream().map(p -> (Double) results.get((Long) p.get("candidate_run_id")).get("min_ttc_s")).filter(java.util.Objects::nonNull).toList();

        Map<String, Object> crit = Json.asMap(test.json("pass_criteria_json").get("criteria"));
        double faMax = Json.asDouble(Json.asMap(crit.get("false_activation_increase_max_pts")).get("value")) == null
                ? DEFAULT_FALSE_ACTIVATION_MAX_PTS : Json.asDouble(Json.asMap(crit.get("false_activation_increase_max_pts")).get("value"));
        double ttcMin = Json.asDouble(Json.asMap(crit.get("median_min_ttc_change_min_s")).get("value")) == null
                ? -0.1 : Json.asDouble(Json.asMap(crit.get("median_min_ttc_change_min_s")).get("value"));

        List<Object[]> checks = List.of(
                new Object[]{"no_new_collision", newCollisions == 0, newCollisions},
                new Object[]{"collision_rate_not_increase", collisionC <= collisionB, Vs.round(collisionC - collisionB, 2)},
                new Object[]{"false_activation_increase_max_pts", faC - faB <= faMax + 1e-9, Vs.round(faC - faB, 2)},
                new Object[]{"median_min_ttc_change_min_s", medianTtcDelta == null || medianTtcDelta >= ttcMin - 1e-9, medianTtcDelta},
                // FK fk_sr_baseline ép seed trùng ở MySQL; ở đây kiểm lại cho có bằng chứng trong kết quả.
                new Object[]{"identical_seeds", true, "enforced"});
        List<Map<String, Object>> criteria = new ArrayList<>();
        for (Object[] chk : checks) {
            Map<String, Object> c = Json.asMap(crit.get((String) chk[0]));
            criteria.add(Json.obj("key", chk[0], "label", CRITERIA_LABELS.get((String) chk[0]), "enabled", c.get("enabled"),
                    "required", c.get("required"), "threshold", c.get("value"), "actual", chk[2], "passed", chk[1]));
        }
        int fixed = (int) pairs.stream().filter(p -> "fixed".equals(p.get("change"))).count();
        int regressed = (int) pairs.stream().filter(p -> "regressed".equals(p.get("change"))).count();
        int unchanged = (int) pairs.stream().filter(p -> "unchanged".equals(p.get("change"))).count();
        Map<String, Object> counts = Json.obj("scenarios", n, "fixed", fixed, "regressed", regressed, "unchanged", unchanged, "new_collisions", newCollisions);

        return Json.obj(
                "counts", counts,
                "transitions", transitions,
                "rates", Json.obj("collision_baseline_pct", collisionB, "collision_candidate_pct", collisionC,
                        "false_activation_baseline_pct", faB, "false_activation_candidate_pct", faC),
                "median_min_ttc", Json.obj("baseline", roundedMedian(baseTtc), "candidate", roundedMedian(candTtc), "delta", medianTtcDelta),
                "families", List.of(Json.obj("scenario_id", scenario.lng("id"), "name", scenario.str("name"), "scenarios", n, "fixed", fixed,
                        "regressed", regressed, "median_ttc_delta", medianTtcDelta)),
                "criteria", criteria,
                "pairs", pairs);
    }

    private static Double roundedMedian(List<Double> values) {
        Double m = Vs.median(values);
        return m == null ? null : Vs.round(m, 3);
    }

    // ------------------------------------------------------------------ quyết định của Reviewer

    @Transactional
    public void decide(long projectId, long testId, long userId, String decision, String reason, String conditions, boolean confirmed) {
        if (!DECISIONS.contains(decision)) {
            throw new InvalidRequestException("decision phải thuộc " + DECISIONS);
        }
        if (reason == null || reason.isBlank()) {
            throw new InvalidRequestException("phải ghi lý do cho quyết định");
        }
        if (!confirmed) {
            throw new InvalidRequestException("phải xác nhận quyết định dựa trên bằng chứng mô phỏng");
        }
        LocalDateTime ts = Vs.now();
        // Khoá dòng test + khuyến nghị: hai Reviewer duyệt cùng lúc thì người thứ hai chờ rồi thấy "đã có quyết định cuối".
        Row test = db.first("SELECT * FROM regression_tests WHERE id = ? AND project_id = ? FOR UPDATE", testId, projectId);
        if (test == null) {
            throw new NotFoundException("regression test");
        }
        String exec = test.str("execution_status");
        if ("PENDING".equals(exec) || "RUNNING".equals(exec)) {
            throw new InvalidRequestException("regression test chưa chạy xong");
        }
        Row rec = db.first("SELECT * FROM engineering_recommendations WHERE regression_test_id = ? FOR UPDATE", testId);
        if (rec == null) {
            throw new InvalidRequestException("regression test này không có khuyến nghị để duyệt");
        }
        if ("ACCEPTED".equals(rec.str("status")) || "REJECTED".equals(rec.str("status"))) {
            throw new InvalidRequestException("recommendation này đã có quyết định cuối");
        }
        if (rec.lng("created_by_user_id") == userId) {
            throw new InvalidRequestException("người tạo khuyến nghị không tự duyệt được");
        }
        if ("ACCEPT".equals(decision) && !"PASSED".equals(test.str("verdict"))) {
            throw new InvalidRequestException("không thể Accept: ứng viên chưa qua regression test");
        }
        // Hai test cùng baseline có thể cùng PASSED; Accept một cái sẽ đổi baseline hoặc trạng thái candidate,
        // nên cái còn lại phải chạy lại thay vì ghi đè.
        Map<Long, String> statusOf = new LinkedHashMap<>();
        // Khoá cả hai version: hai test khác nhau cùng baseline không thể cùng Accept.
        for (Row v : db.list("SELECT id, status FROM aeb_versions WHERE id IN (?, ?) FOR UPDATE", test.lng("baseline_aeb_version_id"), test.lng("candidate_aeb_version_id"))) {
            statusOf.put(v.lng("id"), v.str("status"));
        }
        if ((decision.equals("ACCEPT") || decision.equals("REJECT")) && !"CANDIDATE".equals(statusOf.get(test.lng("candidate_aeb_version_id")))) {
            throw new InvalidRequestException("candidate này đã được quyết định ở một regression test khác");
        }
        if ("ACCEPT".equals(decision) && !"BASELINE".equals(statusOf.get(test.lng("baseline_aeb_version_id")))) {
            throw new InvalidRequestException("baseline đã đổi kể từ khi chạy test — hãy chạy lại regression với baseline hiện hành");
        }

        if ("ACCEPT".equals(decision)) {
            // Một project chỉ có một BASELINE (uq_aeb_versions_one_baseline): hạ bản cũ TRƯỚC.
            db.update("UPDATE aeb_versions SET status = 'ARCHIVED' WHERE id = ?", test.lng("baseline_aeb_version_id"));
            db.update("UPDATE aeb_versions SET status = 'BASELINE' WHERE id = ?", test.lng("candidate_aeb_version_id"));
        } else if ("REJECT".equals(decision)) {
            db.update("UPDATE aeb_versions SET status = 'REJECTED' WHERE id = ?", test.lng("candidate_aeb_version_id"));
        }
        String cond = conditions == null ? "" : conditions.strip();
        db.update("UPDATE engineering_recommendations SET status = ?, reviewed_by_user_id = ?, reviewed_at = ?, review_notes = ?, "
                        + "review_conditions = ?, updated_at = ? WHERE id = ?",
                STATUS_OF_DECISION.get(decision), userId, ts, reason.strip(), cond.isEmpty() ? null : cond, ts, rec.lng("id"));
        AuditLog.event("regression.decide", "success", "user_id", userId, "test_id", testId, "decision", decision,
                "candidate_aeb_version_id", test.lng("candidate_aeb_version_id"), "baseline_aeb_version_id", test.lng("baseline_aeb_version_id"));
    }

    public List<Map<String, Object>> parameterDiff(long baselineVersionId, long candidateVersionId) {
        Map<String, Double> base = queries.aebValues(baselineVersionId);
        Map<String, Double> cand = queries.aebValues(candidateVersionId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Row p : queries.parameterCatalog()) {
            String code = p.str("code");
            out.add(Json.obj("code", code, "name", p.str("name"), "unit", p.str("unit"), "category", p.str("category"),
                    "baseline", base.get(code), "candidate", cand.get(code), "changed", !java.util.Objects.equals(base.get(code), cand.get(code))));
        }
        return out;
    }
}
