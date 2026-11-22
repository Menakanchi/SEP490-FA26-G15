package com.vsos.core.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.Map;
import org.junit.jupiter.api.Test;
import com.vsos.core.aeb.AebParams;
import com.vsos.core.aeb.AebStack;
import com.vsos.core.xosc.Xosc;

/**
 * ADR-057: hành lang AEB "trong đường đi" theo bề rộng của xe chạy (bộ động học 1.2, {@code .xosc} v11) thay cho 1,93 m cố định của bản Python.
 * Đường so fixture cũ ({@code relativeImpact = false}) và profile CARLA ≤ v10 giữ 1,93 m.
 */
class AebCorridorTest {

    private static final long SEED = 48846L;
    private static final VehicleSpec ETRON = new VehicleSpec(4.75, 1.93, 9.13);
    private static final VehicleSpec HGV = new VehicleSpec(7.936, 2.891, 1.77);
    /** Xe rộng như HGV nhưng phanh như e-tron: tách ảnh hưởng của bề rộng khỏi giới hạn phanh. */
    private static final VehicleSpec WIDE = new VehicleSpec(4.75, 2.891, 9.13);

    @Test
    void corridorIsHalfTheVehicleWidthPlusAQuarterOfTheMargin() {
        assertThat(AebParams.corridorHalfWidth(1.93)).isCloseTo(1.465, within(1e-12));
        assertThat(AebParams.corridorHalfWidth(2.891)).isCloseTo(0.5 * 2.891 + 0.5, within(1e-12));
        assertThat(AebParams.LEGACY_CORRIDOR_VEHICLE_WIDTH_M).isEqualTo(1.93);
        assertThat(Simulator.corridorWidth(HGV, true)).isEqualTo(2.891);
        assertThat(Simulator.corridorWidth(HGV, false)).isEqualTo(1.93);
    }

    /**
     * ADR-062: người đi bộ tăng tốc đều trong 0,678 s (bộ động học 1.4) thay vì đạt tốc độ ngay (fixture Python), nên vào đường đi muộn hơn ~0,34 s và AEB
     * không quyết định sớm hơn bản cũ.
     */
    @Test
    void pedestrianAcceleratesOverTheMeasuredRampTime() {
        CrossingCase c = new CrossingCase(40, 25, 1.5, false, "CLEAR", "DAY", null);
        SimulationOutcome current = Simulator.simulate(c, AebParams.DEFAULT, SEED, ETRON, true);
        SimulationOutcome legacy = Simulator.simulate(c, AebParams.DEFAULT, SEED, ETRON, false);
        double start = current.events().stream().filter(e -> "gt_start".equals(e.get("kind"))).mapToDouble(e -> ((Number) e.get("t")).doubleValue())
                .findFirst().orElseThrow();
        Frame early = current.frames().stream().filter(f -> f.t() >= start + 0.10 - 1e-9).findFirst().orElseThrow();
        Frame late = current.frames().stream().filter(f -> f.t() >= start + 0.80 - 1e-9).findFirst().orElseThrow();
        assertThat(early.pedVy()).isCloseTo(1.5 * 0.15 / Simulator.PEDESTRIAN_ACCEL_TIME_S, within(1e-3)); // khung làm tròn 3 chữ số
        assertThat(late.pedVy()).isEqualTo(1.5);
        double inPathCurrent = ((Number) current.metrics().get("gt_in_path_t")).doubleValue();
        double inPathLegacy = ((Number) legacy.metrics().get("gt_in_path_t")).doubleValue();
        assertThat(inPathCurrent - inPathLegacy).isBetween(0.25, 0.45);
        assertThat(((Number) current.metrics().get("aeb_decision_t")).doubleValue())
                .isGreaterThanOrEqualTo(((Number) legacy.metrics().get("aeb_decision_t")).doubleValue());
    }

    /**
     * ADR-058: ở bước 0,05 s, quyết định 2,25 s + trễ 0,25 s phải phanh ở 2,50 s (bản cũ cộng dồn số thực ra 2,4999999999999990 nên phanh ở 2,55 s); quãng
     * phanh tính từ vị trí đầu bước phanh tác dụng.
     */
    @Test
    void brakesExactlyAtDecisionPlusDelayAndMeasuresTheWholeBrakingDistance() {
        CrossingCase c = new CrossingCase(40, 25, 1.5, false, "CLEAR", "DAY", null);
        SimulationOutcome current = Simulator.simulate(c, AebParams.DEFAULT, SEED, ETRON, true);
        SimulationOutcome legacy = Simulator.simulate(c, AebParams.DEFAULT, SEED, ETRON, false);
        double decision = ((Number) current.metrics().get("aeb_decision_t")).doubleValue();
        double legacyDecision = ((Number) legacy.metrics().get("aeb_decision_t")).doubleValue();
        assertThat(((Number) current.metrics().get("brake_onset_t")).doubleValue()).isCloseTo(decision + 0.25, within(1e-9));
        assertThat(((Number) legacy.metrics().get("brake_onset_t")).doubleValue()).isCloseTo(legacyDecision + 0.30, within(1e-9));
        double onset = ((Number) current.metrics().get("brake_onset_t")).doubleValue();
        Frame first = current.frames().stream().filter(f -> f.t() >= onset - 1e-9).findFirst().orElseThrow();
        Frame last = current.frames().get(current.frames().size() - 1);
        assertThat(((Number) current.metrics().get("stopping_distance_m")).doubleValue())
                .isCloseTo(last.egoX() - (first.egoX() - first.egoV() * AebStack.DT), within(1e-3));
    }

    /**
     * 30 km/h, kích hoạt 20 m, người 0,8 m/s: với hành lang 1,93 m AEB không ra quyết định và xe rộng 2,89 m đâm phải người; hành lang theo bề rộng
     * thật thấy người ở trong đường đi, quyết định ở 2,75 s và dừng kịp (bộ động học 1.4: người tăng tốc dần, ADR-062).
     */
    @Test
    void aWiderVehicleSeesThePedestrianInItsPathAndStops() {
        CrossingCase c = new CrossingCase(30, 20, 0.8, false, "CLEAR", "DAY", null);
        Map<String, Object> legacy = Simulator.simulate(c, AebParams.DEFAULT, SEED, WIDE, false).metrics();
        Map<String, Object> current = Simulator.simulate(c, AebParams.DEFAULT, SEED, WIDE, true).metrics();
        assertThat(legacy.get("aeb_decision_t")).as("hành lang 1,93 m: không quyết định").isNull();
        assertThat(legacy.get("collision")).isEqualTo(true);
        assertThat(((Number) current.get("aeb_decision_t")).doubleValue()).isCloseTo(2.75, within(1e-9));
        assertThat(current.get("collision")).isEqualTo(false);
    }

    @Test
    void carlaUsesTheVehicleCorridorFromV11Only() {
        assertThat(CarlaSession.vehicleCorridorApplies(new Xosc.Profile(Xosc.SIMULATOR_SUFFIX, 0.01, 0.05))).isTrue();
        assertThat(CarlaSession.vehicleCorridorApplies(new Xosc.Profile(Xosc.V11_SIMULATOR_SUFFIX, 0.01, 0.05))).isTrue();
        assertThat(CarlaSession.vehicleCorridorApplies(new Xosc.Profile(Xosc.V10_SIMULATOR_SUFFIX, 0.01, 0.05))).isFalse();
        // ADR-058: phanh đúng mốc và bỏ khâu bù khi có bảng bàn đạp chỉ từ v12.
        assertThat(CarlaSession.v12Control(new Xosc.Profile(Xosc.SIMULATOR_SUFFIX, 0.01, 0.05))).isTrue();
        assertThat(CarlaSession.v12Control(new Xosc.Profile(Xosc.V12_SIMULATOR_SUFFIX, 0.01, 0.05))).isTrue();
        assertThat(CarlaSession.v12Control(new Xosc.Profile(Xosc.V11_SIMULATOR_SUFFIX, 0.01, 0.05))).isFalse();
        assertThat(CarlaSession.vehicleCorridorApplies(new Xosc.Profile(Xosc.V12_SIMULATOR_SUFFIX, 0.01, 0.05))).isTrue();
    }
}
