package com.vsos.backend.security;

import com.vsos.backend.config.SecurityConfig;
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.controller.workspace.EngineerWorkspaceController;
import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.security.CustomUserDetails;
import com.vsos.backend.security.JwtService;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.auth.OtpService;
import com.vsos.backend.service.system.SystemViewService;
import com.vsos.backend.service.workspace.WorkspaceReportService;
import com.vsos.backend.service.workspace.WorkspaceService;
import com.vsos.backend.service.workspace.WorkspaceTaskService;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * Kiểm tra quyền của các route Kỹ sư (FE-03, FE-14):
 * Chưa đăng nhập 401; ENGINEER truy cập được các endpoint của mình.
 */
@WebMvcTest(EngineerWorkspaceController.class)
@Import({SecurityConfig.class, VehicSimAccess.class})
class EngineerWorkspaceSecurityTest {

    private static final String BASE = "/api/v1/vehicsim";

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
    private WorkspaceService workspaces;
    @MockitoBean
    private WorkspaceTaskService tasks;
    @MockitoBean
    private WorkspaceReportService reports;
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
                .lastName("Kỹ sư").firstName("A").build());
    }

    private int statusOf(MockHttpServletRequestBuilder builder, RoleCode code) throws Exception {
        return mvc.perform(code == null ? builder : builder.with(user(as(code)))).andReturn().getResponse().getStatus();
    }

    @Test
    void unauthenticatedRequestsReturn401() throws Exception {
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/my-tasks"), null)).isEqualTo(401);
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/my-reports"), null)).isEqualTo(401);
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/workspaces/1/messages"), null)).isEqualTo(401);
    }

    @Test
    void engineerCanAccessTasksReportsAndChat() throws Exception {
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/my-tasks"), RoleCode.ENGINEER)).isEqualTo(200);
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/my-workspaces"), RoleCode.ENGINEER)).isEqualTo(200);
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/my-reports"), RoleCode.ENGINEER)).isEqualTo(200);
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/workspaces/1/messages"), RoleCode.ENGINEER)).isEqualTo(200);

        // Status update
        String updateStatusJson = "{\"status\":\"IN_PROGRESS\",\"progress_pct\":50}";
        assertThat(statusOf(request(HttpMethod.PATCH, BASE + "/tasks/10/status")
                .contentType(MediaType.APPLICATION_JSON).content(updateStatusJson), RoleCode.ENGINEER)).isEqualTo(200);

        // Submit report
        String submitReportJson = "{\"title\":\"Báo cáo thử nghiệm\",\"content\":\"Đã chạy simulation test\",\"project_id\":1}";
        assertThat(statusOf(request(HttpMethod.POST, BASE + "/reports")
                .contentType(MediaType.APPLICATION_JSON).content(submitReportJson), RoleCode.ENGINEER)).isEqualTo(201);

        // Send chat
        String chatJson = "{\"message\":\"Xin chào team\"}";
        assertThat(statusOf(request(HttpMethod.POST, BASE + "/workspaces/1/messages")
                .contentType(MediaType.APPLICATION_JSON).content(chatJson), RoleCode.ENGINEER)).isEqualTo(201);
    }

    @Test
    void reviewerCanAlsoAccessTasksAndReports() throws Exception {
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/my-tasks"), RoleCode.REVIEWER)).isEqualTo(200);
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/my-workspaces"), RoleCode.REVIEWER)).isEqualTo(200);
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/my-reports"), RoleCode.REVIEWER)).isEqualTo(200);
    }

    @Test
    void adminCanAccessEngineerEndpoints() throws Exception {
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/my-tasks"), RoleCode.ADMIN)).isEqualTo(200);
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/my-workspaces"), RoleCode.ADMIN)).isEqualTo(200);
    }
}
