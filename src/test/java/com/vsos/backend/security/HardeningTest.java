package com.vsos.backend.security;

import com.vsos.backend.common.Vs.InvalidRequestException;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.vsos.backend.common.Csv;
import com.vsos.backend.service.scenario.FamilyService;

/** Các chốt chặn đầu vào: CSV injection, danh sách có phần tử rỗng, tiêu chí regression sai kiểu. */
class HardeningTest {

    @Test
    void csvCellNeutralisesSpreadsheetFormulas() {
        assertThat(Csv.cell("=HYPERLINK(\"http://evil\",\"x\")")).isEqualTo("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"");
        assertThat(Csv.cell("+1+1")).isEqualTo("'+1+1");
        assertThat(Csv.cell("-2+3")).isEqualTo("'-2+3");
        assertThat(Csv.cell("@SUM(A1)")).isEqualTo("'@SUM(A1)");
        assertThat(Csv.cell("\t=cmd")).isEqualTo("'\t=cmd");
    }

    @Test
    void csvCellLeavesNumbersAndPlainTextAlone() {
        assertThat(Csv.cell(-0.5)).isEqualTo("-0.5");
        assertThat(Csv.cell(12)).isEqualTo("12");
        assertThat(Csv.cell("Night · rain · 60 km/h")).isEqualTo("Night · rain · 60 km/h");
        assertThat(Csv.cell(null)).isEmpty();
        assertThat(Csv.cell(true)).isEqualTo("True");
        assertThat(Csv.cell("a,b")).isEqualTo("\"a,b\"");
    }

    private static FamilyService.FamilySpec spec(List<Double> ego, List<Boolean> stops) {
        return new FamilyService.FamilySpec("x", "", ego, List.of(20.0), List.of(1.5), stops, List.of("CLEAR"), List.of("DAY"));
    }

    @Test
    void familyAxisWithANullValueIsABadRequestNotAServerError() {
        assertThatThrownBy(() -> spec(Arrays.asList(40.0, null), List.of(false)).validate())
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("ego_speeds_kmh");
        assertThatThrownBy(() -> spec(List.of(40.0), Arrays.asList(false, null)).validate())
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("stops_at_curb");
        spec(List.of(40.0), List.of(false)).validate(); // hợp lệ thì không ném
    }

    @Test
    void regressionCriterionValueMustBeANumber() {
        assertThatThrownBy(() -> com.vsos.backend.service.regression.RegressionCriteria.merge(Map.of(
                "false_activation_increase_max_pts", Map.of("value", "nhieu"))))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("false_activation_increase_max_pts");
        var merged = com.vsos.backend.service.regression.RegressionCriteria.merge(Map.of("false_activation_increase_max_pts", Map.of("value", 1)));
        assertThat(merged.get("false_activation_increase_max_pts").get("value")).isEqualTo(1.0);
    }
}
