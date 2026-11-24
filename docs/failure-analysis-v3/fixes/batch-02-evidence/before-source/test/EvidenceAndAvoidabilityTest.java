package com.vsos.core.failureanalysis;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.AvoidabilityAnalyzer.*;
import static com.vsos.core.failureanalysis.Evidence.*;

class EvidenceAndAvoidabilityTest {
    private Range r(double a,double b){return new Range(a,b);}
    private Scope scope(boolean validated,boolean exhaustive){return new Scope("clock","plane","geometry","explicit-finite-test-set",validated?List.of("model-fixture"):List.of(),validated?List.of("bounds-fixture"):List.of(),exhaustive);}
    private List<Action> actions(){return List.of(new Action("configured-brake",new StoppingModel.Parameters(8,20,.25)));}
    private Result screen(Target t,Scope s){return AvoidabilityAnalyzer.screen(2,10,4,2,.3,t,1,actions(),s,.001,12);}
    @Test void unvalidatedNominalSafeScreenCannotBecomePhysicalAvoidability(){var x=screen(new Target(r(10,10),r(5,5),r(0,0),r(0,0)),scope(false,false));assertThat(x.actions().getFirst().proof()).isEqualTo("SCREEN_NO_CONFLICT_FOR_DECLARED_BOUNDS");assertThat(x.avoidability()).isEqualTo("UNKNOWN");assertThat(x.certificate()).isNull();}
    @Test void validatedSafeActionCoversAllPositionVelocityBounds(){var x=screen(new Target(r(10,11),r(4,5),r(-1,1),r(-.1,.1)),scope(true,false));assertThat(x.actions().getFirst().proof()).isEqualTo("SCREEN_NO_CONFLICT_FOR_DECLARED_BOUNDS");assertThat(x.avoidability()).isEqualTo("UNKNOWN");assertThat(x.certificate()).isNull();}
    @Test void finiteSearchFailureDoesNotCertifyUnavoidable(){var x=screen(new Target(r(-100,100),r(-100,100),r(0,0),r(0,0)),scope(true,false));assertThat(x.avoidability()).isEqualTo("UNKNOWN");assertThat(x.certificate()).isNull();}
    @Test void lackOfRobustGuaranteeIsNotAllRealizationsColliding(){var x=screen(new Target(r(-100,100),r(-100,100),r(0,0),r(0,0)),scope(true,true));assertThat(x.avoidability()).isEqualTo("UNKNOWN");assertThat(x.actions()).allMatch(a->a.proof().equals("UNRESOLVED"));}
    @Test void allTestedActionsCollidingDoesNotExhaustPhysicalActions(){var x=screen(new Target(r(0,0),r(0,0),r(0,0),r(0,0)),scope(true,false));assertThat(x.actions().getFirst().proof()).isEqualTo("SCREEN_CONTACT_FOR_DECLARED_BOUNDS");assertThat(x.avoidability()).isEqualTo("UNKNOWN");}
    @Test void domainValidationAndFiniteSetStillNeedVerifiedNumericalCertificate(){var x=screen(new Target(r(0,0),r(0,0),r(0,0),r(0,0)),scope(true,true));assertThat(x.avoidability()).isEqualTo("UNKNOWN");assertThat(x.certificate()).isNull();assertThat(x.missing()).contains("NUMERICAL_ENCLOSURE_ERROR_UNCERTIFIED");}
    @Test void missingScopeDoesNotReturnSafeOrLimit(){assertThat(screen(new Target(r(10,10),r(5,5),r(0,0),r(0,0)),null).avoidability()).isEqualTo("UNKNOWN");}
    @Test void invalidUncertaintySetIsRejected(){assertThatThrownBy(()->r(1,0)).isInstanceOf(IllegalArgumentException.class);assertThatThrownBy(()->r(0,Double.POSITIVE_INFINITY)).isInstanceOf(IllegalArgumentException.class);}
    @Test void longerBodyCanConflictWhileFrontHasPassed(){
        var t=new Target(r(-1,-1),r(0,0),r(0,0),r(0,0));
        var x=AvoidabilityAnalyzer.screen(2,0,4,2,.3,t,1,actions(),scope(true,true),.001,12);
        assertThat(x.actions().getFirst().proof()).isEqualTo("SCREEN_CONTACT_FOR_DECLARED_BOUNDS");
    }
    private EvidenceGates.CalibrationDomain domain(List<EvidenceGates.Constraint> constraints){return new EvidenceGates.CalibrationDomain("cal","v1","a".repeat(64),List.of("validated-holdout"),constraints);}
    @Test void calibrationNameAloneDoesNotDefineDomain(){assertThat(EvidenceGates.calibration(null,Map.of(),true,false).status()).isEqualTo("UNKNOWN");}
    @Test void calibrationUnusedForRawKinematicsIsNotApplicable(){assertThat(EvidenceGates.calibration(null,Map.of(),false,false).status()).isEqualTo("NOT_APPLICABLE");}
    @Test void calibrationKnownViolationWinsOverOtherMissingContext(){
        var d=domain(List.of(new EvidenceGates.Constraint("speed","CLOSED_RANGE",obj("min",0,"max",20),"m/s"),new EvidenceGates.Constraint("vehicle","EQ","audi",null)));
        assertThat(EvidenceGates.calibration(d,Map.of("speed",new EvidenceGates.Context(30.0,"m/s")),true,false).status()).isEqualTo("OUT_OF_DOMAIN");
    }
    @Test void calibrationNeedsUnitsAndAllRequiredContext(){var d=domain(List.of(new EvidenceGates.Constraint("speed","CLOSED_RANGE",obj("min",0,"max",20),"m/s")));assertThat(EvidenceGates.calibration(d,Map.of("speed",new EvidenceGates.Context(10.0,"km/h")),true,false).status()).isEqualTo("UNKNOWN");}
    @Test void matchingValidatedDomainIsInDomain(){var d=domain(List.of(new EvidenceGates.Constraint("speed","CLOSED_RANGE",obj("min",0,"max",20),"m/s"),new EvidenceGates.Constraint("vehicle","IN",List.of("audi","tesla"),null)));assertThat(EvidenceGates.calibration(d,Map.of("speed",new EvidenceGates.Context(10.0,"m/s"),"vehicle",new EvidenceGates.Context("audi",null)),true,false).status()).isEqualTo("IN_DOMAIN");}
    @Test void conflictingCalibrationMetadataCannotBecomeInDomain(){assertThat(EvidenceGates.calibration(domain(List.of(new EvidenceGates.Constraint("vehicle","EQ","audi",null))),Map.of("vehicle",new EvidenceGates.Context("audi",null)),true,true).status()).isEqualTo("UNKNOWN");}
    @Test void evidenceGatesAreLocalToClaim(){var contact=EvidenceGates.capability("contact",Map.of("actor-binding",true,"event-integrity",true),true);var cause=EvidenceGates.capability("cause",Map.of("causal-trace",false,"requirement",false),true);assertThat(contact.status()).isEqualTo("SUFFICIENT");assertThat(cause.status()).isEqualTo("INSUFFICIENT");}
    @Test void intervalTimingUncertaintyCanCrossZero(){assertThat(EvidenceGates.differenceBounds(1,2,1.5,2.5)).containsExactly(-1.5,.5);}
    @Test void invalidIntervalTimingBoundsAreRejected(){assertThatThrownBy(()->EvidenceGates.differenceBounds(2,1,0,1)).isInstanceOf(IllegalArgumentException.class);}
    @Test void missingEndpointGeometryDoesNotThrowOrInventNoConflict(){var states=new ArrayList<GeometryEngine.State>();states.add(null);states.add(new GeometryEngine.State(1,new GeometryEngine.Vec(0,0),new GeometryEngine.Vec(5,5),0));assertThat(GeometryEngine.analyze(states,new GeometryEngine.Body(4,2,.3,"clock","plane",1)).conflict()).isNull();}
    private DiagnosisPolicy.Assessment symptom(String type){return new DiagnosisPolicy.Assessment(List.of(obj("id","test-candidate","type",type,"status","SUSPECTED","missing_evidence",List.of("REQUIREMENT_UNAPPROVED"))),List.of(),"INCONCLUSIVE");}
    private DiagnosisPolicy.FunctionalEvidence functionalEvidence(String type,String status,boolean conditional) {
        var ref=new SourceRef("synthetic-evidence-fixture","/approved-predicates");Map<String,Value> facts=new HashMap<>();
        for(String key:DiagnosisPolicy.requiredGates(type))facts.put(key,value(true,conditional?Status.CONDITIONAL:Status.OBSERVED,null,null,List.of(ref),conditional?new String[]{"MODEL_ASSUMPTION"}:new String[]{}));
        return new DiagnosisPolicy.FunctionalEvidence(new DiagnosisPolicy.Requirement("REQ-TEST","1",status,type,List.of(new SourceRef("synthetic-requirement-fixture","/requirement"))),facts);
    }
    @Test void allThreeSupportedCandidatesRequireExplicitApprovedCitedPredicates(){for(String type:List.of("FALSE_BRAKING","NO_BRAKING","INEFFECTIVE_BRAKING")){var a=new DiagnosisPolicy().applyRequirements(symptom(type),Map.of(type,functionalEvidence(type,"APPROVED",false)));assertThat(a.candidates().getFirst().get("status")).isEqualTo("SUPPORTED");assertThat(a.functionalAssessment()).isEqualTo("FAILURE_SUPPORTED");}}
    @Test void draftOrMissingRequirementStatusCannotUpgradeCandidate(){for(String status:Arrays.asList("DRAFT",null)){var a=new DiagnosisPolicy().applyRequirements(symptom("NO_BRAKING"),Map.of("NO_BRAKING",functionalEvidence("NO_BRAKING",status,false)));assertThat(a.candidates().getFirst().get("status")).isEqualTo("SUSPECTED");}}
    @Test void conditionalPhysicsOrCautionCannotUpgradeCandidate(){var a=new DiagnosisPolicy().applyRequirements(symptom("INEFFECTIVE_BRAKING"),Map.of("INEFFECTIVE_BRAKING",functionalEvidence("INEFFECTIVE_BRAKING","APPROVED",true)));assertThat(a.candidates().getFirst().get("status")).isEqualTo("SUSPECTED");}
    @Test void offCannotAcquireFunctionalFailureEvenWithAnApprovedPackage(){var off=new DiagnosisPolicy.Assessment(List.of(),List.of(),"NOT_APPLICABLE");assertThat(new DiagnosisPolicy().applyRequirements(off,Map.of("NO_BRAKING",functionalEvidence("NO_BRAKING","APPROVED",false))).candidates()).isEmpty();}
    @Test void oneMissingOrUntraceableDerivedPredicatePreventsSupport(){var full=functionalEvidence("NO_BRAKING","APPROVED",false);var facts=new HashMap<>(full.gates());String key=DiagnosisPolicy.requiredGates("NO_BRAKING").getFirst();facts.remove(key);assertThat(new DiagnosisPolicy().applyRequirements(symptom("NO_BRAKING"),Map.of("NO_BRAKING",new DiagnosisPolicy.FunctionalEvidence(full.requirement(),facts))).candidates().getFirst().get("status")).isEqualTo("SUSPECTED");facts.put(key,value(true,Status.DERIVED,null,null,List.of(new SourceRef("untraceable-fixture",""))));assertThat(new DiagnosisPolicy().applyRequirements(symptom("NO_BRAKING"),Map.of("NO_BRAKING",new DiagnosisPolicy.FunctionalEvidence(full.requirement(),facts))).candidates().getFirst().get("status")).isEqualTo("SUSPECTED");}
}
