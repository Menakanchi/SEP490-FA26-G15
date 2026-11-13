package com.vsos.core.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.LinkedHashMap;
import java.util.Map;
import com.vsos.core.aeb.AebParams;
import com.vsos.core.bridge.Bundle;
import com.vsos.core.xosc.Xosc;
import com.vsos.core.xosc.XoscExport;
import org.junit.jupiter.api.Test;

/** AEB tắt (chốt 13/11/2026): baseline đo cả AEB hiện tại lẫn AEB tắt; run OFF ghi "AEB lẽ ra làm gì" nhưng không phanh. */
class AebModeTest {

    private static final CrossingCase DANGER = new CrossingCase(50, 25, 3.0, false, "CLEAR", "DAY", null);

    private static Bundle.RunSpec spec(CrossingCase c) {
        return new Bundle.RunSpec(c, AebParams.DEFAULT, VehicleSpec.DEFAULT, 48846L, "v1.0", "e-tron", Map.of(), Map.of());
    }

    /** Một ca băng ngang mà AEB bật dừng kịp còn AEB tắt thì va chạm (dò trên lưới tốc độ × khoảng kích hoạt). */
    private static CrossingCase savedByAeb() {
        for (int kmh : new int[] {40, 50, 60}) {
            for (int trigger = 12; trigger <= 35; trigger++) {
                CrossingCase c = new CrossingCase(kmh, trigger, 3.0, false, "CLEAR", "DAY", null);
                if ("EGO_STOPPED".equals(Bundle.simulateKinematic(spec(c)).endReason())
                        && "COLLISION".equals(Bundle.simulateKinematic(spec(c).withAebOff()).endReason())) {
                    return c;
                }
            }
        }
        throw new AssertionError("không có ca nào AEB cứu được trên lưới");
    }

    @Test
    void withAebOffTheCarHitsThePedestrianTheAebWouldHaveSaved() {
        CrossingCase c = savedByAeb();
        SimulationOutcome on = Bundle.simulateKinematic(spec(c));
        SimulationOutcome off = Bundle.simulateKinematic(spec(c).withAebOff());
        assertThat(on.endReason()).isEqualTo("EGO_STOPPED");
        assertThat(off.endReason()).isEqualTo("COLLISION");
        // AEB vẫn "nhìn" và quyết định — cùng thời điểm như khi bật, vì trước lúc phanh hai run giống hệt nhau.
        assertThat(off.metrics().get("aeb_decision_t")).isNotNull().isEqualTo(on.metrics().get("aeb_decision_t"));
        assertThat(off.metrics().get("fcw_t")).isEqualTo(on.metrics().get("fcw_t"));
        // Không có pha phanh: không để số tính từ lệnh phanh không được áp.
        for (String key : AebMode.BRAKE_PHASE_METRICS) {
            assertThat(off.metrics().get(key)).as(key).isNull();
        }
        assertThat(off.caseDoc()).containsEntry(AebMode.KEY, AebMode.OFF);
        assertThat(on.caseDoc()).doesNotContainKey(AebMode.KEY);
        // Xe không giảm tốc: va chạm ở đúng tốc độ ban đầu.
        assertThat(((Number) off.metrics().get("ego_impact_speed_mps")).doubleValue()).isEqualTo(c.egoSpeedKmh() / 3.6,
                org.assertj.core.api.Assertions.within(1e-3));
        assertThat(off.frames()).allSatisfy(f -> assertThat(f.egoA()).isZero());
    }

    @Test
    void leadVehicleCasesSupportAebOffToo() {
        LeadVehicleCase ccrs = new LeadVehicleCase(LeadVehicleCase.CCRS, 50.0, 0.0, 40.0, null, 100.0, "CLEAR", "DAY", null);
        Bundle.RunSpec lead = new Bundle.RunSpec(null, AebParams.DEFAULT, VehicleSpec.DEFAULT, 48846L, "v1.0", "e-tron", Map.of(), Map.of(), ccrs);
        SimulationOutcome off = Bundle.simulateKinematic(lead.withAebOff());
        assertThat(off.endReason()).isEqualTo("COLLISION");
        assertThat(off.caseDoc()).containsEntry(AebMode.KEY, AebMode.OFF);
        assertThat(off.metrics().get("stopping_distance_m")).isNull();
    }

    @Test
    void theModeTravelsThroughTheBundleAndOnlyWhenOff() {
        Map<String, Object> onDoc = Bundle.makeBundle(spec(DANGER));
        Map<String, Object> offDoc = Bundle.makeBundle(spec(DANGER).withAebOff());
        assertThat(onDoc).as("bundle AEB bật giữ nguyên từng khoá").doesNotContainKey(AebMode.KEY);
        assertThat(offDoc).containsEntry(AebMode.KEY, AebMode.OFF);
        assertThat(Bundle.readSpec(offDoc).aebOff()).isTrue();
        assertThat(Bundle.readSpec(onDoc).aebOff()).isFalse();
        Map<String, Object> bad = new LinkedHashMap<>(onDoc);
        bad.put(AebMode.KEY, "MAYBE");
        assertThatThrownBy(() -> Bundle.readSpec(bad)).isInstanceOf(Bundle.BundleError.class).hasMessageContaining(AebMode.KEY);
    }

    @Test
    void theModeTravelsThroughTheXoscAndOnlyWhenOff() {
        String on = XoscExport.export(spec(DANGER));
        String off = XoscExport.export(spec(DANGER).withAebOff());
        assertThat(on).as("XML AEB bật giữ nguyên").doesNotContain("vs_aeb_mode");
        assertThat(off).contains("name=\"vs_aeb_mode\"").contains("value=\"OFF\"");
        assertThat(Xosc.read(off).aebOff()).isTrue();
        assertThat(Xosc.read(on).aebOff()).isFalse();
    }
}
