package com.vsos.core.failureanalysis;

import java.time.Instant;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;
import static com.vsos.core.failureanalysis.DiagnosticSupport.*;

/** Claim-local validation of explicitly reviewed offline attestations. No DB, authority
 * discovery, causal adjudication, or numerical avoidability certification. */
public final class AnalysisContextValidator {
    public record Result(Map<String,DiagnosisPolicy.FunctionalEvidence> requirements,List<Map<String,Object>> calibrations,
                         boolean verifiedNoContact,Double clearanceLow,Double clearanceHigh,Double nearThreshold,
                         List<SourceRef> absenceRefs,List<Artifact> artifacts,List<Map<String,Object>> packages,List<String> reasons) {
        public Result { requirements=Map.copyOf(requirements);calibrations=List.copyOf(calibrations);absenceRefs=List.copyOf(absenceRefs);
            artifacts=List.copyOf(artifacts);packages=List.copyOf(packages);reasons=List.copyOf(reasons); }
        public String calibration(String field){return calibrations.stream().filter(c->field.equals(c.get("field"))).map(c->c.get("status").toString()).findFirst().orElse("UNKNOWN");}
        public Map<String,Object> json(){return obj("schema_version",AnalysisContext.VERSION,"packages",packages,"reason_codes",reasons,
                "authority_boundary","CALLER_PINNED_OFFLINE_REVIEW; NOT_RUNTIME_AUTHENTICATION",
                "verified_no_contact",verifiedNoContact,"absence_source_refs",absenceRefs.stream().map(SourceRef::json).toList(),
                "reviewed_clearance_interval",clearanceLow==null?missing("APPROVED_FULL_BODY_CLEARANCE_BOUNDS_MISSING","m"):
                        value(obj("min",clearanceLow,"max",clearanceHigh),Status.OBSERVED,"m","recorder",absenceRefs).json(),
                "approved_near_miss_threshold",nearThreshold==null?missing("APPROVED_NEAR_MISS_POLICY_MISSING","m"):
                        value(nearThreshold,Status.OBSERVED,"m",null,absenceRefs).json(),
                "physical_avoidability_certificate",missing("P05_CERTIFICATE_CHECKER_NOT_IMPLEMENTED",null));}
    }
    private record Accepted(Artifact pkg,Artifact review) {}
    public Result validate(Run run,AnalysisContext context,List<Issue> issues,ImpactAnalyzer.Contact contact) {
        AnalysisContext c=context==null?AnalysisContext.empty():context;
        List<String> reasons=new ArrayList<>();List<Map<String,Object>> states=new ArrayList<>(),calibrations=new ArrayList<>();
        Map<String,Artifact> registry=new LinkedHashMap<>();run.artifacts().values().forEach(a->registry.put(a.id(),a));
        Artifact baseline=verifiedBaseline(run,c);
        if(c.baselineBinding()!=null&&baseline==null)reasons.add("OPTIONAL_BASELINE_BINDING_UNVERIFIED_OR_CONFLICTING");
        List<Artifact> additions=new ArrayList<>();boolean registryValid=true;
        for(Artifact a:concat(c.packages(),c.sources())) {
            Artifact prior=registry.putIfAbsent(a.id(),a);
            if(prior!=null||a.id()==null||a.id().startsWith("fa-mechanism:")||SPEC.equals(a.id()))registryValid=false;else additions.add(a);
        }
        Map<String,List<Accepted>> accepted=new LinkedHashMap<>();
        for(Artifact p:c.packages()) {
            List<String> errors=new ArrayList<>();
            if(!AnalysisContext.VERSION.equals(c.schemaVersion()))errors.add("CONTEXT_SCHEMA_UNSUPPORTED");
            if(!registryValid)errors.add("CONTEXT_ARTIFACT_ID_CONFLICT");
            if(!verified(p,AnalysisContext.PACKAGE))errors.add("CONTEXT_PACKAGE_SCHEMA_OR_HASH_INVALID");
            if(!text(at(p.data(),"/id"))||!text(at(p.data(),"/version")))errors.add("CONTEXT_PACKAGE_ID_VERSION_MISSING");
            scope(run,map(at(p.data(),"/scope")),baseline,errors);
            Artifact review=registry.get(str(at(p.data(),"/review_artifact_id")));
            if(!review(c,p,review,registry))errors.add("CONTEXT_REVIEW_AUTHORITY_PROVENANCE_OR_FRESHNESS_INVALID");
            String kind=str(at(p.data(),"/kind"));String key=kind;
            if("REQUIREMENT".equals(kind))key+="/"+str(at(p.data(),"/payload/candidate_type"));
            if("CALIBRATION".equals(kind))key+="/"+str(at(p.data(),"/payload/field"));
            if(!List.of("REQUIREMENT","CALIBRATION","COLLISION_COVERAGE").contains(kind==null?"":kind))errors.add("CONTEXT_KIND_UNSUPPORTED");
            if("REQUIREMENT".equals(kind))episode(run,p,"core",errors);
            if("COLLISION_COVERAGE".equals(kind))episode(run,p,"recorder",errors);
            states.add(obj("id",p.id(),"kind",kind,"status",errors.isEmpty()?"ACCEPTED_REVIEW":"UNKNOWN","reason_codes",List.copyOf(errors),
                    "scope",at(p.data(),"/scope"),"version",at(p.data(),"/version"),"claim_key",key,
                    "source_refs",additions.contains(p)?List.of(new SourceRef(p.id(),"").json()):List.of()));
            if(errors.isEmpty())accepted.computeIfAbsent(key,k->new ArrayList<>()).add(new Accepted(p,review));else reasons.addAll(errors);
        }
        accepted.entrySet().removeIf(e->{if(e.getValue().size()==1)return false;
            reasons.add("CONTEXT_CONFLICTING_PACKAGES:"+e.getKey());for(var a:e.getValue())for(var state:states)if(a.pkg.id().equals(state.get("id"))) {
                state.put("status","CONFLICTING");state.put("reason_codes",List.of("CONTEXT_CONFLICTING_PACKAGES"));}return true;});
        // Field applicability is resolved first; requirements can depend on a particular field.
        for(var e:accepted.entrySet())if(e.getKey().startsWith("CALIBRATION/")) {
            var a=e.getValue().getFirst();var result=calibration(run,a,registry);
            if(List.of("pedal_to_deceleration","conditional_braking_model","stopping_extrapolation").contains(Objects.toString(result.get("field"),"")))calibrations.add(result);
            for(var state:states)if(a.pkg.id().equals(state.get("id"))){state.put("claim_status",result.get("status"));state.put("claim_reason_codes",result.get("reason_codes"));}
        }
        Accepted coverage=first(accepted,"COLLISION_COVERAGE");
        List<SourceRef> absenceRefs=new ArrayList<>();boolean absence=coverage!=null&&coverage(run,coverage,registry,issues,contact,reasons,absenceRefs);
        if(coverage!=null)for(var state:states)if(coverage.pkg.id().equals(state.get("id")))state.put("claim_status",absence?"VERIFIED_NO_CONTACT":"UNKNOWN");
        Double low=null,high=null,threshold=null;
        if(absence) {
            // Clearance bounds and caution threshold are separately reviewed predicates.
            var clearance=predicate(coverage,"clearance_interval",registry,"m","recorder");
            var policy=predicate(coverage,"near_miss_threshold",registry,"m",null);
            var basis=predicate(coverage,"clearance_basis",registry,null,"recorder");
            boolean geometry=basis!=null&&"CARLA_WORLD".equals(at(basis.value(),"/frame_id"))&&"FULL_BODY".equals(at(basis.value(),"/geometry_scope"))
                    &&"VALIDATED_ENCOUNTER_BOUNDS".equals(at(basis.value(),"/uncertainty_scope"));
            if(clearance!=null&&clearance.value() instanceof Map<?,?> b){low=number(b.get("min"));high=number(b.get("max"));}
            if(policy!=null)threshold=number(policy.value());
            if(!geometry||low==null||high==null||low<0||high<low||threshold==null||threshold<0) {
                low=null;high=null;threshold=null;reasons.add("APPROVED_CLEARANCE_OR_NEAR_MISS_POLICY_MISSING_OR_INVALID");
            } else {absenceRefs.addAll(clearance.sourceRefs());absenceRefs.addAll(policy.sourceRefs());absenceRefs.addAll(basis.sourceRefs());}
        }
        Map<String,DiagnosisPolicy.FunctionalEvidence> requirements=new LinkedHashMap<>();
        for(var e:accepted.entrySet())if(e.getKey().startsWith("REQUIREMENT/")) {
            Accepted a=e.getValue().getFirst();String type=Objects.toString(at(a.pkg.data(),"/payload/candidate_type"),"");
            List<String> missing=new ArrayList<>();Map<String,Value> gates=new LinkedHashMap<>();
            for(String key:DiagnosisPolicy.requiredGates(type)) {
                Value v=predicate(a,key,registry,null,"core");
                if(v==null||!Boolean.TRUE.equals(v.value()))missing.add("REQUIREMENT_GATE_MISSING_OR_INVALID:"+key);else gates.put(key,v);
            }
            if(DiagnosisPolicy.requiredGates(type).isEmpty())missing.add("REQUIREMENT_TYPE_UNSUPPORTED");
            if(!modeIs(run,"ON")||blocked(run,issues,"result")||issues.stream().anyMatch(i->i.code().startsWith("AEB_EVENT_")
                    ||i.code().equals("INCONSISTENT_IDENTITY")||i.code().equals("AEB_MODE_DISAGREEMENT")
                    ||List.of("CLOCK_MISMATCH","RUN_METADATA_BINDING_UNRESOLVED","CORE_HASH_DISAGREEMENT").contains(i.code())
                        &&List.of(Status.INVALID,Status.CONFLICTING).contains(i.status())))missing.add("REQUIREMENT_RAW_MODE_CLOCK_IDENTITY_INVALID");
            Object dependencies=at(a.pkg.data(),"/payload/dependencies");
            if(!(dependencies instanceof List<?>))missing.add("REQUIREMENT_DEPENDENCIES_UNDECLARED");
            for(Object dependency:list(dependencies)) {
                String d=str(dependency);
                if("VERIFIED_NO_CONTACT".equals(d)&&!absence)missing.add("REQUIREMENT_ABSENCE_DEPENDENCY_UNKNOWN");
                else if(d!=null&&d.startsWith("CALIBRATION:")) {
                    String field=d.substring("CALIBRATION:".length());
                    if(calibrations.stream().noneMatch(x->field.equals(x.get("field"))&&"IN_DOMAIN".equals(x.get("status"))))missing.add("REQUIREMENT_CALIBRATION_DEPENDENCY_UNSATISFIED:"+field);
                } else if(!"VERIFIED_NO_CONTACT".equals(d))missing.add("REQUIREMENT_DEPENDENCY_UNPROVEN:"+d); // P05 cannot be granted by a boolean.
            }
            if(missing.isEmpty())requirements.put(type,new DiagnosisPolicy.FunctionalEvidence(new DiagnosisPolicy.Requirement(
                    str(at(a.pkg.data(),"/id")),str(at(a.pkg.data(),"/version")),"APPROVED",type,
                    List.of(new SourceRef(a.pkg.id(),"/payload"),new SourceRef(a.review.id(),""))),gates));
            else reasons.addAll(missing);
            for(var state:states)if(a.pkg.id().equals(state.get("id"))){state.put("claim_status",missing.isEmpty()?"ALL_REQUIRED_PREDICATES_REVIEWED":"UNKNOWN");state.put("claim_reason_codes",List.copyOf(missing));}
        }
        for(var state:states)if("ACCEPTED_REVIEW".equals(state.get("status")))state.put("status","REVIEW_VALID_CLAIMS_CHECKED_SEPARATELY");
        return new Result(requirements,calibrations,absence,low,high,threshold,absenceRefs,additions,states,
                reasons.stream().distinct().toList());
    }
    private static List<Artifact> concat(List<Artifact> a,List<Artifact> b){List<Artifact> out=new ArrayList<>(a);out.addAll(b);return out;}
    static Artifact verifiedBaseline(Run run,AnalysisContext context) {
        if(!AnalysisContext.VERSION.equals(context.schemaVersion()))return null;
        Artifact a=context.baselineBinding();if(a==null)return null;
        var binding=new BaselineBindingResolver().verify(run,a);
        if(!List.of("PROJECT_BASELINE_CONFIRMED","RUN_VERSION_BOUND").contains(binding.identityStatus()))return null;
        Object project=run.get("result","/source/project_id");
        return project==null||Objects.equals(project.toString(),Objects.toString(binding.fields().get("project_id").value(),null))?a:null;
    }
    private static Accepted first(Map<String,List<Accepted>> accepted,String key){return accepted.containsKey(key)?accepted.get(key).getFirst():null;}
    private static void episode(Run r,Artifact p,String clock,List<String> errors) {
        Object declared=at(p.data(),"/scope/interval");Double from=number(at(declared,"/start_s")),to=number(at(declared,"/end_s"));
        var frames=rows(r,clock.equals("core")?"result":"frames",clock.equals("core")?"/outcome/frames":"");String time=clock.equals("core")?"t":"sim_time_s";
        Double first=frames.isEmpty()?null:n(frames.getFirst().get(time)),last=frames.isEmpty()?null:n(frames.getLast().get(time));
        if(!clock.equals(at(declared,"/clock_id"))||!"s".equals(at(declared,"/unit"))||from==null||to==null||first==null||last==null
                ||from<first||to>last||to<from)errors.add("CONTEXT_INTERVAL_OR_CLOCK_OUTSIDE_RECORDED_EPISODE");
        if(clock.equals("recorder")&&(from==null||to==null||!Objects.equals(from,first)||!Objects.equals(to,last)))errors.add("ABSENCE_PARTIAL_RECORDER_ENCOUNTER_SCOPE");
    }
    private static void scope(Run r,Map<String,Object> scope,Artifact baseline,List<String> errors) {
        if(!r.runKey().equals(scope.get("run_key"))||!Objects.equals(r.artifact("result").sha256(),scope.get("result_sha256")))errors.add("CONTEXT_RUN_OR_RESULT_SCOPE_MISMATCH");
        Map<String,Object> hashes=map(scope.get("artifact_hashes"));
        if(hashes.isEmpty())errors.add("CONTEXT_INPUT_HASH_BINDING_MISSING");
        for(var e:hashes.entrySet()){Artifact a=r.artifact(e.getKey());if(a==null||!a.usable()||!hash(e.getValue())||!Objects.equals(a.sha256(),e.getValue()))errors.add("CONTEXT_INPUT_HASH_MISMATCH:"+e.getKey());}
        if(!Objects.equals(hashes.get("result"),r.artifact("result").sha256()))errors.add("CONTEXT_RESULT_HASH_BINDING_MISSING");
        for(String field:List.of("project_id","scenario_id","scenario_version_id","aeb_version_id"))if(scope.containsKey(field)) {
            Object actual=r.get("result","/source/"+field);
            if(actual==null&&field.equals("project_id")&&baseline!=null) {
                var binding=new BaselineBindingResolver().verify(r,baseline);
                if(List.of("PROJECT_BASELINE_CONFIRMED","RUN_VERSION_BOUND").contains(binding.identityStatus()))actual=binding.fields().get("project_id").value();
            }
            if(!id(actual)||!id(scope.get(field))||!actual.toString().equals(scope.get(field).toString()))errors.add("CONTEXT_IDENTITY_SCOPE_UNPROVEN:"+field);
        }
        if(scope.containsKey("simulator")&&!Objects.equals(scope.get("simulator"),r.get("result","/simulator")))errors.add("CONTEXT_SIMULATOR_VERSION_MISMATCH");
    }
    private static boolean review(AnalysisContext c,Artifact p,Artifact review,Map<String,Artifact> registry) {
        if(!verified(review,AnalysisContext.REVIEW)||c.asOf()==null)return false;
        var data=review.data();
        boolean trusted=c.authorities().stream().anyMatch(a->Objects.equals(a.authorityId(),at(data,"/authority_id"))&&text(a.authorityId())
                &&Objects.equals(a.reviewerId(),at(data,"/reviewer_id"))&&text(a.reviewerId())&&Objects.equals(a.reviewSha256(),review.sha256())
                &&Objects.equals(a.reviewDataSha256(),AnalysisContext.dataHash(review)));
        if(!trusted||!"APPROVED".equals(at(data,"/status"))||!text(at(data,"/review_id"))
                ||!Objects.equals(p.sha256(),at(data,"/subject_sha256"))||!Objects.equals(AnalysisContext.dataHash(p),at(data,"/subject_data_sha256"))
                ||!Objects.equals(at(p.data(),"/id"),at(data,"/subject_id"))||!Objects.equals(at(p.data(),"/version"),at(data,"/subject_version")))return false;
        try {Instant from=Instant.parse(str(at(data,"/reviewed_at"))),to=Instant.parse(str(at(data,"/valid_until")));
            if(to.isBefore(from)||c.asOf().isBefore(from)||c.asOf().isAfter(to))return false;
        }catch(RuntimeException e){return false;}
        Map<String,Object> pins=map(at(data,"/evidence"));if(pins.isEmpty())return false;
        for(var e:pins.entrySet()){Artifact a=registry.get(e.getKey());if(!integrity(a)||!Objects.equals(a.sha256(),at(e.getValue(),"/sha256"))
                ||!Objects.equals(AnalysisContext.dataHash(a),at(e.getValue(),"/data_sha256")))return false;}
        return true;
    }
    private static boolean integrity(Artifact a){return a!=null&&a.usable()&&a.integrity()==Integrity.VERIFIED&&hash(a.sha256());}
    /** A gate is an approved external attestation, not a derived fact inferred from source code. */
    private static Value predicate(Accepted a,String key,Map<String,Artifact> registry,String unit,String clock) {
        String pointer="/payload/predicates/"+key;Object p=at(a.pkg.data(),pointer);
        if(!Objects.equals(unit,at(p,"/unit"))||!Objects.equals(clock,at(p,"/clock_id"))||!"OBSERVED".equals(at(p,"/status"))||at(p,"/value")==null)return null;
        List<SourceRef> refs=new ArrayList<>();Map<String,Object> pins=map(at(a.review.data(),"/evidence"));
        for(Object ref:list(at(p,"/source_refs"))) {
            String id=str(at(ref,"/artifact_id")),loc=str(at(ref,"/locator"));Artifact source=registry.get(id);
            if(!pins.containsKey(id)||!integrity(source)||loc==null||!loc.startsWith("/")||at(source.data(),loc)==null)return null;
            if(!"vehicsim.analysis-context-attestation/v1".equals(at(source.data(),"/schema"))
                    ||!Objects.equals(at(source.data(),"/run_key"),at(a.pkg.data(),"/scope/run_key"))
                    ||!Objects.equals(at(source.data(),"/result_sha256"),at(a.pkg.data(),"/scope/result_sha256")))return null;
            if("REQUIREMENT".equals(at(a.pkg.data(),"/kind"))&&!"REVIEWED_EX_ANTE_EVIDENCE".equals(at(source.data(),"/basis")))return null;
            // The reviewed trace must carry this exact typed value; a citation to an unrelated document is not a satisfied gate.
            if(!Objects.equals(freeze(at(source.data(),loc)),freeze(at(p,"/value"))))return null;
            refs.add(new SourceRef(id,loc));
        }
        if(refs.isEmpty())return null;
        if(clock!=null&&!interval(a.pkg,p,clock))return null;
        refs.add(new SourceRef(a.pkg.id(),pointer));refs.add(new SourceRef(a.review.id(),""));
        return value(at(p,"/value"),Status.OBSERVED,unit,clock,refs,"EXTERNAL_REVIEWED_ATTESTATION_NOT_CAUSAL_PROOF");
    }
    private static boolean interval(Artifact pkg,Object predicate,String clock) {
        Object interval=at(predicate,"/interval");Double start=number(at(interval,"/start_s")),end=number(at(interval,"/end_s"));
        Object scope=at(pkg.data(),"/scope/interval");Double from=number(at(scope,"/start_s")),to=number(at(scope,"/end_s"));
        boolean complete=!"COLLISION_COVERAGE".equals(at(pkg.data(),"/kind"))||Objects.equals(start,from)&&Objects.equals(end,to);
        return complete&&start!=null&&end!=null&&from!=null&&to!=null&&start>=0&&from>=0&&end>=start&&to>=from
                &&start>=from&&end<=to&&clock.equals(at(scope,"/clock_id"))&&"s".equals(at(scope,"/unit"))&&"s".equals(at(interval,"/unit"));
    }
    private static Double number(Object x){return x instanceof Number n&&Double.isFinite(n.doubleValue())?n.doubleValue():null;}
    private static Map<String,Object> calibration(Run r,Accepted a,Map<String,Artifact> registry) {
        String field=str(at(a.pkg.data(),"/payload/field"));List<EvidenceGates.Constraint> constraints=new ArrayList<>();
        Map<String,EvidenceGates.Context> actual=new LinkedHashMap<>();List<String> errors=new ArrayList<>();
        if(!List.of("pedal_to_deceleration","conditional_braking_model","stopping_extrapolation").contains(Objects.toString(field,"")))errors.add("CALIBRATION_DEPENDENT_FIELD_UNSUPPORTED");
        for(Object raw:list(at(a.pkg.data(),"/payload/constraints"))) {
            String path=str(at(raw,"/path")),unit=str(at(raw,"/unit"));
            if(path==null||!path.matches("(result|bundle):/.*")){errors.add("CALIBRATION_CONTEXT_PATH_UNSUPPORTED");continue;}
            String[] parts=path.split(":",2);Object v=r.get(parts[0],parts[1]);
            String expected=unit(path);if(!Objects.equals(unit,expected)){errors.add("CALIBRATION_UNIT_INVALID:"+path);continue;}
            if(v instanceof Number&&expected==null){errors.add("CALIBRATION_NUMERIC_UNIT_UNDECLARED:"+path);continue;}
            if(path.equals("result:/outcome/frames/*/ego_v")) {
                var frames=rows(r,"result","/outcome/frames");if(frames.isEmpty()||blocked(r,new EvidenceValidator().validate(r),"result"))errors.add("CALIBRATION_SPEED_TRACE_UNRESOLVED");
                for(int i=0;i<frames.size();i++) {
                    String sample=path+"@"+i;constraints.add(new EvidenceGates.Constraint(sample,str(at(raw,"/operator")),at(raw,"/value"),unit));
                    actual.put(sample,new EvidenceGates.Context(n(frames.get(i).get("ego_v")),expected));
                }
            } else {constraints.add(new EvidenceGates.Constraint(path,str(at(raw,"/operator")),at(raw,"/value"),unit));actual.put(path,new EvidenceGates.Context(v,expected));}
            if(!Objects.equals(at(a.pkg.data(),"/scope/artifact_hashes/"+parts[0]),r.artifact(parts[0]).sha256()))errors.add("CALIBRATION_INPUT_HASH_BINDING_MISSING");
        }
        Value validation=predicate(a,"validation_completed",registry,null,null);
        if(validation==null||!Boolean.TRUE.equals(validation.value()))errors.add("CALIBRATION_VALIDATION_EVIDENCE_MISSING");
        var domain=new EvidenceGates.CalibrationDomain(str(at(a.pkg.data(),"/id")),str(at(a.pkg.data(),"/version")),a.pkg.sha256(),
                validation==null?List.of():validation.sourceRefs().stream().map(x->x.artifactId()+"#"+x.locator()).toList(),constraints);
        var result=EvidenceGates.calibration(errors.isEmpty()?domain:null,actual,true,false);
        List<String> reasons=new ArrayList<>(result.reasons());reasons.addAll(errors);
        Value residual=predicate(a,"measured_residual",registry,"m/s2",null);
        Map<String,Object> residualJson=residual==null||number(residual.value())==null||number(residual.value())<0?
                missing("CALIBRATION_MEASURED_RESIDUAL_NOT_PROVIDED","m/s2"):residual.json();
        return obj("field",field,"status",result.status(),"reason_codes",reasons,"source_refs",List.of(new SourceRef(a.pkg.id(),"/payload").json(),new SourceRef(a.review.id(),"").json()),
                "domain",obj("id",domain.id(),"version",domain.version(),"artifact_sha256",a.pkg.sha256(),"constraints",at(a.pkg.data(),"/payload/constraints")),
                "measured_residual",residualJson,"limitations",List.of("Domain membership is not proof of achieved response or a P05 certificate",
                        "Residual applies only to the supplied validation measurement and domain; no probability assigned"),"validation_limitations",at(a.pkg.data(),"/payload/limitations"));
    }
    private static String unit(String path) {
        if(path.endsWith("/road_friction"))return "1";
        if(path.endsWith("/max_deceleration")||path.endsWith("/full_brake_decel")||path.endsWith("/max_brake_decel_mps2"))return "m/s2";
        if(path.endsWith("/brake_activation_delay")||path.endsWith("/fixed_delta_seconds")||path.endsWith("/ttc_threshold"))return "s";
        if(path.endsWith("/brake_buildup_rate"))return "m/s3";
        // Do not pretend a point speed validates an entire trajectory; explicit frame paths are individual samples.
        if(path.matches("result:/outcome/frames/(\\d+|\\*)/ego_v"))return "m/s";
        if(path.endsWith("/length_m")||path.endsWith("/width_m"))return "m";
        return null; // categorical identity/weather/model/version values have no physical unit
    }
    private static boolean coverage(Run r,Accepted a,Map<String,Artifact> registry,List<Issue> issues,ImpactAnalyzer.Contact contact,List<String> reasons,List<SourceRef> refs) {
        List<String> missing=new ArrayList<>();Object payload=at(a.pkg.data(),"/payload");
        if(contact.admissible())missing.add("ABSENCE_CONFLICTS_WITH_RECORDED_CONTACT");
        if(Boolean.TRUE.equals(r.get("result","/outcome/metrics/collision")))missing.add("ABSENCE_CORE_COLLISION_AUTHORITY_UNRESOLVED");
        for(String key:List.of("sensor_attached","sensor_healthy","complete_encounter","clock_valid","approved_absence_criterion")) {
            Value v=predicate(a,key,registry,null,"recorder");if(v==null||!Boolean.TRUE.equals(v.value()))missing.add("ABSENCE_GATE_MISSING:"+key);else refs.addAll(v.sourceRefs());
        }
        for(String source:List.of("frames","ground_truth","collisions"))if(!Objects.equals(at(a.pkg.data(),"/scope/artifact_hashes/"+source),r.artifact(source).sha256())||blocked(r,issues,source))missing.add("ABSENCE_SOURCE_BINDING_OR_CLOCK_INVALID:"+source);
        Object raw=r.get("collisions","");if(!(raw instanceof List<?> l)||!l.isEmpty())missing.add("ABSENCE_EVENT_STREAM_NOT_EMPTY_OR_UNAVAILABLE");
        String target=str(at(payload,"/target_actor_id")),ego=str(at(payload,"/ego_actor_id"));
        Value sensor=predicate(a,"sensor_binding",registry,null,"recorder"),criterion=predicate(a,"absence_criterion",registry,null,"recorder");
        if(sensor==null||!id(at(sensor.value(),"/sensor_actor_id"))||!Objects.equals(at(sensor.value(),"/sensor_actor_id"),at(payload,"/sensor_actor_id"))
                ||!Objects.equals(at(sensor.value(),"/ego_actor_id"),at(payload,"/ego_actor_id"))||!Objects.equals(at(sensor.value(),"/target_actor_id"),at(payload,"/target_actor_id")))missing.add("ABSENCE_SENSOR_PARENT_TARGET_BINDING_UNPROVEN");
        else refs.addAll(sensor.sourceRefs());
        if(criterion==null||!text(at(criterion.value(),"/id"))||!text(at(criterion.value(),"/version"))
                ||!"MATCHING_TARGET_SENSOR_EVENTS_ZERO_AFTER_DRAIN".equals(at(criterion.value(),"/policy")))missing.add("ABSENCE_CRITERION_ID_VERSION_OR_POLICY_UNPROVEN");
        else refs.addAll(criterion.sourceRefs());
        var gt=rows(r,"ground_truth","");
        for(String role:List.of("target","ego")) {
            String actor=role.equals("target")?target:ego;
            if(!id(actor)||gt.stream().noneMatch(row->role.equals(row.get("role"))&&actor.equals(str(row.get("actor_id")))))missing.add("ABSENCE_ACTOR_BINDING_UNPROVEN:"+role);
        }
        Double from=number(at(a.pkg.data(),"/scope/interval/start_s")),to=number(at(a.pkg.data(),"/scope/interval/end_s"));
        Value drain=predicate(a,"drain_watermark",registry,"s","recorder");
        if(from==null||to==null||from<0||to<from||drain==null||number(drain.value())==null||number(drain.value())<=to)missing.add("ABSENCE_DRAIN_OR_INTERVAL_UNPROVEN");
        else {
            refs.addAll(drain.sourceRefs());
            var frames=rows(r,"frames","");
            boolean start=frames.stream().anyMatch(row->sameNumber(row.get("sim_time_s"),from)),end=frames.stream().anyMatch(row->sameNumber(row.get("sim_time_s"),to));
            if(!start||!end)missing.add("ABSENCE_ENCOUNTER_ENDPOINTS_NOT_RECORDED");
            for(String actor:List.of(target==null?"":target,ego==null?"":ego))for(double time:new double[]{from,to})
                if(gt.stream().noneMatch(row->actor.equals(str(row.get("actor_id")))&&sameNumber(row.get("sim_time_s"),time)))missing.add("ABSENCE_ACTOR_INTERVAL_COVERAGE_UNPROVEN");
        }
        if(!missing.isEmpty()){reasons.addAll(missing);refs.clear();return false;}
        refs.add(r.ref("collisions",""));refs.add(new SourceRef(a.pkg.id(),"/payload"));return true;
    }
}
