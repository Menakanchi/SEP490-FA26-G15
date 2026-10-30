package com.vsos.core.mobo;

import java.util.Map;

/** Một trial đã chạy: 4 tham số AEB và 3 mục tiêu (rms_jerk, impact_speed, stopping_distance), tất cả MINIMIZE (ADR-040). */
public record MoboTrial(int number, Map<String, Double> params, Double rmsJerk, Double impactSpeed, Double stoppingDistance,
                        boolean constraintViolated) {

    /** Hợp lệ để huấn luyện GP và tính Pareto: không vi phạm ràng buộc và đủ 3 mục tiêu. */
    public boolean valid() {
        return !constraintViolated && rmsJerk != null && impactSpeed != null && stoppingDistance != null;
    }

    double[] objectives() {
        return new double[] {rmsJerk, impactSpeed, stoppingDistance};
    }
}
