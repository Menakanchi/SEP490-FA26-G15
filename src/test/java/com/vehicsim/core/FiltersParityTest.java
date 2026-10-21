package com.vehicsim.core;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.core.type.TypeReference;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Bộ lọc Butterworth và RMS jerk đã lọc của bản Java phải trùng lõi Python trên fixture (ADR-042). */
class FiltersParityTest {

    @SuppressWarnings("unchecked")
    @Test
    void filterOutputAndRmsJerkMatchPython() throws IOException {
        List<Map<String, Object>> cases = PyCompatTest.fixture("filters.json", new TypeReference<>() { });
        assertThat(cases).hasSizeGreaterThan(10);
        for (Map<String, Object> c : cases) {
            double dt = ((Number) c.get("dt")).doubleValue();
            double cutoff = ((Number) c.get("cutoff")).doubleValue();
            List<Double> x = ((List<Number>) c.get("x")).stream().map(Number::doubleValue).toList();
            List<Double> expected = ((List<Number>) c.get("y")).stream().map(Number::doubleValue).toList();
            List<Double> actual = Filters.butterworthLowpass2(x, dt, cutoff);
            assertThat(actual).as("dt=%s n=%d", dt, x.size()).hasSameSizeAs(expected);
            for (int i = 0; i < expected.size(); i++) {
                assertThat(actual.get(i)).as("dt=%s n=%d y[%d]", dt, x.size(), i).isEqualTo(expected.get(i));
            }
            ((Map<String, Object>) c.get("rms")).forEach((start, want) -> {
                Double got = Filters.filteredRmsJerk(x, Integer.parseInt(start), dt, cutoff);
                if (want == null) {
                    assertThat(got).as("rms start=%s", start).isNull();
                } else {
                    assertThat(got).as("rms dt=%s n=%d start=%s", dt, x.size(), start).isEqualTo(((Number) want).doubleValue());
                }
            });
        }
    }

    @Test
    void cutoffAtOrAboveNyquistIsRejected() {
        assertThatThrownBy(() -> Filters.butterworthLowpass2(List.of(1.0, 2.0), 0.05, 10.0)).isInstanceOf(IllegalArgumentException.class);
        assertThat(Filters.butterworthLowpass2(List.of(), 0.01, 10.0)).isEmpty();
    }
}
