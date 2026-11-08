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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
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
    @MockitoBean
    private ProjectAccess projectAccess;

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
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/workspaces/1/messages/stream"), null)).isEqualTo(401);
    }

    @Test
    void theRealtimeStreamStaysOpenAndItsAsyncDispatchIsNotBlocked() throws Exception {
        SseEmitter emitter = new SseEmitter(60_000L);
        org.mockito.Mockito.when(workspaces.openChatStream(7L, 1L)).thenReturn(emitter);
        // Đăng nhập qua đúng bộ lọc JWT như app thật (không dùng user() — nó lưu phiên vào request nên che mất lỗi lượt ASYNC).
        CustomUserDetails engineer = as(RoleCode.ENGINEER);
        org.mockito.Mockito.when(jwtService.extractUsername("tok")).thenReturn(engineer.getUsername());
        org.mockito.Mockito.when(userDetailsService.loadUserByUsername(engineer.getUsername())).thenReturn(engineer);
        org.mockito.Mockito.when(jwtService.isTokenValid("tok", engineer)).thenReturn(true);

        MvcResult opened = mvc.perform(request(HttpMethod.GET, BASE + "/workspaces/1/messages/stream")
                        .accept(MediaType.TEXT_EVENT_STREAM, MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer tok"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.request().asyncStarted())
                .andReturn();
        assertThat(opened.getResponse().getHeader("X-Accel-Buffering")).isEqualTo("no");

        emitter.send(SseEmitter.event().name("message").id("5").data("{\"id\":5}"));
        emitter.complete();
        // Lượt ASYNC sau khi kênh đóng: không có JWT chạy lại, vẫn không được biến thành 401/403.
        var finished = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch(opened))
                .andReturn().getResponse();
        assertThat(finished.getStatus()).isEqualTo(200);
        assertThat(finished.getContentType()).startsWith(MediaType.TEXT_EVENT_STREAM_VALUE);
        assertThat(finished.getContentAsString()).contains("event:message").contains("id:5");
    }

    @Test
    void onlyManagersEngineersAndReviewersUseTheWorkspaceRoutes() throws Exception {
        String chatJson = "{\"message\":\"Xin chào team\"}";
        for (RoleCode code : RoleCode.values()) {
            boolean allowed = code == RoleCode.MANAGER || code == RoleCode.ENGINEER || code == RoleCode.REVIEWER;
            for (String path : new String[]{"/my-workspaces", "/my-tasks", "/my-reports", "/tasks/10", "/reports/20", "/workspaces/1/messages",
                    "/workspaces/1/messages/stream"}) {
                assertThat(statusOf(request(HttpMethod.GET, BASE + path), code)).as("%s GET %s", code, path).isEqualTo(allowed ? 200 : 403);
            }
            assertThat(statusOf(request(HttpMethod.POST, BASE + "/workspaces/1/messages")
                    .contentType(MediaType.APPLICATION_JSON).content(chatJson), code)).as("%s chat", code).isEqualTo(allowed ? 201 : 403);
        }
    }

    @Test
    void duplicateStatusAndReportRoutesAreGone() throws Exception {
        String body = "{\"status\":\"IN_PROGRESS\",\"progress_pct\":50}";
        assertThat(statusOf(request(HttpMethod.PATCH, BASE + "/tasks/10/status")
                .contentType(MediaType.APPLICATION_JSON).content(body), RoleCode.ENGINEER)).isIn(404, 405);
        assertThat(statusOf(request(HttpMethod.POST, BASE + "/reports")
                .contentType(MediaType.APPLICATION_JSON).content("{}"), RoleCode.ENGINEER)).isIn(404, 405);
    }
}
