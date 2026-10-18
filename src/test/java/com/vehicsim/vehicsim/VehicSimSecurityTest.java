package com.vehicsim.vehicsim;

import com.vehicsim.config.SecurityConfig;
import com.vehicsim.entity.Role;
import com.vehicsim.entity.User;
import com.vehicsim.entity.enums.RoleCode;
import com.vehicsim.security.CustomUserDetails;
import com.vehicsim.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Luật cứng 3 (AGENTS.md): mọi route {@code /api/v1/vehicsim/*} cần đăng nhập; ADMIN / ENGINEER / EXPERIENCER ghi được,
 * MANAGER chỉ đọc, chỉ REVIEWER Accept / Reject. Chạy với bộ lọc bảo mật thật ({@link SecurityConfig}) và controller thật,
 * service giả — không cần MySQL / Redis nên chạy được trong CI (TD-33).
 */
@WebMvcTest(VehicSimController.class)
@Import(SecurityConfig.class)
class VehicSimSecurityTest {

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
    @Autowired
    private RequestMappingHandlerMapping handlerMapping;

    @MockitoBean
    private ViewsService views;
    @MockitoBean
    private FamilyService families;
    @MockitoBean
    private RunService runs;
    @MockitoBean
    private AebService aeb;
    @MockitoBean
    private RegressionService regression;
    @MockitoBean
    private DescribeService describe;
    @MockitoBean
    private com.vehicsim.service.OtpService otp;
    @MockitoBean
    private BootstrapService bootstrap;
    @MockitoBean
    private JwtService jwtService;
    @MockitoBean
    private UserDetailsService userDetailsService;
    @MockitoBean
    private TelemetryMetricsService telemetryService;

    private static CustomUserDetails as(RoleCode code) {
        return new CustomUserDetails(User.builder()
                .id(7L).email(code.name().toLowerCase() + "@example.com").passwordHash("x").isActive(true)
                .role(Role.builder().code(code).name(code.name()).build())
                .lastName("A").firstName("B").build());
    }

    private void stubServices() {
        when(views.context()).thenReturn(Map.of("project", Map.of("id", 1L)));
        when(runs.runFamily(anyLong(), anyLong(), anyLong(), any())).thenReturn(List.of());
    }

    // ---- các thao tác mẫu, mỗi cái kèm đúng một kiểu quyền

    private MockHttpServletRequestBuilder read() {
        return request(HttpMethod.GET, BASE + "/context");
    }

    private MockHttpServletRequestBuilder runFamily() {
        return request(HttpMethod.POST, BASE + "/families/1/run").contentType(MediaType.APPLICATION_JSON).content("{}");
    }

    private MockHttpServletRequestBuilder createCandidate() {
        return request(HttpMethod.POST, BASE + "/aeb/versions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"parent_version_id\":1,\"values\":{\"TTC_THRESHOLD\":1.6}}");
    }

    private MockHttpServletRequestBuilder describeScenario() {
        return request(HttpMethod.POST, BASE + "/scenarios/describe").contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"người đi bộ băng ngang\"}");
    }

    private MockHttpServletRequestBuilder decide() {
        return request(HttpMethod.POST, BASE + "/recommendations/1/decision").contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"ACCEPT\",\"reason\":\"đủ bằng chứng\",\"confirmed\":true}");
    }

    private MockHttpServletRequestBuilder bootstrapData() {
        return request(HttpMethod.POST, BASE + "/bootstrap");
    }

    // ---- luật

    @Test
    void everyVehicsimRouteRequiresLogin() throws Exception {
        int checked = 0;
        for (RequestMappingInfo info : handlerMapping.getHandlerMethods().keySet()) {
            Set<String> patterns = new TreeSet<>(info.getPathPatternsCondition().getPatternValues());
            for (String pattern : patterns) {
                if (!pattern.startsWith(BASE)) {
                    continue;
                }
                String path = pattern.replaceAll("\\{[^}]+}", "1");
                Set<org.springframework.web.bind.annotation.RequestMethod> methods = info.getMethodsCondition().getMethods();
                assertThat(methods).as("route %s phải khai báo phương thức", pattern).isNotEmpty();
                for (var method : methods) {
                    mvc.perform(request(HttpMethod.valueOf(method.name()), path).contentType(MediaType.APPLICATION_JSON).content("{}"))
                            .andExpect(status().isUnauthorized());
                    checked++;
                }
            }
        }
        assertThat(checked).as("số route VehicSim đã kiểm — nếu giảm mạnh thì test này đang không còn thấy route").isGreaterThanOrEqualTo(20);
    }

    private int statusOf(MockHttpServletRequestBuilder builder, RoleCode code) throws Exception {
        return mvc.perform(builder.with(user(as(code)))).andReturn().getResponse().getStatus();
    }

    @Test
    void everyRoleCanReadButOnlyWriteRolesCanWrite() throws Exception {
        stubServices();
        for (RoleCode code : RoleCode.values()) {
            assertThat(statusOf(read(), code)).as("%s đọc được", code).isEqualTo(200);
        }
        for (RoleCode code : List.of(RoleCode.ADMIN, RoleCode.ENGINEER, RoleCode.EXPERIENCER)) {
            assertThat(statusOf(runFamily(), code)).as("%s chạy được", code).isBetween(200, 299);
            assertThat(statusOf(createCandidate(), code)).as("%s tạo candidate được", code).isBetween(200, 299);
            assertThat(statusOf(describeScenario(), code)).as("%s mô tả được", code).isBetween(200, 299);
        }
        // MANAGER chỉ đọc; REVIEWER duyệt chứ không làm.
        for (RoleCode code : List.of(RoleCode.MANAGER, RoleCode.REVIEWER)) {
            assertThat(statusOf(runFamily(), code)).as("%s không được chạy", code).isEqualTo(403);
            assertThat(statusOf(createCandidate(), code)).as("%s không được tạo candidate", code).isEqualTo(403);
            assertThat(statusOf(describeScenario(), code)).as("%s không được mô tả", code).isEqualTo(403);
        }
    }

    @Test
    void onlyReviewerCanAcceptOrReject() throws Exception {
        stubServices();
        assertThat(statusOf(decide(), RoleCode.REVIEWER)).isBetween(200, 299);
        for (RoleCode code : List.of(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.ENGINEER, RoleCode.EXPERIENCER)) {
            assertThat(statusOf(decide(), code)).as("%s không được duyệt", code).isEqualTo(403);
        }
    }

    @Test
    void onlyAdminCanBootstrap() throws Exception {
        stubServices();
        assertThat(statusOf(bootstrapData(), RoleCode.ADMIN)).isBetween(200, 299);
        for (RoleCode code : List.of(RoleCode.MANAGER, RoleCode.ENGINEER, RoleCode.REVIEWER, RoleCode.EXPERIENCER)) {
            assertThat(statusOf(bootstrapData(), code)).as("%s không được khởi tạo", code).isEqualTo(403);
        }
    }
}
