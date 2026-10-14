package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

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
