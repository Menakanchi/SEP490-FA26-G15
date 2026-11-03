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

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rows(Map<String, Object> check) {
        return (List<Map<String, Object>>) check.get("fields");
    }
}