package com.vsos.backend.service.optimization;

import com.vsos.backend.common.Json;
import com.vsos.backend.repository.common.Row;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class OptimizationEvidenceTest {
    private final OptimizationService service=new OptimizationService(null,null,null,null,null,null,null,null,null);
    private final OptimizationService.BaselineStats baseline=new OptimizationService.BaselineStats(50,0);
    private Map<String,Object> run(boolean braked,boolean collision,Double jerk,Double impact,Double stopping) {
        return Json.obj("status","COMPLETED","end_reason","TARGET_CLEARED","aeb_mode","ON","verdict",collision?"FAIL":"PASS",
                "collision_occurred",collision,"is_false_positive",false,"is_false_negative",false,"aeb_activated",braked,
                "rms_jerk_mps3",jerk,"impact_speed_mps",impact,"stopping_distance_m",stopping,
                "telemetry_json",Json.write(Json.obj("frames",List.of(Json.obj("t",0)),"metrics",Json.obj("brake_onset_t",braked?0:null))));
    }
    @Test void objectivesUseBrakingRunsForComfortAndAllRunsForCollisionSpeed() {
        var metrics=service.evaluateCandidateRuns(List.of(new Row(run(true,false,4.0,null,10.0)),
                new Row(run(false,false,null,null,null)),new Row(run(true,true,8.0,6.0,20.0))),baseline);
        assertThat(metrics.rmsJerk()).isEqualTo(6);
        assertThat(metrics.impactSpeed()).isEqualTo(2);
        assertThat(metrics.stoppingDistance()).isEqualTo(15);
        assertThat(metrics.constraintViolated()).isFalse();
    }
    @ParameterizedTest @ValueSource(strings={"rms_jerk_mps3","impact_speed_mps","stopping_distance_m","collision_occurred","is_false_positive","is_false_negative","end_reason"})
    void missingEvidenceCannotImproveATrialByBecomingZero(String field) {
        var run=run(true,true,4.0,6.0,10.0);run.put(field,null);
        assertThatThrownBy(()->service.evaluateCandidateRuns(List.of(new Row(run)),baseline)).isInstanceOf(IllegalStateException.class);
    }
    @Test void emptyTimeoutOffAndMissingTraceCannotSupplyBaselineConstraints() {
        assertThatThrownBy(()->service.computeStats(List.of())).isInstanceOf(IllegalStateException.class);
        for(var entry:Map.of("end_reason","TIMEOUT","aeb_mode","OFF","telemetry_json","{}").entrySet()) {
            var run=run(false,false,null,null,null);run.put(entry.getKey(),entry.getValue());
            assertThatThrownBy(()->service.computeStats(List.of(new Row(run)))).isInstanceOf(IllegalStateException.class);
        }
    }
    @Test void noBrakingObjectivesAreNotAZeroCostParetoPoint() {
        assertThatThrownBy(()->service.evaluateCandidateRuns(List.of(new Row(run(false,false,null,null,null))),baseline))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("incomplete");
        assertThatThrownBy(()->service.evaluateCandidateRuns(List.of(),baseline)).isInstanceOf(IllegalStateException.class);
    }

    private Map<String,Object> narrowSpace() {
        return Json.obj("TTC_THRESHOLD",List.of(1.1001,1.1002),"BRAKE_ACTIVATION_DELAY",List.of(.15,.16),
                "BRAKE_BUILDUP_RATE",List.of(10,11),"MAX_DECELERATION",List.of(6,7));
    }
    @Test void actualMoboProposalHonorsStoredNarrowBoundsEvenAfterRounding() {
        var space=narrowSpace();
        var proposal=service.proposeCandidate(new Row(Json.obj("search_space_json",Json.write(space))),List.of(),3);
        @SuppressWarnings("unchecked") var parameters=(Map<String,Double>)proposal.get("proposed_params");
        assertThat(OptimizationService.searchBounds(space).isValid(parameters)).isTrue();
        assertThat(parameters.get("TTC_THRESHOLD")).isBetween(1.1001,1.1002);
    }
    @Test void parentAdjustmentStaysInsideTheCampaignInsteadOfUsingDefaultUpperLimit() {
        var space=narrowSpace();var bounds=OptimizationService.searchBounds(space);
        var parent=new LinkedHashMap<String,Double>();
        com.vsos.core.mobo.ParameterBounds.PARAM_KEYS.forEach(key->parent.put(key,bounds.upper(key)));
        var proposal=new LinkedHashMap<>(parent);
        OptimizationService.differentiateFromParent(proposal,parent,bounds);
        assertThat(proposal).isNotEqualTo(parent);
        assertThat(bounds.isValid(proposal)).isTrue();
    }
    @Test void invalidBoundsAndUnsupportedObjectivesAreRejectedExplicitly() {
        for(Object pair:List.of(List.of(2,1),List.of(.1,2),List.of(1,Double.NaN),List.of(1))) {
            var space=narrowSpace();space.put("TTC_THRESHOLD",pair);
            assertThatThrownBy(()->OptimizationService.searchBounds(space)).isInstanceOf(RuntimeException.class).hasMessageContaining("Invalid optimization search space");
        }
        assertThatThrownBy(()->OptimizationService.validateObjectiveConfig(Json.obj("objectives",List.of("RMS_JERK"))))
                .hasMessageContaining("Unsupported optimization objective");
        OptimizationService.validateObjectiveConfig(Json.obj("objectives",List.of("RMS_JERK","RELATIVE_IMPACT_SPEED","STOPPING_DISTANCE"),
                "constraints",Json.obj("collision_rate_pct",Json.obj("max","baseline"),"false_activation_increase_pts",Json.obj("max",5.0))));
    }
}
