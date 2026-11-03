package com.vsos.core.evaluation;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import com.vsos.core.aeb.AebParams;
import com.vsos.core.aeb.AebStack;
import com.vsos.core.common.Py;
import com.vsos.core.simulation.Frame;
import com.vsos.core.simulation.SimulationOutcome;
import com.vsos.core.simulation.Simulator;

/**
 * Chấm một lần chạy: outcome, số đo AEB (cột kết quả của {@code simulation_runs}), lỗi và chuỗi nguyên nhân gốc — port 1:1 từ
 * {@code worker/vehicsim_core/evaluation.py} (ADR-042). Code thuần, không đụng DB. Chữ mô tả tiếng Anh vì giao diện VehicSim là tiếng Anh.
 *
 * <p>Chuỗi nguyên nhân chấm lần lượt bốn khâu: Perception, Decision, Control, Dynamics; khâu đầu tiên hỏng là nguyên nhân chính. {@code parameter_code}
 * là tham số AEB *chỉnh được* nghi ngờ (ADR-040); nguyên nhân ở hằng số cố định của lõi thì để {@code null}.</p>
 */
public final class Evaluation {

    public static final double TIMING_TOLERANCE_S = 0.15; // chậm hơn thời điểm lý tưởng quá mức này mới tính là trễ
    public static final double CONTROL_LOSS_LIMIT_S = 0.50; // trễ + actuator + nửa đoạn tăng lực phanh tối đa chấp nhận

    public static final String OUTCOME_COLLISION = "COLLISION";
    public static final String OUTCOME_NEAR_MISS = "NEAR_MISS";
    public static final String OUTCOME_SAFE = "SAFE";
    public static final String SIDE_ENTRY_CAUSE = "SIDE_ENTRY_NOT_PREDICTED";

    private Evaluation() {
    }

    public record StageVerdict(String stage, boolean passed, String summary, String causeCode, String parameterCode, double confidence) {
        static StageVerdict pass(String stage, String summary) {
            return new StageVerdict(stage, true, summary, null, null, 0.9);
        }

        static StageVerdict fail(String stage, String summary, String cause, String parameter) {
            return new StageVerdict(stage, false, summary, cause, parameter, 0.9);
        }

        static StageVerdict fail(String stage, String summary, String cause, String parameter, double confidence) {
            return new StageVerdict(stage, false, summary, cause, parameter, confidence);
        }
    }

    public record Result(String outcome, String verdict, Map<String, Object> aebResult, Map<String, Object> failure, List<StageVerdict> chain, String headline) {

        /** Khâu đầu tiên hỏng trong chuỗi nguyên nhân (nguyên nhân chính); {@code null} nếu mọi khâu đạt. */
        public StageVerdict primaryStage() {
            return chain.stream().filter(s -> !s.passed()).findFirst().orElse(null);
        }

        /** {@code evaluation.to_document}: để {@code result.json} mang kết quả chấm sang backend mà không phải chấm lại. */
        public Map<String, Object> toDocument() {
            Map<String, Object> doc = new LinkedHashMap<>();
            doc.put("outcome", outcome);
            doc.put("verdict", verdict);
            doc.put("headline", headline);
            doc.put("aeb_result", aebResult);
            doc.put("failure", failure);
            List<Object> stages = new ArrayList<>();
            for (StageVerdict s : chain) {
                Map<String, Object> stage = new LinkedHashMap<>();
                stage.put("stage", s.stage());
                stage.put("passed", s.passed());
                stage.put("summary", s.summary());
                stage.put("cause_code", s.causeCode());
                stage.put("parameter_code", s.parameterCode());
                stage.put("confidence", s.confidence());
                stages.add(stage);
            }
            doc.put("chain", stages);
            return doc;
        }
    }

    private static Double d(Map<String, Object> m, String key) {
        return m.get(key) instanceof Number n ? n.doubleValue() : null;
    }

    private static boolean b(Map<String, Object> m, String key) {
        return Boolean.TRUE.equals(m.get(key));
    }

    /** Python {@code x or 0}: giá trị thiếu hoặc bằng 0 đều thành 0. */
    private static double orZero(Double x) {
        return x == null ? 0.0 : x;
    }

    public static String classifyOutcome(Map<String, Object> metrics) {
        if (b(metrics, "collision")) {
            return OUTCOME_COLLISION;
        }
        Double minTtc = d(metrics, "min_ttc_s");
        Double minDist = d(metrics, "min_distance_m");
        if ((minTtc != null && minTtc < Simulator.NEAR_MISS_TTC_S) || (minDist != null && minDist < Simulator.NEAR_MISS_DISTANCE_M)) {
            return OUTCOME_NEAR_MISS;
        }
        return OUTCOME_SAFE;
    }

    /** Lúc AEB "mắt thần" (ground truth, không trễ, không nhiễu) sẽ kích hoạt. */
    private static Double idealTriggerT(SimulationOutcome outcome, AebParams params) {
        for (Frame f : outcome.frames()) {
            if (f.ttcGt() != null && f.ttcGt() <= params.ttcThreshold()) {
                return f.t();
            }
        }
        return null;
    }

    public static Result evaluate(SimulationOutcome outcome, AebParams params) {
        Map<String, Object> m = outcome.metrics();
        String kind = classifyOutcome(m);
        boolean triggered = m.get("aeb_decision_t") != null;
        // Va chạm luôn là có mối nguy — kể cả khi người đi bộ bước vào HÔNG xe sau khi mũi xe đã qua vạch.
        boolean hazard = b(m, "pedestrian_entered_path") || b(m, "collision");
        boolean falseActivation = triggered && !hazard;
        Double idealT = idealTriggerT(outcome, params);
        boolean missedActivation = hazard && idealT != null && !triggered;

        String verdict = kind.equals(OUTCOME_COLLISION) || falseActivation || missedActivation ? "FAIL" : "PASS";
        Map<String, Object> aeb = new LinkedHashMap<>();
        aeb.put("collision", m.get("collision"));
        aeb.put("collision_count", b(m, "collision") ? 1 : 0);
        aeb.put("impact_speed_mps", m.get("impact_speed_mps"));
        aeb.put("min_ttc_s", m.get("min_ttc_s"));
        aeb.put("min_distance_m", m.get("min_distance_m"));
        aeb.put("aeb_triggered", triggered);
        aeb.put("aeb_trigger_time_s", m.get("aeb_decision_t"));
        aeb.put("braking_latency_s", m.get("braking_latency_s"));
        aeb.put("false_activation", falseActivation);
        aeb.put("missed_activation", missedActivation);
        aeb.put("max_deceleration_mps2", m.get("max_deceleration_mps2"));
        aeb.put("mean_deceleration_mps2", m.get("mean_deceleration_mps2"));
        aeb.put("max_jerk_mps3", m.get("max_jerk_mps3"));
        aeb.put("rms_jerk_mps3", m.get("rms_jerk_mps3"));
        aeb.put("stopping_distance_m", m.get("stopping_distance_m"));
        aeb.put("verdict", verdict);

        if (falseActivation) {
            List<StageVerdict> chain = falseActivationChain(outcome, params);
            Map<String, Object> failure = new LinkedHashMap<>();
            failure.put("failure_type", "FALSE_BRAKING");
            failure.put("severity", "MEDIUM");
            failure.put("detected_at_s", m.get("aeb_decision_t"));
            failure.put("description", chain.get(1).summary());
            return new Result(kind, verdict, aeb, failure, chain, "AEB braked for a pedestrian who stopped at the curb.");
        }

        if (kind.equals(OUTCOME_SAFE) && !missedActivation) {
            return new Result(kind, verdict, aeb, null, List.of(), "AEB handled the crossing safely.");
        }

        List<StageVerdict> chain = hazardChain(outcome, params, idealT);
        double impactKmh = orZero(d(m, "impact_speed_mps")) * 3.6;
        String failureType;
        String severity;
        Object detectedAt;
        if (kind.equals(OUTCOME_COLLISION)) {
            failureType = "COLLISION";
            severity = impactKmh >= 30 ? "CRITICAL" : impactKmh >= 15 ? "HIGH" : "MEDIUM";
            detectedAt = null;
            for (Map<String, Object> e : outcome.events()) {
                if ("collision".equals(e.get("kind"))) {
                    detectedAt = e.get("t");
                    break;
                }
            }
        } else if (missedActivation) {
            failureType = "MISSED_BRAKING";
            severity = "HIGH";
            detectedAt = idealT;
        } else {
            failureType = "LATE_BRAKING";
            severity = "MEDIUM";
            detectedAt = m.get("aeb_decision_t");
        }
        StageVerdict primary = chain.stream().filter(s -> !s.passed()).findFirst().orElse(null);
        String description = primary != null ? primary.summary() : null;
        if (primary == null && kind.equals(OUTCOME_NEAR_MISS)) {
            // Mọi khâu đạt chuẩn mà vẫn sát nút: lỗi nằm ở biên an toàn, không ở khâu nào (UC-50, ADR-037).
            failureType = "NEAR_MISS";
            severity = "LOW";
            description = "Every stage met spec, but the margin was thin: min distance " + Py.fixed(orZero(d(m, "min_distance_m")), 2)
                    + " m, min TTC " + Py.fixed(orZero(d(m, "min_ttc_s")), 2) + " s.";
        }
        Map<String, Object> failure = new LinkedHashMap<>();
        failure.put("failure_type", failureType);
        failure.put("severity", severity);
        failure.put("detected_at_s", detectedAt);
        failure.put("description", description != null && !description.isEmpty() ? description : "Hazard reproduced without a single failing stage.");
        return new Result(kind, verdict, aeb, failure, chain, headline(chain, m, idealT));
    }

    private static List<StageVerdict> hazardChain(SimulationOutcome outcome, AebParams params, Double idealT) {
        Map<String, Object> m = outcome.metrics();
        Map<String, Object> c = outcome.caseDoc();
        double v0 = d(m, "ego_initial_speed_mps");
        Double detT = d(m, "first_detection_t");
        Double decT = d(m, "aeb_decision_t");
        Double referenceT = idealT != null ? idealT : d(m, "gt_in_path_t");

        // -- Perception ----------------------------------------------------------------
        StageVerdict perception;
        if (detT == null) {
            perception = StageVerdict.fail("PERCEPTION", "Pedestrian never passed the detection threshold " + Py.fixed(AebStack.DETECTION_CONFIDENCE_THRESHOLD, 2)
                    + " (" + String.valueOf(c.get("weather")).toLowerCase(Locale.ROOT).replace('_', ' ') + ", "
                    + String.valueOf(c.get("time_of_day")).toLowerCase(Locale.ROOT) + ").", "OBJECT_NOT_DETECTED", null);
        } else if (referenceT != null && detT > referenceT + TIMING_TOLERANCE_S) {
            perception = StageVerdict.fail("PERCEPTION", "Pedestrian first detected at t " + Py.fixed(detT, 1) + " s ("
                    + Py.fixed(d(m, "first_detection_distance_m"), 0) + " m), " + Py.fixed(detT - referenceT, 1) + " s after AEB should have fired.",
                    "OBJECT_DETECTED_LATE", null);
        } else {
            Double dist = d(m, "first_detection_distance_m");
            perception = StageVerdict.pass("PERCEPTION", dist != null
                    ? "Pedestrian detected at t " + Py.fixed(detT, 1) + " s (" + Py.fixed(dist, 0) + " m) with latency 0.1 s."
                    : "Pedestrian detected at t " + Py.fixed(detT, 1) + " s.");
        }

        // -- Ngân sách thời gian để dừng ------------------------------------------------
        double aNom = params.maxDeceleration();
        double aEff = d(m, "decel_available_mps2");
        double rampTime = params.decelRampRate() != 0.0 ? aNom / params.decelRampRate() : 0.0;
        double tCtrl = params.brakeActivationDelay() + AebStack.ACTUATOR_RESPONSE_TIME_S + rampTime / 2;
        double neededNominal = tCtrl + v0 / (2 * aNom);
        double neededActual = tCtrl + v0 / (2 * aEff);
        Double entryTtc = null;
        for (Frame f : outcome.frames()) {
            if (f.ttcGt() != null) {
                entryTtc = f.ttcGt();
                break;
            }
        }

        // -- Decision ------------------------------------------------------------------
        StageVerdict decision;
        if (b(m, "collision") && entryTtc == null) {
            decision = StageVerdict.fail("DECISION", "Pedestrian stepped into the side of the car after its front had passed the crossing; "
                    + "AEB only predicts the pedestrian's position for the moment the front arrives.", SIDE_ENTRY_CAUSE, null, 0.6);
        } else if (decT == null) {
            decision = StageVerdict.fail("DECISION", "AEB never issued a brake command: the predicted path did not enter the lane in time.", "NO_TRIGGER", null);
        } else if (referenceT != null && decT > referenceT + TIMING_TOLERANCE_S && perception.passed()) {
            decision = StageVerdict.fail("DECISION", "AEB fired at TTC " + Py.fixed(d(m, "aeb_decision_ttc_s"), 1) + " s, " + Py.fixed(decT - referenceT, 1)
                    + " s after the " + Py.fixed(params.ttcThreshold(), 1) + " s threshold was reached.", "TRIGGERED_TOO_LATE", "TTC_THRESHOLD");
        } else if (params.ttcThreshold() < neededNominal) {
            decision = StageVerdict.fail("DECISION", "TTC threshold " + Py.fixed(params.ttcThreshold(), 1) + " s is below the " + Py.fixed(neededNominal, 1)
                    + " s needed to stop from " + Py.fixed(v0 * 3.6, 0) + " km/h.", "THRESHOLD_TOO_LOW", "TTC_THRESHOLD", 0.85);
        } else if (entryTtc != null && entryTtc < neededActual && orZero(d(m, "aeb_decision_ttc_s")) < neededActual) {
            decision = StageVerdict.fail("DECISION", "Pedestrian entered the path at TTC " + Py.fixed(entryTtc, 1) + " s, inside the " + Py.fixed(neededActual, 1)
                    + " s stopping envelope; only an earlier path prediction could have fired in time.", "PATH_ENTERED_LATE", null, 0.6);
        } else {
            decision = StageVerdict.pass("DECISION", "Brake command at TTC " + Py.fixed(d(m, "aeb_decision_ttc_s"), 1) + " s, within the "
                    + Py.fixed(params.ttcThreshold(), 1) + " s threshold.");
        }

        // -- Control -------------------------------------------------------------------
        StageVerdict control;
        if (decT != null && tCtrl > CONTROL_LOSS_LIMIT_S) {
            control = StageVerdict.fail("CONTROL", "Brake delay " + Py.fixed(params.brakeActivationDelay(), 2) + " s + actuator "
                    + Py.fixed(AebStack.ACTUATOR_RESPONSE_TIME_S, 2) + " s + ramp " + Py.fixed(rampTime, 2) + " s lost " + Py.fixed(tCtrl, 2)
                    + " s of braking (limit " + Py.fixed(CONTROL_LOSS_LIMIT_S, 2) + " s).", "SLOW_BRAKE_BUILDUP",
                    rampTime / 2 >= params.brakeActivationDelay() ? "BRAKE_BUILDUP_RATE" : "BRAKE_ACTIVATION_DELAY", 0.75);
        } else {
            control = StageVerdict.pass("CONTROL", decT != null
                    ? "Brake command reached " + Py.fixed(orZero(d(m, "max_deceleration_mps2")), 1) + " m/s² with " + Py.fixed(tCtrl, 2) + " s of delay and ramp."
                    : "No brake command to execute.");
        }

        // -- Dynamics ------------------------------------------------------------------
        double friction = ((Number) c.get("road_friction")).doubleValue();
        StageVerdict dynamics;
        if (aEff < aNom - 0.05) {
            dynamics = StageVerdict.fail("VEHICLE_DYNAMICS", "Road friction μ " + Py.fixed(friction, 2) + " capped deceleration at " + Py.fixed(aEff, 1)
                    + " m/s² vs " + Py.fixed(aNom, 1) + " requested.", "LOW_FRICTION", "MAX_DECELERATION", 0.85);
        } else {
            dynamics = StageVerdict.pass("VEHICLE_DYNAMICS", "Road friction μ " + Py.fixed(friction, 2) + ": requested " + Py.fixed(aNom, 1)
                    + " m/s² was achievable.");
        }
        return List.of(perception, decision, control, dynamics);
    }

    private static List<StageVerdict> falseActivationChain(SimulationOutcome outcome, AebParams params) {
        Map<String, Object> m = outcome.metrics();
        return List.of(
                StageVerdict.pass("PERCEPTION", "Pedestrian detected and tracked correctly."),
                StageVerdict.fail("DECISION", "AEB braked at TTC " + Py.fixed(d(m, "aeb_decision_ttc_s"), 1) + " s for a pedestrian who stopped at the curb; the "
                        + Py.fixed(AebStack.PREDICTION_HORIZON_S, 1) + " s predicted path entered the lane.", "PATH_PREDICTION_TOO_CONSERVATIVE", "TTC_THRESHOLD", 0.8),
                StageVerdict.pass("CONTROL", "Braking executed as commanded."),
                StageVerdict.pass("VEHICLE_DYNAMICS", "Vehicle dynamics nominal."));
    }

    private static String headline(List<StageVerdict> chain, Map<String, Object> m, Double idealT) {
        StageVerdict primary = chain.stream().filter(s -> !s.passed()).findFirst().orElse(null);
        if (primary == null) {
            return b(m, "collision") ? "Every stage met its spec, yet the pedestrian was reached."
                    : "AEB stopped in time, but with less margin than the near-miss limit.";
        }
        switch (primary.stage()) {
            case "PERCEPTION":
                return "The pedestrian was detected too late for AEB to stop.";
            case "DECISION": {
                if (SIDE_ENTRY_CAUSE.equals(primary.causeCode())) {
                    return "The pedestrian walked into the side of the car; AEB only checks the moment the front arrives.";
                }
                Double decT = d(m, "aeb_decision_t");
                if (decT != null && idealT != null && decT > idealT) {
                    return "The pedestrian was detected in time, but AEB activated " + Py.fixed(decT - idealT, 1) + " s too late.";
                }
                return "The pedestrian was detected in time, but the TTC threshold left too little room to stop.";
            }
            case "CONTROL":
                return "AEB fired in time, but braking built up too slowly.";
            default:
                return "AEB fired in time, but the road could not deliver the requested deceleration.";
        }
    }
}
