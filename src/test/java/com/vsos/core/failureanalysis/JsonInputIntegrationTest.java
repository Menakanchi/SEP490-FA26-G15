package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.nio.file.*;
import java.util.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.JsonInputAdapterTest.*;
import static org.assertj.core.api.Assertions.*;

/** Actual producer-export fixtures; explicitly skipped if not supplied. Public CLIs, no bridge. */
class JsonInputIntegrationTest {
    @TempDir Path dir;
    static Path actual(String name){Path p=Path.of(System.getProperty("fa.json.samples","D:/Downloads")).resolve(name);Assumptions.assumeTrue(Files.isRegularFile(p),"BLOCKED actual producer fixture missing: "+p);return p;}
    @ParameterizedTest @ValueSource(strings={"result_run2499_full_dataset.json","result_run2499_full_dataset_v2.json"})
    void standaloneViaPublicCliPreservesCanonicalAndKnownCharacterization(String name)throws Exception {
        Path input=actual(name),out=dir.resolve("diagnostics");String hash=sha256(Files.readAllBytes(input));OfflineDiagnosticAnalysis.main(new String[]{input.toString(),out.toString()});
        Map<String,Object> report=HandoffSnapshots.map(MiniJson.parse(Files.readString(out.resolve("2499.json"))));
        assertThat(at(report,"/report/physical_outcome/value")).isEqualTo("COLLISION");assertThat(at(report,"/report/impact_analysis/admissible_recorded_contact")).isEqualTo(true);
        assertThat(at(report,"/report/collision_evidence/sensor_event_count/value")).isEqualTo(1L);
        assertThat(at(report,"/report/objectives/rms_jerk_mps3/canonical_value/value")).isEqualTo(17.68);
        assertThat(at(report,"/report/objectives/impact_speed_mps/canonical_value/value")).isEqualTo(6.067);
        assertThat(at(report,"/report/objectives/stopping_distance_m/canonical_value/value")).isEqualTo(17.518);
        assertThat(((Number)at(report,"/report/objectives/stopping_distance_m/decomposition/trace_component/value")).doubleValue()).isCloseTo(14.493,within(1e-9));
        assertThat(((Number)at(report,"/report/objectives/stopping_distance_m/decomposition/extrapolated_component/value")).doubleValue()).isCloseTo(3.0247529877,within(1e-9));
        var candidates=list(report,"/report/failure_candidates");assertThat(candidates).hasSize(1);assertThat(at(candidates.getFirst(),"/type")).isEqualTo("INEFFECTIVE_BRAKING");assertThat(at(candidates.getFirst(),"/status")).isEqualTo("SUSPECTED");
        assertThat(at(report,"/report/confirmed_root_cause/status")).isEqualTo("UNKNOWN");assertThat(at(report,"/report/physical_limit/status")).isEqualTo("UNKNOWN");
        assertThat(at(report,"/input/baseline_binding/identity_status")).isEqualTo("UNKNOWN");assertThat(at(report,"/input/clocks/0/to_reference_offset/status")).isEqualTo("UNKNOWN");
        assertThat(report.get("content_digest")).isEqualTo(EvidenceReport.contentDigest(report));assertThat(sha256(Files.readAllBytes(input))).isEqualTo(hash);
        assertThat(Files.readString(out.resolve("FUNCTIONAL_TEST_SUMMARY.csv"))).contains("2499","17.68","6.067","17.518");
        Path handoff=dir.resolve("handoff.json");OfflineMoboHandoff.main(new String[]{input.toString(),out.toString(),handoff.toString(),Path.of("").toAbsolutePath().toString()});
        var h=HandoffSnapshots.map(MiniJson.parse(Files.readString(handoff)));assertThat(h.get("content_digest")).isEqualTo(HandoffSnapshots.digest(h));
        assertThat(at(h,"/members/0/recorded_objectives/impact_speed_mps/canonical_value/value")).isEqualTo(6.067);
        assertThat(at(h,"/baseline/identity_status")).isEqualTo("UNKNOWN");assertThat(at(h,"/eligibility_manifest/consumer_dispatch_allowed")).isEqualTo(false);
        assertThat(at(h,"/members/0/replicate/value")).isEqualTo(1L);assertThat(at(h,"/members/0/canonical_sample")).isNull();
    }
    @ParameterizedTest @ValueSource(strings={"1032","1033","1034"})
    void actualCollectionsThroughBothClisHaveExactMemberNullModeAndReferenceParity(String variant)throws Exception {
        Path input=actual("vsos-collections-2026-11-24/vehicsim-variant-"+variant+"-collection.json"),out=dir.resolve("diagnostics"),handoff=dir.resolve("handoff.json");
        String hash=sha256(Files.readAllBytes(input));Object original=MiniJson.parse(Files.readString(input));
        OfflineDiagnosticAnalysis.main(new String[]{input.toString(),out.toString()});OfflineMoboHandoff.main(new String[]{input.toString(),out.toString(),handoff.toString(),Path.of("").toAbsolutePath().toString()});
        var h=HandoffSnapshots.map(MiniJson.parse(Files.readString(handoff)));assertThat(list(h,"/members")).hasSize(2);assertThat(h.get("content_digest")).isEqualTo(HandoffSnapshots.digest(h));
        int off=0,on=0;try(var a=new JsonInputAdapter(input)){
            assertThat(a.complete()).isTrue();assertThat(a.entries()).hasSize(list(original,"/manifest").size());
            for(Run r:a.runs()){
                var report=HandoffSnapshots.map(MiniJson.parse(Files.readString(out.resolve(r.runKey()+".json"))));Object doc=at(original,r.artifact("result").provenance().get("json_root_pointer").toString());
                assertThat(at(report,"/input/declared_identity/variant_id/value")).isEqualTo(variant);
                assertThat(at(report,"/input/seed/value")).isEqualTo(at(doc,"/seed"));
                for(String key:CanonicalObjectiveReader.KEYS){assertThat(at(report,"/report/objectives/"+key+"/canonical_value/value")).isEqualTo(at(doc,"/outcome/metrics/"+key));assertThat(at(report,"/report/objectives/"+key+"/declared_metadata/value")).isEqualTo(at(doc,"/dataset/objectives/"+key));}
                if("OFF".equals(EvidenceReport.mode(r).value())){off++;assertThat(at(report,"/report/failure_candidates")).isEqualTo(List.of());assertThat(at(report,"/report/functional_assessment/status")).isEqualTo("NOT_APPLICABLE");}else on++;
                // Preserve the distinction between physical events, suspected symptoms and confirmed causes.
                // These expectations characterize the supplied producer exports, not certified ground truth.
                if ("2498".equals(r.runKey())) {
                    assertThat(at(report,"/report/physical_outcome/status")).isEqualTo("UNKNOWN");
                    assertThat(at(report,"/report/functional_assessment/value")).isEqualTo("NO_SUPPORTED_FAILURE");
                    assertThat(list(report,"/report/failure_candidates")).isEmpty();
                } else if ("2499".equals(r.runKey())) {
                    assertThat(at(report,"/report/physical_outcome/value")).isEqualTo("COLLISION");
                    assertThat(at(report,"/report/failure_candidates/0/type")).isEqualTo("INEFFECTIVE_BRAKING");
                    assertThat(at(report,"/report/failure_candidates/0/status")).isEqualTo("SUSPECTED");
                    String hypotheses=MiniJson.write(at(report,"/report/root_cause_hypotheses"));
                    assertThat(hypotheses).contains("current pedestrian profile requires a sensor hit", "older profiles also accept overlap");
                    Path carlaSession=Path.of("src/main/java/com/vsos/core/simulation/CarlaSession.java");
                    if (Files.isRegularFile(carlaSession) && sha256(Files.readAllBytes(carlaSession)).equals("9ff0219e17be3f0d7bf8a4b3c41ace8d508f1102c31581e94aa09027902ac0fd"))
                        assertThat(hypotheses).contains("fa-mechanism:CarlaSession:9ff0219e17be3f0d7bf8a4b3c41ace8d508f1102c31581e94aa09027902ac0fd");
                } else if ("2500".equals(r.runKey())) {
                    assertThat(at(report,"/report/physical_outcome/status")).isEqualTo("UNKNOWN");
                    assertThat(at(report,"/report/failure_candidates/0/type")).isEqualTo("FALSE_BRAKING");
                    assertThat(at(report,"/report/failure_candidates/0/status")).isEqualTo("SUSPECTED");
                }
                assertThat(at(report,"/report/confirmed_root_cause/value")).isNull();assertThat(report.get("content_digest")).isEqualTo(EvidenceReport.contentDigest(report));
                for(String name:List.of("frames","ground_truth")){Artifact view=r.artifact(name);var cols=(List<?>)view.provenance().get("table_columns");for(int j=0;j<cols.size();j++){String field=cols.get(j).toString();assertThat(at(original,r.ref(name,"/0/"+field).locator())).isEqualTo(r.get(name,"/0/"+field));}
                    assertThat(at(view.provenance(),"/embedded_digest/status")).isEqualTo("MATCH");assertThat(view.integrity()).isEqualTo(Integrity.UNVERIFIED);}
            }
        }
        assertThat(on).isEqualTo(1);assertThat(off).isEqualTo(1);assertThat(sha256(Files.readAllBytes(input))).isEqualTo(hash);
        assertThat(at(h,"/baseline/identity_status")).isEqualTo("UNKNOWN");assertThat(at(h,"/baseline_objectives/availability")).isEqualTo("UNKNOWN");assertThat(at(h,"/consumer_compatibility/overall")).isEqualTo("NOT_DIRECTLY_CONSUMABLE");
        assertThat(list(h,"/parameter_hints")).isEmpty();assertThat(list(h,"/eligibility_manifest/optimization_eligible")).isEmpty();assertThat(list(h,"/eligibility_manifest/validation_eligible")).isEmpty();
    }
    @ParameterizedTest @ValueSource(strings={"coreclock","gtspike","badcontact","badprecontact","collisioncopy","nullreason"})
    void actualSchemaMutationUsesCoreEvidenceGates(String mutation)throws Exception {
        Object doc=MiniJson.parse(Files.readString(actual("result_run2499_full_dataset.json")));
        switch(mutation){case "coreclock"->map(doc,"/outcome/frames/2").put("t",0.);
            case "gtspike"->{var columns=(List<?>)at(doc,"/dataset/time_series/ground_truth/columns");list(doc,"/dataset/time_series/ground_truth/rows/0").set(columns.indexOf("a_along_v_ms2"),-1e12);}
            case "badcontact"->map(doc,"/dataset/collisions/events/0").put("sim_time_s",10000.);
            case "badprecontact"->map(doc,"/dataset/collisions/events/0").put("gt_frame_before",1000000L);
            case "collisioncopy"->map(doc,"/outcome/metrics").put("collision",false);
            case "nullreason"->{map(doc,"/outcome/metrics").put("impact_speed_mps",null);map(doc,"/evaluation/aeb_result").put("impact_speed_mps",null);map(doc,"/dataset/objectives/impact_speed_mps").put("value",null);map(doc,"/dataset/objectives/impact_speed_mps").put("evaluation_value",null);map(doc,"/dataset/objectives/impact_speed_mps").put("state","MISSING");map(doc,"/dataset/objectives/impact_speed_mps").put("reason","CONTACT_SPEED_MISSING");}}
        Path path=dir.resolve("mutated.json");Files.writeString(path,MiniJson.write(doc));try(var a=new JsonInputAdapter(path)){Run r=a.runs().getFirst();var report=new DiagnosticReport().analyze(r);
            assertThat(at(report,"/report/confirmed_root_cause/value")).isNull();assertThat(at(report,"/report/physical_limit/value")).isNull();
            if(mutation.equals("coreclock"))assertThat(at(report,"/report/objectives/stopping_distance_m/decomposition/trace_component/value")).isNull();
            if(mutation.equals("gtspike"))assertThat(at(report,"/report/objectives/rms_jerk_mps3/canonical_value/value")).isEqualTo(17.68);
            if(mutation.equals("badcontact"))assertThat(at(report,"/report/impact_analysis/admissible_recorded_contact")).isEqualTo(false);
            if(mutation.equals("badprecontact"))assertThat(at(report,"/report/impact_analysis/vector_relative_speed/value")).isNull();
            if(mutation.equals("collisioncopy")){assertThat(at(report,"/report/collision_evidence/canonical_collision/value")).isEqualTo(false);assertThat(at(report,"/report/physical_outcome/value")).isEqualTo("COLLISION");assertThat(at(report,"/report/physical_outcome_basis/basis")).isEqualTo("RECORDED_MATCHING_CONTACT");assertThat(list(report,"/report/disagreements")).isNotEmpty();}
            if(mutation.equals("nullreason"))assertThat(at(report,"/report/objectives/impact_speed_mps/declared_metadata/value/reason")).isEqualTo("CONTACT_SPEED_MISSING");
        }
    }
}
