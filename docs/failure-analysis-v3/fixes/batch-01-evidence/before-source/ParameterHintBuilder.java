package com.vsos.core.failureanalysis;

import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

/** Review context only. No candidate values, probability, acquisition or optimizer invocation. */
public final class ParameterHintBuilder {
    public static List<String> gates(String code){
        List<String> gates=new ArrayList<>(List.of("VALID_DETECTION","VALID_CLOCK_GEOMETRY","CALIBRATION_APPLICABLE","COMMAND_PHYSICS_ATTRIBUTED"));
        gates.addAll(switch(code){
            case "TTC_THRESHOLD"->List.of("ACTIONABLE_2D_WINDOW","TTC_THRESHOLD_LINK");
            case "BRAKE_ACTIVATION_DELAY"->List.of("CONFIGURED_DELAY_OPPORTUNITY");
            case "MAX_DECELERATION"->List.of("FEASIBLE_RESPONSE_HEADROOM");
            case "BRAKE_BUILDUP_RATE"->List.of("RAMP_OBJECTIVE_LINK");
            default->List.of("UNSUPPORTED_PARAMETER");});return List.copyOf(gates);
    }
    public List<Map<String,Object>> build(Map<String,Object> report,String partition,Artifact review,Artifact mechanismSource){
        // Sealed validation is never even inspected. Diagnostic controls are not training evidence.
        if(!"OPTIMIZATION".equals(partition))return List.of();
        if(report==null||!Objects.equals(report.get("content_digest"),EvidenceReport.contentDigest(report)))
            return List.of(hint("UNKNOWN",null,"ABSTAIN","NONE",List.of(),List.of(),"Diagnostic report is missing or its digest is invalid",List.of("DIAGNOSTIC_REPORT_UNVERIFIED"),null));
        if(!"ON".equals(at(report,"/input/mode/value")))return List.of();
        String runKey=str(at(report,"/input/run_key"));String reportId="report:"+runKey;
        List<?> candidates=list(at(report,"/report/failure_candidates"));
        List<Map<String,Object>> refs=new ArrayList<>();refs.add(new SourceRef(reportId,"/report/objectives").json());
        List<String> candidateIds=candidates.stream().map(c->str(at(c,"/id"))).filter(Objects::nonNull).toList();
        for(int i=0;i<candidates.size();i++)refs.add(new SourceRef(reportId,"/report/failure_candidates/"+i).json());
        if(candidates.isEmpty())return List.of(hint(runKey,null,"NO_PARAMETER_HINT","NONE",refs,candidateIds,
                "No evidenced failure candidate establishes a parameter mechanism",List.of("No supported parameter mechanism"),null));
        String code=review==null?null:str(at(review.data(),"/parameter_code"));
        List<String> missing=new ArrayList<>();
        if(candidates.stream().anyMatch(c->"NO_BRAKING".equals(at(c,"/type"))))missing.add("DETECTION_AND_ACTUATION_CHAIN_UNRESOLVED");
        Object detection=at(report,"/report/aeb_timeline/detection"),decision=at(report,"/report/aeb_timeline/decision"),command=at(report,"/report/aeb_timeline/command_onset");
        boolean timeline=true;for(Object event:Arrays.asList(detection,decision,command)){
            if(!finiteNonnegative(at(event,"/value"))||!"s".equals(at(event,"/unit"))||!cited(at(event,"/source_refs"))
                    ||!Arrays.asList("OBSERVED","DERIVED").contains(str(at(event,"/status"))))timeline=false;
        }
        if(timeline){Object clock=at(detection,"/clock_id");timeline=text(clock)&&Objects.equals(clock,at(decision,"/clock_id"))&&Objects.equals(clock,at(command,"/clock_id"))
                &&((Number)at(detection,"/value")).doubleValue()<=((Number)at(decision,"/value")).doubleValue()
                &&((Number)at(decision,"/value")).doubleValue()<=((Number)at(command,"/value")).doubleValue();}
        if(!timeline)missing.add("SOURCE_TIMELINE_MISSING_OR_UNORDERED");
        if(!verified(review,"vehicsim.parameter-mechanism-review/v1")||!"APPROVED".equals(at(review.data(),"/status"))
                ||!text(at(review.data(),"/version"))||!Objects.equals(at(report,"/content_digest"),at(review.data(),"/report_digest"))
                ||!Objects.equals(runKey,at(review.data(),"/run_key"))||!"OPTIMIZATION".equals(at(review.data(),"/basis_partition"))
                ||!cited(at(review.data(),"/approval_refs")))missing.add("MECHANISM_REVIEW_UNAPPROVED_OR_UNBOUND");
        if(code==null||!BaselineBindingResolver.PARAMETERS.containsKey(code))missing.add("FOUR_PARAMETER_MECHANISM_UNPROVEN");
        if(mechanismSource==null||!mechanismSource.usable()||mechanismSource.integrity()!=Integrity.VERIFIED||!hash(mechanismSource.sha256())
                ||!mechanismSource.uri().replace('\\','/').endsWith("/core/aeb/AebStack.java"))missing.add("CONTROL_SOURCE_MECHANISM_MISSING");
        if(code!=null)for(String key:gates(code)){
            Object gate=at(report,"/report/parameter_mechanism_evidence/"+key);
            if(!supportedGate(gate))missing.add(key);
            else refs.add(new SourceRef(reportId,"/report/parameter_mechanism_evidence/"+key).json());
        }
        for(String key:CanonicalObjectiveReader.KEYS){
            if(!"MATCH".equals(at(report,"/report/objectives/"+key+"/copy_agreement")))missing.add("OBJECTIVE_COPY_UNRESOLVED:"+key);
            if(!text(at(report,"/report/objectives/"+key+"/signal/value")))missing.add("OBJECTIVE_SIGNAL_UNKNOWN:"+key);
            if(!text(at(report,"/report/objectives/"+key+"/window/value")))missing.add("OBJECTIVE_WINDOW_UNKNOWN:"+key);
            if(!text(at(report,"/report/objectives/"+key+"/filter/value"))&&!"NOT_APPLICABLE".equals(at(report,"/report/objectives/"+key+"/filter/status")))missing.add("OBJECTIVE_FILTER_UNKNOWN:"+key);
        }
        String direction=review==null?"NONE":str(at(review.data(),"/direction"));
        if(!Arrays.asList("REVIEW","CONSIDER_INCREASE","CONSIDER_DECREASE").contains(direction))missing.add("DIRECTION_UNSUPPORTED");
        if("CONSIDER_DECREASE".equals(direction)&&Arrays.asList("TTC_THRESHOLD","MAX_DECELERATION").contains(code)
                ||"CONSIDER_INCREASE".equals(direction)&&"BRAKE_ACTIVATION_DELAY".equals(code))missing.add("DIRECTION_NOT_SUPPORTED_BY_DECLARED_MECHANISM");
        if(!missing.isEmpty())return List.of(hint(runKey,null,"ABSTAIN","NONE",refs,candidateIds,
                "Perception, geometry, timing, calibration or physical response has not isolated a four-parameter mechanism",missing,null));
        refs.add(new SourceRef(review.id(),"").json());refs.add(new SourceRef(mechanismSource.id(),code.equals("TTC_THRESHOLD")?"AebStack.decide":"AebStack.control").json());
        String mechanism=switch(code){
            case "TTC_THRESHOLD"->"Threshold participates in decision timing after qualified detection; earlier intervention can change the available braking window";
            case "BRAKE_ACTIVATION_DELAY"->"Configured delay consumes an attributed command opportunity; it is only one component of physical lag";
            case "MAX_DECELERATION"->"Requested cap participates in the attainable envelope only while vehicle, adapter and friction limits leave headroom";
            default->"Demand ramp gradient links command buildup to response; recorded jerk retains its producer signal/filter/window";};
        String raw=BaselineBindingResolver.PARAMETERS.get(code);String normalized=raw.equals("brake_activation_delay")?"activation_delay":raw.equals("brake_buildup_rate")?"buildup_rate":raw;
        Object baseline="PROJECT_BASELINE_CONFIRMED".equals(at(report,"/input/baseline_binding/identity_status"))?at(report,"/input/parameters/"+normalized):null;
        return List.of(hint(runKey,code,"SUSPECTED",direction,refs,candidateIds,mechanism,List.of(),baseline));
    }
    private static Map<String,Object> hint(String run,String code,String status,String direction,List<Map<String,Object>> refs,List<String> candidates,
                                           String mechanism,List<String> missing,Object baseline){
        return obj("id",run+":"+(code==null?status:code),"parameter_code",code,"status",status,"direction",direction,
                "objective_keys",CanonicalObjectiveReader.KEYS,"baseline_value",baseline==null?unknownJson("BASELINE_PARAMETER_NOT_VERIFIED"):baseline,
                "evidence_refs",refs,"related_candidate_ids",candidates,"related_metric_ids",CanonicalObjectiveReader.KEYS,
                "hypothesis_refs",candidates,"mechanism",mechanism,"possible_direction_for_review",direction,
                "tradeoffs",List.of("rms_jerk_mps3: faster or stronger response can increase jerk; filtering and the T_AEB window affect the recorded objective",
                        "impact_speed_mps: earlier or stronger braking may reduce contact speed only within an actionable, attainable opportunity",
                        "stopping_distance_m: earlier onset changes the trace window; slower buildup can lengthen stopping travel and the extrapolated tail",
                        "Earlier intervention may increase acceptable caution or false braking; no monotonic improvement is asserted"),
                "prerequisites",missing,"missing_prerequisites",missing,
                "alternative_non_parameter_explanations",List.of("Detection or track delivery","Clock or geometry uncertainty","Actuator, override or calibration mismatch","Permitted caution or incomplete observation"),
                "counterevidence",List.of("Association and mechanism review are not causal isolation"),"search_range_ref",code==null?null:"/search_ranges/"+code,
                "reason_codes",List.of(status.equals("SUSPECTED")?"SOURCE_LINKED_SUSPECTED_MECHANISM_ONLY":status.equals("ABSTAIN")?"PARAMETER_ATTRIBUTION_INSUFFICIENT":"NO_SUPPORTED_PARAMETER_MECHANISM"));
    }
}
