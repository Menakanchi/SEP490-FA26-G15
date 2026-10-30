package com.vsos.backend.security;

import com.vsos.backend.config.SecurityConfig;
import com.vsos.backend.controller.regression.RegressionController;
import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.service.regression.RegressionReportService;
import com.vsos.backend.service.regression.RegressionService;
import com.vsos.backend.service.regression.RegressionViewService;
import com.vsos.backend.service.regression.ReviewDecisionService;
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
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.controller.aeb.AebController;
import com.vsos.backend.controller.analysis.AnalysisController;
import com.vsos.backend.controller.optimization.OptimizationController;
import com.vsos.backend.controller.scenario.ScenarioController;
import com.vsos.backend.controller.simulation.SimulationController;
import com.vsos.backend.controller.system.SystemController;
import com.vsos.backend.controller.vehicle.VehicleController;
import com.vsos.backend.service.aeb.AebService;
import com.vsos.backend.service.aeb.AebViewService;
import com.vsos.backend.service.analysis.AnalysisService;
import com.vsos.backend.service.analysis.AnalysisViewService;
import com.vsos.backend.service.optimization.OptimizationService;
import com.vsos.backend.service.scenario.DescribeService;
import com.vsos.backend.service.scenario.FamilyService;
import com.vsos.backend.service.scenario.ScenarioViewService;
import com.vsos.backend.service.simulation.RunService;
import com.vsos.backend.service.simulation.SimulationViewService;
import com.vsos.backend.service.simulation.TelemetryMetricsService;
import com.vsos.backend.service.system.BootstrapService;
import com.vsos.backend.service.system.SystemViewService;
import com.vsos.backend.service.vehicle.VehicleCatalogService;

/**
 * Luật cứng 3 (AGENTS.md): mọi route {@code /api/v1/vehicsim/*} cần đăng nhập; ADMIN / ENGINEER / EXPERIENCER ghi được,
 * MANAGER chỉ đọc, chỉ REVIEWER Accept / Reject. Chạy với bộ lọc bảo mật thật ({@link SecurityConfig}), hai controller thật
 * (các controller VehicSim và {@link RegressionController} của màn 5) cùng luật quyền thật ({@link VehicSimAccess}),
 * service giả — không cần MySQL / Redis nên chạy được trong CI (TD-33).
 */
@WebMvcTest({SystemController.class, ScenarioController.class, SimulationController.class, AnalysisController.class,
        AebController.class, OptimizationController.class, RegressionController.class, VehicleController.class})
@Import({SecurityConfig.class, VehicSimAccess.class})
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
    private SystemViewService views;
    @MockitoBean
    private ScenarioViewService scenarioViews;
    @MockitoBean
    private AnalysisViewService analysisViews;
    @MockitoBean
    private AebViewService aebViews;
    @MockitoBean
    private SimulationViewService simulationViews;
    @MockitoBean
    private AnalysisService analysis;
    @MockitoBean
    private FamilyService families;
    @MockitoBean
    private RunService runs;
    @MockitoBean
    private AebService aeb;
    @MockitoBean
    private OptimizationService optimization;
    @MockitoBean
    private RegressionService regression;
    @MockitoBean
    private RegressionReportService regressionReports;
    @MockitoBean
    private RegressionViewService regressionViews;
    @MockitoBean
    private ReviewDecisionService reviewDecisions;
    @MockitoBean
    private DescribeService describe;
    @MockitoBean
    private com.vsos.backend.service.auth.OtpService otp;
    @MockitoBean
    private BootstrapService bootstrap;
    @MockitoBean
    private JwtService jwtService;
    @MockitoBean
    private UserDetailsService userDetailsService;
    @MockitoBean
    private TelemetryMetricsService telemetryService;
    @MockitoBean
    private VehicleCatalogService vehicles;

    private static CustomUserDetails as(RoleCode code) {
        return new CustomUserDetails(User.builder()
                .id(7L).email(code.name().toLowerCase() + "@example.com").passwordHash("x").isActive(true)
                .role(Role.builder().code(code).name(code.name()).build())
                .lastName("A").firstName("B").build());
    }

    private void stubServices() {
        when(views.context()).thenReturn(Map.of("project", Map.of("id", 1L)));
        when(analysisViews.analysisDataset(1L)).thenReturn(Map.of("scenario", Map.of("id", 1L)));
        when(runs.runFamily(anyLong(), anyLong(), anyLong(), any())).thenReturn(List.of());
    }

    // ---- các thao tác mẫu, mỗi cái kèm đúng một kiểu quyền

    private MockHttpServletRequestBuilder read() {
        return request(HttpMethod.GET, BASE + "/context");
    }

    private MockHttpServletRequestBuilder analysisDataset() {
        return request(HttpMethod.GET, BASE + "/analysis/dataset?scenario_id=1");
    }

    private MockHttpServletRequestBuilder selection() {
        return request(HttpMethod.POST, BASE + "/analysis/selections").contentType(MediaType.APPLICATION_JSON)
                .content("{\"scenario_id\":1,\"baseline_id\":1,\"optimization_run_ids\":[1],\"validation_run_ids\":[2],\"run_revisions\":{}}");
    }
    @Test void analysisSelectionAndReadEndpointsRespectRoles() throws Exception {
        for(RoleCode code: RoleCode.values()) {
            assertThat(statusOf(request(HttpMethod.GET,BASE+"/analysis/runs"),code)).isEqualTo(200);
            assertThat(statusOf(request(HttpMethod.GET,BASE+"/analysis/datasets/1/handoff"),code)).isEqualTo(200);
        }
        for(RoleCode code:List.of(RoleCode.ADMIN,RoleCode.ENGINEER,RoleCode.EXPERIENCER))
            assertThat(statusOf(selection(),code)).isBetween(200,299);
        for(RoleCode code:List.of(RoleCode.MANAGER,RoleCode.REVIEWER))
            assertThat(statusOf(selection(),code)).isEqualTo(403);
    }
    private MockHttpServletRequestBuilder saveDataset() {
        return request(HttpMethod.POST, BASE + "/analysis/datasets").contentType(MediaType.APPLICATION_JSON)
                .content("{\"scenario_id\":1,\"preview_token\":\"" + "a".repeat(64) + "\"}");
    }

    @Test
    void datasetSnapshotNeedsWriteRoleAndHonoursQuota() throws Exception {
        for (RoleCode code : List.of(RoleCode.ADMIN, RoleCode.ENGINEER, RoleCode.EXPERIENCER)) {
            assertThat(statusOf(saveDataset(), code)).isBetween(200, 299);
        }
        for (RoleCode code : List.of(RoleCode.MANAGER, RoleCode.REVIEWER)) {
            assertThat(statusOf(saveDataset(), code)).isEqualTo(403);
        }
        when(otp.hitRateLimit(org.mockito.ArgumentMatchers.eq("vs_analysis_dataset"), any(), org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(true);
        assertThat(statusOf(saveDataset(), RoleCode.ENGINEER)).isEqualTo(429);
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

    private MockHttpServletRequestBuilder createRegression() {
        return request(HttpMethod.POST, BASE + "/regression").contentType(MediaType.APPLICATION_JSON)
                .content("{\"candidate_version_id\":2,\"scenario_id\":1}");
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
    void everyRoleCanBrowseTheVehicleCatalog() throws Exception {
        stubServices();
        when(vehicles.detail(1L, 1L)).thenReturn(Map.of("id", 1L));
        for (RoleCode code : RoleCode.values()) {
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/vehicles"), code)).as("%s xem danh sách xe", code).isEqualTo(200);
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/vehicles/1"), code)).as("%s xem chi tiết xe", code).isEqualTo(200);
        }
    }

    @Test
    void everyRoleCanReadButOnlyWriteRolesCanWrite() throws Exception {
        stubServices();
        for (RoleCode code : RoleCode.values()) {
            assertThat(statusOf(read(), code)).as("%s đọc được", code).isEqualTo(200);
            assertThat(statusOf(analysisDataset(), code)).as("%s đọc tập phân tích được", code).isEqualTo(200);
        }
        for (RoleCode code : List.of(RoleCode.ADMIN, RoleCode.ENGINEER, RoleCode.EXPERIENCER)) {
            assertThat(statusOf(runFamily(), code)).as("%s chạy được", code).isBetween(200, 299);
            assertThat(statusOf(createCandidate(), code)).as("%s tạo candidate được", code).isBetween(200, 299);
            assertThat(statusOf(createRegression(), code)).as("%s tạo regression được", code).isBetween(200, 299);
            assertThat(statusOf(describeScenario(), code)).as("%s mô tả được", code).isBetween(200, 299);
        }
        // MANAGER chỉ đọc; REVIEWER duyệt chứ không làm.
        for (RoleCode code : List.of(RoleCode.MANAGER, RoleCode.REVIEWER)) {
            assertThat(statusOf(runFamily(), code)).as("%s không được chạy", code).isEqualTo(403);
            assertThat(statusOf(createCandidate(), code)).as("%s không được tạo candidate", code).isEqualTo(403);
            assertThat(statusOf(createRegression(), code)).as("%s không được tạo regression", code).isEqualTo(403);
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
    void xoscExportAndCarlaRunRespectReadWriteRoles() throws Exception {
        stubServices();
        when(simulationViews.runVariantBundle(anyLong())).thenReturn(Map.of());
        when(runs.exportXosc(any())).thenReturn("<OpenSCENARIO />");
        for (RoleCode code : RoleCode.values()) {
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/runs/1/xosc"), code)).isEqualTo(200);
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/carla/status"), code)).isEqualTo(200);
        }
        for (RoleCode code : RoleCode.values()) {
            boolean writer = Set.of(RoleCode.ADMIN, RoleCode.ENGINEER, RoleCode.EXPERIENCER).contains(code);
            assertThat(statusOf(request(HttpMethod.POST, BASE + "/runs/1/carla"), code))
                    .isEqualTo(writer ? 202 : 403);
            assertThat(statusOf(request(HttpMethod.POST, BASE + "/scenarios/xosc")
                    .contentType(MediaType.APPLICATION_JSON).content("{}"), code))
                    .isEqualTo(writer ? 200 : 403);
        }
    }

    @Test
    void regressionExportsAndDecisionHistoryAreReadOnlyForEveryRole() throws Exception {
        stubServices();
        when(regressionReports.exportCsv(anyLong())).thenReturn("variant\r\n");
        for (RoleCode code : RoleCode.values()) {
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/regression/1/export.json"), code)).as("%s tải JSON", code).isEqualTo(200);
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/regression/1/export.csv"), code)).as("%s tải CSV", code).isEqualTo(200);
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/decisions"), code)).as("%s xem lịch sử", code).isEqualTo(200);
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
