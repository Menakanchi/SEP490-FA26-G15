package com.vsos.backend.security;

import com.vsos.backend.config.SecurityConfig;
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.controller.project.ProjectController;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.exception.project.ProjectError;
import com.vsos.backend.exception.project.ProjectException;
import com.vsos.backend.service.auth.OtpService;
import com.vsos.backend.service.project.ProjectService;
import com.vsos.backend.service.system.SystemViewService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ProjectController.class)
@Import({SecurityConfig.class, VehicSimAccess.class})
class ProjectSecurityTest {

    private static final String BASE = "/api/v1/vehicsim/projects";

    @TestConfiguration
    static class PropsConfig {
        @Bean
        VehicSimProperties vehicSimProperties() {
            return new VehicSimProperties("kinematic", "", "", "", "inline", 60, 1, "python", "worker", false, 1000, 1000);
        }
    }

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ProjectService projects;
    @MockitoBean
    private SystemViewService views;
    @MockitoBean
    private OtpService otp;
    @MockitoBean
    private JwtService jwtService;
    @MockitoBean
    private UserDetailsService userDetailsService;
    @MockitoBean
    private ProjectAccess projectAccess;

    private static CustomUserDetails as(RoleCode code) {
        return new CustomUserDetails(User.builder()
                .id(7L).email(code.name().toLowerCase() + "@example.com").passwordHash("x").isActive(true)
                .role(Role.builder().code(code).name(code.name()).build())
                .lastName("A").firstName("B").build());
    }

    private static MockHttpServletRequestBuilder json(HttpMethod method, String path, String body) {
        return request(method, BASE + path).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static MockHttpServletRequestBuilder create() {
        return json(HttpMethod.POST, "", "{\"name\":\"Thử AEB\"}");
    }

    private static List<MockHttpServletRequestBuilder> reads() {
        return List.of(request(HttpMethod.GET, BASE), request(HttpMethod.GET, BASE + "/1"), request(HttpMethod.GET, BASE + "/1/journey"));
    }

    /** ADR-064: Experiencer (project cá nhân) và Kỹ sư (project của workspace) tạo được project. */
    private static List<MockHttpServletRequestBuilder> creatorRoutes() {
        return List.of(request(HttpMethod.GET, BASE + "/vehicle-options"), create());
    }

    private static List<MockHttpServletRequestBuilder> experiencerOnly() {
        return List.of(
                json(HttpMethod.PATCH, "/1", "{\"name\":\"Mới\"}"),
                request(HttpMethod.POST, BASE + "/1/archive"),
                request(HttpMethod.POST, BASE + "/1/unarchive"),
                json(HttpMethod.DELETE, "/1", "{\"confirm_name\":\"Thử AEB\"}"));
    }

    private static List<MockHttpServletRequestBuilder> adoption() {
        return List.of(json(HttpMethod.POST, "/1/regressions/2/adopt", "{\"reason\":\"Đạt\",\"confirmed\":true}"));
    }

    private int statusOf(MockHttpServletRequestBuilder builder, RoleCode code) throws Exception {
        return mvc.perform(code == null ? builder : builder.with(user(as(code)))).andReturn().getResponse().getStatus();
    }

    @Test
    void everyProjectRouteRequiresLogin() throws Exception {
        for (MockHttpServletRequestBuilder route : List.of(reads(), creatorRoutes(), experiencerOnly(), adoption()).stream().flatMap(List::stream).toList()) {
            assertThat(statusOf(route, null)).isEqualTo(401);
        }
    }

    @Test
    void ownersWhoChangedRoleStillReadTheirPersonalProjects() throws Exception {
        for (RoleCode code : RoleCode.values()) {
            for (MockHttpServletRequestBuilder route : reads()) {
                assertThat(statusOf(route, code)).isEqualTo(code == RoleCode.MANAGER ? 403 : 200);
            }
        }
    }

    @Test
    void onlyExperiencersManageAndWorkInPersonalProjects() throws Exception {
        for (RoleCode code : RoleCode.values()) {
            for (MockHttpServletRequestBuilder route : experiencerOnly()) {
                if (code == RoleCode.EXPERIENCER || code == RoleCode.ENGINEER) {
                    assertThat(statusOf(route, code)).isBetween(200, 299);
                } else if (code == RoleCode.MANAGER) {
                    assertThat(statusOf(route, code)).isEqualTo(403);
                } else {
                    mvc.perform(route.with(user(as(code))))
                            .andExpect(status().isForbidden())
                            .andExpect(jsonPath("$.code").value("CREATE_ROLE_NOT_ALLOWED"));
                }
            }
        }
    }

    @Test
    void onlyExperiencersCanAdoptPersonalBaseline() throws Exception {
        for (RoleCode code : RoleCode.values()) {
            for (MockHttpServletRequestBuilder route : adoption()) {
                assertThat(statusOf(route, code)).isEqualTo(code == RoleCode.EXPERIENCER ? 200 : 403);
            }
        }
    }

    @Test
    void onlyExperiencersAndEngineersCreateProjects() throws Exception {
        for (RoleCode code : RoleCode.values()) {
            for (MockHttpServletRequestBuilder route : creatorRoutes()) {
                if (code == RoleCode.EXPERIENCER || code == RoleCode.ENGINEER) {
                    assertThat(statusOf(route, code)).isBetween(200, 299);
                } else if (code == RoleCode.MANAGER) {
                    assertThat(statusOf(route, code)).isEqualTo(403);
                } else {
                    mvc.perform(route.with(user(as(code))))
                            .andExpect(status().isForbidden())
                            .andExpect(jsonPath("$.code").value("CREATE_ROLE_NOT_ALLOWED"));
                }
            }
        }
    }

    @Test
    void theCreatorRoleReachesTheServiceTogetherWithTheWorkspaceChoice() throws Exception {
        mvc.perform(json(HttpMethod.POST, "", "{\"name\":\"Dự án A\",\"workspace_id\":6}").with(user(as(RoleCode.ENGINEER))))
                .andExpect(status().isCreated());
        org.mockito.ArgumentCaptor<com.vsos.backend.dto.project.ProjectDtos.ProjectRequest> body =
                org.mockito.ArgumentCaptor.forClass(com.vsos.backend.dto.project.ProjectDtos.ProjectRequest.class);
        org.mockito.Mockito.verify(projects).create(eq(7L), eq("ENGINEER"), body.capture());
        assertThat(body.getValue().workspaceId()).isEqualTo(6L);
        assertThat(body.getValue().name()).isEqualTo("Dự án A");
    }

    @Test
    void engineerListUsesWorkspaceOwnershipScope() throws Exception {
        mvc.perform(request(HttpMethod.GET, BASE).with(user(as(RoleCode.ENGINEER))))
                .andExpect(status().isOk());
        org.mockito.Mockito.verify(projects).list(eq(7L), eq(true), eq("ACTIVE"), eq(""), eq(1), eq(9));
    }

    @Test
    void writesHonourTheQuotaButReadsDoNot() throws Exception {
        assertThat(statusOf(create(), RoleCode.EXPERIENCER)).isEqualTo(201);
        when(otp.hitRateLimit(eq("vs_project"), any(), anyInt())).thenReturn(true);

        assertThat(statusOf(create(), RoleCode.EXPERIENCER)).isEqualTo(429);
        assertThat(statusOf(request(HttpMethod.GET, BASE), RoleCode.EXPERIENCER)).isEqualTo(200);
    }

    @Test
    void projectErrorsCarryTheirNameAndVietnameseDetail() throws Exception {
        when(projects.create(anyLong(), anyString(), any())).thenThrow(new ProjectException(ProjectError.NAME_DUPLICATE, "Thử AEB"));

        mvc.perform(create().with(user(as(RoleCode.EXPERIENCER))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NAME_DUPLICATE"))
                .andExpect(jsonPath("$.detail").value("Bạn đã có project tên “Thử AEB”. Hãy chọn tên khác."));
    }

    @Test
    void browsersMaySendTheProjectHeader() throws Exception {
        mvc.perform(options(BASE)
                        .header("Origin", "http://localhost:3000")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", ProjectScope.HEADER))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Headers", containsString(ProjectScope.HEADER)));
    }
}
