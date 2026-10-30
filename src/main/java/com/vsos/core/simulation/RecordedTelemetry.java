package com.vsos.core.simulation;
import java.util.*;

/** Display projections from recorded frames. Derived signals are not optimization objectives. */
public final class RecordedTelemetry {
    private RecordedTelemetry() {}
    private static Double number(Object v) {
        return v instanceof Number n && Double.isFinite(n.doubleValue()) ? n.doubleValue() : null;
    }
    public static List<Map<String,Object>> project(List<Object> frames, Double crossingX) {
        List<Map<String,Object>> out = new ArrayList<>();
        Double lastT = null, lastA = null;
        for (Object value : frames) {
            if (!(value instanceof Map<?,?> f)) { lastA = null; lastT = null; continue; }
            Double t = number(f.get("t")), a = number(f.get("ego_a")), x = number(f.get("ego_x"));
            if (t == null) { lastA = null; lastT = null; continue; }
            Map<String,Object> point = new LinkedHashMap<>();
            point.put("t",t);
            String[] input = {"ego_x","ego_v","ego_a","ped_x","ped_y","ped_vy","perceived_y","ttc","ttc_gt"};
            String[] output = {"ego_x_m","ego_speed_mps","ego_accel_mps2","target_x_m","target_y_m","target_vy_mps","perceived_y_m","ttc_perceived_s","ttc_gt_s"};
            for (int i=0;i<input.length;i++) point.put(output[i],number(f.get(input[i])));
            point.put("jerk_mps3",lastT != null && t > lastT && a != null && lastA != null ? (a-lastA)/(t-lastT) : null);
            point.put("crossing_distance_m",crossingX != null && x != null ? Math.max(0,crossingX-x) : null);
            Double speed = number(f.get("ego_v"));
            point.put("motion_state",speed == null || a == null ? "UNKNOWN" : Math.abs(speed)<0.05 ? "STATIONARY"
                    : a>0.1 ? "ACCELERATING" : a< -0.1 ? "DECELERATING" : "STEADY");
            point.put("derived_source","RECORDED_GT_FINITE_DIFFERENCE");
            out.add(point); lastT=t;lastA=a;
        }
        return out;
    }
}
