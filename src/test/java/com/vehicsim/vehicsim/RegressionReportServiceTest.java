package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Gói xuất, nguồn candidate và lịch sử quyết định của màn 5: chỉ đọc, không email, không số giả. {@link Db} giả. */
class RegressionReportServiceTest {

    private static final long PROJECT = 1L;
    private static final long TEST = 30L;
    private static final long BASELINE = 10L;
    private static final long CANDIDATE = 11L;

    private Db db;
    private Queries queries;
    private RegressionService regression;
    private RegressionReportService reports;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        queries = mock(Queries.class);
        regression = mock(RegressionService.class);
        reports = new RegressionReportService(db, queries, regression);
        when(queries.currentProject()).thenReturn(row("id", PROJECT));
    }

    private static Row row(Object... keyValues) {
        return new Row(Json.obj(keyValues));
    }

    // ------------------------------------------------------------------ nguồn candidate / cảnh báo

    @Test
    void aManualCandidateHasNoCampaign() {
        when(db.first(contains("optimization_trials"), any(Object[].class))).thenReturn(row("source", "MANUAL"));

        Map<String, Object> source = reports.candidateSource(CANDIDATE);

        assertThat(source.get("type")).isEqualTo("MANUAL");
        assertThat(source.get("optimization_run_id")).isNull();
        assertThat(source.get("trial_id")).isNull();
    }

    @Test
    void anOptimizationCandidateShowsItsCampaignAndTrial() {
        when(db.first(contains("optimization_trials"), any(Object[].class))).thenReturn(
                row("source", "OPTIMIZATION", "optimization_run_id", 4L, "campaign_name", "Chiến dịch A", "trial_id", 9L, "trial_number", 7));

        Map<String, Object> source = reports.candidateSource(CANDIDATE);

        assertThat(source).containsEntry("type", "OPTIMIZATION").containsEntry("optimization_run_id", 4L)
                .containsEntry("campaign_name", "Chiến dịch A").containsEntry("trial_id", 9L).containsEntry("trial_number", 7);
    }

    @Test
    void aMissingVersionHasNoSource() {
        assertThat(reports.candidateSource(999L)).isNull();
    }

    @Test
    void onlyCarlaGetsTheUncalibratedCaveat() {
        assertThat(RegressionReportService.simulatorCaveat("carla-0.9.16-xosc2")).containsEntry("carla", true).containsEntry("calibrated", false);
        assertThat(RegressionReportService.simulatorCaveat(RunService.KINEMATIC_SIMULATOR)).isNull();
        assertThat(RegressionReportService.simulatorCaveat(null)).isNull();
    }

    // ------------------------------------------------------------------ gói xuất

    private void arrangeTest(String executionStatus, String variantLabel) {
        Row test = row("id", TEST, "project_id", PROJECT, "scenario_id", 20L, "baseline_aeb_version_id", BASELINE,
                "candidate_aeb_version_id", CANDIDATE, "carla_vehicle_model_id", 3L, "simulator_version", "carla-0.9.16-xosc2",
                "execution_status", executionStatus, "verdict", "PASSED", "created_by_user_id", 5L,
                "created_date", LocalDateTime.of(2026, 10, 20, 9, 0), "finished_at", LocalDateTime.of(2026, 10, 20, 9, 5),
                "pass_criteria_json", Json.write(Json.obj("criteria", Json.obj(), "scenario_set", Json.obj("variant_count", 1))));
        when(db.first(startsWith("SELECT * FROM regression_tests"), any(Object[].class))).thenReturn(test);
        when(db.first(startsWith("SELECT * FROM aeb_versions"), any(Object[].class))).thenAnswer(inv ->
                row("id", inv.getArguments()[1], "label", ((Long) inv.getArguments()[1]) == BASELINE ? "v1.0" : "v1.1"));
        when(db.first(startsWith("SELECT * FROM scenarios"), any(Object[].class))).thenReturn(row("id", 20L, "code", "SC-A", "name", "Họ A"));
        when(db.first(startsWith("SELECT carla_blueprint_id"), any(Object[].class))).thenReturn(row("carla_blueprint_id", "vehicle.audi.etron", "display_name", "Audi e-tron"));
        when(db.first(contains("optimization_trials"), any(Object[].class))).thenReturn(row("source", "MANUAL"));
        when(db.list(startsWith("SELECT id, random_seed FROM simulation_runs"), any(Object[].class))).thenReturn(List.of(row("id", 2001L, "random_seed", 48_101L)));
        when(regression.recommendationFor(TEST)).thenReturn(row("status", "ACCEPTED", "reviewed_by_user_id", 9L,
                "reviewed_at", LocalDateTime.of(2026, 10, 20, 10, 0), "review_notes", "đủ bằng chứng", "review_conditions", "theo dõi thêm"));
        when(queries.displayNames(any())).thenReturn(Map.of(5L, "Kỹ Sư A", 9L, "Người Duyệt B"));
        when(regression.parameterDiff(BASELINE, CANDIDATE)).thenReturn(List.of(Json.obj("code", "TTC_THRESHOLD", "baseline", 1.5, "candidate", 1.6, "changed", true)));
        when(regression.summary(any())).thenReturn(Json.obj(
                "criteria", List.of(Json.obj("key", "no_new_collision", "passed", true)),
                "counts", Json.obj("scenarios", 1, "fixed", 1, "regressed", 0),
                "rates", Json.obj("collision_baseline_pct", 100.0, "collision_candidate_pct", 0.0),
                "median_min_ttc", Json.obj("baseline", 0.4, "candidate", 1.2, "delta", 0.8),
                "pairs", List.of(Json.obj("variant_id", 101L, "label", variantLabel, "baseline_run_id", 1001L, "candidate_run_id", 2001L,
                        "baseline_outcome", "COLLISION", "candidate_outcome", "SAFE", "change", "fixed",
                        "baseline_false_activation", false, "candidate_false_activation", false, "min_ttc_delta_s", 0.8))));
    }

    @Test
    void anUnfinishedTestCannotBeExported() {
        arrangeTest("RUNNING", "SC-A-001");
        assertThatThrownBy(() -> reports.export(TEST)).isInstanceOf(InvalidRequestException.class).hasMessageContaining("chưa chạy xong");
        arrangeTest("FAILED", "SC-A-001");
        assertThatThrownBy(() -> reports.exportCsv(TEST)).isInstanceOf(InvalidRequestException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void theExportCarriesTheManifestPairsSeedsAndDecisionButNoEmail() {
        arrangeTest("COMPLETED", "SC-A-001");

        Map<String, Object> data = reports.export(TEST);

        Map<String, Object> manifest = (Map<String, Object>) data.get("manifest");
        assertThat(manifest).containsEntry("schema", RegressionReportService.EXPORT_SCHEMA).containsEntry("regression_code", "RT-030")
                .containsEntry("simulator_version", "carla-0.9.16-xosc2");
        assertThat((Map<String, Object>) manifest.get("simulator_caveat")).containsEntry("calibrated", false);
        assertThat((Map<String, Object>) manifest.get("vehicle")).containsEntry("carla_blueprint_id", "vehicle.audi.etron");
        assertThat(manifest.get("created_by")).isEqualTo("Kỹ Sư A");
        List<Map<String, Object>> pairs = (List<Map<String, Object>>) data.get("pairs");
        assertThat(pairs).hasSize(1);
        assertThat(pairs.get(0)).containsEntry("seed", 48_101L).containsEntry("baseline_run_id", 1001L).containsEntry("candidate_run_id", 2001L);
        Map<String, Object> decision = (Map<String, Object>) data.get("decision");
        assertThat(decision).containsEntry("status", "ACCEPT").containsEntry("reviewed_by", "Người Duyệt B")
                .containsEntry("reason", "đủ bằng chứng").containsEntry("conditions", "theo dõi thêm");
        assertThat(Json.write(data)).doesNotContain("email").doesNotContain("@");
    }

    @Test
    void theCsvHasOneRowPerPairAndNeutralisesFormulas() {
        arrangeTest("COMPLETED", "=HYPERLINK(\"http://x\")");

        String csv = reports.exportCsv(TEST);

        String[] lines = csv.split("\r\n");
        assertThat(lines).hasSize(2);
        assertThat(lines[0]).startsWith("variant,baseline_run_id,candidate_run_id,seed");
        assertThat(lines[1]).startsWith("\"'=HYPERLINK(\"\"http://x\"\")\",1001,2001,48101,COLLISION,SAFE,fixed,False,False,0.8");
    }

    // ------------------------------------------------------------------ lịch sử

    @Test
    @SuppressWarnings("unchecked")
    void theHistoryListsDecisionsNewestFirstAndTheBaselineChainWithItsInitialBaseline() {
        when(queries.versions(PROJECT, false)).thenReturn(List.of(
                row("id", 10L, "version_no", 1L, "label", "v1.0", "status", "ARCHIVED"),
                row("id", 11L, "version_no", 2L, "label", "v1.1", "status", "BASELINE"),
                row("id", 12L, "version_no", 3L, "label", "v1.2", "status", "REJECTED")));
        when(db.list(startsWith("SELECT er.id"), any(Object[].class))).thenReturn(List.of(
                row("regression_test_id", 31L, "candidate_aeb_version_id", 12L, "baseline_aeb_version_id", 11L, "status", "REJECTED",
                        "reviewed_by_user_id", 9L, "reviewed_at", LocalDateTime.of(2026, 10, 21, 9, 0), "review_notes", "không đạt"),
                row("regression_test_id", 30L, "candidate_aeb_version_id", 11L, "baseline_aeb_version_id", 10L, "status", "ACCEPTED",
                        "reviewed_by_user_id", 9L, "reviewed_at", LocalDateTime.of(2026, 10, 20, 10, 0), "review_notes", "đủ bằng chứng")));
        when(queries.displayNames(any())).thenReturn(Map.of(9L, "Người Duyệt B"));

        Map<String, Object> history = reports.decisionHistory();

        List<Map<String, Object>> decisions = (List<Map<String, Object>>) history.get("decisions");
        assertThat(decisions).extracting(d -> d.get("regression_code")).containsExactly("RT-031", "RT-030");
        assertThat(decisions).extracting(d -> d.get("decision")).containsExactly("REJECT", "ACCEPT");
        assertThat(decisions.get(1)).containsEntry("baseline", "v1.0").containsEntry("candidate", "v1.1");
        List<Map<String, Object>> baselines = (List<Map<String, Object>>) history.get("baselines");
        assertThat(baselines).extracting(b -> b.get("label")).containsExactly("v1.0", "v1.1");
        assertThat(baselines.get(0).get("promoted_by")).as("baseline khởi tạo không do quyết định nào nâng").isNull();
        assertThat(baselines.get(1)).containsEntry("promoted_by", "Người Duyệt B").containsEntry("regression_code", "RT-030")
                .containsEntry("reason", "đủ bằng chứng");
    }

    @Test
    void anEmptyHistoryIsEmptyNotAnError() {
        when(queries.versions(PROJECT, false)).thenReturn(List.of());
        when(db.list(startsWith("SELECT er.id"), any(Object[].class))).thenReturn(List.of());

        Map<String, Object> history = reports.decisionHistory();

        assertThat(Json.asList(history.get("decisions"))).isEmpty();
        assertThat(Json.asList(history.get("baselines"))).isEmpty();
    }
}
