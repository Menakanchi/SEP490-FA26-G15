package com.vehicsim.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Bộ mô phỏng động học 2D cho mô típ "người đi bộ băng qua đường" + AEB/FCW — port 1:1 từ {@code worker/vehicsim_core/simulator.py} (ADR-042).
 *
 * <p>Tất định: cùng case + params + seed → cùng từng khung hình. Hệ tọa độ: xe ego chạy theo +x, tim làn ego ở y = 0; người đi bộ đứng trên vỉa hè bên phải
 * (y âm) và băng sang trái (+y) tại vạch x = {@code crossing_x}. Chuỗi mỗi khung (dt = 0,05 s): ground truth → {@link AebStack#step} → động lực học
 * (giảm tốc bị chặn bởi ma sát μ·g).</p>
 *
 * <p>{@link #makeFrame}, {@link MotionStats} và {@link #buildOutcome} là phần "ghi kết quả" dùng chung: cầu nối CARLA gọi đúng các hàm này nên frame
 * và số đo cùng hình dạng với bộ động học.</p>
 */
public final class Simulator {

    public static final double G = 9.81;
    public static final double MAX_DURATION_S = 12.0;
    public static final double LANE_WIDTH_M = 3.5;
    public static final double PEDESTRIAN_RADIUS_M = 0.3;
    public static final double PEDESTRIAN_START_Y_M = -3.6; // trên vỉa hè, cách mép làn ego 1,85 m
    public static final double CURB_STOP_Y_M = -2.25; // người "dừng ở lề" đứng lại ngay trước mép đường
    public static final double CURB_SLOWDOWN_M = 0.8; // đoạn chậm dần trước khi dừng
    public static final double LEAD_TIME_S = 1.5; // ego bắt đầu cách điểm kích hoạt 1,5 s để có đoạn đường tiếp cận
    public static final double NEAR_MISS_TTC_S = 1.0;
    public static final double NEAR_MISS_DISTANCE_M = 0.5;

    private Simulator() {
    }

    /** AEB cho một lần chạy — cùng cách dựng ở mọi bộ mô phỏng. */
    public static AebStack newAebStack(CrossingCase c, AebParams params, long seed, VehicleSpec vehicle, List<Map<String, Object>> events, double dt,
                                       Double perceptionPeriodS) {
        return new AebStack(params, seed, c.weather(), c.timeOfDay(), vehicle.lengthM(), Math.min(params.maxDeceleration(), vehicle.maxBrakeDecelMps2()),
                events, dt, perceptionPeriodS);
    }

    /** TTC "mắt thần": chỉ có khi người đi bộ đang thật sự nằm trên đường đi của xe. */
    public static Double groundTruthTtc(double gap, double pedY, double egoV, VehicleSpec vehicle) {
        boolean inGtPath = Math.abs(pedY) <= vehicle.widthM() / 2 + PEDESTRIAN_RADIUS_M;
        return inGtPath && gap > 0 && egoV > 0.1 ? gap / egoV : null;
    }

    public static Frame makeFrame(double t, double egoX, double egoV, double egoDecel, double crossingX, double pedY, double pedVy, AebTick tick,
                                  Double ttcGt, AebStack stack) {
        return new Frame(Py.round(t, 3), Py.round(egoX, 3), Py.round(egoV, 3), Py.round(-egoDecel, 3), Py.round(crossingX, 3), Py.round(pedY, 3),
                Py.round(pedVy, 3), tick.detected(), Py.round(tick.confidence(), 3), tick.perceivedY() == null ? null : Py.round(tick.perceivedY(), 3),
                tick.ttc() == null ? null : Py.round(tick.ttc(), 3), ttcGt == null ? null : Py.round(ttcGt, 3), stack.fcwT() != null, stack.decisionT() != null);
    }

    /** Cộng dồn giảm tốc/jerk mỗi khung cho kết quả run (max, trung bình, jerk). */
    public static final class MotionStats {
        private final double dt;
        double maxA;
        double decelSum;
        int decelFrames;
        double maxJerk;
        double prevA;

        public MotionStats(double dt) {
            this.dt = dt;
        }

        public void add(double decel) {
            if (decel > 0) {
                maxA = Math.max(maxA, decel);
                decelSum += decel;
                decelFrames++;
            }
            maxJerk = Math.max(maxJerk, Math.abs(decel - prevA) / dt);
            prevA = decel;
        }
    }

    public static SimulationOutcome buildOutcome(CrossingCase c, AebParams params, VehicleSpec vehicle, AebStack stack, MotionStats stats, List<Frame> frames,
                                                 List<Map<String, Object>> events, String endReason, double crossingX, double decelAvailable, double dt) {
        Map<String, Object> metrics = summaryMetrics(frames, endReason.equals("COLLISION"), crossingX, vehicle, stack.firstDetectionT(), stack.fcwT(),
                stack.decisionT(), stack.brakeOnsetT(), stats.maxA, stats.decelFrames > 0 ? stats.decelSum / stats.decelFrames : null, stats.maxJerk,
                c.egoSpeedKmh() / 3.6, decelAvailable, dt);
        return new SimulationOutcome(endReason, frames.isEmpty() ? 0.0 : Py.round(frames.get(frames.size() - 1).t(), 3), frames, events, metrics,
                Py.round(crossingX, 3), params.asDict(), c.asDict());
    }

    public static SimulationOutcome simulate(CrossingCase c, AebParams params, long seed) {
        return simulate(c, params, seed, VehicleSpec.DEFAULT);
    }

    public static SimulationOutcome simulate(CrossingCase c, AebParams params, long seed, VehicleSpec vehicle) {
        double v0 = c.egoSpeedKmh() / 3.6;
        double halfW = vehicle.widthM() / 2;

        // Ego bắt đầu sao cho còn LEAD_TIME_S trước khi người đi bộ được kích hoạt.
        double crossingX = c.crossingX();
        double egoFront = 0.0;
        double egoV = v0;
        double egoA; // giảm tốc thực tế (>= 0)

        double pedY = PEDESTRIAN_START_Y_M;
        double pedVy = 0.0;
        boolean pedStarted = false;

        List<Frame> frames = new ArrayList<>();
        List<Map<String, Object>> events = new ArrayList<>();
        AebStack stack = newAebStack(c, params, seed, vehicle, events, AebStack.DT, null);
        MotionStats stats = new MotionStats(AebStack.DT);
        double frictionLimit = c.roadFriction() * G;
        String endReason = "TIMEOUT";

        double t = 0.0;
        while (t <= MAX_DURATION_S + 1e-9) {
            double gap = crossingX - egoFront; // khoảng dọc từ mũi xe tới vạch băng qua

            // ---- Ground truth người đi bộ -----------------------------------------
            if (!pedStarted && gap <= c.triggerDistanceM()) {
                pedStarted = true;
                pedVy = c.pedestrianSpeedMps();
                AebStack.Events.record(events, t, "gt_start", "Pedestrian starts crossing");
            }
            if (pedStarted) {
                if (c.stopsAtCurb() && pedVy > 0) {
                    // Người định dừng thì chậm dần trong 0,8 m cuối, không khựng lại tức thì.
                    double remaining = CURB_STOP_Y_M - pedY;
                    pedVy = c.pedestrianSpeedMps() * Math.max(0.15, Math.min(1.0, remaining / CURB_SLOWDOWN_M));
                }
                pedY += pedVy * AebStack.DT;
                if (c.stopsAtCurb() && pedY >= CURB_STOP_Y_M) {
                    if (pedVy > 0) {
                        AebStack.Events.record(events, t, "gt_stop", "Pedestrian stops at the curb");
                    }
                    pedY = CURB_STOP_Y_M;
                    pedVy = 0.0;
                }
            }
            Double ttcGt = groundTruthTtc(gap, pedY, egoV, vehicle);

            // ---- AEB cần kiểm thử: perception -> decision -> control ---------------
            AebTick tick = stack.step(t, gap, pedY, pedVy, egoV);
            egoA = Math.min(tick.decelCmd(), frictionLimit); // mặt đường chặn mức phanh ở μ·g

            // ---- Dynamics ----------------------------------------------------------
            if (egoV > 0) {
                egoV = Math.max(0.0, egoV - egoA * AebStack.DT);
                egoFront += egoV * AebStack.DT;
            } else {
                egoA = 0.0;
            }
            stats.add(egoA);

            frames.add(makeFrame(t, egoFront, egoV, egoA, crossingX, pedY, pedVy, tick, ttcGt, stack));

            // ---- Kết thúc ----------------------------------------------------------
            double egoRear = egoFront - vehicle.lengthM();
            boolean hitsX = crossingX - PEDESTRIAN_RADIUS_M <= egoFront && crossingX + PEDESTRIAN_RADIUS_M >= egoRear;
            if (hitsX && Math.abs(pedY) <= halfW + PEDESTRIAN_RADIUS_M) {
                endReason = "COLLISION";
                AebStack.Events.record(events, t, "collision", "Collision · " + Py.fixed(egoV * 3.6, 1) + " km/h", "impact_speed_mps", Py.round(egoV, 3));
                break;
            }
            if (egoV <= 0.0 && stack.decisionT() != null) {
                endReason = "EGO_STOPPED";
                AebStack.Events.record(events, t, "stopped", "Ego stopped", "gap_m", Py.round(gap, 2));
                break;
            }
            if (egoRear > crossingX + 1.0) {
                endReason = "TARGET_CLEARED";
                break;
            }
            t += AebStack.DT;
        }

        return buildOutcome(c, params, vehicle, stack, stats, frames, events, endReason, crossingX,
                Math.min(Math.min(params.maxDeceleration(), vehicle.maxBrakeDecelMps2()), frictionLimit), AebStack.DT);
    }

    /** Chỉ số khung đầu tiên mà phanh đã tác dụng; {@code -1} nếu AEB không phanh. */
    public static int brakePhaseStart(List<Frame> frames, Double brakeOnsetT) {
        if (brakeOnsetT == null || frames.isEmpty()) {
            return -1;
        }
        for (int i = 0; i < frames.size(); i++) {
            if (frames.get(i).t() >= brakeOnsetT - 1e-9) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Hai mục tiêu tối ưu đo trong *pha phanh* — từ khung phanh bắt đầu tác dụng tới khung cuối (ADR-040): {@code rms_jerk_mps3} (căn trung bình
     * bình phương Δa/dt) và {@code stopping_distance_m} (quãng từ lúc phanh tác dụng tới lúc dừng, cộng v²/(2·decel) nếu run kết thúc khi xe còn chạy).
     * Cả hai là {@code null} khi AEB không phanh. Giữ nguyên định nghĩa của bản Python; đổi định nghĩa là việc của phiên bản đánh giá mới.
     *
     * @return {rmsJerk, stoppingDistance} hoặc {@code null} cho mỗi phần tử
     */
    public static Double[] brakePhaseMetrics(List<Frame> frames, Double brakeOnsetT, double decelAvailable, double dt) {
        int start = brakePhaseStart(frames, brakeOnsetT);
        if (start < 0) {
            return new Double[] {null, null};
        }
        double prev = start > 0 ? frames.get(start - 1).egoA() : 0.0;
        double total = 0.0;
        int count = 0;
        for (int i = start; i < frames.size(); i++) {
            double jerk = (frames.get(i).egoA() - prev) / dt;
            total += jerk * jerk;
            count++;
            prev = frames.get(i).egoA();
        }
        Frame last = frames.get(frames.size() - 1);
        double remaining = decelAvailable > 0 ? last.egoV() * last.egoV() / (2 * decelAvailable) : 0.0;
        return new Double[] {Py.round(Math.sqrt(total / count), 3), Py.round(last.egoX() - frames.get(start).egoX() + remaining, 3)};
    }

    private static Double at(List<Frame> frames, Double t, java.util.function.Function<Frame, Double> key) {
        if (t == null) {
            return null;
        }
        for (Frame f : frames) {
            if (f.t() >= t - 1e-9) {
                return key.apply(f);
            }
        }
        return null;
    }

    static Map<String, Object> summaryMetrics(List<Frame> frames, boolean collision, double crossingX, VehicleSpec vehicle, Double firstDetectionT,
                                              Double fcwT, Double decisionT, Double brakeOnsetT, double maxA, Double meanA, double maxJerk, double v0,
                                              double decelTarget, double dt) {
        double halfW = vehicle.widthM() / 2;
        double minDistance = Double.POSITIVE_INFINITY;
        Double minTtc = null;
        Double gtInPathT = null;
        boolean pedEverInPath = false;
        for (Frame f : frames) {
            double front = f.egoX();
            double rear = f.egoX() - vehicle.lengthM();
            double dx = rear <= crossingX && crossingX <= front ? 0.0 : Math.min(Math.abs(crossingX - front), Math.abs(crossingX - rear));
            double dy = Math.max(0.0, Math.abs(f.pedY()) - halfW);
            double dist = Math.max(0.0, Py.hypot(dx, dy) - PEDESTRIAN_RADIUS_M);
            minDistance = Math.min(minDistance, dist);
            if (f.ttcGt() != null) {
                pedEverInPath = true;
                if (gtInPathT == null) {
                    gtInPathT = f.t();
                }
                minTtc = minTtc == null ? f.ttcGt() : Math.min(minTtc, f.ttcGt());
            }
        }
        if (collision) {
            minDistance = 0.0;
            minTtc = 0.0;
        }
        double lastV = frames.isEmpty() ? v0 : frames.get(frames.size() - 1).egoV();
        double lastX = frames.isEmpty() ? 0.0 : frames.get(frames.size() - 1).egoX();
        Double impactSpeed = collision ? lastV : null;

        Double detectionDistance = null;
        if (firstDetectionT != null) {
            Double egoX = at(frames, firstDetectionT, Frame::egoX);
            detectionDistance = egoX != null ? Py.round(crossingX - egoX, 2) : null;
        }

        Double[] phase = brakePhaseMetrics(frames, brakeOnsetT, Py.round(decelTarget, 3), dt);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("collision", collision);
        m.put("impact_speed_mps", impactSpeed == null ? null : Py.round(impactSpeed, 3));
        m.put("min_distance_m", Double.isFinite(minDistance) ? Py.round(minDistance, 3) : null);
        m.put("min_ttc_s", minTtc == null ? null : Py.round(minTtc, 3));
        m.put("pedestrian_entered_path", pedEverInPath);
        m.put("gt_in_path_t", gtInPathT);
        m.put("first_detection_t", firstDetectionT);
        m.put("first_detection_distance_m", detectionDistance);
        m.put("fcw_t", fcwT);
        m.put("aeb_decision_t", decisionT);
        m.put("aeb_decision_ttc_s", at(frames, decisionT, Frame::ttc));
        m.put("brake_onset_t", brakeOnsetT);
        m.put("braking_latency_s", decisionT == null || brakeOnsetT == null ? null : Py.round(brakeOnsetT - decisionT, 3));
        m.put("max_deceleration_mps2", maxA != 0.0 ? Py.round(maxA, 3) : null);
        m.put("mean_deceleration_mps2", meanA == null ? null : Py.round(meanA, 3));
        m.put("max_jerk_mps3", Py.round(maxJerk, 3));
        m.put("rms_jerk_mps3", phase[0]);
        m.put("stopping_distance_m", phase[1]);
        m.put("ego_initial_speed_mps", Py.round(v0, 3));
        m.put("ego_final_speed_mps", Py.round(lastV, 3));
        m.put("ego_distance_m", Py.round(lastX, 3));
        m.put("decel_available_mps2", Py.round(decelTarget, 3));
        return m;
    }
}
