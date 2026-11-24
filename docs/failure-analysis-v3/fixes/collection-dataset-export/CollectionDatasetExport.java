package com.vsos.backend.service.analysis;

import com.vsos.core.failureanalysis.*;
import com.vsos.core.evaluation.AnalysisMetrics;
import com.vsos.core.common.MiniJson;
import com.vsos.core.mobo.ParameterBounds;
import com.vsos.backend.repository.common.Row;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** One-off real collection export. Uses actual canonical and freeze predicates;
 * never writes DB, approves/fakes a frozen selection, or calls an optimizer.
 */
public final class CollectionDatasetExport {
    static final List<Long> OPT=List.of(2499L,2500L),VAL=List.of(2498L);
    static final Map<String,String> PROPOSAL=Map.of("2498","VALIDATION","2499","OPTIMIZATION","2500","OPTIMIZATION");
    static Map<String,Object> map(Object x){return x instanceof Map<?,?> m?new LinkedHashMap<>((Map<String,Object>)m):new LinkedHashMap<>();}
    static List<Object> list(Object x){return x instanceof List<?> l?new ArrayList<>(l):List.of();}
    static List<Object> rows(Object x){List<Object> out=new ArrayList<>();var columns=list(at(x,"/columns"));
        for(Object row:list(at(x,"/rows"))){var values=list(row);if(values.size()!=columns.size())throw new IllegalArgumentException("TABLE_WIDTH");
            Map<String,Object> item=new LinkedHashMap<>();for(int i=0;i<columns.size();i++)item.put(columns.get(i).toString(),values.get(i));out.add(item);}return out;}
    static void view(Map<String,Artifact> all,String name,String key,String uri,String pointer,Object data){
        String id="run:"+key+":"+name;
        all.put(name,new Artifact(id,key,uri+"#"+pointer,data==null?null:sha256(MiniJson.write(data)),"application/json",Integrity.UNVERIFIED,data,
            data==null?List.of(new Issue(Status.UNKNOWN,"SOURCE_MISSING",new SourceRef(id,""),"Not embedded; no authority inferred")):List.of()));
    }
    static Run run(Map<String,Object> raw,String uri,String pointer){
        String key=at(raw,"/dataset/identity/run_id").toString(),variant=at(raw,"/dataset/identity/variant_id").toString();Map<String,Artifact> a=new LinkedHashMap<>();
        view(a,"result",key,uri,pointer,raw);
        for(String name:List.of("frames","ground_truth"))view(a,name,key,uri,pointer+"/dataset/time_series/"+name,rows(at(raw,"/dataset/time_series/"+name)));
        view(a,"summary",key,uri,pointer+"/dataset/sensors/summary",at(raw,"/dataset/sensors/summary"));
        view(a,"collisions",key,uri,pointer+"/dataset/collisions/events",at(raw,"/dataset/collisions/events"));
        view(a,"bundle",key,uri,pointer+"/dataset/config",at(raw,"/dataset/config"));
        for(String name:List.of("lifecycle","vsos-core","environment","metadata","case_manifest","manifest"))view(a,name,key,uri,"/not-embedded/"+key+"/"+name,null);
        return new Run(key,variant,"embedded/"+variant,a,List.of());
    }
    public static Row exportedRow(Map<String,Object> raw){
        var m=map(at(raw,"/outcome/metrics"));var e=map(at(raw,"/evaluation/aeb_result"));var id=map(at(raw,"/dataset/identity"));
        Map<String,Object> row=obj("id",id.get("run_id"),"status","COMPLETED","end_reason",at(raw,"/outcome/end_reason"),
            "collision_occurred",m.get("collision"),"is_false_positive",e.get("false_activation"),"is_false_negative",e.get("missed_activation"),
            "verdict",e.get("verdict"),"aeb_activated",e.get("aeb_triggered"),"brake_onset",m.get("brake_onset_t"),
            "trace_frames",list(at(raw,"/outcome/frames")).size(),"min_distance_m",m.get("min_distance_m"),"min_ttc_s",m.get("min_ttc_s"));
        for(String k:CanonicalObjectiveReader.KEYS)row.put(k,m.get(k));return new Row(row);
    }
    static Object observedIdentity(Run run,Object raw,String field){Object v=at(raw,"/dataset/identity/"+field);
        if(v==null)return unknown("DECLARED_IDENTITY_MISSING",null).json();
        if(field.endsWith("_id"))v=v.toString();
        return value(v,Status.OBSERVED,null,null,List.of(run.ref("result","/dataset/identity/"+field)),"DECLARED_EXPORT_IDENTITY_NOT_AUTHORIZED_BINDING").json();
    }
    public static void main(String[] args)throws Exception{
        Path source=Path.of(args[0]).toRealPath(),output=Path.of(args[1]).toAbsolutePath(),repo=Path.of(args[2]).toRealPath();
        if(Files.exists(output))throw new IllegalArgumentException("Output exists");
        var budget=new BoundedInput(InputResourcePolicy.defaults());Map<String,Map<String,Object>> raw=new TreeMap<>();Map<String,Run> runs=new TreeMap<>();
        List<Object> collections=new ArrayList<>();List<Artifact> sources=new ArrayList<>();List<Object> sourceFiles=new ArrayList<>();
        for(String variant:List.of("1032","1033","1034")){
            Path path=source.resolve("vehicsim-variant-"+variant+"-collection.json");byte[] bytes=budget.read(path,path.toString());var collection=map(budget.parse(bytes,"application/json",path.toString()));
            if(!"vehicsim.run-collection/v1".equals(collection.get("format")))throw new IllegalArgumentException("COLLECTION_SCHEMA");
            collections.add(collection);sourceFiles.add(obj("filename",path.getFileName().toString(),"sha256_bytes",sha256(bytes),"size_bytes",bytes.length));
            sources.add(new Artifact("collection:"+variant,"external",path.toUri().toString(),sha256(bytes),"application/json",Integrity.UNVERIFIED,null,List.of()));
            int i=0;for(Object item:list(collection.get("runs"))){var doc=map(at(item,"/result"));String id=at(item,"/run_id").toString();
                if(raw.putIfAbsent(id,doc)!=null)throw new IllegalArgumentException("DUPLICATE_RUN_ID");
                if(!id.equals(at(doc,"/dataset/identity/run_id").toString()))throw new IllegalArgumentException("RUN_IDENTITY");
                runs.put(id,run(doc,path.toUri().toString(),"/runs/"+i+"/result"));i++;}
        }
        Map<String,Run> off=new HashMap<>();for(Run run:runs.values())if("OFF".equals(at(raw.get(run.runKey()),"/dataset/identity/aeb_mode")))off.put(run.caseKey(),run);
        Map<String,Map<String,Object>> reports=new TreeMap<>();List<MoboHandoffBuilder.MemberInput> inputs=new ArrayList<>();
        Map<String,AnalysisMetrics.Sample> samples=new TreeMap<>();List<Object> runManifest=new ArrayList<>();
        for(Run run:runs.values()){
            var doc=raw.get(run.runKey());String mode=at(doc,"/dataset/identity/aeb_mode").toString();
            var report=new DiagnosticReport().analyze(run,mode.equals("ON")?off.get(run.caseKey()):null);reports.put(run.runKey(),report);inputs.add(new MoboHandoffBuilder.MemberInput(run,report));
            Row row=exportedRow(doc);var sample=AnalysisService.sample(row);if(mode.equals("ON"))samples.put(run.runKey(),sample);
            Map<String,Object> objectives=new LinkedHashMap<>();new CanonicalObjectiveReader().read(run).forEach((k,v)->objectives.put(k,obj("canonical_value",v.canonicalValue().json(),"evaluation_copy",v.evaluationCopy().json(),"copy_agreement",v.copyAgreement(),"producer_state",at(doc,"/dataset/objectives/"+k+"/state"))));
            runManifest.add(obj("run_id",Long.valueOf(run.runKey()),"scenario_id",at(doc,"/dataset/identity/scenario_id"),"variant_id",Long.valueOf(run.caseKey()),
                "seed",at(doc,"/seed"),"aeb_mode",mode,"replicate",at(doc,"/dataset/identity/repetition"),"attempt",at(doc,"/dataset/identity/attempt"),
                "status_basis","COLLECTION_EXPORT_DECLARES_COMPLETED_NOT_LIVE_DB_CHECK","canonical_sample",mode.equals("ON")?CanonicalAggregation.sampleJson(sample):null,
                "legacy_outcome",at(doc,"/evaluation/outcome"),"analysis_service_outcome",AnalysisService.outcome(row),
                "physical_outcome",at(report,"/report/physical_outcome"),"recorded_objectives",objectives,
                "requested_partition",PROPOSAL.getOrDefault(run.runKey(),"DIAGNOSTIC_ONLY"),"diagnostic_report_ref","/collection_dataset/diagnostic_reports/"+run.runKey()));
        }
        for(String path:List.of("src/main/java/com/vsos/core/evaluation/AnalysisMetrics.java","src/main/java/com/vsos/backend/service/analysis/AnalysisService.java",
            "src/main/java/com/vsos/backend/controller/optimization/OptimizationController.java","src/main/java/com/vsos/backend/service/optimization/OptimizationService.java",
            "src/main/java/com/vsos/core/mobo/MoboEngine.java","src/main/java/com/vsos/core/mobo/ParameterBounds.java"))sources.add(HandoffSnapshots.source(repo.resolve(path),path));
        var built=new MoboHandoffBuilder().build(new MoboHandoffBuilder.Input(inputs,null,null,SearchRangeResolver.repositorySources(repo),
            HandoffSnapshots.source(repo.resolve("src/main/java/com/vsos/core/aeb/AebStack.java"),"aeb-mechanism-source"),sources));
        var result=new LinkedHashMap<>(built);List<Object> members=new ArrayList<>();
        for(Object item:list(built.get("members"))){var member=map(item);String id=member.get("run_key").toString();var doc=raw.get(id);var run=runs.get(id);
            for(String field:List.of("run_id","variant_id","scenario_id"))member.put(field,observedIdentity(run,doc,field));
            member.put("baseline_aeb_version_id",observedIdentity(run,doc,"aeb_version_id"));
            member.put("replicate",observedIdentity(run,doc,"repetition"));member.put("attempt",observedIdentity(run,doc,"attempt"));member.put("mode",observedIdentity(run,doc,"aeb_mode"));
            member.put("requested_partition",PROPOSAL.getOrDefault(id,"DIAGNOSTIC_ONLY"));member.put("identity_binding_basis","OBSERVED_DECLARED_EXPORT_NOT_AUTHORIZED_FROZEN_SELECTION");members.add(member);}
        result.put("members",members);var dataset=map(result.get("dataset"));
        dataset.put("project_id",observedIdentity(runs.get("2498"),raw.get("2498"),"project_id"));dataset.put("scenario_id",observedIdentity(runs.get("2498"),raw.get("2498"),"scenario_id"));
        dataset.put("requested_optimization_run_ids",OPT.stream().map(Object::toString).toList());dataset.put("requested_validation_run_ids",VAL.stream().map(Object::toString).toList());
        dataset.put("cohort_digest",new Value(HandoffSnapshots.digest(obj("selection_sha256",null,"members",members)),Status.DERIVED,null,null,List.of(),List.of(),"fa-cohort-content/1").json());result.put("dataset",dataset);
        List<AnalysisMetrics.Sample> opt=OPT.stream().map(x->samples.get(x.toString())).toList(),val=VAL.stream().map(x->samples.get(x.toString())).toList();
        List<Object> splits=new ArrayList<>();List<String> onKeys=new ArrayList<>(samples.keySet());
        for(int mask=1;mask<(1<<onKeys.size())-1;mask++){
            List<String> o=new ArrayList<>(),v=new ArrayList<>();for(int i=0;i<onKeys.size();i++)((mask&(1<<i))!=0?o:v).add(onKeys.get(i));
            boolean os=o.stream().map(raw::get).map(CollectionDatasetExport::exportedRow).map(AnalysisService::outcome).anyMatch("SAFE"::equals);
            boolean vs=v.stream().map(raw::get).map(CollectionDatasetExport::exportedRow).map(AnalysisService::outcome).anyMatch("SAFE"::equals);
            boolean objective=AnalysisMetrics.objectivesAvailable(o.stream().map(samples::get).toList()),complete=AnalysisMetrics.evidenceComplete(v.stream().map(samples::get).toList());
            splits.add(obj("optimization",o,"validation",v,"optimization_has_safe",os,"validation_has_safe",vs,"optimization_objectives_available",objective,"validation_evidence_complete",complete,"passes_available_freeze_predicates",os&&vs&&objective&&complete));
        }
        Map<String,Object> engineRanges=new LinkedHashMap<>();var bounds=ParameterBounds.defaults();for(String code:ParameterBounds.PARAM_KEYS)engineRanges.put(code,List.of(bounds.lower(code),bounds.upper(code)));
        result.put("project_id",4L);result.put("scenario_id",26L);result.put("base_aeb_version_id",33L);result.put("variant_ids",List.of(1032L,1033L,1034L));
        result.put("optimization_run_ids",OPT);result.put("validation_run_ids",VAL);result.put("diagnostic_control_run_ids",List.of(2510L,2511L,2512L));
        result.put("search_space",engineRanges);result.put("partition_status","PROPOSED_NOT_FROZEN");result.put("handoff_ready",false);
        result.put("collection_dataset",obj("extension_version","vehicsim.collection-dataset-export/1","content_status","ALL_SIX_SUPPLIED_RUNS_INCLUDED",
            "source_files",sourceFiles,"source_collections",collections,"run_manifest",runManifest,"diagnostic_reports",reports,
            "baseline_configuration",obj("declared_version_id",33L,"declared_project_id",4L,"actual_parameters",at(raw.get("2499"),"/dataset/config/aeb/params"),
                "version_snapshot",at(raw.get("2499"),"/dataset/config/aeb_version"),"verified_current_baseline",false),
            "proposed_selection",obj("optimization_run_ids",OPT,"validation_run_ids",VAL,"sealed",false,"review_status","NOT_REVIEWED",
                "basis","Two braked ON runs for optimization scalar availability; separate nonbraking ON variant for validation. Proposal only; actual SAFE gates fail.",
                "optimization_recorded_aggregate",CanonicalAggregation.aggregate(opt),"validation_recorded_aggregate",CanonicalAggregation.aggregate(val),
                "aggregate_usage","DESCRIPTIVE_PROPOSED_SELECTION_NOT_VERIFIED_BASELINE_SCORE",
                "all_variant_disjoint_nonempty_splits",splits),
            "search_space_basis",obj("kind","CURRENT_ENGINE_DEFAULTS_NOT_DIAGNOSTIC_HINT_OR_APPROVED_CAMPAIGN_DOMAIN","source",new SourceRef("src/main/java/com/vsos/core/mobo/ParameterBounds.java","ParameterBounds.defaults/DEFAULT").json(),"approved_narrowed_range",null),
            "view_mapping",obj("columns_rows","rows[i][j] mapped to object[columns[j]]; report locators refer to these views",
                "view_sha256","SHA256 of materialized MiniJson JSON bytes, not original result/CSV bytes; all input views UNVERIFIED",
                "mask_policy","Raw data retained; current diagnostic core does not automatically consume newly exported masks or clock declarations"),
            "operational_blockers",List.of("CURRENT_OPTIMIZATION_REQUEST_HAS_NO_DATASET_OR_COHORT_INPUT","ONLY_ONE_SAFE_RUN_UNDER_CURRENT_FREEZE_CLASSIFIER",
                "NO_NONEMPTY_VARIANT_DISJOINT_SPLIT_WITH_SAFE_IN_BOTH_SETS","RUN2500_LEGACY_SAFE_CONFLICTS_WITH_FALSE_ACTIVATION_TRUE",
                "COLLECTIONS_EXPLICITLY_UNSEALED","BASELINE_AUTHORITY_AND_CURRENTNESS_UNVERIFIED","APPROVED_OBJECTIVE_QUALITY_AND_SEARCH_DOMAIN_MISSING"),
            "execution",obj("dispatch_allowed",false,"optimizer_called",false,"database_accessed",false,"new_trials_generated",false)));
        result.put("content_digest",HandoffSnapshots.digest(result));
        Files.writeString(output,MiniJson.write(result)+System.lineSeparator(),StandardOpenOption.CREATE_NEW);
        System.out.println(MiniJson.write(obj("output",output.toString(),"runs",runs.size(),"optimization",OPT,"validation",VAL,"freeze_compatible_splits",splits.stream().filter(x->Boolean.TRUE.equals(at(x,"/passes_available_freeze_predicates"))).count(),"dispatch",false)));
    }
}
