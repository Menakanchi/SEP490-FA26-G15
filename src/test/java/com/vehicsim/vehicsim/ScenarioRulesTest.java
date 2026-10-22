package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.ScenarioRules.Point;
import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Luật theo category (7 nhóm Euro NCAP) mà DB không ép được, và phép đổi m/s → km/h của cột target_speed_kmh. */
class ScenarioRulesTest {

    private static Point point(Double ego, Double targetSpeed, Double distance, Double overlap, Double decel, Double trigger) {
        return new Point(ego, targetSpeed, distance, overlap, decel, trigger);
    }

    @Test
    void pedestrianCrossingNeedsTargetSpeedAndTriggerDistance() {
        assertThat(ScenarioRules.problems("CP_CROSSING", "PEDESTRIAN", point(50.0, 5.4, null, null, null, 20.0))).isEmpty();
        assertThat(ScenarioRules.problems("CP_CROSSING", "PEDESTRIAN", point(50.0, null, null, null, null, 20.0)))
                .anyMatch(s -> s.contains("target_speed_kmh"));
        assertThat(ScenarioRules.problems("CP_CROSSING", "PEDESTRIAN", point(50.0, 5.0, null, null, null, null)))
                .anyMatch(s -> s.contains("trigger_distance_m"));
    }

    @Test
    void brakingLeadVehicleNeedsNegativeDecelerationAndDistance() {
        assertThat(ScenarioRules.problems("CCRB", "VEHICLE", point(50.0, 50.0, 12.0, null, -6.0, null))).isEmpty();
        assertThat(ScenarioRules.problems("CCRB", "VEHICLE", point(50.0, 50.0, 12.0, null, 6.0, null)))
                .anyMatch(s -> s.contains("target_decel_mps2 < 0"));
        assertThat(ScenarioRules.problems("CCRB", "VEHICLE", point(50.0, 50.0, null, null, -2.0, null)))
                .anyMatch(s -> s.contains("initial_distance_m"));
    }

    @Test
    void decelerationIsOnlyForCcrb() {
        assertThat(ScenarioRules.problems("CCRM", "VEHICLE", point(50.0, 20.0, null, null, -2.0, null)))
                .anyMatch(s -> s.contains("chỉ dùng cho CCRB"));
    }

    @Test
    void stationaryTargetMustBeStationary() {
        assertThat(ScenarioRules.problems("CCRS", "VEHICLE", point(30.0, 0.0, null, null, null, null))).isEmpty();
        assertThat(ScenarioRules.problems("CCRS", "VEHICLE", point(30.0, 5.0, null, null, null, null)))
                .anyMatch(s -> s.contains("phải = 0"));
    }

    @Test
    void targetTypeMustMatchCategoryExceptTurning() {
        assertThat(ScenarioRules.problems("CP_CROSSING", "VEHICLE", point(50.0, 5.0, null, null, null, 20.0)))
                .anyMatch(s -> s.contains("target_type"));
        assertThat(ScenarioRules.problems("CCRM", "PEDESTRIAN", point(50.0, 20.0, null, null, null, null)))
                .anyMatch(s -> s.contains("target_type"));
        // CCFtap (xe) và CPTA (người đi bộ) cùng nằm trong TURNING
        assertThat(ScenarioRules.problems("TURNING", "VEHICLE", point(10.0, 30.0, null, null, null, null))).isEmpty();
        assertThat(ScenarioRules.problems("TURNING", "PEDESTRIAN", point(10.0, 5.0, null, null, null, null))).isEmpty();
    }

    @Test
    void cutInHasNoStandardValuesSoNoColumnIsRequired() {
        assertThat(ScenarioRules.problems("CUT_IN", "VEHICLE", point(50.0, null, null, null, null, null))).isEmpty();
    }

    @Test
    void unknownCategoryAndOutOfRangeValuesAreRejected() {
        assertThat(ScenarioRules.problems("OVERTAKE", "VEHICLE", point(50.0, 0.0, null, null, null, null)))
                .anyMatch(s -> s.contains("category phải thuộc"));
        assertThat(ScenarioRules.problems("CCRM", "VEHICLE", point(50.0, 20.0, null, 120.0, null, null)))
                .anyMatch(s -> s.contains("lateral_overlap_pct"));
        assertThat(ScenarioRules.problems("CCRM", "VEHICLE", point(0.0, 20.0, null, null, null, null)))
                .anyMatch(s -> s.contains("ego_speed_kmh"));
    }

    @Test
    void checkThrowsInvalidRequestWithEveryProblem() {
        assertThatThrownBy(() -> ScenarioRules.check("CCRB", "VEHICLE", point(50.0, null, null, null, null, null)))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessageContaining("target_speed_kmh")
                .hasMessageContaining("initial_distance_m")
                .hasMessageContaining("target_decel_mps2");
    }

    @Test
    void pedestrianSpeedColumnIsMetresPerSecondTimesThreePointSixRoundedToTwoDecimals() {
        assertThat(FamilyService.targetSpeedKmh(Map.of("pedestrian_speed_mps", 1.5))).isEqualTo(5.4);
        assertThat(FamilyService.targetSpeedKmh(Map.of("pedestrian_speed_mps", 3.0))).isEqualTo(10.8);
        assertThat(FamilyService.targetSpeedKmh(Map.of("pedestrian_speed_mps", 2.5))).isEqualTo(9.0);
        assertThat(FamilyService.targetSpeedKmh(Map.of("pedestrian_speed_mps", 1.25))).isEqualTo(4.5);
    }

    @Test
    void everyCategoryOfTheSchemaEnumIsKnown() {
        assertThat(ScenarioRules.CATEGORIES)
                .isEqualTo(List.of("CCRS", "CCRM", "CCRB", "CP_CROSSING", "CPLA", "TURNING", "CUT_IN"));
    }
}
