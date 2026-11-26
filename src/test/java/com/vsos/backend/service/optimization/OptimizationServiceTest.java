package com.vsos.backend.service.optimization;

import com.vsos.backend.service.regression.RegressionService;
import com.vsos.backend.common.Vs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.core.task.TaskExecutor;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs.InvalidRequestException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;
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
        when(db.update(contains("SET status = 'RUNNING', started_at"), any(), anyLong())).thenReturn(1);
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
        trialData.put("status", "COMPLETED");
        trialData.put("constraint_violated", false);

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

    private static Row optimizationRun(String simulator) {
        Map<String, Object> run = new LinkedHashMap<>();
        run.put("id", 7L);
        run.put("project_id", 1L);
        run.put("scenario_id", 50L);
        run.put("base_aeb_version_id", 10L);
        run.put("carla_vehicle_model_id", 3L);
        run.put("created_by_user_id", 5L);
        run.put("max_trials", 4L);
        run.put("n_initial_points", 3);
        run.put("status", "PENDING");
        run.put("simulator_version", simulator);
        return new Row(run);
    }

    @Test
    void executeOptimization_refusesToRunOnADifferentCarlaProfileThanItWasCreatedFor() {
        // Đợt chọn CARLA lúc tạo (6985f846): backend đã đổi profile CARLA thì không chạy tiếp, vì baseline và trial phải cùng một bộ.
        // Đợt chọn động học thì không phụ thuộc cấu hình CARLA của backend nên không bị từ chối ở bước này.
        when(db.first(contains("SELECT * FROM optimization_runs WHERE id = ?"), eq(7L))).thenReturn(optimizationRun("carla-0.9.16-xosc9"));
        when(runService.configuredSimulator()).thenReturn("carla-0.9.16-xosc10");

        service.executeOptimization(7L);

        // Không ghép hai profile CARLA: không dựng baseline, không chạy trial nào.
        verify(db).update(contains("status = 'FAILED'"), contains("carla-0.9.16-xosc9"), any(), eq(7L));
        verify(runService, never()).createRuns(anyLong(), anyLong(), any(), anyLong(), anyLong(), anyLong(), anyString(), any(), any(), any());
        verify(runService, never()).createOptimizationRuns(anyLong(), anyLong(), any(), anyLong(), anyLong(), anyLong(), anyLong(), any());
    }

    @Test
    void executeOptimization_stopsWhenTheBaselineRunFailedInsteadOfScoringAgainstIt() {
        when(db.first(contains("SELECT * FROM optimization_runs WHERE id = ?"), eq(7L))).thenReturn(optimizationRun("carla-0.9.16-xosc10"));
        when(runService.configuredSimulator()).thenReturn("carla-0.9.16-xosc10");
        when(familyService.latestBaseVersionId(50L)).thenReturn(11L);
        when(familyService.variantsOf(11L)).thenReturn(java.util.List.of(new Row(Map.of("id", 5L))));
        when(db.list(contains("FROM simulation_runs WHERE project_id = ?"), any())).thenReturn(java.util.List.of());
        when(runService.createRuns(anyLong(), anyLong(), any(), anyLong(), anyLong(), anyLong(), anyString(), any(), any(), eq("carla-0.9.16-xosc10")))
                .thenReturn(java.util.List.of(70L));
        when(db.first(contains("SELECT * FROM simulation_runs WHERE id = ?"), eq(70L)))
                .thenReturn(new Row(Map.of("id", 70L, "scenario_version_id", 5L, "status", "FAILED", "error_message", "CARLA server unreachable")));

        service.executeOptimization(7L);

        verify(db).update(contains("status = 'FAILED'"), contains("Run baseline 70"), any(), eq(7L));
        verify(runService, never()).createOptimizationRuns(anyLong(), anyLong(), any(), anyLong(), anyLong(), anyLong(), anyLong(), any());
    }

    @Test
    void baselineLookupIsLimitedToTheOptimizationSimulatorAndVehicle() {
        when(db.first(contains("SELECT * FROM optimization_runs WHERE id = ?"), eq(7L))).thenReturn(optimizationRun("carla-0.9.16-xosc10"));
        when(runService.configuredSimulator()).thenReturn("carla-0.9.16-xosc10");
        when(familyService.latestBaseVersionId(50L)).thenReturn(11L);
        when(familyService.variantsOf(11L)).thenReturn(java.util.List.of(new Row(Map.of("id", 5L))));

        service.executeOptimization(7L);

        // Baseline động học hoặc -xosc9 cũ của cùng họ không được dùng làm chuẩn cho trial CARLA -xosc10.
        verify(db).list(org.mockito.ArgumentMatchers.argThat((String sql) -> sql.contains("simulator_version = ?")
                && sql.contains("carla_vehicle_model_id = ?") && sql.contains("ORDER BY id")), eq(1L), eq(50L), eq(10L), eq("carla-0.9.16-xosc10"), eq(3L));
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
        when(db.update(contains("SET status = 'CANCELLED'"), any(), eq(runId), eq(projectId))).thenReturn(1);

        service.cancelRun(projectId, runId, userId);

        verify(db).update(contains("UPDATE optimization_runs SET status = 'CANCELLED'"), any(), eq(runId), eq(projectId));
    }

    @Test
    void terminalCampaignCannotBeCancelledOrExecutedAgain() {
        for (String state : List.of("COMPLETED", "FAILED", "CANCELLED")) {
            Row terminal = new Row(Json.obj("id",7L,"project_id",1L,"status",state));
            when(db.first(anyString(), eq(7L), eq(1L))).thenReturn(terminal);
            when(db.first(anyString(), eq(7L))).thenReturn(terminal);
            assertThatThrownBy(() -> service.cancelRun(1,7,5)).isInstanceOf(InvalidRequestException.class);
            service.executeOptimization(7);
        }
        verify(db,never()).update(contains("SET status = 'CANCELLED'"),any(),anyLong(),anyLong());
        verify(db,never()).update(contains("SET status = 'RUNNING'"),any(),anyLong());
    }

    @Test
    void invalidTrialCannotCreateVerificationRuns() {
        var valid = Json.obj("id",101L,"candidate_aeb_version_id",88L,"status","COMPLETED","is_pareto_optimal",true,
                "constraint_violated",false,"rms_jerk_mps3",1.0,"impact_speed_mps",0.0,"stopping_distance_m",10.0);
        for (var invalid : List.of(Json.obj("status","RUNNING"), Json.obj("is_pareto_optimal",false),
                Json.obj("constraint_violated",true),Json.obj("rms_jerk_mps3",null))) {
            var data = new LinkedHashMap<>(valid);
            data.putAll(invalid);
            when(db.first(contains("FROM optimization_trials"),eq(101L),eq(7L),eq(1L))).thenReturn(new Row(data));
            assertThatThrownBy(() -> service.selectCandidateForVerification(1,7,101,5))
                    .isInstanceOf(InvalidRequestException.class).hasMessageContaining("trial Pareto");
        }
        verify(regressionService,never()).createTest(anyLong(),anyLong(),anyLong(),anyLong(),anyBoolean(),anyBoolean(),any(),any());
    }

    @Test
    void cancellationDuringFinalSimulationDoesNotBecomeCompleted() {
        service = spy(service);
        var campaign = new LinkedHashMap<String,Object>(optimizationRun(RunService.KINEMATIC_SIMULATOR).asMap());
        campaign.put("max_trials",1);
        when(db.first(contains("FROM optimization_runs"),eq(7L))).thenReturn(new Row(campaign));
        when(db.first(contains("FROM optimization_runs"),eq(7L),eq(1L)))
                .thenReturn(new Row(Json.obj("id",7L,"status","RUNNING")));
        AtomicReference<String> status = new AtomicReference<>("RUNNING");
        when(db.scalar(contains("SELECT status FROM optimization_runs"),eq(7L))).thenAnswer(inv -> status.get());
        when(db.update(contains("SET status = 'CANCELLED'"),any(),eq(7L),eq(1L))).thenAnswer(inv -> {
            status.set("CANCELLED"); return 1;
        });
        when(familyService.latestBaseVersionId(50L)).thenReturn(11L);
        when(familyService.variantsOf(11L)).thenReturn(List.of(new Row(Map.of("id",5L))));
        var baseline = new Row(Json.obj("id",70L,"scenario_version_id",5L,"status","COMPLETED","end_reason","STOPPED",
                "aeb_mode","ON","verdict","PASS","collision_occurred",false,"is_false_positive",false,"is_false_negative",false,
                "aeb_activated",true,"rms_jerk_mps3",1.0,"stopping_distance_m",10.0,"trace_frames",1,"brake_onset_t",1.0));
        when(db.list(contains("FROM simulation_runs WHERE project_id"),any(Object[].class))).thenReturn(List.of(baseline));
        doReturn(Json.obj("proposed_params",Map.of("TTC_THRESHOLD",2.0,"BRAKE_ACTIVATION_DELAY",0.1,"BRAKE_BUILDUP_RATE",10.0,"MAX_DECELERATION",8.0)))
                .when(service).proposeCandidate(any(),any(),anyInt());
        when(aebService.createCandidate(anyLong(),anyLong(),anyLong(),any(),anyString(),anyString(),anyString())).thenReturn(88L);
        when(db.insert(contains("INSERT INTO optimization_trials"),any(Object[].class))).thenReturn(101L);
        when(runService.createOptimizationRuns(anyLong(),anyLong(),any(),anyLong(),anyLong(),anyLong(),anyLong(),any())).thenReturn(List.of(200L));
        doAnswer(inv -> { service.cancelRun(1,7,5); return null; }).when(runService).executeRun(200L);

        service.executeOptimization(7);

        assertThat(status.get()).isEqualTo("CANCELLED");
        verify(db).update(contains("optimization_trials SET status = 'PRUNED'"),any(),eq(101L));
        verify(db,never()).update(contains("optimization_runs SET status = 'COMPLETED'"),any(),eq(7L));
        verify(db,never()).update(contains("optimization_runs SET status = 'FAILED'"),any(),any(),eq(7L));
    }

    @Test
    void historicalVariantGenerationsCannotChangeTheCurrentBaselineCohort() {
        service = spy(service);
        var campaign = new LinkedHashMap<String,Object>(optimizationRun(RunService.KINEMATIC_SIMULATOR).asMap());
        campaign.put("max_trials",0);
        when(db.first(contains("FROM optimization_runs"),eq(7L))).thenReturn(new Row(campaign));
        when(familyService.latestBaseVersionId(50L)).thenReturn(11L);
        when(familyService.variantsOf(11L)).thenReturn(List.of(new Row(Map.of("id",5L))));
        var active = new Row(Json.obj("id",70L,"scenario_version_id",5L,"status","COMPLETED","end_reason","STOPPED",
                "aeb_mode","ON","verdict","PASS","collision_occurred",false,"is_false_positive",false,"is_false_negative",false,
                "aeb_activated",true,"rms_jerk_mps3",1.0,"stopping_distance_m",10.0,"trace_frames",1,"brake_onset_t",1.0));
        // This failed older-generation run must not affect the selected generation's baseline constraints.
        var historical = new Row(Json.obj("id",69L,"scenario_version_id",4L,"status","COMPLETED","collision_occurred",true));
        when(db.list(contains("FROM simulation_runs WHERE project_id"),any(Object[].class))).thenReturn(List.of(historical,active));

        service.executeOptimization(7);

        verify(service).computeStats(org.mockito.ArgumentMatchers.argThat(rows -> rows.size() == 1 && rows.iterator().next() == active));
        verify(db,never()).update(contains("optimization_runs SET status = 'FAILED'"),any(),any(),eq(7L));
    }

    @Test
    void missingBaselineVariantCannotSilentlyShrinkTheTrialCohort() {
        service = spy(service);
        when(db.first(contains("FROM optimization_runs"),eq(7L))).thenReturn(optimizationRun(RunService.KINEMATIC_SIMULATOR));
        when(familyService.latestBaseVersionId(50L)).thenReturn(11L);
        when(familyService.variantsOf(11L)).thenReturn(List.of(new Row(Map.of("id",5L))));
        when(db.list(contains("FROM simulation_runs WHERE project_id"),any(Object[].class))).thenReturn(List.of());
        when(runService.createRuns(anyLong(),anyLong(),any(),anyLong(),anyLong(),anyLong(),anyString(),any(),any(),anyString()))
                .thenReturn(List.of(70L));
        when(db.first(contains("FROM simulation_runs WHERE id"),eq(70L))).thenReturn(null);

        service.executeOptimization(7);

        verify(service,never()).computeStats(any());
        verify(db).update(contains("optimization_runs SET status = 'FAILED'"),contains("missing selected variant runs"),any(),eq(7L));
        verify(runService,never()).createOptimizationRuns(anyLong(),anyLong(),any(),anyLong(),anyLong(),anyLong(),anyLong(),any());
    }
}
