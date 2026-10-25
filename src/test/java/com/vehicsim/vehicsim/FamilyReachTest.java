package com.vehicsim.vehicsim;

import com.vehicsim.core.Bundle;
import com.vehicsim.core.SimulationOutcome;
import com.vehicsim.core.Simulator;
import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Biến thể mà xe không tới vạch băng ngang trước khi hết thời gian mô phỏng thì bị từ chối khi tạo họ: run của nó luôn TIMEOUT mà xe chưa gặp
 * người đi bộ. Đối chiếu với bộ động học thật để luật không lệch khỏi mô phỏng.
 */
class FamilyReachTest {

    private static FamilyService.FamilySpec spec(List<Double> speeds, List<Double> distances) {
        return new FamilyService.FamilySpec("x", "", speeds, distances, List.of(1.5), List.of(false, true), List.of("CLEAR"), List.of("DAY"));
    }

    @Test
    void lowSpeedWithFarTriggerIsRejectedWithEveryOffendingPairNamed() {
        FamilyService.FamilySpec s = spec(List.of(10.0, 40.0), List.of(20.0, 80.0));
        assertThat(s.unreachablePairs()).containsExactly("10 km/h + 80 m (tới vạch sau 30.3 s)");
        assertThatThrownBy(s::validate).isInstanceOf(InvalidRequestException.class)
                .hasMessageContaining("không tới được điểm băng ngang trong 12 s").hasMessageContaining("10 km/h + 80 m");
    }

    @Test
    void longListsAreShortenedInTheMessage() {
        FamilyService.FamilySpec s = spec(List.of(10.0, 11.0, 12.0), List.of(60.0, 70.0, 80.0));
        assertThat(s.unreachablePairs()).hasSize(9);
        assertThatThrownBy(s::validate).hasMessageContaining("và 4 cặp khác");
    }

    /** Người đi bộ tối đa 6 m/s khi tạo họ / trích xuất (mới đo tới 6 m/s trên CARLA); run cũ tới 8 m/s vẫn đọc lại được qua Bundle. */
    @Test
    void pedestrianSpeedIsCappedAtTheFastestSpeedMeasuredOnCarla() {
        FamilyService.FamilySpec ok = new FamilyService.FamilySpec("x", "", List.of(40.0), List.of(20.0), List.of(0.5, 6.0), List.of(false),
                List.of("CLEAR"), List.of("DAY"));
        ok.validate();
        FamilyService.FamilySpec fast = new FamilyService.FamilySpec("x", "", List.of(40.0), List.of(20.0), List.of(1.5, 6.5), List.of(false),
                List.of("CLEAR"), List.of("DAY"));
        assertThatThrownBy(fast::validate).isInstanceOf(InvalidRequestException.class)
                .hasMessageContaining("pedestrian_speeds_mps ngoài khoảng [0.5, 6]").hasMessageContaining("6.5");

        Map<String, Object> described = new LinkedHashMap<>(Map.of("ego_speed_kmh", 40.0, "trigger_distance_m", 20.0, "pedestrian_speed_mps", 7.0,
                "inferred_fields", List.of()));
        assertThat(DescribeService.check(described)).anySatisfy(issue -> assertThat(issue).contains("Tốc độ người đi bộ = 7 m/s"));

        Map<String, Object> oldRun = new LinkedHashMap<>(Map.of("ego_speed_kmh", 40.0, "trigger_distance_m", 20.0, "pedestrian_speed_mps", 8.0));
        assertThat(Bundle.readSpec(oldRun).caseSpec()).as("run cũ 8 m/s vẫn dựng lại được").isNotNull();
    }

    @Test
    void defaultFormRangesAreAllReachable() {
        assertThat(spec(List.of(40.0, 50.0, 60.0, 70.0), List.of(20.0, 30.0, 40.0)).unreachablePairs()).isEmpty();
    }

    /** Biên: 10 km/h + 29 m tới vạch sau 11,94 s (hợp lệ); 30 m sau 12,3 s (bị từ chối). */
    @ParameterizedTest
    @CsvSource({"10, 29, true", "10, 30, false", "20, 58, true", "20, 60, false", "130, 80, true"})
    void boundaryFollowsArrivalBeforeTheSimulationEnds(double speed, double distance, boolean reachable) {
        assertThat(spec(List.of(speed), List.of(distance)).unreachablePairs().isEmpty()).isEqualTo(reachable);
    }

    @ParameterizedTest
    @CsvSource({"10, 30", "10, 80", "20, 60", "15, 80"})
    void everyRejectedPairReallyTimesOutBeforeTheCarReachesTheCrossing(double speed, double distance) {
        assertThat(spec(List.of(speed), List.of(distance)).unreachablePairs()).isNotEmpty();
        Map<String, Object> ir = new LinkedHashMap<>(Map.of("ego_speed_kmh", speed, "trigger_distance_m", distance, "pedestrian_speed_mps", 1.5));
        Bundle.RunSpec run = Bundle.readSpec(ir);
        SimulationOutcome out = Simulator.simulate(run.caseSpec(), run.params(), run.seed(), run.vehicle());
        assertThat(out.endReason()).isEqualTo("TIMEOUT");
        assertThat(out.frames().get(out.frames().size() - 1).egoX()).as("mũi xe chưa tới vạch").isLessThan(run.caseSpec().crossingX());
    }
}
