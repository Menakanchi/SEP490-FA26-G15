package com.vehicsim.vehicsim;

import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpStatus;
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
    private RunService service;
    private Map<String, Object> run;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        events = mock(ApplicationEventPublisher.class);
        service = new RunService(db, mock(Queries.class), mock(VehicSimProperties.class), mock(TaskExecutor.class), events,
                mock(TransactionTemplate.class), mock(FamilyService.class));
        run = new HashMap<>(Map.of("id", RUN, "project_id", PROJECT, "status", "FAILED", "simulator_version", CARLA,
                "fixed_delta_seconds", 0.05));
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
    void runOutsideTheProjectIsNotFound() {
        when(db.first(startsWith("SELECT * FROM simulation_runs"), any(Object[].class))).thenReturn(null);
        assertThatThrownBy(() -> service.submitCarlaResult(PROJECT, RUN, USER, result(CARLA))).isInstanceOf(NotFoundException.class);
        assertNothingWritten();
    }
}
