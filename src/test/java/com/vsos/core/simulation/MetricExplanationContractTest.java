package com.vsos.core.simulation;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** Numerical anchors for the canonical method described by Analysis; no production formula changes. */
class MetricExplanationContractTest {
    private static Frame frame(double t, double x, double v, double a) {
        return new Frame(t, x, v, a, 30, 0, 0, true, 1, 0.0, 1.0, 1.0, true, true);
    }

    @Test
    void canonicalRmsUsesNominalDtAndPreOnsetAccelerationWhileDistanceIncludesTheRemainder() {
        // Irregular timestamps intentionally demonstrate nominal dt, unlike RecordedTelemetry projection.
        var frames = List.of(frame(0, 0, 10, 0), frame(0.1, 1, 8, -2), frame(0.4, 3, 6, -2));
        Double[] result = Simulator.brakePhaseMetrics(frames, 0.1, 6, 0.1);
        // Jerk values are -20 and 0 -> sqrt(200); distance is (3-1)+6²/(2*6).
        assertThat(result).containsExactly(14.142, 5.0);
        assertThat(Simulator.brakePhaseMetrics(frames, null, 6, 0.1)).containsExactly(null, null);
    }

    @Test
    void zeroAvailableDecelerationKeepsLegacyZeroRemainderInsteadOfInventingAnInfiniteDistance() {
        var frames = List.of(frame(0, 0, 10, 0), frame(0.1, 1, 8, -2), frame(0.2, 3, 6, -2));
        assertThat(Simulator.brakePhaseMetrics(frames, 0.1, 0, 0.1)[1]).isEqualTo(2.0);
    }
}
