package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.TaskExecutor;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Luật cứng 4 và 9 (AGENTS.md): candidate chạy đúng seed của baseline; regression không ghép động học với CARLA hay khác xe;
 * preview khớp bộ kịch bản thật của test; run hỏng / bị dừng không bao giờ cho verdict PASSED (TD-33). Logic thật, {@link Db} giả.
 */
class RegressionPairingTest {

    private static final long PROJECT = 1L;
    private static final long SCENARIO = 20L;
    private static final long TEST = 30L;
    private static final long BASELINE = 10L;
    private static final long CANDIDATE = 11L;
    private static final long VEHICLE = 3L;
    private static final long USER = 5L;

    private static final String CARLA = "carla-0.9.16-xosc2";

    private Db db;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
    }

    private static Row row(Object... keyValues) {
        return new Row(Json.obj(keyValues));
    }

    // ------------------------------------------------------------------ RunService.createRuns: seed / bộ mô phỏng / xe

    /** RunService thật cấu hình chạy run MỚI bằng {@code configured}; mọi câu INSERT simulation_runs được ghi lại. */
    private RunService runServiceConfiguredFor(String configured, List<Object[]> inserts) {
        boolean carla = configured.startsWith("carla");
        VehicSimProperties props = new VehicSimProperties(carla ? "carla-xosc" : "kinematic", carla ? "[\"python\"]" : "", "0.9.16", "", "inline",
                60, 1, "python", "worker", false, 1000, 1000);
        when(db.scalar(startsWith("SELECT COUNT(*) FROM simulation_runs WHERE created_by_user_id"), any(Object[].class))).thenReturn(0L);
        when(db.insert(startsWith("INSERT INTO simulation_runs"), any(Object[].class))).thenAnswer(inv -> {
            inserts.add(inv.getArguments());
            return 100L + inserts.size();
        });
        return new RunService(db, mock(Queries.class), props, mock(TaskExecutor.class), mock(ApplicationEventPublisher.class),
                mock(TransactionTemplate.class), mock(FamilyService.class));
    }

    private static List<Row> variant(long id) {
        return List.of(row("id", id));
    }

    // Chỉ số tham số trong Object[] của db.insert: [0] = SQL, rồi theo đúng thứ tự cột của câu INSERT trong RunService.createRuns.
    private static final int SIMULATOR_TYPE = 6;
    private static final int SIMULATOR_VERSION = 7;
    private static final int REGRESSION_TEST = 10;
    private static final int BASELINE_RUN = 11;
    private static final int PURPOSE = 12;
    private static final int SEED = 13;

    @Test
    void aRegressionRunCopiesTheSeedOfItsBaselineRunNotTheDefaultSeed() {
        List<Object[]> inserts = new ArrayList<>();
        RunService runs = runServiceConfiguredFor(RunService.KINEMATIC_SIMULATOR, inserts);
        Row baselineRun = row("id", 900L, "random_seed", 77_777L, "simulator_version", RunService.KINEMATIC_SIMULATOR, "carla_vehicle_model_id", VEHICLE);

        runs.createRuns(PROJECT, SCENARIO, variant(101L), VEHICLE, CANDIDATE, USER, "REGRESSION", TEST, Map.of(101L, baselineRun));

        assertThat(inserts).hasSize(1);
        Object[] insert = inserts.get(0);
        assertThat(insert[SEED]).as("seed mặc định sẽ là 48000 + id biến thể").isEqualTo(77_777L).isNotEqualTo(RunService.seedFor(101L));
        assertThat(insert[PURPOSE]).isEqualTo("REGRESSION");
        assertThat(insert[REGRESSION_TEST]).isEqualTo(TEST);
        assertThat(insert[BASELINE_RUN]).isEqualTo(900L);
    }

    @Test
    void aKinematicBaselineIsNeverPairedWithACarlaRunEvenWhenCarlaIsConfigured() {
        List<Object[]> inserts = new ArrayList<>();
        RunService runs = runServiceConfiguredFor(CARLA, inserts);
        Row baselineRun = row("id", 900L, "random_seed", 48_101L, "simulator_version", RunService.KINEMATIC_SIMULATOR, "carla_vehicle_model_id", VEHICLE);

        runs.createRuns(PROJECT, SCENARIO, variant(101L), VEHICLE, CANDIDATE, USER, "REGRESSION", TEST, Map.of(101L, baselineRun));

        assertThat(inserts.get(0)[SIMULATOR_VERSION]).isEqualTo(RunService.KINEMATIC_SIMULATOR);
        assertThat(inserts.get(0)[SIMULATOR_TYPE]).isEqualTo("KINEMATIC");
    }

    @Test
    void aCarlaBaselineIsNeverPairedWithAKinematicRunEvenWhenKinematicIsConfigured() {
        List<Object[]> inserts = new ArrayList<>();
        RunService runs = runServiceConfiguredFor(RunService.KINEMATIC_SIMULATOR, inserts);
        Row baselineRun = row("id", 900L, "random_seed", 48_101L, "simulator_version", CARLA, "carla_vehicle_model_id", VEHICLE);

        runs.createRuns(PROJECT, SCENARIO, variant(101L), VEHICLE, CANDIDATE, USER, "REGRESSION", TEST, Map.of(101L, baselineRun));

        assertThat(inserts.get(0)[SIMULATOR_VERSION]).isEqualTo(CARLA);
        assertThat(inserts.get(0)[SIMULATOR_TYPE]).isEqualTo("CARLA");
    }

    @Test
    void aBaselineRunOnAnotherVehicleCannotBePaired() {
        List<Object[]> inserts = new ArrayList<>();
        RunService runs = runServiceConfiguredFor(RunService.KINEMATIC_SIMULATOR, inserts);
        Row baselineRun = row("id", 900L, "random_seed", 48_101L, "simulator_version", RunService.KINEMATIC_SIMULATOR, "carla_vehicle_model_id", VEHICLE + 1);

        assertThatThrownBy(() -> runs.createRuns(PROJECT, SCENARIO, variant(101L), VEHICLE, CANDIDATE, USER, "REGRESSION", TEST, Map.of(101L, baselineRun)))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("xe khác");
        assertThat(inserts).isEmpty();
    }

    // ------------------------------------------------------------------ RegressionService.createTest / preview

    private RegressionService service(RunService runs, Queries queries, FamilyService families) {
        return new RegressionService(db, queries, families, runs, mock(TransactionTemplate.class));
    }

    /** Họ có 3 biến thể 101..103; baseline đã chạy 101 (có lỗi) và 102, chưa chạy 103. */
    private void arrangeFamily(Queries queries, FamilyService families) {
        Row baseline = row("id", BASELINE, "project_id", PROJECT, "version_no", 1L, "label", "v1.0");
        when(queries.baselineVersion(PROJECT)).thenReturn(baseline);
        when(queries.activeVehicle(PROJECT)).thenReturn(row("id", VEHICLE));
        when(families.latestBaseVersionId(SCENARIO)).thenReturn(50L);
        when(families.variantsOf(50L)).thenReturn(List.of(row("id", 101L), row("id", 102L), row("id", 103L)));
        when(db.first(startsWith("SELECT * FROM scenarios"), any(Object[].class))).thenReturn(row("id", SCENARIO, "name", "Họ A", "code", "SC-A"));
        when(db.first(startsWith("SELECT * FROM aeb_versions"), any(Object[].class)))
                .thenReturn(row("id", CANDIDATE, "project_id", PROJECT, "version_no", 2L, "label", "v1.1", "status", "CANDIDATE"));
        when(db.list(contains("FROM simulation_runs WHERE aeb_version_id = ?"), any(Object[].class))).thenReturn(List.of(
                row("id", 1001L, "scenario_version_id", 101L, "status", "COMPLETED", "random_seed", 48_101L,
                        "simulator_version", RunService.KINEMATIC_SIMULATOR, "carla_vehicle_model_id", VEHICLE),
                row("id", 1002L, "scenario_version_id", 102L, "status", "COMPLETED", "random_seed", 48_102L,
                        "simulator_version", RunService.KINEMATIC_SIMULATOR, "carla_vehicle_model_id", VEHICLE)));
        when(db.list(startsWith("SELECT r.scenario_version_id FROM simulation_runs r JOIN failures"), any(Object[].class)))
                .thenReturn(List.of(row("scenario_version_id", 101L)));
    }

    @Test
    @SuppressWarnings("unchecked")
    void candidateRunsAreCreatedAgainstTheExistingBaselineRunsAndOnlyMissingBaselinesAreRun() {
        Queries queries = mock(Queries.class);
        FamilyService families = mock(FamilyService.class);
        RunService runs = mock(RunService.class);
        arrangeFamily(queries, families);
        when(runs.configuredSimulator()).thenReturn(RunService.KINEMATIC_SIMULATOR);
        when(db.insert(startsWith("INSERT INTO regression_tests"), any(Object[].class))).thenReturn(TEST);
        when(runs.createRuns(anyLong(), anyLong(), any(), anyLong(), anyLong(), anyLong(), eq("BASELINE"), isNull(), isNull())).thenReturn(List.of(1003L));
        when(runs.createRuns(anyLong(), anyLong(), any(), anyLong(), anyLong(), anyLong(), eq("REGRESSION"), eq(TEST), any())).thenReturn(List.of(2001L, 2002L, 2003L));
        // Sau khi tạo baseline còn thiếu, test đọc lại để có đủ dòng baseline cho cả ba biến thể.
        when(db.list(contains("FROM simulation_runs WHERE id IN"), any(Object[].class))).thenReturn(List.of(
                row("id", 1003L, "scenario_version_id", 103L, "status", "PENDING", "random_seed", 48_103L,
                        "simulator_version", RunService.KINEMATIC_SIMULATOR, "carla_vehicle_model_id", VEHICLE)));

        long id = service(runs, queries, families).createTest(PROJECT, USER, CANDIDATE, SCENARIO, true, true, null, null);

        assertThat(id).isEqualTo(TEST);
        ArgumentCaptor<List<Row>> missing = ArgumentCaptor.forClass(List.class);
        verify(runs).createRuns(eq(PROJECT), eq(SCENARIO), missing.capture(), eq(VEHICLE), eq(BASELINE), eq(USER), eq("BASELINE"), isNull(), isNull());
        assertThat(missing.getValue()).extracting(r -> r.lng("id")).containsExactly(103L);

        ArgumentCaptor<Map<Long, Row>> baselineRuns = ArgumentCaptor.forClass(Map.class);
        ArgumentCaptor<List<Row>> variants = ArgumentCaptor.forClass(List.class);
        verify(runs).createRuns(eq(PROJECT), eq(SCENARIO), variants.capture(), eq(VEHICLE), eq(CANDIDATE), eq(USER), eq("REGRESSION"), eq(TEST), baselineRuns.capture());
        assertThat(variants.getValue()).extracting(r -> r.lng("id")).containsExactly(101L, 102L, 103L);
        assertThat(baselineRuns.getValue()).containsOnlyKeys(101L, 102L, 103L);
        assertThat(baselineRuns.getValue().get(101L).lng("id")).isEqualTo(1001L);
        assertThat(baselineRuns.getValue().get(103L).lng("id")).isEqualTo(1003L);
        verify(runs).dispatch(List.of(1003L, 2001L, 2002L, 2003L));
    }

    @Test
    void theBaselineLookupIsScopedToTheConfiguredSimulatorAndVehicle() {
        Queries queries = mock(Queries.class);
        FamilyService families = mock(FamilyService.class);
        RunService runs = mock(RunService.class);
        arrangeFamily(queries, families);
        when(runs.configuredSimulator()).thenReturn(CARLA);
        List<Object[]> lookups = new ArrayList<>();
        when(db.list(contains("FROM simulation_runs WHERE aeb_version_id = ?"), any(Object[].class))).thenAnswer(inv -> {
            lookups.add(inv.getArguments());
            return List.of();
        });

        service(runs, queries, families).preview(PROJECT, SCENARIO);

        // Hai tham số cuối của truy vấn baseline là bộ mô phỏng đang cấu hình rồi xe đang dùng: đổi sang CARLA / đổi xe thì
        // baseline cũ không được ghép; MySQL còn ép lại bằng fk_sr_baseline / fk_sr_regression.
        assertThat(lookups).isNotEmpty();
        for (Object[] a : lookups) {
            assertThat(a[a.length - 2]).isEqualTo(CARLA);
            assertThat(a[a.length - 1]).isEqualTo(VEHICLE);
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void thePreviewMatchesTheScenarioSetOfTheTestThatIsCreated() {
        Queries queries = mock(Queries.class);
        FamilyService families = mock(FamilyService.class);
        RunService runs = mock(RunService.class);
        arrangeFamily(queries, families);
        when(runs.configuredSimulator()).thenReturn(RunService.KINEMATIC_SIMULATOR);
        List<Object[]> inserts = new ArrayList<>();
        when(db.insert(startsWith("INSERT INTO regression_tests"), any(Object[].class))).thenAnswer(inv -> {
            inserts.add(inv.getArguments());
            return TEST;
        });
        when(runs.createRuns(anyLong(), anyLong(), any(), anyLong(), anyLong(), anyLong(), any(), any(), any())).thenReturn(List.of());
        when(db.list(contains("FROM simulation_runs WHERE id IN"), any(Object[].class))).thenReturn(List.of());
        RegressionService service = service(runs, queries, families);

        Map<String, Object> preview = service.preview(PROJECT, SCENARIO);
        service.createTest(PROJECT, USER, CANDIDATE, SCENARIO, true, true, null, null);

        Map<String, Object> passCriteria = (Map<String, Object>) inserts.get(0)[8];
        Map<String, Object> scenarioSet = Json.asMap(passCriteria.get("scenario_set"));
        assertThat(scenarioSet.get("variant_count")).isEqualTo(preview.get("variant_count")).isEqualTo(3);
        assertThat(scenarioSet.get("old_critical_count")).isEqualTo(preview.get("old_critical_count")).isEqualTo(1);
        assertThat(preview.get("baseline_runs_existing")).isEqualTo(2);
    }

    @Test
    void anEmptyScenarioSetIsRefused() {
        Queries queries = mock(Queries.class);
        FamilyService families = mock(FamilyService.class);
        RunService runs = mock(RunService.class);
        arrangeFamily(queries, families);
        when(runs.configuredSimulator()).thenReturn(RunService.KINEMATIC_SIMULATOR);
        when(db.list(startsWith("SELECT r.scenario_version_id FROM simulation_runs r JOIN failures"), any(Object[].class))).thenReturn(List.of());

        assertThatThrownBy(() -> service(runs, queries, families).createTest(PROJECT, USER, CANDIDATE, SCENARIO, true, false, null, null))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("rỗng");
        verify(db, never()).insert(startsWith("INSERT INTO regression_tests"), any(Object[].class));
    }

    // ------------------------------------------------------------------ tryFinalize: run hỏng / bị dừng

    @Test
    @SuppressWarnings("unchecked")
    void aStoppedRunMakesTheTestFailWithoutVerdictOrRecommendation() {
        TransactionTemplate tx = mock(TransactionTemplate.class);
        doAnswer(inv -> {
            ((Consumer<TransactionStatus>) inv.getArgument(0)).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        RegressionService service = new RegressionService(db, mock(Queries.class), mock(FamilyService.class), mock(RunService.class), tx);
        Map<String, Object> test = new LinkedHashMap<>(Map.of("id", TEST, "execution_status", "RUNNING", "project_id", PROJECT));
        when(db.first(startsWith("SELECT * FROM regression_tests"), any(Object[].class))).thenReturn(new Row(test));
        when(db.list(contains("FROM simulation_runs WHERE regression_test_id = ?"), any(Object[].class))).thenReturn(List.of(
                row("id", 2001L, "scenario_version_id", 101L, "status", "STOPPED", "baseline_run_id", 1001L)));
        when(db.list(startsWith("SELECT id, status, collision_occurred"), any(Object[].class))).thenReturn(List.of(
                row("id", 2001L, "status", "STOPPED"), row("id", 1001L, "status", "COMPLETED", "collision_occurred", false)));

        service.tryFinalize(TEST);

        verify(db).update(contains("SET execution_status = 'FAILED'"), any(Object[].class));
        verify(db, never()).update(contains("SET execution_status = 'COMPLETED'"), any(Object[].class));
        verify(db, never()).insert(startsWith("INSERT INTO engineering_recommendations"), any(Object[].class));
        verify(db, never()).batchInsert(startsWith("INSERT INTO regression_test_items"), any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void aTestWithRunsStillWaitingIsNotFinalized() {
        TransactionTemplate tx = mock(TransactionTemplate.class);
        doAnswer(inv -> {
            ((Consumer<TransactionStatus>) inv.getArgument(0)).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        RegressionService service = new RegressionService(db, mock(Queries.class), mock(FamilyService.class), mock(RunService.class), tx);
        when(db.first(startsWith("SELECT * FROM regression_tests"), any(Object[].class)))
                .thenReturn(row("id", TEST, "execution_status", "RUNNING", "project_id", PROJECT));
        when(db.list(contains("FROM simulation_runs WHERE regression_test_id = ?"), any(Object[].class))).thenReturn(List.of(
                row("id", 2001L, "scenario_version_id", 101L, "status", "PENDING", "baseline_run_id", 1001L)));
        when(db.list(startsWith("SELECT id, status, collision_occurred"), any(Object[].class))).thenReturn(List.of(
                row("id", 2001L, "status", "PENDING"), row("id", 1001L, "status", "COMPLETED", "collision_occurred", false)));

        service.tryFinalize(TEST);

        verify(db, never()).update(contains("SET execution_status"), any(Object[].class));
    }
}
