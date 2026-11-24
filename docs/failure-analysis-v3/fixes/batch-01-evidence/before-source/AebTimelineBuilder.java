package com.vsos.core.failureanalysis;

import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.DiagnosticSupport.*;

/** T01: core command timing, recorder readback, and physical onset are independent evidence. */
public final class AebTimelineBuilder {
    public record Timeline(String behavior,boolean off,Double detection,Double decision,Double command,Double scheduled,
                           Double coreEnd,boolean pending,Double firstPedal,boolean unattributedPedal,Map<String,Object> json) {}
    public Timeline build(Run r,List<Issue> issues) {
        String mode=Objects.toString(EvidenceReport.mode(r).value(),"UNKNOWN"); boolean off=mode.equals("OFF");
        boolean coreBlocked=blocked(r,issues,"result");
        Double detection=coreBlocked?null:num(r,"result","/outcome/metrics/first_detection_t"),q=coreBlocked?null:num(r,"result","/outcome/metrics/aeb_decision_t"),
                b=off||coreBlocked?null:num(r,"result","/outcome/metrics/brake_onset_t"),delay=num(r,"result","/outcome/params/brake_activation_delay");
        var frames=rows(r,"result","/outcome/frames");
        Double end=frames.isEmpty()?null:n(frames.getLast().get("t"));
        Double due=q!=null&&delay!=null&&delay>=0&&profile(r)?q+delay+COMMAND_DELAY:null;
        boolean pending=!off&&q!=null&&b==null&&due!=null&&end!=null&&end<due;
        Double first=null,contactTime=null;
        for(var event:rows(r,"collisions","")) {Double t=n(event.get("sim_time_s"));if(t!=null&&(contactTime==null||t<contactTime))contactTime=t;}
        if(!blocked(r,issues,"frames"))for(var f:rows(r,"frames","")) {
            Double t=n(f.get("sim_time_s")),pedal=n(f.get("brake"));
            if(t!=null&&t>=.5&&pedal!=null&&pedal>.05&&(contactTime==null||t<contactTime)){first=t;break;}
        }
        String behavior=off?"OFF_HYPOTHETICAL_ONLY":!mode.equals("ON")||coreBlocked?"UNKNOWN":b!=null?"AEB_COMMAND_ENGAGED":pending?"AEB_DECISION_PENDING":q==null?"NO_RECORDED_AEB_COMMAND":"COMMAND_ENGAGEMENT_UNRESOLVED";
        List<SourceRef> refs=refs(r,"/outcome/metrics/first_detection_t","/outcome/metrics/aeb_decision_t","/outcome/metrics/brake_onset_t","/outcome/frames");
        List<String> assumptions=List.of("Source command schedule delay=config activation_delay+0.10 s; continuous timing descriptor, not physical lag",
                "Recorder time is not aligned with the core clock; no universal offset applied");
        Map<String,Object> output=obj("behavior",behavior,"hypothetical",off,"detection",r.read("result","/outcome/metrics/first_detection_t","s","core").json(),
                "decision",r.read("result","/outcome/metrics/aeb_decision_t","s","core").json(),
                "command_onset",off?na("AEB_OFF_SHADOW_ONLY","s"):r.read("result","/outcome/metrics/brake_onset_t","s","core").json(),
                "scheduled_command",calculated(due,"T01","s","core",null,refs,assumptions,"SOURCE_SCHEDULE_CONDITIONAL"),
                "core_physics_end",calculated(end,"T01","s","core",null,refs,List.of()),
                "response_window",pending?"RIGHT_CENSORED":b!=null?"COMMAND_RECORDED":"UNKNOWN",
                "decision_latency",q!=null&&detection!=null?calculated(q-detection,"T01","s","core",null,refs,List.of()):missing("DETECTION_OR_DECISION_MISSING","s"),
                "command_latency",!off&&q!=null&&b!=null?calculated(b-q,"T01","s","core",null,refs,List.of()):off?na("AEB_OFF_SHADOW_ONLY","s"):missing(pending?"RESPONSE_WINDOW_RIGHT_CENSORED":"COMMAND_ONSET_MISSING","s"),
                "detection_from_observability",missing("OBSERVABILITY_UNPROVEN","s"),"physical_onset",missing("PHYSICAL_ONSET_POLICY_AND_BASELINE_MISSING","s"),
                "command_to_physical_delay",missing("CLOCK_ALIGNMENT_AND_PHYSICAL_ONSET_UNRESOLVED","s"),
                "first_pedal_sample",first==null?missing("NO_ELIGIBLE_PEDAL_SAMPLE","s"):calculated(first,"T01","s","recorder",null,List.of(r.ref("frames","")),
                        List.of("Recorder descriptive statistic: brake>0.05, time>=0.5s, pre-recorded-contact; not physical onset")),
                "control_activity",first==null?"NO_ELIGIBLE_PEDAL_SAMPLE":"CONTROL_ACTIVITY_UNATTRIBUTED",
                "control_writer",missing("CONTROL_WRITER_UNKNOWN",null),"physics_consumption",missing("PHYSICS_CONSUMPTION_UNKNOWN",null));
        return new Timeline(behavior,off,detection,q,b,due,end,pending,first,first!=null,output);
    }
}
