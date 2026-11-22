package com.vsos.core.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.Map;
import org.junit.jupiter.api.Test;
import com.vsos.core.aeb.AebParams;
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

    @Test
    void anEtronWideVehicleRunsExactlyAsBefore() {
        CrossingCase c = new CrossingCase(40, 25, 1.5, false, "CLEAR", "DAY", null);
        Map<String, Object> current = Simulator.simulate(c, AebParams.DEFAULT, SEED, ETRON, true).metrics();
        Map<String, Object> legacy = Simulator.simulate(c, AebParams.DEFAULT, SEED, ETRON, false).metrics();
        for (String key : new String[] {"aeb_decision_t", "fcw_t", "brake_onset_t", "min_distance_m", "stopping_distance_m"}) {
            assertThat(current.get(key)).as(key).isEqualTo(legacy.get(key));
        }
    }

    /**
     * 30 km/h, kích hoạt 15 m, người 1,0 m/s: với hành lang 1,93 m AEB không ra quyết định và xe rộng 2,89 m đâm phải người; hành lang theo bề rộng
     * thật thấy người ở trong đường đi, quyết định ở 1,95 s và dừng kịp.
     */
    @Test
    void aWiderVehicleSeesThePedestrianInItsPathAndStops() {
        CrossingCase c = new CrossingCase(30, 15, 1.0, false, "CLEAR", "DAY", null);
        Map<String, Object> legacy = Simulator.simulate(c, AebParams.DEFAULT, SEED, WIDE, false).metrics();
        Map<String, Object> current = Simulator.simulate(c, AebParams.DEFAULT, SEED, WIDE, true).metrics();
        assertThat(legacy.get("aeb_decision_t")).as("hành lang 1,93 m: không quyết định").isNull();
        assertThat(legacy.get("collision")).isEqualTo(true);
        assertThat(((Number) current.get("aeb_decision_t")).doubleValue()).isCloseTo(1.95, within(1e-9));
        assertThat(current.get("collision")).isEqualTo(false);
    }

    @Test
    void carlaUsesTheVehicleCorridorFromV11Only() {
        assertThat(CarlaSession.vehicleCorridorApplies(new Xosc.Profile(Xosc.SIMULATOR_SUFFIX, 0.01, 0.05))).isTrue();
        assertThat(CarlaSession.vehicleCorridorApplies(new Xosc.Profile(Xosc.V10_SIMULATOR_SUFFIX, 0.01, 0.05))).isFalse();
    }
}
