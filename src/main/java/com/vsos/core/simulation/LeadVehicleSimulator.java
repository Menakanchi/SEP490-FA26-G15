package com.vsos.core.simulation;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.vsos.core.aeb.AebParams;
import com.vsos.core.aeb.AebStack;
import com.vsos.core.aeb.AebTick;
import com.vsos.core.common.Py;

/**
 * Bộ mô phỏng động học cho nhóm "xe phía trước cùng làn" (CCRs / CCRm / CCRb, ADR-050) — cùng {@link AebStack}, cùng bước 0,05 s, cùng cách
 * ghi khung và số đo với {@link Simulator}; chỉ khác "thế giới": mục tiêu là một xe chạy dọc làn thay vì người đi bộ băng ngang.
 *
 * <p>Khung hình dùng lại {@link Frame}: {@code pedX} = đuôi xe mục tiêu (đổi theo thời gian), {@code pedY} = tim xe mục tiêu lệch ngang,
 * {@code pedVy} = 0. Số đo cùng khóa với bộ người đi bộ, thêm {@code target_entered_path} và {@code relative_impact_speed_mps}.</p>
 */
public final class LeadVehicleSimulator {

    private LeadVehicleSimulator() {
    }

    /** Bộ động học hiện hành ({@code vehicsim-kinematic-1.1}): {@code impact_speed_mps} là vận tốc va chạm tương đối. */
    public static SimulationOutcome simulate(LeadVehicleCase c, AebParams params, long seed, VehicleSpec vehicle) {
        return simulate(c, params, seed, vehicle, true);
    }

    /** @param relativeImpact {@code false} = định nghĩa của bộ động học 1.0 ({@code impact_speed_mps} = tốc độ ego); mọi số khác giống hệt. */
    public static SimulationOutcome simulate(LeadVehicleCase c, AebParams params, long seed, VehicleSpec vehicle, boolean relativeImpact) {
        return simulate(c, params, seed, vehicle, relativeImpact, false);
    }

    /** @param aebOff AEB tắt ({@link AebMode}): AEB vẫn quyết định để ghi lại nhưng không phanh. */
    public static SimulationOutcome simulate(LeadVehicleCase c, AebParams params, long seed, VehicleSpec vehicle, boolean relativeImpact, boolean aebOff) {
        double egoV = c.egoSpeedKmh() / 3.6;
        double v0 = egoV;
        double targetV = c.targetSpeedKmh() / 3.6;
        double targetA = LeadVehicleCase.CCRB.equals(c.category()) && c.targetDecelMps2() != null ? c.targetDecelMps2() : 0.0;
        double targetRear = c.initialDistanceM();
        double targetY = c.lateralOffsetM(vehicle.widthM());
        double halfSum = vehicle.widthM() / 2 + LeadVehicleCase.TARGET_WIDTH_M / 2;
        boolean inPath = Math.abs(targetY) < halfSum;

        double egoFront = 0.0;
        double egoA;
        boolean targetBraking = false;
        List<Frame> frames = new ArrayList<>();
        List<Map<String, Object>> events = new ArrayList<>();
        AebStack stack = new AebStack(params, seed, c.weather(), c.timeOfDay(), vehicle.lengthM(),
                Math.min(params.maxDeceleration(), vehicle.maxBrakeDecelMps2()), events, AebStack.DT, null);
        Simulator.MotionStats stats = new Simulator.MotionStats(AebStack.DT);
        double frictionLimit = c.roadFriction() * Simulator.G;
        String endReason = "TIMEOUT";
        double impactRelative = 0.0;

        double t = 0.0;
        while (t <= Simulator.MAX_DURATION_S + 1e-9) {
            double gap = targetRear - egoFront; // từ mũi ego tới đuôi xe mục tiêu

            // ---- Ground truth xe mục tiêu ------------------------------------------
            if (targetA < 0 && t >= LeadVehicleCase.TARGET_BRAKE_START_S && targetV > 0) {
                if (!targetBraking) {
                    targetBraking = true;
                    AebStack.Events.record(events, t, "gt_start", "Lead vehicle brakes · " + Py.fixed(targetA, 1) + " m/s²");
                }
                targetV = Math.max(0.0, targetV + targetA * AebStack.DT);
            }
            double closing = egoV - targetV;
            Double ttcGt = inPath && gap > 0 && closing > 0.1 ? gap / closing : null;

            // ---- AEB cần kiểm thử ---------------------------------------------------
            AebTick tick = stack.stepTarget(t, gap, targetY, 0.0, egoV, targetV, LeadVehicleCase.TARGET_WIDTH_M / 2);
            egoA = aebOff ? 0.0 : Math.min(tick.decelCmd(), frictionLimit); // AEB tắt thì không phanh

            // ---- Dynamics ------------------------------------------------------------
            if (egoV > 0) {
                egoV = Math.max(0.0, egoV - egoA * AebStack.DT);
                egoFront += egoV * AebStack.DT;
            } else {
                egoA = 0.0;
            }
            targetRear += targetV * AebStack.DT;
            stats.add(egoA);

            frames.add(Simulator.makeFrame(t, egoFront, egoV, egoA, targetRear, targetY, 0.0, tick, ttcGt, stack));

            // ---- Kết thúc --------------------------------------------------------------
            double egoRear = egoFront - vehicle.lengthM();
            boolean overlapX = egoFront >= targetRear && egoRear <= targetRear + LeadVehicleCase.TARGET_LENGTH_M;
            if (overlapX && inPath) {
                endReason = "COLLISION";
                impactRelative = Math.max(0.0, egoV - targetV);
                AebStack.Events.record(events, t, "collision", "Collision · " + Py.fixed(egoV * 3.6, 1) + " km/h", "impact_speed_mps", Py.round(egoV, 3),
                        "relative_impact_speed_mps", Py.round(impactRelative, 3));
                break;
            }
            if (egoV <= 0.0 && stack.decisionT() != null) {
                endReason = "EGO_STOPPED";
                AebStack.Events.record(events, t, "stopped", "Ego stopped", "gap_m", Py.round(targetRear - egoFront, 2));
                break;
            }
            if (egoRear > targetRear + LeadVehicleCase.TARGET_LENGTH_M + 1.0) {
                endReason = "TARGET_CLEARED"; // ego đã vượt qua xe ở làn bên
                break;
            }
            t += AebStack.DT;
        }

        double decelAvailable = Math.min(Math.min(params.maxDeceleration(), vehicle.maxBrakeDecelMps2()), frictionLimit);
        SimulationOutcome outcome = buildOutcome(c, params, vehicle, stack, stats, frames, events, endReason, targetY, LeadVehicleCase.TARGET_LENGTH_M,
                halfSum, v0, decelAvailable, impactRelative, AebStack.DT, relativeImpact);
        if (aebOff) {
            AebMode.markOff(outcome);
        }
        return outcome;
    }

    /**
     * Phần "ghi kết quả" dùng chung với runner CARLA (như {@link Simulator#buildOutcome} của người đi bộ): {@code targetY} là độ lệch ngang mục tiêu so
     * với ego, {@code targetLength} chiều dài mục tiêu (CARLA lấy từ bounding box thật), {@code halfSum} nửa bề ngang ego + nửa bề ngang mục tiêu.
     */
    public static SimulationOutcome buildOutcome(LeadVehicleCase c, AebParams params, VehicleSpec vehicle, AebStack stack, Simulator.MotionStats stats,
                                                 List<Frame> frames, List<Map<String, Object>> events, String endReason, double targetY, double targetLength,
                                                 double halfSum, double v0, double decelAvailable, double impactRelative, double dt) {
        return buildOutcome(c, params, vehicle, stack, stats, frames, events, endReason, targetY, targetLength, halfSum, v0, decelAvailable, impactRelative,
                dt, false);
    }

    /**
     * @param relativeImpact định nghĩa hiện hành (chốt 13/11/2026, bộ động học 1.1, CARLA v6): {@code impact_speed_mps} là vận tốc va chạm tương đối,
     *                       tốc độ ego ghi ở {@code ego_impact_speed_mps}; {@code false} = định nghĩa cũ (tốc độ ego) để chạy lại ra đúng kết quả đã lưu
     */
    public static SimulationOutcome buildOutcome(LeadVehicleCase c, AebParams params, VehicleSpec vehicle, AebStack stack, Simulator.MotionStats stats,
                                                 List<Frame> frames, List<Map<String, Object>> events, String endReason, double targetY, double targetLength,
                                                 double halfSum, double v0, double decelAvailable, double impactRelative, double dt, boolean relativeImpact) {
        Map<String, Object> metrics = summaryMetrics(frames, endReason.equals("COLLISION"), targetY, targetLength, halfSum, vehicle, stack, stats, v0,
                decelAvailable, impactRelative, dt, relativeImpact);
        return new SimulationOutcome(endReason, frames.isEmpty() ? 0.0 : Py.round(frames.get(frames.size() - 1).t(), 3), frames, events, metrics,
                Py.round(c.initialDistanceM(), 3), params.asDict(), c.asDict());
    }

    private static Map<String, Object> summaryMetrics(List<Frame> frames, boolean collision, double targetY, double targetLength, double halfSum,
                                                      VehicleSpec vehicle, AebStack stack, Simulator.MotionStats stats, double v0, double decelTarget,
                                                      double impactRelative, double dt, boolean relativeImpact) {
        double minDistance = Double.POSITIVE_INFINITY;
        Double minTtc = null;
        Double gtInPathT = null;
        double dy = Math.max(0.0, Math.abs(targetY) - halfSum);
        for (Frame f : frames) {
            double front = f.egoX();
            double rear = f.egoX() - vehicle.lengthM();
            double targetFront = f.pedX() + targetLength;
            double dx = front < f.pedX() ? f.pedX() - front : rear > targetFront ? rear - targetFront : 0.0;
            minDistance = Math.min(minDistance, Py.hypot(dx, dy));
            if (f.ttcGt() != null) {
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
        Frame last = frames.isEmpty() ? null : frames.get(frames.size() - 1);
        double lastV = last == null ? v0 : last.egoV();
        Double detectionDistance = null;
        Double firstDetectionT = stack.firstDetectionT();
        if (firstDetectionT != null) {
            for (Frame f : frames) {
                if (f.t() >= firstDetectionT - 1e-9) {
                    detectionDistance = Py.round(f.pedX() - f.egoX(), 2);
                    break;
                }
            }
        }
        Double decisionTtc = null;
        if (stack.decisionT() != null) {
            for (Frame f : frames) {
                if (f.t() >= stack.decisionT() - 1e-9) {
                    decisionTtc = f.ttc();
                    break;
                }
            }
        }
        Double[] phase = Simulator.brakePhaseMetrics(frames, stack.brakeOnsetT(), Py.round(decelTarget, 3), dt);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("collision", collision);
        m.put("impact_speed_mps", collision ? Py.round(relativeImpact ? impactRelative : lastV, 3) : null);
        m.put("relative_impact_speed_mps", collision ? Py.round(impactRelative, 3) : null);
        if (relativeImpact) { // định nghĩa hiện hành: impact_speed_mps là vận tốc tương đối, tốc độ ego ghi riêng
            m.put("ego_impact_speed_mps", collision ? Py.round(lastV, 3) : null);
        }
        m.put("min_distance_m", Double.isFinite(minDistance) ? Py.round(minDistance, 3) : null);
        m.put("min_ttc_s", minTtc == null ? null : Py.round(minTtc, 3));
        m.put("target_entered_path", gtInPathT != null);
        m.put("gt_in_path_t", gtInPathT);
        m.put("first_detection_t", firstDetectionT);
        m.put("first_detection_distance_m", detectionDistance);
        m.put("fcw_t", stack.fcwT());
        m.put("aeb_decision_t", stack.decisionT());
        m.put("aeb_decision_ttc_s", decisionTtc);
        m.put("brake_onset_t", stack.brakeOnsetT());
        m.put("braking_latency_s", stack.decisionT() == null || stack.brakeOnsetT() == null ? null : Py.round(stack.brakeOnsetT() - stack.decisionT(), 3));
        m.put("max_deceleration_mps2", stats.maxA != 0.0 ? Py.round(stats.maxA, 3) : null);
        m.put("mean_deceleration_mps2", stats.decelFrames > 0 ? Py.round(stats.decelSum / stats.decelFrames, 3) : null);
        m.put("max_jerk_mps3", Py.round(stats.maxJerk, 3));
        m.put("rms_jerk_mps3", phase[0]);
        m.put("stopping_distance_m", phase[1]);
        m.put("ego_initial_speed_mps", Py.round(v0, 3));
        m.put("ego_final_speed_mps", Py.round(lastV, 3));
        m.put("ego_distance_m", last == null ? 0.0 : Py.round(last.egoX(), 3));
        m.put("decel_available_mps2", Py.round(decelTarget, 3));
        return m;
    }
}
