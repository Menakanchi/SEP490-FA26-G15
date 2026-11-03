package com.vsos.backend.repository.regression;

import com.vsos.backend.dto.regression.RegressionRecords.ScenarioSet;
import com.vsos.backend.dto.regression.RegressionResponses.CandidateSource;
import com.vsos.backend.dto.regression.RegressionResponses.PairResult;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.common.Json;
import com.vsos.backend.repository.common.Row;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Các câu SQL mà luật của màn 5 dựa vào: chốt test chỉ khi còn RUNNING, khoá dòng khi Reviewer duyệt, không ghép run baseline hỏng /
 * bị dừng, và dạng {@code pass_criteria_json} ghi xuống DB. {@link Db} giả ghi lại SQL + tham số.
 */
class RegressionRepositoryTest {

    private Db db;
    private RegressionRepository repo;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        repo = new RegressionRepository(db);
    }

    private static Row row(Object... keyValues) {
        return new Row(Json.obj(keyValues));
    }

    private String lastUpdateSql() {
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(db).update(sql.capture(), any(Object[].class));
        return sql.getValue();
    }

    // ------------------------------------------------------------------ chuyển trạng thái test

    @Test
    void completingATestOnlyWinsWhileItIsStillRunning() {
        when(db.update(anyString(), any(Object[].class))).thenReturn(1, 0);

        assertThat(repo.markCompleted(30L, "PASSED", 8, 2, 1)).isTrue();
        assertThat(repo.markCompleted(30L, "PASSED", 8, 2, 1)).as("worker thứ hai không chốt lại").isFalse();

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(db, org.mockito.Mockito.times(2)).update(sql.capture(), any(Object[].class));
        assertThat(sql.getValue()).contains("SET execution_status = 'COMPLETED'").contains("WHERE id = ? AND execution_status = 'RUNNING'");
    }

    @Test
    void failingATestAlsoRequiresItToBeRunning() {
        when(db.update(anyString(), any(Object[].class))).thenReturn(1);

        assertThat(repo.markFailed(30L)).isTrue();

        assertThat(lastUpdateSql()).contains("SET execution_status = 'FAILED'").contains("AND execution_status = 'RUNNING'");
    }

    @Test
    void reviewerDecisionsLockTheTestTheRecommendationAndBothVersions() {
        repo.lockTest(1L, 30L);
        repo.lockRecommendation(30L);
        repo.lockVersionStatuses(10L, 11L);

        verify(db).first(contains("FROM regression_tests WHERE id = ? AND project_id = ? FOR UPDATE"), eq(30L), eq(1L));
        verify(db).first(contains("FROM engineering_recommendations WHERE regression_test_id = ? FOR UPDATE"), eq(30L));
        verify(db).list(contains("FROM aeb_versions WHERE id IN (?, ?) FOR UPDATE"), eq(10L), eq(11L));
    }

    // ------------------------------------------------------------------ ghép cặp

    @Test
    void baselineRunsExcludeFailedAndStoppedRunsAndStayOnTheSameSimulatorAndVehicle() {
        List<Object[]> calls = new ArrayList<>();
        when(db.list(contains("FROM simulation_runs WHERE aeb_version_id = ?"), any(Object[].class))).thenAnswer(inv -> {
            calls.add(inv.getArguments());
            return List.of(row("id", 1001L, "scenario_version_id", 101L), row("id", 1009L, "scenario_version_id", 101L));
        });

        Map<Long, Row> runs = repo.latestBaselineRuns(10L, List.of(101L, 102L), "carla-0.9.16-xosc2", 3L);

        Object[] call = calls.get(0);
        assertThat((String) call[0]).contains("status NOT IN ('FAILED','STOPPED')").contains("ORDER BY id");
        assertThat(call).containsExactly(call[0], 10L, 101L, 102L, "carla-0.9.16-xosc2", 3L);
        assertThat(runs.get(101L).lng("id")).as("id tăng dần nên giữ run mới nhất").isEqualTo(1009L);
    }

    @Test
    void noVariantsMeansNoQuery() {
        assertThat(repo.latestBaselineRuns(10L, List.of(), "k", 3L)).isEmpty();
        assertThat(repo.variantsWithFailures(List.of())).isEmpty();
        assertThat(repo.runResults(List.of())).isEmpty();
        verify(db, org.mockito.Mockito.never()).list(anyString(), any(Object[].class));
    }

    // ------------------------------------------------------------------ ghi xuống DB

    @Test
    void aNewTestStoresTheCriteriaAndScenarioSetAsTheSameJsonShape() {
        List<Object[]> inserts = new ArrayList<>();
        when(db.insert(contains("INSERT INTO regression_tests"), any(Object[].class))).thenAnswer(inv -> {
            inserts.add(inv.getArguments());
            return 30L;
        });

        long id = repo.insertTest(1L, 20L, 10L, 11L, 3L, "vehicsim-kinematic-1.0", "v1.0 → v1.1",
                Map.of("no_new_collision", Map.of("enabled", true, "required", true)),
                new ScenarioSet("custom", false, false, 4, 2, List.of(7L, 8L), 1L), 2, 5L);

        assertThat(id).isEqualTo(30L);
        Object[] args = inserts.get(0);
        assertThat(args[9]).isEqualTo("RUNNING");
        assertThat(args[10]).isEqualTo("PENDING");
        // Db đổi Map thành chuỗi JSON khi ghi; đọc lại để thấy đúng dạng nằm trong cột pass_criteria_json.
        Map<String, Object> stored = Json.parseMap(Json.write(args[8]));
        assertThat(Json.asMap(stored.get("criteria"))).containsKey("no_new_collision");
        assertThat(Json.asMap(stored.get("scenario_set"))).containsOnlyKeys("mode", "old_critical", "all_variants", "old_critical_count",
                "variant_count", "variant_ids", "safe_count").containsEntry("mode", "custom").containsEntry("variant_ids", List.of(7, 8));
    }

    @Test
    void pairItemsRecordTheChangeInUpperCaseAndFlagRegressions() {
        PairResult regressed = new PairResult(101L, "A-1", "", "A", 1001L, 2001L, "SAFE", "COLLISION", "PASS", "FAIL", false, false,
                null, 30.0, "regressed", null, null, null, 8.3, null, null);
        PairResult fixed = new PairResult(102L, "A-2", "", "A", 1002L, 2002L, "COLLISION", "SAFE", "FAIL", "PASS", false, false,
                0.5, null, "fixed", null, null, null, null, null, null);

        repo.insertItems(30L, List.of(regressed, fixed));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass(List.class);
        verify(db).batchInsert(contains("INSERT INTO regression_test_items"), rows.capture());
        assertThat(rows.getValue().get(0)).containsExactly(30L, 101L, 1001L, 2001L, "SAFE", "COLLISION", "REGRESSED", true);
        assertThat(rows.getValue().get(1)).containsExactly(30L, 102L, 1002L, 2002L, "COLLISION", "SAFE", "FIXED", false);
    }

    // ------------------------------------------------------------------ nguồn candidate

    @Test
    void aManualCandidateHasNoCampaign() {
        when(db.first(contains("optimization_trials"), any(Object[].class))).thenReturn(row("source", "MANUAL"));

        CandidateSource source = repo.candidateSource(11L);

        assertThat(source.type()).isEqualTo("MANUAL");
        assertThat(source.optimizationRunId()).isNull();
        assertThat(source.trialId()).isNull();
    }

    @Test
    void anOptimizationCandidateShowsItsCampaignAndTrial() {
        when(db.first(contains("optimization_trials"), any(Object[].class))).thenReturn(
                row("source", "OPTIMIZATION", "optimization_run_id", 4L, "campaign_name", "Chiến dịch A", "trial_id", 9L, "trial_number", 7));

        CandidateSource source = repo.candidateSource(11L);

        assertThat(source).isEqualTo(new CandidateSource("OPTIMIZATION", 4L, "Chiến dịch A", 9L, 7));
    }

    @Test
    void aMissingVersionHasNoSource() {
        assertThat(repo.candidateSource(999L)).isNull();
    }
}
