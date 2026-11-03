package com.vsos.backend.service.scenario;

import com.vsos.backend.common.Vs.InvalidRequestException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Luật theo category cho một điểm tham số của kịch bản (7 nhóm Euro NCAP — {@code scenarios.category}).
 * <p>
 * DB chỉ chặn giá trị vô nghĩa ({@code ck_sv_ranges}, {@code ck_sv_decel}); nó không biết category nào cần cột nào vì
 * category nằm ở bảng {@code scenarios}, không nằm ở {@code scenario_versions}. Phần "category nào bắt buộc tham số nào"
 * kiểm ở đây, trước khi ghi một họ kịch bản. Nguồn các luật: tài liệu "Tham số kịch bản và Category" (15/10/2026) —
 * khoảng giá trị chuẩn của Euro NCAP KHÔNG ép ở đây (dữ liệu MVP có ego 70–80 km/h vượt khoảng 10–60 của nhóm băng qua đường).
 */
public final class ScenarioRules {

    public static final String CCRS = "CCRS";
    public static final String CCRM = "CCRM";
    public static final String CCRB = "CCRB";
    public static final String CP_CROSSING = "CP_CROSSING";
    public static final String CPLA = "CPLA";
    public static final String TURNING = "TURNING";
    public static final String CUT_IN = "CUT_IN";

    public static final String VEHICLE = "VEHICLE";
    public static final String PEDESTRIAN = "PEDESTRIAN";

    public static final List<String> CATEGORIES = List.of(CCRS, CCRM, CCRB, CP_CROSSING, CPLA, TURNING, CUT_IN);

    /** Loại đối tượng mục tiêu hợp lệ theo category; TURNING gồm cả xe (CCFtap) lẫn người đi bộ (CPTA). */
    private static final Map<String, Set<String>> TARGET_TYPES = Map.of(
            CCRS, Set.of(VEHICLE),
            CCRM, Set.of(VEHICLE),
            CCRB, Set.of(VEHICLE),
            CP_CROSSING, Set.of(PEDESTRIAN),
            CPLA, Set.of(PEDESTRIAN),
            TURNING, Set.of(VEHICLE, PEDESTRIAN),
            CUT_IN, Set.of(VEHICLE));

    private ScenarioRules() {
    }

    /** Một điểm của lưới tham số; {@code null} = không đặt. Tốc độ km/h, khoảng cách m, gia tốc m/s². */
    public record Point(Double egoSpeedKmh, Double targetSpeedKmh, Double initialDistanceM, Double lateralOverlapPct,
                        Double targetDecelMps2, Double triggerDistanceM) {
    }

    /** Danh sách lỗi (rỗng = hợp lệ). */
    public static List<String> problems(String category, String targetType, Point p) {
        List<String> out = new ArrayList<>();
        if (!CATEGORIES.contains(category)) {
            out.add("category phải thuộc " + CATEGORIES + ", nhận " + category);
            return out;
        }
        if (!TARGET_TYPES.get(category).contains(targetType)) {
            out.add(category + " chỉ nhận target_type " + TARGET_TYPES.get(category) + ", nhận " + targetType);
        }
        if (p.egoSpeedKmh() == null || p.egoSpeedKmh() <= 0) {
            out.add("ego_speed_kmh phải > 0");
        }
        if (p.lateralOverlapPct() != null && (p.lateralOverlapPct() < -100 || p.lateralOverlapPct() > 100)) {
            out.add("lateral_overlap_pct phải trong [-100, 100]");
        }
        if (p.targetDecelMps2() != null && !CCRB.equals(category)) {
            out.add("target_decel_mps2 chỉ dùng cho CCRB (xe phía trước phanh gấp)");
        }

        switch (category) {
            case CCRS -> {
                if (p.targetSpeedKmh() == null || p.targetSpeedKmh() != 0) {
                    out.add("CCRS: xe mục tiêu đứng yên, target_speed_kmh phải = 0");
                }
            }
            case CCRB -> {
                require(out, p.targetSpeedKmh() != null, "CCRB cần target_speed_kmh");
                require(out, p.initialDistanceM() != null && p.initialDistanceM() > 0, "CCRB cần initial_distance_m > 0");
                require(out, p.targetDecelMps2() != null && p.targetDecelMps2() < 0, "CCRB cần target_decel_mps2 < 0 (xe phía trước phanh)");
            }
            case CP_CROSSING -> {
                require(out, p.targetSpeedKmh() != null, "CP_CROSSING cần target_speed_kmh (tốc độ người đi bộ)");
                require(out, p.triggerDistanceM() != null && p.triggerDistanceM() > 0, "CP_CROSSING cần trigger_distance_m > 0");
            }
            case CCRM, CPLA, TURNING -> require(out, p.targetSpeedKmh() != null, category + " cần target_speed_kmh");
            default -> { // CUT_IN: Euro NCAP không có giá trị chuẩn, nhóm tự đặt — không bắt buộc cột nào
            }
        }
        if (p.targetSpeedKmh() != null && p.targetSpeedKmh() < 0) {
            out.add("target_speed_kmh không được âm");
        }
        return out;
    }

    public static void check(String category, String targetType, Point p) {
        List<String> problems = problems(category, targetType, p);
        if (!problems.isEmpty()) {
            throw new InvalidRequestException(String.join("; ", problems));
        }
    }

    private static void require(List<String> out, boolean ok, String message) {
        if (!ok) {
            out.add(message);
        }
    }
}
