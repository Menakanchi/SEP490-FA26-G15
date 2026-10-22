package com.vehicsim.core;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

/** Aggregation of recorded ADR-040 metrics only. Never re-scores or changes simulator output. */
public final class AnalysisMetrics {
    public static final String VERSION = "adr040-stored-aggregation/1";
    private AnalysisMetrics() {}
    public record Sample(String status, String endReason, Boolean collision, Boolean falsePositive,
                         Boolean falseNegative, String verdict, Boolean braked,
                         Double jerk, Double impact, Double stopping) {}
    public static boolean valid(Sample s) {
        return "COMPLETED".equals(s.status()) && s.endReason() != null
                && !List.of("TIMEOUT", "ERROR").contains(s.endReason())
                && s.collision() != null && s.falsePositive() != null && s.falseNegative() != null
                && List.of("PASS", "FAIL").contains(s.verdict() == null ? "" : s.verdict());
    }
    private static boolean finite(Double x) { return x != null && Double.isFinite(x) && x >= 0; }
    public record Objective(Double value, int samples, int missing, int notApplicable, String unit, String status) {}
    private static Objective objective(List<Sample> samples, int kind) {
        double sum = 0; int n = 0, missing = 0, na = 0;
        for (Sample s : samples) {
            if (!valid(s)) { missing++; continue; }
            Double x;
            if (kind == 1) x = Boolean.FALSE.equals(s.collision()) ? Double.valueOf(0.0) : s.impact();
            else {
                if (Boolean.FALSE.equals(s.braked())) { na++; continue; }
                if (s.braked() == null) { missing++; continue; }
                x = kind == 0 ? s.jerk() : s.stopping();
            }
            if (!finite(x)) missing++;
            else { sum += x; n++; }
        }
        return new Objective(missing > 0 || n == 0 ? null : sum / n, n, missing, na,
                kind == 0 ? "m/s³" : kind == 1 ? "m/s" : "m",
                missing > 0 ? "INCOMPLETE" : n == 0 ? "NOT_APPLICABLE" : "VALID");
    }
    public static Map<String, Object> aggregate(List<Sample> samples) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", VERSION);
        out.put("rms_jerk_mps3", objective(samples, 0));
        out.put("impact_speed_mps", objective(samples, 1));
        out.put("stopping_distance_m", objective(samples, 2));
        out.put("invalid_runs", samples.stream().filter(s -> !valid(s)).count());
        return out;
    }
    public static boolean evidenceComplete(List<Sample> samples) {
        return !samples.isEmpty() && java.util.stream.IntStream.range(0,3).allMatch(i -> objective(samples,i).missing()==0);
    }
    public static boolean objectivesAvailable(List<Sample> samples) {
        return !samples.isEmpty() && java.util.stream.IntStream.range(0, 3)
                .allMatch(i -> "VALID".equals(objective(samples, i).status()));
    }
}
