package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Các chốt chặn đầu vào: CSV injection, danh sách có phần tử rỗng, tiêu chí regression sai kiểu. */
class HardeningTest {

    @Test
    void csvCellNeutralisesSpreadsheetFormulas() {
        assertThat(VehicSimController.csvCell("=HYPERLINK(\"http://evil\",\"x\")")).isEqualTo("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"");
        assertThat(VehicSimController.csvCell("+1+1")).isEqualTo("'+1+1");
        assertThat(VehicSimController.csvCell("-2+3")).isEqualTo("'-2+3");
        assertThat(VehicSimController.csvCell("@SUM(A1)")).isEqualTo("'@SUM(A1)");
        assertThat(VehicSimController.csvCell("\t=cmd")).isEqualTo("'\t=cmd");
    }

    @Test
    void csvCellLeavesNumbersAndPlainTextAlone() {
        assertThat(VehicSimController.csvCell(-0.5)).isEqualTo("-0.5");
        assertThat(VehicSimController.csvCell(12)).isEqualTo("12");
        assertThat(VehicSimController.csvCell("Night · rain · 60 km/h")).isEqualTo("Night · rain · 60 km/h");
        assertThat(VehicSimController.csvCell(null)).isEmpty();
        assertThat(VehicSimController.csvCell(true)).isEqualTo("True");
        assertThat(VehicSimController.csvCell("a,b")).isEqualTo("\"a,b\"");
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
        assertThatThrownBy(() -> RegressionService.mergeCriteria(Map.of(
                "false_activation_increase_max_pts", Map.of("value", "nhieu"))))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("false_activation_increase_max_pts");
        var merged = RegressionService.mergeCriteria(Map.of("false_activation_increase_max_pts", Map.of("value", 1)));
        assertThat(merged.get("false_activation_increase_max_pts").get("value")).isEqualTo(1.0);
    }
}
