package com.vsos.backend.service.system;

import com.vsos.backend.common.Json;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.security.ProjectAccess;
import com.vsos.backend.service.simulation.RunService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class SystemViewServiceTest {
    @Test
    void projectDiscoveryDoesNotNeedAValidCurrentSelection() {
        ProjectAccess projects = mock(ProjectAccess.class);
        when(projects.reviewerProjects()).thenReturn(java.util.List.of(new Row(Json.obj(
                "id", 2L, "name", "QA", "workspace_name", "WS", "status", "ACTIVE", "workspace_status", "ACTIVE"))));
        var available = new SystemViewService(mock(Db.class), mock(Queries.class), mock(RunService.class), projects)
                .reviewerProjects();
        assertThat(available).singleElement().satisfies(p -> assertThat(p).containsEntry("id", 2L).containsEntry("can_decide", true));
        verify(projects, never()).currentProject();
    }

    @Test
    void aMemberProjectWithoutSelectedVehicleStillHasAReadableContextAndReviewPermission() {
        Db db = mock(Db.class);
        Queries queries = mock(Queries.class);
        ProjectAccess projects = mock(ProjectAccess.class);
        RunService runs = mock(RunService.class);
        when(projects.currentProject()).thenReturn(new Row(Json.obj("id", 2L, "name", "QA", "workspace_id", 5L,
                "status", "ACTIVE", "carla_vehicle_model_id", null)));
        when(db.first(anyString(), eq(5L))).thenReturn(new Row(Json.obj("id", 5L, "name", "WS", "status", "ACTIVE")));
        var context = new SystemViewService(db, queries, runs, projects).context();
        assertThat(context).containsEntry("vehicle", null).containsEntry("reviewer_can_decide", true);
        verify(queries, never()).activeVehicle(anyLong());
    }
}
