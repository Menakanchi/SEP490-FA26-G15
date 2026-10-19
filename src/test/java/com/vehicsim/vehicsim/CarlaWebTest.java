package com.vehicsim.vehicsim;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.TaskExecutor;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class CarlaWebTest {
    private Db db;
    private VehicSimProperties props;
    private RunService runs;
    private TransactionTemplate tx;
    @TempDir Path directory;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        props = mock(VehicSimProperties.class);
        when(props.simulator()).thenReturn("carla-xosc");
        when(props.carlaVersion()).thenReturn("0.9.16");
        when(props.carlaCommand()).thenReturn("[\"python\",\"worker/run_xosc.py\"]");
        when(props.dataRoot()).thenReturn(directory.toString());
        when(props.maxActiveRunsPerUser()).thenReturn(1);
        when(db.scalar(anyString(), any(Object[].class))).thenReturn(0L);
        when(db.insert(anyString(), any(Object[].class))).thenReturn(70L);
        when(db.first(anyString(), any(Object[].class))).thenReturn(new Row(Json.obj("id", 42L, "scenario_id", 3L,
                "scenario_version_id", 4L, "carla_vehicle_model_id", 5L, "aeb_version_id", 6L,
                "random_seed", 123456L, "run_config_json", Json.write(Map.of("ego_speed_kmh", 40)))));
        tx = mock(TransactionTemplate.class);
        runs = new RunService(db, mock(Queries.class), props, mock(TaskExecutor.class), mock(ApplicationEventPublisher.class),
                tx, mock(FamilyService.class));
    }

    @Test
    void xoscProfileHasADifferentIdentityFromDirectCarla() {
        assertThat(runs.configuredSimulator()).isEqualTo("carla-0.9.16-xosc2");
        when(props.simulator()).thenReturn("carla");
        assertThat(runs.configuredSimulator()).isEqualTo("carla-0.9.16");
    }

    @Test
    void carlaReplayKeepsOriginalVariantVehicleAebAndSeedWithoutCrossSimulatorBaselineLink() {
        assertThat(runs.runOnCarla(1, 42, 7)).isEqualTo(70);
        var call = mockingDetails(db).getInvocations().stream().filter(i -> i.getMethod().getName().equals("insert")).findFirst().orElseThrow();
        assertThat(java.util.Arrays.asList(call.getArguments()).subList(1, 8)).containsExactly(1L, 3L, 4L, 5L, 6L, "CARLA", "carla-0.9.16-xosc2");
        assertThat(call.getArguments()[11]).isNull(); // baseline_run_id chỉ dành cho cặp cùng simulator
        assertThat(call.getArguments()[13]).isEqualTo(123456L);
        verify(db).first("SELECT * FROM simulation_runs WHERE id = ? AND project_id = ?", 42L, 1L);
    }

    @Test
    void replayCannotBypassTheActiveRunQuota() {
        when(db.scalar(anyString(), any(Object[].class))).thenReturn(1L);
        assertThatThrownBy(() -> runs.runOnCarla(1, 42, 7)).isInstanceOfSatisfying(ResponseStatusException.class,
                e -> assertThat(e.getStatusCode().value()).isEqualTo(429));
        verify(db, never()).insert(anyString(), any(Object[].class));
    }

    @Test
    void oldDirectRunnerConfigurationCannotQueueAnXoscJob() {
        when(props.simulator()).thenReturn("carla");
        assertThatThrownBy(() -> runs.runOnCarla(1, 42, 7)).isInstanceOf(Vs.InvalidRequestException.class)
                .hasMessageContaining("OpenSCENARIO");
        verify(db, never()).insert(anyString(), any(Object[].class));
    }

    @Test
    void queuedOldXoscRunFailsBeforeBuildingBundleOrLaunchingWorker() {
        when(tx.execute(any())).thenReturn(true);
        doAnswer(call -> {
            java.util.function.Consumer<org.springframework.transaction.TransactionStatus> callback = call.getArgument(0);
            callback.accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        when(db.first("SELECT * FROM simulation_runs WHERE id = ?", 42L))
                .thenReturn(new Row(Json.obj("id", 42L, "simulator_version", "carla-0.9.16-xosc1")));

        runs.executeRun(42L);

        verify(db).update(eq("UPDATE simulation_runs SET status = 'FAILED', error_message = ?, ended_at = ? WHERE id = ?"),
                contains("-xosc1"), any(), eq(42L));
        verify(props, never()).carlaCommand();
        verify(db, never()).scalar(anyString(), any(Object[].class));
    }

    @Test
    void artifactNamesCannotEscapeTheRunDirectory() throws Exception {
        for (String name : List.of("../bundle.json", "..\\result.json", "result.json", "/etc/passwd")) {
            assertThatThrownBy(() -> runs.carlaFile(1, 42, name)).isInstanceOf(Vs.NotFoundException.class);
        }
        Path image = directory.resolve("runs/42/sensors/camera/00000001.png");
        Files.createDirectories(image.getParent());
        Files.write(image, new byte[]{1, 2, 3});
        assertThat(runs.carlaFile(1, 42, "00000001.png")).isEqualTo(image);
        when(db.first(anyString(), any(Object[].class))).thenReturn(null);
        assertThatThrownBy(() -> runs.carlaFile(2, 42, "00000001.png")).isInstanceOf(Vs.NotFoundException.class);
    }
}
