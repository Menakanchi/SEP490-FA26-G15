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
            "AnalysisMetrics","5bdd7de19e3cb0e10ef47a24d9a2d6ca224a2190c6e153b589d7d2cf9f94df99",
            "AnalysisService","997c77640c4c745bf845462c0cd6b5b467ba06184eff2fec95c008af17dc28fb",
            "OptimizationController","8b1ffc54b7d286ab2909c7bec6de590d5e305e7f8c7c2aa6d2362164261d29c5",
            "OptimizationService","d80dbcd00ec913e3bd0c5c514c00b6a7599675a7ebe2b8bb7bf33f6d55d30c04",
            "MoboEngine","cf9a8fdbb30e604ba41bb35aa37915569e554a67614f3e9d3b9b5a88e2d7c492",
            "MoboTrial","763835d26e2998aa5f8fbcae41b8109fbe8b9bebd07404f10ba3ed1dba11bae4",
            "ParameterBounds","0239358a5c3446164a132c2d3328848a3bb635280bd4dde377be5ab0fde83934",
            "RegressionService","c018f9c11dd77b5f6d8fca20aa58edd19c4c5f95cdc22ee434c12f599cbf8046");
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
    /** CRLF → LF (byte {@code \r} đứng ngay trước {@code \n} bị bỏ); mọi byte khác giữ nguyên. */
    static byte[] lineEndingsToLf(byte[] in){
        java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream(in.length);
        for(int i=0;i<in.length;i++){if(in[i]=='\r'&&i+1<in.length&&in[i+1]=='\n')continue;out.write(in[i]);}
        return out.toByteArray();
    }
    public static Profile read(Path repository) throws IOException {
        Map<String,Artifact> artifacts=new TreeMap<>();Map<String,String> texts=new TreeMap<>();boolean audited=true;
        for(String name:new TreeSet<>(PATHS.keySet())){
            String relative="src/main/java/com/vsos/"+PATHS.get(name);Path file=repository.resolve(relative);
            // Băm sau khi đưa CRLF về LF: hash ghim ở AUDITED là của nội dung, không phụ thuộc core.autocrlf của máy checkout (Windows/CI Linux ra cùng số).
            byte[] bytes=Files.isRegularFile(file)?lineEndingsToLf(new BoundedInput(InputResourcePolicy.defaults()).read(file,relative)):null;String hash=bytes==null?null:sha256(bytes);
            artifacts.put(name,new Artifact("consumer-source:"+name,"source",relative,hash,"text/x-java-source",bytes==null?Integrity.UNVERIFIED:Integrity.VERIFIED,null,List.of()));
            texts.put(name,bytes==null?"":new String(bytes,StandardCharsets.UTF_8));audited&=Objects.equals(AUDITED.get(name),hash);
        }return new Profile(artifacts,texts,audited);
    }
}
