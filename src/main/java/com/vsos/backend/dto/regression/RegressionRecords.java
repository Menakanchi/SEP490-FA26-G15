package com.vsos.backend.dto.regression;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Dòng dữ liệu {@code RegressionRepository} đọc từ các bảng của màn 5 — dùng nội bộ giữa repository và service, không trả ra API.
 * Bảng của phần khác (aeb_versions, scenarios, scenario_versions, run baseline) vẫn trả {@code Row} như {@code Queries}, vì
 * {@code RunService} nhận {@code Row} khi ghép run regression với run baseline.
 */
public final class RegressionRecords {

    private RegressionRecords() {
    }

    /** Một dòng {@code regression_tests}; {@code passCriteria} là cột JSON đã đọc ra Map. */
    public record RegressionTestRow(
            long id,
            long projectId,
            long scenarioId,
            long baselineVersionId,
            long candidateVersionId,
            long vehicleModelId,
            String simulatorVersion,
            String name,
            Map<String, Object> passCriteria,
            String executionStatus,
            String verdict,
            Long fixedScenarios,
            Long regressedScenarios,
            long createdBy,
            LocalDateTime createdDate,
            LocalDateTime finishedAt) {

        public Map<String, Object> criteria() {
            return Json.asMap(passCriteria.get("criteria"));
        }

        /** Bộ kịch bản đã chọn lúc tạo test (null nếu thiếu) — trả nguyên văn để test cũ khác dạng vẫn đọc được. */
        public Object scenarioSet() {
            return passCriteria.get("scenario_set");
        }

        public boolean completed() {
            return "COMPLETED".equals(executionStatus);
        }
    }

    /** Một dòng {@code engineering_recommendations}. */
    public record RecommendationRow(
            long id,
            long testId,
            long candidateVersionId,
            String status,
            long createdBy,
            Long reviewedBy,
            LocalDateTime reviewedAt,
            String reviewNotes,
            String reviewConditions,
            LocalDateTime updatedAt) {
    }

    /** Khuyến nghị đã có quyết định, kèm baseline của test — cho lịch sử quyết định. */
    public record DecidedRecommendation(
            long testId,
            long candidateVersionId,
            long baselineVersionId,
            String status,
            Long reviewedBy,
            LocalDateTime reviewedAt,
            String reviewNotes,
            String reviewConditions) {
    }

    /** Run REGRESSION của một test và run baseline nó được ghép (cùng biến thể + seed + xe + bộ mô phỏng). */
    public record CandidateRun(long id, long scenarioVersionId, long baselineRunId) {
    }

    /** Số đo một run mà regression cần; ba mục tiêu ADR-040 chỉ để hiển thị, không vào tiêu chí. */
    public record RunResult(
            long id,
            String status,
            boolean collision,
            Double minTtcS,
            Double minDistanceM,
            Double impactSpeedMps,
            boolean falseActivation,
            String verdict,
            Double rmsJerkMps3,
            Double stoppingDistanceM) {

        /** SAFE / NEAR_MISS / COLLISION khi run đã COMPLETED, còn lại null. */
        public String outcome() {
            return "COMPLETED".equals(status) ? Vs.classifyOutcome(collision, minTtcS, minDistanceM) : null;
        }
    }

    /** Seed và bước thời gian của một run — cho manifest gói xuất. */
    public record RunInfo(long id, Long randomSeed, Double fixedDeltaSeconds, Double maxDurationS) {
    }

    /** Thông tin xe ghi vào manifest. */
    public record VehicleInfo(String carlaBlueprintId, String displayName, Double massKg, Double maxBrakeDecelMps2) {
    }

    /**
     * Bộ kịch bản lưu trong {@code pass_criteria_json.scenario_set}. {@code variant_ids} null khi không chọn tay; giữ đúng các khoá
     * mà màn chi tiết và gói xuất đã đọc.
     */
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ScenarioSet(String mode, boolean oldCritical, boolean allVariants, int oldCriticalCount, int variantCount,
                              List<Long> variantIds, long safeCount) {
    }
}
