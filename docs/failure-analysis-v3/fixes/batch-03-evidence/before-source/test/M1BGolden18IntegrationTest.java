package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import org.junit.jupiter.api.*;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Real Golden18 only. No legacy failure labels are used as expected root-cause truth. */
class M1BGolden18IntegrationTest {
    private static final String HASH="22f7386cd20175403505dd810451958fb7f2d1595944afd859d0c3f0ae151339";
    private static Path zip;
    private static Map<String,Run> runs;
    private static Map<String,Map<String,Object>> reports;
    private static java.nio.file.attribute.FileTime modified;
    @BeforeAll static void realCorpus() throws Exception {
        zip=Path.of(System.getProperty("golden18.zip","D:/Downloads/golden18_raw_artifacts.zip"));
        Assumptions.assumeTrue(Files.isRegularFile(zip),"BLOCKED: actual Golden18 ZIP missing; supply -Dgolden18.zip, no generated fallback");
        assertThat(sha256(Files.readAllBytes(zip))).isEqualTo(HASH);modified=Files.getLastModifiedTime(zip);
        runs=new LinkedHashMap<>();reports=new LinkedHashMap<>();Map<String,Run> off=new HashMap<>();
        try(var adapter=new RawArtifactAdapter(zip)){for(String directory:adapter.runDirectories()) {
            var r=adapter.read(directory);runs.put(r.runKey(),r);if("OFF".equals(EvidenceReport.mode(r).value()))off.put(r.caseKey(),r);
        }}
        for(var run:runs.values())reports.put(run.runKey(),new DiagnosticReport().analyze(run,"ON".equals(EvidenceReport.mode(run).value())?off.get(run.caseKey()):null));
    }
    @AfterAll static void immutableRaw() throws Exception {
        if(modified!=null){assertThat(Files.getLastModifiedTime(zip)).isEqualTo(modified);assertThat(sha256(Files.readAllBytes(zip))).isEqualTo(HASH);}
    }
    @TestFactory Stream<DynamicTest> all72IndependentEvidenceAndCanonicalPreservation(){
        return runs.values().stream().map(run->DynamicTest.dynamicTest(run.runKey(),()->{
            Map<String,Object> report=reports.get(run.runKey());
            assertThat(report.get("implementation_stage")).isEqualTo("M1B");
            for(String key:CanonicalObjectiveReader.KEYS) {
                assertThat(at(report,"/report/objectives/"+key+"/canonical_value/value")).isEqualTo(run.get("result","/outcome/metrics/"+key));
                assertThat(at(report,"/report/objectives/"+key+"/evaluation_copy/value")).isEqualTo(run.get("result","/evaluation/aeb_result/"+key));
                assertThat(at(report,"/report/objectives/"+key+"/aggregation_version")).isEqualTo("adr040-stored-aggregation/1");
                assertThat(at(report,"/report/objectives/"+key+"/quality/mobo_eligibility")).isNotEqualTo("ELIGIBLE");
            }
            assertThat(at(report,"/report/confirmed_root_cause/status")).isEqualTo("UNKNOWN");
            assertThat(at(report,"/report/physical_limit/status")).isEqualTo("UNKNOWN");
            assertThat(at(report,"/report/feasibility_results/0/avoidability/status")).isEqualTo("UNKNOWN");
            assertThat(at(report,"/input/baseline_binding/identity_status")).isEqualTo("UNKNOWN");
            assertThat(report.get("content_digest")).isEqualTo(EvidenceReport.contentDigest(report));
            assertThatCode(()->MiniJson.write(report)).doesNotThrowAnyException();
            validateEvidenceTree(report,artifactIds(report));
        }));
    }
    @Test void exactOutcomeAndIndependentSymptomCounts(){
        assertThat(reports).hasSize(72);assertThat(runs.values().stream().map(Run::caseKey).distinct()).hasSize(18);
        assertThat(reports.values().stream().filter(r->"COLLISION".equals(at(r,"/report/physical_outcome/value")))).hasSize(31);
        assertThat(reports.values().stream().filter(r->"UNKNOWN".equals(at(r,"/report/physical_outcome/status")))).hasSize(41);
        assertThat(reports.values().stream().flatMap(r->((List<?>)at(r,"/report/disagreements")).stream())).hasSize(12);
        Map<String,Long> counts=new HashMap<>();
        for(var r:reports.values())for(Object claim:(List<?>)at(r,"/report/functional_candidates")) {
            assertThat(at(claim,"/status")).isEqualTo("SUSPECTED");assertThat((List<?>)at(claim,"/missing_evidence")).isNotEmpty();
            counts.merge(at(claim,"/type").toString(),1L,Long::sum);
        }
        assertThat(counts).containsExactlyInAnyOrderEntriesOf(Map.of("NO_BRAKING",6L,"FALSE_BRAKING",6L,"INEFFECTIVE_BRAKING",14L));
    }
    @Test void all18OffHaveOnlyShadowFunctionalAssessment(){
        var off=reports.values().stream().filter(r->"OFF".equals(at(r,"/input/mode/value"))).toList();assertThat(off).hasSize(18);
        for(var r:off){assertThat(at(r,"/report/aeb_timeline/behavior")).isEqualTo("OFF_HYPOTHETICAL_ONLY");assertThat(at(r,"/report/functional_candidates")).isEqualTo(List.of());assertThat(at(r,"/report/functional_assessment/status")).isEqualTo("NOT_APPLICABLE");}
    }
    @Test void g002HasNoForcedMissedBrakingAndDisjointOccupancy(){for(int rep=1;rep<=3;rep++){
        var r=reports.get("FA-G1-002-R"+rep);assertThat(at(r,"/report/functional_candidates")).isEqualTo(List.of());
        assertThat(at(r,"/report/geometry_results/0/conflict/value")).isEqualTo(false);
        assertThat(at(r,"/report/geometry_results/0/pet_relation/value")).isEqualTo("DISJOINT");
        assertThat((Double)at(r,"/report/geometry_results/0/pet/value")).isPositive();
    }}
    @Test void g007NoBrakingIsSuspectedAndRootUnknown(){var r=reports.get("FA-G1-007-R1");assertThat(at(r,"/report/functional_candidates/0/type")).isEqualTo("NO_BRAKING");assertThat(at(r,"/report/confirmed_root_cause/value")).isNull();assertThat(at(r,"/report/impact_analysis/impulse/value")).isEqualTo(0.0);assertThat(at(r,"/report/impact_analysis/recorded_relative_speed/value")).isEqualTo(13.935);}
    @Test void g011CommandIsPendingAndRightCensoredRatherThanFailed(){for(int rep=1;rep<=3;rep++){
        var r=reports.get("FA-G1-011-R"+rep);assertThat(at(r,"/report/aeb_timeline/behavior")).isEqualTo("AEB_DECISION_PENDING");
        assertThat(at(r,"/report/aeb_timeline/scheduled_command/value")).isEqualTo(5.15);
        assertThat(at(r,"/report/aeb_timeline/core_physics_end/value")).isEqualTo(5.09);
        assertThat(at(r,"/report/functional_candidates")).isEqualTo(List.of());
        assertThat((Double)at(r,"/report/geometry_results/0/minimum_clearance/value")).isPositive();
    }}
    @Test void g012PedalReadbackDoesNotBecomeAttributedAebBraking(){for(int rep=1;rep<=3;rep++){
        var r=reports.get("FA-G1-012-R"+rep);assertThat(at(r,"/report/control_activity")).isEqualTo("CONTROL_ACTIVITY_UNATTRIBUTED");
        assertThat(at(r,"/report/aeb_timeline/control_writer/status")).isEqualTo("UNKNOWN");
        assertThat(at(r,"/report/functional_candidates/0/type")).isEqualTo("NO_BRAKING");
    }}
    @Test void g026IncludesRearBodyAndAppliedWidthConflict(){for(int rep=1;rep<=3;rep++){
        var r=reports.get("FA-G2-026-R"+rep);assertThat(at(r,"/report/geometry_results/1/conflict/value")).isEqualTo(true);
        assertThat(at(r,"/report/geometry_results/1/conflict/status")).isEqualTo("CONDITIONAL");
        assertThat(at(r,"/report/physical_outcome/value")).isEqualTo("COLLISION");
        assertThat(at(r,"/report/objectives/rms_jerk_mps3/canonical_value/value")).isNull();
        assertThat(at(r,"/report/objectives/rms_jerk_mps3/canonical_value/status")).isEqualTo("UNKNOWN");
        assertThat(at(r,"/report/functional_candidates/0/type")).isEqualTo("INEFFECTIVE_BRAKING");
    }}
    @Test void g061And064AreHindsightFalseBrakingCandidatesWithoutConfirmedViolation(){for(String c:List.of("FA-G3-061","FA-G3-064"))for(int rep=1;rep<=3;rep++){
        var r=reports.get(c+"-R"+rep);assertThat(at(r,"/report/functional_candidates/0/type")).isEqualTo("FALSE_BRAKING");
        assertThat(at(r,"/report/functional_candidates/0/requirement_id")).isNull();
        assertThat(at(r,"/report/aeb_timeline/command_to_physical_delay/status")).isEqualTo("UNKNOWN");
        assertThat(at(r,"/report/functional_assessment/value")).isEqualTo("INCONCLUSIVE");
    }}
    @Test void g125FrictionCapIsConditionalNotConfirmedPhysicalLimit(){var r=reports.get("FA-G5-125-R1");assertThat((Double)at(r,"/report/feasibility_results/0/available_deceleration/value")).isCloseTo(6.3765,within(1e-12));assertThat(at(r,"/report/feasibility_results/0/available_deceleration/status")).isEqualTo("CONDITIONAL");assertThat(at(r,"/report/physical_limit/value")).isNull();assertThat(at(r,"/report/objectives/stopping_distance_m/decomposition/decel_for_extrapolation/value")).isEqualTo(6.377);}
    @Test void stoppingDecompositionReplaysAll42StoredOnValuesWithoutChangingTotals(){
        int n=0;for(var r:reports.values()){
            Object total=at(r,"/report/objectives/stopping_distance_m/canonical_value/value");if(total==null)continue;n++;
            assertThat((Double)at(r,"/report/objectives/stopping_distance_m/decomposition/replay_difference/value")).isCloseTo(0,within(1e-9));
            assertThat(at(r,"/report/objectives/stopping_distance_m/decomposition/measured_physical_distance/value")).isNull();
        }assertThat(n).isEqualTo(42);
    }
    @Test void impactAndMitigationNeverUseSyntheticNoContactZero(){
        var r=reports.get("FA-G6-168-R2");assertThat(at(r,"/report/objectives/impact_speed_mps/canonical_value/value")).isEqualTo(2.820);
        assertThat(at(r,"/report/impact_analysis/recorded_relative_speed/value")).isEqualTo(2.811);
        assertThat(at(reports.get("FA-G2-028-R1"),"/report/paired_mitigation/observed_speed_reduction/value")).isNull();
        var delta=at(reports.get("FA-G2-029-R1"),"/report/paired_mitigation/observed_speed_reduction/value");assertThat(delta).isInstanceOf(Double.class);assertThat((Double)delta).isPositive();
        assertThat(at(reports.get("FA-G2-029-R1"),"/report/paired_mitigation/causal_contribution/value")).isNull();
    }
    @Test void g091RetainsActualThresholdAndNoObservedIneffectiveCandidate(){var r=reports.get("FA-G4-091-R1");assertThat(at(r,"/input/parameters/ttc_threshold/value")).isEqualTo(.6);assertThat(at(r,"/report/functional_candidates")).isEqualTo(List.of());assertThat(at(r,"/report/objectives/impact_speed_mps/physical_event_impact/value")).isNull();}
    @Test void canonicalJerkSignalFilterWindowAreNotReplacedByDiagnosticGt(){var r=reports.get("FA-G1-004-R1");assertThat(at(r,"/report/objectives/rms_jerk_mps3/signal/value")).isEqualTo("ego_a");assertThat(at(r,"/report/objectives/rms_jerk_mps3/window/value")).isEqualTo("T_AEB to end of run");assertThat(at(r,"/report/braking/filter")).isEqualTo("NONE");assertThat(at(r,"/report/braking/jerk_rms/formula_id")).isEqualTo("fa-formula/3.0.0:T02");assertThat((Double)at(r,"/report/aeb_timeline/command_latency/value")).isCloseTo(.25,within(1e-12));}
    private static Set<Object> artifactIds(Map<String,Object> report){var list=(List<?>)at(report,"/input/artifacts");Set<Object> ids=new HashSet<>();for(Object a:list)ids.add(at(a,"/id"));return ids;}
    private static void validateEvidenceTree(Object node,Set<Object> ids){
        if(node instanceof Map<?,?> m){
            if(m.containsKey("value")&&m.containsKey("status")){
                if(m.get("value")==null)assertThat((List<?>)m.get("reason_codes")).isNotEmpty();
                if(List.of("OBSERVED","DERIVED","CONDITIONAL").contains(m.get("status")))assertThat((List<?>)m.get("source_refs")).isNotEmpty();
                if(m.get("status").equals("DERIVED")||m.get("status").equals("CONDITIONAL")) {
                    // M1A observed-profile descriptors may be conditional without a mathematical derivation.
                    if(m.get("formula_id")!=null)assertThat(m.get("formula_id").toString()).isNotBlank();
                }
                for(Object ref:(List<?>)m.get("source_refs"))assertThat(ids).contains(at(ref,"/artifact_id"));
            }
            m.values().forEach(v->validateEvidenceTree(v,ids));
        }else if(node instanceof List<?> list)list.forEach(v->validateEvidenceTree(v,ids));
    }
}
