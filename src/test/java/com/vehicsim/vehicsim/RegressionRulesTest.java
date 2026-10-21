package com.vehicsim.vehicsim;

import com.vehicsim.dto.RegressionRecords.CandidateRun;
import com.vehicsim.dto.RegressionRecords.RunResult;
import com.vehicsim.dto.RegressionResponses.CriterionResult;
import com.vehicsim.dto.RegressionResponses.PairResult;
import com.vehicsim.dto.RegressionResponses.RegressionSummary;
import com.vehicsim.exception.RegressionExceptions.InvalidCriteriaException;
import com.vehicsim.service.RegressionCodes;
import com.vehicsim.service.RegressionCriteria;
import com.vehicsim.service.RegressionService;
import com.vehicsim.service.RegressionSummarizer;
import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.LongFunction;

import static org.junit.jupiter.api.Assertions.*;

class RegressionRulesTest {

    @Test
    void defaultsKeepRequiredCriteriaOn() {
        Map<String, Map<String, Object>> merged = RegressionCriteria.merge(Map.of(
                "no_new_collision", Map.of("enabled", false),
                "false_activation_increase_max_pts", Map.of("enabled", false, "value", 2)));
        assertEquals(true, merged.get("no_new_collision").get("enabled"), "tiêu chí bắt buộc không tắt được");
        assertEquals(false, merged.get("false_activation_increase_max_pts").get("enabled"));
        assertEquals(2.0, merged.get("false_activation_increase_max_pts").get("value"));
        assertFalse(merged.get("collision_rate_not_increase").containsKey("value"));
    }

    @Test
    void defaultFalseActivationThresholdIsFivePoints() {
        assertEquals(5.0, RegressionService.DEFAULT_FALSE_ACTIVATION_MAX_PTS);
        Map<String, Map<String, Object>> merged = RegressionCriteria.merge(null);
        assertEquals(5.0, merged.get("false_activation_increase_max_pts").get("value"));
        assertEquals(true, merged.get("false_activation_increase_max_pts").get("enabled"));
        // Va chạm mới vẫn bắt buộc và không có ngưỡng: đổi ngưỡng phanh oan không nới nó (ADR-042).
        assertEquals(true, merged.get("no_new_collision").get("required"));
        assertFalse(merged.get("no_new_collision").containsKey("value"));
    }

    @Test
    void aTestStoredWithTheOldThresholdIsStillJudgedByIt() {
        // 40 cặp, một cặp candidate phanh oan mà baseline không: tăng 2,5 điểm % — trượt ngưỡng 0,5 đã lưu, đạt ngưỡng 5 mới.
        assertFalse(falseActivationCriterionPassed(0.5), "test tạo với ngưỡng 0,5 giữ ngưỡng đó");
        assertTrue(falseActivationCriterionPassed(5.0));
    }

    private static boolean falseActivationCriterionPassed(double storedThreshold) {
        RegressionSummary summary = summaryOf(storedThreshold, i -> result(2000 + i, i == 1, 5.0, 10.0));
        return summary.criteria().stream().filter(c -> "false_activation_increase_max_pts".equals(c.key())).allMatch(CriterionResult::passed);
    }

    /** Summary của một test 40 cặp đã chạy xong: baseline đều an toàn, không phanh oan; candidate do {@code candidate} dựng. */
    private static RegressionSummary summaryOf(double storedThreshold, LongFunction<RunResult> candidate) {
        Map<String, Object> criteria = new LinkedHashMap<>(RegressionCriteria.merge(
                Map.of("false_activation_increase_max_pts", Map.of("value", storedThreshold))));
        List<CandidateRun> candidateRuns = new ArrayList<>();
        Map<Long, Row> versions = new LinkedHashMap<>();
        Map<Long, RunResult> results = new LinkedHashMap<>();
        for (long i = 1; i <= 40; i++) {
            candidateRuns.add(new CandidateRun(2000 + i, i, 1000 + i));
            versions.put(i, new Row(Json.obj("id", i, "version_no", i)));
            results.put(1000 + i, result(1000 + i, false, 5.0, 10.0));
            results.put(2000 + i, candidate.apply(i));
        }
        Row scenario = new Row(Json.obj("id", 20L, "code", "SC-A", "name", "Họ A"));
        return RegressionSummarizer.summarize(criteria, scenario, versions, candidateRuns, results);
    }

    private static RunResult result(long id, boolean falseActivation, Double rmsJerk, Double stoppingDistance) {
        return new RunResult(id, "COMPLETED", false, 3.0, 5.0, null, falseActivation, "PASS", rmsJerk, stoppingDistance);
    }

    @Test
    void objectivesAreShownPerPairButNeverDecideTheVerdict() {
        // Candidate phanh giật hơn và dừng xa hơn ở mọi cặp nhưng không đổi kết quả: mọi tiêu chí vẫn đạt.
        RegressionSummary summary = summaryOf(RegressionService.DEFAULT_FALSE_ACTIVATION_MAX_PTS, i -> result(2000 + i, false, 12.0, null));

        assertEquals("PASSED", RegressionSummarizer.verdict(summary));
        assertFalse(summary.criteria().stream().anyMatch(c -> c.key().contains("jerk") || c.key().contains("stopping")),
                "objective không phải tiêu chí");
        PairResult pair = summary.pairs().get(0);
        assertEquals(5.0, pair.baselineRmsJerkMps3());
        assertEquals(12.0, pair.candidateRmsJerkMps3());
        assertEquals(10.0, pair.baselineStoppingDistanceM());
        assertNull(pair.candidateStoppingDistanceM(), "không phanh = NULL, không bịa 0");
        assertNull(pair.candidateImpactSpeedMps(), "không va chạm = NULL");
    }

    @Test
    void unknownCriterionIsRejected() {
        assertThrows(InvalidCriteriaException.class, () -> RegressionCriteria.merge(Map.of("nope", Map.of("enabled", true))));
    }

    @Test
    void confidenceNeedsPassAndNoRegressionAndEnoughScenarios() {
        assertEquals("High", RegressionCriteria.confidence(true, 0, 20));
        assertEquals("Medium", RegressionCriteria.confidence(true, 0, 19));
        assertEquals("Medium", RegressionCriteria.confidence(true, 1, 50));
        assertEquals("Low", RegressionCriteria.confidence(false, 0, 50));
    }

    @Test
    void codes() {
        assertEquals("RT-004", RegressionCodes.testCode(4));
        assertEquals("REC-012", RegressionCodes.recommendationCode(12));
    }

    @Test
    void csvCellsQuoteLikePythonCsvWriter() {
        assertEquals("", VehicSimController.csvCell(null));
        assertEquals("True", VehicSimController.csvCell(true));
        assertEquals("\"a,b\"", VehicSimController.csvCell("a,b"));
        assertEquals("\"say \"\"hi\"\"\"", VehicSimController.csvCell("say \"hi\""));
        assertEquals("1.5", VehicSimController.csvCell(1.5));
    }

    @Test
    void familySpecCountsTheCartesianProductAndEnforcesBounds() {
        var ok = new FamilyService.FamilySpec("x", "", java.util.List.of(40.0, 60.0), java.util.List.of(20.0), java.util.List.of(1.5, 3.0),
                java.util.List.of(false, true), java.util.List.of("CLEAR"), java.util.List.of("DAY", "NIGHT"));
        assertEquals(16, ok.variantCount());
        assertEquals(16, ok.grid().size());
        ok.validate();
        var bad = new FamilyService.FamilySpec("x", "", java.util.List.of(5.0), java.util.List.of(20.0), java.util.List.of(1.5),
                java.util.List.of(false), java.util.List.of("CLEAR"), java.util.List.of("DAY"));
        assertThrows(InvalidRequestException.class, bad::validate);
    }

    @Test
    void carlaSimulatorNameFromServerVersion() {
        assertEquals("carla-0.9.16", RunService.carlaSimulator("0.9.16-12-gabc"));
        assertEquals("carla-0.9.15", RunService.carlaSimulator(" 0.9.15 "));
    }
}
