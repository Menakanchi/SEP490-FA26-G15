package com.vsos.core.failureanalysis;

import com.vsos.core.evaluation.AnalysisMetrics;
import com.vsos.core.mobo.ParameterBounds;
import java.time.Instant;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

/** Offline M1D conformance evidence only. No dispatch, trial creation or executable M2 adapter. */
public final class ConsumerCompatibilityValidator {
    public static final String SCHEMA="vehicsim.failure-analysis-consumer-compatibility/v1";
    public record Input(Artifact handoff,ConsumerSourceInspection.Profile source,Artifact parityProbe,
                        Artifact freshness,MoboHandoffBuilder.Input referenceInput) {
        public Input{Objects.requireNonNull(handoff);Objects.requireNonNull(source);}
    }
    private static final String HANDOFF="compatibility-input-handoff";
    private static final Set<String> PARTITIONS=Set.of("OPTIMIZATION","VALIDATION","DIAGNOSTIC_ONLY","EXCLUDED","UNKNOWN");
    private record Finding(String code,String status,String category,String path,String detail,List<SourceRef> refs) {
        Map<String,Object> json(){return obj("code",code,"status",status,"category",category,"path",path,"detail",detail,
                "source_refs",refs.stream().map(SourceRef::json).toList());}
    }
    private static final class Checks {
        final List<Finding> findings=new ArrayList<>();
        void add(String code,String status,String category,String path,String detail){
            findings.add(new Finding(code,status,category,path,detail,List.of(new SourceRef(HANDOFF,path))));
        }
        boolean failed(String category){return findings.stream().anyMatch(f->f.category.equals(category)&&f.status.equals("FAIL"));}
        String status(String category){return failed(category)?"INVALID":findings.stream().anyMatch(f->f.category.equals(category)&&f.status.equals("UNKNOWN"))?"UNKNOWN":"VERIFIED";}
    }
    public Map<String,Object> validate(Input input){
        Map<String,Object> handoff=map(input.handoff().data());Checks checks=new Checks();
        Map<String,Map<String,Object>> registry=validateEnvelope(input.handoff(),handoff,checks);
        validateTree(handoff,registry,checks,"");
        List<Map<String,Object>> members=list(handoff.get("members")).stream().map(HandoffSnapshots::map).toList();
        Map<String,Object> identity=identity(handoff,members,registry,checks);
        Map<String,Object> replay=canonical(handoff,members,checks);
        Map<String,Object> baseline=baseline(handoff,members,checks);
        String sourceReplay=replayReference(input,handoff,checks);
        baseline.put("binding_proof",sourceReplay);
        Map<String,Object> isolation=isolation(input,handoff,members,registry,checks,sourceReplay);
        Map<String,Object> bounds=bounds(handoff,input.source(),checks);
        Map<String,Object> freshness=freshness(input.freshness(),handoff,members,checks);
        Map<String,Object> probes=probe(input.parityProbe(),input.source(),checks);
        if(input.source().audited())for(var gap:input.source().gaps()){
            String code=str(gap.get("code"));checks.findings.add(new Finding(code,"UNSUPPORTED","CONSUMER","/consumer_compatibility",
                    str(gap.get("detail")),refs(gap.get("source_refs"))));
        }else checks.add("CONSUMER_SOURCE_CHANGED_OR_MISSING","UNKNOWN","CONSUMER","/consumer_compatibility","Audited source profile does not match; capabilities require re-audit");
        String scope=str(handoff.get("evidence_scope"));
        if("SYNTHETIC_TEST_ONLY".equals(scope))checks.add("SYNTHETIC_INPUT_NOT_PRODUCTION","UNSUPPORTED","SCOPE","/evidence_scope","Positive fixture conformance never establishes a production baseline or readiness");
        boolean invalid=checks.findings.stream().anyMatch(f->f.status.equals("FAIL"));
        Map<String,Object> report=obj("schema_version",SCHEMA,"implementation_stage","M1D","validator_build_id","failure-analysis-m1d/1.0.0",
                "compatibility_id",UUID.randomUUID().toString(),"created_at_utc",Instant.now().toString(),"evidence_scope",scope==null?"UNKNOWN":scope,
                "input",obj("handoff_byte_sha256",input.handoff().sha256(),"byte_hash_integrity",input.handoff().integrity().name(),
                        "handoff_content_digest",handoff.get("content_digest"),"content_digest_profile",handoff.get("digest_profile")),
                "input_validation",obj("schema",checks.status("SCHEMA"),"integrity",checks.status("INTEGRITY"),"source_replay",sourceReplay,
                        "identity_scope","OFFLINE_AS_OF_SUPPLIED_EVIDENCE","current_runtime_verified",false),
                "schema_mapping",mapping(input.source()),"identity_partition_compatibility",identity,
                "canonical_metric_parity",obj("status",input.source().audited()?"DIVERGENT":"UNKNOWN","handoff_replay_status",checks.status("METRICS"),"aggregation_version",AnalysisMetrics.VERSION,"handoff_replay",replay,"consumer_probe",probes,
                        "consumer_contract_parity",input.source().audited()?"DIVERGENT":"UNKNOWN","canonical_values_modified",false),
                "baseline_consistency",baseline,"freshness",freshness,"validation_isolation",isolation,"search_bounds_assessment",bounds,
                "source_inspection",input.source().json(),"findings",checks.findings.stream().map(Finding::json).toList(),
                "operational_blockers",checks.findings.stream().filter(f->Set.of("FAIL","UNKNOWN","UNSUPPORTED").contains(f.status)).map(Finding::json).toList(),
                "proposed_m2_adapter",proposal(),"required_m2_changes",changes(),
                "overall",invalid||!input.source().audited()?"BLOCKED":"NOT_DIRECTLY_CONSUMABLE",
                "dispatch_allowed",false,"operational_ready",false,"optimizer_called",false,"database_accessed",false,
                "digest_profile","fa-consumer-compatibility-sorted-json/1");
        report.put("source_registry",registry(input,registry));report.put("content_digest",contentDigest(report));return immutable(report);
    }
    public Map<String,Object> validate(Artifact handoff,ConsumerSourceInspection.Profile source){return validate(new Input(handoff,source,null,null,null));}
    public static String contentDigest(Map<String,Object> report){Map<String,Object> stable=new LinkedHashMap<>(report);stable.remove("compatibility_id");return digest(stable);}
    @SuppressWarnings("unchecked") private static Map<String,Object> immutable(Map<String,Object> x){return (Map<String,Object>)freeze(x);}
    private static List<SourceRef> refs(Object x){return list(x).stream().filter(v->text(at(v,"/artifact_id"))&&at(v,"/locator") instanceof String)
            .map(v->new SourceRef(str(at(v,"/artifact_id")),str(at(v,"/locator")))).toList();}

    private Map<String,Map<String,Object>> validateEnvelope(Artifact artifact,Map<String,Object> h,Checks c){
        if(!artifact.usable()||artifact.integrity()==Integrity.FAILED)c.add("HANDOFF_BYTE_INTEGRITY_FAILED","FAIL","INTEGRITY","","Input artifact failed byte-integrity or schema parsing");
        else if(artifact.integrity()!=Integrity.VERIFIED||!hash(artifact.sha256()))c.add("HANDOFF_BYTE_INTEGRITY_UNVERIFIED","UNKNOWN","INTEGRITY","","Supply independent expected byte SHA; embedded semantic digest is a different profile");
        if(!MoboHandoffBuilder.SCHEMA.equals(h.get("schema_version"))||!"V3.1".equals(h.get("design_revision"))
                ||!"vehicsim.failure-analysis/v1".equals(h.get("core_contract"))||!"vehicsim.objective-analysis/v1".equals(h.get("objective_contract")))
            c.add("HANDOFF_SCHEMA_VERSION_INVALID","FAIL","SCHEMA","/schema_version","Unsupported M1C contract identity");
        if(!"fa-handoff-sorted-json/1".equals(h.get("digest_profile")))c.add("HANDOFF_DIGEST_PROFILE_INVALID","FAIL","INTEGRITY","/digest_profile","Do not interchange byte, M1A/report or AnalysisService/Jackson digest profiles");
        if(!AnalysisMetrics.VERSION.equals(h.get("aggregation_version")))c.add("CANONICAL_AGGREGATION_VERSION_MISMATCH","FAIL","SCHEMA","/aggregation_version","Canonical version is immutable");
        for(String field:List.of("handoff_id","analyzer_build_id","evidence_scope"))if(!text(h.get(field)))
            c.add("HANDOFF_REQUIRED_STRING_INVALID","FAIL","SCHEMA","/"+field,"Required nonempty identity/provenance string");
        if(!"M1C".equals(h.get("implementation_stage"))||!"/source_registry".equals(h.get("source_registry_ref")))
            c.add("HANDOFF_STAGE_OR_REGISTRY_INVALID","FAIL","SCHEMA","/implementation_stage","Expected the M1C producer stage and registry pointer");
        try{Instant.parse(str(h.get("created_at_utc")));}catch(RuntimeException e){
            c.add("HANDOFF_TIMESTAMP_INVALID","FAIL","SCHEMA","/created_at_utc","Recorded UTC creation timestamp required; no invented freshness TTL");}
        try{if(!hash(h.get("content_digest"))||!Objects.equals(h.get("content_digest"),digest(h)))c.add("HANDOFF_CONTENT_DIGEST_MISMATCH","FAIL","INTEGRITY","/content_digest","Content changed or uses a different normalization profile");}
        catch(RuntimeException e){c.add("HANDOFF_NONFINITE_OR_UNHASHABLE","FAIL","INTEGRITY","/content_digest","Nonfinite/invalid JSON content cannot be a verified handoff");}
        for(String k:List.of("dataset","baseline","baseline_objectives","canonical_aggregation","search_ranges","eligibility_manifest","provenance","consumer_compatibility"))
            if(!(h.get(k) instanceof Map<?,?>))c.add("HANDOFF_OBJECT_MISSING","FAIL","SCHEMA","/"+k,"Required object missing or wrong-typed");
        for(String k:List.of("members","parameter_hints","failure_evidence","source_registry"))if(!(h.get(k) instanceof List<?>))c.add("HANDOFF_ARRAY_MISSING","FAIL","SCHEMA","/"+k,"Required array missing or wrong-typed");
        Map<String,Map<String,Object>> registry=new TreeMap<>();
        for(Object raw:list(h.get("source_registry"))){Map<String,Object> a=map(raw);String id=str(a.get("id"));
            if(!text(id)||registry.putIfAbsent(id,a)!=null)c.add("REGISTRY_ID_DUPLICATE_OR_MISSING","FAIL","INTEGRITY","/source_registry","Registry IDs must uniquely resolve");
            if(HANDOFF.equals(id)||id!=null&&id.startsWith("consumer-source:"))c.add("RESERVED_REGISTRY_ID_COLLISION","FAIL","INTEGRITY","/source_registry","Validator-owned source IDs cannot be supplied by the handoff");
            if("VERIFIED".equals(a.get("integrity"))&&!hash(a.get("sha256")))c.add("VERIFIED_SOURCE_HASH_MISSING","FAIL","INTEGRITY","/source_registry","Verified source needs a SHA256 or named semantic digest");}
        if(!(h.get("members") instanceof List<?> l)||l.isEmpty())c.add("HANDOFF_MEMBERS_EMPTY","FAIL","SCHEMA","/members","Retain every requested/unknown/excluded member");
        return registry;
    }
    private void validateTree(Object x,Map<String,Map<String,Object>> registry,Checks c,String path){
        if(x instanceof Number n&&!Double.isFinite(n.doubleValue()))c.add("NONFINITE_JSON_NUMBER","FAIL","SCHEMA",path,"NaN/Infinity are not JSON evidence");
        if(x instanceof Map<?,?> raw){Map<String,Object> m=map(raw);
            if(m.containsKey("artifact_id")&&m.containsKey("locator")&&!registry.containsKey(str(m.get("artifact_id"))))c.add("SOURCE_REFERENCE_UNRESOLVED","FAIL","INTEGRITY",path,"Reference has no registry entry");
            if(m.containsKey("value")&&m.containsKey("status")&&m.containsKey("source_refs")){
                String s=str(m.get("status"));boolean allowed=Arrays.stream(Status.values()).anyMatch(v->v.name().equals(s));
                if(!allowed||!(m.get("reason_codes") instanceof List<?>)||m.get("value")==null&&list(m.get("reason_codes")).isEmpty())c.add("EVIDENCE_VALUE_STATUS_INVALID","FAIL","SCHEMA",path,"EV status/null requires explicit reasons");
                if(Arrays.asList("UNKNOWN","INVALID","NOT_APPLICABLE").contains(s)&&m.get("value")!=null)c.add("MISSING_VALUE_COERCED","FAIL","SCHEMA",path,"Missing/NA/invalid cannot contain a false or numeric value");
                if("OBSERVED".equals(s)&&!cited(m.get("source_refs")))c.add("OBSERVED_EVIDENCE_UNCITED","FAIL","SCHEMA",path,"Observed claim has no source");
            }
            m.forEach((k,v)->validateTree(v,registry,c,path+"/"+k.replace("~","~0").replace("/","~1")));
        }else if(x instanceof List<?> l)for(int i=0;i<l.size();i++)validateTree(l.get(i),registry,c,path+"/"+i);
    }
    private Map<String,Object> identity(Map<String,Object> h,List<Map<String,Object>> members,Map<String,Map<String,Object>> registry,Checks c){
        Set<String> keys=new HashSet<>(),runIds=new HashSet<>(),pairs=new HashSet<>(),optVariants=new HashSet<>(),valVariants=new HashSet<>();
        Map<String,Integer> variantCounts=new TreeMap<>();List<Map<String,Object>> optimization=new ArrayList<>(),validation=new ArrayList<>();
        boolean unknown=false;
        for(int i=0;i<members.size();i++){
            Map<String,Object> m=members.get(i);String path="/members/"+i,key=str(m.get("run_key")),partition=str(m.get("partition"));
            if(!text(key)||!keys.add(key))c.add("DUPLICATE_OR_MISSING_RUN_KEY","FAIL","IDENTITY",path+"/run_key","Repetitions must retain distinct artifact identities");
            if(!Objects.equals(key,m.get("member_id")))c.add("MEMBER_RUN_KEY_CONFLICT","FAIL","IDENTITY",path+"/member_id","M1C member identity must equal the bound run_key");
            if(!PARTITIONS.contains(Objects.toString(partition,"")))c.add("PARTITION_INVALID","FAIL","IDENTITY",path+"/partition","Unknown partition must be explicit UNKNOWN");
            boolean operational=Arrays.asList("OPTIMIZATION","VALIDATION").contains(partition);
            if(operational&&!"ON".equals(at(m,"/mode/value")))c.add("OFF_OR_UNKNOWN_MODE_IN_OPERATIONAL_PARTITION","FAIL","IDENTITY",path+"/mode","OFF controls are diagnostic only");
            for(String field:List.of("run_id","variant_id","scenario_id","baseline_aeb_version_id")){
                Object value=at(m,"/"+field+"/value");if(value!=null&&(!(value instanceof String)||!id(value)))c.add("DATABASE_ID_NOT_DECIMAL_STRING","FAIL","SCHEMA",path+"/"+field,"DB IDs must not be case names or floating IDs");
                if(operational&&(value==null||!known(at(m,"/"+field))))unknown=true;
            }
            for(String field:List.of("seed","replicate","attempt")){Object v=at(m,"/"+field+"/value");
                if(v!=null&&(!integer(v)||!field.equals("seed")&&((Number)v).longValue()<1))c.add("RUN_SEQUENCE_ID_INVALID","FAIL","SCHEMA",path+"/"+field,"Seed and replication identity must be exact integers");
                if(operational&&v==null)unknown=true;}
            String rid=str(at(m,"/run_id/value")),variant=str(at(m,"/variant_id/value"));
            if(rid!=null&&!runIds.add(rid))c.add("DATABASE_RUN_DUPLICATE","FAIL","IDENTITY",path,"The same DB run cannot be selected twice");
            if(operational&&variant!=null){
                if(!pairs.add(variant+"|"+at(m,"/seed/value")))c.add("DUPLICATE_VARIANT_SEED","FAIL","IDENTITY",path,"No automatic repetition reducer or best-run selection");
                (partition.equals("OPTIMIZATION")?optVariants:valVariants).add(variant);
                if(partition.equals("OPTIMIZATION"))variantCounts.merge(variant,1,Integer::sum);
            }
            Object reportDigest=at(m,"/diagnostic_report_ref/value");Map<String,Object> report=registry.get("report:"+key);
            if(reportDigest!=null&&(report==null||!Objects.equals(reportDigest,report.get("sha256"))||!"fa-report-sorted-json/1".equals(report.get("digest_profile"))))
                c.add("MEMBER_REPORT_DIGEST_MISMATCH","FAIL","INTEGRITY",path+"/diagnostic_report_ref","Report registry identity/digest/profile differs");
            if(operational){Map<String,Object> binding=obj("run_key",key,"run_id",rid,"variant_id",variant,"seed",sequence(at(m,"/seed/value")),
                    "replicate",sequence(at(m,"/replicate/value")),"attempt",sequence(at(m,"/attempt/value")),"baseline_aeb_version_id",at(m,"/baseline_aeb_version_id/value"),"report_digest",reportDigest,
                    "scope",partition.equals("OPTIMIZATION")?"FUTURE_EXECUTION_IDENTITY_ONLY":"SEALED_VERIFICATION_IDENTITY_ONLY");
                (partition.equals("OPTIMIZATION")?optimization:validation).add(binding);}
        }
        if(optVariants.stream().anyMatch(valVariants::contains))c.add("VARIANT_PARTITION_LEAKAGE","FAIL","IDENTITY","/members","Variant overlap is leakage even when seeds differ");
        for(String p:List.of("optimization","validation")){
            List<Map<String,Object>> projected=p.equals("optimization")?optimization:validation;
            List<Object> ids=projected.stream().map(m->m.get("run_id")).toList();
            if(!ids.contains(null)&&!ids.equals(list(at(h,"/dataset/"+p+"_run_ids"))))c.add("PARTITION_RUN_LIST_MISMATCH","FAIL","IDENTITY","/dataset/"+p+"_run_ids","Exact ordered cohort identity differs from member manifest");
        }
        if(optimization.isEmpty()||validation.isEmpty()||unknown)c.add("OPERATIONAL_COHORT_IDENTITY_UNKNOWN","UNKNOWN","IDENTITY","/members","No complete bound optimization/validation cohort; retain diagnostic evidence");
        if(!"FROZEN".equals(at(h,"/dataset/selection_status")))c.add("FROZEN_SELECTION_UNAVAILABLE","UNKNOWN","IDENTITY","/dataset/selection_status","An offline manifest is not an operational frozen selection");
        try{String expected=digest(obj("selection_sha256",at(h,"/dataset/snapshot_digest/value"),"members",members));
            if(!expected.equals(at(h,"/dataset/cohort_digest/value")))c.add("COHORT_DIGEST_MISMATCH","FAIL","INTEGRITY","/dataset/cohort_digest","Role/order/identity/member content changed");}
        catch(RuntimeException e){c.add("COHORT_DIGEST_INVALID","FAIL","INTEGRITY","/dataset/cohort_digest","Cannot hash cohort content");}
        validateCounts(h,keys,c);
        return obj("status",c.status("IDENTITY"),"optimization_bindings",optimization,"sealed_validation_bindings",validation,
                "legacy_variant_map_collisions",variantCounts.entrySet().stream().filter(e->e.getValue()>1).map(e->obj("variant_id",e.getKey(),"selected_runs",e.getValue())).toList(),
                "consumer_preserves_exact_cohort",false,"projection_kind","OFFLINE_DESCRIPTIVE_NOT_EXECUTABLE");
    }
    private static boolean known(Object ev){return Arrays.asList("OBSERVED","DERIVED").contains(str(at(ev,"/status")))&&at(ev,"/value")!=null;}
    private static Object sequence(Object x){return integer(x)?x:null;}
    private void validateCounts(Map<String,Object> h,Set<String> keys,Checks c){
        List<Object> requested=list(at(h,"/eligibility_manifest/requested_member_ids"));
        if(requested.size()!=keys.size()||!new HashSet<>(requested).equals(keys))c.add("REQUESTED_MANIFEST_DOES_NOT_RECONCILE","FAIL","IDENTITY","/eligibility_manifest/requested_member_ids","Do not hide missing or excluded members");
        List<Object> categorized=new ArrayList<>();
        for(String field:List.of("optimization_eligible","validation_eligible"))categorized.addAll(list(at(h,"/eligibility_manifest/"+field)));
        for(String field:List.of("excluded","unknown"))for(Object entry:list(at(h,"/eligibility_manifest/"+field)))categorized.add(at(entry,"/member_id"));
        if(categorized.size()!=keys.size()||new HashSet<>(categorized).size()!=categorized.size()||!new HashSet<>(categorized).equals(keys))
            c.add("ELIGIBILITY_MANIFEST_DOES_NOT_RECONCILE","FAIL","IDENTITY","/eligibility_manifest","Every member must have exactly one cohort-level eligibility category");
        for(String field:List.of("optimization_eligible","validation_eligible","excluded","unknown")){
            if(!sameNumber(at(h,"/eligibility_manifest/counts/"+field),list(at(h,"/eligibility_manifest/"+field)).size()))c.add("ELIGIBILITY_COUNT_MISMATCH","FAIL","IDENTITY","/eligibility_manifest/counts/"+field,"Counts disagree with arrays");}
        if(!sameNumber(at(h,"/eligibility_manifest/counts/requested"),keys.size()))c.add("REQUESTED_COUNT_MISMATCH","FAIL","IDENTITY","/eligibility_manifest/counts/requested","Requested count disagrees with members");
    }
    private Map<String,Object> canonical(Map<String,Object> h,List<Map<String,Object>> members,Checks c){
        Map<String,Object> result=new LinkedHashMap<>();
        for(String partition:List.of("OPTIMIZATION","VALIDATION")){
            String p=partition.toLowerCase(Locale.ROOT);List<Map<String,Object>> cohort=members.stream().filter(m->partition.equals(m.get("partition"))).toList();
            List<AnalysisMetrics.Sample> samples=new ArrayList<>();boolean complete=!cohort.isEmpty();
            for(var member:cohort){if(member.get("canonical_sample")==null){complete=false;continue;}
                try{samples.add(CanonicalAggregation.readSample(member.get("canonical_sample")));}
                catch(RuntimeException e){complete=false;c.add("CANONICAL_SAMPLE_SCHEMA_INVALID","FAIL","METRICS","/members","Explicit null and missing/type errors are distinct");}}
            Map<String,Object> actual=null;if(complete)try{actual=CanonicalAggregation.aggregate(samples);}
            catch(RuntimeException e){c.add("CANONICAL_REPLAY_NONFINITE","FAIL","METRICS","/canonical_aggregation/"+p,"Canonical aggregate is not serializable/usable");}
            Object claimed=at(h,"/canonical_aggregation/"+p+"/value");
            if(claimed!=null){aggregateShape(claimed,cohort.size(),c,"/canonical_aggregation/"+p);
                if(actual==null)c.add("CLAIMED_AGGREGATE_WITHOUT_BOUND_SAMPLES","FAIL","METRICS","/canonical_aggregation/"+p,"Cannot assert a score after dropping unknown sample identity");
                else if(!semanticEquals(actual,claimed))c.add("CANONICAL_AGGREGATE_PARITY_FAILED","FAIL","METRICS","/canonical_aggregation/"+p,"Mean, statuses or denominators differ from AnalysisMetrics");}
            if(actual==null)c.add("CANONICAL_COHORT_REPLAY_UNAVAILABLE","UNKNOWN","METRICS","/canonical_aggregation/"+p,"No complete canonical sample cohort; no fallback score");
            Object score=at(h,"/baseline_objectives/"+p+"/value");
            if(score!=null&&(actual==null||!semanticEquals(actual,score)))c.add("BASELINE_CANONICAL_SCORE_MISMATCH","FAIL","METRICS","/baseline_objectives/"+p,"Baseline score must preserve canonical output exactly");
            result.put(p,obj("status",actual==null?"UNKNOWN":claimed==null?"REPLAY_ONLY_NOT_BASELINE":"REPLAYED",
                    "scope",partition.equals("OPTIMIZATION")?"OPTIMIZATION_COHORT_ONLY":"OFFLINE_VERIFICATION_ONLY_NOT_GP",
                    "replayed_aggregate",actual==null?unknownJson("CANONICAL_SAMPLES_UNAVAILABLE"):derived(actual,AnalysisMetrics.VERSION,List.of(new SourceRef(HANDOFF,"/members"))),
                    "sample_count",cohort.size()));
        }return result;
    }
    private void aggregateShape(Object bundle,int n,Checks c,String path){
        if(!AnalysisMetrics.VERSION.equals(at(bundle,"/version")))c.add("AGGREGATE_VERSION_INVALID","FAIL","METRICS",path,"Per-bundle canonical version missing or changed");
        for(String key:CanonicalObjectiveReader.KEYS){Object objective=at(bundle,"/"+key);Object x=at(objective,"/value");String status=str(at(objective,"/status"));
            List<Object> counts=List.of(Objects.requireNonNullElse(at(objective,"/samples"),-1),Objects.requireNonNullElse(at(objective,"/missing"),-1),Objects.requireNonNullElse(at(objective,"/notApplicable"),-1));
            boolean countOk=counts.stream().allMatch(v->integer(v)&&((Number)v).longValue()>=0)&&counts.stream().mapToLong(v->((Number)v).longValue()).sum()==n;
            boolean validStatus=countOk&&("VALID".equals(status)?finiteNonnegative(x)&&((Number)counts.get(0)).longValue()>0&&sameNumber(counts.get(1),0):
                    "INCOMPLETE".equals(status)?x==null&&((Number)counts.get(1)).longValue()>0:
                    "NOT_APPLICABLE".equals(status)&&x==null&&sameNumber(counts.get(0),0)&&sameNumber(counts.get(1),0));
            String unit=key.equals("rms_jerk_mps3")?"m/s\u00b3":key.equals("impact_speed_mps")?"m/s":"m";
            if(!countOk||!validStatus||!unit.equals(at(objective,"/unit")))c.add("AGGREGATE_OBJECTIVE_SHAPE_INVALID","FAIL","METRICS",path+"/"+key,"Counts/status/unit/value violate the canonical contract");
        }
    }
    private static boolean semanticEquals(Object a,Object b){try{return digest(obj("value",a)).equals(digest(obj("value",b)));}catch(RuntimeException e){return false;}}
    private Map<String,Object> baseline(Map<String,Object> h,List<Map<String,Object>> members,Checks c){
        boolean bound="PROJECT_BASELINE_CONFIRMED".equals(at(h,"/baseline/identity_status"));
        if(!bound)c.add("BASELINE_IDENTITY_UNCONFIRMED","UNKNOWN","BASELINE","/baseline","No verified project/version binding");
        if(Boolean.FALSE.equals(at(h,"/baseline/current/value")))c.add("BASELINE_STALE","FAIL","BASELINE","/baseline/current","Bound version is explicitly no longer current");
        if(at(h,"/baseline/current/value")==null)c.add("BASELINE_CURRENTNESS_UNKNOWN","UNKNOWN","BASELINE","/baseline/current","Missing currentness is not a true value");
        if(Boolean.TRUE.equals(at(h,"/baseline/confirmed_as_v1/value"))&&!sameNumber(at(h,"/baseline/version_no/value"),1))c.add("BASELINE_V1_LINEAGE_CONFLICT","FAIL","BASELINE","/baseline/confirmed_as_v1","v1 cannot refer to a different version number");
        if(!"KNOWN".equals(at(h,"/baseline_objectives/availability")))c.add("BASELINE_CANONICAL_OBJECTIVES_UNAVAILABLE","UNKNOWN","BASELINE","/baseline_objectives","Three baseline objectives are not BaselineStats rates and must not be synthesized");
        if(bound){
            if(!id(at(h,"/baseline/version_id/value"))||!Objects.equals(at(h,"/baseline/project_id/value"),at(h,"/dataset/project_id/value")))c.add("BASELINE_PROJECT_VERSION_CONFLICT","FAIL","BASELINE","/baseline","Version/project identity differs from dataset");
            for(var m:members)if(Arrays.asList("OPTIMIZATION","VALIDATION").contains(m.get("partition"))){
                if(!Objects.equals(at(m,"/baseline_aeb_version_id/value"),at(h,"/baseline/version_id/value"))||!Objects.equals(at(m,"/scenario_id/value"),at(h,"/dataset/scenario_id/value")))c.add("MEMBER_BASELINE_OR_SCENARIO_CONFLICT","FAIL","BASELINE","/members","Do not merge separate baseline/scenario cohorts");
                for(String code:BaselineBindingResolver.PARAMETERS.keySet())if(!finiteNonnegative(at(m,"/actual_parameters/"+code+"/value"))||!sameNumber(at(m,"/actual_parameters/"+code+"/value"),at(h,"/baseline/parameter_values/"+code+"/value")))
                    c.add("MIXED_BASELINE_PARAMETER_VALUES","FAIL","BASELINE","/members","Actual parameter tuples must equal the verified baseline snapshot");
            }}
        return obj("status",c.status("BASELINE"),"identity_claim",at(h,"/baseline/identity_status"),"binding_proof","REQUIRES_REFERENCE_REPLAY",
                "score_availability",at(h,"/baseline_objectives/availability"),"legacy_baseline_stats_has_objective_vector",false,"baseline_as_trial0_allowed",false);
    }
    private String replayReference(Input input,Map<String,Object> h,Checks c){
        if(input.referenceInput()==null){c.add("REFERENCED_SOURCE_BUNDLE_UNAVAILABLE","UNKNOWN","REFERENCES","/source_registry","Registry digests alone do not re-verify raw/binding/policy/hint/domain source contents");return "UNKNOWN";}
        try{Map<String,Object> replayed=new MoboHandoffBuilder().build(input.referenceInput());
            if(!Objects.equals(h.get("content_digest"),replayed.get("content_digest"))){c.add("REFERENCED_SOURCE_REPLAY_MISMATCH","FAIL","REFERENCES","/content_digest","Supplied raw/reports/selection/quality/domains do not reproduce this M1C handoff");return "MISMATCH";}
            return "MATCHED_M1C_SOURCE_BUNDLE";
        }catch(RuntimeException e){c.add("REFERENCED_SOURCE_REPLAY_INVALID","FAIL","REFERENCES","/source_registry","Invalid/inconsistent source bundle; do not repair input to make it pass");return "INVALID";}
    }
    private Map<String,Object> isolation(Input input,Map<String,Object> h,List<Map<String,Object>> members,
                                         Map<String,Map<String,Object>> registry,Checks c,String replay){
        Set<String> validationKeys=new HashSet<>();members.stream().filter(m->"VALIDATION".equals(m.get("partition"))).forEach(m->validationKeys.add(str(m.get("run_key"))));
        Set<String> validationArtifacts=new HashSet<>();validationKeys.forEach(k->validationArtifacts.add("report:"+k));
        registry.forEach((id,a)->{String uri=Objects.toString(a.get("uri"),"").replace('\\','/');
            if(validationKeys.contains(str(a.get("run_key")))&&(uri.contains("runs/")||uri.contains("runs_aeboff/")))validationArtifacts.add(id);});
        Map<String,Object> data=new HashMap<>();
        if(input.referenceInput()!=null){for(var m:input.referenceInput().members()){
                data.put("report:"+m.run().runKey(),m.report());m.run().artifacts().values().forEach(a->data.put(a.id(),a.data()));
                for(Artifact a:Arrays.asList(m.canonicalSample(),m.baselineBinding(),m.mechanismReview()))if(a!=null)data.put(a.id(),a.data());}
            if(input.referenceInput().domains()!=null)for(Artifact domain:input.referenceInput().domains().artifacts()){
                data.put(domain.id(),domain.data());if("VALIDATION".equals(at(domain.data(),"/basis_partition")))validationArtifacts.add(domain.id());}}
        int suspected=0,abstain=0,noHint=0;
        for(int i=0;i<list(h.get("parameter_hints")).size();i++){
            Object hint=list(h.get("parameter_hints")).get(i);String status=str(at(hint,"/status")),code=str(at(hint,"/parameter_code")),path="/parameter_hints/"+i;
            if("SUSPECTED".equals(status)){
                suspected++;if(!BaselineBindingResolver.PARAMETERS.containsKey(Objects.toString(code,""))||list(at(hint,"/missing_prerequisites")).size()>0
                        ||list(at(hint,"/related_candidate_ids")).isEmpty()||!cited(at(hint,"/evidence_refs"))||!text(at(hint,"/mechanism"))||list(at(hint,"/tradeoffs")).size()<3)
                    c.add("SUSPECTED_HINT_EVIDENCE_INCOMPLETE","FAIL","ISOLATION",path,"SUSPECTED needs mechanism, evidence, candidate/metric context and three-objective tradeoffs");
            }else if("ABSTAIN".equals(status)){abstain++;if(code!=null||list(at(hint,"/missing_prerequisites")).isEmpty())c.add("ABSTAIN_HINT_INVALID","FAIL","ISOLATION",path,"ABSTAIN is an evidence gap, not a parameter culprit");}
            else if("NO_PARAMETER_HINT".equals(status)){noHint++;if(code!=null)c.add("NO_HINT_PARAMETER_INVALID","FAIL","ISOLATION",path,"No parameter mechanism has been established");}
            else c.add("HINT_STATUS_NOT_SUPPORTED","FAIL","ISOLATION",path,"Confirmed root cause is a separate causal claim, not a hint status");
            for(String forbidden:List.of("proposed_value","proposed_params","expected_improvement","expected_score","acquisition_score","confidence_probability"))
                if(map(hint).containsKey(forbidden))c.add("OPTIMIZATION_PROPOSAL_IN_HINT","FAIL","ISOLATION",path,"Diagnostic hints must not become numeric optimization proposals or probabilities");
            Set<String> sourceReports=new HashSet<>();for(var ref:refs(at(hint,"/evidence_refs")))if(ref.artifactId().startsWith("report:"))sourceReports.add(ref.artifactId().substring(7));
            Set<String> optKeys=new HashSet<>();members.stream().filter(m->"OPTIMIZATION".equals(m.get("partition"))).forEach(m->optKeys.add(str(m.get("run_key"))));
            if(sourceReports.isEmpty()||!optKeys.containsAll(sourceReports))c.add("HINT_NON_OPTIMIZATION_SOURCE","FAIL","ISOLATION",path,"Only optimization report evidence can generate hints");
            if(tainted(hint,validationArtifacts,data,new HashSet<>()))c.add("VALIDATION_EVIDENCE_IN_HINT","FAIL","ISOLATION",path,"Direct or transitive validation evidence must remain sealed");
        }
        for(String code:BaselineBindingResolver.PARAMETERS.keySet())if(tainted(at(h,"/search_ranges/"+code+"/suggested_range"),validationArtifacts,data,new HashSet<>()))
            c.add("VALIDATION_EVIDENCE_IN_RANGE","FAIL","ISOLATION","/search_ranges/"+code,"Approved range provenance must not be learned from validation");
        if(!replay.equals("MATCHED_M1C_SOURCE_BUNDLE")&&suspected>0)c.add("POSITIVE_HINT_SOURCE_PROOF_UNAVAILABLE","UNKNOWN","ISOLATION","/parameter_hints","SUSPECTED is structurally plausible but gates/source contents have not been replayed");
        return obj("handoff_lineage_status",c.status("ISOLATION"),"hint_gate_replay",replay,"suspected_hints",suspected,"abstentions",abstain,"no_parameter_hints",noHint,
                "confirmed_root_cause_required_for_hint",false,"consumer_sealed_validation_enforcement",input.source().audited()?"NOT_SUPPORTED":"UNKNOWN",
                "gp_fit_performed",false,"hint_or_range_generation_mode",input.referenceInput()==null?"NONE":"EXISTING_M1C_REPLAY_FOR_CONFORMANCE_ONLY",
                "hint_or_range_policy_modified",false,"validation_evidence_detected_in_handoff",
                c.findings.stream().anyMatch(f->Set.of("VALIDATION_EVIDENCE_IN_HINT","VALIDATION_EVIDENCE_IN_RANGE").contains(f.code)),
                "scope","Validator may inspect validation integrity for review; no GP/Pareto/acquisition/hint/range learning occurs");
    }
    private boolean tainted(Object x,Set<String> forbidden,Map<String,Object> data,Set<String> visited){
        if(x instanceof Map<?,?> raw){Map<String,Object> m=map(raw);
            if(m.containsKey("artifact_id")&&m.containsKey("locator")){
                String id=str(m.get("artifact_id")),locator=str(m.get("locator"));if(forbidden.contains(id))return true;
                if(data.containsKey(id)&&locator!=null&&(locator.isEmpty()||locator.startsWith("/"))&&visited.add(id+"#"+locator)&&tainted(at(data.get(id),locator),forbidden,data,visited))return true;
            }
            for(Object value:m.values())if(tainted(value,forbidden,data,visited))return true;
        }else if(x instanceof List<?> l)for(Object value:l)if(tainted(value,forbidden,data,visited))return true;
        return false;
    }
    private Map<String,Object> bounds(Map<String,Object> h,ConsumerSourceInspection.Profile source,Checks c){
        Map<String,Object> result=new TreeMap<>();ParameterBounds defaults=ParameterBounds.defaults();
        if(!map(h.get("search_ranges")).keySet().equals(BaselineBindingResolver.PARAMETERS.keySet()))c.add("SEARCH_PARAMETER_KEY_SET_INVALID","FAIL","BOUNDS","/search_ranges","Exactly four named parameters are supported");
        for(String code:BaselineBindingResolver.PARAMETERS.keySet()){
            Object x=at(h,"/search_ranges/"+code+"/suggested_range/value"),engine=at(h,"/search_ranges/"+code+"/engine_domain/value");
            String relation="UNKNOWN";boolean mutationRisk=false;boolean valid=validRange(x);
            if(x!=null&&!valid)c.add("SUGGESTED_RANGE_INVALID","FAIL","BOUNDS","/search_ranges/"+code,"Finite lower<upper and correct units are required; no fixed-dimension widening");
            if(!SearchRangeResolver.unit(code).equals(at(h,"/search_ranges/"+code+"/unit")))c.add("SEARCH_RANGE_UNIT_INVALID","FAIL","BOUNDS","/search_ranges/"+code,"Do not apply an interval in a different physical unit");
            if(source.audited()&&engine!=null&&(!sameNumber(at(engine,"/lower"),defaults.lower(code))||!sameNumber(at(engine,"/upper"),defaults.upper(code))))c.add("ENGINE_DOMAIN_SOURCE_MISMATCH","FAIL","BOUNDS","/search_ranges/"+code,"Reported engine interval differs from inspected/loaded defaults");
            if(valid){double lo=((Number)at(x,"/lower")).doubleValue(),hi=((Number)at(x,"/upper")).doubleValue();
                relation=lo==defaults.lower(code)&&hi==defaults.upper(code)?"EQUAL_TO_DEFAULTS":lo>=defaults.lower(code)&&hi<=defaults.upper(code)?"NARROWER_THAN_DEFAULTS":"OUTSIDE_DEFAULT_DOMAIN";
                for(String domain:List.of("live_catalog_domain","engine_domain","approved_campaign_domain")){
                    Object allowed=at(h,"/search_ranges/"+code+"/"+domain+"/value");
                    if(!validRange(allowed))c.add("SUGGESTED_RANGE_SOURCE_UNAVAILABLE","UNKNOWN","BOUNDS","/search_ranges/"+code,"Suggested numeric range needs all required sourced domains");
                    else if(lo<((Number)at(allowed,"/lower")).doubleValue()||hi>((Number)at(allowed,"/upper")).doubleValue())c.add("SUGGESTED_RANGE_OUTSIDE_SOURCE","FAIL","BOUNDS","/search_ranges/"+code,"Suggested interval exceeds an allowed source domain");}
                if(code.equals("TTC_THRESHOLD")&&source.audited()){
                    Object parent=at(h,"/baseline/parameter_values/TTC_THRESHOLD/value");
                    if(finiteNonnegative(parent)){double value=((Number)parent).doubleValue();
                        double transformed=Math.min(3.5,Math.round((value+.1)*100.0)/100.0);
                        mutationRisk=value>=lo&&value<=hi&&(transformed<lo||transformed>hi);}
                }
            }else c.add("SUGGESTED_RANGE_UNKNOWN","UNKNOWN","BOUNDS","/search_ranges/"+code,"No approved numeric interval; engine defaults are not an approval");
            if(mutationRisk)c.add("PARENT_EQUALITY_MUTATION_ESCAPES_RANGE","UNSUPPORTED","BOUNDS","/search_ranges/"+code,"Inspected equality branch can leave the narrowed range; this is a static counterexample, not a proposed candidate");
            result.put(code,obj("unit",SearchRangeResolver.unit(code),"suggested_range",valid?x:unknownJson("SUGGESTED_RANGE_UNAVAILABLE"),
                    "loaded_default_range",obj("lower",defaults.lower(code),"upper",defaults.upper(code)),"domain_relation",relation,
                    "current_service_enforcement",source.audited()?"NOT_SUPPORTED":"UNKNOWN","parent_equality_mutation_risk",source.audited()?mutationRisk:unknownJson("CONSUMER_SOURCE_NOT_RECOGNIZED"),
                    "post_mutation_validation_required",true,"assessment_kind","STATIC_SOURCE_BOUNDARY_CHECK_NOT_OPTIMIZER_EXECUTION"));
        }return result;
    }
    private static boolean validRange(Object x){return finiteNonnegative(at(x,"/lower"))&&finiteNonnegative(at(x,"/upper"))&&((Number)at(x,"/lower")).doubleValue()<((Number)at(x,"/upper")).doubleValue();}
    private Map<String,Object> freshness(Artifact snapshot,Map<String,Object> h,List<Map<String,Object>> members,Checks c){
        if(!verified(snapshot,"vehicsim.consumer-freshness-snapshot/v1")){
            c.add("CURRENT_FRESHNESS_EVIDENCE_UNAVAILABLE","UNKNOWN","FRESHNESS","/dataset","No authorized read-only current-state export; do not infer freshness from a valid digest");
            return obj("status","UNKNOWN","reason_codes",List.of("CURRENT_FRESHNESS_EVIDENCE_UNAVAILABLE"),"database_checked",false);
        }
        Object data=snapshot.data();
        try{java.time.OffsetDateTime.parse(str(at(data,"/observed_at_utc")));}
        catch(RuntimeException e){c.add("FRESHNESS_TIMESTAMP_INVALID","FAIL","FRESHNESS","/dataset","Current export needs a recorded observation time; no invented TTL");}
        for(String field:List.of("project_id","baseline_version_id","selection_sha256","cohort_digest")){
            Object expected=switch(field){case "project_id"->at(h,"/dataset/project_id/value");case "baseline_version_id"->at(h,"/baseline/version_id/value");
                case "selection_sha256"->at(h,"/dataset/snapshot_digest/value");default->at(h,"/dataset/cohort_digest/value");};
            Object actual=at(data,"/"+field);
            if(actual==null||expected==null)c.add("FRESHNESS_IDENTITY_UNKNOWN","UNKNOWN","FRESHNESS","/dataset","Current export and handoff need the same explicit "+field);
            else if(!Objects.equals(actual,expected))c.add("STALE_BASELINE_OR_DATASET","FAIL","FRESHNESS","/dataset","Current "+field+" differs from frozen input");
        }
        for(var member:members)if(Arrays.asList("OPTIMIZATION","VALIDATION").contains(member.get("partition"))){
            String key=str(member.get("run_key"));Object current=at(data,"/members/"+key);
            for(String field:List.of("report_digest","artifact_digest","configuration_digest")){
                Object expected=at(member,field.equals("report_digest")?"/diagnostic_report_ref/value":"/"+field+"/value"),actual=at(current,"/"+field);
                if(actual==null||expected==null)c.add("CURRENT_MEMBER_DIGEST_UNKNOWN","UNKNOWN","FRESHNESS","/members","Current source digest missing; not defaulted from the archived handoff");
                else if(!Objects.equals(actual,expected))c.add("STALE_MEMBER_DIGEST","FAIL","FRESHNESS","/members","Current "+field+" differs for "+key);
            }
        }
        return obj("status",c.status("FRESHNESS"),"source_ref",new SourceRef(snapshot.id(),"").json(),"observed_at_utc",at(data,"/observed_at_utc"),
                "scope","AS_OF_SUPPLIED_EXPORT_ONLY","database_checked",false,"runtime_before_dispatch_recheck_required",true);
    }
    private Map<String,Object> probe(Artifact artifact,ConsumerSourceInspection.Profile source,Checks c){
        if(!verified(artifact,"vehicsim.consumer-parity-probe/v1")||!source.audited()||!semanticEquals(at(artifact.data(),"/source_hashes"),source.hashes())
                ||!"ACTUAL_JAVA_HELPER_TEST".equals(at(artifact.data(),"/execution_kind"))||!"SYNTHETIC_TEST_ONLY".equals(at(artifact.data(),"/evidence_scope"))
                ||!AnalysisMetrics.VERSION.equals(at(artifact.data(),"/aggregation_version"))
                ||List.of("OptimizationService","AnalysisService","AnalysisMetrics").stream().anyMatch(k->!hash(at(artifact.data(),"/loaded_class_sha256/"+k)))){
            c.add("CONSUMER_EXECUTION_PROBE_UNAVAILABLE","UNKNOWN","PROBE","/consumer_compatibility","Source analysis is not an execution proof; supply a hash-bound actual-helper test observation");
            return obj("status","UNKNOWN","source_contract_parity",source.audited()?"DIVERGENT":"UNKNOWN","reason_codes",List.of("CONSUMER_EXECUTION_PROBE_UNAVAILABLE"));
        }
        List<Map<String,Object>> cases=new ArrayList<>();Set<String> ids=new HashSet<>();
        List<Object> observations=list(at(artifact.data(),"/cases"));
        for(int index=0;index<observations.size();index++){Object raw=observations.get(index);String id=str(at(raw,"/id"));
            if(!text(id)||!ids.add(id)){c.add("PROBE_CASE_ID_INVALID","FAIL","PROBE","/consumer_compatibility","Probe IDs must be unique");continue;}
            try{List<AnalysisMetrics.Sample> samples=list(at(raw,"/samples")).stream().map(CanonicalAggregation::readSample).toList();
                Map<String,Object> actual=CanonicalAggregation.aggregate(samples);boolean canonicalMatch=semanticEquals(actual,at(raw,"/canonical"));
                if(!canonicalMatch)c.add("PROBE_CANONICAL_REPLAY_MISMATCH","FAIL","PROBE","/consumer_compatibility","Recorded canonical observation differs from the unchanged aggregator");
                Object consumer=at(raw,"/consumer_objectives");List<String> differences=new ArrayList<>();
                if(at(raw,"/consumer_exception")==null&&CanonicalObjectiveReader.KEYS.stream().anyMatch(k->!(at(consumer,"/"+k) instanceof Number n)||!Double.isFinite(n.doubleValue())))
                    c.add("PROBE_CONSUMER_OBSERVATION_MISSING","FAIL","PROBE","/consumer_compatibility","Observed consumer scalars must be finite, or an explicit helper exception must be recorded");
                for(String key:CanonicalObjectiveReader.KEYS){Object x=at(consumer,"/"+key),expected=at(actual,"/"+key+"/value");
                    if(!sameNumber(x,expected)||!"VALID".equals(at(actual,"/"+key+"/status")))differences.add(key);}
                if(at(raw,"/consumer_exception")!=null)differences.add("CONSUMER_HELPER_EXCEPTION");
                cases.add(obj("id",id,"execution_kind","SUPPLIED_ACTUAL_HELPER_TEST_OBSERVATION","canonical_replay",canonicalMatch?"MATCH":"MISMATCH",
                        "canonical",actual,"consumer_objectives",consumer,"consumer_exception",at(raw,"/consumer_exception"),"divergent_fields",differences,
                        "comparison",differences.isEmpty()?"SCALAR_MATCH_NOT_GENERAL_CONTRACT_PARITY":"DIVERGENT",
                        "source_ref",new SourceRef(artifact.id(),"/cases/"+index).json()));
            }catch(RuntimeException e){c.add("PROBE_CASE_INVALID","FAIL","PROBE","/consumer_compatibility","Invalid sample/number in parity observation");}
        }
        if(cases.isEmpty())c.add("PROBE_CASES_EMPTY","UNKNOWN","PROBE","/consumer_compatibility","No executed divergence cases supplied");
        return obj("status",c.status("PROBE"),"execution_scope","PURE_HELPER_TEST_NOT_CAMPAIGN_OR_RUNTIME_ATTESTATION","cases",cases,
                "source_ref",new SourceRef(artifact.id(),"").json(),"loaded_class_sha256",at(artifact.data(),"/loaded_class_sha256"),
                "source_binary_equivalence","Test harness recorded source and loaded class hashes; deployment equivalence remains UNKNOWN");
    }
    private List<Map<String,Object>> mapping(ConsumerSourceInspection.Profile p){
        List<Map<String,Object>> out=new ArrayList<>();
        for(String field:List.of("schema_version","design_revision","implementation_stage","analyzer_build_id","evidence_scope","handoff_id","created_at_utc","content_digest","digest_profile","core_contract","objective_contract","aggregation_version","source_registry","source_registry_ref"))
            mapField(out,"/"+field,"string or registry",null,"NO_CURRENT_REQUEST_FIELD","Preserve version/hash/provenance in future adapter",p,"OptimizationController","public record OptimizationRequest(");
        for(String field:List.of("snapshot_schema","snapshot_id","snapshot_digest","project_id","scenario_id","selection_status","baseline_current","cohort_digest","digest_profile","optimization_run_ids","validation_run_ids","requested_optimization_run_ids","requested_validation_run_ids","diagnostic_control_run_keys"))
            mapField(out,"/dataset/"+field,"EV or immutable identity list",null,field.equals("scenario_id")?"OptimizationRequest.scenarioId":"NOT_ACCEPTED",
                    "Scenario alone cannot express frozen cohorts or authorization/freshness",p,"OptimizationController","public record OptimizationRequest(");
        for(String field:List.of("member_id","run_key","run_id","variant_id","scenario_id","baseline_aeb_version_id","seed","replicate","attempt","mode","partition","requested_partition","case_roles","role_basis","role_evidence_refs","run_status","end_reason","simulator","dt","actual_parameters","artifact_digest","artifact_digest_profile","configuration_digest","diagnostic_report_ref","report_digest_profile","failure_evidence_refs","objective_evidence_refs","metric_provenance","objective_quality_decisions","eligibility"))
            mapField(out,"/members/*/"+field,"identity, EV or role/quality record",null,field.equals("variant_id")?"baselineMap key scenario_version_id":"NO_ENGINE_IDENTITY_SLOT",
                    "Preserve exact run/variant/seed tuple outside engine; do not collapse by variant",p,"OptimizationService","getOrCreateBaselineRuns(");
        Map<String,String> columns=Map.ofEntries(Map.entry("status","status + trace availability"),Map.entry("endReason","end_reason"),Map.entry("collision","collision_occurred"),
                Map.entry("falsePositive","is_false_positive"),Map.entry("falseNegative","is_false_negative"),Map.entry("verdict","verdict"),Map.entry("braked","brake_onset / metrics / aeb_activated tri-state inference"),
                Map.entry("jerk","rms_jerk_mps3"),Map.entry("impact","impact_speed_mps"),Map.entry("stopping","stopping_distance_m"));
        for(String field:new TreeSet<>(columns.keySet()))mapField(out,"/members/*/canonical_sample/"+field,"AnalysisMetrics.Sample component",null,"AnalysisService.sample: "+columns.get(field),
                "Legacy optimizer helper does not preserve the complete canonical Sample validity/denominator contract",p,"AnalysisService","public static AnalysisMetrics.Sample sample(");
        for(String code:BaselineBindingResolver.PARAMETERS.keySet()){
            mapField(out,"/baseline/parameter_values/"+code,"EV<number>",SearchRangeResolver.unit(code),"MoboTrial.params["+code+"] on actual completed candidate trials only",
                    "Baseline is context, not a fake MoboTrial; map named keys, not UI order",p,"MoboTrial","public record MoboTrial(");
            mapField(out,"/search_ranges/"+code,"SearchRange",SearchRangeResolver.unit(code),"Stored search_space; proposeCandidate uses defaults",
                    "Approved interval must be enforced before and after mutation in M2",p,"OptimizationService","new MoboEngine(ParameterBounds.defaults()");
        }
        for(String key:CanonicalObjectiveReader.KEYS)mapField(out,"/baseline_objectives/optimization/value/"+key,"Objective(value,samples,missing,notApplicable,unit,status)",
                key.equals("rms_jerk_mps3")?"m/s\u00b3":key.equals("impact_speed_mps")?"m/s":"m",
                "MoboTrial scalar for completed candidate observation, not BaselineStats",
                "Require exact canonical same-cohort aggregate; no missing/NA to numeric0 or helper rounding",p,"OptimizationService","private CandidateTrialMetrics evaluateCandidateRuns(");
        for(String branch:List.of("canonical_aggregation","baseline_objectives"))for(String partition:List.of("optimization","validation"))for(String key:CanonicalObjectiveReader.KEYS)
            for(String field:List.of("value","samples","missing","notApplicable","unit","status"))mapField(out,"/"+branch+"/"+partition+"/value/"+key+"/"+field,"Canonical Objective component",null,
                    field.equals("value")?"Only completed candidate trial scalar has an engine slot":"NO_SCALAR_ENGINE_SLOT",
                    partition.equals("validation")?"Sealed verification context, never fit GP/hints/ranges":"Keep canonical status/denominators before projecting a numeric candidate observation",p,"AnalysisMetrics","public static Map<String, Object> aggregate(");
        for(String field:List.of("project_id","identity_status","version_id","version_no","label","current","confirmed_as_v1","actual_config_matches_version","parameter_digest","evidence_refs","score_status"))mapField(out,"/baseline/"+field,"EV or baseline context",null,"Partial base_aeb_version_id lookup only",
                "Verify version/project/actual parameters/creation lineage and currentness",p,"OptimizationService","Row baseVersion = baseAebVersionId");
        for(String field:List.of("parameter_hints","failure_evidence","provenance","eligibility_manifest"))mapField(out,"/"+field,"review evidence",null,"NOT_ACCEPTED",
                "Evidence is context/quality, not a GP target or automatic parameter action",p,"OptimizationController","public record OptimizationRequest(");
        for(String field:List.of("simulator","fixed_delta_seconds","core_jar_sha256","core_source_commit","worker_sha256","scenario_runner_version","scenario_runner_sha256","calibration_refs","metric_aggregation_version","metric_source_hashes","parameter_catalog_ref","baseline_version_snapshot_ref","dataset_snapshot_ref","diagnostic_policy_version","formula_version","runtime_source_equivalence"))
            mapField(out,"/provenance/"+field,"EV, version or source-hash registry",field.equals("fixed_delta_seconds")?"s":null,"NO_ENGINE_PROVENANCE_SLOT",
                    "Pin/recheck source and metric vintage at the future execution boundary; never infer deployed runtime from source hash",p,"MoboTrial","public record MoboTrial(");
        return out;
    }
    private void mapField(List<Map<String,Object>> out,String path,String type,String unit,String target,String rule,ConsumerSourceInspection.Profile p,String source,String anchor){
        out.add(obj("handoff_path",path,"type",type,"unit",unit,"current_target",target,"current_acceptance",p.audited()?"NOT_DIRECTLY_CONSUMABLE":"UNKNOWN",
                "required_m2_mapping",rule,"source_refs",List.of(p.ref(source,anchor).json())));
    }
    private Map<String,Object> proposal(){return obj("status","DESIGN_ONLY_NOT_IMPLEMENTED","document","docs/failure-analysis-v3/M2_CHANGE_PLAN.md",
            "interface_spec",List.of("verifyCurrent(HandoffRef, AuthorizedCurrentSnapshot) -> VerifiedFrozenContext | Blocked",
                    "optimizationBindings(VerifiedFrozenContext) -> ordered RunBinding(runId,variantId,seed,replicate,attempt,baselineVersionId,hashes)",
                    "aggregateCompletedCandidate(ordered BoundCandidateResults) -> AnalysisMetrics aggregate + constraints, no dropped members",
                    "validateProposal(named four parameters, approved domains, post-mutation=true) -> ValidatedParameters | Rejected",
                    "sealedValidation(VerifiedFrozenContext) -> reviewer/verification-only handle, never optimizer training input"),
            "engine_boundary","Reuse List<MoboTrial> -> MoboEngine; only actual completed candidate vectors, no diagnostic JSON and no baseline trial0");}
    private List<Map<String,Object>> changes(){return List.of(
            obj("class","OptimizationController","methods",List.of("OptimizationRequest","createOptimization"),"action","Future authorized dataset/digest reference; keep existing API version behavior until opt-in"),
            obj("class","AnalysisService","methods",List.of("handoff","freeze","sample","digest"),"action","Reuse currentness/revision/semantic digest and canonical sample; version corrected metadata without archive rewrite"),
            obj("class","OptimizationService","methods",List.of("createAndStartRun","executeOptimization","getOrCreateBaselineRuns","evaluateCandidateRuns","computeStats","proposeCandidate","selectCandidateForVerification"),"action","Future exact cohort, canonical aggregation/baseline objectives, approved bounds and sealed verification; no optimizer algorithm rewrite"),
            obj("class","RegressionService","methods",List.of("createTest","latestBaselineRuns"),"action","Future explicit frozen validation run/variant/seed bindings; no latest-family substitution"),
            obj("class","RunService","methods",List.of("createOptimizationRuns","createRuns"),"action","Future composite binding list and exact seed pairing; no controller/simulator changes"),
            obj("class","MoboEngine/MoboTrial/ParameterBounds/AnalysisMetrics","methods",List.of("propose","valid","defaults","aggregate"),"action","KEEP algorithms and canonical metrics; validate finite/scoped data and supplied bounds in external M2 boundary"));}
    private List<Map<String,Object>> registry(Input input,Map<String,Map<String,Object>> original){
        Map<String,Map<String,Object>> out=new TreeMap<>(original);
        for(Artifact a:input.source().artifacts().values())out.put(a.id(),a.json());
        Artifact h=input.handoff();out.put(HANDOFF,obj("id",HANDOFF,"uri",h.uri(),"sha256",h.sha256(),"digest_profile","SHA256_BYTES","integrity",h.integrity().name(),"media_type",h.mediaType()));
        for(Artifact a:Arrays.asList(input.parityProbe(),input.freshness()))if(a!=null)out.put(a.id(),a.json());
        return new ArrayList<>(out.values());
    }
}
