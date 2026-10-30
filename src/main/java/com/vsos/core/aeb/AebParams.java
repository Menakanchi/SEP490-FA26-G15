package com.vsos.core.aeb;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** 4 tham số AEB chỉnh được (ADR-040), mã giống {@code aeb_parameters}. Sáu tham số đã rút là hằng số của {@link AebStack}. */
public record AebParams(double ttcThreshold, double brakeActivationDelay, double maxDeceleration, double brakeBuildupRate) {

    public static final AebParams DEFAULT = new AebParams(1.5, 0.15, 8.0, 20.0);

    /** Mã của sáu tham số đã rút khỏi phạm vi chỉnh; bundle cũ mang chúng thì bị bỏ qua. */
    public static final Set<String> RETIRED_CODES = Set.of(
            "DETECTION_CONFIDENCE_THRESHOLD", "RELATIVE_VELOCITY_THRESHOLD", "PREDICTION_HORIZON", "SAFETY_DISTANCE_MARGIN", "JERK_LIMIT",
            "ACTUATOR_RESPONSE_TIME");

    public static final java.util.List<String> CODES = java.util.List.of("TTC_THRESHOLD", "BRAKE_ACTIVATION_DELAY", "MAX_DECELERATION", "BRAKE_BUILDUP_RATE");

    /** {@code {"TTC_THRESHOLD": 1.5, ...}} → tham số. Mã thiếu giữ mặc định; mã khác bị bỏ qua. */
    public static AebParams fromCodes(Map<String, Double> values) {
        return new AebParams(
                values.getOrDefault("TTC_THRESHOLD", DEFAULT.ttcThreshold),
                values.getOrDefault("BRAKE_ACTIVATION_DELAY", DEFAULT.brakeActivationDelay),
                values.getOrDefault("MAX_DECELERATION", DEFAULT.maxDeceleration),
                values.getOrDefault("BRAKE_BUILDUP_RATE", DEFAULT.brakeBuildupRate));
    }

    public Map<String, Double> asCodes() {
        Map<String, Double> out = new LinkedHashMap<>();
        out.put("TTC_THRESHOLD", ttcThreshold);
        out.put("BRAKE_ACTIVATION_DELAY", brakeActivationDelay);
        out.put("MAX_DECELERATION", maxDeceleration);
        out.put("BRAKE_BUILDUP_RATE", brakeBuildupRate);
        return out;
    }

    /** Như {@code dataclasses.asdict} của bản Python (khóa chữ thường), dùng trong {@code outcome.params}. */
    public Map<String, Object> asDict() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ttc_threshold", ttcThreshold);
        out.put("brake_activation_delay", brakeActivationDelay);
        out.put("max_deceleration", maxDeceleration);
        out.put("brake_buildup_rate", brakeBuildupRate);
        return out;
    }

    /** Nửa bề ngang hành lang AEB coi là "trong đường đi": nửa xe + ¼ khoảng đệm (¼ chứ không phải ½, xem bản Python). */
    public double corridorHalfWidth() {
        return 0.5 * 1.93 + 0.25 * AebStack.SAFETY_DISTANCE_MARGIN_M;
    }

    /** Tốc độ tăng giảm tốc thực tế: chậm hơn trong hai giới hạn build-up và jerk. */
    public double decelRampRate() {
        return Math.min(brakeBuildupRate, AebStack.JERK_LIMIT_MPS3);
    }
}
