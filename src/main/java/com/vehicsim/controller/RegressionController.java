package com.vehicsim.controller;

import com.vehicsim.config.OpenApiConfig;
import com.vehicsim.dto.RegressionRequests.CreateRegressionRequest;
import com.vehicsim.dto.RegressionRequests.DecisionRequest;
import com.vehicsim.dto.RegressionResponses.CreateRegressionResponse;
import com.vehicsim.dto.RegressionResponses.DecisionHistory;
import com.vehicsim.dto.RegressionResponses.RecommendationDetailResponse;
import com.vehicsim.dto.RegressionResponses.RecommendationListItem;
import com.vehicsim.dto.RegressionResponses.RegressionDetailResponse;
import com.vehicsim.dto.RegressionResponses.RegressionExport;
import com.vehicsim.dto.RegressionResponses.RegressionListResponse;
import com.vehicsim.dto.RegressionResponses.RegressionPreviewResponse;
import com.vehicsim.service.RegressionCodes;
import com.vehicsim.service.RegressionReportService;
import com.vehicsim.service.RegressionService;
import com.vehicsim.service.RegressionViewService;
import com.vehicsim.service.ReviewDecisionService;
import com.vehicsim.vehicsim.VehicSimAccess;
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

/**
 * HTTP của màn 5: regression test, khuyến nghị, quyết định Reviewer, gói xuất và lịch sử ({@code /api/v1/vehicsim/...}, cùng tiền tố
 * với {@code VehicSimController}). Đọc: mọi role đã đăng nhập; tạo regression: ADMIN / ENGINEER / EXPERIENCER; quyết định: chỉ REVIEWER
 * (luật ở {@link VehicSimAccess}). Lớp này chỉ nhận request; nghiệp vụ ở các service, lỗi đổi thành mã HTTP ở ApiExceptionHandler.
 */
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

    // ------------------------------------------------------------------ regression test

    @Operation(summary = "Danh sách regression test")
    @GetMapping("/regression")
    public RegressionListResponse listRegression(@RequestParam(name = "status", required = false) String status) {
        return views.regressionList(status);
    }

    @Operation(summary = "Số liệu khung Run summary trước khi tạo regression")
    @GetMapping("/regression/preview")
    public RegressionPreviewResponse previewRegression(@RequestParam(name = "scenario_id") long scenarioId,
                                                       @RequestParam(name = "variant_ids", required = false) List<Long> variantIds,
                                                       @RequestParam(name = "include_variants", defaultValue = "false") boolean includeVariants) {
        if (variantIds != null && variantIds.size() > 300) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "variant_ids tối đa 300 biến thể");
        }
        return regression.preview(access.projectId(), scenarioId, variantIds, includeVariants);
    }

    @Operation(summary = "Tạo regression test: candidate vs baseline trên một họ kịch bản")
    @PostMapping("/regression")
    public ResponseEntity<CreateRegressionResponse> createRegression(@Valid @RequestBody CreateRegressionRequest body,
                                                                     @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "regression");
        Map<String, Map<String, Object>> criteria = new LinkedHashMap<>();
        if (body.criteria() != null) {
            body.criteria().forEach((k, v) -> {
                Map<String, Object> cleaned = new LinkedHashMap<>(v);
                cleaned.values().removeIf(Objects::isNull); // như exclude_none
                criteria.put(k, cleaned);
            });
        }
        long id = regression.createTest(access.projectId(), uid, body.candidateVersionId(), body.scenarioId(),
                body.includeOldCritical() == null || body.includeOldCritical(), body.includeAllVariants() == null || body.includeAllVariants(),
                criteria, body.name(), body.variantIds());
        return ResponseEntity.status(HttpStatus.CREATED).body(new CreateRegressionResponse(id, RegressionCodes.testCode(id)));
    }

    @Operation(summary = "Chi tiết một regression test")
    @GetMapping("/regression/{testId}")
    public RegressionDetailResponse getRegression(@PathVariable long testId) {
        return views.regressionDetail(testId);
    }

    // ------------------------------------------------------------------ gói xuất, lịch sử

    @Operation(summary = "Tải gói kết quả của một regression đã chạy xong (JSON)")
    @GetMapping("/regression/{testId}/export.json")
    public ResponseEntity<RegressionExport> exportRegressionJson(@PathVariable long testId) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + RegressionCodes.testCode(testId) + ".json\"")
                .body(reports.export(testId));
    }

    @Operation(summary = "Tải gói kết quả của một regression đã chạy xong (CSV, mỗi dòng một cặp baseline–candidate)")
    @GetMapping("/regression/{testId}/export.csv")
    public ResponseEntity<byte[]> exportRegressionCsv(@PathVariable long testId) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + RegressionCodes.testCode(testId) + ".csv\"")
                .body(reports.exportCsv(testId).getBytes(StandardCharsets.UTF_8));
    }

    @Operation(summary = "Lịch sử quyết định của Reviewer và chuỗi baseline")
    @GetMapping("/decisions")
    public DecisionHistory decisionHistory() {
        return reports.decisionHistory();
    }

    // ------------------------------------------------------------------ khuyến nghị, quyết định

    @Operation(summary = "Danh sách khuyến nghị kỹ thuật")
    @GetMapping("/recommendations")
    public List<RecommendationListItem> listRecommendations() {
        return views.recommendations();
    }

    @Operation(summary = "Chi tiết một khuyến nghị")
    @GetMapping("/recommendations/{testId}")
    public RecommendationDetailResponse getRecommendation(@PathVariable long testId) {
        return views.recommendationDetail(testId);
    }

    @Operation(summary = "Reviewer Accept / Reject / yêu cầu thêm test", description = "Chỉ role REVIEWER; người tạo khuyến nghị không tự duyệt.")
    @PostMapping("/recommendations/{testId}/decision")
    public RecommendationDetailResponse decide(@PathVariable long testId, @Valid @RequestBody DecisionRequest body,
                                               @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireReviewer(user);
        if (!RegressionCodes.DECISIONS.contains(body.decision())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "decision phải thuộc [ACCEPT, REJECT, REQUEST_MORE_TESTS]");
        }
        decisions.decide(access.projectId(), testId, uid, body.decision(), body.reason(), body.conditions(), body.confirmed());
        return views.recommendationDetail(testId);
    }
}
