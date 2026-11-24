package com.vsos.core.failureanalysis;

import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Resolves declared lineage, without claiming a source commit proves runtime binary equivalence. */
public final class MetricProvenanceResolver {
    public record Provenance(Map<String, Value> fields, List<Issue> issues) {
        public Provenance { fields = Collections.unmodifiableMap(new LinkedHashMap<>(fields)); issues = List.copyOf(issues); }
    }
    public Provenance resolve(Run r) {
        Map<String, Value> f = new LinkedHashMap<>();
        List<Issue> issues = new ArrayList<>();
        f.put("producer", r.read("result", "/engine", null, null));
        f.put("simulator_profile", r.read("result", "/simulator", null, null));
        f.put("signal", r.read("result", "/outcome/case/carla/jerk_filtered/signal", null, "core"));
        f.put("filter", r.read("result", "/outcome/case/carla/jerk_filtered/filter", null, null));
        f.put("window", r.read("result", "/outcome/case/carla/jerk_filtered/window", null, "core"));
        f.put("dt", r.read("result", "/outcome/case/carla/fixed_delta_seconds", "s", "core"));
        f.put("t_aeb", r.read("result", "/outcome/metrics/t_aeb_s", "s", "core"));
        f.put("command_onset", r.read("result", "/outcome/metrics/brake_onset_t", "s", "core"));
        f.put("source_revision", r.read("environment", "/git_commit", null, null));
        f.put("core_sha256", r.read("lifecycle", "/core/sha256", null, null));
        f.put("runtime_source_equivalence", unknown("RUNTIME_SOURCE_EQUIVALENCE_UNVERIFIED", null));
        f.put("calibration_scope", unknown("CALIBRATION_VALIDITY_DOMAIN_MISSING", null));
        f.put("calibration_name", r.read("result", "/outcome/case/carla/pedal_map", null, null));
        Object profile = f.get("simulator_profile").value();
        boolean currentCarla = profile instanceof String s && s.matches("carla-0\\.9\\.16-xosc(?:9|1[0-5])");
        f.put("impact_basis", currentCarla ? value("RELATIVE_SPEED_CORE_COLLISION_TICK", Status.CONDITIONAL, null, "core",
                List.of(r.ref("result", "/simulator")), "PROFILE_SOURCE_MAPPING_CONDITIONAL") : unknown("METRIC_PROFILE_UNKNOWN", null));
        f.put("stopping_basis", currentCarla ? value("CORE_PROJECTED_DISPLACEMENT_PLUS_MODEL_EXTRAPOLATION", Status.CONDITIONAL,
                null, "core", List.of(r.ref("result", "/simulator")), "PROFILE_SOURCE_MAPPING_CONDITIONAL") : unknown("METRIC_PROFILE_UNKNOWN", null));
        if (currentCarla) {
            expected(r, f, issues, "signal", "ego_a");
            expected(r, f, issues, "window", "T_AEB to end of run");
            Object filter = f.get("filter").value();
            if (filter != null && (!(filter instanceof Map<?, ?>) || !"butterworth".equals(at(filter, "/type"))
                    || !sameNumber(at(filter, "/order_per_pass"), 6) || !sameNumber(at(filter, "/cutoff_hz"), 10)
                    || !"forward + backward (zero phase)".equals(at(filter, "/passes"))))
                conflict(f, issues, "filter", "Declared filter differs from current producer profile");
        }
        for (String field : List.of("producer", "simulator_profile", "signal", "window", "source_revision", "core_sha256", "calibration_name")) {
            Value v = f.get(field);
            if (v.value() != null && !(v.value() instanceof String))
                f.put(field, value(null, Status.INVALID, v.unit(), v.clockId(), v.sourceRefs(), "METRIC_METADATA_TYPE_INVALID"));
        }
        Object jerkCopy = r.get("result", "/outcome/case/carla/jerk_filtered/rms_jerk_mps3");
        Object jerkMetadata = r.get("result", "/outcome/case/carla/jerk_filtered");
        if (jerkMetadata instanceof Map<?, ?> jm && jm.containsKey("rms_jerk_mps3") && !sameNumber(jerkCopy, r.get("result", "/outcome/metrics/rms_jerk_mps3")))
            issues.add(new Issue(Status.CONFLICTING, "METRIC_METADATA_CONFLICT", r.ref("result", "/outcome/case/carla/jerk_filtered/rms_jerk_mps3"), "Jerk metadata and canonical scalar differ"));
        if (jerkMetadata instanceof Map<?, ?> jm && jm.containsKey("t_aeb_s") && !sameNumber(jm.get("t_aeb_s"), r.get("result", "/outcome/metrics/t_aeb_s")))
            issues.add(new Issue(Status.CONFLICTING, "METRIC_METADATA_CONFLICT", r.ref("result", "/outcome/case/carla/jerk_filtered/t_aeb_s"), "T_AEB metadata and canonical anchor differ"));
        Object metadata = r.get("metadata", "");
        f.put("run_metadata_source_revision", unknown("RUN_METADATA_SOURCE_REVISION_MISSING", null));
        if (metadata instanceof List<?> lines) for (int i = 0; i < lines.size(); i++) {
            Object row = lines.get(i);
            if (r.runKey().equals(at(row, "/run_id")) && at(row, "/git_commit") instanceof String revision) {
                Value claim = value(revision, Status.OBSERVED, null, null, List.of(r.ref("metadata", "/" + i + "/git_commit")));
                f.put("run_metadata_source_revision", claim);
                if (f.get("source_revision").status() == Status.UNKNOWN) f.put("source_revision", claim);
                else if (!revision.equals(f.get("source_revision").value()))
                    conflict(f, issues, "source_revision", "Run manifest and environment source revisions differ");
            }
        }
        for (String numeric : List.of("dt", "t_aeb", "command_onset")) {
            Value v = f.get(numeric);
            if (v.value() != null && (!finiteNonnegative(v.value()) || numeric.equals("dt") && ((Number)v.value()).doubleValue() == 0))
                f.put(numeric, value(null, Status.INVALID, v.unit(), v.clockId(), v.sourceRefs(), "METRIC_METADATA_NUMBER_INVALID"));
        }
        return new Provenance(f, issues);
    }
    /** Objective-specific lineage: the jerk signal/window must never be copied onto impact or stopping. */
    public Map<String, Value> objectiveLineage(Provenance p, String key) {
        if (key.equals("rms_jerk_mps3")) {
            Value raw = p.fields().get("filter");
            Value description = raw.value() instanceof Map<?, ?> ? value(com.vsos.core.common.MiniJson.write(raw.value()), raw.status(), null, null,
                    raw.sourceRefs(), raw.reasonCodes().toArray(String[]::new)) : raw;
            return Map.of("signal", p.fields().get("signal"), "filter", description, "window", p.fields().get("window"));
        }
        Value basis = p.fields().get(key.equals("impact_speed_mps") ? "impact_basis" : "stopping_basis");
        Value signal = basis.value() == null ? unknown("METRIC_PROFILE_UNKNOWN", null) : value(
                key.equals("impact_speed_mps") ? "CORE_RELATIVE_VELOCITY" : "CORE_PROJECTED_EGO_X_AND_EXTRAPOLATION_MODEL", Status.CONDITIONAL,
                null, "core", basis.sourceRefs(), "PROFILE_SOURCE_MAPPING_CONDITIONAL");
        Value window = basis.value() == null ? unknown("METRIC_PROFILE_UNKNOWN", null) : value(
                key.equals("impact_speed_mps") ? "CORE_COLLISION_TICK" : "COMMAND_ONSET_TO_TRACE_END_PLUS_MODEL_TAIL", Status.CONDITIONAL,
                null, "core", basis.sourceRefs(), "PROFILE_SOURCE_MAPPING_CONDITIONAL");
        return Map.of("signal", signal, "window", window, "filter", value(null, Status.NOT_APPLICABLE, null, null, basis.sourceRefs(), "FILTER_NOT_APPLICABLE"));
    }
    private void expected(Run r, Map<String, Value> f, List<Issue> issues, String key, String expected) {
        if (f.get(key).value() != null && !expected.equals(f.get(key).value())) conflict(f, issues, key, "Declared " + key + " differs from simulator profile");
    }
    private void conflict(Map<String, Value> f, List<Issue> issues, String key, String detail) {
        Value v = f.get(key);
        f.put(key, value(v.value(), Status.CONFLICTING, v.unit(), v.clockId(), v.sourceRefs(), "METRIC_METADATA_CONFLICT"));
        issues.add(new Issue(Status.CONFLICTING, "METRIC_METADATA_CONFLICT", v.sourceRefs().getFirst(), detail));
    }
}
