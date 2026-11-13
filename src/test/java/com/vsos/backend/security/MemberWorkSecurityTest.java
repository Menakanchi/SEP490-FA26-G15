package com.vsos.backend.security;

import com.vsos.backend.config.SecurityConfig;
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.controller.workspace.MemberWorkController;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.service.auth.OtpService;

import com.vsos.backend.service.workspace.MemberWorkService;
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
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * Quyền của "Nhiệm vụ & báo cáo" qua bộ lọc bảo mật thật: chưa đăng nhập 401; MANAGER / ENGINEER / REVIEWER vào được (người được giao,
 * thành viên kiểm ở service), ADMIN / EXPERIENCER bị 403; body được kiểm và ghi chịu hạn mức. Service giả — không cần MySQL / Redis.
 */
@WebMvcTest(MemberWorkController.class)
@Import({SecurityConfig.class, VehicSimAccess.class})
class MemberWorkSecurityTest {

    private static final String BASE = "/api/v1/vehicsim/my";
    private static final Set<RoleCode> MEMBERS = Set.of(RoleCode.MANAGER, RoleCode.ENGINEER, RoleCode.REVIEWER);
    private static final String PROGRESS = "{\"status\":\"IN_PROGRESS\",\"progress_pct\":40}";
    private static final String REPORT = "{\"project_id\":2,\"title\":\"Tuần 44\",\"content\":\"Đã chạy lại họ PX2\"}";

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
    private MemberWorkService work;
    @MockitoBean
    private ProjectAccess projects;
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

    private static MockHttpServletRequestBuilder progress(String body) {
        return request(HttpMethod.PUT, BASE + "/tasks/3/progress").contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static MockHttpServletRequestBuilder report(String body) {
        return request(HttpMethod.POST, BASE + "/reports").contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static List<MockHttpServletRequestBuilder> routes() {
        return List.of(request(HttpMethod.GET, BASE + "/work"), progress(PROGRESS), report(REPORT));
    }

    private int statusOf(MockHttpServletRequestBuilder builder, RoleCode code) throws Exception {
        return mvc.perform(code == null ? builder : builder.with(user(as(code)))).andReturn().getResponse().getStatus();
    }

    @Test
    void everyMemberRouteRequiresLogin() throws Exception {
        for (MockHttpServletRequestBuilder route : routes()) {
            assertThat(statusOf(route, null)).isEqualTo(401);
        }
    }

    @Test
    void onlyWorkspaceRolesHaveTasksAndReports() throws Exception {
        for (RoleCode code : RoleCode.values()) {
            for (MockHttpServletRequestBuilder route : routes()) {
                int status = statusOf(route, code);
                if (MEMBERS.contains(code)) {
                    assertThat(status).as("%s được vào", code).isBetween(200, 299);
                } else {
                    assertThat(status).as("%s bị chặn", code).isEqualTo(403);
                }
            }
        }
    }

    @Test
    void bodiesAreValidatedAndWritesHonourQuota() throws Exception {
        for (String body : List.of("{}", "{\"status\":\"REVIEW\"}", "{\"status\":\"REVIEW\",\"progress_pct\":101}")) {
            assertThat(statusOf(progress(body), RoleCode.REVIEWER)).as(body).isEqualTo(400);
        }
        for (String body : List.of("{}", "{\"project_id\":2,\"title\":\" \",\"content\":\"x\"}", "{\"project_id\":2,\"title\":\"x\"}",
                "{\"project_id\":2,\"title\":\"" + "x".repeat(256) + "\",\"content\":\"x\"}")) {
            assertThat(statusOf(report(body), RoleCode.REVIEWER)).as(body).isEqualTo(400);
        }
        when(otp.hitRateLimit(eq("vs_workspace_task"), any(), anyInt())).thenReturn(true);
        assertThat(statusOf(progress(PROGRESS), RoleCode.REVIEWER)).isEqualTo(429);
        when(otp.hitRateLimit(eq("vs_workspace_report"), any(), anyInt())).thenReturn(true);
        assertThat(statusOf(report(REPORT), RoleCode.ENGINEER)).isEqualTo(429);
    }
}
