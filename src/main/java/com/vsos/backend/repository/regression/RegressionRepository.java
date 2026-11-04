package com.vsos.backend.repository.regression;

import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;
import com.vsos.backend.dto.regression.RegressionRecords.CandidateRun;
import com.vsos.backend.dto.regression.RegressionRecords.DecidedRecommendation;
import com.vsos.backend.dto.regression.RegressionRecords.RecommendationRow;
import com.vsos.backend.dto.regression.RegressionRecords.RegressionTestRow;
import com.vsos.backend.dto.regression.RegressionRecords.RunInfo;
import com.vsos.backend.dto.regression.RegressionRecords.RunResult;
import com.vsos.backend.dto.regression.RegressionRecords.ScenarioSet;
import com.vsos.backend.dto.regression.RegressionRecords.VehicleInfo;
import com.vsos.backend.dto.regression.RegressionResponses.CandidateSource;
import com.vsos.backend.dto.regression.RegressionResponses.PairResult;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Repository
public class RegressionRepository {

    private static final String RUN_LIGHT_COLUMNS =
            "id, scenario_version_id, status, random_seed, simulator_version, carla_vehicle_model_id, baseline_run_id, regression_test_id";

    private final Db db;

    public RegressionRepository(Db db) {
        this.db = db;
    }

    public RegressionTestRow findTest(long projectId, long testId) {
        return toTest(db.first("SELECT * FROM regression_tests WHERE id = ? AND project_id = ?", testId, projectId));
    }

    public RegressionTestRow findTest(long testId) {
        return toTest(db.first("SELECT * FROM regression_tests WHERE id = ?", testId));
    }

    public RegressionTestRow lockTest(long projectId, long testId) {
        return toTest(db.first("SELECT * FROM regression_tests WHERE id = ? AND project_id = ? FOR UPDATE", testId, projectId));
    }

    public List<RegressionTestRow> listTests(long projectId) {
        return db.list("SELECT * FROM regression_tests WHERE project_id = ? ORDER BY id DESC", projectId).stream().map(this::toTest).toList();
    }

    public List<RegressionTestRow> listCompletedTests(long projectId) {
        return db.list("""
                SELECT * FROM regression_tests
                 WHERE project_id = ? AND execution_status = 'COMPLETED'
                 ORDER BY id DESC
                """, projectId).stream().map(this::toTest).toList();
    }

    public long insertTest(long projectId, long scenarioId, long baselineVersionId, long candidateVersionId, long vehicleModelId,
                           String simulatorVersion, String name, Map<String, Map<String, Object>> criteria, ScenarioSet scenarioSet,
                           int totalScenarios, long userId) {
        return db.insert("""
                        INSERT INTO regression_tests
                            (project_id, scenario_id, baseline_aeb_version_id, candidate_aeb_version_id, carla_vehicle_model_id,
                             simulator_version, name, pass_criteria_json, execution_status, verdict, total_scenarios,
                             created_by_user_id, created_date)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                        """,
                projectId, scenarioId, baselineVersionId, candidateVersionId, vehicleModelId, simulatorVersion, name,
                Json.obj("criteria", criteria, "scenario_set", scenarioSet), "RUNNING", "PENDING", totalScenarios, userId, Vs.now());
    }

    public boolean markFailed(long testId) {
        return db.update("""
                UPDATE regression_tests
                   SET execution_status = 'FAILED', finished_at = ?
                 WHERE id = ? AND execution_status = 'RUNNING'
                """, Vs.now(), testId) == 1;
    }

    public boolean markCompleted(long testId, String verdict, int scenarios, int fixed, int regressed) {
        return db.update("""
                UPDATE regression_tests
                   SET execution_status = 'COMPLETED', verdict = ?, total_scenarios = ?,
                       fixed_scenarios = ?, regressed_scenarios = ?, finished_at = ?
                 WHERE id = ? AND execution_status = 'RUNNING'
                """, verdict, scenarios, fixed, regressed, Vs.now(), testId) == 1;
    }

    public void insertItems(long testId, List<PairResult> pairs) {
        List<Object[]> rows = new ArrayList<>();
        for (PairResult p : pairs) {
            rows.add(new Object[]{testId, p.variantId(), p.baselineRunId(), p.candidateRunId(), p.baselineOutcome(), p.candidateOutcome(),
                    p.change().toUpperCase(), p.change().equals("regressed")});
        }
        db.batchInsert("""
                INSERT INTO regression_test_items
                    (regression_test_id, scenario_version_id, baseline_run_id, candidate_run_id,
                     baseline_outcome, candidate_outcome, change_type, is_regression)
                VALUES (?,?,?,?,?,?,?,?)
                """, rows);
    }

    public RecommendationRow findRecommendation(long testId) {
        return toRecommendation(db.first("SELECT * FROM engineering_recommendations WHERE regression_test_id = ?", testId));
    }

    public RecommendationRow lockRecommendation(long testId) {
        return toRecommendation(db.first("SELECT * FROM engineering_recommendations WHERE regression_test_id = ? FOR UPDATE", testId));
    }

    public Map<Long, RecommendationRow> recommendationsByTest(List<Long> testIds) {
        Map<Long, RecommendationRow> out = new LinkedHashMap<>();
        if (testIds.isEmpty()) {
            return out;
        }
        for (Row r : db.list("SELECT * FROM engineering_recommendations WHERE regression_test_id IN (" + Db.placeholders(testIds.size()) + ")",
                testIds.toArray())) {
            out.put(r.lng("regression_test_id"), toRecommendation(r));
        }
        return out;
    }

    public void insertRecommendation(long projectId, long testId, long candidateVersionId, String content, String confidence, long createdBy) {
        var ts = Vs.now();
        db.insert("""
                        INSERT INTO engineering_recommendations
                            (project_id, regression_test_id, candidate_aeb_version_id, content, confidence, status,
                             created_by_user_id, created_date, updated_at)
                        VALUES (?,?,?,?,?,?,?,?,?)
                        """,
                projectId, testId, candidateVersionId, content, confidence, "PENDING_REVIEW", createdBy, ts, ts);
    }

    public void saveReview(long recommendationId, String status, String decision, long reviewerId, String notes, String conditions) {
        var ts = Vs.now();
        db.insert("""
                INSERT INTO recommendation_decisions
                    (recommendation_id, decision, reviewed_by_user_id, reviewer_name, reviewed_at, reason, review_conditions, confirmed, source)
                SELECT ?, ?, u.id, CONCAT_WS(' ', u.last_name, u.middle_name, u.first_name), ?, ?, ?, TRUE, 'REVIEW'
                  FROM users u WHERE u.id = ?
                """, recommendationId, decision, ts, notes, conditions, reviewerId);
        db.update("""
                UPDATE engineering_recommendations
                   SET status = ?, reviewed_by_user_id = ?, reviewed_at = ?, review_notes = ?, review_conditions = ?, updated_at = ?
                 WHERE id = ?
                """, status, reviewerId, ts, notes, conditions, ts, recommendationId);
    }

    public List<DecidedRecommendation> decidedRecommendations(long projectId) {
        return db.list("""
                SELECT d.id AS decision_id, er.regression_test_id, er.candidate_aeb_version_id, d.decision,
                       d.reviewed_by_user_id, d.reviewer_name, d.reviewed_at, d.reason, d.review_conditions, d.source, rt.baseline_aeb_version_id
                  FROM recommendation_decisions d
                  JOIN engineering_recommendations er ON er.id = d.recommendation_id
                  JOIN regression_tests rt ON rt.id = er.regression_test_id
                 WHERE er.project_id = ?
                 ORDER BY d.reviewed_at DESC, d.id DESC
                """, projectId).stream().map(r -> new DecidedRecommendation(r.lng("regression_test_id"), r.lng("candidate_aeb_version_id"),
                r.lng("baseline_aeb_version_id"), r.str("decision"), r.getLong("reviewed_by_user_id"), r.ts("reviewed_at"),
                r.str("reason"), r.str("review_conditions"), r.lng("decision_id"), r.str("reviewer_name"), r.str("source"))).toList();
    }

    public Row findVersion(long projectId, long versionId) {
        return db.first("SELECT * FROM aeb_versions WHERE id = ? AND project_id = ?", versionId, projectId);
    }

    public Row findVersion(long versionId) {
        return db.first("SELECT * FROM aeb_versions WHERE id = ?", versionId);
    }

    public Map<Long, Row> versionsById(long baselineVersionId, long candidateVersionId) {
        Map<Long, Row> out = new LinkedHashMap<>();
        for (Row v : db.list("SELECT * FROM aeb_versions WHERE id IN (?, ?)", baselineVersionId, candidateVersionId)) {
            out.put(v.lng("id"), v);
        }
        return out;
    }

    public Map<Long, String> lockVersionStatuses(long baselineVersionId, long candidateVersionId) {
        Map<Long, String> out = new LinkedHashMap<>();
        for (Row v : db.list("SELECT id, status FROM aeb_versions WHERE id IN (?, ?) FOR UPDATE", baselineVersionId, candidateVersionId)) {
            out.put(v.lng("id"), v.str("status"));
        }
        return out;
    }

    public void archiveVersion(long versionId) {
        db.update("UPDATE aeb_versions SET status = 'ARCHIVED' WHERE id = ?", versionId);
    }

    public void promoteToBaseline(long versionId) {
        db.update("UPDATE aeb_versions SET status = 'BASELINE' WHERE id = ?", versionId);
    }

    public void rejectVersion(long versionId) {
        db.update("UPDATE aeb_versions SET status = 'REJECTED' WHERE id = ?", versionId);
    }

    public CandidateSource candidateSource(long versionId) {
        Row r = db.first("""
                SELECT v.source, t.id AS trial_id, t.trial_number, t.optimization_run_id, o.name AS campaign_name
                  FROM aeb_versions v
                  LEFT JOIN optimization_trials t ON t.candidate_aeb_version_id = v.id
                  LEFT JOIN optimization_runs o ON o.id = t.optimization_run_id
                 WHERE v.id = ?
                """, versionId);
        return r == null ? null : new CandidateSource(r.str("source"), r.getLong("optimization_run_id"), r.str("campaign_name"),
                r.getLong("trial_id"), r.getInt("trial_number"));
    }

    public Map<Long, Row> latestBaselineRuns(long baselineVersionId, List<Long> variantIds, String simulatorVersion, long vehicleModelId) {
        Map<Long, Row> out = new LinkedHashMap<>();
        if (variantIds.isEmpty()) {
            return out;
        }
        List<Object> args = new ArrayList<>();
        args.add(baselineVersionId);
        args.addAll(variantIds);
        args.add(simulatorVersion);
        args.add(vehicleModelId);
        for (Row r : db.list("SELECT " + RUN_LIGHT_COLUMNS + " FROM simulation_runs WHERE aeb_version_id = ? AND scenario_version_id IN ("
                + Db.placeholders(variantIds.size()) + ") AND purpose IN ('BASELINE','EVALUATION') AND status NOT IN ('FAILED','STOPPED') "
                + "AND simulator_version = ? AND carla_vehicle_model_id = ? ORDER BY id", args.toArray())) {
            out.put(r.lng("scenario_version_id"), r);
        }
        return out;
    }

    public Set<Long> variantsWithFailures(List<Long> runIds) {
        Set<Long> out = new LinkedHashSet<>();
        if (runIds.isEmpty()) {
            return out;
        }
        for (Row r : db.list("""
                SELECT r.scenario_version_id
                  FROM simulation_runs r
                  JOIN failures f ON f.simulation_run_id = r.id
                 WHERE r.id IN (""" + Db.placeholders(runIds.size()) + ")", runIds.toArray())) {
            out.add(r.lng("scenario_version_id"));
        }
        return out;
    }

    public List<Row> runsByIds(List<Long> runIds) {
        if (runIds.isEmpty()) {
            return List.of();
        }
        return db.list("SELECT " + RUN_LIGHT_COLUMNS + " FROM simulation_runs WHERE id IN (" + Db.placeholders(runIds.size()) + ")", runIds.toArray());
    }

    public Row findRun(long runId) {
        return db.first("SELECT " + RUN_LIGHT_COLUMNS + " FROM simulation_runs WHERE id = ?", runId);
    }

    public List<Long> testsUsingBaselineRun(long runId) {
        return db.list("""
                SELECT DISTINCT regression_test_id
                  FROM simulation_runs
                 WHERE baseline_run_id = ? AND regression_test_id IS NOT NULL
                """, runId).stream().map(r -> r.lng("regression_test_id")).toList();
    }

    public List<CandidateRun> candidateRuns(long testId) {
        return db.list("SELECT " + RUN_LIGHT_COLUMNS + " FROM simulation_runs WHERE regression_test_id = ?", testId).stream()
                .map(r -> new CandidateRun(r.lng("id"), r.lng("scenario_version_id"), r.lng("baseline_run_id"))).toList();
    }

    public Map<Long, RunResult> runResults(List<Long> runIds) {
        Map<Long, RunResult> out = new LinkedHashMap<>();
        List<Long> distinct = runIds.stream().distinct().toList();
        if (distinct.isEmpty()) {
            return out;
        }
        for (Row r : db.list("""
                SELECT id, status, collision_occurred, min_ttc_s, min_distance_m, impact_speed_mps, is_false_positive, verdict,
                       rms_jerk_mps3, stopping_distance_m
                  FROM simulation_runs
                 WHERE id IN (""" + Db.placeholders(distinct.size()) + ")", distinct.toArray())) {
            out.put(r.lng("id"), new RunResult(r.lng("id"), r.str("status"), r.bool("collision_occurred"), r.dbl("min_ttc_s"),
                    r.dbl("min_distance_m"), r.dbl("impact_speed_mps"), r.bool("is_false_positive"), r.str("verdict"),
                    r.dbl("rms_jerk_mps3"), r.dbl("stopping_distance_m")));
        }
        return out;
    }

    public Map<String, Long> runCountsByStatus(long testId) {
        Map<String, Long> out = new LinkedHashMap<>();
        for (Row r : db.list("SELECT status, COUNT(*) AS n FROM simulation_runs WHERE regression_test_id = ? GROUP BY status", testId)) {
            out.put(r.str("status"), r.lng("n"));
        }
        return out;
    }

    public Map<Long, RunInfo> runInfo(List<Long> runIds) {
        Map<Long, RunInfo> out = new LinkedHashMap<>();
        if (runIds.isEmpty()) {
            return out;
        }
        for (Row r : db.list("SELECT id, random_seed, fixed_delta_seconds, max_duration_s FROM simulation_runs WHERE id IN ("
                + Db.placeholders(runIds.size()) + ") ORDER BY id", runIds.toArray())) {
            out.put(r.lng("id"), new RunInfo(r.lng("id"), r.getLong("random_seed"), r.dbl("fixed_delta_seconds"), r.dbl("max_duration_s")));
        }
        return out;
    }

    public Row findScenario(long projectId, long scenarioId) {
        return db.first("SELECT * FROM scenarios WHERE id = ? AND project_id = ?", scenarioId, projectId);
    }

    public Row findScenario(long scenarioId) {
        return db.first("SELECT * FROM scenarios WHERE id = ?", scenarioId);
    }

    public Map<Long, Row> scenarioVersions(List<Long> versionIds) {
        Map<Long, Row> out = new LinkedHashMap<>();
        if (versionIds.isEmpty()) {
            return out;
        }
        for (Row v : db.list("SELECT * FROM scenario_versions WHERE id IN (" + Db.placeholders(versionIds.size()) + ")", versionIds.toArray())) {
            out.put(v.lng("id"), v);
        }
        return out;
    }

    public VehicleInfo vehicleInfo(long vehicleModelId) {
        Row r = db.first("SELECT carla_blueprint_id, display_name, mass_kg, max_brake_decel_mps2 FROM carla_vehicle_models WHERE id = ?",
                vehicleModelId);
        return r == null ? null : new VehicleInfo(r.str("carla_blueprint_id"), r.str("display_name"), r.dbl("mass_kg"), r.dbl("max_brake_decel_mps2"));
    }

    public Row lockReviewAccess(long projectId, long userId) {
        return db.first("""
                SELECT p.status AS project_status, w.status AS workspace_status
                  FROM projects p JOIN workspaces w ON w.id = p.workspace_id
                  JOIN workspace_members m ON m.workspace_id = w.id
                 WHERE p.id = ? AND m.user_id = ? FOR SHARE
                """, projectId, userId);
    }

    public boolean projectInWorkspace(long projectId) {
        return db.scalar("SELECT workspace_id FROM projects WHERE id = ?", projectId) != null;
    }

    private RegressionTestRow toTest(Row r) {
        if (r == null) {
            return null;
        }
        return new RegressionTestRow(r.lng("id"), r.lng("project_id"), r.lng("scenario_id"), r.lng("baseline_aeb_version_id"),
                r.lng("candidate_aeb_version_id"), r.lng("carla_vehicle_model_id"), r.str("simulator_version"), r.str("name"),
                r.json("pass_criteria_json"), r.str("execution_status"), r.str("verdict"), r.getLong("fixed_scenarios"),
                r.getLong("regressed_scenarios"), r.lng("created_by_user_id"), r.ts("created_date"), r.ts("finished_at"));
    }

    private RecommendationRow toRecommendation(Row r) {
        if (r == null) {
            return null;
        }
        return new RecommendationRow(r.lng("id"), r.lng("regression_test_id"), r.lng("candidate_aeb_version_id"), r.str("status"),
                r.lng("created_by_user_id"), r.getLong("reviewed_by_user_id"), r.ts("reviewed_at"), r.str("review_notes"),
                r.str("review_conditions"), r.ts("updated_at"));
    }
}
