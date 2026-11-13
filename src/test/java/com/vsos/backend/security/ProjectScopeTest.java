package com.vsos.backend.security;

import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.exception.project.ProjectError;
import com.vsos.backend.exception.project.ProjectException;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.repository.project.ProjectRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProjectScopeTest {

    private static final long USER = 7L;

    private ProjectRepository projects;

    @BeforeEach
    void setUp() {
        projects = mock(ProjectRepository.class);
    }

    @AfterEach
    void clearLogin() {
        SecurityContextHolder.clearContext();
    }

    private static void loginAs(RoleCode code) {
        CustomUserDetails user = new CustomUserDetails(User.builder()
                .id(USER).email("u@example.com").passwordHash("x").isActive(true)
                .role(Role.builder().code(code).name(code.name()).build())
                .lastName("A").firstName("B").build());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
    }

    private ProjectScope scope(String header) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        if (header != null) {
            request.addHeader(ProjectScope.HEADER, header);
        }
        return new ProjectScope(request, projects);
    }

    private static Row row(long id, String status, Long workspaceId, long owner) {
        Map<String, Object> values = new HashMap<>(Map.of("id", id, "name", "Thử AEB", "status", status, "created_by_user_id", owner));
        values.put("workspace_id", workspaceId);
        return new Row(values);
    }

    private static void assertError(ProjectScope scope, ProjectError error, String detail) {
        assertThatThrownBy(scope::current).isInstanceOfSatisfying(ProjectException.class, e -> {
            assertThat(e.getError()).isEqualTo(error);
            assertThat(e.getMessage()).isEqualTo(detail);
        });
    }

    @Test
    void otherRolesKeepTheTeamProjectAndIgnoreTheHeader() {
        loginAs(RoleCode.ENGINEER);
        when(projects.firstActiveTeamProject()).thenReturn(row(1L, "ACTIVE", 1L, 1L));

        assertThat(scope("21").current().lng("id")).isEqualTo(1L);
        verify(projects, never()).row(anyLong());
    }

    @Test
    void otherRolesWithoutATeamProjectAreToldToBootstrap() {
        loginAs(RoleCode.ADMIN);

        assertThatThrownBy(scope(null)::current).isInstanceOf(NotFoundException.class).hasMessageContaining("bootstrap");
    }

    @Test
    void anExperiencerWithoutHeaderOpensTheLatestActiveProject() {
        loginAs(RoleCode.EXPERIENCER);
        when(projects.latestActivePersonal(USER)).thenReturn(row(21L, "ACTIVE", null, USER));

        assertThat(scope(null).current().lng("id")).isEqualTo(21L);
    }

    @Test
    void anExperiencerWithoutActiveProjectIsAskedToOpenOne() {
        loginAs(RoleCode.EXPERIENCER);

        assertError(scope(null), ProjectError.NO_PROJECT_OPEN,
                "Bạn chưa có project nào đang hoạt động. Tạo hoặc mở một project để tiếp tục.");
    }

    @Test
    void theHeaderMustPointToAnActiveProjectOfTheExperiencer() {
        loginAs(RoleCode.EXPERIENCER);
        when(projects.row(30L)).thenReturn(row(30L, "ACTIVE", 4L, USER));
        when(projects.row(31L)).thenReturn(row(31L, "ACTIVE", null, 8L));
        when(projects.row(32L)).thenReturn(row(32L, "ARCHIVED", null, USER));

        assertError(scope("abc"), ProjectError.PROJECT_NOT_FOUND, "Không tìm thấy project #abc.");
        assertError(scope("90"), ProjectError.PROJECT_NOT_FOUND, "Không tìm thấy project #90.");
        assertError(scope("30"), ProjectError.PROJECT_NOT_YOURS, "Project #30 không phải project cá nhân của bạn.");
        assertError(scope("31"), ProjectError.PROJECT_NOT_YOURS, "Project #31 không phải project cá nhân của bạn.");
        assertError(scope("32"), ProjectError.PROJECT_ARCHIVED, "Project “Thử AEB” đang lưu trữ. Bỏ lưu trữ để mở lại.");
    }

    @Test
    void theOpenProjectIsResolvedOncePerRequest() {
        loginAs(RoleCode.EXPERIENCER);
        when(projects.row(33L)).thenReturn(row(33L, "ACTIVE", null, USER));

        ProjectScope scope = scope(" 33 ");

        assertThat(scope.current().lng("id")).isEqualTo(33L);
        assertThat(scope.find()).isPresent();
        verify(projects, times(1)).row(33L);
    }
}
