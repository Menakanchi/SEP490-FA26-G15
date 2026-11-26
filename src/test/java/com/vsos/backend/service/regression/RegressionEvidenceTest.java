package com.vsos.backend.service.regression;

import com.vsos.backend.common.Json;
import com.vsos.backend.dto.regression.RegressionRecords.*;
import com.vsos.backend.repository.common.*;
import com.vsos.backend.repository.regression.RegressionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class RegressionEvidenceTest {
    private Map<String,Object> validRow() {
        return Json.obj("id",1L,"status","COMPLETED","end_reason","TARGET_CLEARED","aeb_mode","ON",
                "collision_occurred",false,"is_false_positive",false,"is_false_negative",false,"verdict","PASS",
                "aeb_activated",false,"trace_frames",1);
    }
    private RunResult read(Map<String,Object> row) {
        var db=mock(Db.class);
        when(db.list(anyString(),any(Object[].class))).thenReturn(List.of(new Row(row)));
        return new RegressionRepository(db).runResults(List.of(1L)).get(1L);
    }
    @Test void validRunWithoutBrakingDoesNotRequireBrakePhaseObjectives() {
        assertThat(read(validRow()).evidenceComplete()).isTrue();
    }
    @ParameterizedTest @ValueSource(strings={"end_reason","collision_occurred","is_false_positive","is_false_negative","verdict","trace_frames"})
    void missingEvidenceCannotBecomeACompletedSafeResult(String key) {
        var row=validRow();row.put(key,null);
        assertThat(read(row).evidenceComplete()).as(key).isFalse();
    }
    @ParameterizedTest @ValueSource(strings={"TIMEOUT","ERROR"})
    void completedExecutionWithInvalidEndReasonCannotPassRegression(String reason) {
        var row=validRow();row.put("end_reason",reason);
        assertThat(read(row).evidenceComplete()).isFalse();
    }
    @Test void collisionRequiresImpactAndOffRunCannotBeComparedAsAebOn() {
        var row=validRow();row.put("collision_occurred",true);
        assertThat(read(row).evidenceComplete()).isFalse();
        row.put("impact_speed_mps",5.0);
        assertThat(read(row).evidenceComplete()).isTrue();
        row.put("aeb_mode","OFF");
        assertThat(read(row).evidenceComplete()).isFalse();
    }
    private RegressionTestRow test(String state) {
        return new RegressionTestRow(7,1,3,4,5,6,"kinematic","test",
                Json.obj("scenario_set",Json.obj("variant_ids",List.of(11L,12L))),state,"PENDING",0L,0L,8,null,null);
    }
    @Test void incompleteOrDuplicatePairsCannotSatisfyTheFrozenTestSet() {
        var result=read(validRow());
        assertThat(RegressionService.evidenceComplete(test("RUNNING"),List.of(),Map.of())).isFalse();
        assertThat(RegressionService.evidenceComplete(test("RUNNING"),List.of(new CandidateRun(1,11,1)),Map.of(1L,result))).isFalse();
        assertThat(RegressionService.evidenceComplete(test("RUNNING"),List.of(new CandidateRun(1,11,1),new CandidateRun(2,11,1)),Map.of(1L,result,2L,result))).isFalse();
    }
    @Test void emptyRegressionFailsWithoutCreatingRecommendation() {
        var repo=mock(RegressionRepository.class);
        when(repo.findTest(7)).thenReturn(test("RUNNING"));
        var service=new RegressionService(repo,null,null,null,new TransactionTemplate(mock(PlatformTransactionManager.class)));
        service.tryFinalize(7);
        verify(repo).markFailed(7);
        verify(repo,never()).markCompleted(anyLong(),anyString(),anyInt(),anyInt(),anyInt());
        verify(repo,never()).insertRecommendation(anyLong(),anyLong(),anyLong(),anyString(),anyString(),anyLong());
    }
    @Test void historicalDefaultSelectionStillRequiresItsStoredVariantCount() {
        var test = new RegressionTestRow(7,1,3,4,5,6,"kinematic","test",
                Json.obj("scenario_set", Json.obj("variant_count",2)),"COMPLETED","PASSED",0L,0L,8,null,null);
        var result = read(validRow());
        assertThat(RegressionService.evidenceComplete(test,List.of(new CandidateRun(1,11,2)),Map.of(1L,result,2L,result))).isFalse();
    }
    @Test void aMissingSourceRunFailsInsteadOfLeavingRegressionRunningForever() {
        var repo = mock(RegressionRepository.class);
        when(repo.findTest(7)).thenReturn(test("RUNNING"));
        when(repo.candidateRuns(7)).thenReturn(List.of(new CandidateRun(1,11,2)));
        var result = read(validRow());
        when(repo.runResults(any())).thenReturn(Map.of(1L,result));
        var service = new RegressionService(repo,null,null,null,new TransactionTemplate(mock(PlatformTransactionManager.class)));
        service.tryFinalize(7);
        verify(repo).markFailed(7);
        verify(repo,never()).markCompleted(anyLong(),anyString(),anyInt(),anyInt(),anyInt());
    }
}
