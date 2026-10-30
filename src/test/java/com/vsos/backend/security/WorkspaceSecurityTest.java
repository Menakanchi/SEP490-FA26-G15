package com.vsos.backend.security;

import com.vsos.backend.config.SecurityConfig;
import com.vsos.backend.controller.workspace.WorkspaceController;
import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.service.auth.OtpService;
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

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.service.system.SystemViewService;

/**
 * Quyền của màn quản lý workspace qua bộ lọc bảo mật thật: chưa đăng nhập 401; chỉ MANAGER / ADMIN vào được, ENGINEER / REVIEWER /
 * EXPERIENCER bị 403 ở mọi route; thêm / bớt thành viên chịu hạn mức ghi. Service giả — không cần MySQL / Redis.
 */
@WebMvcTest(WorkspaceController.class)
@Import({SecurityConfig.class, VehicSimAccess.class})
class WorkspaceSecurityTest {

    private static final String BASE = "/api/v1/vehicsim/workspaces";
    private static final Set<RoleCode> MANAGERS = Set.of(RoleCode.MANAGER, RoleCode.ADMIN);

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
                .lastName("A").firstName("B").build());
    }

    private static List<MockHttpServletRequestBuilder> routes() {
        return List.of(
                request(HttpMethod.GET, BASE),
                request(HttpMethod.GET, BASE + "/1"),
                request(HttpMethod.GET, BASE + "/1/members"),
                request(HttpMethod.GET, BASE + "/1/member-candidates?q=a"),
                addMember(),
                request(HttpMethod.DELETE, BASE + "/1/members/2"),
                request(HttpMethod.GET, BASE + "/1/tasks?status=TODO"),
                createTask(),
                request(HttpMethod.PUT, BASE + "/1/tasks/3").contentType(MediaType.APPLICATION_JSON).content(TASK),
                request(HttpMethod.DELETE, BASE + "/1/tasks/3"),
                request(HttpMethod.GET, BASE + "/1/reports?status=SUBMITTED"),
                decideReport("{\"decision\":\"APPROVED\"}"));
    }

    private static MockHttpServletRequestBuilder decideReport(String body) {
        return request(HttpMethod.POST, BASE + "/1/reports/4/decision").contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static final String TASK = "{\"title\":\"Chạy lại họ PX2\",\"priority\":\"HIGH\"}";

    private static MockHttpServletRequestBuilder createTask() {
        return request(HttpMethod.POST, BASE + "/1/tasks").contentType(MediaType.APPLICATION_JSON).content(TASK);
    }

    private static MockHttpServletRequestBuilder addMember() {
        return request(HttpMethod.POST, BASE + "/1/members").contentType(MediaType.APPLICATION_JSON).content("{\"user_id\":2,\"role\":\"ENGINEER\"}");
    }

    private int statusOf(MockHttpServletRequestBuilder builder, RoleCode code) throws Exception {
        return mvc.perform(code == null ? builder : builder.with(user(as(code)))).andReturn().getResponse().getStatus();
    }

    @Test
    void everyWorkspaceRouteRequiresLogin() throws Exception {
        for (MockHttpServletRequestBuilder route : routes()) {
            assertThat(statusOf(route, null)).isEqualTo(401);
        }
    }

    @Test
    void onlyManagersAndAdminsCanManageWorkspaces() throws Exception {
        for (RoleCode code : RoleCode.values()) {
            for (MockHttpServletRequestBuilder route : routes()) {
                int status = statusOf(route, code);
                if (MANAGERS.contains(code)) {
                    assertThat(status).as("%s được vào", code).isBetween(200, 299);
                } else {
                    assertThat(status).as("%s bị chặn", code).isEqualTo(403);
                }
            }
        }
    }

    @Test
    void addMemberValidatesBodyAndHonoursWriteQuota() throws Exception {
        assertThat(statusOf(request(HttpMethod.POST, BASE + "/1/members").contentType(MediaType.APPLICATION_JSON).content("{}"),
                RoleCode.MANAGER)).isEqualTo(400);
        // Thiếu vai trò cấp cho người được thêm (ADR-045).
        assertThat(statusOf(request(HttpMethod.POST, BASE + "/1/members").contentType(MediaType.APPLICATION_JSON).content("{\"user_id\":2}"),
                RoleCode.MANAGER)).isEqualTo(400);
        when(otp.hitRateLimit(eq("vs_workspace_member"), any(), anyInt())).thenReturn(true);
        assertThat(statusOf(addMember(), RoleCode.MANAGER)).isEqualTo(429);
        assertThat(statusOf(request(HttpMethod.DELETE, BASE + "/1/members/2"), RoleCode.MANAGER)).isEqualTo(429);
    }

    @Test
    void taskBodyIsValidatedAndTaskWritesHonourQuota() throws Exception {
        for (String body : List.of("{}", "{\"title\":\"  \"}", "{\"title\":\"x\",\"progress_pct\":101}",
                "{\"title\":\"" + "x".repeat(256) + "\"}", "{\"title\":\"x\",\"due_date\":\"không-phải-ngày\"}")) {
            assertThat(statusOf(request(HttpMethod.POST, BASE + "/1/tasks").contentType(MediaType.APPLICATION_JSON).content(body),
                    RoleCode.MANAGER)).as(body).isEqualTo(400);
        }
        when(otp.hitRateLimit(eq("vs_workspace_task"), any(), anyInt())).thenReturn(true);
        assertThat(statusOf(createTask(), RoleCode.MANAGER)).isEqualTo(429);
        assertThat(statusOf(request(HttpMethod.DELETE, BASE + "/1/tasks/3"), RoleCode.MANAGER)).isEqualTo(429);
    }

    @Test
    void reportDecisionValidatesBodyAndHonoursWriteQuota() throws Exception {
        assertThat(statusOf(decideReport("{}"), RoleCode.MANAGER)).isEqualTo(400);
        assertThat(statusOf(decideReport("{\"decision\":\"REJECTED\",\"note\":\"" + "x".repeat(4001) + "\"}"), RoleCode.MANAGER))
                .isEqualTo(400);
        when(otp.hitRateLimit(eq("vs_workspace_report"), any(), anyInt())).thenReturn(true);
        assertThat(statusOf(decideReport("{\"decision\":\"APPROVED\"}"), RoleCode.MANAGER)).isEqualTo(429);
    }
}
