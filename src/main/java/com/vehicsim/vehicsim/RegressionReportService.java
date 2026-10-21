package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Phần đọc quanh regression của màn 5 (người 5): nguồn của candidate, cảnh báo bộ mô phỏng, gói kết quả xuất ra (JSON / CSV)
 * và lịch sử quyết định / chuỗi baseline. Chỉ đọc — không ghi DB, không tính lại verdict (verdict do {@link RegressionService}).
 */
@Service
public class RegressionReportService {

    /** Khoá của gói xuất; đổi cấu trúc gói thì tăng phiên bản. */
    static final String EXPORT_SCHEMA = "vehicsim.regression-export/v1";

    /** Đường tải OpenSCENARIO của một run (route có sẵn); ghi vào gói để tái chạy từng run mà không phải dựng ZIP. */
    static final String XOSC_URL = "/api/v1/vehicsim/runs/%d/xosc";

    /** Ba mục tiêu ADR-040 của từng cặp, cùng tên khoá với payload chi tiết regression. */
    private static final List<String> OBJECTIVE_COLUMNS = List.of("baseline_rms_jerk_mps3", "candidate_rms_jerk_mps3",
            "baseline_impact_speed_mps", "candidate_impact_speed_mps", "baseline_stopping_distance_m", "candidate_stopping_distance_m");

    private static final List<String> CSV_COLUMNS = java.util.stream.Stream.concat(Stream.of("variant", "baseline_run_id", "candidate_run_id",
            "seed", "baseline_outcome", "candidate_outcome", "change", "baseline_false_activation", "candidate_false_activation", "min_ttc_delta_s"),
            OBJECTIVE_COLUMNS.stream()).toList();

    private final Db db;
    private final Queries queries;
    private final RegressionService regression;

    public RegressionReportService(Db db, Queries queries, RegressionService regression) {
        this.db = db;
        this.queries = queries;
        this.regression = regression;
    }

    // ------------------------------------------------------------------ nguồn candidate / cảnh báo bộ mô phỏng

    /**
     * Candidate tạo thủ công hay đến từ một chiến dịch tối ưu. Chỉ đọc {@code optimization_trials.candidate_aeb_version_id}
     * (UNIQUE): chưa có chiến dịch thì mọi trường chiến dịch là null. Version không tồn tại thì trả null.
     */
    public Map<String, Object> candidateSource(long candidateVersionId) {
        Row r = db.first("SELECT v.source, t.id AS trial_id, t.trial_number, t.optimization_run_id, o.name AS campaign_name "
                + "FROM aeb_versions v LEFT JOIN optimization_trials t ON t.candidate_aeb_version_id = v.id "
                + "LEFT JOIN optimization_runs o ON o.id = t.optimization_run_id WHERE v.id = ?", candidateVersionId);
        if (r == null) {
            return null;
        }
        return Json.obj("type", r.str("source"), "optimization_run_id", r.getLong("optimization_run_id"), "campaign_name", r.str("campaign_name"),
                "trial_id", r.getLong("trial_id"), "trial_number", r.getInt("trial_number"));
    }

    /** Số CARLA chưa hiệu chuẩn phanh (TD-17): chỉ để quan sát / đối chiếu. Bộ động học thì không có cảnh báo. */
    public static Map<String, Object> simulatorCaveat(String simulatorVersion) {
        return RunService.isCarla(simulatorVersion) ? Json.obj("carla", true, "calibrated", false) : null;
    }

    // ------------------------------------------------------------------ gói kết quả

    private Row completedTest(long testId) {
        Row project = queries.currentProject();
        Row test = db.first("SELECT * FROM regression_tests WHERE id = ? AND project_id = ?", testId, project.lng("id"));
        if (test == null) {
            throw new NotFoundException("regression test");
        }
        if (!"COMPLETED".equals(test.str("execution_status"))) {
            throw new InvalidRequestException("regression test chưa chạy xong hoặc bị lỗi nên chưa xuất được gói kết quả");
        }
        return test;
    }

    /** Gói JSON: manifest tái lập + tham số + tiêu chí + từng cặp run + quyết định. Không có email người dùng. */
    public Map<String, Object> export(long testId) {
        Row test = completedTest(testId);
        long baselineId = test.lng("baseline_aeb_version_id");
        long candidateId = test.lng("candidate_aeb_version_id");
        Row baseline = db.first("SELECT * FROM aeb_versions WHERE id = ?", baselineId);
        Row candidate = db.first("SELECT * FROM aeb_versions WHERE id = ?", candidateId);
        Row scenario = db.first("SELECT * FROM scenarios WHERE id = ?", test.lng("scenario_id"));
        Row vehicle = db.first("SELECT carla_blueprint_id, display_name, mass_kg, max_brake_decel_mps2 FROM carla_vehicle_models WHERE id = ?",
                test.lng("carla_vehicle_model_id"));
        Row rec = regression.recommendationFor(testId);
        Map<String, Object> summary = regression.summary(test);

        List<Long> nameIds = new ArrayList<>();
        nameIds.add(test.getLong("created_by_user_id"));
        nameIds.add(rec == null ? null : rec.getLong("reviewed_by_user_id"));
        Map<Long, String> names = queries.displayNames(nameIds);

        Map<Long, Row> runInfo = runInfoOf(Json.asList(summary.get("pairs")));
        List<Map<String, Object>> pairs = new ArrayList<>();
        for (Object o : Json.asList(summary.get("pairs"))) {
            Map<String, Object> p = Json.asMap(o);
            long baselineRunId = ((Number) p.get("baseline_run_id")).longValue();
            long candidateRunId = ((Number) p.get("candidate_run_id")).longValue();
            Row info = runInfo.get(candidateRunId);
            pairs.add(Json.obj(
                    "variant_id", p.get("variant_id"),
                    "variant", p.get("label"),
                    "baseline_run_id", baselineRunId,
                    "candidate_run_id", candidateRunId,
                    "seed", info == null ? null : info.getLong("random_seed"),
                    "baseline_outcome", p.get("baseline_outcome"),
                    "candidate_outcome", p.get("candidate_outcome"),
                    "change", p.get("change"),
                    "baseline_false_activation", p.get("baseline_false_activation"),
                    "candidate_false_activation", p.get("candidate_false_activation"),
                    "min_ttc_delta_s", p.get("min_ttc_delta_s"),
                    "baseline_xosc_url", String.format(java.util.Locale.ROOT, XOSC_URL, baselineRunId),
                    "candidate_xosc_url", String.format(java.util.Locale.ROOT, XOSC_URL, candidateRunId)));
            Map<String, Object> pair = pairs.get(pairs.size() - 1);
            OBJECTIVE_COLUMNS.forEach(c -> pair.put(c, p.get(c)));
        }
        // Mọi cặp của một test cùng bộ mô phỏng nên cùng bước thời gian; lấy từ run thật thay vì hằng của phiên bản code đang chạy.
        Row firstRun = runInfo.values().stream().findFirst().orElse(null);

        Map<String, Object> manifest = Json.obj(
                "schema", EXPORT_SCHEMA,
                "exported_at", Vs.iso(Vs.now()),
                "regression_code", RegressionService.testCode(testId),
                "recommendation_code", RegressionService.recommendationCode(testId),
                "simulator_version", test.str("simulator_version"),
                "simulator_caveat", simulatorCaveat(test.str("simulator_version")),
                "vehicle", vehicle == null ? null : Json.obj("carla_blueprint_id", vehicle.str("carla_blueprint_id"), "display_name", vehicle.str("display_name"),
                        "mass_kg", vehicle.dbl("mass_kg"), "max_brake_decel_mps2", vehicle.dbl("max_brake_decel_mps2")),
                "dt_s", firstRun == null ? null : firstRun.dbl("fixed_delta_seconds"),
                "max_duration_s", firstRun == null ? null : firstRun.dbl("max_duration_s"),
                "bundle_schema", RunService.VARIANT_FORMAT,
                // Chưa có cấu hình build ghi commit vào ứng dụng (cần sửa pom.xml dùng chung): để null, không đoán.
                "code_version", null,
                "scenario", Json.obj("id", scenario.lng("id"), "code", scenario.str("code"), "name", scenario.str("name")),
                "scenario_set", test.json("pass_criteria_json").get("scenario_set"),
                "baseline", Json.obj("id", baselineId, "label", Vs.versionLabel(baseline)),
                "candidate", Json.obj("id", candidateId, "label", Vs.versionLabel(candidate), "source", candidateSource(candidateId)),
                "status", RegressionService.displayStatus(test),
                "created_by", names.get(test.getLong("created_by_user_id")),
                "created_at", Vs.iso(test.ts("created_date")),
                "finished_at", test.ts("finished_at") == null ? null : Vs.iso(test.ts("finished_at")));

        return Json.obj(
                "manifest", manifest,
                "parameters", regression.parameterDiff(baselineId, candidateId),
                "criteria", summary.get("criteria"),
                "counts", summary.get("counts"),
                "rates", summary.get("rates"),
                "median_min_ttc", summary.get("median_min_ttc"),
                "pairs", pairs,
                "decision", Json.obj(
                        "status", RegressionService.displayDecision(rec),
                        "reviewed_by", rec == null ? null : names.get(rec.getLong("reviewed_by_user_id")),
                        "reviewed_at", rec != null && rec.ts("reviewed_at") != null ? Vs.iso(rec.ts("reviewed_at")) : null,
                        "reason", rec == null ? null : rec.str("review_notes"),
                        "conditions", rec == null ? null : rec.str("review_conditions")));
    }

    /**
     * {candidate_run_id: seed + bước thời gian + thời lượng tối đa} — seed của run candidate bằng seed của run baseline (FK ép ở MySQL).
     */
    private Map<Long, Row> runInfoOf(List<Object> pairs) {
        Map<Long, Row> out = new LinkedHashMap<>();
        List<Long> ids = pairs.stream().map(o -> ((Number) Json.asMap(o).get("candidate_run_id")).longValue()).toList();
        if (ids.isEmpty()) {
            return out;
        }
        for (Row r : db.list("SELECT id, random_seed, fixed_delta_seconds, max_duration_s FROM simulation_runs WHERE id IN ("
                + Db.placeholders(ids.size()) + ") ORDER BY id", ids.toArray())) {
            out.put(r.lng("id"), r);
        }
        return out;
    }

    /** Một dòng mỗi cặp baseline–candidate; mọi ô qua {@link VehicSimController#csvCell} (chống công thức), CRLF như failures.csv. */
    public String exportCsv(long testId) {
        Map<String, Object> data = export(testId);
        StringBuilder csv = new StringBuilder(String.join(",", CSV_COLUMNS)).append("\r\n");
        for (Object o : Json.asList(data.get("pairs"))) {
            Map<String, Object> pair = Json.asMap(o);
            csv.append(CSV_COLUMNS.stream().map(c -> VehicSimController.csvCell(pair.get(c))).collect(Collectors.joining(","))).append("\r\n");
        }
        return csv.toString();
    }

    // ------------------------------------------------------------------ lịch sử quyết định / chuỗi baseline

    public Map<String, Object> decisionHistory() {
        Row project = queries.currentProject();
        long projectId = project.lng("id");
        Map<Long, Row> versions = new LinkedHashMap<>();
        queries.versions(projectId, false).forEach(v -> versions.put(v.lng("id"), v));
        List<Row> decided = db.list("SELECT er.id, er.regression_test_id, er.candidate_aeb_version_id, er.status, er.reviewed_by_user_id, er.reviewed_at, "
                + "er.review_notes, er.review_conditions, rt.baseline_aeb_version_id FROM engineering_recommendations er "
                + "JOIN regression_tests rt ON rt.id = er.regression_test_id WHERE er.project_id = ? AND er.status <> 'PENDING_REVIEW' "
                + "ORDER BY er.reviewed_at DESC, er.id DESC", projectId);
        Map<Long, String> names = queries.displayNames(decided.stream().map(d -> d.getLong("reviewed_by_user_id")).toList());

        List<Map<String, Object>> decisions = new ArrayList<>();
        Map<Long, Map<String, Object>> promotions = new LinkedHashMap<>();
        for (Row d : decided) {
            long testId = d.lng("regression_test_id");
            Map<String, Object> item = Json.obj(
                    "recommendation_code", RegressionService.recommendationCode(testId),
                    "regression_code", RegressionService.testCode(testId),
                    "test_id", testId,
                    "baseline", label(versions, d.lng("baseline_aeb_version_id")),
                    "candidate", label(versions, d.lng("candidate_aeb_version_id")),
                    "decision", RegressionService.displayDecision(d),
                    "reviewed_by", names.get(d.getLong("reviewed_by_user_id")),
                    "reviewed_at", d.ts("reviewed_at") == null ? null : Vs.iso(d.ts("reviewed_at")),
                    "reason", d.str("review_notes"),
                    "conditions", d.str("review_conditions"));
            decisions.add(item);
            if ("ACCEPTED".equals(d.str("status"))) {
                promotions.put(d.lng("candidate_aeb_version_id"), item);
            }
        }

        List<Map<String, Object>> baselines = new ArrayList<>();
        for (Row v : versions.values()) {
            String status = v.str("status");
            if (!"BASELINE".equals(status) && !"ARCHIVED".equals(status)) {
                continue;
            }
            Map<String, Object> promotion = promotions.get(v.lng("id"));
            // Không có quyết định Accept nào nâng bản này = baseline khởi tạo của project (bootstrap).
            baselines.add(Json.obj(
                    "id", v.lng("id"),
                    "version_no", v.lng("version_no"),
                    "label", Vs.versionLabel(v),
                    "status", status,
                    "promoted_by", promotion == null ? null : promotion.get("reviewed_by"),
                    "promoted_at", promotion == null ? null : promotion.get("reviewed_at"),
                    "regression_code", promotion == null ? null : promotion.get("regression_code"),
                    "reason", promotion == null ? null : promotion.get("reason")));
        }
        return Json.obj("decisions", decisions, "baselines", baselines);
    }

    private static String label(Map<Long, Row> versions, long id) {
        Row v = versions.get(id);
        return v == null ? "#" + id : Vs.versionLabel(v);
    }
}
