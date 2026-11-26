package com.vsos.core.evaluation;

import com.vsos.core.aeb.AebParams;
import com.vsos.core.bridge.Bundle;
import com.vsos.core.simulation.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class EvaluationModeTest {
    private SimulationOutcome crossing(boolean off, boolean curb) {
        var spec = new Bundle.RunSpec(new CrossingCase(70, 40, 1.5, curb, "CLEAR", "DAY", null),
                AebParams.DEFAULT, VehicleSpec.DEFAULT, 3, "baseline", "vehicle", Map.of(), Map.of());
        return Bundle.simulateKinematic(off ? spec.withAebOff() : spec);
    }

    @Test void offCollisionRetainsPhysicalEvidenceWithoutBlamingDisabledAeb() {
        var out = crossing(true, false);
        assertThat(out.metrics()).containsEntry("collision", true);
        assertThat(out.metrics().get("aeb_decision_t")).isNotNull();
        var result = Evaluation.evaluate(out, AebParams.DEFAULT);
        assertThat(result.outcome()).isEqualTo("COLLISION");
        assertThat(result.verdict()).isEqualTo("FAIL");
        assertThat(result.aebResult()).containsEntry("aeb_triggered", false)
                .containsEntry("aeb_trigger_time_s", null).containsEntry("false_activation", false)
                .containsEntry("missed_activation", false);
        assertThat(result.failure()).isNull();
        assertThat(result.chain()).isEmpty();
        assertThat(result.headline()).contains("OFF").containsIgnoringCase("collision");
    }

    @Test void offShadowDecisionIsNotFalseBraking() {
        var out = crossing(true, true);
        out.metrics().put("aeb_decision_t", .2);
        var result = Evaluation.evaluate(out, AebParams.DEFAULT);
        assertThat(result.aebResult()).containsEntry("false_activation", false).containsEntry("aeb_triggered", false);
        assertThat(result.verdict()).isEqualTo("PASS");
        assertThat(result.failure()).isNull();
        assertThat(out.metrics()).containsEntry("aeb_decision_t", .2);
    }

    private SimulationOutcome withoutTtcOrDecision(boolean collision) {
        var original = crossing(false, false);
        var metrics = new LinkedHashMap<>(original.metrics());
        metrics.put("aeb_decision_t", null);
        metrics.put("collision", collision);
        var frames = original.frames().stream().map(f -> new Frame(f.t(), f.egoX(), f.egoV(), f.egoA(),
                f.pedX(), f.pedY(), f.pedVy(), f.detected(), f.confidence(), f.perceivedY(), f.ttc(), null, f.fcw(), false)).toList();
        return new SimulationOutcome(original.endReason(), original.durationS(), frames, original.events(), metrics,
                original.crossingX(), original.params(), original.caseDoc());
    }

    @Test void collisionWithoutDecisionCountsAsMissedEvenWithoutIdealTtc() {
        var result = Evaluation.evaluate(withoutTtcOrDecision(true), AebParams.DEFAULT);
        assertThat(result.aebResult()).containsEntry("missed_activation", true);
        assertThat(result.failure()).containsEntry("failure_type", "COLLISION");
    }

    @Test void pathEntryAloneWithoutCollisionOrTriggerOpportunityIsNotMissed() {
        var out = withoutTtcOrDecision(false);
        out.metrics().put("pedestrian_entered_path", true);
        assertThat(Evaluation.evaluate(out, AebParams.DEFAULT).aebResult()).containsEntry("missed_activation", false);
    }

    @Test void newGradingHasItsOwnVersionAndHistoricalReplayKeepsTheOriginalRule() {
        var out = withoutTtcOrDecision(true);
        assertThat(Evaluation.evaluate(out,AebParams.DEFAULT).toDocument()).containsEntry("version",Evaluation.VERSION);
        var old = Evaluation.evaluateLegacy(out,AebParams.DEFAULT);
        assertThat(old.aebResult()).containsEntry("missed_activation",false);
        assertThat(old.toDocument()).doesNotContainKey("version");
    }
}
