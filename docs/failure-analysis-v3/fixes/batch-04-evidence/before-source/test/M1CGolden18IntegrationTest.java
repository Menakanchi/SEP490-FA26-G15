package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

/** Actual corpus only. No fixture fallback, DB enrollment, representative selection or baseline score. */
class M1CGolden18IntegrationTest {
    private static Path zip;private static Map<String,Run> runs;private static List<MoboHandoffBuilder.MemberInput> members;
    private static Map<String,Object> handoff;private static Map<String,String> reportDigests;
    private static java.nio.file.attribute.FileTime modified;
    @TempDir Path temp;
    @BeforeAll static void realCorpus() throws Exception {
        zip=Path.of(System.getProperty("golden18.zip","D:/Downloads/golden18_raw_artifacts.zip"));
        Assumptions.assumeTrue(Files.isRegularFile(zip),"BLOCKED: actual Golden18 ZIP missing; no synthetic replacement for integration");
        assertThat(sha256(Files.readAllBytes(zip))).isEqualTo("22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339");modified=Files.getLastModifiedTime(zip);
        runs=new LinkedHashMap<>();Map<String,Run> off=new HashMap<>();try(var adapter=new RawArtifactAdapter(zip)){
            for(String directory:adapter.runDirectories()){Run r=adapter.read(directory);runs.put(r.runKey(),r);if("OFF".equals(EvidenceReport.mode(r).value()))off.put(r.caseKey(),r);}}
        members=new ArrayList<>();reportDigests=new LinkedHashMap<>();for(Run r:runs.values()){
            Map<String,Object> report=new DiagnosticReport().analyze(r,"ON".equals(EvidenceReport.mode(r).value())?off.get(r.caseKey()):null);
            reportDigests.put(r.runKey(),EvidenceReport.contentDigest(report));members.add(new MoboHandoffBuilder.MemberInput(r,report));}
        var sources=SearchRangeResolver.repositorySources(Path.of("."));
        handoff=new MoboHandoffBuilder().build(new MoboHandoffBuilder.Input(members,null,null,sources,null,List.of()));
    }
    @AfterAll static void rawAndPriorReportsUnchanged() throws Exception {
        if(modified==null)return;assertThat(Files.getLastModifiedTime(zip)).isEqualTo(modified);
        assertThat(sha256(Files.readAllBytes(zip))).isEqualTo("22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339");
        for(var m:members)assertThat(EvidenceReport.contentDigest(m.diagnosticReport())).isEqualTo(reportDigests.get(m.run().runKey()));
    }
    @TestFactory Stream<DynamicTest> independent72UnboundMembers(){return list(handoff.get("members")).stream().map(member->DynamicTest.dynamicTest(at(member,"/run_key").toString(),()->{
        String key=at(member,"/run_key").toString();Run run=runs.get(key);
        assertThat(at(member,"/partition")).isEqualTo("DIAGNOSTIC_ONLY");assertThat(at(member,"/run_id/status")).isEqualTo("UNKNOWN");
        assertThat(at(member,"/variant_id/value")).isNull();assertThat(at(member,"/baseline_aeb_version_id/value")).isNull();assertThat(at(member,"/canonical_sample")).isNull();
        assertThat(at(member,"/seed/value")).isEqualTo(run.get("result","/seed"));assertThat(at(member,"/replicate/value")).isNotNull();
        for(var p:BaselineBindingResolver.PARAMETERS.entrySet())assertThat(at(member,"/actual_parameters/"+p.getKey()+"/value")).isEqualTo(run.get("result","/outcome/params/"+p.getValue()));
        assertThat(at(member,"/diagnostic_report_ref/value")).isEqualTo(reportDigests.get(key));
        assertThat(at(member,"/artifact_digest/value")).isEqualTo(run.artifact("result").sha256());
    }));}
    @Test void hf01AndHf06GoldenHasNoConfirmedBaselineOrScore(){assertThat(at(handoff,"/baseline/identity_status")).isEqualTo("UNKNOWN");
        assertThat(at(handoff,"/baseline/confirmed_as_v1/value")).isNull();assertThat(at(handoff,"/baseline_objectives/availability")).isEqualTo("UNKNOWN");
        for(String p:List.of("optimization","validation")){assertThat(at(handoff,"/baseline_objectives/"+p+"/value")).isNull();assertThat(at(handoff,"/canonical_aggregation/"+p+"/value")).isNull();}}
    @Test void hf04Preserves18Cases54On18OffAndAllRepetitions(){assertThat(runs).hasSize(72);assertThat(runs.values().stream().map(Run::caseKey).distinct()).hasSize(18);
        assertThat(list(handoff.get("members")).stream().filter(m->"ON".equals(at(m,"/mode/value")))).hasSize(54);
        assertThat(list(handoff.get("members")).stream().filter(m->"OFF".equals(at(m,"/mode/value")))).hasSize(18);}
    @Test void hf05NoOperationalFrozenDataset(){assertThat(at(handoff,"/dataset/selection_status")).isEqualTo("UNFROZEN");
        assertThat(at(handoff,"/dataset/snapshot_id/value")).isNull();assertThat(list(at(handoff,"/dataset/optimization_run_ids"))).isEmpty();assertThat(list(at(handoff,"/dataset/validation_run_ids"))).isEmpty();}
    @Test void hf05OffOnlyDiagnosticAndExcludedWithReason(){for(Object member:list(handoff.get("members")))if("OFF".equals(at(member,"/mode/value"))){
        assertThat(at(member,"/eligibility/optimization")).isEqualTo("EXCLUDED");assertThat(at(member,"/eligibility/validation")).isEqualTo("EXCLUDED");assertThat(list(at(member,"/eligibility/reason_codes"))).contains("OFF_CONTROL_ONLY");}}
    @Test void hf08AndHf11NoHintsOrGuessedRangesFromUnselectedCorpus(){assertThat(list(handoff.get("parameter_hints"))).isEmpty();
        for(Object range:map(handoff.get("search_ranges")).values())assertThat(at(range,"/suggested_range/status")).isEqualTo("UNKNOWN");}
    @Test void hf08MissingDetectionAndCautionCandidatesAbstain(){for(String key:List.of("FA-G1-007-R1","FA-G1-012-R1","FA-G3-061-R1","FA-G3-064-R1")){
        var m=members.stream().filter(v->v.run().runKey().equals(key)).findFirst().orElseThrow();
        // Unit-level partition argument exercises abstention only; it does not enroll Golden18.
        var hint=new ParameterHintBuilder().build(m.diagnosticReport(),"OPTIMIZATION",null,null).getFirst();assertThat(hint.get("status")).isEqualTo("ABSTAIN");assertThat(hint.get("parameter_code")).isNull();}}
    @Test void hf06Case091KeepsActualTtcPointSix(){for(Object member:list(handoff.get("members")))if(at(member,"/run_key").toString().contains("G4-091"))
        assertThat(at(member,"/actual_parameters/TTC_THRESHOLD/value")).isEqualTo(.6);}
    @Test void hf11CountsReconcileIncludingUnknownAndOffExcluded(){assertThat(at(handoff,"/eligibility_manifest/counts/requested")).isEqualTo(72);
        assertThat(at(handoff,"/eligibility_manifest/counts/excluded")).isEqualTo(18);assertThat(at(handoff,"/eligibility_manifest/counts/unknown")).isEqualTo(54);
        assertThat(list(at(handoff,"/eligibility_manifest/optimization_eligible"))).isEmpty();}
    @Test void hf12QualityUnknownDoesNotBecomeFakeCalibrationOrRootTruth(){assertThat(at(handoff,"/eligibility_manifest/overall")).isEqualTo("BLOCKED");
        assertThat(list(at(handoff,"/eligibility_manifest/reason_codes"))).contains("QUALITY_POLICY_UNAPPROVED_OR_SCOPE_MISMATCH");
        assertThat(list(at(handoff,"/provenance/calibration_refs"))).isEmpty();assertThat(at(handoff,"/provenance/worker_sha256/value")).isNull();
        assertThat(at(handoff,"/consumer_compatibility/overall")).isEqualTo("NOT_DIRECTLY_CONSUMABLE");}
    @Test void canonicalDigestAndRoundTripRemainStable(){var copy=MiniJson.parseObject(MiniJson.write(handoff));assertThat(HandoffSnapshots.digest(copy)).isEqualTo(handoff.get("content_digest"));}
    @Test void collisionAuthorityAndNullsRemainInOriginalReports(){for(var m:members)for(String key:CanonicalObjectiveReader.KEYS){
        assertThat(at(m.diagnosticReport(),"/report/objectives/"+key+"/canonical_value/value")).isEqualTo(m.run().get("result","/outcome/metrics/"+key));}
        var r=members.stream().filter(m->m.run().runKey().equals("FA-G4-091-R1")).findFirst().orElseThrow().diagnosticReport();
        assertThat(at(r,"/report/objectives/impact_speed_mps/canonical_value/value")).isNotNull();assertThat(at(r,"/report/collision_evidence/physical_event_impact/value")).isNull();}
    @Test void offlineRunnerCreatesNewSidecarAndRejectsOverwrite() throws Exception {
        Path reports=temp.resolve("reports");Files.createDirectories(reports);for(var m:members)Files.writeString(reports.resolve(m.run().runKey()+".json"),MiniJson.write(m.diagnosticReport()));
        Path output=temp.resolve("handoff.json");String[] args={zip.toString(),reports.toString(),output.toString(),Path.of(".").toAbsolutePath().toString()};
        OfflineMoboHandoff.main(args);var loaded=MiniJson.parseObject(Files.readString(output));assertThat(list(loaded.get("members"))).hasSize(72);
        String hash=sha256(Files.readAllBytes(output));assertThatThrownBy(()->OfflineMoboHandoff.main(args)).hasMessageContaining("OUTPUT_OVERLAPS_INPUT_OR_EXISTS");assertThat(sha256(Files.readAllBytes(output))).isEqualTo(hash);
        Files.createDirectories(Path.of("target/m1c-test-samples"));Files.writeString(Path.of("target/m1c-test-samples/GOLDEN18_OFFLINE-handoff.json"),MiniJson.write(loaded));
    }
}
