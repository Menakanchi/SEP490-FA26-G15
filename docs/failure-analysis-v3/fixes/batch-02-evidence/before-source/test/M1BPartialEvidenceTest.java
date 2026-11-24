package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.Evidence.*;

class M1BPartialEvidenceTest {
    @TempDir Path dir;
    private Run run(String profile) throws Exception {
        Path folder=dir.resolve("runs/UNIT/rep1_a1/sensors");Files.createDirectories(folder);
        var metrics=obj("collision",false,"rms_jerk_mps3",null,"impact_speed_mps",null,"stopping_distance_m",null,"aeb_decision_t",null,"brake_onset_t",null);
        var raw=obj("format","vehicsim.result/v1","simulator",profile,"seed",42,"source",obj(),"engine","vsos-core-java/1",
                "outcome",obj("metrics",metrics,"case",obj(),"params",obj(),"frames",List.of(obj("t",0.0,"ego_x",0.0),obj("t",.01,"ego_x",.1))),"evaluation",obj("aeb_result",metrics));
        Files.writeString(folder.getParent().resolve("result.json"),MiniJson.write(raw));Files.writeString(folder.resolve("collisions.json"),"[]");
        try(var adapter=new RawArtifactAdapter(dir)){return adapter.read("runs/UNIT/rep1_a1");}
    }
    @Test void missingGeometryAndPhysicalSignalsStayUnknownWithoutThrowing() throws Exception {
        var report=new DiagnosticReport().analyze(run("carla-0.9.16-xosc15"));
        assertThat(at(report,"/report/geometry_results/0/conflict/status")).isEqualTo("UNKNOWN");
        assertThat(at(report,"/report/geometry_results/0/minimum_clearance/value")).isNull();
        assertThat(at(report,"/report/braking/jerk_rms/value")).isNull();
        assertThat(at(report,"/report/braking/partial_horizontal_travel/value")).isNull();
        assertThat(at(report,"/report/functional_candidates")).isEqualTo(List.of());
        assertThatCode(()->MiniJson.write(report)).doesNotThrowAnyException();
    }
    @Test void unsupportedProducerProfileCannotAcquireAssumedGeometryOrStoppingModel() throws Exception {
        var report=new DiagnosticReport().analyze(run("unknown-simulator/v99"));
        assertThat(at(report,"/report/geometry_results/0/conflict/value")).isNull();
        assertThat(at(report,"/report/feasibility_results/0/stopping_distance/value")).isNull();
        assertThat(at(report,"/report/objectives/stopping_distance_m/decomposition/trace_component/value")).isNull();
    }
    @Test void m1bDoesNotMutateM1AInputObjectsOrHistoricalBytes() throws Exception {
        var r=run("carla-0.9.16-xosc15");String before=MiniJson.write(r.artifact("result").data());
        Path result=dir.resolve("runs/UNIT/rep1_a1/result.json");byte[] bytes=Files.readAllBytes(result);
        var report=new DiagnosticReport().analyze(r);
        assertThat(MiniJson.write(r.artifact("result").data())).isEqualTo(before);assertThat(Files.readAllBytes(result)).isEqualTo(bytes);
        assertThat(at(new EvidenceReport().analyze(r),"/report/physical_outcome/status")).isEqualTo("UNKNOWN");
        assertThat(report.get("content_digest")).isEqualTo(EvidenceReport.contentDigest(report));
    }
    @Test void replayDigestIsStableAcrossFreshAnalysisIdentities() throws Exception {
        var r=run("carla-0.9.16-xosc15");var a=new DiagnosticReport().analyze(r);var b=new DiagnosticReport().analyze(r);
        assertThat(a.get("analysis_id")).isNotEqualTo(b.get("analysis_id"));assertThat(a.get("content_digest")).isEqualTo(b.get("content_digest"));
    }
    @Test void invalidOptionalAccelerationDoesNotEraseIndependentPositiveContact() throws Exception {
        run("carla-0.9.16-xosc15");Path sensors=dir.resolve("runs/UNIT/rep1_a1/sensors");
        Files.writeString(sensors.resolve("frames.csv"),"frame,sim_time_s\n10,0.0\n11,0.01\n");
        Files.writeString(sensors.resolve("ground_truth.csv"),"frame,sim_time_s,actor_id,role,vx_ms,vy_ms,vz_ms,a_along_v_ms2\n10,0.0,100,ego,10,0,0,NaN\n10,0.0,101,target,0,1,0,0\n");
        Files.writeString(sensors.resolve("collisions.json"),MiniJson.write(List.of(obj("frame",11,"sim_time_s",.01,"gt_frame_before",10,"other_actor_id",101,"relative_speed_before_ms",10.05,"impulse_ns",0))));
        try(var adapter=new RawArtifactAdapter(dir)){
            var r=adapter.read("runs/UNIT/rep1_a1");var issues=new EvidenceValidator().validate(r);
            assertThat(issues).extracting(Issue::code).contains("STREAM_NUMBER_INVALID");
            assertThat(new ImpactAnalyzer().extract(r,issues).admissible()).isTrue();
            assertThat(at(new DiagnosticReport().analyze(r),"/report/physical_outcome/value")).isEqualTo("COLLISION");
        }
    }
}
