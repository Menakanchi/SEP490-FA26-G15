package com.vsos.core.failureanalysis;

import java.nio.file.*;
import java.util.*;
import com.vsos.core.common.MiniJson;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

/** Review evidence only. Uses the same positive synthetic fixture as the executed tests. */
class Batch02Evidence {
    static Path out;
    static void write(String name,Object value)throws Exception{Files.writeString(out.resolve(name),MiniJson.write(value),StandardOpenOption.CREATE_NEW);}
    static Map<String,Object> validate(Map<String,Object> h,M1CFixture.Cohort f,ConsumerSourceInspection.Profile s,Artifact probe){
        return new ConsumerCompatibilityValidator().validate(new ConsumerCompatibilityValidator.Input(M1CFixture.artifact("h",h),s,probe,null,f.input()));}
    public static void main(String[] args)throws Exception{
        out=Path.of(args[0]);Files.createDirectories(out);
        var f=M1CFixture.create();var source=ConsumerSourceInspection.read(Path.of("."));var probe=M1DConsumerProbe.execute(source);
        var handoff=M1CFixture.build(f);write("SYNTHETIC-POSITIVE-handoff.json",handoff);
        write("SYNTHETIC-POSITIVE-compatibility.json",validate(handoff,f,source,probe));
        var malformed=M1CFixture.mutable(handoff);M1CFixture.mapMutable(at(malformed,"/members/0/seed")).remove("status");
        M1CFixture.mapMutable(at(malformed,"/members/0/seed")).remove("source_refs");
        M1CFixture.set(malformed,"/dataset/cohort_digest/value",digest(obj("selection_sha256",at(malformed,"/dataset/snapshot_digest/value"),"members",malformed.get("members"))));
        malformed.put("content_digest",digest(malformed));write("SYNTHETIC-INVALID-SCHEMA-handoff.json",malformed);
        write("SYNTHETIC-INVALID-SCHEMA-compatibility.json",validate(malformed,f,source,probe));
        var wrongClaim=M1CFixture.mutable(handoff);M1CFixture.set(wrongClaim,"/parameter_hints/0/hypothesis_refs",List.of("synthetic-ineffective"));
        wrongClaim.put("content_digest",digest(wrongClaim));write("SYNTHETIC-WRONG-CLAIM-handoff.json",wrongClaim);
        write("SYNTHETIC-WRONG-CLAIM-compatibility.json",validate(wrongClaim,f,source,probe));
        var member=f.input().members().getFirst();var params=com.vsos.core.aeb.AebParams.DEFAULT;
        var outcome=com.vsos.core.simulation.Simulator.simulate(new com.vsos.core.simulation.CrossingCase(40,30,1.5,false,"CLEAR","DAY",.8),params,42,com.vsos.core.simulation.VehicleSpec.DEFAULT);
        var result=obj("format","vehicsim.result/v1","engine","vsos-core-java/1","simulator","vehicsim-kinematic-1.4","seed",42,"source",obj(),
                "outcome",outcome.asDict(),"evaluation",com.vsos.core.evaluation.Evaluation.evaluate(outcome,params).toDocument());
        var all=new LinkedHashMap<>(member.run().artifacts());var a=member.run().artifact("result");
        all.put("result",new Artifact(a.id(),member.run().runKey(),"SYNTHETIC_ACTUAL_KINEMATIC_PRODUCER_FIXTURE",sha256(MiniJson.write(result)),a.mediaType(),Integrity.VERIFIED,result,List.of()));
        var run=new Run(member.run().runKey(),member.run().caseKey(),member.run().directory(),all,List.of());
        write("KINEMATIC-ACTUAL-PRODUCER-input.json",result);write("KINEMATIC-ACTUAL-PRODUCER-diagnostic.json",new DiagnosticReport().analyze(run));
        // Unknown identity uses the same stored values, not a recalculated or zero-filled scalar.
        result.put("engine","vsos-core-java/UNKNOWN");all.put("result",new Artifact(a.id(),run.runKey(),"SYNTHETIC_UNSUPPORTED_PROFILE",sha256(MiniJson.write(result)),a.mediaType(),Integrity.VERIFIED,result,List.of()));
        var unsupported=new Run(run.runKey(),run.caseKey(),run.directory(),all,List.of());
        write("UNKNOWN-PRODUCER-diagnostic.json",new DiagnosticReport().analyze(unsupported));
        System.out.println("Batch02 synthetic/actual-kinematic evidence exported; not operational CARLA or production-ready");
    }
}
