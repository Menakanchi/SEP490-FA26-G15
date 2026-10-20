package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RegressionRulesTest {

    @Test
    void defaultsKeepRequiredCriteriaOn() {
        Map<String, Map<String, Object>> merged = RegressionService.mergeCriteria(Map.of(
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
        Map<String, Map<String, Object>> merged = RegressionService.mergeCriteria(null);
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
        Db db = mock(Db.class);
        RegressionService service = new RegressionService(db, mock(Queries.class), mock(FamilyService.class), mock(RunService.class),
                mock(org.springframework.transaction.support.TransactionTemplate.class));
        Map<String, Map<String, Object>> criteria = RegressionService.mergeCriteria(
                Map.of("false_activation_increase_max_pts", Map.of("value", storedThreshold)));
        Row test = new Row(Json.obj("id", 30L, "scenario_id", 20L, "execution_status", "COMPLETED",
                "pass_criteria_json", Json.write(Json.obj("criteria", criteria))));
        List<Row> candidateRuns = new ArrayList<>();
        List<Row> versions = new ArrayList<>();
        List<Row> results = new ArrayList<>();
        for (long i = 1; i <= 40; i++) {
            candidateRuns.add(new Row(Json.obj("id", 2000 + i, "scenario_version_id", i, "baseline_run_id", 1000 + i)));
            versions.add(new Row(Json.obj("id", i, "version_no", i)));
            results.add(result(1000 + i, false));
            results.add(result(2000 + i, i == 1));
        }
        when(db.list(contains("FROM simulation_runs WHERE regression_test_id = ?"), any(Object[].class))).thenReturn(candidateRuns);
        when(db.list(startsWith("SELECT * FROM scenario_versions"), any(Object[].class))).thenReturn(versions);
        when(db.list(startsWith("SELECT id, status, collision_occurred"), any(Object[].class))).thenReturn(results);
        when(db.first(startsWith("SELECT * FROM scenarios"), any(Object[].class))).thenReturn(new Row(Json.obj("id", 20L, "code", "SC-A", "name", "Họ A")));

        Map<String, Object> summary = service.summary(test);
        return Json.asList(summary.get("criteria")).stream().map(Json::asMap)
                .filter(c -> "false_activation_increase_max_pts".equals(c.get("key")))
                .allMatch(c -> Boolean.TRUE.equals(c.get("passed")));
    }

    private static Row result(long id, boolean falseActivation) {
        return new Row(Json.obj("id", id, "status", "COMPLETED", "collision_occurred", false, "min_ttc_s", 3.0, "min_distance_m", 5.0,
                "is_false_positive", falseActivation, "verdict", "PASS"));
    }

    @Test
    void unknownCriterionIsRejected() {
        assertThrows(InvalidRequestException.class, () -> RegressionService.mergeCriteria(Map.of("nope", Map.of("enabled", true))));
    }

    @Test
    void confidenceNeedsPassAndNoRegressionAndEnoughScenarios() {
        assertEquals("High", RegressionService.confidence(true, Map.of("regressed", 0, "scenarios", 20)));
        assertEquals("Medium", RegressionService.confidence(true, Map.of("regressed", 0, "scenarios", 19)));
        assertEquals("Medium", RegressionService.confidence(true, Map.of("regressed", 1, "scenarios", 50)));
        assertEquals("Low", RegressionService.confidence(false, Map.of("regressed", 0, "scenarios", 50)));
    }

    @Test
    void codes() {
        assertEquals("RT-004", RegressionService.testCode(4));
        assertEquals("REC-012", RegressionService.recommendationCode(12));
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
