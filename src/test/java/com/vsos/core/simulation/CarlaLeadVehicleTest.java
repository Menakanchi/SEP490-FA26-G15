package com.vsos.core.simulation;

import com.vsos.core.aeb.AebParams;
import com.vsos.core.bridge.Bundle;
import com.vsos.core.common.MiniJson;
import com.vsos.core.xosc.Xosc;
import com.vsos.core.xosc.XoscExport;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/** Đường CARLA cho nhóm xe phía trước (ADR-050): `.xosc` có xe mục tiêu, đọc lại được, và CarlaSession chấm đúng khi mục tiêu là xe. */
class CarlaLeadVehicleTest {

    private static Bundle.RunSpec spec(LeadVehicleCase c) {
        return new Bundle.RunSpec(null, AebParams.DEFAULT, VehicleSpec.DEFAULT, 48846L, "v1.0", "Audi e-tron", Map.of(), Map.of(), c);
    }

    private static LeadVehicleCase ccr(String category, double ego, double target, double distance, Double decel, Double overlap) {
        return new LeadVehicleCase(category, ego, target, distance, decel, overlap, "RAIN", "NIGHT", null);
    }

    @Test
    void xoscCarriesTheLeadVehicleAndReadsBackToTheSameCase() {
        LeadVehicleCase c = ccr("CCRB", 60, 50, 20, -6.0, 50.0);
        String xml = XoscExport.export(spec(c));
        assertThat(xml).contains("ScenarioObject name=\"lead\"").contains(XoscExport.LEAD_BLUEPRINT).contains("vehicsim_lead_control")
                .contains("name=\"vs_category\" parameterType=\"string\" value=\"CCRB\"").doesNotContain("pedestrian");
        assertThat(xml).contains("name=\"decel_mps2\" value=\"-6.0\"").contains("name=\"brake_start_s\" value=\"1.0\"");
        Bundle.RunSpec back = Xosc.read(xml);
        assertThat(back.leadCase()).isEqualTo(c);
        assertThat(Xosc.profile(xml).suffix()).isEqualTo(Xosc.SIMULATOR_SUFFIX);
    }

    @Test
    void xoscRefusesALeadVehicleThatWouldDriveOffTheTestRoad() {
        assertThatThrownBy(() -> XoscExport.export(spec(ccr("CCRM", 120, 60, 150, null, null))))
                .isInstanceOf(Bundle.BundleError.class).hasMessageContaining("road 40");
    }

    /** Thế giới CARLA giả: ego theo bàn đạp (giảm tốc 4,6 m/s² ở bàn đạp 1), xe mục tiêu theo profile của controller. Trục x = dọc đường. */
    private static Map<String, Object> runSession(Path dir, LeadVehicleCase c) throws Exception {
        Path xosc = dir.resolve("scenario.xosc");
        Files.writeString(xosc, XoscExport.export(spec(c)), StandardCharsets.UTF_8);
        Path out = dir.resolve("out");
        CarlaSession session = CarlaSession.open(xosc, out, "carla-0.9.16-xosc5", null);
        assertThat(session.leadVehicle()).isTrue();
        double offset = c.lateralOffsetM(VehicleSpec.DEFAULT.widthM());
        double leadCenter = c.initialDistanceM() + 2.3; // xe CARLA dài 4,6 m, gốc actor ở tâm
        double egoX = -VehicleSpec.DEFAULT.lengthM() / 2; // gốc ego ở tâm xe; mũi xe ở x = 0
        session.initLead(new double[] {1, 0}, new double[] {0, -1}, new double[] {leadCenter, offset}, VehicleSpec.DEFAULT.lengthM() / 2,
                Map.of("map", "Town04", "blueprint", "vehicle.audi.etron", "target_blueprint", "vehicle.toyota.prius"), new double[] {4.6, 1.9}, 0.0);
        double dt = 0.01;
        double v = c.egoSpeedKmh() / 3.6;
        double targetV = c.targetSpeedKmh() / 3.6;
        String finished = null;
        for (double t = 0.0; t < 14.0 && finished == null; t += dt) {
            double time = Math.round(t * 1000.0) / 1000.0;
            if (c.targetDecelMps2() != null && time >= LeadVehicleCase.TARGET_BRAKE_START_S) {
                targetV = Math.max(0.0, targetV + c.targetDecelMps2() * dt);
            }
            CarlaSession.Tick tick = session.step(time, new double[] {egoX, 0}, new double[] {1, 0}, new double[] {v, 0},
                    new double[] {leadCenter, offset}, new double[] {targetV, 0}, false);
            if (tick.skip()) {
                continue;
            }
            finished = tick.finished();
            v = Math.max(0.0, v - tick.pedal() * 4.6 * dt);
            egoX += v * dt;
            leadCenter += targetV * dt;
        }
        assertThat(finished).isNotNull();
        return MiniJson.parseObject(Files.readString(out.resolve("result.json"), StandardCharsets.UTF_8));
    }

    @Test
    @SuppressWarnings("unchecked")
    void brakingLeadVehicleRunWritesALeadVehicleResult(@TempDir Path dir) throws Exception {
        Map<String, Object> result = runSession(dir, ccr("CCRB", 50, 50, 12, -6.0, null));
        Map<String, Object> outcome = (Map<String, Object>) result.get("outcome");
        Map<String, Object> caseDoc = (Map<String, Object>) outcome.get("case");
        assertThat(caseDoc.get("category")).isEqualTo("CCRB");
        Map<String, Object> target = (Map<String, Object>) ((Map<String, Object>) caseDoc.get("carla")).get("target");
        assertThat(((Number) target.get("length_m")).doubleValue()).isEqualTo(4.6);
        assertThat(((Number) target.get("initial_gap_m")).doubleValue()).isCloseTo(12.0, within(0.01));
        assertThat(target.get("blueprint")).isEqualTo("vehicle.toyota.prius");
        Map<String, Object> metrics = (Map<String, Object>) outcome.get("metrics");
        assertThat(metrics.get("target_entered_path")).isEqualTo(true);
        assertThat(metrics.get("aeb_decision_t")).isNotNull();
        List<Map<String, Object>> events = (List<Map<String, Object>>) outcome.get("events");
        assertThat(events).anySatisfy(e -> assertThat(e.get("kind")).isEqualTo("gt_start"));
        Map<String, Object> evaluation = (Map<String, Object>) result.get("evaluation");
        assertThat(String.valueOf(evaluation.get("headline"))).doesNotContain("pedestrian");
    }

    @Test
    @SuppressWarnings("unchecked")
    void vehicleInTheNextLaneIsPassedWithoutBraking(@TempDir Path dir) throws Exception {
        Map<String, Object> result = runSession(dir, ccr("CCRS", 40, 0, 40, null, -100.0));
        Map<String, Object> outcome = (Map<String, Object>) result.get("outcome");
        assertThat(outcome.get("end_reason")).isEqualTo("TARGET_CLEARED");
        assertThat(((Map<String, Object>) outcome.get("metrics")).get("aeb_decision_t")).isNull();
    }
}
