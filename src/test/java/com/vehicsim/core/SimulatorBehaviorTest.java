package com.vehicsim.core;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Hành vi của bộ động học + luật chấm (ADR-042; chuyển từ {@code worker/tests/test_simulator.py}): tất định, và cho ra đúng loại tình huống MVP cần.
 * {@link KinematicParityTest} chứng minh từng số trùng bản Python; test này giữ ý nghĩa của từng hành vi để ai đổi lõi thấy ngay mình phá điều gì.
 */
class SimulatorBehaviorTest {

    private static CrossingCase c(double speed, double trigger, double ped) {
        return new CrossingCase(speed, trigger, ped, false, "CLEAR", "DAY", null);
    }

    private static CrossingCase c(double speed, double trigger, double ped, boolean curb, String weather, String time) {
        return new CrossingCase(speed, trigger, ped, curb, weather, time, null);
    }

    private static AebParams ttc(double threshold) {
        return new AebParams(threshold, AebParams.DEFAULT.brakeActivationDelay(), AebParams.DEFAULT.maxDeceleration(), AebParams.DEFAULT.brakeBuildupRate());
    }

    private static double metric(SimulationOutcome out, String key) {
        return ((Number) out.metrics().get(key)).doubleValue();
    }

    @Test
    void sameSeedGivesIdenticalRun() {
        CrossingCase c = c(60, 20, 3.0, false, "RAIN", "NIGHT");
        assertThat(Simulator.simulate(c, AebParams.DEFAULT, 7).asDict()).isEqualTo(Simulator.simulate(c, AebParams.DEFAULT, 7).asDict());
    }

    @Test
    void differentSeedChangesPerceptionNoiseOnlyThroughTheRng() {
        CrossingCase c = c(60, 20, 3.0, false, "HEAVY_RAIN", "NIGHT");
        List<Double> a = Simulator.simulate(c, AebParams.DEFAULT, 1).frames().stream().map(Frame::confidence).toList();
        List<Double> b = Simulator.simulate(c, AebParams.DEFAULT, 2).frames().stream().map(Frame::confidence).toList();
        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void longTriggerDistanceStopsBeforeThePedestrian() {
        AebParams p = ttc(1.8);
        SimulationOutcome out = Simulator.simulate(c(40, 40, 1.5), p, 1);
        Evaluation.Result ev = Evaluation.evaluate(out, p);
        assertThat(out.endReason()).isEqualTo("EGO_STOPPED");
        assertThat(ev.outcome()).isEqualTo(Evaluation.OUTCOME_SAFE);
        assertThat(ev.verdict()).isEqualTo("PASS");
    }

    @Test
    void highSpeedWithLowThresholdCollidesAndBlamesDecision() {
        AebParams p = ttc(1.2);
        Evaluation.Result ev = Evaluation.evaluate(Simulator.simulate(c(70, 40, 1.5), p, 3), p);
        assertThat(ev.outcome()).isEqualTo(Evaluation.OUTCOME_COLLISION);
        assertThat(ev.verdict()).isEqualTo("FAIL");
        assertThat(ev.failure()).containsEntry("failure_type", "COLLISION");
        assertThat(ev.primaryStage().stage()).isEqualTo("DECISION");
        assertThat(ev.primaryStage().parameterCode()).isEqualTo("TTC_THRESHOLD");
        assertThat(ev.chain().stream().map(Evaluation.StageVerdict::stage)).containsExactly("PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS");
    }

    @Test
    void nightHeavyRainPerceptionFailureHasNoTunableParameterToBlame() {
        // Ngưỡng phát hiện là hằng số của lõi (ADR-040): khâu Perception hỏng thì không có tham số AEB nào để chỉnh.
        Evaluation.Result ev = Evaluation.evaluate(Simulator.simulate(c(50, 30, 1.5, false, "HEAVY_RAIN", "NIGHT"), AebParams.DEFAULT, 5), AebParams.DEFAULT);
        assertThat(ev.primaryStage()).isNotNull();
        assertThat(ev.primaryStage().stage()).isEqualTo("PERCEPTION");
        assertThat(ev.primaryStage().parameterCode()).isNull();
    }

    @ParameterizedTest
    @ValueSource(doubles = {20.0, 35.0, 50.0, 100.0})
    void buildUpRateAboveTheJerkCapChangesNothing(double buildUp) {
        // Biên mới [5, 20] (migration 008): trên 20 tốc độ tăng lực phanh bị chặn ở JERK_LIMIT nên run cũ (mặc định 50) ≡ 20.
        CrossingCase c = c(60, 25, 1.5);
        SimulationOutcome a = Simulator.simulate(c, new AebParams(1.5, 0.15, 8.0, 20.0), 3);
        SimulationOutcome b = Simulator.simulate(c, new AebParams(1.5, 0.15, 8.0, buildUp), 3);
        assertThat(b.frames()).isEqualTo(a.frames());
        assertThat(b.metrics()).isEqualTo(a.metrics());
    }

    @Test
    void buildUpRateBelowTheCapDoesChangeTheBraking() {
        CrossingCase c = c(60, 25, 1.5);
        SimulationOutcome soft = Simulator.simulate(c, new AebParams(1.5, 0.15, 8.0, 5.0), 3);
        SimulationOutcome hard = Simulator.simulate(c, new AebParams(1.5, 0.15, 8.0, 20.0), 3);
        assertThat(metric(soft, "max_jerk_mps3")).isLessThan(metric(hard, "max_jerk_mps3"));
    }

    @Test
    void brakePhaseObjectivesAreDefinedWheneverTheAebBrakedEvenInACollision() {
        // ADR-040: RMS jerk và quãng phanh dừng chỉ NULL khi không phanh; ca va chạm có giá trị (không bị bỏ khỏi trung bình).
        SimulationOutcome hit = Simulator.simulate(c(60, 25, 1.5), ttc(0.8), 3);
        assertThat(hit.metrics().get("collision")).isEqualTo(true);
        assertThat(hit.metrics().get("brake_onset_t")).isNotNull();
        assertThat(metric(hit, "rms_jerk_mps3")).isGreaterThan(0);
        assertThat(metric(hit, "stopping_distance_m")).isGreaterThan(0);
        // ego còn chạy lúc va chạm nên quãng dừng lớn hơn quãng đã đi được
        double onset = metric(hit, "brake_onset_t");
        double start = hit.frames().stream().filter(f -> f.t() >= onset - 1e-9).findFirst().orElseThrow().egoX();
        double travelled = hit.frames().get(hit.frames().size() - 1).egoX() - start;
        assertThat(metric(hit, "stopping_distance_m")).isGreaterThan(travelled);

        SimulationOutcome quiet = Simulator.simulate(c(50, 30, 1.5, true, "CLEAR", "DAY"), ttc(0.5), 9);
        if (quiet.metrics().get("brake_onset_t") == null) {
            assertThat(quiet.metrics().get("rms_jerk_mps3")).isNull();
            assertThat(quiet.metrics().get("stopping_distance_m")).isNull();
        }
    }

    @Test
    void stoppingDistanceOfARunThatEndsStoppedIsTheDistanceTravelledWhileBraking() {
        AebParams p = ttc(2.0);
        SimulationOutcome out = Simulator.simulate(c(30, 30, 1.5), p, 7);
        assertThat(out.endReason()).isEqualTo("EGO_STOPPED");
        double onset = metric(out, "brake_onset_t");
        double start = out.frames().stream().filter(f -> f.t() >= onset - 1e-9).findFirst().orElseThrow().egoX();
        assertThat(metric(out, "stopping_distance_m")).isCloseTo(out.frames().get(out.frames().size() - 1).egoX() - start, within(1e-3));
        assertThat(Evaluation.evaluate(out, p).aebResult().get("rms_jerk_mps3")).isEqualTo(out.metrics().get("rms_jerk_mps3"));
    }

    @Test
    void aebHasExactlyTheFourTunableParameters() {
        List<String> fields = new ArrayList<>();
        for (var component : AebParams.class.getRecordComponents()) {
            fields.add(component.getName());
        }
        assertThat(fields).containsExactly("ttcThreshold", "brakeActivationDelay", "maxDeceleration", "brakeBuildupRate");
        assertThat(AebParams.DEFAULT.asCodes().keySet()).containsExactlyElementsOf(AebParams.CODES);
    }

    @Test
    void pedestrianStoppingAtTheCurbIsFalseBrakingNotCollision() {
        AebParams p = ttc(2.5);
        SimulationOutcome out = Simulator.simulate(c(50, 30, 3.0, true, "CLEAR", "DAY"), p, 9);
        Evaluation.Result ev = Evaluation.evaluate(out, p);
        assertThat(out.metrics().get("collision")).isEqualTo(false);
        assertThat(ev.aebResult().get("false_activation")).isEqualTo(true);
        assertThat(ev.verdict()).isEqualTo("FAIL");
        assertThat(ev.failure()).containsEntry("failure_type", "FALSE_BRAKING");
    }

    @ParameterizedTest
    @ValueSource(strings = {"CLEAR", "HEAVY_RAIN"})
    void pedestrianWalkingIntoTheSideIsACollisionNeverFalseBraking(String weather) {
        // Người bước vào hông xe sau khi đầu xe qua vạch: không có ttc_gt, nhưng vẫn là va chạm. Trước 01/10/2026 ca "aeb-fired" bị chấm FALSE_BRAKING
        // và ca "aeb-silent" bị đổ cho ngưỡng TTC — lộ ra khi chạy cùng biến thể trên CARLA.
        SimulationOutcome out = Simulator.simulate(c(50, 20, 1.5, false, weather, "DAY"), AebParams.DEFAULT, 48_001);
        assertThat(out.metrics().get("collision")).isEqualTo(true);
        assertThat(out.metrics().get("pedestrian_entered_path")).isEqualTo(false);
        assertThat(out.metrics().get("aeb_decision_t") != null).isEqualTo(weather.equals("HEAVY_RAIN"));

        Evaluation.Result ev = Evaluation.evaluate(out, AebParams.DEFAULT);
        assertThat(ev.outcome()).isEqualTo(Evaluation.OUTCOME_COLLISION);
        assertThat(ev.failure()).containsEntry("failure_type", "COLLISION");
        assertThat(ev.aebResult().get("false_activation")).isEqualTo(false);
        assertThat(ev.primaryStage().stage()).isEqualTo("DECISION");
        assertThat(ev.primaryStage().causeCode()).isEqualTo("SIDE_ENTRY_NOT_PREDICTED");
        assertThat(ev.headline()).contains("side of the car");
    }

    @Test
    void raisingTtcTradesCollisionsForFalseBraking() {
        // Đúng câu chuyện demo MVP: 1,5 -> 1,8 s bớt va chạm, thêm phanh oan, không va chạm mới.
        int fixed = 0;
        int newCollisions = 0;
        int newFalse = 0;
        int i = 0;
        for (double speed : new double[] {40, 50, 60, 70}) {
            for (double dist : new double[] {20, 30, 40}) {
                for (double ped : new double[] {1.5, 3.0}) {
                    for (boolean stop : new boolean[] {false, true}) {
                        CrossingCase c = c(speed, dist, ped, stop, "CLEAR", "DAY");
                        Evaluation.Result a = Evaluation.evaluate(Simulator.simulate(c, ttc(1.5), 100 + i), ttc(1.5));
                        Evaluation.Result b = Evaluation.evaluate(Simulator.simulate(c, ttc(1.8), 100 + i), ttc(1.8));
                        boolean aHit = a.outcome().equals(Evaluation.OUTCOME_COLLISION);
                        boolean bHit = b.outcome().equals(Evaluation.OUTCOME_COLLISION);
                        fixed += aHit && !bHit ? 1 : 0;
                        newCollisions += !aHit && bHit ? 1 : 0;
                        newFalse += Boolean.FALSE.equals(a.aebResult().get("false_activation")) && Boolean.TRUE.equals(b.aebResult().get("false_activation")) ? 1 : 0;
                        i++;
                    }
                }
            }
        }
        assertThat(fixed).isGreaterThan(0);
        assertThat(newCollisions).isZero();
        assertThat(newFalse).isGreaterThan(0);
    }

    @Test
    void thinMarginWithEveryStagePassingIsANearMissFailure() {
        // UC-50: suýt va chạm mà không khâu nào sai vẫn hiện trong danh sách lỗi, loại NEAR_MISS.
        Evaluation.Result ev = Evaluation.evaluate(Simulator.simulate(c(30, 10, 3.0), ttc(1.5), 104), ttc(1.5));
        assertThat(ev.outcome()).isEqualTo(Evaluation.OUTCOME_NEAR_MISS);
        assertThat(ev.primaryStage()).isNull();
        assertThat(ev.failure()).containsEntry("failure_type", "NEAR_MISS").containsEntry("severity", "LOW");
    }
}
