package com.vehicsim.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

import java.util.List;
import java.util.Map;

/**
 * Dữ liệu trả về của các màn regression / khuyến nghị / quyết định (màn 5). Tên trường camelCase trong Java, ra JSON snake_case
 * ({@code @JsonNaming}) đúng như payload cũ để {@code frontend/src/types/vehicsim.ts} không phải đổi. Giá trị null vẫn được ghi
 * (khoá có mặt, giá trị null) trừ những chỗ ghi rõ {@code NON_NULL}: khoá đó vắng mặt hẳn khi không có dữ liệu, như trước.
 */
public final class RegressionResponses {

    private RegressionResponses() {
    }

    // ------------------------------------------------------------------ dùng chung

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record VersionRef(long id, String label, String status) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Progress(long done, long total) {
    }

    /** Một tham số AEB trước / sau; {@code category} là nhóm lỗi tham số này xử lý. */
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ParameterDiff(String code, String name, String unit, String category, Double baseline, Double candidate, boolean changed) {
    }

    /** Thẻ tham số chính ở đầu màn chi tiết (không có {@code category}). */
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record KeyParameter(String code, String name, String unit, Double baseline, Double candidate, boolean changed) {
    }

    /** Candidate tạo thủ công hay từ một chiến dịch tối ưu; các trường chiến dịch null khi chưa có dữ liệu tối ưu. */
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record CandidateSource(String type, Long optimizationRunId, String campaignName, Long trialId, Integer trialNumber) {
    }

    /** Có khi test chạy trên CARLA: phanh chưa hiệu chuẩn, số chỉ để quan sát / đối chiếu (TD-17). */
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record SimulatorCaveat(boolean carla, boolean calibrated) {
    }

    // ------------------------------------------------------------------ kết quả so sánh baseline – candidate

    /** Một cặp run cùng biến thể + seed; ba mục tiêu ADR-040 đọc thẳng từ cột worker đã ghi (null = không phanh / không va chạm). */
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

    /** Kết quả một tiêu chí; {@code enabled} / {@code required} / {@code threshold} lấy nguyên từ tiêu chí đã lưu của test. */
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

    /**
     * Bảng tổng hợp của một test, tính lại từ run. Test chưa xong: mọi trường null nên ra {@code {}}; test có run hỏng: chỉ có
     * {@code error}. NON_NULL chỉ áp ở cấp này — bên trong (vd. {@code median_min_ttc.delta}) null vẫn được ghi.
     */
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

    // ------------------------------------------------------------------ màn danh sách / chi tiết regression

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

    /** {@code pass_criteria} là JSON đã lưu của test, trả nguyên văn (test cũ có thể khác dạng). */
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

    // ------------------------------------------------------------------ xem trước khi tạo test

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record PreviewVariant(long id, String label, String summary, String baselineOutcome, Boolean baselineFalseActivation,
                                 boolean hasBaselineRun, boolean safe, boolean oldCritical) {
    }

    /** Các trường {@code selected_*} chỉ có khi gửi {@code variant_ids}; {@code variants} chỉ có khi {@code include_variants=true}. */
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

    // ------------------------------------------------------------------ khuyến nghị

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record RecommendationListItem(long id, String code, String regressionCode, String baseline, String candidate, String status,
                                         Rates rates, Counts counts, String createdAt) {
    }

    /** Mỗi danh sách là cặp [baseline, candidate]; phần tử null khi test chưa có số. */
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

    /** Toàn bộ trường của chi tiết regression (cùng cấp JSON, không lồng) cộng phần khuyến nghị. */
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

    // ------------------------------------------------------------------ gói xuất

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

    /** Manifest tái lập: bộ mô phỏng, xe, bước thời gian, tập kịch bản, phiên bản; {@code code_version} null khi build chưa ghi commit. */
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

    // ------------------------------------------------------------------ lịch sử quyết định / chuỗi baseline

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record DecisionItem(String recommendationCode, String regressionCode, long testId, String baseline, String candidate,
                               String decision, String reviewedBy, String reviewedAt, String reason, String conditions) {
    }

    /** {@code promoted_by} null = baseline khởi tạo của project, không do quyết định Accept nào nâng. */
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record BaselineItem(long id, long versionNo, String label, String status, String promotedBy, String promotedAt,
                               String regressionCode, String reason) {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record DecisionHistory(List<DecisionItem> decisions, List<BaselineItem> baselines) {
    }
}
