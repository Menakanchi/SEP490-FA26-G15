package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Audit-only observations. Mutations are synthetic negative fixtures, never new CARLA data. */
public class FinalAuditProbe {
    static Map<String,Object> map(Object x){return (Map<String,Object>)x;}
    static List<Object> list(Object x){return (List<Object>)x;}
    static Object copy(Object x){return MiniJson.parse(MiniJson.write(x));}
    static Run replace(Run r,String name,Object data){
        Artifact old=r.artifact(name);Map<String,Artifact> artifacts=new LinkedHashMap<>(r.artifacts());
        artifacts.put(name,new Artifact(old.id(),r.runKey(),"SYNTHETIC_AUDIT_MUTATION:"+old.uri(),sha256(MiniJson.write(data)),old.mediaType(),Integrity.VERIFIED,data,List.of()));
        return new Run(r.runKey(),r.caseKey(),r.directory(),artifacts,List.of());
    }
    static Object path(Object x,String p){return at(x,p);}
    static Map<String,Object> summary(Run r){var d=new DiagnosticReport().analyze(r);
        return obj("mode",at(d,"/input/mode"),"outcome",at(d,"/report/physical_outcome"),"behavior",at(d,"/report/observed_behavior"),
                "candidates",at(d,"/report/failure_candidates"),"validation",at(d,"/report/validation"),
                "nominal_conflict",at(d,"/report/geometry_results/0/conflict"),
                "decomposition",at(d,"/report/objectives/stopping_distance_m/decomposition"),
                "contact",at(d,"/report/impact_analysis"));}
    public static void main(String[] args)throws Exception{
        Path out=Path.of(args[1]);Map<String,Run> runs=new HashMap<>();
        try(var adapter=new RawArtifactAdapter(Path.of(args[0]))){for(String p:adapter.runDirectories()){Run r=adapter.read(p);if(Set.of("FA-G1-007-R1","FA-G1-004-R1").contains(r.runKey()))runs.put(r.runKey(),r);}}
        Run contact=runs.get("FA-G1-007-R1"),braking=runs.get("FA-G1-004-R1");
        Objects.requireNonNull(contact);Objects.requireNonNull(braking);Map<String,Object> probes=new LinkedHashMap<>();

        Object result=copy(contact.get("result",""));map(at(result,"/outcome/case")).put("aeb_mode","ON");
        Run conflicted=replace(contact,"result",result);Object manifest=copy(contact.get("manifest",""));
        for(Object row:list(manifest))if((contact.directory()+"/result.json").equals(at(row,"/path_in_zip")))map(row).put("control_type","AEB_OFF");
        conflicted=replace(conflicted,"manifest",manifest);probes.put("MODE_CONFLICT_STILL_DIAGNOSED",summary(conflicted));

        result=copy(braking.get("result",""));List<Object> frames=list(at(result,"/outcome/frames"));map(frames.getLast()).put("t",0.0);
        probes.put("BACKWARDS_CLOCK_STOPPING_DECOMPOSITION",summary(replace(braking,"result",result)));

        Object events=copy(contact.get("collisions",""));Map<String,Object> event=map(list(events).getFirst());
        String actor=Objects.toString(event.get("other_actor_id"));Object earliest=null;
        for(Object row:list(contact.get("ground_truth","")))if("target".equals(at(row,"/role"))&&actor.equals(Objects.toString(at(row,"/actor_id")))){earliest=at(row,"/frame");break;}
        event.put("gt_frame_before",earliest);probes.put("STALE_PRECONTACT_FRAME",summary(replace(contact,"collisions",events)));

        events=copy(contact.get("collisions",""));Object extra=copy(list(events).getFirst());map(extra).put("other_actor_id",999999999);
        list(events).add(extra);probes.put("MULTIPLE_CONTACTS_ONE_WORLD_FRAME",summary(replace(contact,"collisions",events)));

        events=copy(contact.get("collisions",""));map(list(events).getFirst()).put("sim_time_s",50000.0);
        probes.put("CONTACT_EVENT_OUTSIDE_RECORDED_EPISODE",summary(replace(contact,"collisions",events)));
        result=copy(braking.get("result",""));map(at(result,"/outcome/metrics")).put("aeb_decision_t",-1.0);
        map(at(result,"/outcome/metrics")).put("brake_onset_t",-.75);
        probes.put("NEGATIVE_TIMELINE_EVENT_TIMES",summary(replace(braking,"result",result)));

        var fixture=M1CFixture.create();var h=M1CFixture.build(fixture);
        Run kinematic=fixture.input().members().getFirst().run();
        var parametersK=com.vsos.core.aeb.AebParams.DEFAULT;
        var outcomeK=com.vsos.core.simulation.Simulator.simulate(new com.vsos.core.simulation.CrossingCase(40,30,1.5,false,"CLEAR","DAY",.8),parametersK,42,
                com.vsos.core.simulation.VehicleSpec.DEFAULT);
        result=obj("format","vehicsim.result/v1","engine","vsos-core-java/1","simulator","vehicsim-kinematic-1.4","seed",42,"source",obj(),
                "outcome",outcomeK.asDict(),"evaluation",com.vsos.core.evaluation.Evaluation.evaluate(outcomeK,parametersK).toDocument());
        var kr=new DiagnosticReport().analyze(replace(kinematic,"result",result));
        probes.put("KINEMATIC_PROFILE_EXPLANATION",obj("scope","SYNTHETIC_ACTUAL_KINEMATIC_PRODUCER_FIXTURE_NOT_CARLA",
                "signal",at(kr,"/report/objectives/rms_jerk_mps3/signal"),"window",at(kr,"/report/objectives/rms_jerk_mps3/window"),
                "explanation",at(kr,"/report/objectives/rms_jerk_mps3/explanation")));
        Map<String,Object> hint=map(list(h.get("parameter_hints")).getFirst());
        probes.put("POSITIVE_SYNTHETIC_HINT_REFERENCES",obj("evidence_scope","SYNTHETIC_TEST_ONLY","hint",hint,
                "report_hypothesis_ids",list(at(fixture.reports().getFirst(),"/report/root_cause_hypotheses")).stream().map(x->at(x,"/id")).toList(),
                "report_candidate_ids",list(at(fixture.reports().getFirst(),"/report/failure_candidates")).stream().map(x->at(x,"/id")).toList()));

        // Invalid canonical sample must not crash a report-producing validator.
        Map<String,Object> bad=M1CFixture.mutable(h);M1CFixture.set(bad,"/members/0/canonical_sample/jerk","wrong-type");
        bad.put("content_digest",HandoffSnapshots.digest(bad));
        try{var c=new ConsumerCompatibilityValidator().validate(M1CFixture.artifact("negative-handoff",bad),ConsumerSourceInspection.read(Path.of(".")));
            probes.put("WRONG_TYPED_CANONICAL_SAMPLE",obj("overall",c.get("overall"),"findings",c.get("findings")));}
        catch(RuntimeException e){probes.put("WRONG_TYPED_CANONICAL_SAMPLE",obj("exception",e.getClass().getName(),"message",e.getMessage()));}

        bad=M1CFixture.mutable(h);map(at(bad,"/members/0/seed")).remove("status");map(at(bad,"/members/0/seed")).remove("source_refs");
        map(at(bad,"/dataset/cohort_digest")).put("value",HandoffSnapshots.digest(obj("selection_sha256",at(bad,"/dataset/snapshot_digest/value"),"members",bad.get("members"))));
        bad.put("content_digest",HandoffSnapshots.digest(bad));
        var malformed=new ConsumerCompatibilityValidator().validate(M1CFixture.artifact("malformed-ev",bad),ConsumerSourceInspection.read(Path.of(".")));
        probes.put("MISSING_NESTED_EV_STATUS",obj("schema",at(malformed,"/input_validation/schema"),"integrity",at(malformed,"/input_validation/integrity"),
                "identity",at(malformed,"/identity_partition_compatibility/status"),"overall",malformed.get("overall"),"findings",malformed.get("findings")));

        List<Map<String,Object>> stops=new ArrayList<>();
        for(double[] v:new double[][]{{11.1,8,20,.25},{50./3.6,8,20,.25},{50./3.6,6.3765,20,.25},{1,8,20,.25},{0,8,20,.25},{1.6,8,20,.25},{1.6-1e-8,8,20,.25},{1.6+1e-8,8,20,.25}}){
            var s=StoppingModel.stop(v[0],new StoppingModel.Parameters(v[1],v[2],v[3]));
            stops.add(obj("v",v[0],"cap",v[1],"jerk",v[2],"delay",v[3],"distance",s.distanceM(),"time",s.seconds(),"during_ramp",s.duringBuildup()));}
        var body=new GeometryEngine.Body(4,2,.5,"test-clock","test-frame",1);
        var tangent=GeometryEngine.analyze(List.of(state(0,2.3,1.4),state(1,2.3,1.4)),body);
        var corner=GeometryEngine.analyze(List.of(state(0,2.4,1.4),state(1,2.4,1.4)),body);
        var full=GeometryEngine.analyze(List.of(new GeometryEngine.State(0,new GeometryEngine.Vec(-2.5,0),new GeometryEngine.Vec(3,3),0),
                new GeometryEngine.State(1,new GeometryEngine.Vec(7.5,0),new GeometryEngine.Vec(3,-3),0)),new GeometryEngine.Body(5,2,.3,"clock","frame",1));
        var missing=GeometryEngine.analyze(List.of(state(0,2.3,1.4),state(1,2.3,1.4)),new GeometryEngine.Body(4,2,.5,null,"frame",1));
        var disjoint=GeometryEngine.pet(new GeometryEngine.Interval(1,2),new GeometryEngine.Interval(3,4),"area","clock");
        var overlap=GeometryEngine.pet(new GeometryEngine.Interval(1,3),new GeometryEngine.Interval(2,4),"area","clock");
        var parameters=new StoppingModel.Parameters(8,20,.25);double distance=StoppingModel.stop(50./3.6,parameters).distanceM();
        var inverse=StoppingModel.requiredEnvelope(50./3.6,distance,20,.25,0,8);
        Map<String,Object> numerics=obj("stops",stops,"friction_cap",StoppingModel.availableDeceleration(8.,9.5,9.13,.65).cap(),
                "relative_crossing",ImpactAnalyzer.relativeVelocity(10,0,0,0,2,0),"corner_tangent",geometry(tangent),"corner_separated",geometry(corner),"full_body",geometry(full),
                "missing_clock",geometry(missing),"pet_disjoint",obj("seconds",disjoint.seconds(),"relation",disjoint.relation()),"pet_overlap",obj("seconds",overlap.seconds(),"relation",overlap.relation()),
                "margin_boundary",StoppingModel.margin(distance,distance,0),"inverse_boundary",inverse.requiredCap(),"inverse_below_boundary",StoppingModel.requiredEnvelope(50./3.6,distance-1e-7,20,.25,0,8).status(),
                "ttc_nonclosing",GeometryEngine.longitudinalTtc(10,-1));
        Files.writeString(out,MiniJson.write(obj("scope","AUDIT_ONLY_SYNTHETIC_NEGATIVE_MUTATIONS_AND_EXACT_MODEL_FIXTURES","production_modified",false,"observations",probes,"numerics",numerics)),StandardOpenOption.CREATE_NEW);
        System.out.println("Audit observations written "+out);
    }
    static GeometryEngine.State state(double t,double x,double y){return new GeometryEngine.State(t,new GeometryEngine.Vec(0,0),new GeometryEngine.Vec(x,y),0);}
    static Map<String,Object> geometry(GeometryEngine.Result g){return obj("conflict",g.conflict(),"clearance",g.minimumClearance(),"signed",g.minimumSignedIndicator(),"complete",g.complete(),"reasons",g.reasons(),
            "longitudinal",g.longitudinal().stream().map(i->obj("start",i.start(),"end",i.end())).toList(),"lateral",g.lateral().stream().map(i->obj("start",i.start(),"end",i.end())).toList());}
}
