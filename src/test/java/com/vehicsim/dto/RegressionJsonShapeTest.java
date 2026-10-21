package com.vehicsim.dto;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vehicsim.dto.RegressionResponses.Counts;
import com.vehicsim.dto.RegressionResponses.ExpectedEffect;
import com.vehicsim.dto.RegressionResponses.MedianTtc;
import com.vehicsim.dto.RegressionResponses.PairResult;
import com.vehicsim.dto.RegressionResponses.Progress;
import com.vehicsim.dto.RegressionResponses.Rates;
import com.vehicsim.dto.RegressionResponses.RecommendationDetailResponse;
import com.vehicsim.dto.RegressionResponses.RegressionDetailResponse;
import com.vehicsim.dto.RegressionResponses.RegressionPreviewResponse;
import com.vehicsim.dto.RegressionResponses.RegressionSummary;
import com.vehicsim.dto.RegressionResponses.ReviewInfo;
import com.vehicsim.dto.RegressionResponses.VersionRef;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Các record trả về giữ đúng dạng JSON mà frontend ({@code frontend/src/types/vehicsim.ts}) đọc: khoá snake_case, null vẫn có mặt,
 * {@code summary} của test chưa xong là {@code {}}, chi tiết khuyến nghị phẳng (không lồng {@code detail}).
 */
class RegressionJsonShapeTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static Map<String, Object> json(Object value) throws Exception {
        return MAPPER.readValue(MAPPER.writeValueAsString(value), new TypeReference<>() {
        });
    }

    @Test
    void pairKeysAreSnakeCaseAndNullsStayPresent() throws Exception {
        PairResult pair = new PairResult(101L, "A-1", "Day", "A", 1001L, 2001L, "SAFE", "SAFE", "PASS", "PASS", false, true, null, null,
                "unchanged", 5.0, null, null, null, 10.0, null);

        assertThat(json(pair)).containsOnlyKeys("variant_id", "label", "summary", "family", "baseline_run_id", "candidate_run_id",
                        "baseline_outcome", "candidate_outcome", "baseline_verdict", "candidate_verdict", "baseline_false_activation",
                        "candidate_false_activation", "min_ttc_delta_s", "candidate_impact_kmh", "change", "baseline_rms_jerk_mps3",
                        "candidate_rms_jerk_mps3", "baseline_impact_speed_mps", "candidate_impact_speed_mps", "baseline_stopping_distance_m",
                        "candidate_stopping_distance_m")
                .containsEntry("min_ttc_delta_s", null).containsEntry("candidate_false_activation", true);
    }

    @Test
    void anUnfinishedSummaryIsAnEmptyObjectAndAFailedOneOnlyHasTheError() throws Exception {
        assertThat(MAPPER.writeValueAsString(RegressionSummary.EMPTY)).isEqualTo("{}");
        assertThat(json(RegressionSummary.failed("hỏng"))).containsOnlyKeys("error");
        RegressionSummary done = new RegressionSummary(new Counts(1, 0, 0, 1, 0), Map.of(), new Rates(0, 0, 0, 0),
                new MedianTtc(null, null, null), List.of(), List.of(), List.of(), null);
        assertThat(json(done)).containsOnlyKeys("counts", "transitions", "rates", "median_min_ttc", "families", "criteria", "pairs");
        assertThat(json(done.counts())).containsOnlyKeys("scenarios", "fixed", "regressed", "unchanged", "new_collisions");
        assertThat(json(done.rates())).containsOnlyKeys("collision_baseline_pct", "collision_candidate_pct", "false_activation_baseline_pct",
                "false_activation_candidate_pct");
        assertThat(json(done.medianMinTtc())).containsOnlyKeys("baseline", "candidate", "delta");
    }

    @Test
    void selectedCountsAndVariantsAreOmittedUnlessAsked() throws Exception {
        RegressionPreviewResponse plain = new RegressionPreviewResponse(2L, "Họ", "v1.0", "vehicsim-kinematic-1.0", 8, 4, 8,
                null, null, null, null, null);

        assertThat(json(plain)).containsOnlyKeys("scenario_id", "family", "baseline", "simulator", "variant_count", "old_critical_count",
                "baseline_runs_existing");
    }

    @Test
    void theRecommendationDetailIsFlatWithTheRegressionFields() throws Exception {
        RegressionDetailResponse detail = new RegressionDetailResponse(7L, "RT-007", "REC-007", "t", "PASSED", "PENDING", "Họ", 2L,
                new VersionRef(1L, "v1.0", "BASELINE"), new VersionRef(6L, "v6", "CANDIDATE"), List.of(), List.of(), Map.of(),
                "vehicsim-kinematic-1.0", null, null, new Progress(2, 2), "A", "2026-10-21T00:00:00", RegressionSummary.EMPTY);
        RecommendationDetailResponse rec = new RecommendationDetailResponse(detail, "PENDING", "Awaiting review", List.of(),
                new ExpectedEffect(Arrays.asList(null, null), Arrays.asList(null, null), Arrays.asList(null, null), null, 0L), List.of(),
                "Medium", List.of(), new ReviewInfo("PENDING", null, null, null, null, "A"));

        Map<String, Object> out = json(rec);

        assertThat(out).doesNotContainKey("detail").containsKeys("id", "code", "recommendation_code", "pass_criteria", "simulator_caveat",
                "candidate_source", "summary", "recommendation_status", "recommendation_status_label", "changed_parameters",
                "expected_effect", "tradeoffs", "confidence", "evidence", "review");
        assertThat(out.get("summary")).isEqualTo(Map.of());
        assertThat(out).containsEntry("simulator_caveat", null).containsEntry("candidate_source", null);
        @SuppressWarnings("unchecked")
        Map<String, Object> effect = (Map<String, Object>) out.get("expected_effect");
        assertThat(effect).containsEntry("collision_rate", Arrays.asList(null, null)).containsEntry("fixed", null);
    }
}
