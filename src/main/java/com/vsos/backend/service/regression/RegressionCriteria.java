package com.vsos.backend.service.regression;

import com.vsos.backend.common.Json;
import com.vsos.backend.exception.regression.RegressionExceptions.InvalidCriteriaException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class RegressionCriteria {

    /**
     * Ngưỡng duy nhất cho "tỉ lệ phanh oan tăng tối đa" (điểm %), dùng chung cho regression và ràng buộc tối ưu ({@code OptimizationService}); so theo
     * {@code tăng ≤ ngưỡng + 1e-9}. Chốt 5 điểm % ngày 13/11/2026 (ADR-044, TD-48). Mặc định của form tạo regression ở frontend phải bằng số này.
     */
    public static final double DEFAULT_FALSE_ACTIVATION_MAX_PTS = 5.0;
    public static final double DEFAULT_MEDIAN_TTC_CHANGE_MIN_S = -0.1;

    public static final String NO_NEW_COLLISION = "no_new_collision";
    public static final String COLLISION_RATE_NOT_INCREASE = "collision_rate_not_increase";
    public static final String FALSE_ACTIVATION_INCREASE_MAX_PTS = "false_activation_increase_max_pts";
    public static final String MEDIAN_MIN_TTC_CHANGE_MIN_S = "median_min_ttc_change_min_s";
    public static final String IDENTICAL_SEEDS = "identical_seeds";

    public static final Map<String, String> LABELS = new LinkedHashMap<>();

    static {
        LABELS.put(NO_NEW_COLLISION, "No previously safe scenario may collide");
        LABELS.put(COLLISION_RATE_NOT_INCREASE, "Collision rate must not increase");
        LABELS.put(FALSE_ACTIVATION_INCREASE_MAX_PTS, "False activation increase ≤");
        LABELS.put(MEDIAN_MIN_TTC_CHANGE_MIN_S, "Median min TTC change ≥");
        LABELS.put(IDENTICAL_SEEDS, "Use identical random seeds for both versions");
    }

    private static final List<String> REQUIRED = List.of(NO_NEW_COLLISION, IDENTICAL_SEEDS);

    private RegressionCriteria() {
    }

    public static Map<String, Map<String, Object>> merge(Map<String, Map<String, Object>> overrides) {
        Map<String, Map<String, Object>> merged = defaults();
        if (overrides != null) {
            for (Map.Entry<String, Map<String, Object>> e : overrides.entrySet()) {
                Map<String, Object> target = merged.get(e.getKey());
                if (target == null) {
                    throw new InvalidCriteriaException("tiêu chí không tồn tại: " + e.getKey());
                }
                if (e.getValue().containsKey("enabled")) {
                    target.put("enabled", Boolean.TRUE.equals(e.getValue().get("enabled")));
                }
                if (e.getValue().containsKey("value") && target.containsKey("value")) {
                    if (!(e.getValue().get("value") instanceof Number number)) {
                        throw new InvalidCriteriaException("tiêu chí " + e.getKey() + ": value phải là một số");
                    }
                    target.put("value", number.doubleValue());
                }
            }
        }
        for (String key : REQUIRED) {
            merged.get(key).put("enabled", true);
        }
        return merged;
    }

    public static double storedValue(Map<String, Object> storedCriteria, String key, double fallback) {
        Double value = Json.asDouble(Json.asMap(storedCriteria.get(key)).get("value"));
        return value == null ? fallback : value;
    }

    public static String confidence(boolean passed, int regressed, int scenarios) {
        if (passed && regressed == 0 && scenarios >= 20) {
            return "High";
        }
        return passed ? "Medium" : "Low";
    }

    private static Map<String, Map<String, Object>> defaults() {
        Map<String, Map<String, Object>> d = new LinkedHashMap<>();
        d.put(NO_NEW_COLLISION, Json.obj("enabled", true, "required", true));
        d.put(COLLISION_RATE_NOT_INCREASE, Json.obj("enabled", true, "required", false));
        d.put(FALSE_ACTIVATION_INCREASE_MAX_PTS, Json.obj("enabled", true, "required", false, "value", DEFAULT_FALSE_ACTIVATION_MAX_PTS));
        d.put(MEDIAN_MIN_TTC_CHANGE_MIN_S, Json.obj("enabled", true, "required", false, "value", DEFAULT_MEDIAN_TTC_CHANGE_MIN_S));
        d.put(IDENTICAL_SEEDS, Json.obj("enabled", true, "required", true));
        return d;
    }
}
