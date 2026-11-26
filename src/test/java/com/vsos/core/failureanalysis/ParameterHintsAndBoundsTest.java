package com.vsos.core.failureanalysis;

import org.junit.jupiter.api.*;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.Evidence.*;
import static com.vsos.core.failureanalysis.HandoffSnapshots.*;

class ParameterHintsAndBoundsTest {
    private M1CFixture.Cohort fixture;
    @BeforeEach void fixture() throws Exception{fixture=M1CFixture.create();}
    @Test void hf07ReadsActualCatalogAndLoadedEngineByKey() throws Exception{
        var r=new SearchRangeResolver().resolve(SearchRangeResolver.repositorySources(Path.of(".")),null);
        assertThat(at(r,"/TTC_THRESHOLD/catalog_domain/value/upper")).isEqualTo(3.5); // ADR-069: seed khớp miền MOBO
        assertThat(at(r,"/TTC_THRESHOLD/engine_domain/value/upper")).isEqualTo(3.5);
        assertThat(at(r,"/MAX_DECELERATION/engine_domain/value/lower")).isEqualTo(5.);
        for(Object range:r.values()){assertThat(at(range,"/suggested_range/status")).isEqualTo("UNKNOWN");assertThat(at(range,"/consumer_enforcement")).isEqualTo("NOT_SUPPORTED");}
    }
    @Test void hf07IntersectionNeverWidensToDefault(){var d=fixture.input().domains();var campaign=M1CFixture.change(d.approvedCampaign(),"/intervals/TTC_THRESHOLD/lower",1.2);
        campaign=M1CFixture.change(campaign,"/intervals/TTC_THRESHOLD/upper",2.1);
        var r=resolve(new SearchRangeResolver.Domains(d.catalogSource(),d.engineSource(),d.liveCatalog(),campaign,List.of()));
        assertThat(at(r,"/TTC_THRESHOLD/suggested_range/value")).isEqualTo(obj("lower",1.2,"upper",2.1));
    }
    @TestFactory Stream<DynamicTest> hf07InvalidEmptyFixedAndWrongUnitDomains(){return Stream.of("invalid","empty","fixed","unit","nan").map(kind->DynamicTest.dynamicTest(kind,()->{
        var d=fixture.input().domains();var campaign=d.approvedCampaign();
        campaign=M1CFixture.change(campaign,"/intervals/TTC_THRESHOLD/lower",switch(kind){case "invalid"->4.;case "empty"->3.8;case "fixed"->3.5;case "nan"->null;default->.5;});
        if(kind.equals("invalid"))campaign=M1CFixture.change(campaign,"/intervals/TTC_THRESHOLD/upper",1.);
        if(kind.equals("empty"))campaign=M1CFixture.change(campaign,"/intervals/TTC_THRESHOLD/upper",4.);
        if(kind.equals("unit"))campaign=M1CFixture.change(campaign,"/intervals/TTC_THRESHOLD/unit","m");
        var r=resolve(new SearchRangeResolver.Domains(d.catalogSource(),d.engineSource(),d.liveCatalog(),campaign,List.of()));
        assertThat(at(r,"/TTC_THRESHOLD/suggested_range/value")).isNull();
        assertThat(at(r,"/TTC_THRESHOLD/eligibility")).isEqualTo(kind.equals("empty")||kind.equals("fixed")?"EXCLUDED":"UNKNOWN");
    }));}
    @Test void missingLiveCatalogDoesNotUseSourceSeedAsApproval(){var d=fixture.input().domains();var r=resolve(new SearchRangeResolver.Domains(d.catalogSource(),d.engineSource(),null,d.approvedCampaign(),List.of()));
        assertThat(at(r,"/TTC_THRESHOLD/suggested_range/status")).isEqualTo("UNKNOWN");}
    @Test void validationBasedDomainRejected(){var d=fixture.input().domains();var campaign=M1CFixture.change(d.approvedCampaign(),"/basis_partition","VALIDATION");
        var r=resolve(new SearchRangeResolver.Domains(d.catalogSource(),d.engineSource(),d.liveCatalog(),campaign,List.of()));assertThat(at(r,"/TTC_THRESHOLD/suggested_range/status")).isEqualTo("UNKNOWN");}
    @Test void modelConstraintRequiresExplicitParameterInterval(){var d=fixture.input().domains();var scope=scope();var model=M1CFixture.domain("model","MODEL_CONSTRAINT",scope);
        model=M1CFixture.change(model,"/intervals/MAX_DECELERATION/upper",7.);
        var r=resolve(new SearchRangeResolver.Domains(d.catalogSource(),d.engineSource(),d.liveCatalog(),d.approvedCampaign(),List.of(model)));
        assertThat(at(r,"/MAX_DECELERATION/suggested_range/value/upper")).isEqualTo(7.);
        assertThat(at(r,"/BRAKE_BUILDUP_RATE/suggested_range/value/upper")).isEqualTo(20.);}
    @Test void hf08HintHasEvidenceMechanismThreeTradeoffsAndNoNumericProposal(){var first=fixture.input().members().getFirst();
        var hints=new ParameterHintBuilder().build(first.diagnosticReport(),"OPTIMIZATION",first.mechanismReview(),fixture.input().mechanismSource());
        assertThat(hints).hasSize(1);var hint=hints.getFirst();assertThat(hint.get("status")).isEqualTo("SUSPECTED");assertThat(hint.get("parameter_code")).isEqualTo("BRAKE_BUILDUP_RATE");
        assertThat(list(hint.get("evidence_refs"))).isNotEmpty();assertThat(list(hint.get("tradeoffs"))).hasSize(4);assertThat(list(hint.get("missing_prerequisites"))).isEmpty();
        assertThat(hint).doesNotContainKeys("proposed_value","confidence_probability","expected_score","acquisition_score");}
    @TestFactory Stream<DynamicTest> hf08OnlyFourSourceMechanisms(){return BaselineBindingResolver.PARAMETERS.keySet().stream().map(code->DynamicTest.dynamicTest(code,()->{
        var first=fixture.input().members().getFirst();Artifact review=M1CFixture.change(first.mechanismReview(),"/parameter_code",code);
        var hint=new ParameterHintBuilder().build(first.diagnosticReport(),"OPTIMIZATION",review,fixture.input().mechanismSource()).getFirst();assertThat(hint.get("status")).isEqualTo("SUSPECTED");assertThat(hint.get("parameter_code")).isEqualTo(code);
    }));}
    @Test void missingClockGateAbstains(){var first=fixture.input().members().getFirst();var report=M1CFixture.mutable(first.diagnosticReport());
        M1CFixture.set(report,"/report/parameter_mechanism_evidence/VALID_CLOCK_GEOMETRY",unknown("CLOCK_ALIGNMENT_UNKNOWN",null).json());report.put("content_digest",EvidenceReport.contentDigest(report));
        Artifact review=M1CFixture.change(first.mechanismReview(),"/report_digest",report.get("content_digest"));
        var hint=new ParameterHintBuilder().build(report,"OPTIMIZATION",review,fixture.input().mechanismSource()).getFirst();assertThat(hint.get("status")).isEqualTo("ABSTAIN");
        assertThat(list(hint.get("missing_prerequisites"))).contains("VALID_CLOCK_GEOMETRY");assertThat(hint.get("parameter_code")).isNull();}
    @Test void missingDetectionCannotBeTurnedIntoTtcHint(){var first=fixture.input().members().getFirst();var report=M1CFixture.mutable(first.diagnosticReport());
        M1CFixture.set(report,"/report/failure_candidates",List.of(obj("id","no-braking","type","NO_BRAKING")));report.put("content_digest",EvidenceReport.contentDigest(report));
        Artifact review=M1CFixture.change(first.mechanismReview(),"/report_digest",report.get("content_digest"));var hint=new ParameterHintBuilder().build(report,"OPTIMIZATION",review,fixture.input().mechanismSource()).getFirst();
        assertThat(hint.get("status")).isEqualTo("ABSTAIN");}
    @Test void declaredGateCannotReplaceUnorderedActualTimeline(){var first=fixture.input().members().getFirst();var report=M1CFixture.mutable(first.diagnosticReport());
        M1CFixture.set(report,"/report/aeb_timeline/decision/value",2.);report.put("content_digest",EvidenceReport.contentDigest(report));
        var review=M1CFixture.change(first.mechanismReview(),"/report_digest",report.get("content_digest"));
        var hint=new ParameterHintBuilder().build(report,"OPTIMIZATION",review,fixture.input().mechanismSource()).getFirst();
        assertThat(hint.get("status")).isEqualTo("ABSTAIN");assertThat(list(hint.get("missing_prerequisites"))).contains("SOURCE_TIMELINE_MISSING_OR_UNORDERED");}
    @Test void validationIsNeverInspectedEvenWithMalformedReport(){assertThat(new ParameterHintBuilder().build(null,"VALIDATION",null,null)).isEmpty();}
    @Test void retiredParameterRejected(){var first=fixture.input().members().getFirst();var review=M1CFixture.change(first.mechanismReview(),"/parameter_code","PREDICTION_HORIZON");
        var hint=new ParameterHintBuilder().build(first.diagnosticReport(),"OPTIMIZATION",review,fixture.input().mechanismSource()).getFirst();assertThat(hint.get("status")).isEqualTo("ABSTAIN");assertThat(hint.get("parameter_code")).isNull();}
    @Test void sourceHashIsNotCalibrationCertificate(){var d=fixture.input().domains();var campaign=M1CFixture.change(d.approvedCampaign(),"/model_constraints_complete",false);
        assertThat(at(resolve(new SearchRangeResolver.Domains(d.catalogSource(),d.engineSource(),d.liveCatalog(),campaign,List.of())),"/MAX_DECELERATION/suggested_range/status")).isEqualTo("UNKNOWN");}
    private SearchRangeResolver.Scope scope(){return new SearchRangeResolver.Scope("1","10",fixture.input().selection().sha256());}
    private Map<String,Object> resolve(SearchRangeResolver.Domains d){return new SearchRangeResolver().resolve(d,scope());}
}
