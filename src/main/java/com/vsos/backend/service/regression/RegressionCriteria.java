package com.vsos.backend.service.regression;

import com.vsos.backend.exception.regression.RegressionExceptions.InvalidCriteriaException;
import com.vsos.backend.common.Json;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Tiêu chí đạt của regression: giá trị mặc định, gộp với lựa chọn của người tạo test, đọc ngưỡng đã lưu và độ tin cậy của khuyến nghị.
 * Hàm thuần. Dạng Map giữ đúng cấu trúc {@code pass_criteria_json.criteria} đã lưu trong DB.
 */
public final class RegressionCriteria {

    private RegressionCriteria() {
    }

    /**
     * Phanh oan được tăng tối đa bao nhiêu điểm % so với baseline (ADR-044). Cùng một hằng với ràng buộc của phần tối ưu (ADR-040 §7);
     * test đã tạo giữ ngưỡng đã lưu trong {@code pass_criteria_json}.
     */
    public static final double DEFAULT_FALSE_ACTIVATION_MAX_PTS = 5.0;
    /** Trung vị TTC nhỏ nhất được giảm tối đa bao nhiêu giây. */
    public static final double DEFAULT_MEDIAN_TTC_CHANGE_MIN_S = -0.1;

    public static final String NO_NEW_COLLISION = "no_new_collision";
    public static final String COLLISION_RATE_NOT_INCREASE = "collision_rate_not_increase";
    public static final String FALSE_ACTIVATION_INCREASE_MAX_PTS = "false_activation_increase_max_pts";
    public static final String MEDIAN_MIN_TTC_CHANGE_MIN_S = "median_min_ttc_change_min_s";
    public static final String IDENTICAL_SEEDS = "identical_seeds";

    /** Nhãn tiếng Anh từng tiêu chí (frontend dịch qua vehicsimI18n), theo thứ tự hiển thị. */
    public static final Map<String, String> LABELS = new LinkedHashMap<>();

    static {
        LABELS.put(NO_NEW_COLLISION, "No previously safe scenario may collide");
        LABELS.put(COLLISION_RATE_NOT_INCREASE, "Collision rate must not increase");
        LABELS.put(FALSE_ACTIVATION_INCREASE_MAX_PTS, "False activation increase ≤");
        LABELS.put(MEDIAN_MIN_TTC_CHANGE_MIN_S, "Median min TTC change ≥");
        LABELS.put(IDENTICAL_SEEDS, "Use identical random seeds for both versions");
    }

    /** Tiêu chí bắt buộc: luôn bật, người tạo test không tắt được. */
    private static final List<String> REQUIRED = List.of(NO_NEW_COLLISION, IDENTICAL_SEEDS);

    private static Map<String, Map<String, Object>> defaults() {
        Map<String, Map<String, Object>> d = new LinkedHashMap<>();
        d.put(NO_NEW_COLLISION, Json.obj("enabled", true, "required", true));
        d.put(COLLISION_RATE_NOT_INCREASE, Json.obj("enabled", true, "required", false));
        d.put(FALSE_ACTIVATION_INCREASE_MAX_PTS, Json.obj("enabled", true, "required", false, "value", DEFAULT_FALSE_ACTIVATION_MAX_PTS));
        d.put(MEDIAN_MIN_TTC_CHANGE_MIN_S, Json.obj("enabled", true, "required", false, "value", DEFAULT_MEDIAN_TTC_CHANGE_MIN_S));
        d.put(IDENTICAL_SEEDS, Json.obj("enabled", true, "required", true));
        return d;
    }

    /**
     * Mặc định + lựa chọn của người tạo test ({@code enabled}, {@code value}); tiêu chí bắt buộc luôn bật. Tiêu chí lạ hoặc ngưỡng không
     * phải số -> {@link InvalidCriteriaException}. Kết quả lưu nguyên vào {@code pass_criteria_json.criteria}.
     */
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

    /** Ngưỡng của một tiêu chí trong tiêu chí đã lưu của test; thiếu thì dùng mặc định. */
    public static double storedValue(Map<String, Object> storedCriteria, String key, double fallback) {
        Double value = Json.asDouble(Json.asMap(storedCriteria.get(key)).get("value"));
        return value == null ? fallback : value;
    }

    /** High / Medium / Low: High cần PASSED, không ca nào xấu đi và đủ 20 kịch bản. */
    public static String confidence(boolean passed, int regressed, int scenarios) {
        if (passed && regressed == 0 && scenarios >= 20) {
            return "High";
        }
        return passed ? "Medium" : "Low";
    }
}
