package com.vsos.core.simulation;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Kết quả một lần chạy: khung hình, sự kiện, số đo. {@code endReason} ∈ COLLISION | EGO_STOPPED | TARGET_CLEARED | TIMEOUT.
 * {@code metrics} giữ dạng map (khóa như bản Python) vì luật chấm và cột {@code simulation_runs} đọc theo tên khóa.
 */
public record SimulationOutcome(String endReason, double durationS, List<Frame> frames, List<Map<String, Object>> events, Map<String, Object> metrics,
                                double crossingX, Map<String, Object> params, Map<String, Object> caseDoc) {

    /** {@code dataclasses.asdict} của bản Python: thứ tự khóa giữ nguyên. */
    public Map<String, Object> asDict() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("end_reason", endReason);
        out.put("duration_s", durationS);
        List<Object> frameDocs = new ArrayList<>(frames.size());
        for (Frame f : frames) {
            frameDocs.add(f.asDict());
        }
        out.put("frames", frameDocs);
        out.put("events", events);
        out.put("metrics", metrics);
        out.put("crossing_x", crossingX);
        out.put("params", params);
        out.put("case", caseDoc);
        return out;
    }

    @SuppressWarnings("unchecked")
    public static SimulationOutcome fromDict(Map<String, Object> d) {
        List<Frame> frames = new ArrayList<>();
        for (Object f : (List<Object>) d.get("frames")) {
            frames.add(Frame.fromDict((Map<String, Object>) f));
        }
        return new SimulationOutcome((String) d.get("end_reason"), ((Number) d.getOrDefault("duration_s", 0.0)).doubleValue(), frames,
                (List<Map<String, Object>>) d.get("events"), (Map<String, Object>) d.get("metrics"),
                ((Number) d.getOrDefault("crossing_x", 0.0)).doubleValue(),
                (Map<String, Object>) d.getOrDefault("params", Map.of()), (Map<String, Object>) d.getOrDefault("case", Map.of()));
    }
}
