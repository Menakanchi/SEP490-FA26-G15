package com.vsos.core.failureanalysis;

import com.vsos.core.common.MiniJson;
import org.junit.jupiter.api.*;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.Evidence.*;

/** Actual artifacts, never synthetic operational approvals. */
class Batch03DossierRegressionTest {
    static Map<String,Run> runs=new LinkedHashMap<>();
    @BeforeAll static void corpus() throws Exception {
        Path zip=Path.of(System.getProperty("golden18.zip","D:/Downloads/golden18_raw_artifacts.zip"));
        Assumptions.assumeTrue(Files.isRegularFile(zip),"BLOCKED: Golden18 absent; no generated replacement");
        try(var a=new RawArtifactAdapter(zip)){for(String dir:a.runDirectories()){Run r=a.read(dir);runs.put(r.runKey(),r);}}
    }
    Map<String,Object> report(String key){return MiniJson.parseObject(MiniJson.write(new DiagnosticReport().analyze(runs.get(key))));}
    @Test void publicContextEntryPointExists(){assertThat(Arrays.stream(DiagnosticReport.class.getMethods()).anyMatch(m->m.getName().equals("analyze")&&m.getParameterCount()==3)).isTrue();}
    @Test void noBrakingHasTechnicalSourceAndDeliveryFalsification(){var r=report("FA-G1-007-R1");
        assertThat((List<?>)at(r,"/report/root_cause_hypotheses/0/source_mechanism_refs")).isNotEmpty();
        assertThat(MiniJson.write(at(r,"/report/root_cause_hypotheses/0/falsification_tests"))).contains("delivery","refuting_observation","NOT_EXECUTED");}
    @Test void falseBrakingHasExAnteAndCompetingCautionHypotheses(){var r=report("FA-G3-064-R1");
        assertThat((List<?>)at(r,"/report/root_cause_hypotheses/0/alternative_hypotheses")).hasSizeGreaterThanOrEqualTo(4);
        assertThat(MiniJson.write(at(r,"/report/root_cause_hypotheses/0/falsification_tests"))).contains("ex-ante","caution","writer");}
    @Test void ineffectiveBrakingHasResponseGeometryAndMitigationDossier(){var r=report("FA-G5-125-R1");
        assertThat((List<?>)at(r,"/report/root_cause_hypotheses")).isNotEmpty();
        assertThat(MiniJson.write(at(r,"/report/root_cause_hypotheses"))).contains("mitigation","friction","2D","consumption");}
    @Test void objectivesHaveExplicitObservedVersusHypothesizedLinks(){var r=report("FA-G5-125-R1");for(String key:CanonicalObjectiveReader.KEYS){
        assertThat((List<?>)at(r,"/report/objectives/"+key+"/explanation/hypothesis_objective_links")).isNotEmpty();}}
    @Test void dossierIdsAreStableUniqueAndTypedReferencesResolve(){for(String key:List.of("FA-G1-007-R1","FA-G3-064-R1","FA-G5-125-R1")) {
        var a=report(key);var b=report(key);assertThat(at(a,"/report/root_cause_hypotheses")).isEqualTo(at(b,"/report/root_cause_hypotheses"));
        Set<Object> candidates=new HashSet<>(),hypotheses=new HashSet<>(),registry=new HashSet<>();
        for(Object candidate:(List<?>)at(a,"/report/failure_candidates"))candidates.add(at(candidate,"/id"));
        for(Object artifact:(List<?>)at(a,"/input/artifacts"))registry.add(at(artifact,"/id"));Batch03ContextTest.validateRefs(a,registry);
        for(Object h:(List<?>)at(a,"/report/root_cause_hypotheses")) {
            assertThat(hypotheses.add(at(h,"/id"))).isTrue();assertThat(candidates).containsAll((List<?>)at(h,"/related_failure_candidate_ids"));
            assertThat(at(h,"/root_cause_certainty/status")).isEqualTo("UNKNOWN");
            for(Object test:(List<?>)at(h,"/falsification_tests")){assertThat(at(test,"/execution_status")).isEqualTo("NOT_EXECUTED");assertThat(at(test,"/executable_status")).isEqualTo("BLOCKED_BY_EXTERNAL_EVIDENCE");}
        }
        for(String objective:CanonicalObjectiveReader.KEYS){assertThat(at(a,"/report/objectives/"+objective+"/canonical_value/value")).isEqualTo(runs.get(key).get("result","/outcome/metrics/"+objective));
            for(Object link:(List<?>)at(a,"/report/objectives/"+objective+"/explanation/hypothesis_objective_links")) {
                assertThat(hypotheses).contains(at(link,"/hypothesis_id"));assertThat(at(link,"/relation")).isEqualTo("HYPOTHESIZED");}
        }
    }}
    @Test void offAndUnremarkableRunDoNotAcquireForcedDossiers(){for(var run:runs.values())if("OFF".equals(EvidenceReport.mode(run).value())||run.runKey().equals("FA-G1-002-R1")) {
        assertThat((List<?>)at(new DiagnosticReport().analyze(run),"/report/root_cause_hypotheses")).isEmpty();}}
    @Test void missingInspectedSourceIsExplicitlyInconclusive(@org.junit.jupiter.api.io.TempDir Path empty){
        var a=new DiagnosticReport(new HypothesisInvestigator(empty)).analyze(runs.get("FA-G1-007-R1"));
        assertThat(at(a,"/report/root_cause_hypotheses/0/status")).isEqualTo("INCONCLUSIVE");
        assertThat((List<?>)at(a,"/report/root_cause_hypotheses/0/source_mechanism_refs")).isEmpty();
        assertThat(at(a,"/report/root_cause_hypotheses/0/root_cause_certainty/status")).isEqualTo("UNKNOWN");}
}
