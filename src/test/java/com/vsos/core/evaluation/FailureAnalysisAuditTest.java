package com.vsos.core.evaluation;

import static org.assertj.core.api.Assertions.assertThat;

import com.vsos.core.aeb.AebParams;
import com.vsos.core.simulation.CrossingCase;
import com.vsos.core.simulation.SimulationOutcome;
import com.vsos.core.simulation.Simulator;
import com.vsos.core.simulation.VehicleSpec;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Phase 11 characterization of existing limitations, not the desired safety contract.
 * A future versioned evaluator should replace these expectations with explicit evidence states.
 */
class FailureAnalysisAuditTest {
    @Test
    void missingEvidenceCurrentlyFallsThroughToSafePassInsideTheCore() {
        var missing = new SimulationOutcome("TIMEOUT", 0, List.of(), List.of(), Map.of(), 0,
                Map.of(), Map.of());

        var result = Evaluation.evaluate(missing, AebParams.DEFAULT);

        // Downstream Analysis validity gates reject TIMEOUT/missing trace; this core does not.
        assertThat(result.outcome()).isEqualTo("SAFE");
        assertThat(result.verdict()).isEqualTo("PASS");
        assertThat(result.failure()).isNull();
        assertThat(result.chain()).isEmpty();
    }

    @Test
    void aVehicleBrakeLimitIsCurrentlyDescribedAsLowRoadFriction() {
        var scenario = new CrossingCase(70, 40, 1.5, false, "CLEAR", "DAY", 1.0);
        var vehicle = new VehicleSpec(4.75, 1.93, 3.0);
        var outcome = Simulator.simulate(scenario, AebParams.DEFAULT, 3, vehicle);

        assertThat(outcome.metrics()).containsEntry("collision", true)
                .containsEntry("decel_available_mps2", 3.0);
        assertThat(Simulator.G).isGreaterThan(AebParams.DEFAULT.maxDeceleration());
        var result = Evaluation.evaluate(outcome, AebParams.DEFAULT);
        var dynamics = result.chain().stream()
                .filter(stage -> stage.stage().equals("VEHICLE_DYNAMICS")).findFirst().orElseThrow();
        // This proves a misleading stage attribution; it does not establish a real-world cause.
        assertThat(dynamics.causeCode()).isEqualTo("LOW_FRICTION");
        assertThat(dynamics.summary()).contains("Road friction").contains("3.0");
    }
}
