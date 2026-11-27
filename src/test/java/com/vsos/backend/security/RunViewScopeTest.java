package com.vsos.backend.security;

import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.user.User;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Ai xem được lượt chạy nào: EXPERIENCER chỉ lượt của mình, workspace xem chung, ADMIN xem hết. */
class RunViewScopeTest {

    private static UserDetails as(RoleCode role, long id) {
        return new CustomUserDetails(User.builder().id(id).email("u" + id + "@example.com").isActive(true)
                .role(Role.builder().code(role).build()).build());
    }

    private static VehicSimAccess access(ProjectAccess project) {
        return new VehicSimAccess(null, null, project);
    }

    @Test
    void adminSeesEveryProjectAndNeedsNoOpenProject() {
        ProjectAccess project = mock(ProjectAccess.class);
        RunViewScope scope = access(project).runViewScope(as(RoleCode.ADMIN, 3));
        assertThat(scope).isEqualTo(RunViewScope.all());
        List<Object> args = new ArrayList<>();
        assertThat(scope.sql("", args)).isEmpty();
        assertThat(args).isEmpty();
        verify(project, never()).currentProject();
    }

    @Test
    void experiencerSeesOnlyRunsTheyStartedInTheOpenProject() {
        ProjectAccess project = mock(ProjectAccess.class);
        var row = new com.vsos.backend.repository.common.Row(java.util.Map.of("id", 7L));
        when(project.currentProject()).thenReturn(row);
        RunViewScope scope = access(project).runViewScope(as(RoleCode.EXPERIENCER, 18));
        assertThat(scope).isEqualTo(RunViewScope.own(7, 18));
        List<Object> args = new ArrayList<>();
        assertThat(scope.sql("r.", args)).isEqualTo(" AND r.project_id = ? AND r.created_by_user_id = ?");
        assertThat(args).containsExactly(7L, 18L);
    }

    @Test
    void engineerAndReviewerShareEveryRunOfTheirWorkspaceProject() {
        for (RoleCode role : List.of(RoleCode.ENGINEER, RoleCode.REVIEWER)) {
            ProjectAccess project = mock(ProjectAccess.class);
            when(project.currentProject()).thenReturn(new com.vsos.backend.repository.common.Row(java.util.Map.of("id", 1L)));
            RunViewScope scope = access(project).runViewScope(as(role, 4));
            assertThat(scope).as(role.name()).isEqualTo(RunViewScope.project(1));
            List<Object> args = new ArrayList<>();
            assertThat(scope.sql("", args)).isEqualTo(" AND project_id = ?");
            assertThat(args).containsExactly(1L);
        }
    }
}
