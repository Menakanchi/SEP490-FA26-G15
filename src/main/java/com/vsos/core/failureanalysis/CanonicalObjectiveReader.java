package com.vsos.core.failureanalysis;

import com.vsos.core.evaluation.AnalysisMetrics;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Reads stored producer numbers; does not invoke metric algorithms or aggregation. */
public final class CanonicalObjectiveReader {
    public static final List<String> KEYS = List.of("rms_jerk_mps3", "impact_speed_mps", "stopping_distance_m");
    public record Objective(Value canonicalValue, Value evaluationCopy, String applicability,
                            String copyAgreement, List<Issue> issues) {
        public Objective { issues = List.copyOf(issues); }
    }
    public Map<String, Objective> read(Run run) {
        Map<String, Objective> result = new LinkedHashMap<>();
        for (String key : KEYS) {
            String unit = key.equals(KEYS.get(0)) ? "m/s\u00b3" : key.equals(KEYS.get(1)) ? "m/s" : "m";
            String mp = "/outcome/metrics/" + key, ep = "/evaluation/aeb_result/" + key;
            String applicable = applicability(run, key);
            Value m = scalar(run, mp, unit, applicable), e = scalar(run, ep, unit, applicable);
            List<Issue> issues = new ArrayList<>();
            Object mm = run.get("result", "/outcome/metrics"), ee = run.get("result", "/evaluation/aeb_result");
            boolean present = mm instanceof Map<?, ?> map && map.containsKey(key);
            boolean copyPresent = ee instanceof Map<?, ?> map && map.containsKey(key);
            String agreement = "UNKNOWN";
            if (present && copyPresent) {
                boolean equal = sameNumber(at(mm, "/" + key), at(ee, "/" + key));
                agreement = equal && m.status() != Status.INVALID && e.status() != Status.INVALID ? "MATCH" : "DISAGREEMENT";
                if (!equal) {
                    issues.add(new Issue(Status.CONFLICTING, "CANONICAL_COPY_DISAGREEMENT", run.ref("result", ep), "Stored copies differ; producer view retained"));
                    if (m.value() != null) m = value(m.value(), Status.CONFLICTING, unit, "core", m.sourceRefs(), "CANONICAL_COPY_DISAGREEMENT");
                    else if (m.status() != Status.INVALID) m = value(null, Status.CONFLICTING, unit, "core", m.sourceRefs(), "CANONICAL_COPY_DISAGREEMENT");
                }
            } else issues.add(new Issue(Status.UNKNOWN, "CANONICAL_COPY_MISSING", run.ref("result", present ? ep : mp), "Cannot verify copy agreement"));
            if ("NOT_APPLICABLE".equals(applicable) && m.value() != null)
                issues.add(new Issue(Status.CONFLICTING, "CANONICAL_APPLICABILITY_CONFLICT", run.ref("result", mp), "Recorded value exists outside declared applicability; retained as recorded"));
            // The valid copy is still exposed in evaluationCopy when the producer field is absent/invalid.
            result.put(key, new Objective(m, e, applicable, agreement, issues));
        }
        return Collections.unmodifiableMap(result);
    }

    private Value scalar(Run run, String pointer, String unit, String applicable) {
        Value v = run.read("result", pointer, unit, "core");
        Object format = run.get("result", "/format");
        if (v.status() != Status.INVALID && !"vehicsim.result/v1".equals(format))
            return value(null, format == null ? Status.UNKNOWN : Status.INVALID, unit, "core", v.sourceRefs(),
                    format == null ? "RESULT_SCHEMA_UNKNOWN" : "RESULT_SCHEMA_UNSUPPORTED");
        if (v.value() != null && !finiteNonnegative(v.value()))
            return value(null, Status.INVALID, unit, "core", v.sourceRefs(), "CANONICAL_NUMBER_INVALID");
        if (v.value() != null) return v;
        if (v.status() == Status.INVALID) return v;
        Object parent = run.get("result", pointer.substring(0, pointer.lastIndexOf('/')));
        String key = pointer.substring(pointer.lastIndexOf('/') + 1);
        if (!(parent instanceof Map<?, ?> map) || !map.containsKey(key))
            return value(null, Status.UNKNOWN, unit, "core", v.sourceRefs(), "CANONICAL_FIELD_MISSING");
        if ("NOT_APPLICABLE".equals(applicable))
            return value(null, Status.NOT_APPLICABLE, unit, "core", v.sourceRefs(), "CANONICAL_NOT_APPLICABLE");
        return value(null, Status.UNKNOWN, unit, "core", v.sourceRefs(), "CANONICAL_VALUE_MISSING");
    }

    static String applicability(Run r, String key) {
        if (key.equals("impact_speed_mps")) {
            Object c = r.get("result", "/outcome/metrics/collision");
            return Boolean.TRUE.equals(c) ? "APPLICABLE" : Boolean.FALSE.equals(c) ? "NOT_APPLICABLE" : "UNKNOWN";
        }
        if ("OFF".equals(r.get("result", "/outcome/case/aeb_mode"))) return "NOT_APPLICABLE";
        Boolean braked = recordedBraking(r);
        return Boolean.TRUE.equals(braked) ? "APPLICABLE" : Boolean.FALSE.equals(braked) ? "NOT_APPLICABLE" : "UNKNOWN";
    }

    /** Uses only the producer's recorded command onset, not a physical-braking assertion. */
    public static Boolean recordedBraking(Run r) {
        Object rawMetrics = r.get("result", "/outcome/metrics");
        boolean onsetPresent = rawMetrics instanceof Map<?, ?> m && m.containsKey("brake_onset_t");
        Object rawFrames = r.get("result", "/outcome/frames");
        boolean trace = rawFrames instanceof List<?> frames && !frames.isEmpty();
        return AnalysisMetrics.recordedBraking(r.get("result", "/outcome/metrics/brake_onset_t"), onsetPresent,
                r.get("result", "/outcome/metrics/rms_jerk_mps3"), r.get("result", "/outcome/metrics/stopping_distance_m"),
                r.get("result", "/evaluation/aeb_result/aeb_triggered") instanceof Boolean a ? a : null,
                r.get("result", "/outcome/metrics/collision") instanceof Boolean c ? c : null, trace);
    }
}
