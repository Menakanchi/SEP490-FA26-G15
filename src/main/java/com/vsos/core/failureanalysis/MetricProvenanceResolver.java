package com.vsos.core.failureanalysis;

import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Resolves declared lineage, without claiming a source commit proves runtime binary equivalence. */
public final class MetricProvenanceResolver {
    public record Provenance(Map<String, Value> fields, List<Issue> issues) {
        public Provenance { fields = Collections.unmodifiableMap(new LinkedHashMap<>(fields)); issues = List.copyOf(issues); }
    }
    /** Explicit source-supported branches, never a numeric version range extrapolation. */
    public record Descriptor(String family, boolean supported, String reason, Double dt) {
        public boolean carla(){return family.equals("CARLA");}
        public Map<String,Object> json(){return obj("family",family,"status",supported?"CONDITIONAL":"UNKNOWN","reason_codes",List.of(reason),
                "runtime_source_equivalence","UNVERIFIED",
                "sampling_interval_s",supported?dt:null,"sampling_interval_basis",supported?(carla()?"RECORDED_FIXED_DELTA_SECONDS":"SOURCE_DEFINED_CONDITIONAL"):"UNKNOWN",
                "jerk_signal",supported?"ego_a":null,"jerk_filter",supported?(carla()?"WHOLE_SERIES_BUTTERWORTH_6_PER_PASS_FORWARD_BACKWARD_10_HZ":"RAW_UNFILTERED"):null,
                "jerk_window",supported?(carla()?"T_AEB to end of run":"brake_onset_t to end of run"):null,
                "stopping_pose_convention",supported?(carla()?"COMMAND_SAMPLE_POSITION_NO_STEP_ROLLBACK":"AFTER_STEP_FIRST_SAMPLE_MINUS_EGO_V_DT"):null,
                "implementation_sources",supported?(carla()?List.of("CarlaSession.currentFormat/finish","DecelMeter.update","Filters.butterworthZeroPhase/tAebIndex/rmsJerk","Simulator.brakePhaseMetrics"):
                        List.of("Simulator.simulate/brakePhaseMetrics","AebStack.DT")):List.of());}
    }
    public static Descriptor descriptor(Run r){
        if(!"vsos-core-java/1".equals(r.get("result","/engine")))return new Descriptor("UNKNOWN",false,"METRIC_PRODUCER_UNSUPPORTED_OR_MISSING",null);
        Object simulator=r.get("result","/simulator");
        if("vehicsim-kinematic-1.4".equals(simulator)){
            if(r.get("result","/outcome/case/carla") instanceof Map<?,?> m&&!m.isEmpty())return new Descriptor("UNKNOWN",false,"METRIC_PROFILE_METADATA_CONFLICT",null);
            return new Descriptor("KINEMATIC",true,"PROFILE_SOURCE_MAPPING_CONDITIONAL",.05);
        }
        // These seven literals are selected by CarlaSession.currentFormat(). No older/future vintage is inferred.
        if(!Set.of("carla-0.9.16-xosc9","carla-0.9.16-xosc10","carla-0.9.16-xosc11","carla-0.9.16-xosc12",
                "carla-0.9.16-xosc13","carla-0.9.16-xosc14","carla-0.9.16-xosc15").contains(Objects.toString(simulator,"")))
            return new Descriptor("UNKNOWN",false,"METRIC_PROFILE_UNSUPPORTED_OR_MISSING",null);
        Object dt=r.get("result","/outcome/case/carla/fixed_delta_seconds");
        if(!finiteNonnegative(dt)||((Number)dt).doubleValue()<=0||((Number)dt).doubleValue()>=.05)
            return new Descriptor("CARLA",false,"METRIC_OFFICIAL_FILTER_STEP_UNSUPPORTED_OR_MISSING",null);
        Object signal=r.get("result","/outcome/case/carla/jerk_filtered/signal"),window=r.get("result","/outcome/case/carla/jerk_filtered/window"),filter=r.get("result","/outcome/case/carla/jerk_filtered/filter");
        if(signal==null||window==null||filter==null)return new Descriptor("CARLA",false,"METRIC_PROFILE_METADATA_MISSING",null);
        if(!"ego_a".equals(signal)||!"T_AEB to end of run".equals(window)||!"butterworth".equals(at(filter,"/type"))
                ||!sameNumber(at(filter,"/order_per_pass"),6)||!sameNumber(at(filter,"/cutoff_hz"),10)||!"forward + backward (zero phase)".equals(at(filter,"/passes")))
            return new Descriptor("CARLA",false,"METRIC_PROFILE_METADATA_CONFLICT",null);
        Object official=r.get("result","/outcome/case/carla/jerk_filtered/status");
        if(official!=null&&!"OFFICIAL".equals(official))return new Descriptor("CARLA",false,"METRIC_PROFILE_METADATA_CONFLICT",null);
        Object copy=r.get("result","/outcome/case/carla/jerk_filtered");
        for(String key:List.of("rms_jerk_mps3","t_aeb_s"))if(copy instanceof Map<?,?> m&&m.containsKey(key)&&!sameNumber(m.get(key),r.get("result","/outcome/metrics/"+key)))
            return new Descriptor("CARLA",false,"METRIC_PROFILE_METADATA_CONFLICT",null);
        return new Descriptor("CARLA",true,"PROFILE_SOURCE_MAPPING_CONDITIONAL",((Number)dt).doubleValue());
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
        if(JsonInputAdapter.supports(r)){
            f.put("source_revision",r.read("result","/dataset/provenance/git_commit",null,null));
            f.put("core_sha256",r.read("result","/dataset/provenance/core_jar_sha256",null,null));
            f.put("source_hash_verification",unknown("DECLARED_SOURCE_FILES_NOT_EXTERNALLY_VERIFIED",null));
        }
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
        Descriptor descriptor=descriptor(r);
        List<SourceRef> profileRefs=List.of(r.ref("result","/engine"),r.ref("result","/simulator"));
        f.put("metric_descriptor",descriptor.supported()?value(descriptor.json(),Status.CONDITIONAL,null,null,profileRefs,descriptor.reason()):unknown(descriptor.reason(),null));
        if(descriptor.supported()&&!descriptor.carla()){
            f.put("signal",value("ego_a",Status.CONDITIONAL,null,"core",profileRefs,descriptor.reason()));
            f.put("filter",value("RAW_UNFILTERED",Status.CONDITIONAL,null,null,profileRefs,descriptor.reason()));
            f.put("window",value("brake_onset_t to end of run",Status.CONDITIONAL,null,"core",profileRefs,descriptor.reason()));
            f.put("dt",value(descriptor.dt(),Status.CONDITIONAL,"s","core",profileRefs,descriptor.reason()));
            f.put("impact_basis",value("RELATIVE_SPEED_CORE_COLLISION_TICK",Status.CONDITIONAL,null,"core",profileRefs,descriptor.reason()));
            f.put("stopping_basis",value("CORE_PROJECTED_AFTER_STEP_DISPLACEMENT_PLUS_MODEL_EXTRAPOLATION",Status.CONDITIONAL,null,"core",profileRefs,descriptor.reason()));
        }else if(!descriptor.supported()){
            boolean independentBasis=currentCarla&&"vsos-core-java/1".equals(r.get("result","/engine"))
                    &&Set.of("METRIC_OFFICIAL_FILTER_STEP_UNSUPPORTED_OR_MISSING","METRIC_PROFILE_METADATA_MISSING").contains(descriptor.reason());
            for(String key:List.of("signal","filter","window","dt","impact_basis","stopping_basis")){
                if(independentBasis&&List.of("impact_basis","stopping_basis").contains(key))continue;
                // Preserve the declared conflicting claim as evidence, but never use it as accepted lineage.
                f.put("declared_"+key,f.get(key));
                if(f.get(key).status()!=Status.CONFLICTING)f.put(key,unknown(descriptor.reason(),key.equals("dt")?"s":null));
            }
        }
        return new Provenance(f, issues);
    }
    /** Objective-specific lineage: the jerk signal/window must never be copied onto impact or stopping. */
    public Map<String, Value> objectiveLineage(Provenance p, String key) {
        Value descriptor=p.fields().get("metric_descriptor");
        if(descriptor.value()==null&&(key.equals("rms_jerk_mps3")||p.fields().get(key.equals("impact_speed_mps")?"impact_basis":"stopping_basis").value()==null))return Map.of("signal",unknown(descriptor.reasonCodes().getFirst(),null),"filter",unknown(descriptor.reasonCodes().getFirst(),null),"window",unknown(descriptor.reasonCodes().getFirst(),null));
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
