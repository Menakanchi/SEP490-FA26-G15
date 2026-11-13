package com.vsos.backend.dto.regression;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

import java.util.List;
import java.util.Map;

public final class RegressionResponses {

    private RegressionResponses() {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record VersionRef(long id, String label, String status) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Progress(long done, long total) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ParameterDiff(String code, String name, String unit, String category, Double baseline, Double candidate, boolean changed) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record KeyParameter(String code, String name, String unit, Double baseline, Double candidate, boolean changed) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record CandidateSource(String type, Long optimizationRunId, String campaignName, Long trialId, Integer trialNumber) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record SimulatorCaveat(boolean carla, boolean calibrated) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record PairResult(
            long variantId,
            String label,
            String summary,
            String family,
            long baselineRunId,
            long candidateRunId,
            String baselineOutcome,
            String candidateOutcome,
            String baselineVerdict,
            String candidateVerdict,
            boolean baselineFalseActivation,
            boolean candidateFalseActivation,
            Double minTtcDeltaS,
            Double candidateImpactKmh,
            String change,
            Double baselineRmsJerkMps3,
            Double candidateRmsJerkMps3,
            Double baselineImpactSpeedMps,
            Double candidateImpactSpeedMps,
            Double baselineStoppingDistanceM,
            Double candidateStoppingDistanceM) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record CriterionResult(String key, String label, Object enabled, Object required, Object threshold, Object actual, boolean passed) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Counts(int scenarios, int fixed, int regressed, int unchanged, int newCollisions) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Rates(double collisionBaselinePct, double collisionCandidatePct, double falseActivationBaselinePct,
                        double falseActivationCandidatePct) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record MedianTtc(Double baseline, Double candidate, Double delta) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record FamilyResult(long scenarioId, String name, int scenarios, int fixed, int regressed, Double medianTtcDelta) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record RegressionSummary(
            Counts counts,
            Map<String, Map<String, Integer>> transitions,
            Rates rates,
            MedianTtc medianMinTtc,
            List<FamilyResult> families,
            List<CriterionResult> criteria,
            List<PairResult> pairs,
            String error) {

        public static final RegressionSummary EMPTY = new RegressionSummary(null, null, null, null, null, null, null, null);

        public static RegressionSummary failed(String message) {
            return new RegressionSummary(null, null, null, null, null, null, null, message);
        }
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record RegressionListItem(
            long id,
            String code,
            String name,
            String baseline,
            String candidate,
            long candidateVersionId,
            String status,
            String reviewDecision,
            Object scenarios,
            Progress progress,
            Long fixed,
            Long regressed,
            String createdBy,
            String createdAt) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record RunningProgress(String code, long done, long total) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record RegressionKpis(int total, long passed, long failed, long running, RunningProgress runningProgress, String since) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record RegressionListResponse(RegressionKpis kpis, List<RegressionListItem> items) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record RegressionDetailResponse(
            long id,
            String code,
            String recommendationCode,
            String name,
            String status,
            String reviewDecision,
            String family,
            long scenarioId,
            VersionRef baseline,
            VersionRef candidate,
            List<KeyParameter> keyParameters,
            List<ParameterDiff> parameterDiff,
            Map<String, Object> passCriteria,
            String simulator,
            SimulatorCaveat simulatorCaveat,
            CandidateSource candidateSource,
            Progress progress,
            String createdBy,
            String createdAt,
            RegressionSummary summary) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record CreateRegressionResponse(long id, String code) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record PreviewVariant(long id, String label, String summary, String baselineOutcome, Boolean baselineFalseActivation,
                                 boolean hasBaselineRun, boolean safe, boolean oldCritical) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record RegressionPreviewResponse(
            long scenarioId,
            String family,
            String baseline,
            String simulator,
            int variantCount,
            int oldCriticalCount,
            int baselineRunsExisting,
            Integer selectedCount,
            Long selectedOldCriticalCount,
            Long selectedSafeCount,
            Long selectedBaselineRunsExisting,
            List<PreviewVariant> variants) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record RecommendationListItem(long id, String code, String regressionCode, String baseline, String candidate, String status,
                                         Rates rates, Counts counts, String createdAt) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ExpectedEffect(List<Double> collisionRate, List<Double> falseActivation, List<Double> medianMinTtc, Integer fixed,
                                 long regressed) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Evidence(String key, String title, String status, String detail) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ReviewInfo(String decision, String reviewedBy, String reviewedAt, String note, String conditions, String requestedBy) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record RecommendationDetailResponse(
            @JsonUnwrapped RegressionDetailResponse detail,
            String recommendationStatus,
            String recommendationStatusLabel,
            List<ParameterDiff> changedParameters,
            ExpectedEffect expectedEffect,
            List<String> tradeoffs,
            String confidence,
            List<Evidence> evidence,
            ReviewInfo review) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ExportVehicle(String carlaBlueprintId, String displayName, Double massKg, Double maxBrakeDecelMps2) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ExportScenario(long id, String code, String name) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ExportVersion(long id, String label) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ExportCandidate(long id, String label, CandidateSource source) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ExportManifest(
            String schema,
            String exportedAt,
            String regressionCode,
            String recommendationCode,
            String simulatorVersion,
            SimulatorCaveat simulatorCaveat,
            ExportVehicle vehicle,
            Double dtS,
            Double maxDurationS,
            String bundleSchema,
            String codeVersion,
            ExportScenario scenario,
            Object scenarioSet,
            ExportVersion baseline,
            ExportCandidate candidate,
            String status,
            String createdBy,
            String createdAt,
            String finishedAt) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ExportPair(
            long variantId,
            String variant,
            long baselineRunId,
            long candidateRunId,
            Long seed,
            String baselineOutcome,
            String candidateOutcome,
            String change,
            boolean baselineFalseActivation,
            boolean candidateFalseActivation,
            Double minTtcDeltaS,
            String baselineXoscUrl,
            String candidateXoscUrl,
            Double baselineRmsJerkMps3,
            Double candidateRmsJerkMps3,
            Double baselineImpactSpeedMps,
            Double candidateImpactSpeedMps,
            Double baselineStoppingDistanceM,
            Double candidateStoppingDistanceM) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ExportDecision(String status, String reviewedBy, String reviewedAt, String reason, String conditions) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record RegressionExport(
            ExportManifest manifest,
            List<ParameterDiff> parameters,
            List<CriterionResult> criteria,
            Counts counts,
            Rates rates,
            MedianTtc medianMinTtc,
            List<ExportPair> pairs,
            ExportDecision decision) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record DecisionItem(String recommendationCode, String regressionCode, long testId, String baseline, String candidate,
                               String decision, String reviewedBy, String reviewedAt, String reason, String conditions,
                               long id, long reviewedByUserId, String source) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record BaselineItem(long id, long versionNo, String label, String status, String promotedBy, String promotedAt,
                               String regressionCode, String reason) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record DecisionHistory(List<DecisionItem> decisions, List<BaselineItem> baselines) {
    }
}
