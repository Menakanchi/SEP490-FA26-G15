package com.vsos.backend.service.optimization;

import com.vsos.backend.service.regression.RegressionService;
import com.vsos.backend.service.analysis.AnalysisService;
import com.vsos.backend.service.analysis.FailureAnalysisHandoffService;
import com.vsos.backend.common.Vs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.core.task.TaskExecutor;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.controller.optimization.OptimizationController;
import com.vsos.backend.exception.ApiExceptionHandler;
import com.vsos.backend.exception.analysis.FailureAnalysisException;
import com.vsos.backend.security.VehicSimAccess;

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
    private AnalysisService analysis;
    private FailureAnalysisHandoffService handoffs;

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
        analysis = mock(AnalysisService.class);
        handoffs = mock(FailureAnalysisHandoffService.class);

        service = new OptimizationService(
                db,
                queries,
                runService,
                aebService,
                regressionService,
                familyService,
                props,
                executor,
                analysis, handoffs
        );
    }

    @Test
    void runDetailsPreserveSimulatorIdentity() {
        when(db.scalar(contains("SELECT COUNT(*) FROM optimization_trials"), anyLong())).thenReturn(0L);
        for (String profile : List.of("carla-0.9.16-xosc16", "vehicsim-kinematic-1.4")) {
            when(db.first(contains("SELECT * FROM optimization_runs WHERE id = ? AND project_id = ?"), eq(7L), eq(1L)))
                    .thenReturn(optimizationRun(profile));
            assertThat(service.getRun(1L,7L)).containsEntry("simulator_version",profile);
        }
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
                && sql.contains("carla_vehicle_model_id = ?") && !sql.contains("ORDER BY")), eq(1L), eq(50L), eq(10L), eq("carla-0.9.16-xosc10"), eq(3L));
    }

    @Test
    void baselineLookupUsesNewestRunPerSelectedVariantEvenWhenDatabaseReturnsRowsOutOfOrder() {
        Row newest = new Row(Map.of("id", 72L, "scenario_version_id", 5L));
        Row oldest = new Row(Map.of("id", 70L, "scenario_version_id", 5L));
        Row otherVariant = new Row(Map.of("id", 73L, "scenario_version_id", 6L));
        when(db.list(contains("FROM simulation_runs WHERE project_id = ? AND scenario_id = ?"),
                eq(1L), eq(50L), eq(10L), eq("carla-0.9.16-xosc10"), eq(3L)))
                .thenReturn(List.of(newest, otherVariant, oldest));

        Map<Long, Row> selected = org.springframework.test.util.ReflectionTestUtils.invokeMethod(service, "getOrCreateBaselineRuns",
                1L, 50L, List.of(new Row(Map.of("id", 5L))), 3L, 10L, 9L, "carla-0.9.16-xosc10");

        assertThat(selected).containsOnlyKeys(5L);
        assertThat(selected.get(5L).lng("id")).isEqualTo(72L);
        verify(runService, never()).createRuns(anyLong(), anyLong(), any(), anyLong(), anyLong(), anyLong(), anyString(), any(), any(), any());
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

    private static Map<String,Double> baselineParameters() {
        return Map.of("TTC_THRESHOLD",1.5,"BRAKE_ACTIVATION_DELAY",.15,"BRAKE_BUILDUP_RATE",20.0,"MAX_DECELERATION",8.0);
    }

    private static Row frozenSource(long id,long variant,long seed) {
        return new Row(Json.obj("id",id,"project_id",1L,"scenario_id",50L,"scenario_version_id",variant,"random_seed",seed,
                "aeb_version_id",10L,"carla_vehicle_model_id",3L,"simulator_version",RunService.KINEMATIC_SIMULATOR,
                "fixed_delta_seconds",.05,"run_config_json",Json.write(Json.obj("sealed_case",id)),
                "status","COMPLETED","end_reason","EGO_STOPPED","aeb_mode","ON","verdict","PASS",
                "collision_occurred",false,"is_false_positive",false,"is_false_negative",false,"aeb_activated",true,
                "rms_jerk_mps3",1.0,"stopping_distance_m",10.0,"trace_frames",1,
                "telemetry_json",Json.write(Json.obj("params",Json.obj("ttc_threshold",1.5,"brake_activation_delay",.15,
                        "brake_buildup_rate",20.0,"max_deceleration",8.0)))));
    }

    private Map<String,Object> arrangeFrozenCampaign() {
        var snapshot=Json.obj("schema","vehicsim.analysis-dataset/v2","id",99L,"dataset_digest","a".repeat(64),
                "scenario",Json.obj("id",50L),"baseline",Json.obj("id",10L),
                "reference",Json.obj("vehicle_id",3L,"simulator",RunService.KINEMATIC_SIMULATOR,"dt",.05),
                "optimization_run_ids",List.of(70L,71L),"validation_run_ids",List.of(80L,81L));
        var reference=Json.obj("dataset_id",99L,"dataset_digest",snapshot.get("dataset_digest"),
                "optimization_run_ids",List.of(70L,71L),"validation_run_ids",List.of(80L,81L));
        var campaign=new LinkedHashMap<>(optimizationRun(RunService.KINEMATIC_SIMULATOR).asMap());
        campaign.put("max_trials",1);campaign.put("objective_config_json",Json.write(Json.obj("dataset_ref",reference)));
        when(db.first(contains("FROM optimization_runs"),eq(7L))).thenReturn(new Row(campaign));
        when(analysis.handoff(1L,99L)).thenReturn(snapshot);
        when(queries.aebValues(10L)).thenReturn(baselineParameters());
        // Both optimization rows intentionally share a variant but have distinct seeds.
        when(db.list(contains("FROM simulation_runs WHERE project_id = ? AND id IN"),eq(1L),eq(70L),eq(71L)))
                .thenReturn(List.of(frozenSource(70,5,101),frozenSource(71,5,102)));
        when(db.list(contains("FROM simulation_runs WHERE project_id = ? AND id IN"),eq(1L),eq(80L),eq(81L)))
                .thenReturn(List.of(frozenSource(80,6,201),frozenSource(81,6,202)));
        // Mutable current configuration differs from the sealed one and must never reach the runner.
        when(db.first(contains("FROM scenario_versions"),eq(5L),eq(50L))).thenReturn(new Row(Json.obj("id",5L,"scenario_ir_json","{}")));
        when(db.first(contains("FROM scenario_versions"),eq(6L),eq(50L))).thenReturn(new Row(Json.obj("id",6L,"scenario_ir_json","{}")));
        return snapshot;
    }

    @ParameterizedTest @ValueSource(booleans={false,true})
    void frozenCampaignUsesEveryOptimizationSeedAndNeverDispatchesValidationMembers(boolean v3) {
        service=spy(service);
        if (v3) arrangeV3Campaign(); else arrangeFrozenCampaign();
        when(queries.aebValues(88L)).thenReturn(Map.of("TTC_THRESHOLD",2.0,"BRAKE_ACTIVATION_DELAY",.1,
                "BRAKE_BUILDUP_RATE",10.0,"MAX_DECELERATION",8.0));
        doReturn(Json.obj("proposed_params",Map.of("TTC_THRESHOLD",2.0,"BRAKE_ACTIVATION_DELAY",.1,
                "BRAKE_BUILDUP_RATE",10.0,"MAX_DECELERATION",8.0))).when(service).proposeCandidate(any(),any(),anyInt());
        when(aebService.createCandidate(anyLong(),anyLong(),anyLong(),any(),anyString(),anyString(),anyString())).thenReturn(88L);
        when(db.insert(contains("INSERT INTO optimization_trials"),any(Object[].class))).thenReturn(101L);
        when(runService.createOptimizationRuns(eq(1L),eq(50L),any(),eq(3L),eq(88L),eq(5L),eq(101L),any()))
                .thenAnswer(inv -> {
                    @SuppressWarnings("unchecked") var sources=(Map<Long,Row>)inv.getArgument(7);
                    @SuppressWarnings("unchecked") var variants=(List<Row>)inv.getArgument(2);
                    Row source=sources.values().iterator().next();
                    assertThat(variants).hasSize(1);
                    assertThat(variants.get(0).lng("id")).isEqualTo(5L);
                    assertThat(variants.get(0).json("scenario_ir_json")).isEqualTo(source.json("run_config_json"));
                    return List.of(source.lng("id")+1000);
                });
        var candidates=new java.util.ArrayList<Row>();
        for (Row source:List.of(frozenSource(70,5,101),frozenSource(71,5,102))) {
            var candidate=new LinkedHashMap<>(source.asMap());candidate.put("id",source.lng("id")+1000);
            candidate.put("baseline_run_id",source.lng("id"));candidate.put("aeb_version_id",88L);candidate.put("optimization_trial_id",101L);
            candidate.put("telemetry_json",Json.write(Json.obj("params",Json.obj("ttc_threshold",2.0,"brake_activation_delay",.1,
                    "brake_buildup_rate",10.0,"max_deceleration",8.0))));
            candidate.put("rms_jerk_mps3",source.lng("id")==70?4.0:6.0);candidates.add(new Row(candidate));
        }
        when(db.list(contains("FROM simulation_runs WHERE id IN"),eq(1070L),eq(1071L))).thenReturn(candidates);
        service.executeOptimization(7);
        verify(familyService,never()).latestBaseVersionId(anyLong());
        verify(runService).executeRun(1070L);verify(runService).executeRun(1071L);
        verify(runService,never()).executeRun(1080L);verify(runService,never()).executeRun(1081L);
        verify(db).update(contains("rms_jerk_mps3 = ?"),eq(5.0),eq(0.0),eq(10.0),eq(0.0),any(),eq(false),any(),eq(101L));
        verify(db,never()).update(contains("optimization_runs SET status = 'FAILED'"),any(),any(),eq(7L));
        if (v3) {
            verify(analysis, never()).handoff(anyLong(), anyLong());
            verify(handoffs, org.mockito.Mockito.atLeast(3)).campaign(eq(1L), eq(V3_ID), eq(V3_SHA));
        }
    }

    @Test void staleFrozenChecksumFailsBeforeCreatingCandidateAndClosesUnfinishedTrials() {
        var snapshot=arrangeFrozenCampaign();snapshot.put("dataset_digest","b".repeat(64));
        service.executeOptimization(7);
        verify(aebService,never()).createCandidate(anyLong(),anyLong(),anyLong(),any(),any(),any(),any());
        verify(db).update(contains("optimization_runs SET status = 'FAILED'"),contains("checksum changed"),any(),eq(7L));
        verify(db).update(contains("optimization_trials SET status = 'FAILED'"),any(),eq(7L));
    }

    @Test void campaignCreationPinsServerPartitionAndRejectsStaleClientChecksum() {
        var snapshot=arrangeFrozenCampaign();
        when(db.first(contains("FROM projects"),eq(1L))).thenReturn(new Row(Json.obj("id",1L)));
        when(db.first(contains("FROM scenarios"),eq(50L),eq(1L))).thenReturn(new Row(Json.obj("id",50L,"name","Family")));
        when(db.first(contains("FROM aeb_versions"),eq(10L),eq(1L))).thenReturn(new Row(Json.obj("id",10L)));
        when(queries.vehicleById(3L)).thenReturn(new Row(Json.obj("id",3L)));
        assertThatThrownBy(()->service.createAndStartRun(1,5,50,null,1,1,null,null,"frozen","KINEMATIC",99L,"stale"))
                .hasMessageContaining("checksum changed");
        service.createAndStartRun(1,5,50,null,1,1,null,null,"frozen","KINEMATIC",99L,(String)snapshot.get("dataset_digest"));
        var arguments=org.mockito.ArgumentCaptor.forClass(Object[].class);
        verify(db).insert(contains("INSERT INTO optimization_runs"),arguments.capture());
        String config=java.util.Arrays.stream(arguments.getValue()).filter(v->v instanceof String text&&text.contains("dataset_ref"))
                .map(Object::toString).findFirst().orElseThrow();
        assertThat(Json.asMap(Json.parseMap(config).get("dataset_ref"))).containsEntry("dataset_id",99)
                .containsEntry("optimization_run_ids",List.of(70,71)).containsEntry("validation_run_ids",List.of(80,81));
    }

    @Test void repeatedVerificationSelectReusesOnlyItsExplicitCampaignTrialMarker() {
        var snapshot=arrangeFrozenCampaign();
        when(db.first(contains("FROM optimization_trials"),eq(101L),eq(7L),eq(1L))).thenReturn(new Row(Json.obj(
                "id",101L,"trial_number",1L,"status","COMPLETED","is_pareto_optimal",true,"constraint_violated",false,
                "candidate_aeb_version_id",88L,"rms_jerk_mps3",1.0,"impact_speed_mps",0.0,"stopping_distance_m",10.0)));
        when(regressionService.createFrozenTest(anyLong(),anyLong(),anyLong(),anyLong(),anyLong(),anyLong(),anyString(),any(),any(),any(),anyString()))
                .thenReturn(777L);
        var first=service.selectCandidateForVerification(1,7,101,5);
        assertThat(first.get("regression_test_id")).isEqualTo(777L);
        var selection=Json.obj("dataset_ref",Json.obj("dataset_digest",snapshot.get("dataset_digest")),"baseline_run_ids",List.of(80L,81L));
        when(db.first(contains("$.verification_ref.optimization_run_id"),eq(1L),eq(88L),eq(10L),eq(50L),eq(7L),eq(101L)))
                .thenReturn(new Row(Json.obj("id",777L,"pass_criteria_json",Json.write(Json.obj("scenario_set",selection)))));
        var repeated=service.selectCandidateForVerification(1,7,101,5);
        assertThat(repeated.get("regression_test_id")).isEqualTo(777L);
        verify(regressionService).createFrozenTest(anyLong(),anyLong(),anyLong(),anyLong(),anyLong(),anyLong(),anyString(),any(),any(),any(),anyString());
        verify(db).update(contains("'$.verification_ref'"),eq(Json.write(Json.obj("optimization_run_id",7L,"trial_id",101L))),eq(777L),eq(1L));
    }

    private static final String V3_ID = "3786e5f4-300f-4e55-b62f-b23197df0d2d";
    private static final String V3_SHA = "c".repeat(64);

    private static Map<String,Object> approvedSpace() {
        return Json.obj("TTC_THRESHOLD", List.of(1.0,2.0), "BRAKE_ACTIVATION_DELAY", List.of(.1,.2),
                "BRAKE_BUILDUP_RATE", List.of(10.0,20.0), "MAX_DECELERATION", List.of(6.0,8.0));
    }

    private static Map<String,Object> v3Reference(Map<String,Object> snapshot) {
        return Json.obj("schema",snapshot.get("schema"),"handoff_id",V3_ID,"handoff_digest",V3_SHA,
                "dataset_digest",snapshot.get("dataset_digest"),"optimization_run_ids",snapshot.get("optimization_run_ids"),
                "validation_run_ids",snapshot.get("validation_run_ids"));
    }

    private Map<String,Object> arrangeV3Campaign() {
        var snapshot = arrangeFrozenCampaign();
        snapshot.remove("id");
        snapshot.put("schema","vehicsim.fa-v3-campaign/v1");
        snapshot.put("handoff_id",V3_ID);
        snapshot.put("handoff_digest",V3_SHA);
        snapshot.put("search_space",approvedSpace());
        when(handoffs.campaign(1L,V3_ID,V3_SHA)).thenReturn(snapshot);
        var campaign = new LinkedHashMap<>(optimizationRun(RunService.KINEMATIC_SIMULATOR).asMap());
        campaign.put("max_trials",1);
        campaign.put("search_space_json",Json.write(approvedSpace()));
        campaign.put("objective_config_json",Json.write(Json.obj("handoff_ref",v3Reference(snapshot))));
        when(db.first(contains("FROM optimization_runs"),eq(7L))).thenReturn(new Row(campaign));
        return snapshot;
    }

    private void arrangeCreate() {
        when(db.first(contains("FROM projects"),eq(1L))).thenReturn(new Row(Json.obj("id",1L)));
        when(db.first(contains("FROM scenarios"),eq(50L),eq(1L))).thenReturn(new Row(Json.obj("id",50L,"name","Family")));
        when(db.first(contains("FROM aeb_versions"),eq(10L),eq(1L))).thenReturn(new Row(Json.obj("id",10L)));
        when(queries.vehicleById(3L)).thenReturn(new Row(Json.obj("id",3L)));
    }

    @Test void v3CreationPinsApprovedDomainAndLineageWithoutResolvingV2() {
        var snapshot = arrangeV3Campaign(); arrangeCreate();
        service.createAndStartRun(1,5,50,null,1,1,null,null,"V3","KINEMATIC",null,null,V3_ID,V3_SHA);
        var arguments = org.mockito.ArgumentCaptor.forClass(Object[].class);
        verify(db).insert(contains("INSERT INTO optimization_runs"),arguments.capture());
        var stored = arguments.getValue();
        assertThat(Json.parseMap((String)stored[7])).isEqualTo(Json.parseMap(Json.write(approvedSpace())));
        var config = Json.parseMap((String)stored[8]);
        assertThat(config).doesNotContainKey("dataset_ref");
        assertThat(Json.asMap(config.get("handoff_ref"))).isEqualTo(Json.parseMap(Json.write(v3Reference(snapshot))));
        verify(analysis,never()).handoff(anyLong(),anyLong());
    }

    @Test void v3MissingAuthorityOrIncompleteReferenceNeverFallsBackToV2() {
        arrangeV3Campaign(); arrangeCreate();
        assertThatThrownBy(() -> service.createAndStartRun(1,5,50,null,1,1,null,null,"V3","KINEMATIC",99L,"a".repeat(64),V3_ID,V3_SHA))
                .hasMessageContaining("either a V3 handoff or a V2 dataset");
        assertThatThrownBy(() -> service.createAndStartRun(1,5,50,null,1,1,null,null,"V3","KINEMATIC",null,null,V3_ID,null))
                .hasMessageContaining("SHA-256");
        when(handoffs.campaign(1L,V3_ID,V3_SHA)).thenThrow(new InvalidRequestException("V3 approved context is missing"));
        assertThatThrownBy(() -> service.createAndStartRun(1,5,50,null,1,1,null,null,"V3","KINEMATIC",null,null,V3_ID,V3_SHA))
                .hasMessageContaining("context is missing");
        verify(analysis,never()).handoff(anyLong(),anyLong());
        verify(db,never()).insert(contains("INSERT INTO optimization_runs"),any(Object[].class));
    }

    @Test void v3CannotOverrideApprovedSearchSpaceOrCampaignIdentity() {
        var snapshot = arrangeV3Campaign(); arrangeCreate();
        var different = approvedSpace(); different.put("TTC_THRESHOLD",List.of(.5,3.5));
        assertThatThrownBy(() -> service.createAndStartRun(1,5,50,null,1,1,Json.write(different),null,"V3","KINEMATIC",null,null,V3_ID,V3_SHA))
                .hasMessageContaining("approved domain");
        snapshot.put("baseline",Json.obj("id",11L));
        assertThatThrownBy(() -> service.createAndStartRun(1,5,50,10L,1,1,null,null,"V3","KINEMATIC",null,null,V3_ID,V3_SHA))
                .hasMessageContaining("another scenario or baseline");
        verify(db,never()).insert(contains("INSERT INTO optimization_runs"),any(Object[].class));
    }

    @ParameterizedTest @ValueSource(strings={"partition","domain","digest","contract"})
    void v3RestartChecksStoredPartitionAndApprovedDomainBeforeAnyCandidate(String changed) {
        var snapshot = arrangeV3Campaign();
        String expected;
        switch (changed) {
            case "partition" -> { snapshot.put("validation_run_ids",List.of(80L)); expected="partition or revision changed"; }
            case "domain" -> {
                var space = approvedSpace(); space.put("TTC_THRESHOLD",List.of(1.1,2.0));
                snapshot.put("search_space",space); expected="approved domain";
            }
            case "digest" -> { snapshot.put("dataset_digest","d".repeat(64)); expected="checksum changed"; }
            default -> { snapshot.put("schema","vehicsim.analysis-dataset/v2"); expected="contract is invalid"; }
        }
        service.executeOptimization(7);
        verify(db).update(contains("optimization_runs SET status = 'FAILED'"),contains(expected),any(),eq(7L));
        verify(aebService,never()).createCandidate(anyLong(),anyLong(),anyLong(),any(),any(),any(),any());
        verify(analysis,never()).handoff(anyLong(),anyLong());
    }

    @Test void v3HoldoutCannotLeakIntoTrainingEvenIfFacadeReturnsAnOverlappingVariant() {
        arrangeV3Campaign();
        when(db.list(contains("FROM simulation_runs WHERE project_id = ? AND id IN"),eq(1L),eq(80L),eq(81L)))
                .thenReturn(List.of(frozenSource(80,5,201),frozenSource(81,6,202)));
        service.executeOptimization(7);
        verify(db).update(contains("optimization_runs SET status = 'FAILED'"),contains("holdout variants"),any(),eq(7L));
        verify(aebService,never()).createCandidate(anyLong(),anyLong(),anyLong(),any(),any(),any(),any());
    }

    @Test void v3VerificationPreservesHandoffAndCannotReuseAV2TestWithTheSamePartitionDigest() {
        var snapshot = arrangeV3Campaign();
        when(db.first(contains("FROM optimization_trials"),eq(101L),eq(7L),eq(1L))).thenReturn(new Row(Json.obj(
                "id",101L,"trial_number",1L,"status","COMPLETED","is_pareto_optimal",true,"constraint_violated",false,
                "candidate_aeb_version_id",88L,"rms_jerk_mps3",1.0,"impact_speed_mps",0.0,"stopping_distance_m",10.0)));
        var oldSelection = Json.obj("dataset_ref",Json.obj("dataset_id",99L,"dataset_digest",snapshot.get("dataset_digest")),
                "baseline_run_ids",List.of(80L,81L));
        when(db.first(contains("$.verification_ref.optimization_run_id"),eq(1L),eq(88L),eq(10L),eq(50L),eq(7L),eq(101L)))
                .thenReturn(new Row(Json.obj("id",777L,"pass_criteria_json",Json.write(Json.obj("scenario_set",oldSelection)))));
        when(regressionService.createFrozenTest(anyLong(),anyLong(),anyLong(),anyLong(),anyLong(),anyLong(),anyString(),any(),any(),any(),anyString()))
                .thenReturn(778L);
        var result = service.selectCandidateForVerification(1,7,101,5);
        assertThat(result.get("regression_test_id")).isEqualTo(778L);
        var lineage = org.mockito.ArgumentCaptor.forClass(Map.class);
        verify(regressionService).createFrozenTest(eq(1L),eq(5L),eq(88L),eq(50L),eq(10L),eq(3L),eq(RunService.KINEMATIC_SIMULATOR),
                org.mockito.ArgumentMatchers.argThat(variants -> variants.stream().allMatch(row -> row.lng("id")==6L)),
                org.mockito.ArgumentMatchers.argThat(sources -> sources.stream().map(row -> row.lng("id")).toList().equals(List.of(80L,81L))),
                lineage.capture(),anyString());
        assertThat(Json.asMap(lineage.getValue().get("handoff_ref"))).isEqualTo(Json.parseMap(Json.write(v3Reference(snapshot))));
        var currentSelection = Json.obj("dataset_ref",lineage.getValue(),"baseline_run_ids",List.of(80L,81L));
        when(db.first(contains("$.verification_ref.optimization_run_id"),eq(1L),eq(88L),eq(10L),eq(50L),eq(7L),eq(101L)))
                .thenReturn(new Row(Json.obj("id",778L,"pass_criteria_json",Json.write(Json.obj("scenario_set",currentSelection)))));
        assertThat(service.selectCandidateForVerification(1,7,101,5).get("regression_test_id")).isEqualTo(778L);
        verify(regressionService,org.mockito.Mockito.times(1)).createFrozenTest(anyLong(),anyLong(),anyLong(),anyLong(),anyLong(),anyLong(),anyString(),any(),any(),any(),anyString());
        verify(analysis,never()).handoff(anyLong(),anyLong());
    }

    @Test void optimizerHttpPreservesControlledHandoffErrorsAndRetryability() throws Exception {
        OptimizationService failing = mock(OptimizationService.class);
        VehicSimAccess access = mock(VehicSimAccess.class);
        when(access.projectId()).thenReturn(1L);
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(new OptimizationController(failing,access))
                .setControllerAdvice(new ApiExceptionHandler()).build();
        for (int status : List.of(404,409,503)) {
            org.mockito.Mockito.doThrow(new FailureAnalysisException(status,"V3_SOURCE_REVISION_CHANGED"))
                    .when(failing).getRun(1L,7L);
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/vehicsim/optimizations/7"))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().is(status))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code").value("V3_SOURCE_REVISION_CHANGED"))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.retryable").value(status==503))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.detail").isString());
        }
    }

    @Test void archivedProjectExceptionMapsToConflictWithoutExposingAWebDependencyInRepository() throws Exception {
        OptimizationService failing = mock(OptimizationService.class);
        VehicSimAccess access = mock(VehicSimAccess.class);
        when(access.projectId()).thenReturn(1L);
        when(failing.getRun(1L,7L)).thenThrow(new com.vsos.backend.common.Vs.ArchivedProjectException());
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(new OptimizationController(failing,access))
                .setControllerAdvice(new ApiExceptionHandler()).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/vehicsim/optimizations/7"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isConflict())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.detail")
                        .value("Project hoặc workspace đang lưu trữ, chỉ có thể xem"));
    }
}
