package com.vsos.core.failureanalysis;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

/** Read-only, revision-scoped source evidence. A changed source is UNKNOWN, never a new capability. */
public final class ConsumerSourceInspection {
    private ConsumerSourceInspection() {}
    private static final Map<String,String> PATHS=Map.of(
            "AnalysisMetrics","core/evaluation/AnalysisMetrics.java","AnalysisService","backend/service/analysis/AnalysisService.java",
            "OptimizationController","backend/controller/optimization/OptimizationController.java","OptimizationService","backend/service/optimization/OptimizationService.java",
            "MoboEngine","core/mobo/MoboEngine.java","MoboTrial","core/mobo/MoboTrial.java","ParameterBounds","core/mobo/ParameterBounds.java",
            "RegressionService","backend/service/regression/RegressionService.java");
    private static final Map<String,String> AUDITED=Map.of(
            "AnalysisMetrics","a98d3df710d0ccf42794136384c9c1c07d7a52e29a046a360387aa444131eb17",
            "AnalysisService","e478ed167ca6d7f83ef00f70b189cf8ce6ba04060e6486d343b29d276a359554",
            "OptimizationController","30c6fb24456149406e3fb6daacd1aed3756b9c88657402e3d13679fdd98e2347",
            "OptimizationService","abe10997fef03dfd01749a806d50e90467df8e18167f29f0f213cdc2d428c786",
            "MoboEngine","fff2fbe62f7291c0a6a3f2c00a00c9e00c24639de4cbbd705995671605219c7b",
            "MoboTrial","1cdf0b45235e238d7ec0ac1580d3d2fa4b6c8369f1c58ded5553fe35363f8a02",
            "ParameterBounds","cb509c68a58a2c491f0e63e47dcde61d1a3044a94515d6bda224578e0d7ce5f8",
            "RegressionService","4cf0871c1b8865306eda195613679917362dacab76a714c2b35111fbd0e87384");
    public record Profile(Map<String,Artifact> artifacts,Map<String,String> texts,boolean audited){
        public Profile{artifacts=Map.copyOf(artifacts);texts=Map.copyOf(texts);}
        public Map<String,Object> hashes(){Map<String,Object> out=new TreeMap<>();artifacts.forEach((k,v)->out.put(k,v.sha256()));return out;}
        public SourceRef ref(String name,String anchor){
            String source=texts.getOrDefault(name,"");int index=source.indexOf(anchor);
            String location=index<0?"ANCHOR_UNAVAILABLE: "+anchor:"line="+(source.substring(0,index).chars().filter(c->c=='\n').count()+1)+"; "+anchor;
            return new SourceRef(artifacts.get(name).id(),location);
        }
        public List<String> requestFields(){
            String source=texts.getOrDefault("OptimizationController","");int start=source.indexOf("public record OptimizationRequest("),end=start<0?-1:source.indexOf(") {",start);
            if(start<0||end<0)return List.of();Matcher m=Pattern.compile("@JsonProperty\\(\"([^\"]+)\"\\)").matcher(source.substring(start,end));
            List<String> fields=new ArrayList<>();while(m.find())fields.add(m.group(1));return List.copyOf(fields);
        }
        public List<Map<String,Object>> gaps(){
            List<Map<String,Object>> out=new ArrayList<>();
            gap(out,"DATASET_CONSUMPTION_MISSING","OptimizationController","public record OptimizationRequest(","Request has no dataset_id, run partitions, evidence or hint input");
            gap(out,"LATEST_BASELINE_RESELECTION","OptimizationService","getOrCreateBaselineRuns(","Latest family and latest ON baseline rows replace frozen selection");
            gap(out,"MULTI_SEED_VARIANT_MAP_LOSS","OptimizationService","baselineMap.put(r.lng(\"scenario_version_id\"), r)","Map key is variant only; multiple seeds or repetitions collapse");
            gap(out,"CONSUMER_CANONICAL_AGGREGATION_DIVERGENCE","OptimizationService","private CandidateTrialMetrics evaluateCandidateRuns(","Activation membership, null skipping/fallback zero and rounding differ from canonical");
            gap(out,"BASELINE_STATS_OBJECTIVES_MISSING","OptimizationService","public record BaselineStats(","BaselineStats contains collision/false activation rates only");
            gap(out,"ENGINE_TYPED_TRIAL_BOUNDARY","MoboEngine","public MoboProposal propose(","Engine accepts List<MoboTrial>, not diagnostic/handoff JSON or baseline-as-trial0");
            gap(out,"CUSTOM_BOUNDS_IGNORED","OptimizationService","new MoboEngine(ParameterBounds.defaults()","Stored search_space is not passed to the engine");
            gap(out,"POST_PROPOSAL_MUTATION_RANGE_RISK","OptimizationService","proposedParams.put(\"TTC_THRESHOLD\"","Parent equality mutation clamps at default3.5, not approved narrowed bound");
            gap(out,"SEALED_VALIDATION_NOT_CONSUMED","RegressionService","public long createTest(long projectId","Regression reselects latest family/baseline; no sealed validation run identity input");
            gap(out,"VERIFICATION_SELECTS_ALL_VARIANTS","OptimizationService","long regressionTestId = regressionService.createTest(","Verification requests all variants instead of the frozen validation partition");
            gap(out,"FINITE_TRIAL_BOUNDARY_NOT_GUARDED","MoboTrial","public boolean valid()","Non-null objectives are accepted without finite/nonnegative or provenance checks");
            gap(out,"FINITE_PARAMETER_BOUNDARY_NOT_GUARDED","ParameterBounds","public boolean isValid(","NaN can pass existing comparison-only parameter validation; external finite guard is required");
            gap(out,"FREEZE_METRIC_DESCRIPTOR_CONFLICT","AnalysisService","\"impact\",\"EGO_SPEED_NOT_RELATIVE\"","Frozen metadata can claim ego impact despite relative-impact producer profiles; preserve archive");
            return out;
        }
        private void gap(List<Map<String,Object>> out,String code,String source,String anchor,String detail){
            out.add(obj("code",code,"status",audited?"NOT_SUPPORTED":"UNKNOWN","detail",audited?detail:"Source differs from audited revision; re-audit required",
                    "source_refs",List.of(ref(source,anchor).json())));
        }
        public Map<String,Object> json(){return obj("status",audited?"MATCHED_AUDITED_SOURCE":"UNKNOWN","source_profile","baf0892d-consumer-contract/1",
                "runtime_binary_equivalence",unknownJson("SOURCE_INSPECTION_IS_NOT_DEPLOYED_RUNTIME_VERIFICATION"),"source_hashes",hashes(),
                "request_fields",requestFields(),"gaps",gaps());}
    }
    public static Profile read(Path repository) throws IOException {
        Map<String,Artifact> artifacts=new TreeMap<>();Map<String,String> texts=new TreeMap<>();boolean audited=true;
        for(String name:new TreeSet<>(PATHS.keySet())){
            String relative="src/main/java/com/vsos/"+PATHS.get(name);Path file=repository.resolve(relative);
            byte[] bytes=Files.isRegularFile(file)?new BoundedInput(InputResourcePolicy.defaults()).read(file,relative):null;String hash=bytes==null?null:sha256(bytes);
            artifacts.put(name,new Artifact("consumer-source:"+name,"source",relative,hash,"text/x-java-source",bytes==null?Integrity.UNVERIFIED:Integrity.VERIFIED,null,List.of()));
            texts.put(name,bytes==null?"":new String(bytes,StandardCharsets.UTF_8));audited&=Objects.equals(AUDITED.get(name),hash);
        }return new Profile(artifacts,texts,audited);
    }
}
