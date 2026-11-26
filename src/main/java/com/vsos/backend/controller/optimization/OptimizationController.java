package com.vsos.backend.controller.optimization;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.vsos.backend.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import com.vsos.backend.common.Json;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.optimization.OptimizationService;
import com.vsos.backend.exception.analysis.FailureAnalysisException;

/** HTTP của tối ưu MOBO {@code /api/v1/vehicsim/optimizations}: tạo, xem, hủy campaign, trial, Pareto, chọn candidate. */
@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim · Optimization", description = "Tối ưu MOBO 4 tham số AEB")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class OptimizationController {

    private final OptimizationService optimization;
    private final VehicSimAccess access;

    public record OptimizationRequest(
            @JsonProperty("scenario_id") @NotNull Long scenarioId,
            @JsonProperty("base_aeb_version_id") Long baseAebVersionId,
            @JsonProperty("max_trials") Integer maxTrials,
            @JsonProperty("n_initial_points") Integer nInitialPoints,
            @JsonProperty("name") @Size(max = 150) String name,
            @JsonProperty("search_space") Map<String, Object> searchSpace,
            @JsonProperty("objective_config") Map<String, Object> objectiveConfig,
            @JsonProperty("simulator_type") String simulatorType,
            @JsonProperty("dataset_id") Long datasetId,
            @JsonProperty("dataset_digest") @Size(max = 64) String datasetDigest,
            @JsonProperty("handoff_id") @Size(max = 36) String handoffId,
            @JsonProperty("handoff_digest") @Size(max = 64) String handoffDigest) {
    }

    @Operation(summary = "Tạo và bắt đầu Optimization Run bằng MOBO")
    @PostMapping("/optimizations")
    public ResponseEntity<Map<String, Object>> createOptimization(
            @Valid @RequestBody OptimizationRequest body,
            @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "optimization");
        String searchSpaceJson = body.searchSpace() != null ? Json.write(body.searchSpace()) : null;
        String objectiveConfigJson = body.objectiveConfig() != null ? Json.write(body.objectiveConfig()) : null;

        long runId = optimization.createAndStartRun(
                access.projectId(), uid, body.scenarioId(), body.baseAebVersionId(),
                body.maxTrials(), body.nInitialPoints(), searchSpaceJson, objectiveConfigJson, body.name(),
                body.simulatorType(), body.datasetId(), body.datasetDigest(), body.handoffId(), body.handoffDigest());

        return ResponseEntity.status(HttpStatus.CREATED).body(optimization.getRun(access.projectId(), runId));
    }

    @Operation(summary = "Danh sách Optimization Runs")
    @GetMapping("/optimizations")
    public List<Map<String, Object>> listOptimizations() {
        return optimization.listRuns(access.projectId());
    }

    @Operation(summary = "Chi tiết một Optimization Run")
    @GetMapping("/optimizations/{id}")
    public Map<String, Object> getOptimization(@PathVariable long id) {
        return optimization.getRun(access.projectId(), id);
    }

    @Operation(summary = "Danh sách Optimization Trials của một Run")
    @GetMapping("/optimizations/{id}/trials")
    public List<Map<String, Object>> listOptimizationTrials(@PathVariable long id) {
        return optimization.listTrials(access.projectId(), id);
    }

    @Operation(summary = "Lấy tập nghiệm Pareto-optimal của một Optimization Run")
    @GetMapping("/optimizations/{id}/pareto")
    public List<Map<String, Object>> getOptimizationPareto(@PathVariable long id) {
        return optimization.getParetoFront(access.projectId(), id);
    }

    @Operation(summary = "Huỷ một Optimization Run đang chạy")
    @PostMapping("/optimizations/{id}/cancel")
    public Map<String, Object> cancelOptimization(@PathVariable long id, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        optimization.cancelRun(access.projectId(), id, uid);
        return Json.obj("id", id, "status", "CANCELLED");
    }

    @Operation(summary = "Chọn Pareto Candidate và chuyển sang Verification Testing (Regression Test)")
    @PostMapping("/optimizations/{id}/select/{trialId}")
    public Map<String, Object> selectCandidateForVerification(
            @PathVariable long id,
            @PathVariable long trialId,
            @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireEngineer(user);
        access.limitWrites(uid, "select_candidate");
        return optimization.selectCandidateForVerification(access.projectId(), id, trialId, uid);
    }

    /** Keep controlled V3 source/approval failures at their contract status without exposing input or storage details. */
    @ExceptionHandler(FailureAnalysisException.class)
    public ResponseEntity<Map<String,Object>> handoffFault(FailureAnalysisException error) {
        String detail = switch (error.status) {
            case 400, 422 -> "Dữ liệu bàn giao chưa hợp lệ. Kiểm tra lại nguồn phân tích.";
            case 403 -> "Dự án hoặc workspace đang lưu trữ nên chỉ xem được.";
            case 404 -> "Không tìm thấy dữ liệu bàn giao trong dự án đang chọn.";
            case 409 -> "Dữ liệu bàn giao đã thay đổi hoặc chưa sẵn sàng. Kiểm tra lại nguồn rồi thử lại.";
            case 413 -> "Dữ liệu bàn giao vượt giới hạn tiếp nhận.";
            case 429 -> "Đang có quá nhiều yêu cầu. Chờ một lát rồi thử lại.";
            case 503 -> "Kho dữ liệu phân tích chưa sẵn sàng. Thử lại sau.";
            default -> "Không thể sử dụng dữ liệu bàn giao. Giữ nguyên dữ liệu và thử lại sau.";
        };
        return ResponseEntity.status(error.status).body(Json.obj("code", error.code, "detail", detail,
                "retryable", error.status == 429 || error.status == 503));
    }
}
