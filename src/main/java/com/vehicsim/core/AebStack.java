package com.vehicsim.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Hệ AEB/FCW cần kiểm thử — dùng chung cho mọi bộ mô phỏng (động học và CARLA); đây là nơi **duy nhất** có logic AEB (ADR-042).
 *
 * <p>Bộ mô phỏng chỉ lo "thế giới": xe, người đi bộ, va chạm, ma sát. Mỗi khung nó đưa ground truth vào {@link #step} và nhận lại mức giảm tốc
 * AEB yêu cầu. Chuỗi xử lý mỗi khung: perception (độ trễ + nhiễu + ngưỡng confidence) → decision (TTC + dự đoán quỹ đạo theo tầm dự đoán + hành lang
 * an toàn) → control (trễ kích hoạt + thời gian đáp ứng actuator + tốc độ tăng lực phanh).</p>
 *
 * <p>Perception là mô hình tổng hợp trên ground truth. Nhiễu lấy từ {@link PyRandom} riêng của lần chạy nên cùng seed → cùng chuỗi nhiễu như bản Python
 * đã sinh các run đã lưu. Port 1:1 từ {@code worker/vehicsim_core/aeb_stack.py}: không đổi thứ tự phép tính hay thứ tự gọi bộ ngẫu nhiên.</p>
 */
public final class AebStack {

    public static final double DT = 0.05;
    public static final double SENSOR_RANGE_M = 80.0;
    public static final double PERCEPTION_LATENCY_S = 0.10;
    public static final double FCW_LEAD_S = 1.0;

    private static final Map<String, Double> WEATHER_CONFIDENCE = Map.of("CLEAR", 0.93, "CLOUDY", 0.91, "RAIN", 0.84, "HEAVY_RAIN", 0.74, "FOG", 0.70);
    private static final Map<String, Double> TIME_CONFIDENCE = Map.of("DAY", 0.0, "DUSK", -0.06, "NIGHT", -0.14);
    private static final Map<String, Double> WEATHER_POSITION_NOISE_M = Map.of("CLEAR", 0.05, "CLOUDY", 0.06, "RAIN", 0.10, "HEAVY_RAIN", 0.16, "FOG", 0.14);

    // Sáu tham số đã rút khỏi phạm vi chỉnh được (ADR-040, migration 007): hằng số cố định của lõi.
    public static final double DETECTION_CONFIDENCE_THRESHOLD = 0.70;
    public static final double RELATIVE_VELOCITY_THRESHOLD_MPS = 2.0;
    public static final double PREDICTION_HORIZON_S = 2.0;
    public static final double SAFETY_DISTANCE_MARGIN_M = 2.0;
    public static final double JERK_LIMIT_MPS3 = 20.0;
    public static final double ACTUATOR_RESPONSE_TIME_S = 0.10;

    private final AebParams params;
    private final PyRandom rng;
    private final double vehicleLengthM;
    private final double decelLimit;
    private final List<Map<String, Object>> events;
    private final double dt;
    private final double baseConfidence;
    private final double positionNoiseM;
    private final int lagFrames;
    private final int perceptionEvery;
    private int steps;
    private View tickView = new View(false, 0.0, null, null);

    private Double firstDetectionT;
    private Double fcwT;
    private Double decisionT;
    private Double brakeOnsetT;
    private double decelCmd;
    private final List<double[]> history = new ArrayList<>(); // (t, ped_y, ped_vy) cho độ trễ perception
    private double perceivedVyFiltered;

    private record View(boolean detected, double confidence, Double perceivedY, Double ttc) {
    }

    /**
     * @param decelLimit trần lực phanh phía xe: min(MAX_DECELERATION, khả năng phanh của xe). Ma sát mặt đường không nằm ở đây.
     * @param perceptionPeriodS chu kỳ cảm biến (s); {@code null} = mỗi bước (hành vi 20 Hz cũ).
     */
    public AebStack(AebParams params, long seed, String weather, String timeOfDay, double vehicleLengthM, double decelLimit,
                    List<Map<String, Object>> events, double dt, Double perceptionPeriodS) {
        this.params = params;
        this.rng = new PyRandom(seed);
        this.vehicleLengthM = vehicleLengthM;
        this.decelLimit = decelLimit;
        this.events = events;
        this.dt = dt;
        this.baseConfidence = WEATHER_CONFIDENCE.getOrDefault(weather, 0.85) + TIME_CONFIDENCE.getOrDefault(timeOfDay, 0.0);
        this.positionNoiseM = WEATHER_POSITION_NOISE_M.getOrDefault(weather, 0.08);
        this.lagFrames = (int) Py.round(PERCEPTION_LATENCY_S / dt);
        double period = perceptionPeriodS == null ? dt : perceptionPeriodS;
        this.perceptionEvery = (int) Math.max(1, Py.round(period / dt));
        if (Math.abs(perceptionEvery * dt - period) > 1e-9) {
            throw new IllegalArgumentException("perception_period_s=" + Py.repr(period) + " không phải bội số của dt=" + Py.repr(dt));
        }
    }

    /** Độ trễ perception tính theo khung (= PERCEPTION_LATENCY_S / dt). */
    int lagFrames() {
        return lagFrames;
    }

    /** Số bước giữa hai lần cảm biến (= perception_period_s / dt). */
    int perceptionEvery() {
        return perceptionEvery;
    }

    public Double firstDetectionT() {
        return firstDetectionT;
    }

    public Double fcwT() {
        return fcwT;
    }

    public Double decisionT() {
        return decisionT;
    }

    public Double brakeOnsetT() {
        return brakeOnsetT;
    }

    /** Gọi đúng một lần mỗi khung, theo thứ tự thời gian. */
    public AebTick step(double t, double gap, double pedY, double pedVy, double egoV) {
        history.add(new double[] {t, pedY, pedVy});
        if (steps % perceptionEvery == 0) {
            tickView = perceiveAndDecide(t, gap, egoV);
        }
        steps++;

        // ---- Control ---------------------------------------------------------------
        if (decisionT != null && t >= decisionT + params.brakeActivationDelay() + ACTUATOR_RESPONSE_TIME_S) {
            if (brakeOnsetT == null) {
                brakeOnsetT = t;
                Events.record(events, t, "brake_onset", "Brakes engage");
            }
            decelCmd = Math.min(decelLimit, decelCmd + params.decelRampRate() * dt);
        }
        return new AebTick(tickView.detected, tickView.confidence, tickView.perceivedY, tickView.ttc, decelCmd);
    }

    /** Một lần cảm biến: perception (dữ liệu trễ {@code PERCEPTION_LATENCY_S}) rồi quyết định FCW/AEB. */
    private View perceiveAndDecide(double t, double gap, double egoV) {
        AebParams p = params;

        // ---- Perception (dữ liệu trễ PERCEPTION_LATENCY_S) ---------------------------
        double[] seen = history.get(Math.max(0, history.size() - 1 - lagFrames));
        double seenY = seen[1];
        double seenVy = seen[2];
        double distance = Py.hypot(gap, seenY);
        double confidence = 0.0;
        boolean detected = false;
        Double perceivedY = null;
        if (distance <= SENSOR_RANGE_M && gap > -vehicleLengthM) {
            // Nhiễu rút từ rng của chính lần chạy -> tất định theo seed.
            confidence = baseConfidence - 0.004 * Math.max(0.0, distance - 15.0) + rng.gauss(0.0, 0.05);
            confidence = Math.max(0.0, Math.min(1.0, confidence));
            detected = confidence >= DETECTION_CONFIDENCE_THRESHOLD;
            if (detected) {
                perceivedY = seenY + rng.gauss(0.0, positionNoiseM);
                perceivedVyFiltered = 0.6 * perceivedVyFiltered + 0.4 * seenVy;
                if (firstDetectionT == null) {
                    firstDetectionT = t;
                    Events.record(events, t, "detection", "First detection · conf " + Py.fixed(confidence, 2),
                            "distance_m", Py.round(distance, 1), "confidence", Py.round(confidence, 2));
                }
            }
        }

        // ---- Decision ----------------------------------------------------------------
        Double ttcPerceived = null;
        if (detected && perceivedY != null && gap > 0 && egoV >= RELATIVE_VELOCITY_THRESHOLD_MPS) {
            ttcPerceived = gap / egoV;
            double lookahead = Math.min(ttcPerceived, PREDICTION_HORIZON_S);
            double predictedY = perceivedY + perceivedVyFiltered * lookahead;
            boolean inPredictedPath = Math.abs(predictedY) <= p.corridorHalfWidth() || Math.abs(perceivedY) <= p.corridorHalfWidth();
            if (inPredictedPath) {
                if (fcwT == null && ttcPerceived <= p.ttcThreshold() + FCW_LEAD_S) {
                    fcwT = t;
                    Events.record(events, t, "fcw", "FCW warning issued", "ttc_s", Py.round(ttcPerceived, 2));
                }
                if (decisionT == null && ttcPerceived <= p.ttcThreshold()) {
                    decisionT = t;
                    Events.record(events, t, "aeb_decision", "AEB brake command", "ttc_s", Py.round(ttcPerceived, 2));
                }
            }
        }
        return new View(detected, confidence, perceivedY, ttcPerceived);
    }

    /** Sự kiện của một lần chạy, cùng hình dạng với bản Python: {@code {"t", "kind", "label", **extra}}. */
    public static final class Events {

        private Events() {
        }

        public static void record(List<Map<String, Object>> events, double t, String kind, String label, Object... extra) {
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("t", Py.round(t, 3));
            event.put("kind", kind);
            event.put("label", label);
            for (int i = 0; i < extra.length; i += 2) {
                event.put((String) extra[i], extra[i + 1]);
            }
            events.add(event);
        }
    }
}
