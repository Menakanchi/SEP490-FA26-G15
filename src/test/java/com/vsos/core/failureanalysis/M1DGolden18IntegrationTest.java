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

/** Existing real M1C Golden18 handoff + original ZIP. Never replaces absent artifacts with synthetic data. */
class M1DGolden18IntegrationTest {
    private static Path zip,handoffPath;private static String zipHash,handoffHash;private static Map<String,Run> runs;
    private static Map<String,Object> handoff,compatibility;private static Artifact handoffArtifact,probe;private static ConsumerSourceInspection.Profile source;
    @TempDir Path temp;
    @BeforeAll static void corpus()throws Exception{
        zip=Path.of(System.getProperty("golden18.zip","D:/Downloads/golden18_raw_artifacts.zip"));handoffPath=Path.of("docs/failure-analysis-v3/samples/m1c/GOLDEN18_OFFLINE-handoff.json");
        Assumptions.assumeTrue(Files.isRegularFile(zip)&&Files.isRegularFile(handoffPath),"BLOCKED: real Golden18 ZIP and M1C handoff required, no synthetic fallback");
        zipHash=sha256(Files.readAllBytes(zip));handoffHash=sha256(Files.readAllBytes(handoffPath));assertThat(zipHash).isEqualTo("22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339");
        handoffArtifact=HandoffSnapshots.read(handoffPath,"golden18-m1c-handoff",handoffHash);handoff=map(handoffArtifact.data());
        runs=new LinkedHashMap<>();try(var adapter=new RawArtifactAdapter(zip)){for(String dir:adapter.runDirectories()){Run run=adapter.read(dir);runs.put(run.runKey(),run);}}
        source=ConsumerSourceInspection.read(Path.of("."));probe=M1DConsumerProbe.execute(source);
        compatibility=new ConsumerCompatibilityValidator().validate(new ConsumerCompatibilityValidator.Input(handoffArtifact,source,probe,null,null));
    }
    @AfterAll static void immutableInputs()throws Exception{if(zipHash!=null){assertThat(sha256(Files.readAllBytes(zip))).isEqualTo(zipHash);assertThat(sha256(Files.readAllBytes(handoffPath))).isEqualTo(handoffHash);}}
    @TestFactory Stream<DynamicTest> all72MemberIdentitiesRemainOffline(){return list(handoff.get("members")).stream().map(m->DynamicTest.dynamicTest(str(at(m,"/run_key")),()->{
        Run run=runs.get(str(at(m,"/run_key")));assertThat(run).isNotNull();assertThat(at(m,"/seed/value")).isEqualTo(run.get("result","/seed"));
        assertThat(at(m,"/partition")).isEqualTo("DIAGNOSTIC_ONLY");assertThat(at(m,"/run_id/value")).isNull();assertThat(at(m,"/variant_id/value")).isNull();
        assertThat(at(m,"/artifact_digest/value")).isEqualTo(run.artifact("result").sha256());assertThat(at(m,"/mode/value")).isEqualTo(EvidenceReport.mode(run).value());
    }));}
    @Test void actualGoldenSchemaAndDigestPassButNeverDirectlyConsumable(){assertThat(at(compatibility,"/input_validation/schema")).isEqualTo("VERIFIED");
        assertThat(at(compatibility,"/input_validation/integrity")).isEqualTo("VERIFIED");assertThat(compatibility.get("overall")).isEqualTo(source.audited()?"NOT_DIRECTLY_CONSUMABLE":"BLOCKED");assertThat(compatibility.get("dispatch_allowed")).isEqualTo(false);}
    @Test void noFakeOperationalCohortOrBaseline(){assertThat(list(at(compatibility,"/identity_partition_compatibility/optimization_bindings"))).isEmpty();
        assertThat(at(compatibility,"/baseline_consistency/score_availability")).isEqualTo("UNKNOWN");assertThat(at(compatibility,"/freshness/status")).isEqualTo("UNKNOWN");}
    @Test void preserveAllCountsAndCase091Context(){assertThat(runs).hasSize(72);assertThat(runs.values().stream().map(Run::caseKey).distinct()).hasSize(18);
        assertThat(runs.values().stream().filter(r->"OFF".equals(EvidenceReport.mode(r).value()))).hasSize(18);
        for(Object m:list(handoff.get("members")))if(str(at(m,"/run_key")).contains("G4-091"))assertThat(at(m,"/actual_parameters/TTC_THRESHOLD/value")).isEqualTo(.6);}
    @Test void sourceGapsAndActualConsumerDivergenceAreReported(){var codes=list(compatibility.get("findings")).stream().map(f->at(f,"/code")).toList();
        if(source.audited()) {
            assertThat(codes).contains("DATASET_CONSUMPTION_MISSING","CUSTOM_BOUNDS_IGNORED","BASELINE_STATS_OBJECTIVES_MISSING","SEALED_VALIDATION_NOT_CONSUMED");
            assertThat(at(compatibility,"/canonical_metric_parity/consumer_probe/status")).isEqualTo("VERIFIED");
        } else {
            assertThat(codes).contains("CONSUMER_SOURCE_CHANGED_OR_MISSING");
            assertThat(at(compatibility,"/canonical_metric_parity/consumer_probe/status")).isEqualTo("UNKNOWN");
        }}
    @Test void goldenNoHintGateIsWeakened(){assertThat(list(handoff.get("parameter_hints"))).isEmpty();assertThat(at(compatibility,"/validation_isolation/suspected_hints")).isEqualTo(0);
        for(Object range:map(handoff.get("search_ranges")).values())assertThat(at(range,"/suggested_range/value")).isNull();}
    @Test void compatibilitySerializationAndReportSample()throws Exception{var parsed=MiniJson.parseObject(MiniJson.write(compatibility));
        assertThat(ConsumerCompatibilityValidator.contentDigest(parsed)).isEqualTo(compatibility.get("content_digest"));Files.createDirectories(Path.of("target/m1d-test-samples"));
        Files.writeString(Path.of("target/m1d-test-samples/GOLDEN18-compatibility.json"),MiniJson.write(compatibility));}
    @Test void cliWritesNewSidecarAndRefusesOverwrite()throws Exception{Path out=temp.resolve("compatibility.json");String[] args={handoffPath.toString(),handoffHash,".",out.toString()};
        OfflineConsumerCompatibility.main(args);assertThat(MiniJson.parseObject(Files.readString(out)).get("dispatch_allowed")).isEqualTo(false);
        String hash=sha256(Files.readAllBytes(out));assertThatThrownBy(()->OfflineConsumerCompatibility.main(args)).hasMessageContaining("OUTPUT_EXISTS_OR_OVERLAPS_INPUT");assertThat(sha256(Files.readAllBytes(out))).isEqualTo(hash);}
}
