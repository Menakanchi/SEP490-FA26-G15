package com.vsos.backend.service.scenario;

import com.vsos.backend.common.Json;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.security.ProjectAccess;
import com.vsos.backend.service.regression.RegressionService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ScenarioViewServiceTest {
    @Test
    void familyKeepsAllPurposeCountsAndSeparatesBaselineProgressBySimulator() {
        Db db = mock(Db.class);
        Queries queries = mock(Queries.class);
        ProjectAccess projects = mock(ProjectAccess.class);
        FamilyService families = mock(FamilyService.class);
        RegressionService regression = mock(RegressionService.class);
        when(projects.currentProject()).thenReturn(new Row(Json.obj("id", 1L, "carla_vehicle_model_id", 40L)));
        when(queries.baselineVersion(1L)).thenReturn(new Row(Json.obj("id", 30L, "label", "v1")));
        when(db.list(contains("SELECT * FROM scenarios"), eq(1L))).thenReturn(List.of(new Row(Json.obj("id", 10L))));
        when(families.baseVersions(10L)).thenReturn(List.of(new Row(Json.obj("id", 20L))));
        when(families.variantsOf(20L)).thenReturn(List.of());
        when(regression.criticalVariantIds(any(), anyList())).thenReturn(Set.of());
        when(db.list(contains("SELECT r.status, COUNT(*)"), eq(10L), eq(20L)))
                .thenReturn(List.of(new Row(Json.obj("status", "COMPLETED", "n", 12L))));
        when(db.list(contains("COUNT(DISTINCT"), eq(10L), eq(20L), eq(30L), eq(40L)))
                .thenReturn(List.of(
                        new Row(Json.obj("simulator_version", "vehicsim-kinematic-1.4", "completed_variants", 3L, "active_runs", 2L, "failed_runs", 1L)),
                        new Row(Json.obj("simulator_version", "carla-0.9.16-xosc15", "completed_variants", 1L, "active_runs", 0L, "failed_runs", 0L))));

        Map<String, Object> result = new ScenarioViewService(db, queries, families, regression, projects).families().getFirst();
        assertThat(result.get("runs")).isEqualTo(Map.of("COMPLETED", 12L));
        assertThat(result.get("baseline_progress")).isEqualTo(Map.of(
                "vehicsim-kinematic-1.4", Json.obj("completed_variants", 3L, "active_runs", 2L, "failed_runs", 1L),
                "carla-0.9.16-xosc15", Json.obj("completed_variants", 1L, "active_runs", 0L, "failed_runs", 0L)));
        verify(db).list(argThat(sql -> sql.contains("r.purpose = 'BASELINE'") && sql.contains("r.aeb_mode = 'ON'")
                && sql.contains("r.aeb_version_id = ?") && sql.contains("r.carla_vehicle_model_id = ?")
                && sql.contains("GROUP BY r.simulator_version")), eq(10L), eq(20L), eq(30L), eq(40L));
    }
}
