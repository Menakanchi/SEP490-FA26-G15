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
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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
 * MANAGER quản lý workspace và xem catalog xe chung; chỉ REVIEWER Accept / Reject. Chạy với bộ lọc bảo mật thật ({@link SecurityConfig}), hai controller thật
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
    private com.vsos.backend.service.simulation.RunCollectionService runCollections;
    @MockitoBean
    private VehicleCatalogService vehicles;
    @MockitoBean
    private ProjectAccess projects;

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
        when(projects.hasProject()).thenReturn(true);
        when(projects.currentProject()).thenReturn(new com.vsos.backend.repository.common.Row(Map.of("id", 1L)));
        when(projects.explicitProjectId(anyString())).thenReturn(1L);
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
            assertThat(statusOf(request(HttpMethod.GET,BASE+"/analysis/runs"),code)).isEqualTo(code == RoleCode.MANAGER ? 403 : 200);
            assertThat(statusOf(request(HttpMethod.GET,BASE+"/analysis/datasets/1/handoff"),code)).isEqualTo(code == RoleCode.MANAGER ? 403 : 200);
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
    void onlyReviewerAndEngineerCanDiscoverTheirWorkspaceProjectsWithoutResolvingTheSelectedProject() throws Exception {
        for (RoleCode code : RoleCode.values()) {
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/reviewer/projects"), code))
                    .isEqualTo(code == RoleCode.REVIEWER || code == RoleCode.ENGINEER ? 200 : 403);
        }
        verify(views, times(2)).reviewerProjects();
        verify(projects, never()).currentProject();
    }

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
    void managerCannotBypassTechnicalPagesUsingDirectApiRequests() throws Exception {
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/admin/users"), RoleCode.MANAGER)).isEqualTo(403);
        for (String path : List.of(
                "/context", "/projects", "/projects/1/journey", "/scenario-categories", "/families",
                "/families/1/variants", "/scenarios/describe", "/variants/1/collection", "/runs/1",
                "/carla/runs", "/telemetry/evaluate", "/failures", "/failures.csv",
                "/analysis/runs", "/analysis/v3/explorer/scenarios", "/analysis/v3/handoffs/1/download",
                "/aeb/versions", "/optimizations", "/optimizations/1/pareto", "/regression",
                "/regression/1/export.json", "/recommendations", "/decisions")) {
            for (HttpMethod method : List.of(HttpMethod.GET, HttpMethod.POST)) {
                assertThat(statusOf(request(method, BASE + path), RoleCode.MANAGER))
                        .as("MANAGER %s %s", method, path).isEqualTo(403);
                assertThat(mvc.perform(request(method, BASE + path)).andReturn().getResponse().getStatus())
                        .as("không đăng nhập %s %s", method, path).isEqualTo(401);
            }
        }
    }

    @Test
    void managerIsBlockedFromEveryMappedTechnicalControllerRoute() throws Exception {
        int checked = 0;
        for (var entry : handlerMapping.getHandlerMethods().entrySet()) {
            String type = entry.getValue().getBeanType().getPackageName();
            if (!List.of(".scenario", ".simulation", ".analysis", ".aeb", ".optimization", ".regression")
                    .stream().anyMatch(type::endsWith)) continue;
            for (String pattern : entry.getKey().getPathPatternsCondition().getPatternValues()) {
                String path = pattern.replaceAll("\\{[^}]+}", "1");
                for (var method : entry.getKey().getMethodsCondition().getMethods()) {
                    assertThat(statusOf(request(HttpMethod.valueOf(method.name()), path), RoleCode.MANAGER))
                            .as("MANAGER %s %s", method, pattern).isEqualTo(403);
                    checked++;
                }
            }
        }
        assertThat(checked).isGreaterThanOrEqualTo(50);
    }

    @Test
    void deletingFamilyRequiresWriteRoleAndRespectsProjectAndQuota() throws Exception {
        stubServices();
        for (RoleCode code : List.of(RoleCode.ADMIN, RoleCode.ENGINEER, RoleCode.EXPERIENCER)) {
            assertThat(statusOf(request(HttpMethod.DELETE, BASE + "/families/12"), code)).isEqualTo(204);
        }
        verify(families, times(3)).deleteFamily(1L, 12L);
        for (RoleCode code : List.of(RoleCode.MANAGER, RoleCode.REVIEWER)) {
            assertThat(statusOf(request(HttpMethod.DELETE, BASE + "/families/12"), code)).isEqualTo(403);
        }
        when(otp.hitRateLimit(eq("vs_family"), any(), org.mockito.ArgumentMatchers.anyInt())).thenReturn(true);
        assertThat(statusOf(request(HttpMethod.DELETE, BASE + "/families/12"), RoleCode.ENGINEER)).isEqualTo(429);
        verify(families, times(3)).deleteFamily(1L, 12L);
    }

    @Test
    void allRolesCanBrowseTheVehicleCatalog() throws Exception {
        stubServices();
        when(vehicles.detail(1L, 1L)).thenReturn(Map.of("id", 1L));
        when(vehicles.detail(null, 1L)).thenReturn(Map.of("id", 1L));
        for (RoleCode code : RoleCode.values()) {
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/vehicles"), code)).as("%s xem danh sách xe", code).isEqualTo(200);
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/vehicles/1"), code)).as("%s xem chi tiết xe", code).isEqualTo(200);
        }
    }

    /** Danh mục xe CARLA là chung (ADR-038): chưa có project (Experiencer chưa tạo, DB chưa bootstrap) vẫn mở được màn xe. */
    @Test
    void vehicleCatalogOpensWithoutAnyProject() throws Exception {
        stubServices();
        when(projects.hasProject()).thenReturn(false);
        when(vehicles.list(null)).thenReturn(List.of(Map.of("id", 1L)));
        when(vehicles.detail(null, 1L)).thenReturn(Map.of("id", 1L));
        for (RoleCode code : RoleCode.values()) {
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/vehicles"), code)).as("%s xem danh sách xe khi chưa có project", code).isEqualTo(200);
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/vehicles/1"), code)).as("%s xem chi tiết xe khi chưa có project", code).isEqualTo(200);
        }
        verify(projects, never()).currentProject();
        verify(vehicles, org.mockito.Mockito.atLeastOnce()).list(null);
    }

    @Test
    void managerViewsOnlyGlobalVehicleCatalogAndCannotWrite() throws Exception {
        when(vehicles.list(null)).thenReturn(List.of(Map.of("id", 1L)));
        when(vehicles.detail(null, 1L)).thenReturn(Map.of("id", 1L));
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/vehicles").header(ProjectAccess.PROJECT_HEADER, "999"), RoleCode.MANAGER)).isEqualTo(200);
        assertThat(statusOf(request(HttpMethod.GET, BASE + "/vehicles/1").header(ProjectAccess.PROJECT_HEADER, "999"), RoleCode.MANAGER)).isEqualTo(200);
        verify(vehicles).list(null);
        verify(vehicles).detail(null, 1L);
        verify(projects, never()).hasProject();
        for (HttpMethod method : List.of(HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE)) {
            for (String path : List.of("/vehicles", "/vehicles/1", "/vehicles/1/sensors")) {
                assertThat(statusOf(request(method, BASE + path), RoleCode.MANAGER)).as("%s %s", method, path).isEqualTo(403);
            }
        }
        assertThat(mvc.perform(request(HttpMethod.GET, BASE + "/vehicles")).andReturn().getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void technicalRolesCanReadButOnlyWriteRolesCanWrite() throws Exception {
        stubServices();
        for (RoleCode code : RoleCode.values()) {
            int expected = code == RoleCode.MANAGER ? 403 : 200;
            assertThat(statusOf(read(), code)).as("%s đọc được", code).isEqualTo(expected);
            assertThat(statusOf(analysisDataset(), code)).as("%s đọc tập phân tích được", code).isEqualTo(expected);
        }
        for (RoleCode code : List.of(RoleCode.ADMIN, RoleCode.ENGINEER, RoleCode.EXPERIENCER)) {
            assertThat(statusOf(runFamily(), code)).as("%s chạy được", code).isBetween(200, 299);
            assertThat(statusOf(createCandidate(), code)).as("%s tạo candidate được", code).isBetween(200, 299);
            assertThat(statusOf(createRegression(), code)).as("%s tạo regression được", code).isBetween(200, 299);
            assertThat(statusOf(describeScenario(), code)).as("%s mô tả được", code).isBetween(200, 299);
        }
        // MANAGER không được truy cập kỹ thuật; REVIEWER chỉ được chạy regression, không ghi kỹ thuật khác.
        for (RoleCode code : List.of(RoleCode.MANAGER, RoleCode.REVIEWER)) {
            assertThat(statusOf(runFamily(), code)).as("%s không được chạy", code).isEqualTo(403);
            assertThat(statusOf(createCandidate(), code)).as("%s không được tạo candidate", code).isEqualTo(403);
            assertThat(statusOf(createRegression(), code)).as("%s chạy regression", code).isEqualTo(code == RoleCode.REVIEWER ? 201 : 403);
            assertThat(statusOf(describeScenario(), code)).as("%s không được mô tả", code).isEqualTo(403);
        }
    }

    @Test
    void reviewerCanRunRegressionWithoutGainingScenarioOrCandidateWrites() throws Exception {
        stubServices();
        when(projects.explicitProjectId(anyString())).thenReturn(42L);
        assertThat(statusOf(createRegression().header(ProjectAccess.PROJECT_HEADER, "42"), RoleCode.REVIEWER)).isEqualTo(201);
        verify(regression).createTestAsReviewer(eq(42L), eq(7L), eq(2L), eq(1L), eq(true), eq(true), any(), any(), any());
        verify(regression, never()).createTest(anyLong(), anyLong(), anyLong(), anyLong(), anyBoolean(), anyBoolean(), any(), any(), any());
        assertThat(statusOf(runFamily(), RoleCode.REVIEWER)).isEqualTo(403);
        assertThat(statusOf(createCandidate(), RoleCode.REVIEWER)).isEqualTo(403);
        assertThat(statusOf(describeScenario(), RoleCode.REVIEWER)).isEqualTo(403);
    }

    @Test
    void reviewerRegressionRequiresAnExplicitProjectAndHonoursWriteQuota() throws Exception {
        stubServices();
        when(otp.hitRateLimit(eq("vs_regression"), any(), org.mockito.ArgumentMatchers.anyInt())).thenReturn(true);
        assertThat(statusOf(createRegression(), RoleCode.REVIEWER)).isEqualTo(429);
        when(projects.explicitProjectId(anyString())).thenThrow(new com.vsos.backend.common.Vs.InvalidRequestException("Cần chọn project"));
        assertThat(statusOf(createRegression(), RoleCode.REVIEWER)).isEqualTo(400);
        verify(regression, never()).createTestAsReviewer(anyLong(), anyLong(), anyLong(), anyLong(), anyBoolean(), anyBoolean(), any(), any(), any());
    }

    @Test
    void onlyReviewerCanAcceptOrReject() throws Exception {
        stubServices();
        assertThat(statusOf(decide(), RoleCode.REVIEWER)).isBetween(200, 299);
        for (RoleCode code : List.of(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.ENGINEER, RoleCode.EXPERIENCER)) {
            assertThat(statusOf(decide(), code)).as("%s không được duyệt", code).isEqualTo(403);
        }
    }

    /** Reviewer ngoài workspace của project: danh sách rỗng, chi tiết / tải / quyết định 404 — không lộ là có regression. */
    @Test
    void reviewerOutsideTheProjectWorkspaceSeesNoRegressionAndCannotDecide() throws Exception {
        stubServices();
        when(projects.hasProject()).thenReturn(false);
        for (String path : List.of("/recommendations", "/regression", "/decisions")) {
            assertThat(statusOf(request(HttpMethod.GET, BASE + path), RoleCode.REVIEWER)).as(path).isEqualTo(200);
        }
        assertThat(mvc.perform(request(HttpMethod.GET, BASE + "/recommendations").with(user(as(RoleCode.REVIEWER))))
                .andReturn().getResponse().getContentAsString()).isEqualTo("[]");
        for (String path : List.of("/recommendations/1", "/regression/1", "/regression/1/export.json", "/regression/1/export.csv",
                "/regression/preview?scenario_id=1&include_variants=true")) {
            assertThat(statusOf(request(HttpMethod.GET, BASE + path), RoleCode.REVIEWER)).as(path).isEqualTo(404);
        }
        assertThat(statusOf(decide(), RoleCode.REVIEWER)).isEqualTo(404);
        assertThat(statusOf(createRegression(), RoleCode.REVIEWER)).isEqualTo(404);
        verify(regressionViews, never()).recommendations();
        verify(regression, never()).preview(anyLong(), anyLong(), any(), anyBoolean());
        verify(reviewDecisions, never()).decide(anyLong(), anyLong(), anyLong(), any(), any(), any(), anyBoolean());
        verify(regression, never()).createTestAsReviewer(anyLong(), anyLong(), anyLong(), anyLong(), anyBoolean(), anyBoolean(), any(), any(), any());
    }

    @Test
    void xoscExportAndCarlaRunRespectReadWriteRoles() throws Exception {
        stubServices();
        when(simulationViews.runVariantBundle(anyLong())).thenReturn(Map.of());
        when(runs.exportXosc(any())).thenReturn("<OpenSCENARIO />");
        when(simulationViews.familyXoscZip(anyLong())).thenReturn(new byte[] {'P', 'K'});
        for (RoleCode code : RoleCode.values()) {
            int expected = code == RoleCode.MANAGER ? 403 : 200;
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/runs/1/xosc"), code)).isEqualTo(expected);
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/families/1/xosc.zip"), code)).as("%s tải zip .xosc của họ", code).isEqualTo(expected);
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/carla/status"), code)).isEqualTo(expected);
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
    void regressionExportsAndDecisionHistoryAreAvailableToTechnicalRoles() throws Exception {
        stubServices();
        when(regressionReports.exportCsv(anyLong())).thenReturn("variant\r\n");
        for (RoleCode code : RoleCode.values()) {
            int expected = code == RoleCode.MANAGER ? 403 : 200;
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/regression/1/export.json"), code)).as("%s tải JSON", code).isEqualTo(expected);
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/regression/1/export.csv"), code)).as("%s tải CSV", code).isEqualTo(expected);
            assertThat(statusOf(request(HttpMethod.GET, BASE + "/decisions"), code)).as("%s xem lịch sử", code).isEqualTo(expected);
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
