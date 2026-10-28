import com.vehicsim.core.MiniJson;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Kiểm thử tích hợp chạy trên backend :8101 và MySQL :13316 dùng một lần (container {@code vehicsim-analysis-mysql-test} /
 * {@code -redis-test}). Chỉ tạo tài khoản {@code @example.invalid}; không bao giờ trỏ vào MySQL của máy dev.
 *
 * <ul>
 *   <li>{@code analysis}: dựng baseline động học thật, kiểm bộ lọc / chỉ số / tách tập tối ưu–xác minh / snapshot sau khi chạy lại,
 *       vòng đời run, chặn artifact thiếu và chuỗi nguyên nhân lỗi. Ghi {@code data/analysis-integration/evidence.json}.</li>
 *   <li>{@code merge}: chạy sau {@code analysis}; nối dataset v2 sang regression + Reviewer, cố ý Accept một candidate
 *       trong DB dùng một lần.</li>
 * </ul>
 *
 * <pre>
 *   java -cp target/classes scripts/IntegrationSmoke.java analysis
 *   java -cp target/classes scripts/IntegrationSmoke.java merge
 * </pre>
 */
public class IntegrationSmoke {

    static final String BASE = "http://127.0.0.1:8101/api/v1";
    static final String CONTAINER = "vehicsim-analysis-mysql-test";
    static final String EMAIL = "analysis-integration@example.invalid";
    static final String PASSWORD = "Analysis-test-only-2026!";
    static final String REVIEWER_EMAIL = "merge-reviewer@example.invalid";
    static final String REVIEWER_PASSWORD = "Merge-review-fixture-2026!";
    static final Path OUTPUT = Path.of("data", "analysis-integration");
    static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).build();

    public static void main(String[] args) throws Exception {
        String mode = args.length == 1 ? args[0] : "";
        switch (mode) {
            case "analysis" -> analysis();
            case "merge" -> merge();
            default -> {
                System.err.println("Dùng: java -cp target/classes scripts/IntegrationSmoke.java analysis|merge");
                System.exit(2);
            }
        }
    }

    // ------------------------------------------------------------------ analysis

    static void analysis() throws Exception {
        // Chốt an toàn: script cố ý gắn với container / cổng dùng một lần.
        check(exec(List.of("docker", "port", CONTAINER, "3306")).contains("13316"), "Disposable MySQL port required");
        call("/vehicsim/analysis/runs", null, null, 401);
        if (sql("SELECT COUNT(*) FROM users WHERE email='" + EMAIL + "'").equals("0")) {
            call("/auth/register", map("email", EMAIL, "password", PASSWORD, "lastName", "Analysis", "firstName", "Integration"), null, 200);
        }
        sql("UPDATE users SET role_id=(SELECT id FROM roles WHERE code='ADMIN') WHERE email='" + EMAIL + "'");
        String token = str(obj(call("/auth/login", map("email", EMAIL, "password", PASSWORD), null, 200)).get("access_token"));
        call("/vehicsim/bootstrap", map(), token, 200);
        Map<String, Object> family = obj(call("/vehicsim/families", map(
                "name", "Analysis integration CP crossing",
                "ego_speeds_kmh", List.of(20, 40, 60),
                "trigger_distances_m", List.of(15, 30, 50), // 20 km/h + 60 m không tới vạch trong 12 s (FamilySpec.unreachablePairs)
                "pedestrian_speeds_mps", List.of(1.4),
                "stops_at_curb", List.of(false, true),
                "weathers", List.of("CLEAR"), "times_of_day", List.of("DAY"), "run_baseline", true), token, 201));
        long scenario = num(family.get("scenario_id"));
        Map<String, Object> dashboard = obj(call("/vehicsim/analysis/runs?scenario_id=" + scenario + "&page_size=100", null, token, 200));
        check(num(dashboard.get("total")) == 18, dashboard);
        List<Map<String, Object>> runs = objs(dashboard.get("items"));
        check(runs.stream().allMatch(r -> "COMPLETED".equals(r.get("status")) && Boolean.TRUE.equals(r.get("trace_available"))), "runs not completed");
        List<Map<String, Object>> safe = runs.stream().filter(r -> "SAFE".equals(r.get("outcome"))).toList();
        check(safe.size() >= 2, dashboard.get("counts"));
        List<Map<String, Object>> optimization = new ArrayList<>(List.of(safe.get(0)));
        List<Map<String, Object>> validation = new ArrayList<>(List.of(safe.get(1)));
        // Mỗi tập có một ca có pha phanh bên cạnh ca an toàn.
        for (List<Map<String, Object>> target : List.of(optimization, validation)) {
            Set<Object> excluded = new HashSet<>();
            optimization.forEach(r -> excluded.add(r.get("run_id")));
            validation.forEach(r -> excluded.add(r.get("run_id")));
            if (target.stream().noneMatch(r -> obj(r.get("metrics")).get("rms_jerk_mps3") != null)) {
                target.add(runs.stream().filter(r -> !excluded.contains(r.get("run_id"))
                        && obj(r.get("metrics")).get("rms_jerk_mps3") != null).findFirst().orElseThrow());
            }
        }
        List<Map<String, Object>> selected = new ArrayList<>(optimization);
        selected.addAll(validation);
        Map<String, Object> revisions = new LinkedHashMap<>();
        selected.forEach(r -> revisions.put(String.valueOf(r.get("run_id")), r.get("revision")));
        Map<String, Object> payload = map("scenario_id", scenario, "baseline_id", selected.get(0).get("baseline_id"),
                "optimization_run_ids", ids(optimization), "validation_run_ids", ids(validation), "run_revisions", revisions);
        // Run lạ / thiếu, preview cũ và hai tập chồng nhau không được lưu.
        call("/vehicsim/analysis/selections", with(payload, "run_revisions", map()), token, 400);
        call("/vehicsim/analysis/selections", with(payload, "validation_run_ids", payload.get("optimization_run_ids")), token, 400);
        long datasetId = num(obj(call("/vehicsim/analysis/selections", payload, token, 200)).get("id"));
        Map<String, Object> loaded = obj(call("/vehicsim/analysis/datasets/" + datasetId, null, token, 200));
        Map<String, Object> handed = obj(call("/vehicsim/analysis/datasets/" + datasetId + "/handoff", null, token, 200));
        check(Objects.equals(handed.get("runs"), loaded.get("runs")), "handoff runs differ");
        check(Objects.equals(handed.get("optimization_run_ids"), payload.get("optimization_run_ids")), "optimization ids differ");
        check(Objects.equals(handed.get("validation_run_ids"), payload.get("validation_run_ids")), "validation ids differ");
        // Đối chiếu mục tiêu gộp với giá trị đã ghi, kể cả mục tiêu = 0 khi không va chạm.
        double expectedImpact = optimization.stream().mapToDouble(r -> dbl(obj(r.get("metrics")).get("impact_speed_mps"))).sum() / optimization.size();
        double handedImpact = dbl(obj(obj(handed.get("optimization_objectives")).get("impact_speed_mps")).get("value"));
        check(Math.abs(handedImpact - expectedImpact) < 1e-9, "impact objective mismatch");
        long firstRun = num(selected.get(0).get("run_id"));
        Map<String, Object> detail = obj(call("/vehicsim/analysis/runs/" + firstRun, null, token, 200));
        check(truthy(obj(detail.get("detail")).get("motion_telemetry")), "motion telemetry missing");
        Map<String, Object> playback = obj(call("/vehicsim/runs/" + firstRun + "/playback", null, token, 200));
        check(truthy(playback.get("motion_telemetry")), "playback telemetry missing");
        List<Map<String, Object>> frames = objs(playback.get("frames"));
        check(dbl(playback.get("duration_s")) == dbl(frames.get(frames.size() - 1).get("t")), "playback duration mismatch");
        // Chạy lại baseline qua RunService: dataset cũ phải giữ nguyên run ID và seed.
        call("/vehicsim/families/" + scenario + "/run", map(), token, 202);
        Map<String, Object> reloaded = obj(call("/vehicsim/analysis/datasets/" + datasetId + "/handoff", null, token, 200));
        check(Objects.equals(reloaded.get("runs"), handed.get("runs")), "dataset changed after new runs");
        List<Map<String, Object>> allRuns = objs(obj(call("/vehicsim/analysis/runs?scenario_id=" + scenario + "&page_size=100", null, token, 200)).get("items"));
        Map<String, Object> duplicate = allRuns.stream().filter(r -> Objects.equals(r.get("scenario_version_id"), optimization.get(0).get("scenario_version_id"))
                && !Objects.equals(r.get("run_id"), optimization.get(0).get("run_id"))).findFirst().orElseThrow();
        List<Object> dupIds = new ArrayList<>(list(payload.get("optimization_run_ids")));
        dupIds.add(duplicate.get("run_id"));
        Map<String, Object> dupRevisions = new LinkedHashMap<>(revisions);
        dupRevisions.put(String.valueOf(duplicate.get("run_id")), duplicate.get("revision"));
        call("/vehicsim/analysis/selections", with(with(payload, "optimization_run_ids", dupIds), "run_revisions", dupRevisions), token, 400);
        Map<String, Object> failure = runs.stream().filter(r -> "COLLISION".equals(r.get("outcome"))).findFirst().orElseThrow();
        Map<String, Object> failureDetail = obj(obj(call("/vehicsim/analysis/runs/" + failure.get("run_id"), null, token, 200)).get("detail"));
        check(truthy(failureDetail.get("chain")) && list(failureDetail.get("stage_evidence")).size() == 4, "failure chain incomplete");
        Map<String, Object> filtered = obj(call("/vehicsim/analysis/runs?scenario_id=" + scenario + "&status=FAILED&page_size=100", null, token, 200));
        check(num(filtered.get("total")) == 0 && obj(filtered.get("counts")).values().stream().mapToLong(IntegrationSmoke::num).sum() == 0, "FAILED filter not empty");

        // Fixture vòng đời chỉ trong DB dùng một lần; đây không phải kết quả mô phỏng.
        Object fixtureId = runs.get(runs.size() - 1).get("run_id");
        String original = sql("SELECT status FROM simulation_runs WHERE id=" + fixtureId);
        for (String[] c : new String[][] {{"STOPPED", "ERROR", "CANCELLED"}, {"FAILED", "ERROR", "ERROR"}, {"COMPLETED", "TIMEOUT", "TIMEOUT"}}) {
            String oldReason = sql("SELECT end_reason FROM simulation_runs WHERE id=" + fixtureId);
            sql("UPDATE simulation_runs SET status='" + c[0] + "',end_reason='" + c[1] + "' WHERE id=" + fixtureId);
            Map<String, Object> state = obj(call("/vehicsim/analysis/runs/" + fixtureId, null, token, 200));
            check(c[2].equals(obj(state.get("run")).get("outcome")), state);
            sql("UPDATE simulation_runs SET status='" + original + "',end_reason='" + oldReason + "' WHERE id=" + fixtureId);
        }

        // Kiểm vô hiệu theo digest nội dung mà không mất bằng chứng thật (khôi phục trong cùng phiên SQL).
        Process backup = new ProcessBuilder("docker", "exec", "-i", CONTAINER, "mysql", "-uroot", "-N", "--unbuffered", "vehicsim").start();
        Writer in = new OutputStreamWriter(backup.getOutputStream(), StandardCharsets.UTF_8);
        BufferedReader out = new BufferedReader(new InputStreamReader(backup.getInputStream(), StandardCharsets.UTF_8));
        statement(in, out, "SET @analysis_saved_trace=(SELECT telemetry_json FROM simulation_runs WHERE id=" + firstRun + "); "
                + "UPDATE simulation_runs SET telemetry_json=JSON_SET(telemetry_json,'$.frames',JSON_ARRAY()) WHERE id=" + firstRun, "MUTATED");
        try {
            call("/vehicsim/analysis/datasets/" + datasetId + "/handoff", null, token, 400);
            Map<String, Object> missingTrace = obj(call("/vehicsim/analysis/runs/" + firstRun, null, token, 200));
            check("INCOMPLETE".equals(obj(missingTrace.get("run")).get("outcome")), "missing trace not INCOMPLETE");
        } finally {
            statement(in, out, "UPDATE simulation_runs SET telemetry_json=@analysis_saved_trace WHERE id=" + firstRun, "RESTORED");
            in.close();
            check(backup.waitFor(10, TimeUnit.SECONDS) && backup.exitValue() == 0, "backup SQL session failed");
        }
        call("/vehicsim/analysis/datasets/" + datasetId + "/handoff", null, token, 200);
        Map<String, Object> evidence = map("scenario_id", scenario, "dataset_id", datasetId, "run_ids", ids(selected),
                "failure_run_id", failure.get("run_id"), "selection", payload, "counts", dashboard.get("counts"),
                "evaluation", handed.get("evaluation"),
                "tests", List.of("schema009", "real_kinematic_baseline", "filters", "metrics", "selection", "snapshot_after_new_runs",
                        "lifecycle_fixtures", "missing_artifact_guard", "failure_chain", "duplicate_variant_seed_guard"));
        Files.createDirectories(OUTPUT);
        write("evidence.json", MiniJson.write(evidence));
        write("sample-playback.json", MiniJson.write(playback));
        System.out.println("PASS: real backend/MySQL integration, baseline runs, metrics, immutable split and invalid-data guards");
        System.out.println(MiniJson.write(map("scenario_id", scenario, "dataset_id", datasetId, "counts", dashboard.get("counts"))));
    }

    static void statement(Writer in, BufferedReader out, String text, String marker) throws Exception {
        in.write(text + "; SELECT '" + marker + "';\n");
        in.flush();
        while (true) {
            String line = out.readLine();
            check(line != null, "backup SQL session closed unexpectedly");
            if (line.strip().equals(marker)) return;
        }
    }

    // ------------------------------------------------------------------ merge

    static void merge() throws Exception {
        Map<String, Object> evidence = obj(MiniJson.parse(Files.readString(OUTPUT.resolve("evidence.json"), StandardCharsets.UTF_8)));
        guard(evidence);
        String token = str(obj(call("/auth/login", map("email", EMAIL, "password", PASSWORD), null, 200)).get("access_token"));
        String reviewer = reviewerToken();
        long scenarioId = num(evidence.get("scenario_id"));
        long datasetId = num(evidence.get("dataset_id"));
        Map<String, Object> frozen = obj(call("/vehicsim/analysis/datasets/" + datasetId + "/handoff", null, token, 200));
        long baselineId = num(obj(frozen.get("baseline")).get("id"));
        Set<Object> validationIds = new HashSet<>(list(frozen.get("validation_run_ids")));
        List<Map<String, Object>> selected = objs(frozen.get("runs")).stream().filter(r -> validationIds.contains(r.get("run_id"))).toList();
        List<Object> variantIds = selected.stream().map(r -> r.get("scenario_version_id")).toList();
        check(variantIds.size() == new HashSet<>(variantIds).size() && selected.stream().anyMatch(r -> "SAFE".equals(r.get("outcome"))), "bad validation set");
        StringBuilder query = new StringBuilder();
        variantIds.forEach(v -> query.append("&variant_ids=").append(v));
        Map<String, Object> preview = obj(call("/vehicsim/regression/preview?scenario_id=" + scenarioId + "&include_variants=true" + query, null, token, 200));
        check(num(preview.get("selected_count")) == variantIds.size(), preview);
        check(num(preview.get("selected_safe_count")) >= 1, preview);
        check(num(preview.get("selected_baseline_runs_existing")) == variantIds.size(), preview);

        Map<String, Object> baseline = objs(call("/vehicsim/aeb/versions", null, token, 200)).stream()
                .filter(v -> num(v.get("id")) == baselineId).findFirst().orElseThrow();
        Map<String, Object> parameters = obj(baseline.get("parameters"));
        // Production chặn candidate trùng hệt cha trực tiếp: tạo một cha trung gian hợp lệ rồi trả lại giá trị gốc ở con,
        // nên giá trị con khớp baseline mà không lách luật ứng dụng.
        List<Map<String, Object>> catalog = objs(obj(call("/vehicsim/context", null, token, 200)).get("parameters"));
        Map<String, Object> ttc = catalog.stream().filter(p -> "TTC_THRESHOLD".equals(p.get("code"))).findFirst().orElseThrow();
        double ttcValue = dbl(parameters.get("TTC_THRESHOLD"));
        double delta = ttcValue + 0.0001 <= dbl(ttc.get("max_value")) ? 0.0001 : -0.0001;
        Map<String, Object> changed = with(parameters, "TTC_THRESHOLD", Math.round((ttcValue + delta) * 10000.0) / 10000.0);
        long parent = num(obj(call("/vehicsim/aeb/versions", map("parent_version_id", baselineId, "label", "Merge integration intermediate",
                "values", changed, "notes", "Disposable fixture; never submitted for approval"), token, 201)).get("id"));

        long rejectedCandidate = candidate(parent, parameters, "Merge integration rejection", token);
        Regression rejected = regression(rejectedCandidate, baselineId, scenarioId, variantIds, selected, token);
        Map<String, Object> decision = map("decision", "REJECT", "reason", "Disposable integration verifies explicit Reviewer rejection", "confirmed", true);
        String decide = "/vehicsim/recommendations/" + rejected.id() + "/decision";
        call(decide, decision, null, 401);
        call(decide, decision, token, 403);
        call(decide, with(decision, "confirmed", false), reviewer, 400);
        call(decide, with(decision, "reason", ""), reviewer, 400);
        check("REJECT".equals(obj(obj(call(decide, decision, reviewer, 200)).get("review")).get("decision")), "reject not recorded");
        Map<String, Object> rejectedExport = obj(call("/vehicsim/regression/" + rejected.id() + "/export.json", null, token, 200));
        check("REJECT".equals(obj(rejectedExport.get("decision")).get("status")), "export decision not REJECT");
        check(sql("SELECT status FROM aeb_versions WHERE id=" + rejectedCandidate).equals("REJECTED"), "candidate not REJECTED");
        check(num(obj(obj(obj(call("/vehicsim/context", null, token, 200)).get("system")).get("baseline")).get("id")) == baselineId, "baseline changed after reject");

        long acceptedCandidate = candidate(parent, parameters, "Merge integration acceptance", token);
        long staleCandidate = candidate(parent, parameters, "Merge integration stale guard", token);
        Regression accepted = regression(acceptedCandidate, baselineId, scenarioId, variantIds, selected, token);
        Regression stale = regression(staleCandidate, baselineId, scenarioId, variantIds, selected, token);
        Map<String, Object> accept = map("decision", "ACCEPT", "reason", "Disposable integration verifies parity evidence and baseline promotion", "confirmed", true);
        check("ACCEPT".equals(obj(obj(call("/vehicsim/recommendations/" + accepted.id() + "/decision", accept, reviewer, 200)).get("review")).get("decision")), "accept not recorded");
        Map<String, Object> acceptedExport = obj(call("/vehicsim/regression/" + accepted.id() + "/export.json", null, token, 200));
        check("ACCEPT".equals(obj(acceptedExport.get("decision")).get("status")), "export decision not ACCEPT");
        check(num(obj(obj(obj(call("/vehicsim/context", null, token, 200)).get("system")).get("baseline")).get("id")) == acceptedCandidate, "baseline not promoted");
        check(sql("SELECT status FROM aeb_versions WHERE id=" + baselineId).equals("ARCHIVED"), "old baseline not ARCHIVED");
        check(sql("SELECT COUNT(*) FROM aeb_versions WHERE status='BASELINE'").equals("1"), "more than one BASELINE");
        Map<String, Object> staleReply = obj(call("/vehicsim/recommendations/" + stale.id() + "/decision", accept, reviewer, 400));
        check(str(staleReply.get("detail")).toLowerCase().contains("baseline"), staleReply);
        check(sql("SELECT status FROM aeb_versions WHERE id=" + staleCandidate).equals("CANDIDATE"), "stale candidate changed");
        Map<String, Object> history = obj(call("/vehicsim/decisions", null, reviewer, 200));
        Map<Long, Object> decisions = new LinkedHashMap<>();
        objs(history.get("decisions")).forEach(d -> decisions.put(num(d.get("test_id")), d.get("decision")));
        check("REJECT".equals(decisions.get(rejected.id())) && "ACCEPT".equals(decisions.get(accepted.id())), "decision history incomplete");
        check(objs(history.get("baselines")).stream().anyMatch(b -> num(b.get("id")) == acceptedCandidate && truthy(b.get("regression_code"))), "baseline history missing");
        Map<String, Object> archived = obj(call("/vehicsim/analysis/datasets/" + datasetId, null, token, 200));
        check(Boolean.FALSE.equals(archived.get("baseline_current")) && Objects.equals(archived.get("runs"), frozen.get("runs")), "archive changed");
        call("/vehicsim/analysis/datasets/" + datasetId + "/handoff", null, token, 400);
        for (Map<String, Object> run : selected) call("/vehicsim/analysis/runs/" + run.get("run_id"), null, token, 200);

        Map<String, Object> result = map("scenario_id", scenarioId, "dataset_id", datasetId, "variant_ids", variantIds,
                "previous_baseline_id", baselineId, "new_baseline_id", acceptedCandidate,
                "rejected_test_id", rejected.id(), "accepted_test_id", accepted.id(), "stale_test_id", stale.id(),
                "tests", List.of("custom_variant_preview", "exact_baseline_parameter_parity", "completed_same_seed_vehicle_simulator_pairs",
                        "regression_json_export", "regression_csv_export", "reviewer_auth_and_role", "reason_and_confirmation",
                        "explicit_reject", "explicit_accept", "decision_history", "stale_baseline_guard",
                        "immutable_analysis_archive_after_accept", "stale_analysis_handoff_guard"));
        write("merge-evidence.json", MiniJson.write(result));
        write("merge-rejected-export.json", MiniJson.write(rejectedExport));
        write("merge-accepted-export.json", MiniJson.write(acceptedExport));
        write("merge-rejected-export.csv", rejected.csv());
        write("merge-accepted-export.csv", accepted.csv());
        System.out.println("PASS: merged analysis-to-regression integration, exports, Reviewer decisions and stale-baseline guards");
        System.out.println(MiniJson.write(result));
    }

    record Regression(long id, String csv) {}

    static void guard(Map<String, Object> evidence) throws Exception {
        String ports = exec(List.of("docker", "port", CONTAINER, "3306"));
        List<String> lines = ports.strip().lines().toList();
        check(!lines.isEmpty() && lines.stream().allMatch(l -> l.strip().endsWith(":13316")), "Disposable MySQL port required");
        check(EMAIL.endsWith("@example.invalid") && REVIEWER_EMAIL.endsWith("@example.invalid"), "test accounts only");
        String owner = sql("SELECT u.email FROM analysis_results a JOIN users u ON u.id=a.created_by_user_id WHERE a.id="
                + num(evidence.get("dataset_id")) + " AND a.scenario_id=" + num(evidence.get("scenario_id")));
        check(owner.equals(EMAIL), "Analysis fixture must belong to disposable test account");
    }

    static String reviewerToken() throws Exception {
        if (sql("SELECT COUNT(*) FROM users WHERE email='" + REVIEWER_EMAIL + "'").equals("0")) {
            call("/auth/register", map("email", REVIEWER_EMAIL, "password", REVIEWER_PASSWORD, "lastName", "Merge", "firstName", "Reviewer"), null, 200);
        }
        sql("UPDATE users SET role_id=(SELECT id FROM roles WHERE code='REVIEWER') WHERE email='" + REVIEWER_EMAIL + "'");
        return str(obj(call("/auth/login", map("email", REVIEWER_EMAIL, "password", REVIEWER_PASSWORD), null, 200)).get("access_token"));
    }

    static long candidate(long parent, Map<String, Object> parameters, String label, String token) throws Exception {
        return num(obj(call("/vehicsim/aeb/versions", map("parent_version_id", parent, "label", label, "values", parameters,
                "notes", "Disposable exact-baseline parity fixture"), token, 201)).get("id"));
    }

    static Regression regression(long candidateId, long baselineId, long scenarioId, List<Object> variantIds,
                                 List<Map<String, Object>> selected, String token) throws Exception {
        long id = num(obj(call("/vehicsim/regression", map("candidate_version_id", candidateId, "scenario_id", scenarioId,
                "variant_ids", variantIds, "include_old_critical", false, "include_all_variants", false,
                "name", "Merged analysis validation set parity"), token, 201)).get("id"));
        Map<String, Object> detail = completed(id, token);
        check(num(obj(detail.get("baseline")).get("id")) == baselineId && num(obj(detail.get("candidate")).get("id")) == candidateId, "pair mismatch");
        Map<String, Object> scenarioSet = obj(obj(detail.get("pass_criteria")).get("scenario_set"));
        check("custom".equals(scenarioSet.get("mode")), "scenario set not custom");
        check(new HashSet<>(list(scenarioSet.get("variant_ids"))).equals(new HashSet<>(variantIds)), "variant set differs");
        Map<String, Object> summary = obj(detail.get("summary"));
        check(num(obj(summary.get("counts")).get("regressed")) == 0 && num(obj(summary.get("counts")).get("new_collisions")) == 0, "regression not clean");
        check(objs(detail.get("parameter_diff")).stream().noneMatch(p -> truthy(p.get("changed"))), "parameters changed");
        List<Map<String, Object>> pairs = objs(summary.get("pairs"));
        Set<Object> pairVariants = new HashSet<>();
        pairs.forEach(p -> pairVariants.add(p.get("variant_id")));
        check(pairs.size() == variantIds.size() && pairVariants.equals(new HashSet<>(variantIds)), "pairs differ");
        String invalid = sql("SELECT COUNT(*) FROM simulation_runs c JOIN simulation_runs b ON b.id=c.baseline_run_id "
                + "WHERE c.regression_test_id=" + id + " AND (c.random_seed<>b.random_seed "
                + "OR c.scenario_version_id<>b.scenario_version_id OR c.carla_vehicle_model_id<>b.carla_vehicle_model_id "
                + "OR c.simulator_version<>b.simulator_version OR c.fixed_delta_seconds<>b.fixed_delta_seconds "
                + "OR c.status<>'COMPLETED' OR b.status<>'COMPLETED')");
        check(invalid.equals("0"), "Regression pairing identity mismatch");
        check(sql("SELECT COUNT(*) FROM simulation_runs WHERE regression_test_id=" + id).equals(String.valueOf(variantIds.size())), "run count mismatch");
        Map<String, Object> exported = obj(call("/vehicsim/regression/" + id + "/export.json", null, token, 200));
        check("vehicsim.regression-export/v1".equals(obj(exported.get("manifest")).get("schema")), "export schema");
        Map<Object, Object> expectedSeeds = new LinkedHashMap<>();
        selected.forEach(r -> expectedSeeds.put(r.get("scenario_version_id"), r.get("seed")));
        check(objs(exported.get("pairs")).stream().allMatch(p -> Objects.equals(p.get("seed"), expectedSeeds.get(p.get("variant_id")))), "seed mismatch");
        String content = csvExport(id, token);
        List<Map<String, String>> rows = csv(content);
        check(rows.size() == variantIds.size(), "csv row count");
        Set<Long> csvIds = new HashSet<>();
        rows.forEach(r -> csvIds.add(Long.parseLong(r.get("candidate_run_id"))));
        Set<Long> pairIds = new HashSet<>();
        pairs.forEach(p -> pairIds.add(num(p.get("candidate_run_id"))));
        check(csvIds.equals(pairIds), "csv candidate ids differ");
        return new Regression(id, content);
    }

    static Map<String, Object> completed(long testId, String token) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(90);
        while (true) {
            Map<String, Object> result = obj(call("/vehicsim/regression/" + testId, null, token, 200));
            Object status = result.get("status");
            if (!"RUNNING".equals(status) && !"PENDING".equals(status)) {
                check("PASSED".equals(status), "Parity regression " + testId + " was not PASSED");
                return result;
            }
            check(System.nanoTime() < deadline, "Regression did not complete");
            Thread.sleep(250);
        }
    }

    static String csvExport(long testId, String token) throws Exception {
        HttpResponse<String> response = HTTP.send(HttpRequest.newBuilder(URI.create(BASE + "/vehicsim/regression/" + testId + "/export.csv"))
                .timeout(Duration.ofSeconds(30)).header("Authorization", "Bearer " + token).GET().build(),
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        check(response.statusCode() == 200, "csv status " + response.statusCode());
        check(response.headers().firstValue("Content-Type").orElse("").contains("text/csv"), "csv content type");
        return response.body();
    }

    /** CSV RFC 4180 tối giản (trường trong ngoặc kép, "" là một dấu nháy), hàng đầu là tiêu đề. */
    static List<Map<String, String>> csv(String text) {
        List<List<String>> records = new ArrayList<>();
        List<String> record = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c == '"' && i + 1 < text.length() && text.charAt(i + 1) == '"') { field.append('"'); i++; }
                else if (c == '"') quoted = false;
                else field.append(c);
            } else if (c == '"') {
                quoted = true;
            } else if (c == ',') {
                record.add(field.toString()); field.setLength(0);
            } else if (c == '\n' || c == '\r') {
                if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') i++;
                record.add(field.toString()); field.setLength(0);
                records.add(record); record = new ArrayList<>();
            } else {
                field.append(c);
            }
        }
        if (field.length() > 0 || !record.isEmpty()) { record.add(field.toString()); records.add(record); }
        List<Map<String, String>> rows = new ArrayList<>();
        List<String> header = records.get(0);
        for (List<String> r : records.subList(1, records.size())) {
            if (r.size() == 1 && r.get(0).isEmpty()) continue;
            Map<String, String> row = new LinkedHashMap<>();
            for (int i = 0; i < header.size(); i++) row.put(header.get(i), i < r.size() ? r.get(i) : "");
            rows.add(row);
        }
        return rows;
    }

    // ------------------------------------------------------------------ helpers

    static Object call(String path, Object body, String token, int expected) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(BASE + path)).timeout(Duration.ofSeconds(90))
                .header("Content-Type", "application/json");
        if (token != null) request.header("Authorization", "Bearer " + token);
        request.method(body == null ? "GET" : "POST", body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(MiniJson.write(body), StandardCharsets.UTF_8));
        HttpResponse<String> response = HTTP.send(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Object value = response.body().isBlank() ? Map.of() : MiniJson.parse(response.body());
        if (response.statusCode() != expected) {
            Object detail = value instanceof Map<?, ?> m ? m.get("detail") : "unexpected response";
            throw new AssertionError(path + " -> " + response.statusCode() + " (expected " + expected + "): " + detail);
        }
        return value;
    }

    static String sql(String statement) throws Exception {
        Process process = new ProcessBuilder("docker", "exec", "-i", CONTAINER, "mysql", "-uroot", "-N", "vehicsim").start();
        try (Writer in = new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8)) {
            in.write(statement + ";\n");
        }
        String out = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        String err = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
        check(process.waitFor() == 0, "SQL failed: " + err.strip());
        return out.strip();
    }

    static String exec(List<String> command) throws Exception {
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        String out = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        check(process.waitFor() == 0, String.join(" ", command) + " failed: " + out.strip());
        return out;
    }

    static void write(String name, String content) throws Exception {
        Files.writeString(OUTPUT.resolve(name), content, StandardCharsets.UTF_8);
    }

    static void check(boolean ok, Object message) {
        if (!ok) throw new AssertionError(String.valueOf(message));
    }

    static Map<String, Object> map(Object... kv) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) out.put((String) kv[i], kv[i + 1]);
        return out;
    }

    static Map<String, Object> with(Map<String, Object> base, String key, Object value) {
        Map<String, Object> out = new LinkedHashMap<>(base);
        out.put(key, value);
        return out;
    }

    static List<Object> ids(List<Map<String, Object>> runs) {
        return runs.stream().map(r -> r.get("run_id")).toList();
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> obj(Object value) {
        return (Map<String, Object>) value;
    }

    @SuppressWarnings("unchecked")
    static List<Object> list(Object value) {
        return (List<Object>) value;
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> objs(Object value) {
        return (List<Map<String, Object>>) value;
    }

    static long num(Object value) {
        return ((Number) value).longValue();
    }

    /** {@code None} của Python được tính như 0 khi cộng mục tiêu ({@code or 0}). */
    static double dbl(Object value) {
        return value == null ? 0.0 : ((Number) value).doubleValue();
    }

    static String str(Object value) {
        return value == null ? "" : value.toString();
    }

    /** Truthiness kiểu Python: null, false, chuỗi / list / map rỗng là sai. */
    static boolean truthy(Object value) {
        if (value == null || Boolean.FALSE.equals(value)) return false;
        if (value instanceof String s) return !s.isEmpty();
        if (value instanceof List<?> l) return !l.isEmpty();
        if (value instanceof Map<?, ?> m) return !m.isEmpty();
        if (value instanceof Number n) return n.doubleValue() != 0;
        return true;
    }
}
