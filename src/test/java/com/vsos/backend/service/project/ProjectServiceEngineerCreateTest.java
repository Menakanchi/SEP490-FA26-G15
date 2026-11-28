package com.vsos.backend.service.project;

import com.vsos.backend.dto.project.ProjectDtos.ProjectItem;
import com.vsos.backend.dto.project.ProjectDtos.ProjectRequest;
import com.vsos.backend.exception.project.ProjectError;
import com.vsos.backend.exception.project.ProjectException;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.repository.project.ProjectRepository;
import com.vsos.backend.repository.regression.RegressionRepository;
import com.vsos.backend.service.simulation.RunService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** ADR-064: Kỹ sư tạo project của workspace mình là thành viên; Experiencer vẫn tạo project cá nhân; role khác không tạo được. */
class ProjectServiceEngineerCreateTest {

    private static final long ENGINEER = 52L;
    private static final long WORKSPACE = 6L;
    private static final long PROJECT = 9L;
    private static final long VEHICLE = 1L;

    private ProjectRepository projects;
    private ProjectService service;

    @BeforeEach
    void setUp() {
        projects = mock(ProjectRepository.class);
        RunService runs = mock(RunService.class);
        service = new ProjectService(projects, runs, mock(RegressionRepository.class));
        when(runs.configuredSimulator()).thenReturn("vehicsim-kinematic-1.4");
        when(projects.supportedVehicle(isNull())).thenReturn(VEHICLE);
        when(projects.lockActiveWorkspaceMember(ENGINEER, WORKSPACE)).thenReturn(true);
        when(projects.insertInWorkspace(eq(WORKSPACE), anyString(), any(), eq(ENGINEER), anyLong(), any())).thenReturn(PROJECT);
        when(projects.find(PROJECT)).thenReturn(savedProject());
        when(projects.journeySummary(PROJECT)).thenReturn(emptyJourney());
    }

    @Test
    void anEngineerCreatesAProjectInItsOwnActiveWorkspace() {
        ProjectItem created = service.create(ENGINEER, "ENGINEER", new ProjectRequest("  Thử AEB đêm  ", "  mô tả  ", null, WORKSPACE));

        assertThat(created.id()).isEqualTo(PROJECT);
        verify(projects).insertInWorkspace(eq(WORKSPACE), eq("Thử AEB đêm"), eq("mô tả"), eq(ENGINEER), eq(VEHICLE), any());
        verify(projects, never()).insert(anyString(), any(), anyLong(), anyLong(), any());
        verify(projects, never()).existingName(anyLong(), anyString(), anyLong());
    }

    @Test
    void theNameMustBeUniqueInsideTheWorkspaceNotJustForTheCreator() {
        when(projects.existingNameInWorkspace(WORKSPACE, "Thử AEB đêm", 0)).thenReturn("Thử AEB đêm");

        assertRejected(new ProjectRequest("Thử AEB đêm", null, null, WORKSPACE), ProjectError.NAME_DUPLICATE_WORKSPACE);
    }

    @Test
    void anEngineerMustNameTheWorkspace() {
        assertRejected(new ProjectRequest("Dự án", null, null, null), ProjectError.WORKSPACE_REQUIRED);
        verify(projects, never()).lockActiveWorkspaceMember(anyLong(), anyLong());
    }

    @Test
    void anEngineerCannotCreateInAWorkspaceItDoesNotBelongToOrThatIsArchived() {
        assertRejected(new ProjectRequest("Dự án", null, null, 99L), ProjectError.WORKSPACE_NOT_MEMBER);
        verify(projects).lockActiveWorkspaceMember(ENGINEER, 99L);
    }

    @Test
    void theNameDescriptionAndVehicleChecksStillApplyToWorkspaceProjects() {
        assertRejected(new ProjectRequest(" ", null, null, WORKSPACE), ProjectError.NAME_REQUIRED);
        assertRejected(new ProjectRequest("N".repeat(151), null, null, WORKSPACE), ProjectError.NAME_TOO_LONG);
        assertRejected(new ProjectRequest("Dự án", "d".repeat(2001), null, WORKSPACE), ProjectError.DESCRIPTION_TOO_LONG);
        when(projects.supportedVehicle(99L)).thenReturn(null);
        assertRejected(new ProjectRequest("Dự án", null, 99L, WORKSPACE), ProjectError.VEHICLE_NOT_FOUND);
    }

    @Test
    void anExperiencerStillCreatesPersonalProjectsAndMayNotPickAWorkspace() {
        when(projects.insert(eq("Thử"), any(), eq(7L), eq(VEHICLE), any())).thenReturn(PROJECT);
        when(projects.find(PROJECT)).thenReturn(savedProject(7L));

        assertThat(service.create(7L, "EXPERIENCER", new ProjectRequest("Thử", null, null, null)).id()).isEqualTo(PROJECT);
        assertThatThrownBy(() -> service.create(7L, "EXPERIENCER", new ProjectRequest("Thử", null, null, WORKSPACE)))
                .isInstanceOfSatisfying(ProjectException.class, e -> assertThat(e.getError()).isEqualTo(ProjectError.PERSONAL_HAS_NO_WORKSPACE));
    }

    @Test
    void otherRolesCannotCreateProjects() {
        for (String role : new String[]{"ADMIN", "MANAGER", "REVIEWER"}) {
            assertThatThrownBy(() -> service.create(3L, role, new ProjectRequest("Dự án", null, null, WORKSPACE)))
                    .isInstanceOfSatisfying(ProjectException.class, e -> assertThat(e.getError()).isEqualTo(ProjectError.CREATE_ROLE_NOT_ALLOWED));
        }
        verify(projects, never()).insertInWorkspace(any(), anyString(), any(), anyLong(), anyLong(), any());
        verify(projects, never()).insert(anyString(), any(), anyLong(), anyLong(), any());
    }

    @Test
    void workspaceProjectManagementRequiresCreatorAndActiveMembership() {
        when(projects.lockActiveWorkspaceMember(ENGINEER, WORKSPACE)).thenReturn(true);
        Row workspaceProject = workspaceProject(ENGINEER);
        when(projects.find(PROJECT)).thenReturn(workspaceProject);
        service.update(ENGINEER, "ENGINEER", PROJECT, new ProjectRequest("Tên mới", null, null, null));
        verify(projects).existingNameInWorkspace(WORKSPACE, "Tên mới", PROJECT);
        verify(projects).update(eq(PROJECT), eq("Tên mới"), any(), eq(VEHICLE), any());

        when(projects.find(PROJECT)).thenReturn(workspaceProject(99L));
        assertThatThrownBy(() -> service.delete(ENGINEER, "ENGINEER", PROJECT, "Thử AEB đêm"))
                .isInstanceOf(ProjectException.class);
        when(projects.find(PROJECT)).thenReturn(workspaceProject);
        when(projects.lockActiveWorkspaceMember(ENGINEER, WORKSPACE)).thenReturn(false);
        assertThatThrownBy(() -> service.archive(ENGINEER, "ENGINEER", PROJECT))
                .isInstanceOf(ProjectException.class);
        verify(projects, never()).delete(PROJECT);
        verify(projects, never()).setStatus(eq(PROJECT), anyString(), any());
    }

    private static Row workspaceProject(long owner) {
        Map<String, Object> values = new HashMap<>(Map.of("id", PROJECT, "name", "Thử AEB đêm", "status", "ACTIVE",
                "created_by_user_id", owner, "workspace_id", WORKSPACE, "carla_vehicle_model_id", VEHICLE,
                "vehicle_name", "Audi e-tron", "family_count", 0, "run_count", 0, "regression_count", 0));
        values.put("running_work", 0);
        values.put("created_date", LocalDateTime.of(2026, 11, 24, 9, 0));
        values.put("updated_at", LocalDateTime.of(2026, 11, 24, 9, 0));
        return new Row(values);
    }

    private void assertRejected(ProjectRequest request, ProjectError error) {
        assertThatThrownBy(() -> service.create(ENGINEER, "ENGINEER", request))
                .isInstanceOfSatisfying(ProjectException.class, e -> assertThat(e.getError()).isEqualTo(error));
        verify(projects, never()).insertInWorkspace(any(), anyString(), any(), anyLong(), anyLong(), any());
    }

    private static Row savedProject() {
        return savedProject(ENGINEER);
    }

    private static Row savedProject(long owner) {
        Map<String, Object> values = new HashMap<>(Map.of("id", PROJECT, "name", "Thử AEB đêm", "status", "ACTIVE",
                "created_by_user_id", owner, "carla_vehicle_model_id", VEHICLE, "vehicle_name", "Audi e-tron",
                "family_count", 0, "run_count", 0, "regression_count", 0, "running_work", 0));
        values.put("created_date", LocalDateTime.of(2026, 11, 24, 9, 0));
        values.put("updated_at", LocalDateTime.of(2026, 11, 24, 9, 0));
        return new Row(values);
    }

    private static Row emptyJourney() {
        Map<String, Object> values = new HashMap<>(Map.of("rounds", 1L, "candidates", 0L, "families", 0L, "datasets", 0L,
                "optimizations", 0L, "optimizations_running", 0L, "regressions_running", 0L, "regressions_completed", 0L));
        values.put("baseline_id", null);
        values.put("baseline_label", null);
        values.put("last_activity_at", LocalDateTime.of(2026, 11, 24, 9, 0));
        return new Row(values);
    }
}
