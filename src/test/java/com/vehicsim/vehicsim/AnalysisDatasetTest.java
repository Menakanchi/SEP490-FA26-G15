package com.vehicsim.vehicsim;

import com.vehicsim.service.RegressionService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AnalysisDatasetTest {

    private Db db;
    private Queries queries;
    private ViewsService service;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        queries = mock(Queries.class);
        FamilyService families = mock(FamilyService.class);
        RegressionService regression = mock(RegressionService.class);
        RunService runs = mock(RunService.class);
        service = new ViewsService(db, queries, families, regression, runs);

        when(queries.currentProject()).thenReturn(new Row(Json.obj("id", 1L)));
        when(queries.baselineVersion(1L)).thenReturn(new Row(Json.obj("id", 4L, "version_no", 1L, "label", "v1.0")));
        when(db.first(eq("SELECT * FROM scenarios WHERE id = ? AND project_id = ?"), eq(8L), eq(1L)))
                .thenReturn(new Row(Json.obj("id", 8L, "project_id", 1L, "code", "PX", "name", "Crossing", "category", "CP_CROSSING")));
    }

    @Test
    void snapshotKeepsSafeVariantsAndMarksMissingRunsNotRun() {
        when(db.first(startsWith("SELECT carla_vehicle_model_id, simulator_version"), any(Object[].class)))
                .thenReturn(new Row(Json.obj("carla_vehicle_model_id", 3L, "simulator_version", "vehicsim-kinematic-1.0", "completed_runs", 1L)));
        when(db.list(startsWith("SELECT id, version_no, source, scenario_ir_json FROM scenario_versions WHERE scenario_id = ? AND source = 'GENERATED' ORDER BY version_no"), eq(8L)))
                .thenReturn(List.of(
                        variant(11L, 1L, "GENERATED", false),
                        variant(12L, 2L, "GENERATED", true),
                        variant(13L, 3L, "GENERATED", false)));
        when(db.first(startsWith("SELECT id, random_seed, simulator_type"), any(Object[].class))).thenAnswer(invocation -> {
            Object versionIdArg = invocation.getArgument(3);
            Long versionId = ((Number) versionIdArg).longValue();
            if (versionId == 11L) return run(101L, 48011L, false, "PASS");
            if (versionId == 12L) return run(102L, 48012L, true, "FAIL");
            return null;
        });

        Map<String, Object> snapshot = service.analysisDataset(8L);
        Map<String, Object> counts = Json.asMap(snapshot.get("counts"));
        List<Object> variants = Json.asList(snapshot.get("variants"));

        assertThat(counts).containsEntry("total", 3).containsEntry("completed", 2L).containsEntry("not_run", 1L)
                .containsEntry("classified", 2L).containsEntry("unclassified", 0L)
                .containsEntry("failures", 1L).containsEntry("safe", 1L);
        assertThat(variants).hasSize(3);
        assertThat(Json.asMap(variants.get(0))).containsEntry("status", "COMPLETED").containsEntry("run_id", 101L).containsEntry("seed", 48011L);
        assertThat(Json.asMap(variants.get(1))).containsEntry("status", "COMPLETED").containsEntry("run_id", 102L);
        assertThat(Json.asMap(variants.get(2))).containsEntry("status", "NOT_RUN").containsEntry("run_id", null).containsEntry("seed", null).containsEntry("metrics", null);
        verify(db, org.mockito.Mockito.times(3)).first(startsWith("SELECT id, random_seed, simulator_type"), any(Object[].class));
    }

    @Test
    void snapshotWithoutCompletedBaselineRunReturnsNotRunRowsAndNoMetrics() {
        when(db.first(startsWith("SELECT carla_vehicle_model_id, simulator_version"), any(Object[].class))).thenReturn(null);
        when(db.list(startsWith("SELECT id, version_no, source, scenario_ir_json FROM scenario_versions WHERE scenario_id = ? AND source = 'GENERATED' ORDER BY version_no"), eq(8L)))
                .thenReturn(List.of(variant(11L, 1L, "GENERATED", false)));

        Map<String, Object> snapshot = service.analysisDataset(8L);
        Map<String, Object> counts = Json.asMap(snapshot.get("counts"));
        Map<String, Object> variant = Json.asMap(Json.asList(snapshot.get("variants")).get(0));

        assertThat(snapshot.get("reference")).isNull();
        assertThat(counts).containsEntry("completed", 0L).containsEntry("not_run", 1L).containsEntry("safe", 0L);
        assertThat(variant).containsEntry("status", "NOT_RUN").containsEntry("run_id", null).containsEntry("metrics", null);
    }

    @Test
    void nearMissIsNotCountedAsSafeEvenWhenTheRunVerdictIsPass() {
        when(db.first(startsWith("SELECT carla_vehicle_model_id, simulator_version"), any(Object[].class)))
                .thenReturn(new Row(Json.obj("carla_vehicle_model_id", 3L, "simulator_version", "vehicsim-kinematic-1.0")));
        when(db.list(startsWith("SELECT id, version_no, source, scenario_ir_json FROM scenario_versions WHERE scenario_id = ? AND source = 'GENERATED' ORDER BY version_no"), eq(8L)))
                .thenReturn(List.of(variant(11L, 1L, "GENERATED", false)));
        Map<String, Object> data = new java.util.LinkedHashMap<>(run(101L, 48011L, false, "PASS").asMap());
        data.put("min_ttc_s", 0.5);
        when(db.first(startsWith("SELECT id, random_seed, simulator_type"), any(Object[].class)))
                .thenReturn(new Row(data));
        Map<String, Object> counts = Json.asMap(service.analysisDataset(8L).get("counts"));
        assertThat(counts).containsEntry("safe", 0L).containsEntry("failures", 1L);
    }

    private static Row variant(long id, long version, String source, boolean stopsAtCurb) {
        return new Row(Json.obj("id", id, "version_no", version, "source", source,
                "scenario_ir_json", Json.write(Json.obj("motif", "pedestrian_crossing", "ego_speed_kmh", 40,
                        "trigger_distance_m", 30, "pedestrian_speed_mps", 1.4, "stops_at_curb", stopsAtCurb,
                        "weather", "CLEAR", "time_of_day", "DAY"))));
    }

    private static Row run(long id, long seed, boolean collision, String verdict) {
        return new Row(Json.obj("id", id, "random_seed", seed, "status", "COMPLETED", "verdict", verdict,
                "end_reason", collision ? "COLLISION" : "EGO_STOPPED", "collision_occurred", collision,
                "is_false_positive", false, "is_false_negative", false, "rms_jerk_mps3", 3.2,
                "impact_speed_mps", collision ? 2.0 : null, "stopping_distance_m", 10.0,
                "min_distance_m", collision ? 0.0 : 2.0, "min_ttc_s", collision ? 0.0 : 1.5,
                "max_deceleration_mps2", 5.0, "mean_deceleration_mps2", 4.0, "aeb_activation_time_s", 1.2));
    }
}
