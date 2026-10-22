package com.vehicsim.vehicsim;

import com.vehicsim.service.RegressionService;

import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AnalysisSnapshotTest {
    private final Db db = mock(Db.class);
    private final Queries queries = mock(Queries.class);
    private final ViewsService views = spy(new ViewsService(db, queries, mock(FamilyService.class),
            mock(RegressionService.class), mock(RunService.class)));

    @Test
    void freezesReviewedDataAndPreservesSafeAndNotRunRows() {
        Map<String, Object> snapshot = Json.obj("preview_token", "token",
                "baseline", Json.obj("id", 4L), "variants", List.of(
                        Json.obj("run_id", 11L, "seed", 48011L, "status", "COMPLETED", "outcome", "SAFE"),
                        Json.obj("run_id", null, "seed", null, "status", "NOT_RUN")));
        doReturn(snapshot).when(views).analysisDataset(8L);
        when(queries.currentProject()).thenReturn(new Row(Json.obj("id", 1L)));
        when(db.insert(startsWith("INSERT INTO analysis_results "), any(Object[].class))).thenReturn(99L);
        Map<String, Object> result = views.freezeAnalysisDataset(8L, "token", 7L);
        assertThat(result).containsEntry("id", 99L).containsEntry("variants", snapshot.get("variants"));
        verify(db).insert(startsWith("INSERT INTO analysis_results "), eq(1L), eq(8L), eq(4L),
                eq("Baseline analysis dataset"), any(Map.class), eq(snapshot), eq(7L));
    }

    @Test
    void stalePreviewCannotBeSaved() {
        doReturn(Json.obj("preview_token", "new")).when(views).analysisDataset(8L);
        assertThatThrownBy(() -> views.freezeAnalysisDataset(8L, "old", 7L))
                .isInstanceOf(Vs.InvalidRequestException.class);
        verifyNoInteractions(db);
    }

    @Test
    void savedSnapshotSurvivesBaselineChangeWithoutSelectingNewRuns() {
        when(queries.currentProject()).thenReturn(new Row(Json.obj("id", 1L)));
        when(queries.baselineVersion(1L)).thenReturn(new Row(Json.obj("id", 9L)));
        Map<String, Object> original = Json.obj("baseline", Json.obj("id", 4L),
                "variants", List.of(Json.obj("run_id", 101L, "seed", 48011L)));
        when(db.first(startsWith("SELECT id, aeb_version_id, summary_json"), eq(99L), eq(1L)))
                .thenReturn(new Row(Json.obj("id", 99L, "aeb_version_id", 4L, "summary_json", Json.write(original))));
        Map<String, Object> result = views.savedAnalysisDataset(99L);
        assertThat(result).containsEntry("baseline_current", false);
        assertThat(Json.asMap(Json.asList(result.get("variants")).get(0)))
                .containsEntry("run_id", 101).containsEntry("seed", 48011);
        verify(views, never()).analysisDataset(anyLong());
    }

    @Test
    void datasetOutsideCurrentProjectIsNotFound() {
        when(queries.currentProject()).thenReturn(new Row(Json.obj("id", 2L)));
        assertThatThrownBy(() -> views.savedAnalysisDataset(99L)).isInstanceOf(Vs.NotFoundException.class);
        verify(db).first(startsWith("SELECT id, aeb_version_id, summary_json"), eq(99L), eq(2L));
    }

    @Test
    void motionTelemetryKeepsMissingPerceptionSeparateFromGroundTruth() {
        List<Map<String, Object>> points = ViewsService.motionTelemetry(List.of(
                Json.obj("t", 0.0, "ego_v", 0.0, "ego_a", -2.0, "ttc", null, "ttc_gt", 1.2),
                Json.obj("t", 0.1, "ego_a", Double.NaN),
                Json.obj("t", Double.NaN)));
        assertThat(points).hasSize(2);
        assertThat(points.get(0)).containsEntry("ego_speed_mps", 0.0).containsEntry("ego_accel_mps2", -2.0)
                .containsEntry("ttc_perceived_s", null).containsEntry("ttc_gt_s", 1.2);
        assertThat(points.get(1)).containsEntry("ego_accel_mps2", null);
    }
}
