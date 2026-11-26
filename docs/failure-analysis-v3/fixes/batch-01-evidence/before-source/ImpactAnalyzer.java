package com.vsos.core.failureanalysis;

import java.math.BigInteger;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.DiagnosticSupport.*;

/** I01: event authority, recorded scalars and pre-contact vector reconstruction stay separate. */
public final class ImpactAnalyzer {
    public record Contact(boolean admissible,Double time,String eventFrame,Double recordedRelative,Double vectorRelative,
                          Double egoVectorSpeed,List<SourceRef> refs,List<String> reasons,Map<String,Object> json) {}
    public static double relativeVelocity(double ex,double ey,double ez,double tx,double ty,double tz) {
        if(!Double.isFinite(ex)||!Double.isFinite(ey)||!Double.isFinite(ez)||!Double.isFinite(tx)||!Double.isFinite(ty)||!Double.isFinite(tz))
            throw new IllegalArgumentException("All velocity components required, finite and same frame");
        return Math.hypot(Math.hypot(ex-tx,ey-ty),ez-tz);
    }
    public Contact extract(Run r,List<Issue> issues) {
        List<Map<String,Object>> events=rows(r,"collisions",""),gt=rows(r,"ground_truth","");
        List<String> reasons=new ArrayList<>();
        if(blocked(r,issues,"collisions")||blocked(r,issues,"ground_truth")||issues.stream().anyMatch(i->i.code().equals("INCONSISTENT_IDENTITY")))
            return absent("CONTACT_BINDING_OR_CLOCK_INVALID");
        for(int i=0;i<events.size();i++) {
            Map<String,Object> event=events.get(i);String actor=id(event.get("other_actor_id")),before=id(event.get("gt_frame_before")),frame=id(event.get("frame"));
            Double time=n(event.get("sim_time_s"));
            if(actor==null||before==null||frame==null||time==null||time<0)continue;
            Map<String,Object> ego=null,target=null;int egoRow=-1,targetRow=-1;
            for(int j=0;j<gt.size();j++) {
                var row=gt.get(j);
                if(!before.equals(id(row.get("frame"))))continue;
                if("ego".equals(row.get("role"))){ego=row;egoRow=j;}
                if("target".equals(row.get("role"))&&actor.equals(id(row.get("actor_id")))){target=row;targetRow=j;}
            }
            if(ego==null||target==null||new BigInteger(before).compareTo(new BigInteger(frame))>=0)continue;
            Double egoTime=n(ego.get("sim_time_s")),targetTime=n(target.get("sim_time_s"));
            if(egoTime==null||targetTime==null||!egoTime.equals(targetTime)||egoTime>=time)continue;
            List<SourceRef> refs=List.of(r.ref("collisions","/"+i),r.ref("ground_truth","/"+egoRow),r.ref("ground_truth","/"+targetRow));
            Double recorded=n(event.get("relative_speed_before_ms"));if(recorded!=null&&recorded<0)recorded=null;
            double[] ev=vector(ego),tv=vector(target);Double relative=null,egoSpeed=null;
            if(ev!=null&&tv!=null){relative=relativeVelocity(ev[0],ev[1],ev[2],tv[0],tv[1],tv[2]);egoSpeed=Math.hypot(Math.hypot(ev[0],ev[1]),ev[2]);}
            else reasons.add("PRECONTACT_VELOCITY_VECTOR_MISSING");
            List<String> assumptions=List.of("Pre-contact snapshot frame strictly precedes event frame; no post-impact substitution",
                    "Vector reconstruction uses the recorded CARLA world snapshot; reported live scalar is a separate source");
            Map<String,Object> output=obj("admissible_recorded_contact",true,"basis","RECORDED_MATCHING_CONTACT","claim_level","OBSERVED_EVENT",
                    "contact_time",observed(time,"s","recorder",r.ref("collisions","/"+i+"/sim_time_s")),
                    "event_frame",frame,"preimpact_frame",before,"target_actor_id",actor,
                    "impulse",r.read("collisions","/"+i+"/impulse_ns","N\u00b7s","recorder").json(),
                    "recorded_relative_speed",recorded==null?missing("RECORDED_CONTACT_SPEED_MISSING","m/s"):observed(recorded,"m/s","recorder",r.ref("collisions","/"+i+"/relative_speed_before_ms")),
                    "vector_relative_speed",calculated(relative,"I01","m/s","recorder","CARLA_WORLD",refs,assumptions,"PRECONTACT_VECTOR_RECONSTRUCTION"),
                    "vector_ego_speed",calculated(egoSpeed,"I01","m/s","recorder","CARLA_WORLD",refs,assumptions),
                    "reported_minus_vector",recorded!=null&&relative!=null?calculated(recorded-relative,"I01","m/s","recorder","CARLA_WORLD",refs,assumptions,"SAMPLING_BASIS_DIFFERENCE_NOT_RECONCILED"):missing("CONTACT_SPEED_BASIS_INCOMPLETE","m/s"),
                    "reason_codes",reasons);
            return new Contact(true,time,frame,recorded,relative,egoSpeed,refs,List.copyOf(reasons),output);
        }
        return absent(events.isEmpty()?"NO_RECORDED_CONTACT":"CONTACT_ACTOR_PRECONTACT_OR_EPISODE_UNRESOLVED");
    }
    private static String id(Object x) {return x!=null&&x.toString().matches("\\d+")?x.toString():null;}
    private static double[] vector(Map<String,Object> row) {
        Double x=n(row.get("vx_ms")),y=n(row.get("vy_ms")),z=n(row.get("vz_ms"));return x==null||y==null||z==null?null:new double[]{x,y,z};
    }
    private static Contact absent(String code) {
        return new Contact(false,null,null,null,null,null,List.of(),List.of(code),obj("admissible_recorded_contact",false,
                "contact_time",missing(code,"s"),"recorded_relative_speed",missing(code,"m/s"),"vector_relative_speed",missing(code,"m/s"),
                "vector_ego_speed",missing(code,"m/s"),"reason_codes",List.of(code,"CONTACT_COVERAGE_UNPROVEN")));
    }
    public Map<String,Object> compare(Run on,Run off,Contact a,Contact b) {
        if(off==null)return obj("pairing_status","UNKNOWN","observed_speed_reduction",missing("PAIRED_OFF_RUN_MISSING","m/s"));
        List<String> missing=new ArrayList<>();
        if(!"ON".equals(EvidenceReport.mode(on).value())||!"OFF".equals(EvidenceReport.mode(off).value()))missing.add("ON_OFF_MODE_PAIR_INVALID");
        if(!on.caseKey().equals(off.caseKey())||!sameNumber(on.get("result","/seed"),off.get("result","/seed")))missing.add("CASE_OR_SEED_MISMATCH");
        for(String p:List.of("/simulator"))if(on.get("result",p)==null||!Objects.equals(on.get("result",p),off.get("result",p)))missing.add("SIMULATOR_MISMATCH_OR_MISSING");
        for(String p:List.of("/vehicle","/variant"))if(on.get("bundle",p)==null||!Objects.equals(on.get("bundle",p),off.get("bundle",p)))missing.add("VEHICLE_OR_TARGET_PROGRAM_MISMATCH");
        for(String p:List.of("/outcome/params","/outcome/case/carla/physics_applied"))if(on.get("result",p)==null||!Objects.equals(on.get("result",p),off.get("result",p)))missing.add("PARAMETERS_OR_PHYSICS_MISMATCH");
        if(on.get("lifecycle","/core/sha256")==null||!Objects.equals(on.get("lifecycle","/core/sha256"),off.get("lifecycle","/core/sha256")))missing.add("CORE_BINARY_MISMATCH_OR_MISSING");
        if(!a.admissible||!b.admissible||a.recordedRelative==null||b.recordedRelative==null)missing.add("DOUBLE_COMPARABLE_CONTACT_REQUIRED");
        Double delta=missing.isEmpty()?b.recordedRelative-a.recordedRelative:null;
        List<SourceRef> refs=new ArrayList<>(a.refs);refs.addAll(b.refs);
        return obj("off_run_key",off.runKey(),"pairing_status",missing.isEmpty()?"MATCHED_RECORDED_CONTEXT":"UNKNOWN",
                "speed_basis","RECORDED_RELATIVE_PRECONTACT_SCALAR","observed_speed_reduction",calculated(delta,"I01","m/s","recorder",null,refs,
                        List.of("Paired observation at the same seed/configuration, not a controlled causal intervention",
                                "Target execution timing, disturbances and control writers are not fully matched"),delta==null?"PAIR_EVIDENCE_INSUFFICIENT":"OBSERVATIONAL_ASSOCIATION_ONLY"),
                "causal_contribution",missing("PAIR_DISTURBANCES_AND_WRITERS_UNCONTROLLED","m/s"),"missing_evidence",missing);
    }
}
