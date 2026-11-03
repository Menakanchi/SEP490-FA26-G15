package com.vsos.core.mobo;

import com.vsos.core.common.Py;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Cận của 4 tham số AEB được chỉnh (ADR-040) và phép chuẩn hoá về [0, 1]^4. */
public final class ParameterBounds {

    public static final List<String> PARAM_KEYS = List.of("TTC_THRESHOLD", "BRAKE_ACTIVATION_DELAY", "BRAKE_BUILDUP_RATE", "MAX_DECELERATION");

    /** Giới hạn tìm kiếm mặc định, khớp {@code aeb_parameters} trong database. */
    public static final Map<String, double[]> DEFAULT = Map.of(
            "TTC_THRESHOLD", new double[] {0.5, 3.5},
            "BRAKE_ACTIVATION_DELAY", new double[] {0.05, 0.45},
            "BRAKE_BUILDUP_RATE", new double[] {5.0, 20.0},
            "MAX_DECELERATION", new double[] {5.0, 10.0});

    private final Map<String, double[]> bounds;

    public ParameterBounds(Map<String, double[]> bounds) {
        this.bounds = bounds;
    }

    public static ParameterBounds defaults() {
        return new ParameterBounds(DEFAULT);
    }

    public double lower(String key) {
        return bounds.get(key)[0];
    }

    public double upper(String key) {
        return bounds.get(key)[1];
    }

    public boolean isValid(Map<String, Double> params) {
        for (String k : PARAM_KEYS) {
            Double v = params.get(k);
            if (v == null || v < lower(k) - 1e-6 || v > upper(k) + 1e-6) {
                return false;
            }
        }
        return true;
    }

    public double[] normalize(Map<String, Double> params) {
        double[] unit = new double[PARAM_KEYS.size()];
        for (int i = 0; i < unit.length; i++) {
            String k = PARAM_KEYS.get(i);
            double lo = lower(k);
            double hi = upper(k);
            unit[i] = hi <= lo ? 0.5 : (params.get(k) - lo) / (hi - lo);
        }
        return unit;
    }

    public Map<String, Double> denormalize(double[] unit) {
        Map<String, Double> params = new LinkedHashMap<>();
        for (int i = 0; i < PARAM_KEYS.size(); i++) {
            String k = PARAM_KEYS.get(i);
            params.put(k, Py.round(lower(k) + unit[i] * (upper(k) - lower(k)), 3));
        }
        return params;
    }
}
