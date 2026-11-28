package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import com.vsos.core.evaluation.AnalysisMetrics;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

/** Fabricated test exports only. These IDs, approvals and scores have no operational authority. */
final class M1CFixture {
    static final String COMMIT="a".repeat(40),CORE="b".repeat(64);
    record Cohort(MoboHandoffBuilder.Input input,List<Map<String,Object>> reports) {}
    static Artifact artifact(String id,Object data){return new Artifact(id,"SYNTHETIC_TEST_ONLY","synthetic:"+id,sha256(MiniJson.write(data)),
            "application/json",Integrity.VERIFIED,data,List.of());}
    static Map<String,Object> gate(String ref){return value(true,Status.OBSERVED,null,null,List.of(new SourceRef(ref,"/synthetic_evidence"))).json();}
    static List<Map<String,Object>> refs(String ref){return List.of(new SourceRef(ref,"/synthetic_evidence").json());}
    static List<AnalysisMetrics.Sample> samples(){return List.of(sample(true,true,2.,6.,10.),sample(true,false,4.,null,20.),sample(false,false,null,null,null));}
    static AnalysisMetrics.Sample sample(Boolean braked,Boolean collision,Double jerk,Double impact,Double stop){return new AnalysisMetrics.Sample("COMPLETED","TARGET_CLEARED",collision,false,false,"PASS",braked,jerk,impact,stop);}
    static Cohort create() throws Exception{return create(new int[]{201,202,203,204},new long[]{1,1,1,2},-1,false);}
    static Cohort create(int[] variants,long[] seeds,int off,boolean mixed) throws Exception {
        return create(variants,seeds,off,mixed,false);
    }
    static Cohort create(int[] variants,long[] seeds,int off,boolean mixed,boolean missingJerk) throws Exception {
        return create(variants,seeds,off,mixed,missingJerk,false);
    }
    static Cohort create(int[] variants,long[] seeds,int off,boolean mixed,boolean missingJerk,boolean collisionBeforeCommand) throws Exception {
        List<Run> runs=new ArrayList<>();List<Artifact> bindings=new ArrayList<>();List<Map<String,Object>> reports=new ArrayList<>(),rows=new ArrayList<>();
        List<AnalysisMetrics.Sample> samples=new ArrayList<>(samples());samples.add(sample(false,false,null,null,null));
        if(missingJerk)samples.set(0,sample(true,true,null,6.,10.));
        if(collisionBeforeCommand)samples.set(0,sample(false,true,null,6.,null));
        for(int i=0;i<4;i++){
            var sample=samples.get(i);String key="SYNTHETIC-"+(i+1)+"-R1";Map<String,Object> metrics=obj("collision",sample.collision(),"rms_jerk_mps3",sample.jerk(),
                    "impact_speed_mps",sample.impact(),"stopping_distance_m",sample.stopping(),"brake_onset_t",sample.braked()?1.:null,"aeb_decision_t",sample.braked()?.75:null,"t_aeb_s",sample.braked()?1.:null,
                    "first_detection_t",sample.braked()?.5:null);
            Map<String,Object> evaluation=new LinkedHashMap<>(metrics);evaluation.putAll(obj("aeb_triggered",collisionBeforeCommand && i==0 || sample.braked(),"false_activation",false,"missed_activation",false,"verdict","PASS"));
            Map<String,Object> params=obj("ttc_threshold",mixed&&i==1?.6:1.5,"brake_activation_delay",.15,"max_deceleration",8.,"brake_buildup_rate",20.);
            Map<String,Object> filter=obj("type","butterworth","order_per_pass",6,"cutoff_hz",10,"passes","forward + backward (zero phase)");
            Map<String,Object> result=obj("format","vehicsim.result/v1","simulator","carla-0.9.16-xosc15","engine","vsos-core-java/1","seed",seeds[i],
                    "source",obj("run_id",100+i,"scenario_id",1,"scenario_version_id",variants[i],"aeb_version_id",10),
                    "outcome",obj("end_reason","TARGET_CLEARED","duration_s",2.,"params",params,"metrics",metrics,
                            "case",obj("aeb_mode",i==off?"OFF":"ON","road_friction",.8,"carla",obj("fixed_delta_seconds",.01,
                                    "jerk_filtered",obj("signal","ego_a","filter",filter,"window","T_AEB to end of run"))),
                            "frames",List.of(frame(0.),frame(.01))),"evaluation",obj("aeb_result",evaluation));
            Map<String,Artifact> artifacts=new LinkedHashMap<>();
            Map<String,Object> raw=obj("result",result,"bundle",obj("vehicle",obj("length_m",4.75,"width_m",1.93)),"environment",obj("git_commit",COMMIT),
                    "lifecycle",obj("core",obj("sha256",CORE)),"frames",List.of(),"ground_truth",List.of(),"collisions",List.of(),"summary",obj(),
                    "metadata",List.of(),"manifest",List.of(),"case_manifest",List.of());
            raw.forEach((name,data)->{Artifact a=artifact(key+":"+name,data);artifacts.put(name,new Artifact(a.id(),key,a.uri(),a.sha256(),a.mediaType(),a.integrity(),a.data(),a.issues()));});
            artifacts.put("vsos-core",new Artifact(key+":vsos-core",key,"synthetic:never-executed-core.jar",CORE,"application/java-archive",Integrity.VERIFIED,null,List.of()));
            Run run=new Run(key,"SYNTHETIC-"+(i+1),"runs/SYNTHETIC-"+(i+1)+"/rep1_a1",artifacts,List.of());runs.add(run);
            Map<String,Object> codes=new TreeMap<>();BaselineBindingResolver.PARAMETERS.forEach((c,k)->codes.put(c,params.get(k)));
            Artifact binding=artifact("binding-"+i,obj("schema","vehicsim.baseline-binding-snapshot/v1","evidence_scope","SYNTHETIC_TEST_ONLY",
                    "project_id","1","version_project_id","1","version_id","10","version_no",1,"label","v1.0","status","BASELINE","exported_at","2026-11-23T00:00:00Z",
                    "current_baseline_version_id","10","parameters",codes,"creation_lineage",obj("project_id","1","version_id","10","version_no",1,"label","v1.0","source","MANUAL","created_at","2026-11-01T00:00:00Z"),
                    "run",obj("run_id",100+i,"project_id","1","scenario_id",1,"scenario_version_id",variants[i],"aeb_version_id",10,"result_sha256",run.artifact("result").sha256())));bindings.add(binding);
            Map<String,Object> report=new LinkedHashMap<>(new EvidenceReport().analyze(run,binding));report.put("fixture_scope","SYNTHETIC_TEST_ONLY");
            Map<String,Object> body=new LinkedHashMap<>(map(report.get("report")));body.put("failure_candidates",i==0?List.of(obj("id","synthetic-ineffective","type","INEFFECTIVE_BRAKING","status","SUSPECTED")):List.of());
            Map<String,Object> timeline=new LinkedHashMap<>(map(body.get("aeb_timeline")));timeline.put("detection",run.read("result","/outcome/metrics/first_detection_t","s","core").json());body.put("aeb_timeline",timeline);
            Map<String,Object> gates=new TreeMap<>();for(String code:BaselineBindingResolver.PARAMETERS.keySet())for(String gate:ParameterHintBuilder.gates(code))gates.put(gate,gate(run.artifact("result").id()));
            body.put("parameter_mechanism_evidence",gates);report.put("report",body);report.put("content_digest",EvidenceReport.contentDigest(report));reports.add(report);
            rows.add(obj("run_key",key,"partition",i<3?"OPTIMIZATION":"VALIDATION","run_id",String.valueOf(100+i),"scenario_version_id",String.valueOf(variants[i]),"seed",seeds[i],
                    "replicate",1,"attempt",1,"report_digest",report.get("content_digest"),"result_sha256",run.artifact("result").sha256(),"configuration_digest",MoboHandoffBuilder.configurationDigest(run),
                    "configuration_digest_profile","fa-handoff-run-configuration/1","case_roles",List.of(i==2||i==3?"SAFE_CONTROL":"HAZARD_ENCOUNTER"),"role_basis","EVIDENCE_REVIEWED"));
        }
        Artifact selection=artifact("selection",obj("schema","vehicsim.failure-analysis-selection/v1","evidence_scope","SYNTHETIC_TEST_ONLY","snapshot_schema","vehicsim.analysis-dataset/v2",
                "snapshot_id","99","selection_status","FROZEN","reviewed",true,"baseline_current",true,"project_id","1","scenario_id","1","baseline_version_id","10",
                "review_refs",refs("selection"),"exported_at","2026-11-23T00:00:00Z","members",rows));
        Map<String,Object> qualityMembers=new LinkedHashMap<>();List<MoboHandoffBuilder.MemberInput> members=new ArrayList<>();
        for(int i=0;i<4;i++){
            Run run=runs.get(i);var provenance=new MetricProvenanceResolver().resolve(run);Map<String,Object> defs=new TreeMap<>();
            for(String key:CanonicalObjectiveReader.KEYS){var lineage=new MetricProvenanceResolver().objectiveLineage(provenance,key);
                defs.put(key,obj("signal",lineage.get("signal").value(),"filter",lineage.get("filter").value()==null?"NOT_APPLICABLE":lineage.get("filter").value(),
                        "window",lineage.get("window").value(),"source_refs",refs(run.artifact("result").id())));}
            Object prov=obj("aggregation_version",AnalysisMetrics.VERSION,"metric_source","SIMULATOR_RESULT","simulator","carla-0.9.16-xosc15","producer","vsos-core-java/1","dt",.01,"vehicle_id","1",
                    "core_jar_sha256",CORE,"core_source_commit",COMMIT,"worker_sha256","c".repeat(64),"scenario_runner_version","SYNTHETIC-0.9.16","scenario_runner_sha256","d".repeat(64),
                    "source_refs",refs(run.artifact("result").id()),"metric_source_hashes",List.of(obj("path","SYNTHETIC_METRIC_SOURCE","sha256","e".repeat(64),"commit",COMMIT)),"objectives",defs);
            Artifact sample=artifact("sample-"+i,obj("schema","vehicsim.canonical-sample-snapshot/v1","evidence_scope","SYNTHETIC_TEST_ONLY","selection_sha256",selection.sha256(),
                    "run_key",run.runKey(),"run_id",String.valueOf(100+i),"report_digest",reports.get(i).get("content_digest"),"result_sha256",run.artifact("result").sha256(),
                    "trace_available",true,"sample",CanonicalAggregation.sampleJson(samples.get(i)),"provenance",prov));
            Map<String,Object> objectives=new TreeMap<>();for(String key:CanonicalObjectiveReader.KEYS)objectives.put(key,obj("status","ELIGIBLE","report_digest",reports.get(i).get("content_digest"),
                    "source_refs",refs("policy"),"profile_verified",gate("policy"),"calibration_applicability","NOT_APPLICABLE","calibration_basis_refs",refs("policy")));
            qualityMembers.put(run.runKey(),obj("objectives",objectives,"nonhazard_review",obj("status","REVIEWED_NONHAZARD","report_digest",reports.get(i).get("content_digest"),"source_refs",refs("policy"))));
            Artifact review=artifact("mechanism-"+i,obj("schema","vehicsim.parameter-mechanism-review/v1","run_key",run.runKey(),"report_digest",reports.get(i).get("content_digest"),
                    "status","APPROVED","version","SYNTHETIC/1","basis_partition",i<3?"OPTIMIZATION":"VALIDATION","approval_refs",refs("mechanism-"+i),"parameter_code","BRAKE_BUILDUP_RATE","direction","REVIEW"));
            members.add(new MoboHandoffBuilder.MemberInput(run,null,reports.get(i),bindings.get(i),sample,review));
        }
        Artifact policy=artifact("policy",obj("schema","vehicsim.handoff-quality-policy/v1","evidence_scope","SYNTHETIC_TEST_ONLY","version","SYNTHETIC/1","status","APPROVED","scope","MOBO_HANDOFF",
                "selection_sha256",selection.sha256(),"approval_refs",refs("policy"),"constraint_refs",refs("policy"),"members",qualityMembers));
        var sourced=SearchRangeResolver.repositorySources(Path.of("."));var scope=new SearchRangeResolver.Scope("1","10",selection.sha256());
        Artifact live=domain("live","CATALOG_LIVE",scope),campaign=domain("campaign","CAMPAIGN_APPROVED",scope);
        var domains=new SearchRangeResolver.Domains(sourced.catalogSource(),sourced.engineSource(),live,campaign,List.of());
        Artifact aeb=HandoffSnapshots.source(Path.of("src/main/java/com/vsos/core/aeb/AebStack.java").toAbsolutePath(),"aeb-source");
        return new Cohort(new MoboHandoffBuilder.Input(members,selection,policy,domains,aeb,List.of(artifact("fixture-origin",obj("evidence_scope","SYNTHETIC_TEST_ONLY","source_commit","UNKNOWN")))),reports);
    }
    static Artifact domain(String id,String kind,SearchRangeResolver.Scope scope){
        Map<String,Object> ranges=new TreeMap<>();for(String code:BaselineBindingResolver.PARAMETERS.keySet())ranges.put(code,obj("lower",com.vsos.core.mobo.ParameterBounds.defaults().lower(code),
                "upper",com.vsos.core.mobo.ParameterBounds.defaults().upper(code),"unit",SearchRangeResolver.unit(code)));
        return artifact(id,obj("schema","vehicsim.search-domain-snapshot/v1","kind",kind,"status","APPROVED","version","SYNTHETIC/1","basis_partition","EXTERNAL_POLICY",
                "model_id","SYNTHETIC_MODEL_ONLY","model_sha256","f".repeat(64),"validation_refs",refs(id),
                "project_id",scope.projectId(),"baseline_version_id",scope.baselineVersionId(),"selection_sha256",scope.selectionSha256(),"approval_refs",refs(id),"model_constraints_complete",true,"intervals",ranges));
    }
    static Map<String,Object> frame(double t){return obj("t",t,"ego_x",t*10,"ego_v",10.,"ego_a",0.,"ped_x",30.,"ped_y",-3.,"ped_vy",1.);}
    static Map<String,Object> build(Cohort c){return new MoboHandoffBuilder().build(c.input());}
    static MoboHandoffBuilder.Input withPolicy(Cohort c,Artifact policy){var i=c.input();return new MoboHandoffBuilder.Input(i.members(),i.selection(),policy,i.domains(),i.mechanismSource(),i.sourceArtifacts());}
    static Artifact change(Artifact a,String pointer,Object value){Map<String,Object> data=mutable(a.data());set(data,pointer,value);return artifact(a.id(),data);}
    static Map<String,Object> mutable(Object data){return MiniJson.parseObject(MiniJson.write(data));}
    static void set(Map<String,Object> data,String pointer,Object value){int slash=pointer.lastIndexOf('/');mapMutable(at(data,slash==0?"":pointer.substring(0,slash))).put(pointer.substring(slash+1),value);}
    @SuppressWarnings("unchecked") static Map<String,Object> mapMutable(Object v){return (Map<String,Object>)v;}
}
