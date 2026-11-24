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
        Object raw=r.get("collisions","");
        List<?> events=raw instanceof List<?> list?list:List.of();
        List<Map<String,Object>> gt=rows(r,"ground_truth","");
        if(blocked(r,issues,"collisions")||issues.stream().anyMatch(i->i.code().equals("INCONSISTENT_IDENTITY")))
            return absent("CONTACT_BINDING_OR_CLOCK_INVALID");
        List<SourceRef> rejectedRefs=new ArrayList<>();List<String> rejectedReasons=new ArrayList<>();
        Contact earliest=null;
        for(int i=0;i<events.size();i++) {
            if(!(events.get(i) instanceof Map<?,?> event)) {rejectedRefs.add(r.ref("collisions","/"+i));rejectedReasons.add("COLLISION_EVENT_ROW_INVALID");continue;}
            String actor=id(event.get("other_actor_id")),before=id(event.get("gt_frame_before")),frame=id(event.get("frame"));
            Value timeEvidence=EvidenceValidator.contactTime(r,i);
            if(actor==null||frame==null||timeEvidence.status()!=Status.OBSERVED||EvidenceValidator.collisionEventInvalid(r,issues,i)) {
                rejectedRefs.addAll(timeEvidence.sourceRefs());rejectedRefs.add(r.ref("collisions","/"+i));
                rejectedReasons.addAll(timeEvidence.reasonCodes());rejectedReasons.add("CONTACT_EVENT_QUARANTINED");continue;
            }
            double time=((Number)timeEvidence.value()).doubleValue();
            // Target identity is independent of gt_frame_before and velocity reconstruction.
            int bindingRow=-1;BigInteger bindingFrame=null,latestFrame=null;
            for(int j=0;j<gt.size();j++) {
                var row=gt.get(j);String f=id(row.get("frame"));Double t=n(row.get("sim_time_s"));if(f==null)continue;
                BigInteger worldFrame=new BigInteger(f),hitFrame=new BigInteger(frame);
                if(worldFrame.compareTo(hitFrame)<0&&(latestFrame==null||worldFrame.compareTo(latestFrame)>0))latestFrame=worldFrame;
                if("target".equals(row.get("role"))&&actor.equals(id(row.get("actor_id")))&&t!=null&&t>=0&&t<=time
                        &&worldFrame.compareTo(hitFrame)<=0&&(bindingFrame==null||worldFrame.compareTo(bindingFrame)>0)) {
                    bindingRow=j;bindingFrame=worldFrame;
                }
            }
            if(bindingRow<0) {rejectedRefs.add(r.ref("collisions","/"+i));rejectedReasons.add("CONTACT_TARGET_BINDING_UNRESOLVED");continue;}
            List<SourceRef> refs=new ArrayList<>(timeEvidence.sourceRefs());refs.add(r.ref("ground_truth","/"+bindingRow));
            List<String> reasons=new ArrayList<>();Map<String,Object> ego=null,target=null;
            if(before==null)reasons.add("PRECONTACT_FRAME_MISSING_OR_INVALID");
            else if(latestFrame==null||!new BigInteger(before).equals(latestFrame))reasons.add("PRECONTACT_SNAPSHOT_NOT_LATEST");
            else {
                for(int j=0;j<gt.size();j++) {
                    var row=gt.get(j);if(!before.equals(id(row.get("frame"))))continue;
                    if("ego".equals(row.get("role"))){ego=row;refs.add(r.ref("ground_truth","/"+j));}
                    if("target".equals(row.get("role"))&&actor.equals(id(row.get("actor_id")))){target=row;refs.add(r.ref("ground_truth","/"+j));}
                }
                Double preTime=ego==null?null:n(ego.get("sim_time_s")),targetTime=target==null?null:n(target.get("sim_time_s"));
                Double dt=carla(r)?num(r,"result","/outcome/case/carla/fixed_delta_seconds"):null;
                refs.add(r.ref("result","/outcome/case/carla/fixed_delta_seconds"));
                if(ego==null||target==null||preTime==null||targetTime==null||preTime<0||Math.abs(preTime-targetTime)>EvidenceValidator.CLOCK_EQUALITY_S
                        ||preTime>=time||!snapshotClockConsistent(r,before,preTime))reasons.add("PRECONTACT_CLOCK_OR_PAIR_UNRESOLVED");
                else if(dt==null||dt<=0)reasons.add("PRECONTACT_AGE_POLICY_MISSING");
                else if(!new BigInteger(before).add(BigInteger.ONE).equals(new BigInteger(frame))
                        ||Math.abs((time-preTime)-dt)>EvidenceValidator.CLOCK_EQUALITY_S)reasons.add("PRECONTACT_ADJACENT_STEP_SUPPORT_MISSING");
            }
            Double recorded=n(event.get("relative_speed_before_ms"));if(recorded!=null&&recorded<0)recorded=null;
            Double relative=null,egoSpeed=null;
            if(reasons.isEmpty()) {
                double[] ev=vector(ego),tv=vector(target);
                if(ev!=null&&tv!=null){relative=relativeVelocity(ev[0],ev[1],ev[2],tv[0],tv[1],tv[2]);egoSpeed=Math.hypot(Math.hypot(ev[0],ev[1]),ev[2]);}
                else reasons.add("PRECONTACT_VELOCITY_VECTOR_MISSING");
            }
            List<String> assumptions=List.of("Declared fixed step and adjacent world snapshots support one recorded pre-contact interval; not a physical impact interpolation/age certificate",
                    "Declared pre-contact frame must be the latest recorded world snapshot before the event; no stale or post-impact substitution",
                    "Vector reconstruction uses the recorded CARLA world snapshot; reported live scalar is a separate source");
            String vectorReason=reasons.isEmpty()?"PRECONTACT_VECTOR_RECONSTRUCTION":reasons.getFirst();
            Map<String,Object> vectorRelative=relative==null?value(null,Status.UNKNOWN,"m/s","recorder",refs,vectorReason).json():calculated(relative,"I01","m/s","recorder","CARLA_WORLD",refs,assumptions);
            Map<String,Object> vectorEgo=egoSpeed==null?value(null,Status.UNKNOWN,"m/s","recorder",refs,vectorReason).json():calculated(egoSpeed,"I01","m/s","recorder","CARLA_WORLD",refs,assumptions);
            Map<String,Object> output=obj("admissible_recorded_contact",true,"basis","RECORDED_MATCHING_CONTACT","claim_level","OBSERVED_EVENT",
                    "contact_time",timeEvidence.json(),
                    "event_frame",frame,"preimpact_frame",before,"target_actor_id",actor,
                    "impulse",r.read("collisions","/"+i+"/impulse_ns","N\u00b7s","recorder").json(),
                    "recorded_relative_speed",recorded==null?value(null,event.get("relative_speed_before_ms")==null?Status.UNKNOWN:Status.INVALID,"m/s","recorder",
                            List.of(r.ref("collisions","/"+i+"/relative_speed_before_ms")),"RECORDED_CONTACT_SPEED_MISSING_OR_INVALID").json():observed(recorded,"m/s","recorder",r.ref("collisions","/"+i+"/relative_speed_before_ms")),
                    "vector_relative_speed",vectorRelative,"vector_ego_speed",vectorEgo,
                    "reported_minus_vector",recorded!=null&&relative!=null?calculated(recorded-relative,"I01","m/s","recorder","CARLA_WORLD",refs,assumptions,"SAMPLING_BASIS_DIFFERENCE_NOT_RECONCILED"):missing("CONTACT_SPEED_BASIS_INCOMPLETE","m/s"),
                    "reason_codes",reasons);
            Contact candidate=new Contact(true,time,frame,recorded,relative,egoSpeed,List.copyOf(refs),List.copyOf(reasons),output);
            if(earliest==null||time<earliest.time())earliest=candidate;
        }
        if(earliest!=null)return earliest;
        String code=events.isEmpty()?"NO_RECORDED_CONTACT":rejectedReasons.isEmpty()?"CONTACT_ACTOR_OR_EPISODE_UNRESOLVED":rejectedReasons.getFirst();
        return absent(code,rejectedRefs);
    }
    private static boolean snapshotClockConsistent(Run r,String frame,double expected) {
        Map<String,Map<String,Object>> actors=new HashMap<>();
        for(String name:List.of("ground_truth","frames"))for(var row:rows(r,name,""))if(frame.equals(id(row.get("frame")))) {
            Double time=n(row.get("sim_time_s"));if(time==null||Math.abs(time-expected)>EvidenceValidator.CLOCK_EQUALITY_S)return false;
            if(name.equals("ground_truth")) {
                var previous=actors.putIfAbsent(Objects.toString(row.get("actor_id")),row);
                if(previous!=null)for(String field:List.of("role","vx_ms","vy_ms","vz_ms"))
                    if(!sameNumber(previous.get(field),row.get(field)))return false;
            }
        }
        return true;
    }
    private static String id(Object x) {return x!=null&&x.toString().matches("\\d+")?x.toString():null;}
    private static double[] vector(Map<String,Object> row) {
        Double x=n(row.get("vx_ms")),y=n(row.get("vy_ms")),z=n(row.get("vz_ms"));return x==null||y==null||z==null?null:new double[]{x,y,z};
    }
    private static Contact absent(String code) {
        return absent(code,List.of());
    }
    private static Contact absent(String code,List<SourceRef> refs) {
        return new Contact(false,null,null,null,null,null,List.copyOf(refs),List.of(code),obj("admissible_recorded_contact",false,
                "contact_time",value(null,Status.UNKNOWN,"s","recorder",refs,code).json(),
                "recorded_relative_speed",value(null,Status.UNKNOWN,"m/s","recorder",refs,code).json(),
                "vector_relative_speed",value(null,Status.UNKNOWN,"m/s","recorder",refs,code).json(),
                "vector_ego_speed",value(null,Status.UNKNOWN,"m/s","recorder",refs,code).json(),"reason_codes",List.of(code,"CONTACT_COVERAGE_UNPROVEN")));
    }
    public Map<String,Object> compare(Run on,Run off,Contact a,Contact b) {
        if(off==null)return obj("pairing_status","UNKNOWN","observed_speed_reduction",missing("PAIRED_OFF_RUN_MISSING","m/s"));
        List<String> missing=new ArrayList<>();
        if(!modeIs(on,"ON")||!modeIs(off,"OFF"))missing.add("ON_OFF_MODE_PAIR_INVALID");
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
