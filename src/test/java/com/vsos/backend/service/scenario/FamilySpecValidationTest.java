package com.vsos.backend.service.scenario;

import com.vsos.backend.common.Vs.InvalidRequestException;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Regression checks for the previously failing validate() spreadsheet cases. */
class FamilySpecValidationTest {
    private static FamilyService.FamilySpec spec(List<Double> ego, List<Double> distance, List<Double> pedestrian,
                                                  List<String> weather, List<String> time) {
        return new FamilyService.FamilySpec("test", "", ego, distance, pedestrian, List.of(false), weather, time);
    }

    private static FamilyService.FamilySpec valid() {
        return spec(List.of(40.0), List.of(20.0), List.of(1.5), List.of("CLEAR"), List.of("DAY"));
    }

    @Test
    void utcid39RejectsNanEgoSpeed() {
        var s = spec(List.of(Double.NaN), List.of(20.0), List.of(1.5), List.of("CLEAR"), List.of("DAY"));
        assertThatThrownBy(s::validate).isInstanceOf(InvalidRequestException.class).hasMessageContaining("ego_speeds_kmh");
    }

    @Test
    void utcid40RejectsNanTriggerDistance() {
        var s = spec(List.of(40.0), List.of(Double.NaN), List.of(1.5), List.of("CLEAR"), List.of("DAY"));
        assertThatThrownBy(s::validate).isInstanceOf(InvalidRequestException.class).hasMessageContaining("trigger_distances_m");
    }

    @Test
    void utcid41RejectsNanPedestrianSpeed() {
        var s = spec(List.of(40.0), List.of(20.0), List.of(Double.NaN), List.of("CLEAR"), List.of("DAY"));
        assertThatThrownBy(s::validate).isInstanceOf(InvalidRequestException.class).hasMessageContaining("pedestrian_speeds_mps");
    }

    @Test
    void utcid44RejectsProductThatOverflowsAnInteger() {
        var ego = IntStream.range(0, 2000).mapToDouble(i -> 80.0 + i * 0.01).boxed().toList();
        var distance = IntStream.range(0, 2000).mapToDouble(i -> 5.0 + i * 0.01).boxed().toList();
        var pedestrian = IntStream.range(0, 2000).mapToDouble(i -> 0.5 + i * 0.001).boxed().toList();
        var s = spec(ego, distance, pedestrian, List.of("CLEAR"), List.of("DAY"));
        assertThat(s.variantCount()).isEqualTo(Integer.MAX_VALUE);
        assertThatThrownBy(s::validate).isInstanceOf(InvalidRequestException.class).hasMessageContaining("vượt trần 300");
    }

    @Test
    void utcid48RejectsNullWeatherWithoutNullPointerException() {
        var s = spec(List.of(40.0), List.of(20.0), List.of(1.5), Collections.singletonList(null), List.of("DAY"));
        assertThatThrownBy(s::validate).isInstanceOf(InvalidRequestException.class).hasMessageContaining("weathers");
    }

    @Test
    void utcid49RejectsNullTimeWithoutNullPointerException() {
        var s = spec(List.of(40.0), List.of(20.0), List.of(1.5), List.of("CLEAR"), Collections.singletonList(null));
        assertThatThrownBy(s::validate).isInstanceOf(InvalidRequestException.class).hasMessageContaining("times_of_day");
    }

    @Test
    void limitAllows300DistinctVariantsButRejects301() {
        var speeds300 = IntStream.range(0, 300).mapToDouble(i -> 40.0 + i * 0.01).boxed().toList();
        var speeds301 = IntStream.range(0, 301).mapToDouble(i -> 40.0 + i * 0.01).boxed().toList();
        var atLimit = spec(speeds300, List.of(20.0), List.of(1.5), List.of("CLEAR"), List.of("DAY"));
        var aboveLimit = spec(speeds301, List.of(20.0), List.of(1.5), List.of("CLEAR"), List.of("DAY"));
        assertThat(atLimit.variantCount()).isEqualTo(300);
        assertThatCode(atLimit::validate).doesNotThrowAnyException();
        assertThatThrownBy(aboveLimit::validate).isInstanceOf(InvalidRequestException.class).hasMessageContaining("301 biến thể vượt trần 300");
        assertThatCode(valid()::validate).doesNotThrowAnyException();
    }

    @Test
    void leadVehicleSpecAlsoRejectsNullWeather() {
        var s = new FamilyService.LeadFamilySpec("test", "", "CCRS", List.of(40.0), List.of(0.0), List.of(20.0),
                null, List.of(100.0), Collections.singletonList(null), List.of("DAY"));
        assertThatThrownBy(s::validate).isInstanceOf(InvalidRequestException.class).hasMessageContaining("weathers");
    }

    @Test
    void leadVehicleSpecAlsoRejectsNullTime() {
        var s = new FamilyService.LeadFamilySpec("test", "", "CCRS", List.of(40.0), List.of(0.0), List.of(20.0),
                null, List.of(100.0), List.of("CLEAR"), Collections.singletonList(null));
        assertThatThrownBy(s::validate).isInstanceOf(InvalidRequestException.class).hasMessageContaining("times_of_day");
    }

    @Test
    void leadVehicleSpecRejectsNonFiniteNumbers() {
        var s = new FamilyService.LeadFamilySpec("test", "", "CCRS", List.of(Double.NaN), List.of(0.0), List.of(20.0),
                null, List.of(100.0), List.of("CLEAR"), List.of("DAY"));
        assertThatThrownBy(s::validate).isInstanceOf(InvalidRequestException.class).hasMessageContaining("ego_speeds_kmh");
    }

    @Test
    void leadVehicleSpecRejectsOverflowingVariantProduct() {
        var ego = IntStream.range(0, 2000).mapToDouble(i -> 80.0 + i * 0.01).boxed().toList();
        var distance = IntStream.range(0, 2000).mapToDouble(i -> 5.0 + i * 0.01).boxed().toList();
        var overlaps = IntStream.range(0, 2000).mapToDouble(i -> i * 0.01).boxed().toList();
        var s = new FamilyService.LeadFamilySpec("test", "", "CCRS", ego, List.of(0.0), distance,
                null, overlaps, List.of("CLEAR"), List.of("DAY"));
        assertThat(s.variantCount()).isEqualTo(Integer.MAX_VALUE);
        assertThatThrownBy(s::validate).isInstanceOf(InvalidRequestException.class).hasMessageContaining("vượt trần 300");
    }
}
