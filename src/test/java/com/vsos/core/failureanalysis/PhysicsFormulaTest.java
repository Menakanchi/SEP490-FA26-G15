package com.vsos.core.failureanalysis;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.vsos.core.failureanalysis.GeometryEngine.*;

class PhysicsFormulaTest {
    private StoppingModel.Parameters parameters(double cap,double jerk,double delay){return new StoppingModel.Parameters(cap,jerk,delay);}
    private Body body(){return new Body(4,2,.3,"clock","plane",10);}
    private State s(double t,double x,double y){return new State(t,new Vec(0,0),new Vec(x,y),0);}

    @Test void delayRampKnownExample(){assertThat(StoppingModel.stop(11.1,parameters(8,20,.25)).distanceM()).isCloseTo(12.6422916666667,within(1e-8));}
    @Test void fiftyKmhKnownExample(){var x=StoppingModel.stop(50/3.6,parameters(8,20,.25));assertThat(x.distanceM()).isCloseTo(18.2529938272,within(1e-8));assertThat(x.seconds()).isCloseTo(2.1861111111,within(1e-8));}
    @Test void wetCapKnownExample(){assertThat(StoppingModel.stop(50/3.6,parameters(6.3765,20,.25)).distanceM()).isCloseTo(20.785227299,within(1e-8));}
    @Test void stopDuringBuildup(){var x=StoppingModel.stop(1,parameters(8,20,.25));assertThat(x.duringBuildup()).isTrue();assertThat(x.distanceM()).isCloseTo(.4608185107,within(1e-8));assertThat(x.seconds()).isCloseTo(.566227766,within(1e-8));}
    @Test void zeroSpeedDoesNotWaitForDelay(){var x=StoppingModel.stop(0,parameters(8,20,.25));assertThat(x.distanceM()).isZero();assertThat(x.seconds()).isZero();}
    @Test void branchBoundaryIsContinuous(){var p=parameters(8,20,.25);double v=8.0*8/(2*20);assertThat(StoppingModel.stop(v-1e-10,p).distanceM()).isCloseTo(StoppingModel.stop(v+1e-10,p).distanceM(),within(1e-8));}
    @Test void infiniteJerkLimitConvergesToPureDelayAndIdealStop(){double v=10;assertThat(StoppingModel.stop(v,parameters(8,1e12,.25)).distanceM()).isCloseTo(v*.25+v*v/16,within(1e-8));}
    @Test void delayAddsExactlySpeedTimesDelay(){assertThat(StoppingModel.stop(10,parameters(8,20,.45)).distanceM()-StoppingModel.stop(10,parameters(8,20,.25)).distanceM()).isCloseTo(2,within(1e-10));}
    @Test void analyticModelMatchesIndependentMidpointIntegration(){
        for(double initial:new double[]{1,11.1,50/3.6}){
            double v=initial,x=0,time=0,h=1e-5;
            while(v>0){double b=Math.min(8,Math.max(0,(time+h/2-.25)*20));double next=Math.max(0,v-b*h);x+=(v+next)*h/2;v=next;time+=h;}
            assertThat(StoppingModel.stop(initial,parameters(8,20,.25)).distanceM()).isCloseTo(x,within(1e-7));
        }
    }
    @Test void stoppedTrajectoryNeverReverses(){var p=parameters(8,20,.25);var a=StoppingModel.at(1,p,10);assertThat(a.speedMps()).isZero();assertThat(a.distanceM()).isCloseTo(.4608185107,within(1e-8));}
    @Test void invalidRampInputsAreRejected(){for(var p:List.of(parameters(0,20,0),parameters(8,0,0),parameters(8,20,-1),parameters(Double.NaN,20,0)))assertThatThrownBy(()->StoppingModel.stop(1,p)).isInstanceOf(IllegalArgumentException.class);}
    @Test void availableDecelerationIsConditionalCapNotAchievement(){var e=StoppingModel.availableDeceleration(8.0,9.5,9.13,.65);assertThat(e.cap()).isCloseTo(6.3765,within(1e-12));}
    @Test void missingBoundDoesNotBecomeInfinity(){var e=StoppingModel.availableDeceleration(8.0,null,9.13,.65);assertThat(e.cap()).isNull();assertThat(e.knownUpperBound()).isCloseTo(6.3765,within(1e-12));assertThat(e.missing()).contains("VEHICLE_CAP");}
    @Test void inverseRampRequirementUsesDelayAndBuildup(){var r=StoppingModel.requiredEnvelope(11.1,12.6422916666667,20,.25,1,10);assertThat(r.requiredCap()).isCloseTo(8,within(1e-8));}
    @Test void pureDelayInfeasibleDistanceHasNoInfiniteDeceleration(){assertThat(StoppingModel.requiredIdeal(10,2,.25)).isNull();assertThat(StoppingModel.requiredEnvelope(10,2,20,.25,1,10).requiredCap()).isNull();}
    @Test void radiusIsIncludedOnceAtNearBoundary(){assertThat(StoppingModel.margin(20-.3-1,10,1)).isCloseTo(7.7,within(1e-12));}
    @Test void stoppingWindowsKeepDisjointUnionAndCensorLastBoundary(){
        var path=List.of(new StoppingModel.StopState(0,10,5),new StoppingModel.StopState(1,1,5),new StoppingModel.StopState(2,10,5));
        var r=StoppingModel.windows(path,parameters(8,20,.25),0,1,true);assertThat(r.intervals()).hasSize(2);assertThat(r.latestDecision()).isNull();assertThat(r.rightCensored()).isTrue();
    }
    @Test void resolvedStoppingWindowHasFiniteLatestBoundary(){var r=StoppingModel.windows(List.of(new StoppingModel.StopState(0,20,10),new StoppingModel.StopState(1,1,10)),parameters(8,20,.25),0,1,true);assertThat(r.latestDecision()).isBetween(0.0,1.0);}
    @Test void observedPostBrakeTraceCannotBeUsedAsUnbrakedPath(){assertThat(StoppingModel.windows(List.of(new StoppingModel.StopState(0,20,10),new StoppingModel.StopState(1,10,0)),parameters(8,20,.25),0,1,false).complete()).isFalse();}
    @Test void projectionUsesCarlaLeftConvention(){var p=GeometryEngine.project(new Vec(3,4),new Vec(0,0),Math.PI/2);assertThat(p.forward()).isCloseTo(4,within(1e-12));assertThat(p.left()).isCloseTo(3,within(1e-12));assertThat(GeometryEngine.kmhToMps(36)).isEqualTo(10);}
    @Test void oneDimensionalTtcIsNotCollisionTruth(){assertThat(GeometryEngine.longitudinalTtc(10,5)).isEqualTo(2);assertThat(GeometryEngine.analyze(List.of(s(0,10,4),s(3,-5,4)),body()).conflict()).isFalse();assertThat(GeometryEngine.longitudinalTtc(-1,5)).isNull();}
    @Test void axisExpandedCornerIsNotDiscRectangleContact(){var r=GeometryEngine.analyze(List.of(s(0,2.25,1.25),s(1,2.25,1.25)),body());assertThat(r.conflict()).isFalse();assertThat(r.minimumClearance()).isCloseTo(Math.sqrt(.125)-.3,within(1e-10));}
    @Test void exactCornerTangencyIsClosedContact(){double d=.3/Math.sqrt(2);var r=GeometryEngine.analyze(List.of(s(0,2+d,1+d),s(1,2+d,1+d)),body());assertThat(r.conflict()).isTrue();}
    @Test void betweenSampleConflictIsFoundContinuously(){var r=GeometryEngine.analyze(List.of(s(0,-5,0),s(1,5,0)),body());assertThat(r.conflict()).isTrue();assertThat(r.conflicts().getFirst().start()).isCloseTo(.27,within(1e-10));assertThat(r.conflicts().getFirst().end()).isCloseTo(.73,within(1e-10));}
    @Test void rearBodyConflictRemainsWhenFrontAlreadyPassed(){var r=GeometryEngine.analyze(List.of(s(0,-1,1.2),s(1,-1,1.2)),body());assertThat(r.conflict()).isTrue();}
    @Test void interiorSignedIndicatorIsNotClaimedPenetrationDepth(){var r=GeometryEngine.analyze(List.of(s(0,0,0),s(1,0,0)),body());assertThat(r.minimumSignedIndicator()).isEqualTo(-.3);assertThat(r.minimumClearance()).isZero();}
    @Test void rotationCannotProduceFalseNoConflictCertificate(){var r=GeometryEngine.analyze(List.of(s(0,5,5),new State(1,new Vec(0,0),new Vec(5,5),.1)),body());assertThat(r.conflict()).isNull();assertThat(r.complete()).isFalse();}
    @Test void missingClockOrGeometryIsUnknown(){assertThat(GeometryEngine.analyze(List.of(s(0,1,1),s(1,1,1)),new Body(4,2,.3,null,"plane",1)).conflict()).isNull();assertThat(GeometryEngine.analyze(List.of(s(0,1,1)),body()).conflict()).isNull();}
    @Test void coverageGapIsUnknownRatherThanInterpolatedSafety(){assertThat(GeometryEngine.analyze(List.of(s(0,-5,0),s(1,5,0)),new Body(4,2,.3,"clock","plane",.1)).conflict()).isNull();}
    @Test void petPositiveForDisjointNamedEncounter(){assertThat(GeometryEngine.pet(new Interval(1,2),new Interval(3,4),"area","clock").seconds()).isEqualTo(1);}
    @Test void petOverlappingIsNullRatherThanZero(){var p=GeometryEngine.pet(new Interval(1,3),new Interval(2,4),"area","clock");assertThat(p.seconds()).isNull();assertThat(p.relation()).isEqualTo("OVERLAPPING");}
    @Test void petCensoredExitIsUnknown(){assertThat(GeometryEngine.pet(new Interval(1,2,false,true),new Interval(3,4),"area","clock").relation()).isEqualTo("CENSORED");}
    @Test void crossingRelativeVelocityUsesVectorDifference(){assertThat(ImpactAnalyzer.relativeVelocity(10,0,0,0,2,0)).isCloseTo(Math.sqrt(104),within(1e-12));assertThat(ImpactAnalyzer.relativeVelocity(10,0,0,5,0,0)).isEqualTo(5);}
    @Test void jerkUsesActualIrregularDurations(){var r=PhysicalBrakingAnalyzer.jerk(List.of(new PhysicalBrakingAnalyzer.Sample(0,0.0),new PhysicalBrakingAnalyzer.Sample(.1,1.0),new PhysicalBrakingAnalyzer.Sample(.3,1.0)),.21);assertThat(r.value()).isCloseTo(Math.sqrt(100*.1/.3),within(1e-10));}
    @Test void jerkDoesNotBridgeMissingSamples(){var r=PhysicalBrakingAnalyzer.jerk(List.of(new PhysicalBrakingAnalyzer.Sample(0,0.0),new PhysicalBrakingAnalyzer.Sample(.1,null),new PhysicalBrakingAnalyzer.Sample(.2,2.0)),.11);assertThat(r.value()).isNull();assertThat(r.unresolvedIntervals()).isEqualTo(2);}
    @Test void trackingErrorIntegratesDurationRatherThanRowCount(){var a=List.of(new PhysicalBrakingAnalyzer.Sample(0,0.0),new PhysicalBrakingAnalyzer.Sample(1,2.0));var b=List.of(new PhysicalBrakingAnalyzer.Sample(0,0.0),new PhysicalBrakingAnalyzer.Sample(1,0.0));assertThat(PhysicalBrakingAnalyzer.trackingError(a,b,1.1).value()).isCloseTo(Math.sqrt(4.0/3),within(1e-12));}
    @Test void decelerationWindowUsesTimestampsNotTenRows(){var speed=List.of(new PhysicalBrakingAnalyzer.Sample(0,10.0),new PhysicalBrakingAnalyzer.Sample(.03,9.7),new PhysicalBrakingAnalyzer.Sample(.1,9.0),new PhysicalBrakingAnalyzer.Sample(.2,8.0));assertThat(PhysicalBrakingAnalyzer.peakDeceleration(speed,.1,.11)).isCloseTo(10,within(1e-10));}
    @Test void coreCollisionWithoutContactLeavesAuthorityUnknown(){assertThat(DiagnosisPolicy.outcome(true,false,false,null,null,null).label()).isEqualTo("UNKNOWN");}
    @Test void noContactDoesNotImplySafe(){assertThat(DiagnosisPolicy.outcome(false,false,false,10.0,10.0,1.0).label()).isEqualTo("UNKNOWN");}
    @Test void verifiedAbsenceAndApprovedClearanceCanSupportSafeOrNearMiss(){assertThat(DiagnosisPolicy.outcome(false,false,true,2.0,3.0,1.0).label()).isEqualTo("SAFE");assertThat(DiagnosisPolicy.outcome(false,false,true,.1,.2,.5).label()).isEqualTo("NEAR_MISS");}
    @Test void uncertaintyCrossingThresholdLeavesOutcomeUnknown(){assertThat(DiagnosisPolicy.outcome(false,false,true,.1,2.0,.5).label()).isEqualTo("UNKNOWN");}
    @Test void measuredTravelKeepsHorizontalAnd3dConventionsSeparate(){var p=List.of(new PhysicalBrakingAnalyzer.Position(0,0.0,0.0,0.0),new PhysicalBrakingAnalyzer.Position(1,3.0,4.0,0.0),new PhysicalBrakingAnalyzer.Position(2,3.0,4.0,12.0));assertThat(PhysicalBrakingAnalyzer.travel(p,1.1,true).totalM()).isEqualTo(5);assertThat(PhysicalBrakingAnalyzer.travel(p,1.1,false).totalM()).isEqualTo(17);}
    @Test void missingTravelCoverageIsNotZeroOrInterpolated(){var p=List.of(new PhysicalBrakingAnalyzer.Position(0,0.0,0.0,0.0),new PhysicalBrakingAnalyzer.Position(2,3.0,4.0,0.0));assertThat(PhysicalBrakingAnalyzer.travel(p,.1,true).totalM()).isNull();assertThat(PhysicalBrakingAnalyzer.travel(p,.1,true).partialM()).isNull();}
    @Test void inverseDomainUsesPhysicalZeroLimitWithoutInventedLowerSearchRange(){assertThat(StoppingModel.requiredEnvelope(11.1,12.6422916666667,20,.25,0,8).requiredCap()).isCloseTo(8,within(1e-8));assertThat(StoppingModel.requiredEnvelope(0,0,20,.25,0,8).requiredCap()).isZero();}
    @Test void fixedRotatedObbKeepsContinuousConflictTimes(){double yaw=Math.PI/4;var states=List.of(new State(0,new Vec(0,0),new Vec(-5*Math.cos(yaw),-5*Math.sin(yaw)),yaw),new State(1,new Vec(0,0),new Vec(5*Math.cos(yaw),5*Math.sin(yaw)),yaw));var r=GeometryEngine.analyze(states,body());assertThat(r.conflicts().getFirst().start()).isCloseTo(.27,within(1e-10));assertThat(r.conflicts().getFirst().end()).isCloseTo(.73,within(1e-10));}
}
