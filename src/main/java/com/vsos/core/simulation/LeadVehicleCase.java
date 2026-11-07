package com.vsos.core.simulation;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Một biến thể của nhóm "xe phía trước cùng làn" — Euro NCAP CCRs (đứng yên), CCRm (chạy chậm hơn), CCRb (phanh gấp) (ADR-050).
 *
 * <p>Hệ tọa độ như bộ người đi bộ: ego chạy theo +x, tim làn ego ở y = 0, trái dương. Lúc t = 0 mũi xe ego ở x = 0, đuôi xe mục tiêu ở
 * x = {@code initialDistanceM}. Xe mục tiêu lệch ngang theo {@code lateralOverlapPct} (định nghĩa ở {@link #lateralOffsetM}).</p>
 *
 * @param targetDecelMps2  gia tốc phanh của xe mục tiêu (m/s², âm) — chỉ CCRb; {@code null} với CCRs/CCRm
 * @param lateralOverlapPct độ chồng lấn theo bề ngang xe ego, [-100, 100]; {@code null} = 100 (chồng hết)
 */
public record LeadVehicleCase(String category, double egoSpeedKmh, double targetSpeedKmh, double initialDistanceM, Double targetDecelMps2,
                              Double lateralOverlapPct, String weather, String timeOfDay, Double friction) {

    public static final String CCRS = "CCRS";
    public static final String CCRM = "CCRM";
    public static final String CCRB = "CCRB";
    public static final List<String> CATEGORIES = List.of(CCRS, CCRM, CCRB);

    /** Kích thước xe mục tiêu cố định (cỡ mục tiêu mềm GVT của Euro NCAP, làm tròn); không lấy từ danh mục xe. */
    public static final double TARGET_LENGTH_M = 4.5;
    public static final double TARGET_WIDTH_M = 1.8;
    /** CCRb: xe mục tiêu bắt đầu phanh sau ngần này giây chạy đều cùng ego. */
    public static final double TARGET_BRAKE_START_S = 1.0;

    public double roadFriction() {
        return friction != null ? friction : CrossingCase.WEATHER_FRICTION.getOrDefault(weather, 1.0);
    }

    public double overlapPct() {
        return lateralOverlapPct == null ? 100.0 : lateralOverlapPct;
    }

    /**
     * Tim xe mục tiêu lệch khỏi tim làn ego: {@code (100 − overlap)/100 × bề ngang ego}, dấu của overlap âm hay dương đều lệch sang TRÁI.
     * 100 → trùng tim; 50 → chồng nửa xe; 0 → hai mép vừa chạm; −100 → lệch hẳn một bề ngang xe (làn bên cạnh, ca đo phanh oan).
     * Đây là định nghĩa của VehicSim cho khoảng [-100, 100] của cột {@code lateral_overlap_pct} (TD-41), không phải văn bản Euro NCAP.
     */
    public double lateralOffsetM(double egoWidthM) {
        return (100.0 - overlapPct()) / 100.0 * egoWidthM;
    }

    /** Xe mục tiêu có nằm trên đường đi của ego không (hai hình hộp chồng nhau theo bề ngang). */
    public boolean targetInPath(double egoWidthM) {
        return Math.abs(lateralOffsetM(egoWidthM)) < egoWidthM / 2 + TARGET_WIDTH_M / 2;
    }

    public Map<String, Object> asDict() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("category", category);
        out.put("ego_speed_kmh", egoSpeedKmh);
        out.put("target_speed_kmh", targetSpeedKmh);
        out.put("initial_distance_m", initialDistanceM);
        out.put("target_decel_mps2", targetDecelMps2);
        out.put("lateral_overlap_pct", lateralOverlapPct);
        out.put("weather", weather);
        out.put("time_of_day", timeOfDay);
        out.put("friction", friction);
        out.put("road_friction", roadFriction());
        return out;
    }
}
