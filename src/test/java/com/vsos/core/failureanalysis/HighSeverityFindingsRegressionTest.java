package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.nio.file.*;
import java.util.*;
import java.util.function.Consumer;
import static com.vsos.core.failureanalysis.Evidence.*;
import static org.assertj.core.api.Assertions.*;

/** Real pipeline regressions; mutations are synthetic and never written into Golden18. */
class HighSeverityFindingsRegressionTest {
    private static final Map<String,Run> RUNS = new HashMap<>();
    @BeforeAll static void loadGolden18() throws Exception {
        Path zip=Path.of(System.getProperty("golden18.zip","D:/Downloads/golden18_raw_artifacts.zip"));
        Assumptions.assumeTrue(Files.isRegularFile(zip),"BLOCKED: actual Golden18 archive unavailable: "+zip);
        try(var adapter=new RawArtifactAdapter(zip)) {
            for(String dir:adapter.runDirectories()) {
                Run r=adapter.read(dir);
                if(Set.of("FA-G1-007-R1","FA-G1-004-R1","FA-G1-011-R1","FA-G2-026-R1").contains(r.runKey()))RUNS.put(r.runKey(),r);
            }
        }
        assertThat(RUNS).hasSize(4);
    }
    @SuppressWarnings("unchecked") private static Map<String,Object> map(Object x){return (Map<String,Object>)x;}
    @SuppressWarnings("unchecked") private static List<Object> list(Object x){return (List<Object>)x;}
    private static Object copy(Object x){return MiniJson.parse(MiniJson.write(x));}
    private static Run change(Run r,String name,Consumer<Object> edit) {
        Object data=copy(r.artifact(name).data());edit.accept(data);Artifact old=r.artifact(name);
        var artifacts=new LinkedHashMap<>(r.artifacts());
        artifacts.put(name,new Artifact(old.id(),r.runKey(),"SYNTHETIC_REGRESSION:"+old.uri(),sha256(MiniJson.write(data)),old.mediaType(),Integrity.VERIFIED,data,List.of()));
        return new Run(r.runKey(),r.caseKey(),r.directory(),artifacts,r.identityIssues());
    }
    private static Run contact(){return RUNS.get("FA-G1-007-R1");}
    private static Run braking(){return RUNS.get("FA-G1-004-R1");}
    private static Map<String,Object> report(Run r) {
        var d=new DiagnosticReport().analyze(r);
        for(String key:CanonicalObjectiveReader.KEYS) {
            Object expected="vehicsim.result/v1".equals(r.get("result","/format"))?r.get("result","/outcome/metrics/"+key):null;
            assertThat(at(d,"/report/objectives/"+key+"/canonical_value/value")).as(key).isEqualTo(expected);
        }
        assertThat(d.get("content_digest")).isEqualTo(EvidenceReport.contentDigest(d));
        assertThat(at(d,"/report/confirmed_root_cause/value")).isNull();
        assertRegisteredRefs(d,d);
        return d;
    }
    private static void assertRegisteredRefs(Object node,Map<String,Object> report) {
        if(node instanceof Map<?,?> m) {
            if(m.containsKey("artifact_id")) {
                String id=Objects.toString(m.get("artifact_id"));
                assertThat(list(at(report,"/input/artifacts")).stream().anyMatch(a->id.equals(at(a,"/id")))).as("registered source %s",id).isTrue();
            }
            m.values().forEach(v->assertRegisteredRefs(v,report));
        } else if(node instanceof List<?> l)l.forEach(v->assertRegisteredRefs(v,report));
    }
    private static void inconclusive(Map<String,Object> d) {
        assertThat(at(d,"/report/observed_behavior/value")).isEqualTo("UNKNOWN");
        assertThat(at(d,"/report/functional_assessment/value")).isEqualTo("INCONCLUSIVE");
        assertThat(list(at(d,"/report/failure_candidates"))).isEmpty();
    }
    private static void positive(Map<String,Object> d) {
        assertThat(at(d,"/report/physical_outcome/value")).isEqualTo("COLLISION");
        assertThat(at(d,"/report/impact_analysis/admissible_recorded_contact")).isEqualTo(true);
        assertThat(at(d,"/report/impact_analysis/recorded_relative_speed/value")).isEqualTo(13.935);
    }
    @ParameterizedTest @ValueSource(strings={"CONFLICTING","INVALID","UNKNOWN"})
    void unresolvedModeCannotActAsOnAndDoesNotEraseContact(String status) {
        Run r=change(contact(),"result",x->{
            map(at(x,"/outcome/case")).put("aeb_mode",status.equals("INVALID")?"invalid-mode":"ON");
            if(status.equals("UNKNOWN")){map(at(x,"/outcome/case")).remove("aeb_mode");map(x).remove("format");}
        });
        r=change(r,"manifest",x->{for(Object row:list(x))if((contact().directory()+"/result.json").equals(at(row,"/path_in_zip"))) {
            if(status.equals("CONFLICTING"))map(row).put("control_type","AEB_OFF");
            else map(row).remove("control_type");
        }});
        var d=report(r);assertThat(at(d,"/input/mode/status")).isEqualTo(status);
        inconclusive(d);positive(d);
        assertThat(at(d,"/report/geometry_results/0/conflict/value")).isEqualTo(true);
    }
    @ParameterizedTest @ValueSource(strings={"NEGATIVE_PAIR","OUTSIDE_EPISODE","COMMAND_BEFORE_DECISION","DECISION_BEFORE_DETECTION","NONFINITE","BAD_TYPE"})
    void invalidEventTimesCannotBecomeValidCommandEvidence(String kind) {
        Run r=change(braking(),"result",x->{var m=map(at(x,"/outcome/metrics"));
            switch(kind) {
                case "NEGATIVE_PAIR"->{m.put("aeb_decision_t",-1.0);m.put("brake_onset_t",-.75);}
                case "OUTSIDE_EPISODE"->{m.put("aeb_decision_t",5000.0);m.put("brake_onset_t",5000.25);}
                case "COMMAND_BEFORE_DECISION"->m.put("brake_onset_t",0.0);
                case "DECISION_BEFORE_DETECTION"->m.put("first_detection_t",3.0);
                case "NONFINITE"->m.put("brake_onset_t","Infinity");
                case "BAD_TYPE"->m.put("aeb_decision_t",List.of(1));
                default->throw new AssertionError(kind);
            }
        });
        var d=report(r);inconclusive(d);
        String key=kind.equals("DECISION_BEFORE_DETECTION")||kind.equals("BAD_TYPE")?"decision":"command_onset";
        assertThat(at(d,"/report/aeb_timeline/"+key+"/value")).isNull();
        assertThat(list(at(d,"/report/aeb_timeline/"+key+"/source_refs"))).isNotEmpty();
        assertThat(at(d,"/report/aeb_timeline/command_latency/value")).isNull();
        assertThat(at(d,"/report/geometry_results/0/conflict/value")).isNotNull();
    }
    @Test void invalidCommandTimeDoesNotEraseIndependentPositiveContact() {
        var d=report(change(contact(),"result",x->map(at(x,"/outcome/metrics")).put("brake_onset_t",-1.0)));
        positive(d);inconclusive(d);
    }
    @Test void validRightCensoredDecisionIsStillPending() {
        var d=report(RUNS.get("FA-G1-011-R1"));
        assertThat(at(d,"/report/observed_behavior/value")).isEqualTo("AEB_DECISION_PENDING");
        assertThat(at(d,"/report/aeb_timeline/scheduled_command/value")).isEqualTo(5.15);
        assertThat(at(d,"/report/aeb_timeline/response_window")).isEqualTo("RIGHT_CENSORED");
    }
    @ParameterizedTest @ValueSource(strings={"BACKWARDS","DUPLICATE","MISSING_ONSET","MISSING_END_TIME","INVALID_END_POSITION","NEGATIVE_END_SPEED","ONSET_OUTSIDE"})
    void stoppingBreakdownRequiresValidClockAndWindow(String kind) {
        Run r=change(braking(),"result",x->{var fs=list(at(x,"/outcome/frames"));var last=map(fs.getLast());
            switch(kind) {
                case "BACKWARDS"->last.put("t",0.0);
                case "DUPLICATE"->last.put("t",at(fs.get(fs.size()-2),"/t"));
                case "MISSING_ONSET"->map(at(x,"/outcome/metrics")).remove("brake_onset_t");
                case "MISSING_END_TIME"->last.remove("t");
                case "INVALID_END_POSITION"->last.put("ego_x","NaN");
                case "NEGATIVE_END_SPEED"->last.put("ego_v",-1.0);
                case "ONSET_OUTSIDE"->map(at(x,"/outcome/metrics")).put("brake_onset_t",5000.0);
                default->throw new AssertionError(kind);
            }
        });
        var d=report(r);
        for(String field:List.of("trace_component","extrapolated_component","replay_difference")) {
            var value=map(at(d,"/report/objectives/stopping_distance_m/decomposition/"+field));
            assertThat(value.get("value")).as(kind+":"+field).isNull();
            assertThat(value.get("status")).isIn("UNKNOWN","INVALID");
            assertThat(list(value.get("reason_codes"))).isNotEmpty();assertThat(list(value.get("source_refs"))).isNotEmpty();
        }
        assertThat(at(d,"/report/objectives/stopping_distance_m/decomposition/total_as_recorded/value")).isEqualTo(9.35);
    }
    @Test void staleDeclaredPrecontactSnapshotKeepsEventButAbstainsFromVector() {
        Object first=at(list(contact().get("ground_truth","")).getFirst(),"/frame");
        var d=report(change(contact(),"collisions",x->map(list(x).getFirst()).put("gt_frame_before",first)));
        positive(d);assertThat(at(d,"/report/impact_analysis/vector_relative_speed/value")).isNull();
        assertThat(list(at(d,"/report/impact_analysis/vector_relative_speed/reason_codes"))).contains("PRECONTACT_SNAPSHOT_NOT_LATEST");
    }
    @ParameterizedTest @ValueSource(strings={"OUTSIDE_EPISODE","FRAME_TIME_MISMATCH","INVALID_FRAME"})
    void invalidContactTemporalBindingCannotBecomeEpisodeContact(String kind) {
        var d=report(change(contact(),"collisions",x->{var e=map(list(x).getFirst());
            if(kind.equals("OUTSIDE_EPISODE"))e.put("sim_time_s",50000.0);
            else if(kind.equals("FRAME_TIME_MISMATCH"))e.put("sim_time_s",5.785);
            else e.put("frame","invalid");
        }));
        assertThat(at(d,"/report/impact_analysis/admissible_recorded_contact")).isEqualTo(false);
        assertThat(at(d,"/report/physical_outcome/value")).isNull();
        assertThat(at(d,"/report/impact_analysis/contact_time/value")).isNull();
        assertThat(at(d,"/report/geometry_results/0/conflict/value")).isEqualTo(true);
    }
    @Test void eventGtAndCsvFrameTimesMustAgree() {
        Object eventFrame=at(list(contact().get("collisions","")).getFirst(),"/frame");
        Run r=change(contact(),"ground_truth",x->{for(Object row:list(x))if(eventFrame.toString().equals(at(row,"/frame").toString()))map(row).put("sim_time_s",5.785);});
        var d=report(r);assertThat(at(d,"/report/physical_outcome/value")).isNull();
        assertThat(at(d,"/report/impact_analysis/admissible_recorded_contact")).isEqualTo(false);
    }
    @ParameterizedTest @ValueSource(strings={"MISSING_PRECONTACT","MISSING_VECTOR","NO_AGE_POLICY","PRECONTACT_TIME_CONFLICT","PRECONTACT_TIME_AFTER_EVENT","GAP_BEFORE_EVENT"})
    void reconstructionFailuresDoNotEraseValidEventScalar(String kind) {
        Run r=contact();Object before=at(list(r.get("collisions","")).getFirst(),"/gt_frame_before");
        if(kind.equals("MISSING_PRECONTACT"))r=change(r,"collisions",x->map(list(x).getFirst()).remove("gt_frame_before"));
        if(kind.equals("NO_AGE_POLICY"))r=change(r,"result",x->map(at(x,"/outcome/case/carla")).remove("fixed_delta_seconds"));
        if(kind.equals("MISSING_VECTOR")||kind.startsWith("PRECONTACT_TIME_"))r=change(r,"ground_truth",x->{for(Object row:list(x))
            if(before.toString().equals(at(row,"/frame").toString())&&"target".equals(at(row,"/role"))) {
                if(kind.equals("MISSING_VECTOR"))map(row).remove("vx_ms");else map(row).put("sim_time_s",kind.equals("PRECONTACT_TIME_AFTER_EVENT")?50000.0:5.775);
            }
        });
        if(kind.equals("GAP_BEFORE_EVENT")) {
            r=change(r,"ground_truth",x->list(x).removeIf(row->before.toString().equals(at(row,"/frame").toString())));
            r=change(r,"collisions",x->map(list(x).getFirst()).put("gt_frame_before",Long.parseLong(before.toString())-1));
        }
        var d=report(r);positive(d);
        assertThat(at(d,"/report/impact_analysis/vector_relative_speed/value")).isNull();
        assertThat(list(at(d,"/report/impact_analysis/vector_relative_speed/source_refs"))).isNotEmpty();
    }
    @ParameterizedTest @ValueSource(strings={"OTHER_ACTOR","OTHER_SENSOR","ANOTHER_CALLBACK","EXACT_REPEAT","CORRUPT_ROW","CORRUPT_EVENT","UNRELATED_ID_CONFLICT"})
    void independentOrCorruptEventsCannotEraseMatchingContact(String kind) {
        Run r=change(contact(),"collisions",x->{var es=list(x);var extra=map(copy(es.getFirst()));
            switch(kind) {
                case "OTHER_ACTOR"->extra.put("other_actor_id",999999999);
                case "OTHER_SENSOR"->{map(es.getFirst()).put("sensor_id","one");extra.put("sensor_id","two");}
                case "ANOTHER_CALLBACK"->extra.put("relative_speed_before_ms",13.936);
                case "EXACT_REPEAT"->{}
                case "CORRUPT_ROW"->{es.add("corrupt");return;}
                case "CORRUPT_EVENT"->{extra.put("sim_time_s","NaN");extra.put("other_actor_id",null);}
                case "UNRELATED_ID_CONFLICT"->{extra.put("event_id","other");extra.put("other_actor_id",999999999);var conflict=map(copy(extra));conflict.put("relative_speed_before_ms",5.0);es.add(conflict);}
                default->throw new AssertionError(kind);
            }
            es.add(extra);
        });
        var d=report(r);positive(d);
        assertThat(new EvidenceValidator().validate(r)).extracting(Issue::code).doesNotContain("DUPLICATE_FRAME_DISAGREEMENT");
        assertThat(((Number)at(d,"/report/collision_evidence/sensor_event_count/value")).intValue()).isEqualTo(kind.equals("UNRELATED_ID_CONFLICT")?3:2);
    }
    @Test void explicitConflictingEventIdentityIsQuarantinedLocally() {
        Run r=change(contact(),"collisions",x->{var es=list(x);map(es.getFirst()).put("event_id","same");
            var extra=map(copy(es.getFirst()));extra.put("relative_speed_before_ms",2.0);es.add(extra);
        });
        var d=report(r);assertThat(at(d,"/report/impact_analysis/admissible_recorded_contact")).isEqualTo(false);
        assertThat(new EvidenceValidator().validate(r)).extracting(Issue::code).contains("COLLISION_EVENT_IDENTITY_CONFLICT");
        Run independent=change(r,"collisions",x->{var e=map(copy(list(x).getFirst()));e.put("event_id","independent");list(x).add(e);});
        positive(report(independent));
    }
    @Test void eventIdsAreScopedBySensorAndCanonicalFlagIsNotEventCount() {
        Run r=change(contact(),"collisions",x->{var es=list(x);map(es.getFirst()).put("event_id","1");map(es.getFirst()).put("sensor_id","a");
            var e=map(copy(es.getFirst()));e.put("sensor_id","b");e.put("relative_speed_before_ms",2.0);es.add(e);
        });
        r=change(r,"result",x->{map(at(x,"/outcome/metrics")).put("collision",false);map(at(x,"/evaluation/aeb_result")).put("collision",false);});
        var d=report(r);positive(d);
        assertThat(at(d,"/report/collision_evidence/canonical_collision/value")).isEqualTo(false);
        assertThat(((Number)at(d,"/report/collision_evidence/sensor_event_count/value")).intValue()).isEqualTo(2);
    }
    @Test void corruptContactCannotTruncateIndependentPedalTimeline() {
        var baseline=report(braking());assertThat(at(baseline,"/report/aeb_timeline/first_pedal_sample/value")).isNotNull();
        Run r=change(braking(),"collisions",x->{var event=map(copy(list(contact().get("collisions","")).getFirst()));
            event.put("sim_time_s",-1.0);list(x).add(event);
        });
        var d=report(r);
        assertThat(at(d,"/report/aeb_timeline/first_pedal_sample/value")).isEqualTo(at(baseline,"/report/aeb_timeline/first_pedal_sample/value"));
    }
    @Test void conflictingPrecontactVelocityRecordsDoNotErasePositiveContact() {
        Object before=at(list(contact().get("collisions","")).getFirst(),"/gt_frame_before");
        Run r=change(contact(),"ground_truth",x->{for(Object row:new ArrayList<>(list(x)))
            if(before.toString().equals(at(row,"/frame").toString())&&"ego".equals(at(row,"/role"))) {
                var extra=map(copy(row));extra.put("vx_ms",123.0);list(x).add(extra);break;
            }
        });
        var d=report(r);positive(d);assertThat(at(d,"/report/impact_analysis/vector_relative_speed/value")).isNull();
    }
    @Test void unrelatedRecorderClockConflictDoesNotEraseSupportedContactOrVector() {
        Run r=change(contact(),"ground_truth",x->map(list(x).getFirst()).put("sim_time_s",.005));
        var d=report(r);positive(d);assertThat(at(d,"/report/impact_analysis/vector_relative_speed/value")).isNotNull();
        assertThat(new EvidenceValidator().validate(r)).extracting(Issue::code).contains("CLOCK_MISMATCH");
    }
    @Test void invalidRecordedScalarDoesNotEraseContactOrIndependentVector() {
        Run r=change(contact(),"collisions",x->map(list(x).getFirst()).put("relative_speed_before_ms","NaN"));
        var d=report(r);
        assertThat(at(d,"/report/physical_outcome/value")).isEqualTo("COLLISION");
        assertThat(at(d,"/report/impact_analysis/recorded_relative_speed/value")).isNull();
        assertThat(at(d,"/report/impact_analysis/recorded_relative_speed/status")).isEqualTo("INVALID");
        assertThat(at(d,"/report/impact_analysis/vector_relative_speed/value")).isNotNull();
    }
    @Test void nonfiniteTailDoesNotBecomeReplayProofOrEraseValidTrace() {
        Run r=change(braking(),"result",x->map(at(x,"/outcome/metrics")).put("decel_available_mps2",Double.MIN_VALUE));
        var d=report(r);
        assertThat(at(d,"/report/objectives/stopping_distance_m/decomposition/trace_component/value")).isNotNull();
        for(String field:List.of("extrapolated_component","replay_difference")) {
            var v=map(at(d,"/report/objectives/stopping_distance_m/decomposition/"+field));
            assertThat(v.get("value")).isNull();assertThat(list(v.get("source_refs"))).isNotEmpty();
        }
    }
    @Test void matchingEventGtAndCsvOutlierStillNeedsValidEpisodeContext() {
        Object frame=at(list(contact().get("collisions","")).getFirst(),"/frame");
        Run r=change(contact(),"collisions",x->map(list(x).getFirst()).put("sim_time_s",50000.0));
        for(String name:List.of("ground_truth","frames"))r=change(r,name,x->{for(Object row:list(x))
            if(frame.toString().equals(at(row,"/frame").toString()))map(row).put("sim_time_s",50000.0);
        });
        var d=report(r);assertThat(at(d,"/report/physical_outcome/value")).isNull();
        assertThat(at(d,"/report/impact_analysis/admissible_recorded_contact")).isEqualTo(false);
        assertThat(list(at(d,"/report/impact_analysis/reason_codes"))).contains("COLLISION_EVENT_EPISODE_ORDER_INVALID");
    }
}
