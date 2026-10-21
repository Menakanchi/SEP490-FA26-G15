package com.vehicsim.core;

import java.util.LinkedHashMap;
import java.util.Map;

/** Một khung của lần chạy; giá trị đã làm tròn như khi lưu vào {@code result.json}. */
public record Frame(double t, double egoX, double egoV, double egoA, double pedX, double pedY, double pedVy, boolean detected, double confidence,
                    Double perceivedY, Double ttc, Double ttcGt, boolean fcw, boolean aeb) {

    public Map<String, Object> asDict() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("t", t);
        out.put("ego_x", egoX);
        out.put("ego_v", egoV);
        out.put("ego_a", egoA);
        out.put("ped_x", pedX);
        out.put("ped_y", pedY);
        out.put("ped_vy", pedVy);
        out.put("detected", detected);
        out.put("confidence", confidence);
        out.put("perceived_y", perceivedY);
        out.put("ttc", ttc);
        out.put("ttc_gt", ttcGt);
        out.put("fcw", fcw);
        out.put("aeb", aeb);
        return out;
    }

    public static Frame fromDict(Map<String, Object> d) {
        return new Frame(num(d, "t"), num(d, "ego_x"), num(d, "ego_v"), num(d, "ego_a"), num(d, "ped_x"), num(d, "ped_y"), num(d, "ped_vy"),
                Boolean.TRUE.equals(d.get("detected")), num(d, "confidence"), nullable(d, "perceived_y"), nullable(d, "ttc"), nullable(d, "ttc_gt"),
                Boolean.TRUE.equals(d.get("fcw")), Boolean.TRUE.equals(d.get("aeb")));
    }

    private static double num(Map<String, Object> d, String key) {
        return ((Number) d.get(key)).doubleValue();
    }

    private static Double nullable(Map<String, Object> d, String key) {
        return d.get(key) instanceof Number n ? n.doubleValue() : null;
    }
}
