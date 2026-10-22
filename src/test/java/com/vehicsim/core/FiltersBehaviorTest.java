package com.vehicsim.core;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Bộ lọc Butterworth 10 Hz kiểm trên tín hiệu biết trước (ADR-042; chuyển từ {@code worker/tests/test_filters.py}). */
class FiltersBehaviorTest {

    private static final double DT = 0.01;

    private static double steadyAmplitude(double freqHz) {
        int n = 2000;
        List<Double> sine = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            sine.add(Math.sin(2 * Math.PI * freqHz * i * DT));
        }
        List<Double> out = Filters.butterworthLowpass2(sine, DT, 10.0);
        double max = 0.0;
        for (double v : out.subList(n / 2, n)) { // bỏ quá độ đầu
            max = Math.max(max, Math.abs(v));
        }
        return max;
    }

    @Test
    void constantSignalPassesUnchangedWithoutStartupTransient() {
        for (double v : Filters.butterworthLowpass2(Collections.nCopies(50, 4.6), DT, 10.0)) {
            assertThat(v).isCloseTo(4.6, within(1e-9));
        }
    }

    @Test
    void gainIsMinus3dbAtCutoffAndFlatWellBelow() {
        assertThat(steadyAmplitude(10.0)).isCloseTo(1 / Math.sqrt(2), within(0.01));
        assertThat(steadyAmplitude(1.0)).isCloseTo(1.0, within(0.01));
    }

    @Test
    void highFrequencyNoiseIsAttenuatedAboutFortyDbPerTwoDecades() {
        // Bậc 2: ~12 dB/octave. 40 Hz (hai octave trên 10 Hz) còn dưới 0,1.
        assertThat(steadyAmplitude(40.0)).isLessThan(0.1);
    }

    @Test
    void filterIsCausalSoItLagsAStepRatherThanAnticipatingIt() {
        List<Double> step = new ArrayList<>(Collections.nCopies(20, 0.0));
        step.addAll(Collections.nCopies(60, 1.0));
        List<Double> out = Filters.butterworthLowpass2(step, DT, 10.0);
        assertThat(out.subList(0, 20).stream().mapToDouble(Double::doubleValue).max().orElseThrow()).isCloseTo(0.0, within(1e-12)); // không phản ứng trước bước
        assertThat(out.get(20)).isLessThan(0.5);
        assertThat(out.get(40)).isGreaterThan(0.5);
    }

    @Test
    void cutoffMustBeBelowNyquist() {
        assertThatThrownBy(() -> Filters.butterworthLowpass2(List.of(0.0, 1.0), 0.05, 10.0)).hasMessageContaining("Nyquist");
    }

    @Test
    void filteredJerkOfRampEqualsItsSlopeAndIgnoresANoisySpikeBetterThanRaw() {
        List<Double> ramp = new ArrayList<>();
        for (int i = 0; i < 80; i++) {
            ramp.add(20.0 * i * DT); // dốc 20 m/s³ không bão hòa
        }
        assertThat(Filters.filteredRmsJerk(ramp, 30, DT, 10.0)).isCloseTo(20.0, within(20.0 * 0.05));
        List<Double> noisy = new ArrayList<>(ramp);
        noisy.set(40, noisy.get(40) + 3.0);
        double sum = 0.0;
        for (int i = 30; i < noisy.size(); i++) {
            double jerk = (noisy.get(i) - noisy.get(i - 1)) / DT;
            sum += jerk * jerk;
        }
        double rawRms = Math.sqrt(sum / (noisy.size() - 30));
        // Gai 3 m/s² một mẫu: số thô tăng hơn 3 lần so với dốc sạch, số đã lọc tăng dưới 20 %.
        assertThat(rawRms).isGreaterThan(3 * 20.0);
        assertThat(Filters.filteredRmsJerk(noisy, 30, DT, 10.0)).isLessThan(1.2 * 20.0);
    }

    @Test
    void noBrakingFramesGivesNull() {
        assertThat(Filters.filteredRmsJerk(Collections.nCopies(10, 0.0), 10, DT, 10.0)).isNull();
        assertThat(Filters.filteredRmsJerk(List.of(), 0, DT, 10.0)).isNull();
    }
}
