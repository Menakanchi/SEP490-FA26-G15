package com.vsos.backend.service.analysis;

import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.security.ProjectAccess;
import com.vsos.backend.service.scenario.FamilyService;
import com.vsos.core.aeb.AebParams;
import com.vsos.core.evaluation.Evaluation;
import com.vsos.core.simulation.*;
import org.junit.jupiter.api.Test;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.util.*;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Real core and read services, mocked persistence. Not HTTP, MySQL, CARLA runtime or real-world validation. */
class AnalysisApiContractTest {
    private static final Path GOLDEN = Path.of("src/test/resources/analysis/analysis-api-contract.json.gz");

    @Test
    void productionReadServicesMatchTheFixtureConsumedByFrontendTests() throws Exception {
        var late = new AebParams(1.2, .15, 8, 20);
        var quiet = new AebParams(.5, .15, 8, 20);
        var early = new AebParams(2.5, .15, 8, 20);
        var collision = Simulator.simulate(new CrossingCase(70, 40, 1.5, false, "CLEAR", "DAY", null), late, 3);
        var safe = Simulator.simulate(new CrossingCase(50, 30, 1.5, true, "CLEAR", "DAY", null), quiet, 9);
        var lead = LeadVehicleSimulator.simulate(new LeadVehicleCase("CCRS", 50, 0, 40, null, null, "CLEAR", "DAY", null),
                AebParams.DEFAULT, 7, VehicleSpec.DEFAULT);
        assertThat(collision.metrics()).containsEntry("collision", true);
        assertThat(safe.metrics()).containsEntry("collision", false).containsEntry("brake_onset_t", null);
        assertThat(lead.endReason()).isEqualTo("EGO_STOPPED");
        var actual = Json.obj("kind", "OFFLINE_KINEMATIC_SERVICE_CONTRACT", "schema", 1,
                "limitation", "Real Java core/read services; persistence mocked; no CARLA/HTTP/DB/real-world validation.",
                "cases", List.of(project(101, "CP_CROSSING", collision, late, 3),
                        project(102, "CP_CROSSING", safe, quiet, 9),
                        project(103, "CCRS", lead, AebParams.DEFAULT, 7),
                        project(104, "CP_CROSSING", Simulator.simulate(new CrossingCase(70, 40, 1.5, false, "CLEAR", "DAY", null), early, 3), early, 3)));
        byte[] bytes = Json.write(actual).getBytes(StandardCharsets.UTF_8);
        // Diagnostic output is ignored. Updating the reviewed fixture is an explicit operation, never normal test setup.
        Files.createDirectories(Path.of("target/analysis-contract"));
        Files.write(Path.of("target/analysis-contract/actual.json"), bytes);
        if (Boolean.getBoolean("analysis.contract.update")) {
            Files.createDirectories(GOLDEN.getParent());
            try (var gzip = new GZIPOutputStream(Files.newOutputStream(GOLDEN))) { gzip.write(bytes); }
        }
        assertThat(GOLDEN).as("Generate once with -Danalysis.contract.update=true; review any contract diff").exists();
        try (var gzip = new GZIPInputStream(Files.newInputStream(GOLDEN))) {
            var expected = Json.parseMap(new String(gzip.readAllBytes(), StandardCharsets.UTF_8));
            assertThat(Json.parseMap(new String(bytes, StandardCharsets.UTF_8))).isEqualTo(expected);
        }
    }

    private Map<String, Object> project(long id, String category, SimulationOutcome outcome, AebParams params, long seed) {
        Db db = mock(Db.class);
        Queries queries = mock(Queries.class);
        ProjectAccess projects = mock(ProjectAccess.class);
        var views = new AnalysisViewService(db, queries, mock(FamilyService.class), projects);
        var service = new AnalysisService(db, queries, views, projects);
        var evaluation = Evaluation.evaluate(outcome, params);
        Map<String, Object> ev = evaluation.toDocument(), m = outcome.metrics();
        Map<String, Object> raw = new LinkedHashMap<>(outcome.asDict());
        raw.put("outcome", evaluation.outcome());
        raw.put("headline", evaluation.headline());
        raw.put("chain", ev.get("chain"));
        Map<String, Object> ir = new LinkedHashMap<>(outcome.caseDoc());
        ir.put("category", category);
        long scenarioId = category.equals("CP_CROSSING") ? 42L : 43L;
        long variantId = id == 104L ? 301L : 200L + id;
        long versionId = id == 104L ? 8L : 7L;
        long versionNo = id == 104L ? 101L : id;
        Map<String, Object> columns = new LinkedHashMap<>(evaluation.aebResult());
        columns.putAll(Json.obj("id", id, "project_id", 1L, "scenario_id", scenarioId, "scenario_version_id", variantId,
                "aeb_version_id", versionId, "carla_vehicle_model_id", 2L, "random_seed", seed, "purpose", "BASELINE",
                "status", "COMPLETED", "end_reason", outcome.endReason(), "simulator_version", "vehicsim-kinematic-1.0",
                "fixed_delta_seconds", .05, "simulated_duration_s", outcome.durationS(), "verdict", evaluation.verdict(),
                "collision_occurred", m.get("collision"), "is_false_positive", evaluation.aebResult().get("false_activation"),
                "is_false_negative", evaluation.aebResult().get("missed_activation"),
                "first_detection_time_s", m.get("first_detection_t"), "first_detection_distance_m", m.get("first_detection_distance_m"),
                "aeb_activation_time_s", m.get("aeb_decision_t"), "fcw_time_s", m.get("fcw_t"),
                "braking_response_time_s", m.get("braking_latency_s"), "aeb_activated", m.get("aeb_decision_t") != null,
                "brake_onset", m.get("brake_onset_t"), "trace_frames", outcome.frames().size(),
                "telemetry_json", Json.write(raw), "run_config_json", Json.write(ir),
                "name", "Contract " + category, "code", category, "version_no", versionNo, "weather", "CLEAR", "time_of_day", "DAY",
                "queued_at", LocalDateTime.of(2026, 11, 17, 8, 0)));
        Row row = new Row(columns);
        when(projects.currentProject()).thenReturn(new Row(Json.obj("id", 1L)));
        when(db.first("SELECT * FROM simulation_runs WHERE id = ? AND project_id = ?", id, 1L)).thenReturn(row);
        when(db.first("SELECT * FROM scenarios WHERE id = ?", scenarioId)).thenReturn(new Row(Json.obj("id", scenarioId, "name", "Contract " + category, "code", category)));
        when(db.first("SELECT * FROM scenario_versions WHERE id = ?", variantId)).thenReturn(new Row(Json.obj("id", variantId, "version_no", versionNo)));
        when(db.first("SELECT * FROM aeb_versions WHERE id = ?", versionId)).thenReturn(new Row(Json.obj("id", versionId, "label", "Contract v" + versionId)));
        when(queries.vehicleById(2L)).thenReturn(new Row(Json.obj("id", 2L, "display_name", "Contract vehicle",
                "length_m", VehicleSpec.DEFAULT.lengthM(), "width_m", VehicleSpec.DEFAULT.widthM())));
        when(db.first("SELECT * FROM failures WHERE simulation_run_id = ?", id)).thenReturn(evaluation.failure() == null ? null : new Row(evaluation.failure()));
        Map<String, Double> codes = new LinkedHashMap<>();
        codes.put("TTC_THRESHOLD", params.ttcThreshold()); codes.put("BRAKE_ACTIVATION_DELAY", params.brakeActivationDelay());
        codes.put("MAX_DECELERATION", params.maxDeceleration()); codes.put("BRAKE_BUILDUP_RATE", params.brakeBuildupRate());
        when(queries.aebValues(versionId)).thenReturn(codes);
        when(queries.parameterCatalog()).thenReturn(codes.keySet().stream().map(code -> new Row(Json.obj("code", code, "name", code,
                "unit", code.equals("MAX_DECELERATION") ? "m/s2" : code.equals("BRAKE_BUILDUP_RATE") ? "m/s3" : "s"))).toList());
        when(db.list(startsWith(AnalysisService.SELECT.replace(" AND r.purpose = 'BASELINE'", "")
                .replace(" AND r.aeb_mode = 'ON'", "")), any(Object[].class))).thenReturn(List.of(row));
        Map<String, Object> inspection = service.inspection(id);
        Map<String, Object> detail = Json.asMap(inspection.get("detail")), playback = views.playback(id);
        assertThat(detail).containsEntry("run_id", id).containsEntry("simulator", "vehicsim-kinematic-1.0");
        assertThat(Json.asMap(detail.get("metrics"))).containsEntry("metric_source", "SIMULATOR_RESULT")
                .containsEntry("impact_speed_mps", m.get("impact_speed_mps")).containsEntry("brake_onset_t", m.get("brake_onset_t"))
                .containsEntry("rms_jerk_mps3", m.get("rms_jerk_mps3"));
        assertThat(playback.get("frames")).isEqualTo(Json.parseMap(Json.write(raw)).get("frames"));
        assertThat(detail.get("events")).isEqualTo(playback.get("events"));
        verify(db, times(2)).first("SELECT * FROM simulation_runs WHERE id = ? AND project_id = ?", id, 1L);
        return Json.obj("id", id, "category", category, "recording", raw, "inspection", inspection, "playback", playback);
    }

    @Test
    void projectAndCompletionGatesRejectMissingOrUnfinishedPlayback() {
        Db db = mock(Db.class);
        ProjectAccess projects = mock(ProjectAccess.class);
        var views = new AnalysisViewService(db, mock(Queries.class), mock(FamilyService.class), projects);
        when(projects.currentProject()).thenReturn(new Row(Json.obj("id", 2L)));
        assertThatThrownBy(() -> views.playback(101)).isInstanceOf(Vs.NotFoundException.class);
        when(db.first("SELECT * FROM simulation_runs WHERE id = ? AND project_id = ?", 101L, 2L))
                .thenReturn(new Row(Json.obj("id", 101L, "status", "RUNNING")));
        assertThatThrownBy(() -> views.failureDetail(101)).isInstanceOf(Vs.NotFoundException.class);
    }
}
