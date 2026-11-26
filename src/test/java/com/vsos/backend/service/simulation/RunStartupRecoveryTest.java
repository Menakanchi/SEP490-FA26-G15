package com.vsos.backend.service.simulation;

import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.scenario.FamilyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.TaskExecutor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RunStartupRecoveryTest {
    private Db db;
    private TaskExecutor executor;
    private RunService runs;
    @TempDir Path directory;

    @BeforeEach
    void setup() {
        db = mock(Db.class);
        executor = mock(TaskExecutor.class);
        var properties = mock(VehicSimProperties.class);
        when(properties.dataRoot()).thenReturn(directory.toString());
        runs = new RunService(db, mock(Queries.class), properties, executor, mock(ApplicationEventPublisher.class),
                new TransactionTemplate(mock(PlatformTransactionManager.class)), mock(FamilyService.class), mock(com.vsos.backend.service.analysis.FailureAnalysisService.class));
    }

    @Test
    void startupClosesInterruptedCampaignsBeforeDispatchingIndependentAndActiveRegressionRuns() {
        when(db.list("SELECT id FROM optimization_runs WHERE status IN ('PENDING','RUNNING')"))
                .thenReturn(List.of(new Row(Map.of("id",7L)),new Row(Map.of("id",8L))));
        when(db.list("SELECT id FROM simulation_runs WHERE status = 'RUNNING'"))
                .thenReturn(List.of(new Row(Map.of("id",42L))));
        when(db.list(startsWith("SELECT id FROM simulation_runs WHERE status = 'PENDING'")))
                .thenReturn(List.of(new Row(Map.of("id",10L)),new Row(Map.of("id",11L))));

        assertThat(runs.recoverUnfinished()).isEqualTo(2);

        var order = inOrder(db,executor);
        order.verify(db).update(argThat(sql -> sql.startsWith("UPDATE optimization_runs SET status = 'FAILED'")
                && sql.contains("WHERE status IN ('PENDING','RUNNING')") && sql.contains("id IN (?,?)")),
                contains("snapshot"),any(),eq(7L),eq(8L));
        order.verify(db).update(argThat(sql -> sql.contains("UPDATE optimization_trials")
                && sql.contains("'CANCELLED' THEN 'PRUNED' ELSE 'FAILED'") && sql.contains("t.status IN ('PENDING','RUNNING')")),any());
        order.verify(db).update(argThat(sql -> sql.contains("JOIN optimization_runs")
                && sql.contains("r.status IN ('PENDING','RUNNING')") && !sql.contains("objective_values_json")),anyString(),any());
        order.verify(db).update(argThat(sql -> sql.contains("JOIN regression_tests")
                && sql.contains("t.execution_status = 'CANCELLED'") && sql.contains("r.status IN ('PENDING','RUNNING')")),anyString(),any());
        order.verify(db).update(eq("UPDATE simulation_runs SET status = 'PENDING', started_at = NULL WHERE id = ? AND status = 'RUNNING'"),eq(42L));
        order.verify(db).list(argThat(sql -> sql.startsWith("SELECT id FROM simulation_runs WHERE status = 'PENDING'")
                && sql.contains("NOT EXISTS") && sql.contains("o.status IN ('FAILED','CANCELLED')")
                && sql.contains("t.execution_status = 'CANCELLED'")));
        order.verify(executor,times(2)).execute(any());
    }

    @Test
    void cancelledParentsAreCleanedEvenWhenNoInterruptedCampaignNeedsRecovery() {
        assertThat(runs.recoverUnfinished()).isZero();

        verify(db,never()).update(startsWith("UPDATE optimization_runs"),any(Object[].class));
        verify(db).update(contains("UPDATE optimization_trials"),any());
        verify(db).update(contains("JOIN optimization_runs"),anyString(),any());
        verify(db).update(contains("JOIN regression_tests"),anyString(),any());
        verifyNoInteractions(executor);
    }

    @Test
    void interruptedWorkerCleanupNeverDispatchesNewRuns() {
        when(db.list("SELECT id FROM simulation_runs WHERE status = 'RUNNING'"))
                .thenReturn(List.of(new Row(Map.of("id",42L))));
        try {
            Thread.currentThread().interrupt();
            assertThat(runs.recoverUnfinished()).isZero();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            verifyNoInteractions(executor);
            verify(db,never()).list(startsWith("SELECT id FROM simulation_runs WHERE status = 'PENDING'"));
            verify(db,never()).update(startsWith("UPDATE optimization_runs"),any(Object[].class));
        } finally {
            Thread.interrupted();
        }
    }
}
