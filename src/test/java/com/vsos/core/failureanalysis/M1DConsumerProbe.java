package com.vsos.core.failureanalysis;

import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.analysis.AnalysisService;
import com.vsos.backend.service.optimization.OptimizationService;
import com.vsos.core.evaluation.AnalysisMetrics;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Executes only the existing pure helper. No orchestration method, DB, runner or engine is called. */
final class M1DConsumerProbe {
    private M1DConsumerProbe(){}
    static Row row(Boolean activated,Double jerk,Double impact,Double stop,Boolean collision){
        return new Row(obj("status","COMPLETED","end_reason","TARGET_CLEARED","aeb_mode","ON","collision_occurred",collision,"is_false_positive",false,"is_false_negative",false,
                "verdict","PASS","aeb_activated",activated,"rms_jerk_mps3",jerk,"impact_speed_mps",impact,"stopping_distance_m",stop,"trace_frames",2));
    }
    static Row change(Row original,String key,Object value){Map<String,Object> m=new LinkedHashMap<>(original.asMap());m.put(key,value);return new Row(m);}
    static Artifact execute(ConsumerSourceInspection.Profile profile)throws Exception{
        var service=new OptimizationService(null,null,null,null,null,null,null,null,null);
        Method helper=OptimizationService.class.getDeclaredMethod("evaluateCandidateRuns",List.class,OptimizationService.BaselineStats.class);helper.setAccessible(true);
        Map<String,List<Row>> inputs=new LinkedHashMap<>();
        inputs.put("MATCH_COMPLETE",List.of(row(true,2.,6.,10.,true),row(true,4.,null,20.,false),row(false,null,null,null,false)));
        inputs.put("ACTIVATION_VS_BRAKED",List.of(row(false,2.,6.,10.,true)));
        inputs.put("MISSING_JERK",List.of(row(true,null,6.,10.,true),row(true,4.,null,20.,false)));
        inputs.put("NULL_COLLISION_IMPACT",List.of(row(true,2.,null,10.,true)));
        inputs.put("ALL_NO_BRAKE",List.of(row(false,null,null,null,false)));
        inputs.put("BRAKED_UNKNOWN",List.of(row(true,null,null,null,false)));
        inputs.put("ROUNDING",List.of(row(true,1.,null,1.,false),row(true,2.,null,2.,false),row(true,2.,null,2.,false)));
        inputs.put("TRACE_MISSING",List.of(change(row(true,2.,6.,10.,true),"trace_frames",0)));
        inputs.put("ROW_FLAGS_UNKNOWN",List.of(change(row(true,2.,6.,10.,true),"is_false_negative",null)));
        inputs.put("FAILED_STATUS_HELPER_ONLY",List.of(change(row(true,2.,6.,10.,true),"status","FAILED")));
        inputs.put("NEGATIVE_SCALAR",List.of(row(true,-1.,6.,10.,true)));
        inputs.put("EMPTY_HELPER_ONLY",List.of());
        List<Map<String,Object>> cases=new ArrayList<>();
        for(var entry:inputs.entrySet()){
            List<AnalysisMetrics.Sample> samples=entry.getValue().stream().map(AnalysisService::sample).toList();Object result=null;String exception=null;
            try{var observed=(OptimizationService.CandidateTrialMetrics)helper.invoke(service,entry.getValue(),new OptimizationService.BaselineStats(100.,100.));
                result=obj("rms_jerk_mps3",observed.rmsJerk(),"impact_speed_mps",observed.impactSpeed(),"stopping_distance_m",observed.stoppingDistance());}
            catch(InvocationTargetException e){exception=e.getCause().getClass().getName();}
            cases.add(obj("id",entry.getKey(),"samples",samples.stream().map(CanonicalAggregation::sampleJson).toList(),
                    "consumer_activation_flags",entry.getValue().stream().map(r->r.bool("aeb_activated")).toList(),
                    "canonical",CanonicalAggregation.aggregate(samples),"consumer_objectives",result,"consumer_exception",exception));
        }
        Map<String,Object> loaded=new TreeMap<>();for(Class<?> type:List.of(OptimizationService.class,AnalysisService.class,AnalysisMetrics.class)){
            try(var stream=type.getResourceAsStream("/"+type.getName().replace('.','/')+".class")){loaded.put(type.getSimpleName(),sha256(Objects.requireNonNull(stream).readAllBytes()));}}
        return M1CFixture.artifact("m1d-consumer-probe",obj("schema","vehicsim.consumer-parity-probe/v1","evidence_scope","SYNTHETIC_TEST_ONLY",
                "execution_kind","ACTUAL_JAVA_HELPER_TEST","aggregation_version",AnalysisMetrics.VERSION,"source_hashes",profile.hashes(),
                "loaded_class_sha256",loaded,"cases",cases,"engine_called",false,"database_accessed",false,"campaign_executed",false));
    }
}
