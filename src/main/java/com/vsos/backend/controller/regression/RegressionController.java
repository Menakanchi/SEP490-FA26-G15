package com.vsos.backend.controller.regression;

import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.config.OpenApiConfig;
import com.vsos.backend.dto.regression.RegressionRequests.CreateRegressionRequest;
import com.vsos.backend.dto.regression.RegressionRequests.DecisionRequest;
import com.vsos.backend.dto.regression.RegressionResponses.CreateRegressionResponse;
import com.vsos.backend.dto.regression.RegressionResponses.DecisionHistory;
import com.vsos.backend.dto.regression.RegressionResponses.RecommendationDetailResponse;
import com.vsos.backend.dto.regression.RegressionResponses.RecommendationListItem;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionDetailResponse;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionExport;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionKpis;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionListResponse;
import com.vsos.backend.dto.regression.RegressionResponses.RegressionPreviewResponse;
import com.vsos.backend.security.ProjectAccess;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.regression.RegressionCodes;
import com.vsos.backend.service.regression.RegressionReportService;
import com.vsos.backend.service.regression.RegressionService;
import com.vsos.backend.service.regression.RegressionViewService;
import com.vsos.backend.service.regression.ReviewDecisionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim · Regression", description = "Regression cùng seed → khuyến nghị → Reviewer Accept / Reject; gói xuất và lịch sử")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class RegressionController {

    private final RegressionService regression;
    private final ReviewDecisionService decisions;
    private final RegressionReportService reports;
    private final RegressionViewService views;
    private final VehicSimAccess access;
    private final ProjectAccess projects;

    @Operation(summary = "Danh sách regression test")
    @GetMapping("/regression")
    public RegressionListResponse listRegression(@RequestParam(name = "status", required = false) String status,
                                                 @AuthenticationPrincipal UserDetails user) {
        if (hidden()) {
            return new RegressionListResponse(new RegressionKpis(0, 0, 0, 0, null, null), List.of());
        }
        return views.regressionList(status);
    }

    @Operation(summary = "Số liệu khung Run summary trước khi tạo regression")
    @GetMapping("/regression/preview")
    public RegressionPreviewResponse previewRegression(@RequestParam(name = "scenario_id") long scenarioId,
                                                       @RequestParam(name = "variant_ids", required = false) List<Long> variantIds,
                                                       @RequestParam(name = "include_variants", defaultValue = "false") boolean includeVariants,
                                                       @AuthenticationPrincipal UserDetails user) {
        requireVisible();
        if (variantIds != null && variantIds.size() > 300) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "variant_ids tối đa 300 biến thể");
        }
        return regression.preview(access.projectId(), scenarioId, variantIds, includeVariants);
    }

    @Operation(summary = "Tạo regression test: candidate vs baseline trên một họ kịch bản")
    @PostMapping("/regression")
    public ResponseEntity<CreateRegressionResponse> createRegression(@Valid @RequestBody CreateRegressionRequest body,
                                                                     @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireRegressionRunner(user);
        boolean reviewer = "REVIEWER".equals(VehicSimAccess.roleOf(user));
        if (reviewer) requireVisible();
        long projectId = reviewer ? projects.explicitProjectId() : access.projectId();
        access.limitWrites(uid, "regression");

        boolean includeOldCritical = body.includeOldCritical() == null || body.includeOldCritical();
        boolean includeAllVariants = body.includeAllVariants() == null || body.includeAllVariants();
        Map<String, Map<String, Object>> criteria = cleanCriteria(body.criteria());
        long id = reviewer
                ? regression.createTestAsReviewer(projectId, uid, body.candidateVersionId(), body.scenarioId(),
                        includeOldCritical, includeAllVariants, criteria, body.name(), body.variantIds())
                : regression.createTest(projectId, uid, body.candidateVersionId(), body.scenarioId(),
                        includeOldCritical, includeAllVariants, criteria, body.name(), body.variantIds());
        return ResponseEntity.status(HttpStatus.CREATED).body(new CreateRegressionResponse(id, RegressionCodes.testCode(id)));
    }

    @Operation(summary = "Chi tiết một regression test")
    @GetMapping("/regression/{testId}")
    public RegressionDetailResponse getRegression(@PathVariable long testId, @AuthenticationPrincipal UserDetails user) {
        requireVisible();
        return views.regressionDetail(testId);
    }

    @Operation(summary = "Tải gói kết quả của một regression đã chạy xong (JSON)")
    @GetMapping("/regression/{testId}/export.json")
    public ResponseEntity<RegressionExport> exportRegressionJson(@PathVariable long testId, @AuthenticationPrincipal UserDetails user) {
        requireVisible();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + RegressionCodes.testCode(testId) + ".json\"")
                .body(reports.export(testId));
    }

    @Operation(summary = "Tải gói kết quả của một regression đã chạy xong (CSV, mỗi dòng một cặp baseline–candidate)")
    @GetMapping("/regression/{testId}/export.csv")
    public ResponseEntity<byte[]> exportRegressionCsv(@PathVariable long testId, @AuthenticationPrincipal UserDetails user) {
        requireVisible();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + RegressionCodes.testCode(testId) + ".csv\"")
                .body(reports.exportCsv(testId).getBytes(StandardCharsets.UTF_8));
    }

    @Operation(summary = "Lịch sử quyết định của Reviewer và chuỗi baseline")
    @GetMapping("/decisions")
    public DecisionHistory decisionHistory(@AuthenticationPrincipal UserDetails user) {
        if (hidden()) {
            return new DecisionHistory(List.of(), List.of());
        }
        return reports.decisionHistory();
    }

    @Operation(summary = "Danh sách khuyến nghị kỹ thuật")
    @GetMapping("/recommendations")
    public List<RecommendationListItem> listRecommendations(@AuthenticationPrincipal UserDetails user) {
        if (hidden()) {
            return List.of();
        }
        return views.recommendations();
    }

    @Operation(summary = "Chi tiết một khuyến nghị")
    @GetMapping("/recommendations/{testId}")
    public RecommendationDetailResponse getRecommendation(@PathVariable long testId, @AuthenticationPrincipal UserDetails user) {
        requireVisible();
        return views.recommendationDetail(testId);
    }

    @Operation(summary = "Reviewer Accept / Reject / yêu cầu thêm test",
            description = "Chỉ role REVIEWER là thành viên workspace của project; người tạo khuyến nghị không tự duyệt.")
    @PostMapping("/recommendations/{testId}/decision")
    public RecommendationDetailResponse decide(@PathVariable long testId, @Valid @RequestBody DecisionRequest body,
                                               @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireReviewer(user);
        requireVisible();
        if (!RegressionCodes.DECISIONS.contains(body.decision())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "decision phải thuộc [ACCEPT, REJECT, REQUEST_MORE_TESTS]");
        }
        decisions.decide(projects.explicitProjectId(), testId, uid, body.decision(), body.reason(), body.conditions(), body.confirmed());
        return views.recommendationDetail(testId);
    }

    private boolean hidden() {
        return !projects.hasProject();
    }

    private void requireVisible() {
        if (hidden()) {
            throw new NotFoundException("regression test");
        }
    }

    private static Map<String, Map<String, Object>> cleanCriteria(Map<String, Map<String, Object>> raw) {
        Map<String, Map<String, Object>> criteria = new LinkedHashMap<>();
        if (raw != null) {
            raw.forEach((key, value) -> {
                Map<String, Object> cleaned = new LinkedHashMap<>(value);
                cleaned.values().removeIf(Objects::isNull);
                criteria.put(key, cleaned);
            });
        }
        return criteria;
    }
}
