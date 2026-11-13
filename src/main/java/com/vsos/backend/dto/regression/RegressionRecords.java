package com.vsos.backend.dto.regression;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class RegressionRecords {

    private RegressionRecords() {
    }

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

        public Object scenarioSet() {
            return passCriteria.get("scenario_set");
        }

        public boolean completed() {
            return "COMPLETED".equals(executionStatus);
        }
    }

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

    public record DecidedRecommendation(
            long testId,
            long candidateVersionId,
            long baselineVersionId,
            String decision,
            Long reviewedBy,
            LocalDateTime reviewedAt,
            String reviewNotes,
            String reviewConditions,
            long decisionId,
            String reviewerName,
            String source) {
    }

    public record CandidateRun(long id, long scenarioVersionId, long baselineRunId) {
    }

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

        public String outcome() {
            return "COMPLETED".equals(status) ? Vs.classifyOutcome(collision, minTtcS, minDistanceM) : null;
        }
    }

    public record RunInfo(long id, Long randomSeed, Double fixedDeltaSeconds, Double maxDurationS) {
    }

    public record VehicleInfo(String carlaBlueprintId, String displayName, Double massKg, Double maxBrakeDecelMps2) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ScenarioSet(String mode, boolean oldCritical, boolean allVariants, int oldCriticalCount, int variantCount,
                              List<Long> variantIds, long safeCount) {
    }
}
