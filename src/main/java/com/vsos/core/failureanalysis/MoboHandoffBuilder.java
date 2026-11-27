package com.vsos.core.failureanalysis;

import com.vsos.core.evaluation.AnalysisMetrics;
import java.time.Instant;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

/** Read-only M1C boundary. Normalized offline snapshots are not backend DTOs or an optimizer API. */
public final class MoboHandoffBuilder {
    public static List<String> schemaViolations(Map<String,Object> handoff){
        return HandoffSchemaValidator.validate(handoff).stream().map(v->v.code()+":"+v.path()).toList();
    }
    public static final String SCHEMA="vehicsim.failure-analysis-mobo-handoff/v1";
    public static final String BUILD="failure-analysis-m1c/1.0.1";
    public record MemberInput(Run run,Map<String,Object> evidenceReport,Map<String,Object> diagnosticReport,
                              Artifact baselineBinding,Artifact canonicalSample,Artifact mechanismReview){
        public MemberInput{Objects.requireNonNull(run);evidenceReport=immutable(evidenceReport);diagnosticReport=immutable(diagnosticReport);}
        public MemberInput(Run run,Map<String,Object> diagnosticReport){this(run,null,diagnosticReport,null,null,null);}
        Map<String,Object> report(){return diagnosticReport!=null?diagnosticReport:evidenceReport;}
    }
    public record Input(List<MemberInput> members,Artifact selection,Artifact qualityPolicy,
                        SearchRangeResolver.Domains domains,Artifact mechanismSource,List<Artifact> sourceArtifacts){
        public Input{members=List.copyOf(members);sourceArtifacts=List.copyOf(sourceArtifacts);}
    }
    private record Member(Map<String,Object> json,MemberInput input,String partition,String requestedPartition,
                          BaselineBindingResolver.Binding binding,AnalysisMetrics.Sample sample,boolean sampleBound,
                          boolean qualityReady,List<String> reasons,Map<String,Object> row){}
    @SuppressWarnings("unchecked") private static Map<String,Object> immutable(Map<String,Object> x){return x==null?null:(Map<String,Object>)freeze(x);}

    public Map<String,Object> build(Input input){
        List<String> global=new ArrayList<>();Artifact selection=input.selection(),policy=input.qualityPolicy();
        boolean selectionVerified=verified(selection,"vehicsim.failure-analysis-selection/v1");
        Object selected=selectionVerified?selection.data():null;
        boolean frozen=selectionVerified&&"FROZEN".equals(at(selected,"/selection_status"))&&Boolean.TRUE.equals(at(selected,"/reviewed"))
                &&Boolean.TRUE.equals(at(selected,"/baseline_current"))&&id(at(selected,"/snapshot_id"))&&id(at(selected,"/project_id"))
                &&id(at(selected,"/scenario_id"))&&id(at(selected,"/baseline_version_id"))&&cited(at(selected,"/review_refs"))
                &&Set.of("vehicsim.analysis-dataset/v2","vehicsim.fa-v3-sealed-dataset/v1").contains(Objects.toString(at(selected,"/snapshot_schema"),""))&&timestamp(at(selected,"/exported_at"));
        if(!frozen)global.add("REVIEWED_FROZEN_SELECTION_UNKNOWN");
        boolean policyApproved=verified(policy,"vehicsim.handoff-quality-policy/v1")&&selectionVerified
                &&"APPROVED".equals(at(policy.data(),"/status"))&&"MOBO_HANDOFF".equals(at(policy.data(),"/scope"))
                &&text(at(policy.data(),"/version"))&&Objects.equals(selection.sha256(),at(policy.data(),"/selection_sha256"))
                &&cited(at(policy.data(),"/approval_refs"))&&cited(at(policy.data(),"/constraint_refs"));
        if(!policyApproved)global.add("QUALITY_POLICY_UNAPPROVED_OR_SCOPE_MISMATCH");
        Map<String,Map<String,Object>> rows=new LinkedHashMap<>();
        for(Object raw:list(at(selected,"/members"))){Map<String,Object> row=map(raw);String key=str(row.get("run_key"));
            if(key==null||rows.putIfAbsent(key,row)!=null)global.add("DUPLICATE_OR_MISSING_SELECTION_RUN_KEY");}
        Set<String> keys=new HashSet<>();for(var m:input.members())if(!keys.add(m.run().runKey()))throw new IllegalArgumentException("DUPLICATE_INPUT_RUN_KEY");
        if(!keys.containsAll(rows.keySet()))global.add("SELECTED_MEMBER_INPUT_MISSING");
        List<Member> members=new ArrayList<>();for(var m:input.members())members.add(member(m,rows.get(m.run().runKey()),selection,policy,frozen,policyApproved));
        validateCohort(members,global);
        var scope=new SearchRangeResolver.Scope(str(at(selected,"/project_id")),str(at(selected,"/baseline_version_id")),selectionVerified?selection.sha256():null);
        Map<String,Object> ranges=new SearchRangeResolver().resolve(input.domains(),scope);
        if(ranges.values().stream().anyMatch(x->!"ELIGIBLE".equals(at(x,"/eligibility"))))global.add("APPROVED_SEARCH_DOMAIN_UNAVAILABLE");
        boolean structureReady=frozen&&global.stream().noneMatch(r->Set.of("DUPLICATE_OR_MISSING_SELECTION_RUN_KEY","SELECTED_MEMBER_INPUT_MISSING",
                "DUPLICATE_VARIANT_SEED","VARIANT_PARTITION_LEAKAGE","DUPLICATE_DATABASE_RUN","MIXED_BASELINE_PARAMETERS","MIXED_COHORT_PROVENANCE","OFF_REQUESTED_OPERATIONAL").contains(r));
        boolean baselineBound=structureReady&&members.stream().filter(MoboHandoffBuilder::operational).allMatch(m->m.sampleBound&&"PROJECT_BASELINE_CONFIRMED".equals(m.binding.identityStatus()));
        Map<String,Object> aggregation=new LinkedHashMap<>(),scores=new LinkedHashMap<>();boolean scoresAvailable=baselineBound&&policyApproved;
        for(String partition:List.of("OPTIMIZATION","VALIDATION")){
            List<Member> cohort=members.stream().filter(m->partition.equals(m.partition)).toList();String key=partition.toLowerCase(Locale.ROOT);
            boolean bound=structureReady&&!cohort.isEmpty()&&cohort.stream().allMatch(Member::sampleBound);
            Map<String,Object> aggregate=null;
            if(bound)try{aggregate=CanonicalAggregation.aggregate(cohort.stream().map(Member::sample).toList());}
            catch(IllegalArgumentException e){global.add("CANONICAL_AGGREGATE_NONFINITE");}
            aggregation.put(key,aggregate==null?unknownJson("CANONICAL_COHORT_IDENTITY_OR_SAMPLE_MISSING"):
                    derived(aggregate,AnalysisMetrics.VERSION,cohort.stream().map(m->new SourceRef(m.input.canonicalSample().id(),"/sample")).toList()));
            boolean numeric=aggregate!=null&&(partition.equals("OPTIMIZATION")?AnalysisMetrics.objectivesAvailable(cohort.stream().map(Member::sample).toList()):
                    AnalysisMetrics.evidenceComplete(cohort.stream().map(Member::sample).toList()));
            boolean quality=policyApproved&&!cohort.isEmpty()&&cohort.stream().allMatch(Member::qualityReady);
            boolean reviewedControl=cohort.stream().anyMatch(m->reviewedNonhazard(m,policy,policyApproved));
            if(!reviewedControl)global.add(partition+"_REVIEWED_NONHAZARD_CONTROL_MISSING");
            boolean available=baselineBound&&numeric&&quality&&reviewedControl;
            scoresAvailable&=available;scores.put(key,available?aggregation.get(key):unknownJson("BASELINE_SCORE_UNAVAILABLE"));
        }
        // A failed member never becomes an implicit smaller scoring cohort.
        if(!scoresAvailable){scores.replaceAll((k,v)->unknownJson("BASELINE_SCORE_UNAVAILABLE"));global.add("BASELINE_SCORE_UNAVAILABLE");}
        scores.put("availability",scoresAvailable?"KNOWN":"UNKNOWN");scores.put("source_dataset_digest",selectionVerified?observed(selection.sha256(),selection,"","sha256"):unknownJson("DATASET_SNAPSHOT_UNKNOWN"));
        List<Map<String,Object>> hints=new ArrayList<>();
        for(Member m:members)if(structureReady&&"OPTIMIZATION".equals(m.partition)&&m.input.diagnosticReport()!=null&&reportValid(m.input.diagnosticReport(),m.input.run())&&reportMatches(m.input.diagnosticReport(),m.input.run()))
            hints.addAll(new ParameterHintBuilder().build(m.input.diagnosticReport(),m.partition,m.input.mechanismReview(),input.mechanismSource()));
        List<Map<String,Object>> failureRefs=new ArrayList<>();for(Member m:members)failureRefs.add(new SourceRef("report:"+m.input.run().runKey(),"/report/failure_candidates").json());
        Map<String,Object> dataset=obj("snapshot_schema",selectionVerified?observed(at(selected,"/snapshot_schema"),selection,"/snapshot_schema",null):unknownJson("FROZEN_DATASET_MISSING"),
                "snapshot_id",selectionVerified?observed(at(selected,"/snapshot_id"),selection,"/snapshot_id",null):unknownJson("FROZEN_DATASET_MISSING"),
                "snapshot_digest",selectionVerified?observed(selection.sha256(),selection,"","sha256"):unknownJson("FROZEN_DATASET_MISSING"),
                "project_id",selectionVerified?observed(at(selected,"/project_id"),selection,"/project_id",null):unknownJson("PROJECT_BINDING_UNKNOWN"),
                "scenario_id",selectionVerified?observed(at(selected,"/scenario_id"),selection,"/scenario_id",null):unknownJson("SCENARIO_BINDING_UNKNOWN"),
                "selection_status",frozen?(structureReady?"FROZEN":"INVALID"):selection==null?"UNFROZEN":"UNKNOWN",
                "baseline_current",selectionVerified?observed(at(selected,"/baseline_current"),selection,"/baseline_current",null):unknownJson("BASELINE_CURRENTNESS_UNKNOWN"),
                "optimization_run_ids",runIds(members,"OPTIMIZATION"),"validation_run_ids",runIds(members,"VALIDATION"),
                "requested_optimization_run_ids",rows.values().stream().filter(r->"OPTIMIZATION".equals(r.get("partition"))).map(r->r.get("run_id")).toList(),
                "requested_validation_run_ids",rows.values().stream().filter(r->"VALIDATION".equals(r.get("partition"))).map(r->r.get("run_id")).toList(),
                "diagnostic_control_run_keys",members.stream().filter(m->"DIAGNOSTIC_ONLY".equals(m.partition)).map(m->m.input.run().runKey()).toList(),
                "digest_profile","fa-handoff-sorted-json/1");
        List<Map<String,Object>> manifest=members.stream().map(m->{Map<String,Object> json=new LinkedHashMap<>(m.json);
            if(operational(m)&&!global.isEmpty()){Map<String,Object> eligibility=new LinkedHashMap<>(map(json.get("eligibility")));
                eligibility.put(m.partition.toLowerCase(Locale.ROOT),"UNKNOWN");List<String> reasons=new ArrayList<>(m.reasons);reasons.addAll(global);
                eligibility.put("reason_codes",reasons.stream().distinct().toList());json.put("eligibility",eligibility);}return json;}).toList();
        dataset.put("cohort_digest",derived(digest(obj("selection_sha256",selectionVerified?selection.sha256():null,"members",manifest)),"fa-cohort-content/1",List.of()));
        Map<String,Object> out=obj("schema_version",SCHEMA,"design_revision","V3.1","implementation_stage","M1C","analyzer_build_id",BUILD,
                "evidence_scope",selectionVerified?Objects.toString(at(selected,"/evidence_scope"),"AUTHORIZED_EXPORT_AS_OF_SNAPSHOT"):"OFFLINE_UNBOUND",
                "handoff_id",UUID.randomUUID().toString(),"created_at_utc",Instant.now().toString(),"core_contract","vehicsim.failure-analysis/v1",
                "objective_contract","vehicsim.objective-analysis/v1","aggregation_version",AnalysisMetrics.VERSION,
                "source_registry_ref","/source_registry","dataset",dataset,"members",manifest,"baseline",baseline(members,scoresAvailable,structureReady),
                "canonical_aggregation",aggregation,"baseline_objectives",scores,"failure_evidence",failureRefs,"parameter_hints",hints,"search_ranges",ranges,
                "provenance",provenance(members,input),"eligibility_manifest",eligibility(members,global,scoresAvailable),
                "consumer_compatibility",obj("target","OptimizationService/MoboEngine","source_commit",sourceCommit(input.sourceArtifacts()),
                        "schema_acceptance","NOT_SUPPORTED","cohort_enforcement","NOT_SUPPORTED","aggregation_parity","DIVERGENT",
                        "bounds_enforcement","NOT_SUPPORTED","overall","NOT_DIRECTLY_CONSUMABLE",
                        "reason_codes",List.of("NO_V31_HANDOFF_INPUT","CURRENT_CONSUMER_RESELECTS_LATEST_RUNS","LEGACY_OPTIMIZER_AGGREGATION_DIFFERS","CUSTOM_STORED_BOUNDS_NOT_ENFORCED"),
                        "evidence_refs",input.sourceArtifacts().stream().filter(a->a.uri().endsWith("OptimizationService.java")||a.uri().endsWith("MoboEngine.java")).map(a->new SourceRef(a.id(),"").json()).toList()),
                "digest_profile","fa-handoff-sorted-json/1");
        out.put("source_registry",registry(input,members));out.put("content_digest",digest(out));return immutable(out);
    }

    private Member member(MemberInput input,Map<String,Object> suppliedRow,Artifact selection,Artifact policy,boolean frozen,boolean policyApproved){
        Run run=input.run();Map<String,Object> report=input.report();Map<String,Object> row=suppliedRow==null?Map.of():suppliedRow;
        List<String> reasons=new ArrayList<>();String requested=str(row.get("partition"));
        String partition=requested==null?"DIAGNOSTIC_ONLY":requested;
        if(!Set.of("OPTIMIZATION","VALIDATION","DIAGNOSTIC_ONLY","EXCLUDED","UNKNOWN").contains(partition)){partition="UNKNOWN";reasons.add("PARTITION_INVALID");}
        boolean off="OFF".equals(EvidenceReport.mode(run).value());if(off){partition="DIAGNOSTIC_ONLY";reasons.add("OFF_CONTROL_ONLY");}
        if(requested!=null&&!frozen)reasons.add("SELECTION_UNVERIFIED");
        if(suppliedRow==null)reasons.add("NO_REVIEWED_SELECTION_MEMBER");
        boolean validReport=reportValid(report,run)&&(input.evidenceReport()==null||reportValid(input.evidenceReport(),run));
        if(!validReport)reasons.add("REPORT_DIGEST_SCHEMA_OR_IDENTITY_INVALID");
        boolean reportMatches=validReport&&reportMatches(report,run)&&(input.evidenceReport()==null||reportMatches(input.evidenceReport(),run));
        if(!reportMatches)reasons.add("REPORT_RAW_ARTIFACT_OR_OBJECTIVE_MISMATCH");
        if(input.evidenceReport()!=null&&input.diagnosticReport()!=null&&!Objects.equals(at(input.evidenceReport(),"/input/seed/value"),at(report,"/input/seed/value")))reasons.add("REPORT_IDENTITY_CONFLICT");
        var binding=new BaselineBindingResolver().verify(run,input.baselineBinding());
        if(!"PROJECT_BASELINE_CONFIRMED".equals(binding.identityStatus()))reasons.add("BASELINE_IDENTITY_UNKNOWN_OR_CONFLICTING");
        Map<String,Object> actual=new TreeMap<>();BaselineBindingResolver.PARAMETERS.forEach((code,raw)->actual.put(code,run.read("result","/outcome/params/"+raw,SearchRangeResolver.unit(code),null).json()));
        Artifact sampleArtifact=input.canonicalSample();AnalysisMetrics.Sample sample=null;boolean sampleBound=false;
        if(verified(sampleArtifact,"vehicsim.canonical-sample-snapshot/v1")){
            Object data=sampleArtifact.data();
            boolean identity=Objects.equals(run.runKey(),at(data,"/run_key"))&&Objects.equals(run.artifact("result").sha256(),at(data,"/result_sha256"))
                    &&Objects.equals(at(report,"/content_digest"),at(data,"/report_digest"))&&Objects.equals(selection==null?null:selection.sha256(),at(data,"/selection_sha256"))
                    &&rowIdentity(run,row,binding)&&Objects.equals(str(row.get("run_id")),str(at(data,"/run_id")))
                    &&Objects.equals(at(report,"/content_digest"),row.get("report_digest"))
                    &&Objects.equals(str(binding.fields().get("project_id").value()),str(at(selection==null?null:selection.data(),"/project_id")))
                    &&Objects.equals(str(binding.fields().get("scenario_id").value()),str(at(selection==null?null:selection.data(),"/scenario_id")))
                    &&Objects.equals(str(binding.fields().get("version_id").value()),str(at(selection==null?null:selection.data(),"/baseline_version_id")));
            try{sample=CanonicalAggregation.readSample(at(data,"/sample"));}
            catch(IllegalArgumentException e){reasons.add(e.getMessage());}
            boolean projection=sample!=null&&sampleMatches(sample,run)&&Boolean.TRUE.equals(at(data,"/trace_available"));
            if(!projection)reasons.add("CANONICAL_SAMPLE_OR_TRACE_MISMATCH");
            boolean identityConflict=new EvidenceValidator().validate(run).stream().anyMatch(i->
                    (i.status()==Status.INVALID||i.status()==Status.CONFLICTING)&&(i.code().contains("IDENTITY")||i.code().equals("HASH_MISMATCH")||i.code().equals("CORE_HASH_DISAGREEMENT")
                            ||i.code().equals("RUN_METADATA_BINDING_UNRESOLVED")||i.code().equals("AEB_MODE_DISAGREEMENT")));
            if(identityConflict)reasons.add("EVIDENCE_IDENTITY_OR_HASH_CONFLICT");
            sampleBound=identity&&projection&&reportMatches&&!identityConflict&&"ON".equals(EvidenceReport.mode(run).value())&&"PROJECT_BASELINE_CONFIRMED".equals(binding.identityStatus());
            if(!identity)reasons.add("DATABASE_SAMPLE_IDENTITY_MISMATCH");
        }else reasons.add("AUTHORIZED_CANONICAL_SAMPLE_MISSING");
        boolean provenanceOk=provenanceValid(sampleArtifact,run);if(!provenanceOk)reasons.add("METRIC_PROFILE_OR_PROVENANCE_UNKNOWN_CONFLICTING");
        Map<String,Object> statuses=new LinkedHashMap<>(),decisions=new LinkedHashMap<>();boolean quality=true;
        for(String key:CanonicalObjectiveReader.KEYS){
            Object decision=policyApproved?at(policy.data(),"/members/"+run.runKey()+"/objectives/"+key):null;
            decisions.put(key,decision==null?unknownJson("OBJECTIVE_QUALITY_POLICY_UNKNOWN"):obj("decision",decision,"source_refs",List.of(new SourceRef(policy.id(),"/members/"+run.runKey()+"/objectives/"+key).json())));
            String status=str(at(decision,"/status"));boolean applicable=sample!=null&&(key.equals("impact_speed_mps")||!Boolean.FALSE.equals(sample.braked()));
            boolean accepted=policyApproved&&Objects.equals(at(decision,"/report_digest"),at(report,"/content_digest"))&&cited(at(decision,"/source_refs"));
            boolean allowed=accepted&&(applicable?"ELIGIBLE".equals(status):Arrays.asList("ELIGIBLE","NOT_APPLICABLE").contains(status))
                    &&calibrationAccepted(decision)&&supportedGate(at(decision,"/profile_verified"));
            if(sample!=null&&((AnalysisMetrics.Objective)AnalysisMetrics.aggregate(List.of(sample)).get(key)).missing()>0){
                allowed=false;reasons.add("CANONICAL_OBJECTIVE_INCOMPLETE:"+key);
            }
            if(!allowed)quality=false;
            statuses.put(key,off&&!key.equals("impact_speed_mps")?"NOT_APPLICABLE":!sampleBound||!provenanceOk?"UNKNOWN":allowed?status:accepted&&"EXCLUDED".equals(status)?"EXCLUDED":"UNKNOWN");
            if(!allowed)reasons.add("OBJECTIVE_QUALITY_UNRESOLVED:"+key);
        }
        if(!quality)reasons.add("OBJECTIVE_EVIDENCE_QUALITY_NOT_APPROVED");
        // An unresolved disagreement needs an explicit cited adjudication; a general approval cannot erase it.
        if(validReport&&!list(at(report,"/report/disagreements")).isEmpty()){
            Object resolution=policyApproved?at(policy.data(),"/members/"+run.runKey()+"/collision_adjudication"):null;
            if(!supportedGate(resolution)){quality=false;reasons.add("COLLISION_AUTHORITY_UNRESOLVED");statuses.put("impact_speed_mps","UNKNOWN");}
        }
        boolean rolesKnown=!list(row.get("case_roles")).isEmpty()&&list(row.get("case_roles")).stream().allMatch(role->
                Set.of("SAFE_CONTROL","HAZARD_ENCOUNTER","BOUNDARY","CAUTION_CANDIDATE").contains(Objects.toString(role,"")))
                &&Arrays.asList("DESIGN_INTENT","EVIDENCE_REVIEWED").contains(row.get("role_basis"));
        if(!rolesKnown)reasons.add("CASE_ROLE_REVIEW_UNKNOWN");
        boolean qualityReady=sampleBound&&provenanceOk&&quality&&frozen&&rolesKnown;
        String canonical=reportMatches?"ELIGIBLE":"UNKNOWN",eligible=off||partition.equals("EXCLUDED")||statuses.containsValue("EXCLUDED")?"EXCLUDED":
                !Arrays.asList("OPTIMIZATION","VALIDATION").contains(partition)?"UNKNOWN":qualityReady?"ELIGIBLE":"UNKNOWN";
        String opt=partition.equals("OPTIMIZATION")?eligible:"EXCLUDED",val=partition.equals("VALIDATION")?eligible:"EXCLUDED";
        if(!Arrays.asList("OPTIMIZATION","VALIDATION").contains(partition)&&!off)reasons.add("DIAGNOSTIC_ONLY_NOT_OPERATIONAL");
        Map<String,Object> json=obj("member_id",run.runKey(),"run_key",run.runKey(),"run_id",binding.fields().get("database_run_id").json(),
                "variant_id",binding.fields().get("variant_id").json(),"scenario_id",binding.fields().get("scenario_id").json(),
                "baseline_aeb_version_id",binding.fields().get("version_id").json(),"seed",run.read("result","/seed",null,null).json(),
                "replicate",replication(run,true),"attempt",replication(run,false),"mode",EvidenceReport.mode(run).json(),"partition",partition,"requested_partition",requested,
                "case_roles",list(row.get("case_roles")).isEmpty()?List.of("DIAGNOSTIC_ONLY"):list(row.get("case_roles")),
                "role_basis",row.getOrDefault("role_basis","UNKNOWN"),"role_evidence_refs",selection==null?List.of():List.of(new SourceRef(selection.id(),"/members").json()),
                "run_status",sample==null?unknownJson("DB_RUN_STATUS_UNKNOWN"):observed(sample.status(),sampleArtifact,"/sample/status",null),
                "end_reason",run.read("result","/outcome/end_reason",null,null).json(),"simulator",run.read("result","/simulator",null,null).json(),
                "dt",memberStep(run),"actual_parameters",actual,
                "artifact_digest",run.artifact("result").sha256()==null?unknownJson("ARTIFACT_HASH_MISSING"):observed(run.artifact("result").sha256(),run.artifact("result"),"","sha256"),
                "artifact_digest_profile","SHA256_BYTES","configuration_digest",hash(row.get("configuration_digest"))&&selection!=null?observed(row.get("configuration_digest"),selection,"/members","sha256"):unknownJson("CONFIGURATION_DIGEST_UNKNOWN"),
                "diagnostic_report_ref",validReport?value(at(report,"/content_digest"),Status.OBSERVED,null,null,List.of(new SourceRef("report:"+run.runKey(),"/content_digest"))).json():unknownJson("REPORT_UNVERIFIED"),
                "report_digest_profile","fa-report-sorted-json/1","failure_evidence_refs",List.of(new SourceRef("report:"+run.runKey(),"/report/failure_candidates").json()),
                "objective_evidence_refs",List.of(new SourceRef("report:"+run.runKey(),"/report/objectives").json()),
                "canonical_sample",sampleBound?CanonicalAggregation.sampleJson(sample):null,"metric_provenance",sampleArtifact==null?unknownJson("METRIC_PROVENANCE_UNKNOWN"):map(at(sampleArtifact.data(),"/provenance")),
                "objective_quality_decisions",decisions,
                "eligibility",obj("canonical_read",canonical,"optimization",opt,"validation",val,"objective_status",statuses,"reason_codes",reasons.stream().distinct().toList(),"capability_refs",List.of("READ_CANONICAL_OBJECTIVE")));
        if(JsonInputAdapter.supports(run)){
            Map<String,Object> declared=JsonInputAdapter.declaredIdentity(run);json.put("declared_identity",declared);
            // These are intake declarations, not a project baseline authorization or a GP sample.
            Map<String,String> fields=Map.of("run_id","run_id","variant_id","variant_id","scenario_id","scenario_id","baseline_aeb_version_id","aeb_version_id");
            fields.forEach((target,source)->{if(at(json.get(target),"/value")==null)json.put(target,declared.get(source));});
            Map<String,Object> recorded=new LinkedHashMap<>();var reader=new CanonicalObjectiveReader().read(run);
            for(String key:CanonicalObjectiveReader.KEYS){var objective=reader.get(key);recorded.put(key,obj("canonical_value",objective.canonicalValue().json(),"evaluation_copy",objective.evaluationCopy().json(),
                "copy_agreement",objective.copyAgreement(),"declared_metadata",run.get("result","/dataset/objectives/"+key),
                "declared_metadata_ref",run.ref("result","/dataset/objectives/"+key).json(),"aggregation_version",AnalysisMetrics.VERSION));}
            json.put("recorded_objectives",recorded);json.put("json_source",run.artifact("result").provenance());
        }
        return new Member(json,input,partition,requested,binding,sample,sampleBound,qualityReady,List.copyOf(reasons),row);
    }
    public static String configurationDigest(Run r){return digest(obj("case",r.get("result","/outcome/case"),"params",r.get("result","/outcome/params"),
            "seed",r.get("result","/seed"),"simulator",r.get("result","/simulator")));}
    private static boolean timestamp(Object x){try{java.time.OffsetDateTime.parse(str(x));return true;}catch(RuntimeException e){return false;}}
    private static boolean operational(Member m){return Arrays.asList("OPTIMIZATION","VALIDATION").contains(m.partition);}
    private static List<String> runIds(List<Member> members,String partition){return members.stream().filter(m->partition.equals(m.partition))
            .map(m->m.binding.fields().get("database_run_id").value()).filter(Objects::nonNull).map(Object::toString).toList();}
    private static boolean rowIdentity(Run run,Map<String,Object> row,BaselineBindingResolver.Binding binding){
        return id(row.get("run_id"))&&id(row.get("scenario_version_id"))&&hash(row.get("configuration_digest"))
                &&"fa-handoff-run-configuration/1".equals(row.get("configuration_digest_profile"))
                &&configurationDigest(run).equals(row.get("configuration_digest"))
                &&Objects.equals(run.artifact("result").sha256(),row.get("result_sha256"))
                &&Objects.equals(str(row.get("run_id")),str(binding.fields().get("database_run_id").value()))
                &&Objects.equals(str(row.get("scenario_version_id")),str(binding.fields().get("variant_id").value()))
                &&sameNumber(row.get("replicate"),at(replication(run,true),"/value"))&&sameNumber(row.get("attempt"),at(replication(run,false),"/value"))
                &&integer(row.get("seed"))&&sameNumber(row.get("seed"),run.get("result","/seed"));
    }
    private static boolean reportMatches(Map<String,Object> report,Run run){
        if(!sameNumber(at(report,"/input/seed/value"),run.get("result","/seed"))||!Objects.equals(at(report,"/input/simulator/value"),run.get("result","/simulator")))return false;
        boolean resultHash=list(at(report,"/input/artifacts")).stream().anyMatch(a->Objects.equals(at(a,"/id"),run.artifact("result").id())
                &&Objects.equals(at(a,"/sha256"),run.artifact("result").sha256())&&"VERIFIED".equals(at(a,"/integrity")));
        if(!resultHash)return false;
        var reader=new CanonicalObjectiveReader().read(run);
        for(String key:CanonicalObjectiveReader.KEYS){var objective=reader.get(key);
            if(!"MATCH".equals(objective.copyAgreement())||objective.canonicalValue().status()==Status.INVALID||objective.canonicalValue().status()==Status.CONFLICTING
                    ||!sameNumber(at(report,"/report/objectives/"+key+"/canonical_value/value"),objective.canonicalValue().value())
                    ||!Objects.equals(at(report,"/report/objectives/"+key+"/canonical_value/status"),objective.canonicalValue().status().name())
                    ||!Objects.equals(at(report,"/report/objectives/"+key+"/aggregation_version"),AnalysisMetrics.VERSION))return false;
        }return true;
    }
    private static boolean sampleMatches(AnalysisMetrics.Sample s,Run r){
        Object jerk=r.get("result","/outcome/metrics/rms_jerk_mps3"),stop=r.get("result","/outcome/metrics/stopping_distance_m");
        Boolean braked=CanonicalObjectiveReader.recordedBraking(r);
        return sameNumber(s.jerk(),jerk)&&sameNumber(s.impact(),r.get("result","/outcome/metrics/impact_speed_mps"))&&sameNumber(s.stopping(),stop)
                &&Objects.equals(s.collision(),r.get("result","/outcome/metrics/collision"))
                &&Objects.equals(s.collision(),r.get("result","/evaluation/aeb_result/collision"))
                &&Objects.equals(s.falsePositive(),r.get("result","/evaluation/aeb_result/false_activation"))
                &&Objects.equals(s.falseNegative(),r.get("result","/evaluation/aeb_result/missed_activation"))
                &&Objects.equals(s.verdict(),r.get("result","/evaluation/aeb_result/verdict"))
                &&Objects.equals(s.endReason(),r.get("result","/outcome/end_reason"))&&Objects.equals(s.braked(),braked)&&validTrace(r);
    }
    private static boolean validTrace(Run r){
        List<?> frames=list(r.get("result","/outcome/frames"));if(frames.isEmpty())return false;Double previous=null;
        for(Object f:frames){for(String k:List.of("t","ego_x","ego_v","ego_a","ped_x","ped_y","ped_vy")){
                Object v=at(f,"/"+k);if(!(v instanceof Number n)||!Double.isFinite(n.doubleValue()))return false;}
            double t=((Number)at(f,"/t")).doubleValue();if(t<0||previous!=null&&t<=previous||((Number)at(f,"/ego_v")).doubleValue()<0)return false;previous=t;}
        return true;
    }
    private static boolean provenanceValid(Artifact snapshot,Run r){
        if(!verified(snapshot,"vehicsim.canonical-sample-snapshot/v1"))return false;Object p=at(snapshot.data(),"/provenance");
        boolean database=JsonInputAdapter.supports(r)&&"PERSISTED_CANONICAL_RESULT".equals(at(p,"/provenance_scope"));
        var descriptor=MetricProvenanceResolver.descriptor(r);
        Object expectedDt=database?descriptor.dt():r.get("result","/outcome/case/carla/fixed_delta_seconds");
        if(!AnalysisMetrics.VERSION.equals(at(p,"/aggregation_version"))||!"SIMULATOR_RESULT".equals(at(p,"/metric_source"))
                ||!Objects.equals(at(p,"/simulator"),r.get("result","/simulator"))||!Objects.equals(at(p,"/producer"),r.get("result","/engine"))
                ||!sameNumber(at(p,"/dt"),expectedDt)||!finiteNonnegative(at(p,"/dt"))
                ||((Number)at(p,"/dt")).doubleValue()==0||!id(at(p,"/vehicle_id")))return false;
        if(database){
            Object identity=r.get("result","/dataset/identity"),db=at(p,"/database_source");
            if(!descriptor.supported()||r.artifact("result").integrity()!=Integrity.VERIFIED
                    ||!Objects.equals(r.artifact("result").sha256(),at(r.artifact("result").provenance(),"/independently_expected_container_sha256"))
                    ||!Objects.equals(r.artifact("result").sha256(),at(db,"/source_sha256"))||!text(at(db,"/source_id"))
                    ||!Boolean.TRUE.equals(at(p,"/canonical_targets_only"))||!Boolean.TRUE.equals(at(p,"/calibration_not_applicable"))
                    ||!cited(at(p,"/canonical_review_refs")))return false;
            for(String key:List.of("project_id","run_id","attempt"))if(!Objects.toString(at(identity,"/"+key)).equals(Objects.toString(at(db,"/"+key))))return false;
            Object jar=r.get("result","/dataset/provenance/core_jar_sha256"),binary=r.get("result","/dataset/provenance/core_bytecode_sha256"),commit=r.get("result","/dataset/provenance/git_commit");
            if(!hash(jar)&&!hash(binary)||!text(commit)||!Objects.equals(commit,at(p,"/core_source_commit"))
                    ||!Objects.equals(jar,at(p,"/core_jar_sha256"))||!Objects.equals(binary,at(p,"/core_bytecode_sha256")))return false;
        }else{
            for(String key:List.of("core_jar_sha256","worker_sha256","scenario_runner_sha256"))if(!hash(at(p,"/"+key)))return false;
            if(!text(at(p,"/core_source_commit"))||!text(at(p,"/scenario_runner_version"))||!cited(at(p,"/source_refs")))return false;
            Object jar=r.get("lifecycle","/core/sha256"),commit=r.get("environment","/git_commit");
            if(jar==null||commit==null||!Objects.equals(jar,at(p,"/core_jar_sha256"))||!Objects.equals(commit,at(p,"/core_source_commit")))return false;
            if(r.artifact("vsos-core")!=null&&!Objects.equals(r.artifact("vsos-core").sha256(),at(p,"/core_jar_sha256")))return false;
        }
        if(!list(at(p,"/metric_source_hashes")).stream().allMatch(x->text(at(x,"/path"))&&hash(at(x,"/sha256"))&&text(at(x,"/commit")))
                ||list(at(p,"/metric_source_hashes")).isEmpty())return false;
        for(String key:CanonicalObjectiveReader.KEYS){Object profile=at(p,"/objectives/"+key);
            if(!text(at(profile,"/signal"))||!text(at(profile,"/filter"))||!text(at(profile,"/window"))||!cited(at(profile,"/source_refs")))return false;}
        var resolved=new MetricProvenanceResolver().resolve(r);
        if(!resolved.issues().isEmpty())return false;
        for(String key:CanonicalObjectiveReader.KEYS){var lineage=new MetricProvenanceResolver().objectiveLineage(resolved,key);
            for(String field:List.of("signal","filter","window")){Value raw=lineage.get(field);Object declared=at(p,"/objectives/"+key+"/"+field);
                if(raw.status()==Status.INVALID||raw.status()==Status.CONFLICTING)return false;
                if(raw.value()!=null&&!Objects.equals(raw.value(),declared))return false;}}
        return true;
    }
    private static Object replication(Run r,boolean rep){
        if(JsonInputAdapter.supports(r))return JsonInputAdapter.declaredIdentity(r).get(rep?"repetition":"attempt");
        var m=java.util.regex.Pattern.compile("/rep(\\d+)_a(\\d+)$").matcher(r.directory());
        return m.find()?new Value(Long.valueOf(m.group(rep?1:2)),Status.DERIVED,null,null,List.of(r.ref("result","")),List.of(),"fa-artifact-directory-replication/1").json():unknownJson("REPLICATION_IDENTITY_UNKNOWN");
    }
    private static Map<String,Object> memberStep(Run run){
        var descriptor=MetricProvenanceResolver.descriptor(run);
        if(JsonInputAdapter.supports(run)&&descriptor.supported()&&!descriptor.carla())
            return new MetricProvenanceResolver().resolve(run).fields().get("dt").json();
        return run.read("result","/outcome/case/carla/fixed_delta_seconds","s",null).json();
    }
    private static boolean reviewedNonhazard(Member m,Artifact policy,boolean approved){
        Object v=approved?at(policy.data(),"/members/"+m.input.run().runKey()+"/nonhazard_review"):null;
        // Review attestation is separate from physical outcome; never overwrites Core UNKNOWN to SAFE.
        return "EVIDENCE_REVIEWED".equals(m.row.get("role_basis"))&&list(m.row.get("case_roles")).contains("SAFE_CONTROL")
                &&"REVIEWED_NONHAZARD".equals(at(v,"/status"))&&Objects.equals(at(v,"/report_digest"),at(m.input.report(),"/content_digest"))&&cited(at(v,"/source_refs"));
    }
    private static boolean calibrationAccepted(Object decision){
        String scope=str(at(decision,"/calibration_applicability"));
        if("NOT_APPLICABLE".equals(scope))return cited(at(decision,"/calibration_basis_refs"));
        return "IN_DOMAIN".equals(scope)&&!list(at(decision,"/calibration_refs")).isEmpty()
                &&list(at(decision,"/calibration_refs")).stream().allMatch(c->text(at(c,"/id"))&&text(at(c,"/version"))&&hash(at(c,"/artifact_sha256"))&&cited(at(c,"/source_refs")));
    }
    private static void validateCohort(List<Member> members,List<String> reasons){
        Set<String> pairs=new HashSet<>(),runs=new HashSet<>(),opt=new HashSet<>(),val=new HashSet<>(),contexts=new HashSet<>(),params=new HashSet<>();
        if(members.stream().anyMatch(m->"OFF".equals(EvidenceReport.mode(m.input.run()).value())&&Arrays.asList("OPTIMIZATION","VALIDATION").contains(m.requestedPartition)))reasons.add("OFF_REQUESTED_OPERATIONAL");
        for(Member m:members)if(operational(m)){
            Object variant=m.binding.fields().get("variant_id").value(),runId=m.binding.fields().get("database_run_id").value();
            if(variant!=null){String id=variant.toString();if(!pairs.add(id+"|"+m.input.run().get("result","/seed")))reasons.add("DUPLICATE_VARIANT_SEED");
                (m.partition.equals("OPTIMIZATION")?opt:val).add(id);}
            if(runId!=null&&!runs.add(runId.toString()))reasons.add("DUPLICATE_DATABASE_RUN");
            params.add(digest(obj("params",m.input.run().get("result","/outcome/params"))));
            Object provenance=m.input.canonicalSample()==null?null:at(m.input.canonicalSample().data(),"/provenance");
            contexts.add(digest(obj("project",m.binding.fields().get("project_id").value(),"scenario",m.binding.fields().get("scenario_id").value(),
                    "version",m.binding.fields().get("version_id").value(),"provenance",provenance==null?null:context(provenance))));
        }
        if(opt.stream().anyMatch(val::contains))reasons.add("VARIANT_PARTITION_LEAKAGE");
        if(params.size()>1)reasons.add("MIXED_BASELINE_PARAMETERS");if(contexts.size()>1)reasons.add("MIXED_COHORT_PROVENANCE");
    }
    private static Map<String,Object> context(Object p){Map<String,Object> out=new TreeMap<>();
        for(String k:List.of("simulator","producer","dt","vehicle_id","core_jar_sha256","core_bytecode_sha256","provenance_scope","core_source_commit","worker_sha256","scenario_runner_version","scenario_runner_sha256","aggregation_version","objectives"))out.put(k,at(p,"/"+k));
        // Per-run locators differ; the metric definitions must not.
        Map<String,Object> defs=new TreeMap<>();for(String key:CanonicalObjectiveReader.KEYS){Object def=at(p,"/objectives/"+key);defs.put(key,obj("signal",at(def,"/signal"),"filter",at(def,"/filter"),"window",at(def,"/window")));}
        out.put("objectives",defs);return out;}
    private static Map<String,Object> baseline(List<Member> members,boolean scoreKnown,boolean structureReady){
        List<Member> operational=members.stream().filter(MoboHandoffBuilder::operational).toList();
        boolean bound=structureReady&&!operational.isEmpty()&&operational.stream().allMatch(m->m.sampleBound&&"PROJECT_BASELINE_CONFIRMED".equals(m.binding.identityStatus()))
                &&operational.stream().map(m->m.binding.fields().get("version_id").value()).distinct().count()==1;
        Map<String,Object> out=obj("identity_status",bound?"PROJECT_BASELINE_CONFIRMED":"UNKNOWN");
        for(String k:List.of("version_id","version_no","label","project_id","confirmed_as_v1","current"))out.put(k,bound?operational.getFirst().binding.fields().get(k).json():unknownJson("BASELINE_ID_UNCONFIRMED"));
        Map<String,Object> parameters=new TreeMap<>();for(String code:BaselineBindingResolver.PARAMETERS.keySet()){
            Artifact a=bound?operational.getFirst().input.baselineBinding():null;
            parameters.put(code,a==null?unknown("BASELINE_PARAMETER_BINDING_UNKNOWN",SearchRangeResolver.unit(code)).json():observed(at(a.data(),"/parameters/"+code),a,"/parameters/"+code,SearchRangeResolver.unit(code)));}
        out.put("parameter_values",parameters);out.put("actual_config_matches_version",bound?value(true,Status.OBSERVED,null,null,List.of(new SourceRef(operational.getFirst().input.baselineBinding().id(),"/parameters"))).json():unknownJson("CONFIG_VERSION_BINDING_UNKNOWN"));
        out.put("parameter_digest",bound?derived(digest(parameters),"fa-bound-parameter-digest/1",List.of(new SourceRef(operational.getFirst().input.baselineBinding().id(),"/parameters"))):unknownJson("PARAMETER_DIGEST_UNKNOWN"));
        out.put("evidence_refs",operational.stream().filter(m->m.input.baselineBinding()!=null).map(m->new SourceRef(m.input.baselineBinding().id(),"").json()).toList());
        out.put("score_status",scoreKnown?"AVAILABLE":"UNAVAILABLE");return out;
    }
    private static Map<String,Object> provenance(List<Member> members,Input input){
        Map<String,Object> out=obj("metric_aggregation_version",AnalysisMetrics.VERSION,"diagnostic_policy_version","fa-diagnosis/1.0.0","formula_version","fa-formula/3.0.0",
                "runtime_source_equivalence",unknownJson("RUNTIME_SOURCE_EQUIVALENCE_UNVERIFIED"),
                "metric_source_hashes",input.sourceArtifacts().stream().map(a->obj("path",a.uri(),"sha256",a.sha256(),"commit",sourceCommit(input.sourceArtifacts()))).toList(),
                "parameter_catalog_ref",input.domains()==null||input.domains().catalogSource()==null?unknownJson("CATALOG_SOURCE_MISSING"):observed(input.domains().catalogSource().id(),input.domains().catalogSource(),"",null),
                "dataset_snapshot_ref",input.selection()==null?unknownJson("DATASET_SNAPSHOT_UNKNOWN"):observed(input.selection().id(),input.selection(),"",null),
                "baseline_version_snapshot_ref",unknownJson("NO_SINGLE_DATASET_BASELINE_EXPORT"),"calibration_refs",List.of());
        List<Object> calibration=new ArrayList<>();for(Member m:members)for(Object decision:map(m.json.get("objective_quality_decisions")).values())
            calibration.addAll(list(at(decision,"/decision/calibration_refs")));
        out.put("calibration_refs",calibration.stream().distinct().toList());
        for(String field:List.of("simulator","fixed_delta_seconds","core_jar_sha256","core_source_commit","worker_sha256","scenario_runner_version","scenario_runner_sha256")){
            String raw=field.equals("fixed_delta_seconds")?"dt":field;List<Member> known=members.stream().filter(m->m.input.canonicalSample()!=null&&provenanceValid(m.input.canonicalSample(),m.input.run())).toList();
            List<Object> values=known.stream().map(m->at(m.input.canonicalSample().data(),"/provenance/"+raw)).distinct().toList();
            if(known.size()==members.size()&&values.size()==1)out.put(field,observed(values.getFirst(),known.getFirst().input.canonicalSample(),"/provenance/"+raw,raw.equals("dt")?"s":null));
            else{
                String lineage=switch(raw){case "simulator"->"simulator_profile";case "core_jar_sha256"->"core_sha256";case "core_source_commit"->"source_revision";case "dt"->"dt";default->null;};
                List<Value> claims=lineage==null?List.of():members.stream().map(m->new MetricProvenanceResolver().resolve(m.input.run()).fields().get(lineage)).toList();
                boolean complete=!claims.isEmpty()&&claims.stream().allMatch(v->v.value()!=null&&v.status()==Status.OBSERVED)&&claims.stream().map(Value::value).distinct().count()==1;
                out.put(field,complete?value(claims.getFirst().value(),Status.OBSERVED,raw.equals("dt")?"s":null,null,claims.stream().flatMap(v->v.sourceRefs().stream()).distinct().toList()).json():unknownJson("COHORT_PROVENANCE_UNKNOWN_OR_MIXED"));
            }}
        return out;
    }
    private static Object sourceCommit(List<Artifact> artifacts){return artifacts.stream().map(a->at(a.data(),"/source_commit")).filter(Objects::nonNull).distinct().reduce((a,b)->Objects.equals(a,b)?a:"CONFLICTING").orElse("UNKNOWN");}
    private static Map<String,Object> eligibility(List<Member> members,List<String> global,boolean scoresAvailable){
        List<String> opt=new ArrayList<>(),val=new ArrayList<>();List<Map<String,Object>> excluded=new ArrayList<>(),unknowns=new ArrayList<>();
        boolean cohortBlocked=!global.isEmpty();
        for(Member m:members){
            boolean excludedMember="OFF".equals(EvidenceReport.mode(m.input.run()).value())||m.partition.equals("EXCLUDED")
                    ||map(at(m.json,"/eligibility/objective_status")).containsValue("EXCLUDED");
            boolean ready=operational(m)&&m.qualityReady&&!cohortBlocked;
            if(ready)(m.partition.equals("OPTIMIZATION")?opt:val).add(m.input.run().runKey());
            else{List<String> reasons=new ArrayList<>(m.reasons);if(operational(m))reasons.addAll(global);if(reasons.isEmpty())reasons.add("MEMBER_NOT_OPERATIONAL");
                (excludedMember?excluded:unknowns).add(obj("member_id",m.input.run().runKey(),"partition",m.partition,"objective_key",null,
                        "reason_codes",reasons.stream().distinct().toList(),"evidence_refs",List.of(new SourceRef("report:"+m.input.run().runKey(),"/report/objectives").json())));}}
        int requested=members.size();return obj("profile_version","fa-handoff-eligibility/1","requested_member_ids",members.stream().map(m->m.input.run().runKey()).toList(),
                "optimization_eligible",opt,"validation_eligible",val,"excluded",excluded,"unknown",unknowns,
                "counts",obj("requested",requested,"optimization_eligible",opt.size(),"validation_eligible",val.size(),"excluded",excluded.size(),"unknown",unknowns.size()),
                "baseline_score_status",scoresAvailable?"AVAILABLE":"UNAVAILABLE","overall",global.isEmpty()?"READY_FOR_REVIEW":"BLOCKED",
                "consumer_dispatch_allowed",false,"reason_codes",global.stream().distinct().toList());
    }
    private static List<Map<String,Object>> registry(Input input,List<Member> members){
        Map<String,Map<String,Object>> out=new TreeMap<>();List<Artifact> artifacts=new ArrayList<>(input.sourceArtifacts());
        for(Artifact a:Arrays.asList(input.selection(),input.qualityPolicy(),input.mechanismSource()))if(a!=null)artifacts.add(a);
        if(input.domains()!=null)artifacts.addAll(input.domains().artifacts());
        for(Member m:members){artifacts.addAll(m.input.run().artifacts().values());
            for(Artifact a:Arrays.asList(m.input.baselineBinding(),m.input.canonicalSample(),m.input.mechanismReview()))if(a!=null)artifacts.add(a);
            Map<String,Object> report=m.input.report();if(report!=null)register(out,obj("id","report:"+m.input.run().runKey(),"uri","sidecar:"+m.input.run().runKey(),
                    "sha256",report.get("content_digest"),"digest_profile","fa-report-sorted-json/1","media_type","application/json","integrity",reportValid(report,m.input.run())?"VERIFIED":"FAILED"));
            for(Object a:list(at(report,"/input/artifacts")))register(out,map(a));}
        for(Artifact a:artifacts)register(out,a.json());return new ArrayList<>(out.values());
    }
    private static void register(Map<String,Map<String,Object>> registry,Map<String,Object> artifact){
        String id=str(artifact.get("id"));if(id==null)throw new IllegalArgumentException("REGISTRY_ARTIFACT_ID_MISSING");
        Map<String,Object> previous=registry.putIfAbsent(id,artifact);
        if(previous!=null&&!Objects.equals(previous.get("sha256"),artifact.get("sha256")))throw new IllegalArgumentException("REGISTRY_ID_HASH_CONFLICT:"+id);
    }
}
