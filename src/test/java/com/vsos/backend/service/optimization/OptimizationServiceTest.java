package com.vsos.backend.service.optimization;

import com.vsos.backend.service.regression.RegressionService;
import com.vsos.backend.common.Vs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.core.task.TaskExecutor;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.aeb.AebService;
import com.vsos.backend.service.scenario.FamilyService;
import com.vsos.backend.service.simulation.RunService;

class OptimizationServiceTest {

    private Db db;
    private Queries queries;
    private RunService runService;
    private AebService aebService;
    private RegressionService regressionService;
    private FamilyService familyService;
    private VehicSimProperties props;
    private TaskExecutor executor;
    private OptimizationService service;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        queries = mock(Queries.class);
        runService = mock(RunService.class);
        aebService = mock(AebService.class);
        regressionService = mock(RegressionService.class);
        familyService = mock(FamilyService.class);
        props = mock(VehicSimProperties.class);
        executor = new SyncTaskExecutor();

        service = new OptimizationService(
                db,
                queries,
                runService,
                aebService,
                regressionService,
                familyService,
                props,
                executor
        );
    }

    @Test
    void createAndStartRun_throwsNotFoundWhenScenarioMissing() {
        when(db.first(contains("SELECT * FROM projects"), eq(1L)))
                .thenReturn(new Row(Map.of("id", 1L, "name", "Project Alpha")));
        when(db.first(contains("SELECT * FROM scenarios"), eq(999L), eq(1L)))
                .thenReturn(null);

        assertThatThrownBy(() -> service.createAndStartRun(
                1L, 5L, 999L, null, 10, 3, null, null, "Test MOBO Run"))
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("scenario family");
    }

    @Test
    void selectCandidateForVerification_createsAebCandidateAndRegressionTest() {
        long projectId = 1L;
        long runId = 42L;
        long trialId = 101L;
        long userId = 5L;

        // Mock trial data
        Map<String, Object> trialData = new LinkedHashMap<>();
        trialData.put("id", trialId);
        trialData.put("optimization_run_id", runId);
        trialData.put("project_id", projectId);
        trialData.put("trial_number", 7L);
        trialData.put("candidate_aeb_version_id", 88L);
        trialData.put("rms_jerk_mps3", 1.85);
        trialData.put("impact_speed_mps", 0.0);
        trialData.put("stopping_distance_m", 14.2);
        trialData.put("is_pareto_optimal", 1);

        when(db.first(contains("SELECT * FROM optimization_trials WHERE id = ? AND optimization_run_id = ? AND project_id = ?"),
                eq(trialId), eq(runId), eq(projectId)))
                .thenReturn(new Row(trialData));

        // Mock optimization run
        when(db.first(contains("SELECT * FROM optimization_runs WHERE id = ?"), eq(runId)))
                .thenReturn(new Row(Map.of(
                        "id", runId,
                        "project_id", projectId,
                        "name", "MOBO Study",
                        "scenario_id", 50L,
                        "base_aeb_version_id", 10L,
                        "status", "COMPLETED"
                )));

        // Mock queries.aebValues
        when(queries.aebValues(88L)).thenReturn(Map.of("TTC_THRESHOLD", 1.8));

        // Mock Regression test creation
        when(regressionService.createTest(
                eq(projectId), eq(userId), eq(88L), eq(50L), eq(true), eq(true), any(), anyString()))
                .thenReturn(777L);

        Map<String, Object> result = service.selectCandidateForVerification(projectId, runId, trialId, userId);

        assertThat(result).isNotNull();
        assertThat(result.get("candidate_aeb_version_id")).isEqualTo(88L);
        assertThat(result.get("regression_test_id")).isEqualTo(777L);
        assertThat(result.get("status")).isEqualTo("VERIFICATION_CREATED");

        verify(regressionService).createTest(
                eq(projectId), eq(userId), eq(88L), eq(50L), eq(true), eq(true), any(), anyString());
    }

    @Test
    void cancelRun_marksRunAsCancelled() {
        long projectId = 1L;
        long runId = 99L;
        long userId = 5L;

        when(db.first(contains("SELECT * FROM optimization_runs WHERE id = ?"), eq(runId), eq(projectId)))
                .thenReturn(new Row(Map.of(
                        "id", runId,
                        "project_id", projectId,
                        "status", "RUNNING"
                )));

        service.cancelRun(projectId, runId, userId);

        verify(db).update(contains("UPDATE optimization_runs SET status = 'CANCELLED'"), any(), eq(runId));
    }
}
