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
            @JsonProperty("objective_config") Map<String, Object> objectiveConfig) {
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
                body.maxTrials(), body.nInitialPoints(), searchSpaceJson, objectiveConfigJson, body.name());

        return ResponseEntity.status(HttpStatus.CREATED).body(Json.obj("id", runId, "status", "RUNNING"));
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
}
