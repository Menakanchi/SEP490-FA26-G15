package com.vsos.backend.common;

import com.vsos.backend.repository.common.Row;
import com.vsos.core.evaluation.AnalysisMetrics;

/** One quality contract for analysis, optimization and regression over stored run evidence. */
public final class RunEvidence {
    private RunEvidence() {}

    public static AnalysisMetrics.Sample sample(Row row) {
        var raw = row.json("telemetry_json");
        var metrics = Json.asMap(raw.get("metrics"));
        Object onset = row.asMap().containsKey("brake_onset") ? row.get("brake_onset")
                : metrics.get("brake_onset_t");
        boolean trace = row.asMap().containsKey("trace_frames")
                ? row.getInt("trace_frames") != null && row.getInt("trace_frames") > 0
                : !Json.asList(raw.get("frames")).isEmpty();
        // JSON null is recorded evidence; a missing key or absent trace is not.
        boolean onsetPresent = row.asMap().containsKey("brake_onset_type")
                ? row.get("brake_onset_type") != null : metrics.containsKey("brake_onset_t");
        Boolean braked = AnalysisMetrics.recordedBraking(onset, onsetPresent, row.dbl("rms_jerk_mps3"),
                row.dbl("stopping_distance_m"), row.boolOrNull("aeb_activated"), row.boolOrNull("collision_occurred"), trace);
        String status = "COMPLETED".equals(row.str("status")) && !trace ? "INCOMPLETE" : row.str("status");
        return new AnalysisMetrics.Sample(status,row.str("end_reason"),row.boolOrNull("collision_occurred"),
                row.boolOrNull("is_false_positive"),row.boolOrNull("is_false_negative"),row.str("verdict"),braked,
                row.dbl("rms_jerk_mps3"),row.dbl("impact_speed_mps"),row.dbl("stopping_distance_m"));
    }

    public static boolean completeAebOn(Row row) {
        return "ON".equals(row.str("aeb_mode")) && AnalysisMetrics.evidenceComplete(java.util.List.of(sample(row)));
    }
}
