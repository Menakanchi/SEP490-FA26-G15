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

    private static List<MockHttpServletRequestBuilder> experiencerOnly() {
        return List.of(
                request(HttpMethod.GET, BASE + "/vehicle-options"),
                create(),
                json(HttpMethod.POST, "/1/regressions/2/adopt", "{\"reason\":\"Đạt\",\"confirmed\":true}"),
                json(HttpMethod.PATCH, "/1", "{\"name\":\"Mới\"}"),
                request(HttpMethod.POST, BASE + "/1/archive"),
                request(HttpMethod.POST, BASE + "/1/unarchive"),
                json(HttpMethod.DELETE, "/1", "{\"confirm_name\":\"Thử AEB\"}"));
    }

    private int statusOf(MockHttpServletRequestBuilder builder, RoleCode code) throws Exception {
        return mvc.perform(code == null ? builder : builder.with(user(as(code)))).andReturn().getResponse().getStatus();
    }

    @Test
    void everyProjectRouteRequiresLogin() throws Exception {
        for (MockHttpServletRequestBuilder route : List.of(reads(), experiencerOnly()).stream().flatMap(List::stream).toList()) {
            assertThat(statusOf(route, null)).isEqualTo(401);
        }
    }

    @Test
    void ownersWhoChangedRoleStillReadTheirPersonalProjects() throws Exception {
        for (RoleCode code : RoleCode.values()) {
            for (MockHttpServletRequestBuilder route : reads()) {
                assertThat(statusOf(route, code)).isEqualTo(200);
            }
        }
    }

    @Test
    void onlyExperiencersManageAndWorkInPersonalProjects() throws Exception {
        for (RoleCode code : RoleCode.values()) {
            for (MockHttpServletRequestBuilder route : experiencerOnly()) {
                if (code == RoleCode.EXPERIENCER) {
                    assertThat(statusOf(route, code)).isBetween(200, 299);
                } else {
                    mvc.perform(route.with(user(as(code))))
                            .andExpect(status().isForbidden())
                            .andExpect(jsonPath("$.code").value("EXPERIENCER_ONLY"))
                            .andExpect(jsonPath("$.detail").value("Project cá nhân chỉ dành cho tài khoản Experiencer."));
                }
            }
        }
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
        when(projects.create(anyLong(), any())).thenThrow(new ProjectException(ProjectError.NAME_DUPLICATE, "Thử AEB"));

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
