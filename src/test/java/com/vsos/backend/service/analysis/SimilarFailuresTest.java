package com.vsos.backend.service.analysis;

import com.vsos.backend.common.Json;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.security.ProjectAccess;
import com.vsos.backend.service.scenario.FamilyService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** "Ca lỗi tương tự" của màn chi tiết run: cùng chế độ AEB và phân biệt hành vi người đi bộ (băng qua / dừng ở lề). */
class SimilarFailuresTest {
    private final Db db = mock(Db.class);
    private final AnalysisViewService views = new AnalysisViewService(db, mock(Queries.class), mock(FamilyService.class), mock(ProjectAccess.class));

    private static Map<String, Object> config(boolean stopsAtCurb) {
        return Json.obj("motif", "pedestrian_crossing", "ego_speed_kmh", 40.0, "trigger_distance_m", 20.0, "pedestrian_speed_mps", 1.5,
                "stops_at_curb", stopsAtCurb, "weather", "CLEAR", "time_of_day", "DAY");
    }

    private static Row failureRow(long runId, boolean stopsAtCurb) {
        return new Row(Json.obj("failure_id", runId, "run_id", runId, "scenario_id", 42L, "scenario_code", "PX", "scenario_name", "PX",
                "version_no", runId, "aeb_version_id", 7L, "aeb_version_no", 1L, "run_config_json", Json.write(config(stopsAtCurb)),
                "collision_occurred", false, "is_false_positive", false, "failure_type", "X", "severity", "HIGH"));
    }

    private AnalysisViewService.RunBundle bundle(String aebMode) {
        Map<String, Object> columns = Json.obj("id", 1L, "scenario_id", 42L, "aeb_version_id", 7L,
                "carla_vehicle_model_id", 5L, "simulator_version", "carla-0.9.16-xosc16", "fixed_delta_seconds", .01,
                "run_config_json", Json.write(config(false)));
        if (aebMode != null) columns.put("aeb_mode", aebMode);
        return new AnalysisViewService.RunBundle(new Row(columns), null, null, null, null, null, Json.obj("chain", List.of()));
    }

    @Test
    void offRunsAreNeverMixedIntoTheCandidatesOfAnAebOnRun() {
        when(db.list(contains("FROM failures f"), any(Object[].class))).thenReturn(List.of());

        views.similarFailures(1L, bundle("ON"), 3);

        verify(db).list(contains("r.aeb_mode = ?"), eq(1L), eq(42L), eq("ON"), eq(7L), eq(5L), eq("carla-0.9.16-xosc16"), eq(.01));
    }

    @Test
    void anOffRunIsComparedOnlyWithOtherOffRuns() {
        when(db.list(contains("FROM failures f"), any(Object[].class))).thenReturn(List.of());

        views.similarFailures(1L, bundle("OFF"), 3);

        verify(db).list(contains("r.aeb_mode = ?"), eq(1L), eq(42L), eq("OFF"), eq(7L), eq(5L), eq("carla-0.9.16-xosc16"), eq(.01));
    }

    @Test
    void aMissingModeIsTreatedAsOn() {
        when(db.list(contains("FROM failures f"), any(Object[].class))).thenReturn(List.of());

        views.similarFailures(1L, bundle(null), 3);

        verify(db).list(contains("r.aeb_mode = ?"), eq(1L), eq(42L), eq("ON"), eq(7L), eq(5L), eq("carla-0.9.16-xosc16"), eq(.01));
    }

    @Test
    void aCrossingCaseIsNotRankedAsIdenticalToAStopAtCurbCase() {
        when(db.list(contains("FROM failures f"), any(Object[].class)))
                .thenReturn(List.of(failureRow(10, true), failureRow(11, false)));

        var similar = views.similarFailures(1L, bundle("ON"), 3);

        // run xem có stops_at_curb=false: ca băng qua (#11) phải đứng trước ca dừng ở lề (#10) và đạt 100 %.
        assertThat(similar).extracting(s -> s.get("run_id")).containsExactly(11L, 10L);
        assertThat(similar.get(0).get("similarity_pct")).isEqualTo(100L);
        assertThat((Long) similar.get(1).get("similarity_pct")).isLessThan(100L);
    }

    @Test
    void leadVehicleSimilarityUsesLeadParametersAndLaneAlignment() {
        Map<String, Object> targetMe = Json.obj("motif", "lead_vehicle", "category", "CCRB", "ego_speed_kmh", 60.0,
                "target_speed_kmh", 40.0, "initial_distance_m", 20.0, "target_decel_mps2", -6.0, "lateral_overlap_pct", 100.0,
                "weather", "CLEAR", "time_of_day", "DAY");
        AnalysisViewService.RunBundle leadBundle = new AnalysisViewService.RunBundle(
                new Row(Json.obj("id", 1L, "scenario_id", 43L, "aeb_mode", "ON", "aeb_version_id", 7L,
                        "carla_vehicle_model_id", 5L, "simulator_version", "carla-0.9.16-xosc16", "fixed_delta_seconds", .01,
                        "run_config_json", Json.write(targetMe))),
                null, null, null, null, null, Json.obj("chain", List.of()));

        Row exact = new Row(Json.obj("failure_id", 21L, "run_id", 21L, "scenario_id", 43L, "scenario_code", "LR", "scenario_name", "LR",
                "version_no", 21L, "aeb_version_id", 7L, "aeb_version_no", 1L, "run_config_json", Json.write(targetMe),
                "collision_occurred", true, "is_false_positive", false, "failure_type", "X", "severity", "HIGH"));
        Map<String, Object> diffTarget = new java.util.LinkedHashMap<>(targetMe);
        diffTarget.put("target_speed_kmh", 10.0);
        diffTarget.put("initial_distance_m", 40.0);
        Row shifted = new Row(Json.obj("failure_id", 22L, "run_id", 22L, "scenario_id", 43L, "scenario_code", "LR", "scenario_name", "LR",
                "version_no", 22L, "aeb_version_id", 7L, "aeb_version_no", 1L, "run_config_json", Json.write(diffTarget),
                "collision_occurred", true, "is_false_positive", false, "failure_type", "X", "severity", "HIGH"));
        Map<String, Object> adjLane = new java.util.LinkedHashMap<>(targetMe);
        adjLane.put("lateral_overlap_pct", -100.0);
        Row adjacent = new Row(Json.obj("failure_id", 23L, "run_id", 23L, "scenario_id", 43L, "scenario_code", "LR", "scenario_name", "LR",
                "version_no", 23L, "aeb_version_id", 7L, "aeb_version_no", 1L, "run_config_json", Json.write(adjLane),
                "collision_occurred", false, "is_false_positive", true, "failure_type", "X", "severity", "HIGH"));

        when(db.list(contains("FROM failures f"), any(Object[].class))).thenReturn(List.of(adjacent, shifted, exact));

        var similar = views.similarFailures(1L, leadBundle, 3);

        assertThat(similar).extracting(s -> s.get("run_id")).containsExactly(21L, 22L, 23L);
        assertThat(similar.get(0).get("similarity_pct")).isEqualTo(100L);
        assertThat((Long) similar.get(1).get("similarity_pct")).isGreaterThan((Long) similar.get(2).get("similarity_pct"));
    }
}
