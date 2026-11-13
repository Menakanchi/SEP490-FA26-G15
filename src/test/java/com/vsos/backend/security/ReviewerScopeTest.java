package com.vsos.backend.security;

import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.repository.project.ProjectRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ReviewerScopeTest {
    private final Db db = mock(Db.class);
    private final ProjectRepository teamProjects = mock(ProjectRepository.class);
    private final ReviewerScope scope = new ReviewerScope(db);

    @AfterEach
    void clearUser() { SecurityContextHolder.clearContext(); }

    private ProjectAccess request(RoleCode role, String selected) {
        var user = new CustomUserDetails(User.builder().id(46L).email("qa@example.invalid").passwordHash("x").isActive(true)
                .role(Role.builder().code(role).name(role.name()).build()).build());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
        var request = new MockHttpServletRequest();
        if (selected != null) request.addHeader(ProjectAccess.PROJECT_HEADER, selected);
        return new ProjectAccess(request, new ProjectScope(request, teamProjects), scope);
    }

    @Test
    void defaultsToOwnProjectAndResolvesOnlyOnceWithoutLoadingVehicleOrContext() {
        Row own = new Row(Json.obj("id", 2L, "carla_vehicle_model_id", null));
        when(db.first(contains("WHERE m.user_id = ?"), eq(46L))).thenReturn(own, new Row(Json.obj("id", 3L)));
        ProjectAccess access = request(RoleCode.REVIEWER, null);
        assertThat(access.hasProject()).isTrue();
        assertThat(access.currentProject()).isSameAs(own);
        assertThat(access.currentProject()).isSameAs(own);
        verify(db).first(contains("WHERE m.user_id = ?"), eq(46L));
        verifyNoMoreInteractions(db);
    }

    @Test
    void explicitProjectDoesNotDriftWhenTheDefaultChangesAfterArchiving() {
        Row active = new Row(Json.obj("id", 2L, "workspace_status", "ACTIVE"));
        when(db.first(contains("WHERE m.user_id = ?"), eq(46L))).thenReturn(active, new Row(Json.obj("id", 3L)));
        long pinned = request(RoleCode.REVIEWER, null).currentProject().lng("id");
        Row archived = new Row(Json.obj("id", 2L, "workspace_status", "ARCHIVED"));
        when(db.first(contains("AND p.id = ?"), eq(46L), eq(pinned))).thenReturn(archived);
        ProjectAccess nextRequest = request(RoleCode.REVIEWER, String.valueOf(pinned));
        assertThat(nextRequest.currentProject()).isSameAs(archived);
        assertThat(nextRequest.explicitProjectId()).isEqualTo(2L);
        verify(db).first(contains("WHERE m.user_id = ?"), eq(46L));
    }

    @Test
    void foreignOrMissingProjectsNeverFallBackAndCacheTheDenial() {
        for (String selected : new String[]{null, "1", "9999"}) {
            ProjectAccess access = request(RoleCode.REVIEWER, selected);
            assertThat(access.hasProject()).isFalse();
            assertThatThrownBy(access::currentProject).isInstanceOf(NotFoundException.class);
        }
        verify(db, never()).first(contains("SELECT * FROM projects WHERE status = 'ACTIVE'"));
        verify(db, times(3)).first(anyString(), any(Object[].class));
    }

    @Test
    void decisionsWithoutPinnedProjectAreRefusedBeforeQuerying() {
        assertThatThrownBy(request(RoleCode.REVIEWER, null)::explicitProjectId)
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("chọn project");
        verifyNoInteractions(db);
    }

    @Test
    void malformedHeadersAreRejectedAndOtherRolesStillUseTheTeamProject() {
        for (String value : new String[]{"", "-1", "0", "1 OR 1=1", "99999999999999999999999"}) {
            assertThatThrownBy(request(RoleCode.REVIEWER, value)::currentProject).isInstanceOf(InvalidRequestException.class);
        }
        verifyNoInteractions(db);
        when(teamProjects.firstActiveTeamProject()).thenReturn(new Row(Json.obj("id", 1L)));
        assertThat(request(RoleCode.ENGINEER, "99").currentProject().lng("id")).isEqualTo(1L);
    }

    @Test
    void missingAuthenticationCannotSilentlySelectTheGlobalProject() {
        var request = new MockHttpServletRequest();
        var access = new ProjectAccess(request, new ProjectScope(request, teamProjects), scope);
        assertThatThrownBy(access::currentProject).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verifyNoInteractions(db, teamProjects);
    }
}
