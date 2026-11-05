package com.vsos.core.simulation;

import com.vsos.core.aeb.AebParams;
import com.vsos.core.bridge.Bundle;
import com.vsos.core.evaluation.Evaluation;
import com.vsos.core.xosc.XoscExport;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/** Nhóm xe phía trước CCRs / CCRm / CCRb trên bộ động học (ADR-050): tất định, đúng hình học, chấm điểm đúng loại lỗi. */
class LeadVehicleSimulatorTest {

    private static LeadVehicleCase ccr(String category, double ego, double target, double distance, Double decel, Double overlap) {
        return new LeadVehicleCase(category, ego, target, distance, decel, overlap, "CLEAR", "DAY", null);
    }

    private static SimulationOutcome run(LeadVehicleCase c, AebParams params) {
        return LeadVehicleSimulator.simulate(c, params, 48846L, VehicleSpec.DEFAULT);
    }

    @Test
    void sameCaseAndSeedGiveTheSameFrames() {
        LeadVehicleCase c = ccr("CCRS", 50, 0, 40, null, null);
        SimulationOutcome a = run(c, AebParams.DEFAULT);
        SimulationOutcome b = run(c, AebParams.DEFAULT);
        assertThat(a.asDict()).isEqualTo(b.asDict());
    }

    @Test
    void stationaryLeadVehicleInLaneMakesAebStopTheCar() {
        SimulationOutcome out = run(ccr("CCRS", 50, 0, 40, null, null), AebParams.DEFAULT);
        assertThat(out.endReason()).isEqualTo("EGO_STOPPED");
        assertThat(out.metrics().get("target_entered_path")).isEqualTo(true);
        assertThat(out.metrics().get("aeb_decision_t")).isNotNull();
        assertThat((Double) out.metrics().get("aeb_decision_ttc_s")).isLessThanOrEqualTo(AebParams.DEFAULT.ttcThreshold());
        assertThat(out.caseDoc().get("category")).isEqualTo("CCRS");
        // Đuôi xe mục tiêu đứng yên ở 40 m suốt run.
        assertThat(out.frames()).allSatisfy(f -> assertThat(f.pedX()).isEqualTo(40.0));
        Evaluation.Result ev = Evaluation.evaluate(out, AebParams.DEFAULT);
        assertThat(ev.verdict()).isNotEqualTo("FAIL");
    }

    @Test
    void ttcUsesTheClosingSpeedForAMovingLeadVehicle() {
        SimulationOutcome out = run(ccr("CCRM", 50, 20, 30, null, null), AebParams.DEFAULT);
        Frame first = out.frames().get(0);
        double closing = 50 / 3.6 - 20 / 3.6;
        assertThat(first.ttcGt()).isCloseTo(30 / closing, within(0.01)); // khung đầu: khoảng cách ban đầu / tốc độ tiếp cận
        assertThat(first.pedX()).isGreaterThan(30.0); // xe trước cũng đang chạy
        assertThat(out.metrics().get("collision")).isEqualTo(false);
    }

    @Test
    void lateTriggerAtHighSpeedHitsTheLeadVehicleAndBlamesTheLeadVehicleNotAPedestrian() {
        AebParams late = new AebParams(0.4, 0.15, 8.0, 20.0);
        SimulationOutcome out = run(ccr("CCRS", 80, 0, 40, null, null), late);
        assertThat(out.endReason()).isEqualTo("COLLISION");
        assertThat((Double) out.metrics().get("relative_impact_speed_mps")).isGreaterThan(0.0);
        Evaluation.Result ev = Evaluation.evaluate(out, late);
        assertThat(ev.verdict()).isEqualTo("FAIL");
        assertThat(ev.failure().get("failure_type")).isEqualTo("COLLISION");
        assertThat(ev.headline()).doesNotContain("pedestrian").contains("lead vehicle");
    }

    @Test
    void vehicleParkedInTheNeighbouringLaneIsPassedWithoutBraking() {
        SimulationOutcome out = run(ccr("CCRS", 50, 0, 40, null, -100.0), AebParams.DEFAULT);
        assertThat(out.endReason()).isEqualTo("TARGET_CLEARED");
        assertThat(out.metrics().get("target_entered_path")).isEqualTo(false);
        assertThat(out.metrics().get("aeb_decision_t")).isNull();
        Evaluation.Result ev = Evaluation.evaluate(out, AebParams.DEFAULT);
        assertThat(ev.verdict()).isEqualTo("PASS");
        assertThat(ev.headline()).isEqualTo("AEB handled the lead vehicle safely.");
    }

    @Test
    void edgeTouchingVehicleIsOutOfPathSoBrakingForItIsFalseBraking() {
        // overlap 0: mép hai xe vừa chạm — không va chạm được, nhưng hành lang AEB (nửa xe + đệm) với tới → phanh oan.
        SimulationOutcome out = run(ccr("CCRS", 50, 0, 40, null, 0.0), AebParams.DEFAULT);
        assertThat(out.metrics().get("collision")).isEqualTo(false);
        Evaluation.Result ev = Evaluation.evaluate(out, AebParams.DEFAULT);
        if (out.metrics().get("aeb_decision_t") != null) {
            assertThat(ev.failure().get("failure_type")).isEqualTo("FALSE_BRAKING");
            assertThat(ev.headline()).contains("vehicle that stayed outside the ego path");
        }
    }

    @Test
    void brakingLeadVehicleSlowsDownAfterItsBrakeStart() {
        SimulationOutcome out = run(ccr("CCRB", 50, 50, 12, -6.0, null), AebParams.DEFAULT);
        assertThat(out.events()).anySatisfy(e -> assertThat(e.get("kind")).isEqualTo("gt_start"));
        Frame before = out.frames().get(10); // t = 0,5 s
        Frame after = out.frames().get(30); // t = 1,5 s
        double vBefore = (out.frames().get(11).pedX() - before.pedX()) / 0.05;
        double vAfter = (out.frames().get(31).pedX() - after.pedX()) / 0.05;
        assertThat(vBefore).isCloseTo(50 / 3.6, within(0.01));
        assertThat(vAfter).isLessThan(vBefore);
    }

    @Test
    void bundleRoundTripsALeadVehicleVariantAndCarlaPathsRefuseIt() {
        Map<String, Object> variant = new LinkedHashMap<>();
        variant.put("category", "CCRB");
        variant.put("ego_speed_kmh", 60.0);
        variant.put("target_speed_kmh", 40.0);
        variant.put("initial_distance_m", 20.0);
        variant.put("target_decel_mps2", -6.0);
        variant.put("weather", "RAIN");
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("variant", variant);
        doc.put("seed", 7);
        Bundle.RunSpec spec = Bundle.readSpec(doc);
        assertThat(spec.leadCase()).isNotNull();
        assertThat(spec.caseSpec()).isNull();
        assertThat(spec.category()).isEqualTo("CCRB");
        Bundle.RunSpec again = Bundle.readSpec(Bundle.makeBundle(spec));
        assertThat(again.leadCase()).isEqualTo(spec.leadCase());
        assertThat(Bundle.simulateKinematic(spec).asDict()).isEqualTo(Bundle.simulateKinematic(again).asDict());
        assertThatThrownBy(() -> XoscExport.export(spec)).isInstanceOf(Bundle.BundleError.class).hasMessageContaining("CCRB");
    }

    @Test
    void bundleRejectsCategoriesWithoutASimulatorAndInvalidLeadVehicleCombinations() {
        Map<String, Object> cutIn = new LinkedHashMap<>(Map.of("category", "CUT_IN", "ego_speed_kmh", 50.0));
        assertThatThrownBy(() -> Bundle.readSpec(Map.of("variant", cutIn))).hasMessageContaining("CUT_IN");
        Map<String, Object> slowEgo = new LinkedHashMap<>(Map.of("category", "CCRM", "ego_speed_kmh", 30.0, "target_speed_kmh", 40.0,
                "initial_distance_m", 20.0));
        assertThatThrownBy(() -> Bundle.readSpec(Map.of("variant", slowEgo))).hasMessageContaining("CCRM: xe ego phải nhanh hơn");
        Map<String, Object> noDecel = new LinkedHashMap<>(Map.of("category", "CCRB", "ego_speed_kmh", 50.0, "target_speed_kmh", 50.0,
                "initial_distance_m", 12.0));
        assertThatThrownBy(() -> Bundle.readSpec(Map.of("variant", noDecel))).hasMessageContaining("thiếu target_decel_mps2");
    }

    @Test
    void crossingBundlesKeepTheirOldShape() {
        CrossingCase c = new CrossingCase(50, 30, 1.5, false, "CLEAR", "DAY", null);
        Bundle.RunSpec spec = new Bundle.RunSpec(c, AebParams.DEFAULT, VehicleSpec.DEFAULT, 1, null, null, Map.of(), Map.of());
        Map<String, Object> bundle = Bundle.makeBundle(spec);
        assertThat(List.copyOf(((Map<?, ?>) bundle.get("variant")).keySet())).asList().containsExactly("ego_speed_kmh", "trigger_distance_m", "pedestrian_speed_mps",
                "stops_at_curb", "weather", "time_of_day", "friction");
        assertThat(Bundle.simulateKinematic(spec).asDict()).isEqualTo(Simulator.simulate(c, AebParams.DEFAULT, 1, VehicleSpec.DEFAULT).asDict());
        assertThat(List.of(spec.category())).containsExactly("CP_CROSSING");
    }
}
