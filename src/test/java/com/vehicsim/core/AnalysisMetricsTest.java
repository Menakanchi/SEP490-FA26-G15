package com.vehicsim.core;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class AnalysisMetricsTest {
    private static AnalysisMetrics.Sample sample(Boolean braked, Boolean hit, Double jerk, Double impact, Double stopping) {
        return new AnalysisMetrics.Sample("COMPLETED","TARGET_CLEARED",hit,false,false,"PASS",braked,jerk,impact,stopping);
    }
    @Test void adr040MeansIncludeSafeImpactZeroButExcludeNoBrakeJerkAndStopping() {
        var values=List.of(sample(true,true,2.0,6.0,10.0),sample(true,false,4.0,null,20.0),sample(false,false,null,null,null));
        var aggregate=AnalysisMetrics.aggregate(values);
        assertThat(((AnalysisMetrics.Objective)aggregate.get("impact_speed_mps")).value()).isEqualTo(2.0);
        assertThat(((AnalysisMetrics.Objective)aggregate.get("rms_jerk_mps3")).value()).isEqualTo(3.0);
        assertThat(((AnalysisMetrics.Objective)aggregate.get("stopping_distance_m")).value()).isEqualTo(15.0);
    }
    @Test void missingImpactOnCollisionNeverBecomesZero() {
        var result=AnalysisMetrics.aggregate(List.of(sample(true,true,2.0,null,10.0)));
        var impact=(AnalysisMetrics.Objective)result.get("impact_speed_mps");
        assertThat(impact.value()).isNull(); assertThat(impact.missing()).isEqualTo(1);
        assertThat(AnalysisMetrics.objectivesAvailable(List.of(sample(true,true,2.0,null,10.0)))).isFalse();
    }
    @Test void timeoutCancelledAndUnknownFlagsAreInvalid() {
        for(String status:List.of("STOPPED","FAILED","RUNNING")) {
            assertThat(AnalysisMetrics.valid(new AnalysisMetrics.Sample(status,"TIMEOUT",false,false,false,"PASS",true,0.0,null,0.0))).isFalse();
        }
        assertThat(AnalysisMetrics.valid(new AnalysisMetrics.Sample("COMPLETED","TIMEOUT",false,false,false,"PASS",true,0.0,null,0.0))).isFalse();
        assertThat(AnalysisMetrics.valid(sample(true,null,2.0,null,10.0))).isFalse();
    }
    @Test void noBrakingIsNotApplicableAndNanIsMissing() {
        var noBrake=(AnalysisMetrics.Objective)AnalysisMetrics.aggregate(List.of(sample(false,false,null,null,null))).get("rms_jerk_mps3");
        assertThat(noBrake.status()).isEqualTo("NOT_APPLICABLE"); assertThat(noBrake.value()).isNull();
        assertThat(((AnalysisMetrics.Objective)AnalysisMetrics.aggregate(List.of(sample(true,false,Double.NaN,null,2.0))).get("rms_jerk_mps3")).missing()).isEqualTo(1);
    }
    @Test void derivedJerkUsesRecordedDtAndDoesNotBridgeMissingAcceleration() {
        var points=RecordedTelemetry.project(List.of(Map.of("t",0.0,"ego_a",0.0),Map.of("t",0.1,"ego_a",-1.0),
                Map.of("t",0.2),Map.of("t",0.3,"ego_a",-2.0)),null);
        assertThat(points.get(1)).containsEntry("jerk_mps3",-10.0);
        assertThat(points.get(3)).containsEntry("jerk_mps3",null);
    }
}
