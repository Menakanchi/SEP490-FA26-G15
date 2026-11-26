package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** M1B evidence serialization, separate from the immutable M1A contract reader. */
final class DiagnosticSupport {
    static final String SPEC = "fa-v3-formula-spec";
    static final String FRAME = "CORE_PROJECTED_FRONT_ANCHORED_PLANE";
    static final double PED_RADIUS = .3; // Inspected Simulator.PEDESTRIAN_RADIUS_M; not measured mesh.
    static final double COMMAND_DELAY = .10; // Inspected AebStack.ACTUATOR_RESPONSE_TIME_S; not physical lag.
    static final List<String> PROJECTION = List.of("Core front projection and fixed heading; not full world bbox pose",
            "Pedestrian disc radius 0.3 m is a producer model, not a measured mesh",
            "Piecewise-linear interpolation only within configured sample period; uncertainty bounds unknown");
    private DiagnosticSupport() {}
    static Double n(Object x) { return EvidenceValidator.number(x); }
    static Double num(Run r, String artifact, String pointer) { return n(r.get(artifact, pointer)); }
    static boolean positive(Double x) { return x != null && x > 0; }
    static boolean profile(Run r) {
        return List.of("carla-0.9.16-xosc15", "vehicsim-kinematic-1.4").contains(Objects.toString(r.get("result", "/simulator"), ""));
    }
    static boolean carla(Run r) { return "carla-0.9.16-xosc15".equals(r.get("result", "/simulator")); }
    @SuppressWarnings("unchecked") static List<Map<String,Object>> rows(Run r, String a, String p) {
        Object data = r.get(a, p);
        if (!(data instanceof List<?> list) || list.stream().anyMatch(x -> !(x instanceof Map<?,?>))) return List.of();
        return (List<Map<String,Object>>) data;
    }
    @SuppressWarnings("unchecked") static Map<String,Object> mutable(Object x) {
        return MiniJson.parseObject(MiniJson.write(x));
    }
    static Map<String,Object> missing(String code, String unit) { return Evidence.unknown(code, unit).json(); }
    static Map<String,Object> na(String code, String unit) {
        return value(null, Status.NOT_APPLICABLE, unit, null, List.of(), code).json();
    }
    static Map<String,Object> observed(Object x, String unit, String clock, SourceRef ref) {
        return x == null ? missing("FIELD_MISSING_OR_NULL", unit) : value(x, Status.OBSERVED, unit, clock, List.of(ref)).json();
    }
    static Map<String,Object> calculated(Object x, String formula, String unit, String clock, String frame,
                                         List<SourceRef> refs, List<String> assumptions, String... reasons) {
        if (x == null) return missing(reasons.length == 0 ? "INPUT_OR_MODEL_MISSING" : reasons[0], unit);
        if (x instanceof Number number && !Double.isFinite(number.doubleValue())) return missing("NONFINITE_MODEL_RESULT", unit);
        Map<String,Object> out = new LinkedHashMap<>(new Value(x, assumptions.isEmpty() ? Status.DERIVED : Status.CONDITIONAL,
                unit, clock, refs, reasons.length == 0 && !assumptions.isEmpty() ? List.of("MODEL_ASSUMPTIONS_REQUIRED") : List.of(reasons),
                "fa-formula/3.0.0:" + formula).json());
        out.put("frame_id", frame); out.put("assumptions", assumptions);
        List<Map<String,Object>> sources = new ArrayList<>(refs.stream().map(SourceRef::json).toList());
        sources.add(new SourceRef(SPEC, formula).json()); out.put("source_refs", sources);
        return out;
    }
    static List<SourceRef> refs(Run r, String... pointers) {
        return Arrays.stream(pointers).map(p -> r.ref("result", p)).toList();
    }
    static boolean blocked(Run r, List<Issue> issues, String artifact) {
        Artifact a = r.artifact(artifact);
        if (a == null || !a.usable()) return true;
        return issues.stream().anyMatch(i -> i.source().artifactId().equals(a.id())
                && (i.status() == Status.INVALID || i.status() == Status.CONFLICTING)
                && List.of("TIMESTAMP_INVALID","TIMESTAMP_NON_MONOTONIC","FRAME_ID_INVALID","ACTOR_ID_INVALID","DUPLICATE_FRAME_DISAGREEMENT",
                    "CLOCK_MISMATCH","INCONSISTENT_IDENTITY","RESULT_SCHEMA_UNSUPPORTED","HASH_MISMATCH","SIZE_MISMATCH","SCHEMA_PARSE_ERROR").contains(i.code()));
    }
    static Map<String,Object> interval(GeometryEngine.Interval i, String clock, List<SourceRef> refs, List<String> assumptions) {
        return obj("enter", calculated(i.start(), "G04", "s", clock, FRAME, refs, assumptions),
                "exit", calculated(i.end(), "G04", "s", clock, FRAME, refs, assumptions),
                "left_censored", i.leftCensored(), "right_censored", i.rightCensored());
    }
    static Map<String,Object> specArtifact() {
        return obj("id", SPEC, "uri", "docs/failure-analysis-v3/FORMULA_SPEC_V3.md",
                "sha256", "dde2f15a856ed0830c3193c6bfae6119a0fed114211512d6479b30f1da74e2b5",
                "media_type", "text/markdown", "integrity", "UNVERIFIED",
                "note", "Pinned inspected design bytes, not runtime source/binary equivalence or a calibration certificate");
    }
}
