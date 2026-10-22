package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ``POST /runs/{id}/carla-result`` không được làm hỏng dữ liệu: không ghi số CARLA vào run động học (luật cứng 9), không
 * ghi đè run đã có kết quả (nhân đôi ca lỗi), không sửa run của regression đã chốt, và kiểm ``result.json`` như run chạy
 * trong backend. Logic thật, {@link Db} giả.
 */
class CarlaResultSubmissionTest {

    private static final long PROJECT = 1L;
    private static final long RUN = 42L;
    private static final long USER = 5L;
    private static final String CARLA = "carla-0.9.16";

    private Db db;
    private ApplicationEventPublisher events;
    private PlatformTransactionManager transactions;
    private RunService service;
    private Map<String, Object> run;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        events = mock(ApplicationEventPublisher.class);
        transactions = mock(PlatformTransactionManager.class);
        when(transactions.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        service = new RunService(db, mock(Queries.class), mock(VehicSimProperties.class), mock(TaskExecutor.class), events,
                new TransactionTemplate(transactions), mock(FamilyService.class));
        run = new HashMap<>(Map.of("id", RUN, "project_id", PROJECT, "status", "FAILED", "simulator_version", CARLA,
                "fixed_delta_seconds", 0.05, "random_seed", 48042L, "scenario_id", 7L,
                "scenario_version_id", 8L, "aeb_version_id", 9L, "carla_vehicle_model_id", 10L));
        run.put("regression_test_id", null);
        when(db.first(startsWith("SELECT * FROM simulation_runs"), any(Object[].class))).thenAnswer(i -> new Row(run));
        when(db.scalar(startsWith("SELECT COUNT(*) FROM regression_tests"), any(Object[].class))).thenReturn(0L);
    }

    private static Map<String, Object> result(String simulator) {
        Map<String, Object> outcome = new LinkedHashMap<>();
        outcome.put("frames", List.of());
        outcome.put("events", List.of());
        outcome.put("metrics", Map.of("collision", false));
        outcome.put("end_reason", "STOPPED");
        outcome.put("duration_s", 6.0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("format", RunService.RESULT_FORMAT);
        result.put("simulator", simulator);
        result.put("seed", 48042L);
        result.put("source", Map.of("run_id", RUN, "scenario_id", 7L, "scenario_version_id", 8L,
                "aeb_version_id", 9L, "carla_vehicle_model_id", 10L));
        result.put("outcome", outcome);
        result.put("evaluation", Map.of("chain", List.of(), "aeb_result", Map.of()));
        result.put("artifacts", Map.of("video", "C:/Windows/System32/config/SAM"));
        return result;
    }

    private void assertNothingWritten() {
        verify(db, never()).update(anyString(), any(Object[].class));
        verify(db, never()).insert(anyString(), any(Object[].class));
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    void acceptsResultForFailedCarlaRunAndIgnoresClientArtifactPaths() {
        Map<String, Object> reply = service.submitCarlaResult(PROJECT, RUN, USER, result(CARLA));

        assertThat(reply).containsEntry("status", "COMPLETED");
        verify(db).update(startsWith("DELETE FROM failures"), any(Object[].class));
        verify(db).update(startsWith("UPDATE simulation_runs SET status = ?"), any(Object[].class));
        verify(db, never()).insert(startsWith("INSERT INTO simulation_artifacts"), any(Object[].class));
        verify(events).publishEvent(new RunService.RunFinished(RUN));
    }

    @Test
    void neverWritesCarlaNumbersIntoAKinematicRun() {
        run.put("simulator_version", "vehicsim-kinematic-1.1");
        assertThatThrownBy(() -> service.submitCarlaResult(PROJECT, RUN, USER, result(CARLA)))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("động học");
        assertNothingWritten();
    }

    @Test
    void completedOrRunningRunsAreNotOverwritten() {
        for (String status : List.of("COMPLETED", "RUNNING")) {
            run.put("status", status);
            assertThatThrownBy(() -> service.submitCarlaResult(PROJECT, RUN, USER, result(CARLA)))
                    .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
        }
        assertNothingWritten();
    }

    @Test
    void runOfAFinishedRegressionTestIsLocked() {
        run.put("regression_test_id", 30L);
        when(db.scalar(startsWith("SELECT COUNT(*) FROM regression_tests"), any(Object[].class))).thenReturn(1L);
        assertThatThrownBy(() -> service.submitCarlaResult(PROJECT, RUN, USER, result(CARLA)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
        assertNothingWritten();
    }

    @Test
    void resultMustMatchTheRunsSimulatorAndFormat() {
        assertThatThrownBy(() -> service.submitCarlaResult(PROJECT, RUN, USER, result("carla-0.9.15")))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("carla-0.9.16");
        Map<String, Object> noEvaluation = result(CARLA);
        noEvaluation.remove("evaluation");
        assertThatThrownBy(() -> service.submitCarlaResult(PROJECT, RUN, USER, noEvaluation))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("evaluation");
        assertNothingWritten();
    }

    @Test
    void rejectsMissingWrongOrNonIntegerSeedBeforeWriting() {
        for (Object seed : new Object[]{null, 999L, 48042.5, "48042"}) {
            Map<String, Object> payload = result(CARLA);
            payload.put("seed", seed);
            assertThatThrownBy(() -> service.submitCarlaResult(PROJECT, RUN, USER, payload))
                    .isInstanceOf(InvalidRequestException.class).hasMessageContaining("seed");
        }
        assertNothingWritten();
    }

    @Test
    void everySourceIdentifierMustMatchTheRunBeforeWriting() {
        for (String key : List.of("run_id", "scenario_id", "scenario_version_id", "aeb_version_id", "carla_vehicle_model_id")) {
            for (Object wrong : new Object[]{null, 999L, 999.5, "42"}) {
                Map<String, Object> payload = result(CARLA);
                Map<String, Object> source = new LinkedHashMap<>(Json.asMap(payload.get("source")));
                source.put(key, wrong);
                payload.put("source", source);
                assertThatThrownBy(() -> service.submitCarlaResult(PROJECT, RUN, USER, payload))
                        .isInstanceOf(InvalidRequestException.class).hasMessageContaining("source." + key);
            }
        }
        Map<String, Object> noSource = result(CARLA);
        noSource.remove("source");
        assertThatThrownBy(() -> service.submitCarlaResult(PROJECT, RUN, USER, noSource))
                .isInstanceOf(InvalidRequestException.class).hasMessageContaining("source");
        assertNothingWritten();
    }

    @Test
    void regressionIsNotifiedOnlyAfterTheResultCommits() {
        service.submitCarlaResult(PROJECT, RUN, USER, result(CARLA));

        var order = inOrder(transactions, events);
        order.verify(transactions).commit(any());
        order.verify(events).publishEvent(new RunService.RunFinished(RUN));
    }

    @Test
    void springListenerStartsAFreshTransactionAfterUploadCompletes() {
        // Lifecycle transaction/proxy thật; Db giả nên không cần MySQL hoặc ghi dữ liệu demo.
        var manager = new AbstractPlatformTransactionManager() {
            @Override
            protected Object doGetTransaction() { return new Object(); }

            @Override
            protected boolean isExistingTransaction(Object transaction) {
                return TransactionSynchronizationManager.isActualTransactionActive();
            }

            @Override
            protected void doBegin(Object transaction, TransactionDefinition definition) { }

            @Override
            protected void doCommit(DefaultTransactionStatus status) { }

            @Override
            protected void doRollback(DefaultTransactionStatus status) { }
        };
        var template = new TransactionTemplate(manager);
        doAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isFalse();
            template.executeWithoutResult(status -> assertThat(status.isNewTransaction()).isTrue());
            return null;
        }).when(events).publishEvent(any(Object.class));
        var target = new RunService(db, mock(Queries.class), mock(VehicSimProperties.class), mock(TaskExecutor.class),
                events, template, mock(FamilyService.class));
        var proxy = new ProxyFactory(target);
        proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));

        ((RunService) proxy.getProxy()).submitCarlaResult(PROJECT, RUN, USER, result(CARLA));

        verify(events).publishEvent(new RunService.RunFinished(RUN));
    }

    @Test
    void persistenceFailureRollsBackWithoutNotifyingRegression() {
        when(db.update(startsWith("UPDATE simulation_runs SET status = ?"), any(Object[].class)))
                .thenThrow(new IllegalStateException("write failed"));

        assertThatThrownBy(() -> service.submitCarlaResult(PROJECT, RUN, USER, result(CARLA)))
                .isInstanceOf(IllegalStateException.class).hasMessage("write failed");
        verify(transactions).rollback(any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    void failedCommitDoesNotNotifyRegression() {
        doThrow(new TransactionSystemException("commit failed")).when(transactions).commit(any());

        assertThatThrownBy(() -> service.submitCarlaResult(PROJECT, RUN, USER, result(CARLA)))
                .isInstanceOf(TransactionSystemException.class);
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    void runOutsideTheProjectIsNotFound() {
        when(db.first(startsWith("SELECT * FROM simulation_runs"), any(Object[].class))).thenReturn(null);
        assertThatThrownBy(() -> service.submitCarlaResult(PROJECT, RUN, USER, result(CARLA))).isInstanceOf(NotFoundException.class);
        assertNothingWritten();
    }
}
