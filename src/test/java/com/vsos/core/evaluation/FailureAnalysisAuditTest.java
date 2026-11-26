package com.vsos.core.evaluation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.vsos.core.aeb.AebParams;
import com.vsos.core.simulation.CrossingCase;
import com.vsos.core.simulation.SimulationOutcome;
import com.vsos.core.simulation.Simulator;
import com.vsos.core.simulation.VehicleSpec;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Preserve historical grading while verifying corrected v2 evidence and attribution rules.
 */
class FailureAnalysisAuditTest {
    @Test
    void missingEvidenceIsRejectedByV2WhileHistoricalReplayRetainsItsOriginalResult() {
        var missing = new SimulationOutcome("TIMEOUT", 0, List.of(), List.of(), Map.of(), 0,
                Map.of(), Map.of());

        assertThatThrownBy(() -> Evaluation.evaluate(missing, AebParams.DEFAULT))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("incomplete simulation evidence");
        var result = Evaluation.evaluateLegacy(missing, AebParams.DEFAULT);

        // Legacy reproduction does not authorize using this result in current analysis or regression.
        assertThat(result.outcome()).isEqualTo("SAFE");
        assertThat(result.verdict()).isEqualTo("PASS");
        assertThat(result.failure()).isNull();
        assertThat(result.chain()).isEmpty();
    }

    @Test
    void vehicleBrakeLimitIsDistinguishedFromRoadFrictionWithoutRewritingLegacyEvidence() {
        var scenario = new CrossingCase(70, 40, 1.5, false, "CLEAR", "DAY", 1.0);
        var vehicle = new VehicleSpec(4.75, 1.93, 3.0);
        var outcome = Simulator.simulate(scenario, AebParams.DEFAULT, 3, vehicle);

        assertThat(outcome.metrics()).containsEntry("collision", true)
                .containsEntry("decel_available_mps2", 3.0);
        assertThat(Simulator.G).isGreaterThan(AebParams.DEFAULT.maxDeceleration());
        var result = Evaluation.evaluate(outcome, AebParams.DEFAULT);
        var dynamics = result.chain().stream()
                .filter(stage -> stage.stage().equals("VEHICLE_DYNAMICS")).findFirst().orElseThrow();
        assertThat(dynamics.causeCode()).isEqualTo("VEHICLE_BRAKE_LIMIT");
        assertThat(dynamics.parameterCode()).isNull();
        assertThat(dynamics.summary()).contains("Available vehicle braking").contains("3.0");
        assertThat(Evaluation.evaluateLegacy(outcome,AebParams.DEFAULT).chain().get(3).causeCode()).isEqualTo("LOW_FRICTION");
    }
}
