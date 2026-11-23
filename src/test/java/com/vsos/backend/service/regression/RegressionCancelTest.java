package com.vsos.backend.service.regression;

import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.dto.regression.RegressionRecords.RegressionTestRow;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.regression.RegressionRepository;
import com.vsos.backend.service.scenario.FamilyService;
import com.vsos.backend.service.simulation.RunService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Hủy cả regression test (TD-37): test sang CANCELLED trước rồi mới dừng run, không đè test đã chốt, không lộ test của project khác. */
class RegressionCancelTest {

    private static final long PROJECT = 1L;
    private static final long TEST = 5L;
    private static final long USER = 7L;

    private RegressionRepository repo;
    private RunService runs;
    private RegressionService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        repo = mock(RegressionRepository.class);
        runs = mock(RunService.class);
        TransactionTemplate tx = mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(inv -> ((TransactionCallback<Object>) inv.getArgument(0)).doInTransaction(null));
        service = new RegressionService(repo, mock(Queries.class), mock(FamilyService.class), runs, tx);
    }

    @Test
    void cancellingARunningTestMarksItCancelledBeforeStoppingItsRuns() {
        when(repo.markCancelled(PROJECT, TEST)).thenReturn(true);
        when(runs.cancelRegressionRuns(PROJECT, TEST, USER)).thenReturn(Json.obj("stopped", 2, "stopping", 1));

        Map<String, Object> reply = service.cancelTest(PROJECT, TEST, USER);

        assertThat(reply).containsEntry("test_id", TEST).containsEntry("status", "CANCELLED").containsEntry("stopped", 2).containsEntry("stopping", 1);
        // Trạng thái đổi trước để tryFinalize không chốt test từ các run còn lại.
        var order = inOrder(repo, runs);
        order.verify(repo).markCancelled(PROJECT, TEST);
        order.verify(runs).cancelRegressionRuns(PROJECT, TEST, USER);
    }

    @Test
    void aFinishedTestCannotBeCancelledAndNoRunIsTouched() {
        when(repo.markCancelled(PROJECT, TEST)).thenReturn(false);
        when(repo.lockTest(PROJECT, TEST)).thenReturn(test("COMPLETED"));

        assertThatThrownBy(() -> service.cancelTest(PROJECT, TEST, USER)).isInstanceOf(InvalidRequestException.class)
                .hasMessage("Regression test is already COMPLETED; nothing to cancel");
        verify(runs, never()).cancelRegressionRuns(anyLong(), anyLong(), anyLong());
    }

    @Test
    void aTestOfAnotherProjectIsNotFound() {
        when(repo.markCancelled(2L, TEST)).thenReturn(false);
        when(repo.lockTest(2L, TEST)).thenReturn(null);

        assertThatThrownBy(() -> service.cancelTest(2L, TEST, USER)).isInstanceOf(NotFoundException.class);
        verify(runs, never()).cancelRegressionRuns(anyLong(), anyLong(), anyLong());
    }

    @Test
    void aCancelledTestIsShownAsCancelledNotAsARunError() {
        assertThat(RegressionCodes.displayStatus(test("CANCELLED"))).isEqualTo("CANCELLED");
        assertThat(RegressionCodes.displayStatus(test("FAILED"))).isEqualTo("ERROR");
    }

    private static RegressionTestRow test(String executionStatus) {
        return new RegressionTestRow(TEST, PROJECT, 3L, 10L, 11L, 1L, "vehicsim-kinematic-1.4", "RT", Map.of(), executionStatus, "PENDING",
                null, null, USER, null, null);
    }
}
