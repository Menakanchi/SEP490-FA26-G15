package com.vsos.core.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import com.vsos.core.aeb.AebParams;
import com.vsos.core.aeb.AebStack;
import com.vsos.core.aeb.AebTick;
import com.vsos.core.aeb.DecelMeter;
import com.vsos.core.common.Py;

/**
 * Phần logic mà controller CARLA trước đây giữ ở Python, nay ở lõi Java (ADR-042; chuyển từ {@code test_run_variant.py} và {@code test_step_100hz.py}):
 * khung tọa độ, đo giảm tốc, bàn đạp phanh, và AEB chạy ở bước 0,01 s mà không đổi hành vi dùng chung với bộ động học.
 */
class CarlaSessionLogicTest {

    private static final double SPEED = 11.0;

    private static com.vsos.core.bridge.Bundle.RunSpec crossing(String weather) {
        return new com.vsos.core.bridge.Bundle.RunSpec(new CrossingCase(40, 25, 1.5, false, weather, "DAY", null), AebParams.DEFAULT,
                VehicleSpec.DEFAULT, 1L, null, null, Map.of(), Map.of());
    }

    /**
     * a_avail trên CARLA (sổ tay công thức 24b, 31): từ định dạng hiện hành, giới hạn xe là giảm tốc phanh 100% đo được, không phải
     * {@code max_brake_decel_mps2} 9,5 giả định của bộ động học. File định dạng cũ giữ cách tính cũ để chạy lại ra đúng kết quả đã lưu.
     */
    @Test
    void decelAvailableUsesTheMeasuredFullBrakeOnTheCurrentFormatOnly() {
        com.vsos.core.xosc.Xosc.Profile current = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.SIMULATOR_SUFFIX, 0.01, 0.05);
        com.vsos.core.xosc.Xosc.Profile previous = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V4_SIMULATOR_SUFFIX, 0.01, 0.05);
        com.vsos.core.xosc.Xosc.Profile v7 = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V7_SIMULATOR_SUFFIX, 0.01, 0.05);
        com.vsos.core.xosc.Xosc.Profile v8 = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V8_SIMULATOR_SUFFIX, 0.01, 0.05);
        assertThat(CarlaSession.decelAvailable(crossing("CLEAR"), v7, 3.56)).isEqualTo(3.56); // v5 trở đi giữ cách tính từ 11/11
        assertThat(CarlaSession.decelAvailable(crossing("CLEAR"), v8, 3.56)).isEqualTo(3.56);
        // Xe chưa hiệu chuẩn (phanh 100% ~3,56 m/s², Tesla Model 3): trước đây vẫn tính như xe phanh được 8.
        assertThat(CarlaSession.decelAvailable(crossing("CLEAR"), current, 3.56)).isEqualTo(3.56);
        assertThat(CarlaSession.decelAvailable(crossing("CLEAR"), previous, 3.56)).isEqualTo(8.0);
        // e-tron đã hiệu chuẩn (ADR-051, 9,13): MAX_DECELERATION 8 vẫn là giới hạn chặt nhất, số không đổi.
        assertThat(CarlaSession.decelAvailable(crossing("CLEAR"), current, 9.13)).isEqualTo(8.0);
        // Mưa: μ·g vẫn là giới hạn khi nhỏ hơn mức xe phanh được.
        assertThat(CarlaSession.decelAvailable(crossing("RAIN"), current, 9.13)).isCloseTo(0.70 * Simulator.G, within(1e-9));
        // v9 chỉ đổi nguồn perception (ADR-043): v5 giữ cách tính phanh đo được như đã lưu.
        com.vsos.core.xosc.Xosc.Profile v5 = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V5_SIMULATOR_SUFFIX, 0.01, 0.05);
        assertThat(CarlaSession.decelAvailable(crossing("CLEAR"), v5, 3.56)).isEqualTo(3.56);
    }

    /** ADR-043 giai đoạn 2: chỉ profile hiện hành (v9) với người đi bộ đưa radar vào AEB thật; v8 trở xuống và xe phía trước vẫn dùng ground truth. */
    @Test
    void radarDrivesTheAebOnlyForPedestriansOnTheCurrentProfile() {
        com.vsos.core.xosc.Xosc.Profile current = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.SIMULATOR_SUFFIX, 0.01, 0.05);
        com.vsos.core.xosc.Xosc.Profile v5 = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V5_SIMULATOR_SUFFIX, 0.01, 0.05);
        assertThat(CarlaSession.radarPerception(crossing("CLEAR"), current)).isTrue();
        assertThat(CarlaSession.radarPerception(crossing("CLEAR"), v5)).isFalse();
        assertThat(CarlaSession.radarPerception(crossing("CLEAR"),
                new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V8_SIMULATOR_SUFFIX, 0.01, 0.05))).isFalse();
        assertThat(CarlaSession.radarPerception(crossing("CLEAR"), new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V9_SIMULATOR_SUFFIX, 0.01, 0.05))).isTrue();
        assertThat(CarlaSession.radarPerception(crossing("CLEAR"), new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V10_SIMULATOR_SUFFIX, 0.01, 0.05))).isTrue();
        LeadVehicleCase lead = new LeadVehicleCase(LeadVehicleCase.CCRS, 50.0, 0.0, 40.0, null, 100.0, "CLEAR", "DAY", null);
        com.vsos.core.bridge.Bundle.RunSpec leadSpec = new com.vsos.core.bridge.Bundle.RunSpec(null, AebParams.DEFAULT, VehicleSpec.DEFAULT, 1L, null, null,
                Map.of(), Map.of(), lead);
        assertThat(CarlaSession.radarPerception(leadSpec, current)).as("bộ bám chặn vật tĩnh: không dùng cho xe phía trước đứng yên").isFalse();
    }

    /**
     * D2/R1: CARLA không giảm bám đường theo thời tiết (đo 14/11/2026: mưa vẫn phanh 7,8–9,3 m/s²), nên lệnh giảm tốc đưa ra bàn đạp bị kẹp ở μ·g.
     * Đường khô không đổi gì; file định dạng cũ giữ lệnh gốc để chạy lại ra đúng kết quả đã lưu.
     */
    @Test
    void pedalCommandIsCappedAtRoadFrictionFromV6Only() {
        com.vsos.core.xosc.Xosc.Profile current = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.SIMULATOR_SUFFIX, 0.01, 0.05);
        com.vsos.core.xosc.Xosc.Profile v6 = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V6_SIMULATOR_SUFFIX, 0.01, 0.05);
        com.vsos.core.xosc.Xosc.Profile v7 = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V7_SIMULATOR_SUFFIX, 0.01, 0.05);
        com.vsos.core.xosc.Xosc.Profile v5 = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V5_SIMULATOR_SUFFIX, 0.01, 0.05);
        assertThat(CarlaSession.frictionLimitedCommand(8.0, crossing("CLEAR"), current)).isEqualTo(8.0);
        assertThat(CarlaSession.frictionLimitedCommand(8.0, crossing("RAIN"), current)).isCloseTo(0.70 * Simulator.G, within(1e-9));
        assertThat(CarlaSession.frictionLimitedCommand(5.0, crossing("RAIN"), current)).isEqualTo(5.0);
        assertThat(CarlaSession.frictionLimitedCommand(8.0, crossing("HEAVY_RAIN"), current)).isCloseTo(0.55 * Simulator.G, within(1e-9));
        assertThat(CarlaSession.frictionLimitedCommand(8.0, crossing("RAIN"),
                new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V8_SIMULATOR_SUFFIX, 0.01, 0.05))).isCloseTo(0.70 * Simulator.G, within(1e-9));
        assertThat(CarlaSession.frictionLimitedCommand(8.0, crossing("RAIN"), v6)).isCloseTo(0.70 * Simulator.G, within(1e-9));
        assertThat(CarlaSession.frictionLimitedCommand(8.0, crossing("RAIN"), v7)).isCloseTo(0.70 * Simulator.G, within(1e-9));
        assertThat(CarlaSession.frictionLimitedCommand(8.0, crossing("RAIN"), v5)).isEqualTo(8.0);
    }

    /**
     * ADR-053: dưới 6 m/s CARLA dừng gần như tức thì (~24 m/s² ở mọi mức bàn đạp, đo 14/11/2026). Từ v7 lõi trả tốc độ cần đặt, giảm đều theo lệnh
     * giảm tốc AEB đã kẹp μ·g — như mô hình lý tưởng; v6 trở về trước không có vùng này.
     */
    @Test
    void lowSpeedPhaseFollowsTheCommandedDecelerationFromV7Only() {
        com.vsos.core.xosc.Xosc.Profile current = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.SIMULATOR_SUFFIX, 0.01, 0.05);
        com.vsos.core.xosc.Xosc.Profile v6 = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V6_SIMULATOR_SUFFIX, 0.01, 0.05);
        com.vsos.core.xosc.Xosc.Profile v7 = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V7_SIMULATOR_SUFFIX, 0.01, 0.05);
        assertThat(CarlaSession.lowSpeedOverrideApplies(current)).isTrue();
        assertThat(CarlaSession.lowSpeedOverrideApplies(v7)).isTrue();
        assertThat(CarlaSession.lowSpeedOverrideApplies(new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V8_SIMULATOR_SUFFIX, 0.01, 0.05))).isTrue();
        assertThat(CarlaSession.lowSpeedOverrideApplies(v6)).isFalse();
        assertThat(CarlaSession.LOW_SPEED_OVERRIDE_MPS).isEqualTo(6.0);
        // Đường khô, lệnh 8 m/s²: mỗi tick 0,01 s giảm 0,08 m/s; từ 6 m/s tới dừng mất 0,75 s như mô hình (6 / 8).
        double v = 6.0;
        int ticks = 0;
        while (v > 0.0) {
            v = CarlaSession.nextLowSpeed(v, 8.0, 0.01, crossing("CLEAR"), current);
            ticks++;
        }
        assertThat(ticks).isBetween(75, 76);
        // Mưa: mức giảm bị kẹp ở μ·g; lệnh âm / bằng 0 thì giữ tốc độ; không bao giờ âm.
        assertThat(CarlaSession.nextLowSpeed(5.0, 8.0, 0.01, crossing("RAIN"), current)).isCloseTo(5.0 - 0.70 * Simulator.G * 0.01, within(1e-12));
        assertThat(CarlaSession.nextLowSpeed(5.0, 0.0, 0.01, crossing("CLEAR"), current)).isEqualTo(5.0);
        assertThat(CarlaSession.nextLowSpeed(0.01, 8.0, 0.01, crossing("CLEAR"), current)).isEqualTo(0.0);
    }

    /**
     * ADR-056: CARLA đạt lực phanh muộn hơn bàn đạp ~0,05 s (đo 16/11/2026). Từ v10, trong lúc lệnh giảm tốc đang tăng, feed-forward bàn đạp lấy theo
     * lệnh của 0,055 s sau; lệnh giữ nguyên hoặc giảm thì không cộng gì. v9 trở về trước không có phần này.
     */
    @Test
    void rampLeadOnlyWhileTheCommandRisesFromV10() {
        com.vsos.core.xosc.Xosc.Profile current = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.SIMULATOR_SUFFIX, 0.01, 0.05);
        assertThat(CarlaSession.rampLeadApplies(current)).isTrue();
        assertThat(CarlaSession.rampLeadApplies(new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V10_SIMULATOR_SUFFIX, 0.01, 0.05))).isTrue();
        assertThat(CarlaSession.rampLeadApplies(new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V9_SIMULATOR_SUFFIX, 0.01, 0.05))).isFalse();
        assertThat(CarlaSession.RAMP_LEAD_S).isEqualTo(0.055);
        // Lệnh AEB tăng 20 m/s³ (0,2 m/s² mỗi tick 0,01 s): cộng thêm 0,055 × 20 = 1,1 m/s².
        assertThat(CarlaSession.rampLeadCommand(4.2, 4.0, 0.01)).isCloseTo(4.2 + 1.1, within(1e-9));
        assertThat(CarlaSession.rampLeadCommand(8.0, 8.0, 0.01)).as("hết pha tăng lực").isEqualTo(8.0);
        assertThat(CarlaSession.rampLeadCommand(5.0, 6.0, 0.01)).as("lệnh giảm").isEqualTo(5.0);
        assertThat(CarlaSession.rampLeadCommand(0.0, 0.0, 0.01)).isZero();
        // Tick đầu khi phanh: lệnh từ 0 lên 0,2.
        assertThat(CarlaSession.rampLeadCommand(0.2, 0.0, 0.01)).isCloseTo(0.2 + 1.1, within(1e-9));
    }

    /** Xe CARLA như bộ xuất ghi cho một xe đã hiệu chuẩn mô-men. */
    private static Map<String, Object> carlaVehicle(String blueprint, double torque, double fullBrake) {
        return Map.of("blueprint", blueprint, "physics", Map.of("mass", 2000.0, "wheels", Map.of("max_brake_torque", torque)), "full_brake_decel_mps2", fullBrake);
    }

    /**
     * ADR-059: Model 3 1750 N·m / Patrol 2250 N·m / Sprinter 2250 N·m có bảng bàn đạp theo tốc độ (đợt 4) từ v13; v12 trở về trước giữ tuyến tính. Bù pha
     * tăng lực chỉ cho xe đã đo được độ trễ (e-tron, Model 3).
     */
    @Test
    void calibratedVehiclesGetTheirOwnPedalMapFromV13Only() {
        com.vsos.core.xosc.Xosc.Profile current = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.SIMULATOR_SUFFIX, 0.01, 0.05);
        com.vsos.core.xosc.Xosc.Profile v12 = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V12_SIMULATOR_SUFFIX, 0.01, 0.05);
        Map<String, Object> model3 = carlaVehicle("vehicle.tesla.model3", 1750.0, 9.87);
        Map<String, Object> patrol = carlaVehicle("vehicle.nissan.patrol_2021", 2250.0, 9.90);
        Map<String, Object> sprinter = carlaVehicle("vehicle.mercedes.sprinter", 2250.0, 8.91);
        assertThat(CarlaSession.pedalMapFor(current, model3, 9.87).id()).isEqualTo("model3-1750nm-2026-11-22");
        assertThat(CarlaSession.pedalMapFor(current, patrol, 9.90).id()).isEqualTo("patrol-2250nm-2026-11-22");
        assertThat(CarlaSession.pedalMapFor(current, sprinter, 8.91).id()).isEqualTo("sprinter-2250nm-2026-11-22");
        assertThat(CarlaSession.pedalMapFor(v12, model3, 9.87)).as("v12 chưa có bảng 3 xe").isNull();
        assertThat(CarlaSession.pedalMapFor(v12, etron(1800.0), 9.13)).as("e-tron có bảng từ v8").isNotNull();
        assertThat(CarlaSession.pedalMapFor(current, carlaVehicle("vehicle.tesla.model3", 700.0, 3.56), 3.56)).as("mô-men mặc định chưa đo").isNull();
        assertThat(CarlaSession.pedalMapFor(current, model3, 9.87).rampLead()).isTrue();
        assertThat(CarlaSession.pedalMapFor(current, patrol, 9.90).rampLead()).as("≤ v13").isFalse();
        assertThat(CarlaSession.pedalMapFor(current, sprinter, 8.91).rampLead()).as("≤ v13").isFalse();
        // ADR-061: từ v14 Patrol / Sprinter cũng bù pha tăng lực; v13 vẫn có bảng 3 xe nhưng chưa bù.
        assertThat(CarlaSession.pedalMapFor(current, patrol, 9.90).rampLead(true)).isTrue();
        assertThat(CarlaSession.pedalMapFor(current, sprinter, 8.91).rampLead(true)).isTrue();
        assertThat(CarlaSession.pedalMapFor(current, patrol, 9.90).rampLead(false)).isFalse();
        assertThat(CarlaSession.pedalMapFor(new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V13_SIMULATOR_SUFFIX, 0.01, 0.05), patrol, 9.90)).as("v13 có bảng 3 xe").isNotNull();
        for (Map<String, Object> vehicle : List.of(model3, patrol, sprinter)) {
            double full = ((Number) vehicle.get("full_brake_decel_mps2")).doubleValue();
            CarlaPedalMap map = CarlaSession.pedalMapFor(current, vehicle, full);
            for (double kmh = 20; kmh <= 110; kmh += 2.5) {
                double prev = 0.0;
                for (double a = 0.1; a <= 12.0; a += 0.1) {
                    double pedal = map.feedForward(a, kmh / 3.6);
                    assertThat(pedal).as("%s %.1f km/h, %.1f m/s²", map.id(), kmh, a).isGreaterThanOrEqualTo(prev).isBetween(0.0, 1.0);
                    prev = pedal;
                }
            }
        }
    }

    /**
     * ADR-060: CARLA bắt đầu dừng gấp ở tốc độ phụ thuộc bàn đạp (e-tron bàn đạp 0,876 → 8,32 m/s), nên từ v13 adapter chuyển sang đặt tốc độ ở điểm đó + 0,3
     * m/s, không dưới 6 m/s. Khâu bù theo giảm tốc đo chỉ bị bỏ ở v12.
     */
    @Test
    void lowSpeedOverrideStartsBeforeTheMeasuredAbruptStop() {
        com.vsos.core.xosc.Xosc.Profile current = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.SIMULATOR_SUFFIX, 0.01, 0.05);
        CarlaPedalMap etron = CarlaSession.pedalMapFor(current, etron(1800.0), 9.13);
        assertThat(etron.overrideSpeed(0.876)).isCloseTo(8.32 + 0.3, within(1e-9));
        assertThat(etron.overrideSpeed(1.0)).isCloseTo(8.56 + 0.3, within(1e-9));
        assertThat(etron.overrideSpeed(0.1)).as("bàn đạp nhỏ hơn điểm đo đầu: dùng điểm đầu").isCloseTo(6.59 + 0.3, within(1e-9));
        CarlaPedalMap patrol = CarlaSession.pedalMapFor(current, carlaVehicle("vehicle.nissan.patrol_2021", 2250.0, 9.90), 9.90);
        assertThat(patrol.overrideSpeed(1.0)).isCloseTo(10.39 + 0.3, within(1e-9));
        double prev = 0.0;
        for (double p = 0.0; p <= 1.0; p += 0.01) {
            double v = etron.overrideSpeed(p);
            assertThat(v).isGreaterThanOrEqualTo(Math.max(6.0, prev - 1e-12));
            prev = v;
        }
        assertThat(CarlaSession.pureFeedForward(new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V12_SIMULATOR_SUFFIX, 0.01, 0.05))).isTrue();
        assertThat(CarlaSession.pureFeedForward(current)).isFalse();
    }

    /** Xe CARLA như bộ xuất ghi cho e-tron đã hiệu chuẩn (ADR-051): blueprint + mô-men phanh mọi bánh. */
    private static Map<String, Object> etron(double torque) {
        return Map.of("blueprint", "vehicle.audi.etron", "physics", Map.of("mass", 2100.0, "wheels", Map.of("max_brake_torque", torque)),
                "full_brake_decel_mps2", 9.13);
    }

    /**
     * ADR-054: e-tron 1800 N·m phanh thấp hơn mức đích ~0,5 m/s² (vùng chết bàn đạp, đo 16/11/2026). Từ v8 bàn đạp feed-forward lấy theo bảng đo
     * được; xe khác, mô-men khác, phanh 100% khác hoặc file cũ giữ giả định tuyến tính.
     */
    @Test
    void pedalMapAppliesToTheMeasuredEtronFromV8Only() {
        com.vsos.core.xosc.Xosc.Profile current = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.SIMULATOR_SUFFIX, 0.01, 0.05);
        com.vsos.core.xosc.Xosc.Profile v7 = new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V7_SIMULATOR_SUFFIX, 0.01, 0.05);
        assertThat(CarlaSession.pedalMapFor(current, etron(1800.0), 9.13)).isNotNull();
        assertThat(CarlaSession.pedalMapFor(v7, etron(1800.0), 9.13)).isNull();
        assertThat(CarlaSession.pedalMapFor(new com.vsos.core.xosc.Xosc.Profile(com.vsos.core.xosc.Xosc.V8_SIMULATOR_SUFFIX, 0.01, 0.05), etron(1800.0), 9.13))
                .as("v8 giữ bảng bàn đạp").isNotNull();
        assertThat(CarlaSession.pedalMapFor(current, etron(1500.0), 9.13)).as("mô-men khác chưa đo").isNull();
        assertThat(CarlaSession.pedalMapFor(current, etron(1800.0), 9.5)).as("phanh 100% khác").isNull();
        assertThat(CarlaSession.pedalMapFor(current, Map.of("blueprint", "vehicle.tesla.model3"), 3.56)).isNull();
        assertThat(CarlaSession.pedalMapFor(current, Map.of(), 9.13)).isNull();

        CarlaPedalMap map = CarlaSession.pedalMapFor(current, etron(1800.0), 9.13);
        // Feed-forward lớn hơn tuyến tính để bù vùng chết; lệnh ≤ 0 → 0; vượt phanh 100% → 1.
        assertThat(map.feedForward(4.0, 15.0)).isGreaterThan(4.0 / 9.13);
        assertThat(map.feedForward(0.0, 15.0)).isZero();
        assertThat(map.feedForward(-1.0, 15.0)).isZero();
        assertThat(map.feedForward(20.0, 15.0)).isEqualTo(1.0);
        assertThat(DecelMeter.brakePedalFrom(map.feedForward(4.0, 15.0), 4.0, 4.0)).isEqualTo(map.feedForward(4.0, 15.0));
        // Bảng theo tốc độ (bước 2): đúng điểm đo thì trả đúng bàn đạp đã dùng khi đo; giữa hai hàng tốc độ thì nội suy.
        assertThat(map.feedForward(5.608, 60 / 3.6)).isCloseTo(0.6572, within(1e-9));
        assertThat(map.feedForward(2.547, 50 / 3.6)).isCloseTo(0.3286, within(1e-9));
        double mid = map.feedForward(5.0, 57.5 / 3.6);
        assertThat(mid).isBetween(Math.min(map.feedForward(5.0, 55 / 3.6), map.feedForward(5.0, 60 / 3.6)) - 1e-12,
                Math.max(map.feedForward(5.0, 55 / 3.6), map.feedForward(5.0, 60 / 3.6)) + 1e-12);
        // Ngoài 30–100 km/h dùng hàng gần nhất.
        assertThat(map.feedForward(3.0, 20 / 3.6)).isEqualTo(map.feedForward(3.0, 30 / 3.6));
        assertThat(map.feedForward(3.0, 130 / 3.6)).isEqualTo(map.feedForward(3.0, 100 / 3.6));
        // Tăng đơn điệu theo lệnh ở mọi tốc độ; lệnh nhỏ hơn điểm đo nhỏ nhất vẫn lớn hơn vùng chết.
        for (double kmh = 20; kmh <= 110; kmh += 2.5) {
            double prev = 0.0;
            for (double a = 0.1; a <= 12.0; a += 0.1) {
                double pedal = map.feedForward(a, kmh / 3.6);
                assertThat(pedal).as("%.1f km/h, %.1f m/s²", kmh, a).isGreaterThanOrEqualTo(prev).isBetween(CarlaPedalMap.ETRON_DEADZONE_PEDAL, 1.0);
                prev = pedal;
            }
        }
        // Hàm cũ không đổi: tuyến tính + bù 0,05 × sai số.
        assertThat(DecelMeter.brakePedal(4.0, 3.0, 8.0)).isCloseTo(0.5 + 0.05, within(1e-12));
    }

    private static AebStack stack(double dt, Double period) {
        return new AebStack(AebParams.DEFAULT, 7, "RAIN", "NIGHT", 4.9, 8.0, new ArrayList<>(), dt, period);
    }

    /** Cùng một thế giới liên tục (xe tiến tới người đứng trên đường) lấy mẫu theo {@code dt}. */
    private static List<AebTick> drive(AebStack stack, double dt) {
        List<AebTick> ticks = new ArrayList<>();
        for (int k = 0; k <= Math.round(3.0 / dt); k++) {
            double t = Py.round(k * dt, 6);
            ticks.add(stack.step(t, 30.0 - SPEED * t, 0.3, 0.0, SPEED));
        }
        return ticks;
    }

    @Test
    void crossingFrameMatchesTheKinematicAxes() {
        // CARLA tay trái: đi theo +x thì bên phải là +y. Người đi bộ bên phải -> y âm như bộ động học.
        CrossingFrame frame = new CrossingFrame(100.0, 50.0, 1.0, 0.0, 0.0, 1.0);
        assertThat(frame.along(90.0, 50.0)).isEqualTo(-10.0); // mũi xe còn cách vạch 10 m -> gap = 10
        assertThat(frame.left(100.0, 50.0 - Simulator.PEDESTRIAN_START_Y_M)).isCloseTo(Simulator.PEDESTRIAN_START_Y_M, within(1e-12));
        assertThat(frame.velocityLeft(0.0, -1.4)).isEqualTo(1.4); // đi về bên trái
        assertThat(frame.velocityAlong(11.1, 0.0)).isEqualTo(11.1);

        // Đường hướng +y (yaw 90°): bên phải là -x, nên người đứng ở x = -3,6 là bên phải.
        CrossingFrame rotated = new CrossingFrame(0.0, 0.0, 0.0, 1.0, -1.0, 0.0);
        assertThat(rotated.along(0.0, -20.0)).isEqualTo(-20.0);
        assertThat(rotated.left(-3.6, 0.0)).isEqualTo(-3.6);
        assertThat(rotated.left(3.6, 0.0)).isEqualTo(3.6);
    }

    @Test
    void brakePedalMapsDecelerationIntoZeroOne() {
        assertThat(DecelMeter.brakePedal(0.0, 0.0, 4.6)).isEqualTo(0.0);
        assertThat(DecelMeter.brakePedal(2.3, 2.3, 4.6)).isCloseTo(0.5, within(1e-12));
        assertThat(DecelMeter.brakePedal(8.0, 4.0, 4.6)).isEqualTo(1.0);
        assertThat(DecelMeter.brakePedal(1.0, 9.0, 4.6)).isEqualTo(0.0); // đo thấy phanh quá tay -> nhả
    }

    @Test
    void decelMeterIgnoresCruiseJitterAveragesSawtoothAndClamps() {
        DecelMeter idle = new DecelMeter(9.81, 2, 0.05);
        assertThat(List.of(idle.update(11.0, false), idle.update(11.2, false), idle.update(11.0, false))).containsExactly(0.0, 0.0, 0.0);

        DecelMeter meter = new DecelMeter(9.81, 2, 0.05);
        List<Double> readings = new ArrayList<>();
        for (double v : new double[] {10.79, 10.69, 10.33, 10.23, 9.87}) {
            readings.add(meter.update(v, true));
        }
        assertThat(readings.subList(2, 5)).allSatisfy(r -> assertThat(r).isCloseTo(4.6, within(0.01))); // 2 rồi 7,3 m/s² xen kẽ

        meter.update(6.0, true);
        assertThat(meter.update(3.5, true)).isEqualTo(9.81);
        assertThat(meter.clamped()).isEqualTo(2);
    }

    @Test
    void decelMeterWindowIsATimeSpan() {
        // Cùng tín hiệu giảm tốc 4,6 m/s² lấy mẫu 20 Hz và 100 Hz phải ra cùng giá trị đo.
        assertThat(measure(0.05, 2)).isCloseTo(4.6, within(1e-6));
        assertThat(measure(0.01, 10)).isCloseTo(4.6, within(1e-6));
    }

    private static double measure(double dt, int window) {
        DecelMeter meter = new DecelMeter(9.81, window, dt);
        double speed = 11.0;
        double value = 0.0;
        for (int i = 0; i < Math.round(0.5 / dt); i++) {
            speed -= 4.6 * dt;
            value = meter.update(speed, true);
        }
        return value;
    }

    @Test
    void perceptionUpdatesOnTheSensorPeriodWhileControlRunsEveryStep() {
        List<AebTick> ticks = drive(stack(0.01, 0.05), 0.01);
        // Nhiễu độ tin cậy chỉ rút lại mỗi 5 bước: các bước còn lại giữ nguyên lần cảm biến gần nhất.
        for (int start = 0; start < ticks.size() - 5; start += 5) {
            Set<Double> block = new HashSet<>();
            for (AebTick t : ticks.subList(start, start + 5)) {
                block.add(t.confidence());
            }
            assertThat(block).hasSize(1);
        }
        assertThat(ticks.stream().map(AebTick::confidence).distinct().count()).isGreaterThan(5);
        List<Double> braking = ticks.stream().map(AebTick::decelCmd).filter(d -> d > 0).toList();
        assertThat(braking.size()).isGreaterThan(20);
        Set<Double> ramp = new HashSet<>();
        for (int i = 1; i < braking.size(); i++) {
            if (braking.get(i) < 8.0) {
                ramp.add(Py.round(braking.get(i) - braking.get(i - 1), 6));
            }
        }
        assertThat(ramp).containsExactly(Py.round(AebParams.DEFAULT.decelRampRate() * 0.01, 6)); // giảm tốc tăng theo bước 0,01 s, không theo 0,05 s
    }

    @Test
    void decisionsMatchThe20HzStackOnTheSameWorld() {
        AebStack coarse = stack(0.05, null);
        AebStack fine = stack(0.01, 0.05);
        drive(coarse, 0.05);
        drive(fine, 0.01);
        // Cùng chuỗi nhiễu, cùng độ trễ perception 0,1 s: phát hiện, FCW và quyết định rơi vào đúng cùng khung cảm biến.
        assertThat(fine.firstDetectionT()).isEqualTo(coarse.firstDetectionT());
        assertThat(fine.fcwT()).isEqualTo(coarse.fcwT());
        assertThat(fine.decisionT()).isNotNull().isEqualTo(coarse.decisionT());
        // Phanh bắt đầu ngay khi hết trễ (độ phân giải 0,01 s thay vì 0,05 s).
        assertThat(fine.brakeOnsetT()).isNotNull();
        assertThat(coarse.brakeOnsetT()).isNotNull();
        double gap = coarse.brakeOnsetT() - fine.brakeOnsetT();
        assertThat(gap).isGreaterThanOrEqualTo(0).isLessThan(0.05);
    }

    @Test
    void perceptionLagIsTimeBasedNotFrameCounted() {
        assertThat(stack(0.05, null).lagFrames()).isEqualTo(2);
        assertThat(stack(0.01, 0.05).lagFrames()).isEqualTo(10);
    }

    @Test
    void defaultStackIsUnchangedForTheKinematicSimulator() {
        assertThat(stack(0.05, null).perceptionEvery()).isEqualTo(1);
        assertThat(stack(0.01, 0.05).perceptionEvery()).isEqualTo(5);
    }

    @Test
    void periodMustBeAMultipleOfTheStep() {
        assertThatThrownBy(() -> stack(0.01, 0.025)).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("bội số");
    }

    @Test
    void physicsCheckFlagsAForcedFieldThatDidNotStickAndReportsMeshDifferencesSeparately() {
        // Số đọc lại thật của e-tron 21/10: khối lượng khớp, mesh cao 1,649 (DB 1,67), cơ sở 2,896 (DB 2,95).
        Map<String, Object> carla = Map.of("physics", Map.of("mass", 2100.0, "drag_coefficient", 0.3),
                "dimensions", Map.of("height_m", 1.67, "wheelbase_m", 2.95));
        VehicleSpec vehicle = new VehicleSpec(4.90, 1.94, 9.0);
        Map<String, Object> applied = Map.of("mass", 2100.0, "drag_coefficient", 0.30000001192, "length_m", 4.87, "width_m", 1.93,
                "height_m", 1.649, "wheelbase_m", 2.896);

        Map<String, Object> ok = CarlaSession.physicsCheck(carla, vehicle, applied);
        assertThat(ok.get("forced_ok")).isEqualTo(true);
        assertThat(ok.get("dimensions_ok")).isEqualTo(false); // cơ sở lệch 0,054 m > 0,05
        assertThat(rows(ok)).extracting(r -> r.get("field")).containsExactly("mass", "drag_coefficient", "length_m", "width_m", "height_m", "wheelbase_m");

        Map<String, Object> bad = CarlaSession.physicsCheck(carla, vehicle, Map.of("mass", 1800.0, "drag_coefficient", 0.3));
        assertThat(bad.get("forced_ok")).isEqualTo(false);
        assertThat(bad.get("dimensions_ok")).isEqualTo(true); // thiếu số đọc lại: ghi dòng nhưng không coi là lệch
        assertThat(rows(bad).get(0)).containsEntry("delta", -300.0).containsEntry("ok", false);
    }

    @Test
    void physicsCheckFlagsACalibratedBrakeTorqueThatDidNotReachEveryWheel() {
        // ADR-051: XoscExport từng bỏ lặng lẽ physics.wheels nên CARLA giữ 1000 N·m; mỗi bánh phải có đúng mô-men đã yêu cầu.
        Map<String, Object> carla = Map.of("physics", Map.of("mass", 2100.0, "wheels", Map.of("max_brake_torque", 2400.0)));
        VehicleSpec vehicle = new VehicleSpec(4.75, 1.93, 9.5);
        List<Map<String, Object>> calibrated = List.of(Map.of("max_brake_torque", 2400.0), Map.of("max_brake_torque", 2400.0),
                Map.of("max_brake_torque", 2400.0), Map.of("max_brake_torque", 2400.0));
        Map<String, Object> ok = CarlaSession.physicsCheck(carla, vehicle, Map.of("mass", 2100.0, "wheels", calibrated));
        assertThat(ok.get("forced_ok")).isEqualTo(true);
        assertThat(rows(ok)).extracting(r -> r.get("field")).contains("wheel_0_max_brake_torque", "wheel_3_max_brake_torque");

        List<Map<String, Object>> stock = List.of(Map.of("max_brake_torque", 1000.0), Map.of("max_brake_torque", 1000.0),
                Map.of("max_brake_torque", 1000.0), Map.of("max_brake_torque", 1000.0));
        Map<String, Object> bad = CarlaSession.physicsCheck(carla, vehicle, Map.of("mass", 2100.0, "wheels", stock));
        assertThat(bad.get("forced_ok")).isEqualTo(false);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rows(Map<String, Object> check) {
        return (List<Map<String, Object>>) check.get("fields");
    }
}