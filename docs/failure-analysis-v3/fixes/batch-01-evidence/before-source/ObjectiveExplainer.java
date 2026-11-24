package com.vsos.core.failureanalysis;

import com.vsos.core.common.Py;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.DiagnosticSupport.*;

/** Explains the producer's stored objectives. Diagnostic computations never replace canonical values. */
public final class ObjectiveExplainer {
    public Map<String,Object> explain(Run r,Map<String,Object> original,AebTimelineBuilder.Timeline timeline,
                                      Map<String,Object> physical,ImpactAnalyzer.Contact contact,DiagnosisPolicy.Assessment diagnosis) {
        Map<String,Object> output=mutable(original);
        for(String key:CanonicalObjectiveReader.KEYS) {
            @SuppressWarnings("unchecked") Map<String,Object> o=(Map<String,Object>)output.get(key);
            List<String> notes=new ArrayList<>(),limitations=new ArrayList<>(List.of("Stored canonical scalar/filter/aggregation are preserved",
                    "Calibration validity domain and physical response attribution remain unknown"));
            List<String> candidates=diagnosis.candidates().stream().map(c->c.get("id").toString()).toList();
            List<SourceRef> refs=new ArrayList<>(refs(r,"/outcome/metrics/"+key));
            if(key.equals("rms_jerk_mps3")) {
                notes.add("Canonical CARLA jerk uses gated/clamped ego_a, whole-series producer filter and T_AEB-to-run-end window; not raw IMU/GT jerk");
                notes.add("Diagnostic GT jerk is stored in report.braking with its own recorder clock, raw signal, window and duration weighting");
                if(timeline.command()!=null&&at(o,"/canonical_value/value")==null) {
                    notes.add("Command engagement is recorded but canonical T_AEB/jerk is missing; no synthetic zero or sensor replacement");
                    limitations.add("T_AEB_NOT_FOUND_OR_CANONICAL_VALUE_MISSING");
                }
                if(timeline.off())notes.add("OFF command decisions are shadow-only; phase objectives remain as producer recorded");
                refs.add(r.ref("result","/outcome/case/carla/jerk_filtered"));
                o.put("diagnostic_jerk_reference","/report/braking/jerk_rms");
            } else if(key.equals("impact_speed_mps")) {
                notes.add("Core collision-tick canonical impact and matching recorder precontact impact are distinct samples/bases");
                notes.add("Only legacy aggregate may contribute zero for valid no-collision runs; no physical contact evidence gives null here");
                o.put("physical_event_impact",contact.json().get("recorded_relative_speed"));
                o.put("precontact_vector_impact",contact.json().get("vector_relative_speed"));
                refs.addAll(contact.refs());
            } else {
                o.put("decomposition",decompose(r));
                notes.add("Canonical total is trace front displacement plus a model tail; neither component is substituted for canonical value");
                notes.add("P02 starts at a hypothetical decision and includes delay/ramp; this canonical metric starts at recorded command onset");
                notes.add("Tail uses stored rounded decel_available_mps2, not a freshly computed friction cap; extrapolation is not measured travel");
                if(at(o,"/decomposition/replay_difference/value") instanceof Number diff&&Math.abs(diff.doubleValue())>1e-9)
                    limitations.add("CANONICAL_STOPPING_REPLAY_DISAGREEMENT");
            }
            o.put("failure_candidate_refs",candidates);
            o.put("explanation",obj("assessment","DESCRIPTIVE_ONLY","observed_facts",refs.stream().map(SourceRef::json).toList(),
                    "mechanism_notes",notes,"hypothesis_refs",diagnosis.hypotheses().stream().map(h->h.get("id")).toList(),"limitations",limitations,
                    "timeline_reference","/report/aeb_timeline","feasibility_reference","/report/feasibility_results"));
            @SuppressWarnings("unchecked") Map<String,Object> quality=(Map<String,Object>)o.get("quality");
            @SuppressWarnings("unchecked") List<String> old=(List<String>)quality.get("reason_codes");
            List<String> reasons=new ArrayList<>(old.stream().filter(s->!s.equals("PHYSICAL_INTERPRETATION_DEFERRED_M1B")).toList());
            reasons.add("CALIBRATION_DOMAIN_UNKNOWN");reasons.add("FUNCTIONAL_AND_CAUSAL_ATTRIBUTION_UNCONFIRMED");
            boolean interpretable=key.equals("rms_jerk_mps3")?at(physical,"/jerk_rms/value")!=null&&at(o,"/signal/value")!=null&&at(o,"/window/value")!=null:
                    key.equals("impact_speed_mps")?contact.admissible()&&(contact.recordedRelative()!=null||contact.vectorRelative()!=null):
                            at(o,"/decomposition/trace_component/value")!=null&&at(o,"/decomposition/extrapolated_component/value")!=null;
            if(!interpretable)reasons.add("PHYSICAL_INTERPRETATION_INPUTS_MISSING");
            quality.put("reason_codes",reasons);quality.put("physical_interpretability",interpretable?"PARTIAL":"INSUFFICIENT");
            // Eligibility and comparisons remain M1A unknown/excluded; no M1C handoff here.
        }
        return output;
    }
    public Map<String,Object> decompose(Run r) {
        Map<String,Object> out=new LinkedHashMap<>();
        String[] fields={"trace_component","extrapolated_component","start_time","end_time","start_index","position_after_step","last_speed",
                "decel_for_extrapolation","measured_physical_distance","rounding_rule","replay_difference"};
        for(String field:fields)out.put(field,missing("STOPPING_PROFILE_TRACE_OR_ONSET_MISSING",switch(field){
            case "trace_component","extrapolated_component","measured_physical_distance","replay_difference"->"m";
            case "start_time","end_time"->"s";case "last_speed"->"m/s";case "decel_for_extrapolation"->"m/s\u00b2";default->null;}));
        out.put("total_as_recorded",new CanonicalObjectiveReader().read(r).get("stopping_distance_m").canonicalValue().json());
        if(!profile(r))return out;
        Double onset=num(r,"result","/outcome/metrics/brake_onset_t"),cap=num(r,"result","/outcome/metrics/decel_available_mps2");
        List<Map<String,Object>> frames=rows(r,"result","/outcome/frames");
        if(onset==null||frames.isEmpty())return out;
        int start=-1;
        for(int i=0;i<frames.size();i++){Double t=n(frames.get(i).get("t"));if(t!=null&&t>=onset-1e-9){start=i;break;}}
        if(start<0)return out;
        var first=frames.get(start);var last=frames.getLast();
        Double x0=n(first.get("ego_x")),x1=n(last.get("ego_x")),v0=n(first.get("ego_v")),v1=n(last.get("ego_v"));
        Double dt=carla(r)?num(r,"result","/outcome/case/carla/fixed_delta_seconds"):.05;
        if(x0==null||x1==null||v0==null||v1==null||v1<0||dt==null||dt<=0)return out;
        boolean afterStep=!carla(r);double trace=x1-(afterStep?x0-v0*dt:x0);
        List<SourceRef> refs=refs(r,"/outcome/frames/"+start,"/outcome/frames/"+(frames.size()-1),"/outcome/metrics/brake_onset_t","/outcome/metrics/decel_available_mps2","/simulator");
        List<String> assumption=List.of("Producer positionAfterStep convention for declared profile; runtime/source equivalence unverified",
                "Core projected longitudinal displacement, not 3D measured path length");
        out.put("trace_component",calculated(trace,"OA-D","m","core",FRAME,refs,assumption));
        out.put("position_after_step",calculated(afterStep,"OA-D",null,null,null,refs,assumption));
        out.put("start_index",calculated(start,"OA-D",null,null,null,refs,List.of()));
        out.put("start_time",calculated(n(first.get("t")),"OA-D","s","core",null,refs,List.of()));
        out.put("end_time",calculated(n(last.get("t")),"OA-D","s","core",null,refs,List.of()));
        out.put("last_speed",calculated(v1,"OA-D","m/s","core",FRAME,refs,List.of()));
        out.put("decel_for_extrapolation",calculated(cap,"OA-D","m/s\u00b2","core",FRAME,refs,assumption));
        out.put("rounding_rule",calculated("Producer Py.round(total,3); use stored rounded available deceleration","OA-D",null,null,null,refs,assumption));
        out.put("measured_physical_distance",missing("CORE_RECORDER_ALIGNMENT_AND_TRAVEL_WINDOW_UNRESOLVED","m"));
        if(cap==null||cap<=0){out.put("extrapolated_component",missing("MODEL_INPUT_INVALID_OR_MISSING","m"));return out;}
        double tail=v1*v1/(2*cap);
        out.put("extrapolated_component",calculated(tail,"OA-D","m","core",FRAME,refs,List.of("Constant deceleration tail under producer model; not measured stopping travel","Calibration applicability unverified")));
        Double stored=num(r,"result","/outcome/metrics/stopping_distance_m");
        out.put("replay_difference",calculated(stored==null?null:Py.round(trace+tail,3)-stored,"OA-D","m","core",FRAME,refs,assumption,stored==null?"CANONICAL_VALUE_MISSING":"DESCRIPTIVE_REPLAY_ONLY"));
        return out;
    }
}
