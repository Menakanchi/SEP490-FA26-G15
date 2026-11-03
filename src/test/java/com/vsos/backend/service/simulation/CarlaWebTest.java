package com.vsos.backend.service.simulation;

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
import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.scenario.FamilyService;

class CarlaWebTest {
    private Db db;
    private VehicSimProperties props;
    private RunService runs;
    private TransactionTemplate tx;
    private TaskExecutor executor;
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
        executor = mock(TaskExecutor.class);
        runs = new RunService(db, mock(Queries.class), props, executor, mock(ApplicationEventPublisher.class),
                tx, mock(FamilyService.class));
    }

    @Test
    void xoscProfileHasADifferentIdentityFromDirectCarla() {
        assertThat(runs.configuredSimulator()).isEqualTo("carla-0.9.16-xosc4");
        when(props.simulator()).thenReturn("carla");
        assertThat(runs.configuredSimulator()).isEqualTo("carla-0.9.16");
    }

    @Test
    void carlaReplayKeepsOriginalVariantVehicleAebAndSeedWithoutCrossSimulatorBaselineLink() {
        assertThat(runs.runOnCarla(1, 42, 7)).isEqualTo(70);
        var call = mockingDetails(db).getInvocations().stream().filter(i -> i.getMethod().getName().equals("insert")).findFirst().orElseThrow();
        assertThat(java.util.Arrays.asList(call.getArguments()).subList(1, 8)).containsExactly(1L, 3L, 4L, 5L, 6L, "CARLA", "carla-0.9.16-xosc4");
        assertThat(call.getArguments()[8]).isEqualTo(0.01); // xosc4 chạy ở 100 Hz, ghi đúng vào fixed_delta_seconds
        assertThat(call.getArguments()[11]).isNull(); // baseline_run_id chỉ dành cho cặp cùng simulator
        assertThat(call.getArguments()[12]).isNull(); // optimization_trial_id: replay không thuộc trial tối ưu nào
        assertThat(call.getArguments()[14]).isEqualTo(123456L);
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
    void stepFollowsTheSimulatorIdentity() {
        assertThat(RunService.stepFor("carla-0.9.16-xosc4")).isEqualTo(0.01);
        assertThat(RunService.stepFor("carla-0.9.16-xosc3")).as("run xosc3 cũ giữ bước của nó").isEqualTo(0.01);
        assertThat(RunService.stepFor("carla-0.9.16-xosc2")).isEqualTo(0.05);
        assertThat(RunService.stepFor("carla-0.9.16")).isEqualTo(0.05);
        assertThat(RunService.stepFor(RunService.KINEMATIC_SIMULATOR)).isEqualTo(0.05);
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
        for (String old : List.of("xosc1", "xosc2", "xosc3")) {
            reset(db);
            queuedRunWithProfileFailsBeforeLaunchingWorker("carla-0.9.16-" + old, old);
        }
    }

    /** ADR-042 gỡ runner JSON trực tiếp (run_variant.py): run cũ của profile đó báo rõ thay vì đưa bundle JSON cho run_xosc.py. */
    @Test
    void queuedDirectRunnerRunFailsBeforeLaunchingWorker() {
        queuedRunWithProfileFailsBeforeLaunchingWorker("carla-0.9.16", "runner JSON trực tiếp");
    }

    @Test
    void removedDirectRunnerModeCannotCreateNewRuns() {
        when(props.simulator()).thenReturn("carla");
        assertThatThrownBy(runs::simulatorForNewRuns).isInstanceOf(Vs.InvalidRequestException.class).hasMessageContaining("carla-xosc");
        when(props.simulator()).thenReturn("carla-xosc");
        assertThat(runs.simulatorForNewRuns()).isEqualTo("carla-0.9.16-xosc4");
    }

    private void queuedRunWithProfileFailsBeforeLaunchingWorker(String profile, String expectedReason) {
        when(tx.execute(any())).thenReturn(true);
        doAnswer(call -> {
            java.util.function.Consumer<org.springframework.transaction.TransactionStatus> callback = call.getArgument(0);
            callback.accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        when(db.first("SELECT * FROM simulation_runs WHERE id = ?", 42L))
                .thenReturn(new Row(Json.obj("id", 42L, "simulator_version", profile)));

        runs.executeRun(42L);

        verify(db).update(eq("UPDATE simulation_runs SET status = 'FAILED', error_message = ?, ended_at = ? WHERE id = ?"),
                contains(expectedReason), any(), eq(42L));
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

    private void stubCancelLookup(String status, Object regressionTestId) {
        var row = new java.util.HashMap<String, Object>(Json.obj("id", 42L, "status", status));
        row.put("regression_test_id", regressionTestId);
        row.put("optimization_trial_id", null);
        when(db.first(eq("SELECT id, status, regression_test_id, optimization_trial_id FROM simulation_runs WHERE id = ? AND project_id = ?"),
                any(Object[].class))).thenReturn(new Row(row));
        doAnswer(call -> ((org.springframework.transaction.support.TransactionCallback<?>) call.getArgument(0)).doInTransaction(null))
                .when(tx).execute(any());
        doAnswer(call -> {
            java.util.function.Consumer<org.springframework.transaction.TransactionStatus> callback = call.getArgument(0);
            callback.accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
    }

    @Test
    void pendingRunIsStoppedImmediatelyAndNeverClaimedByTheWorker() {
        stubCancelLookup("PENDING", null);
        when(db.update(anyString(), any(Object[].class))).thenReturn(1);

        assertThat(runs.cancelRun(1, 42, 7)).isEqualTo("STOPPED");

        verify(db).update(eq("UPDATE simulation_runs SET status = 'STOPPED', error_message = ?, ended_at = ? WHERE id = ? AND status = 'PENDING'"),
                any(), any(), eq(42L));
    }

    /** Tiến trình giả làm worker mồ côi: sống lâu, không đọc file cờ nên chỉ chết khi bị giết. */
    public static final class Sleeper {
        public static void main(String[] args) throws Exception {
            Thread.sleep(120_000);
        }
    }

    private Process startOrphanWorker(long runId) throws Exception {
        Process process = new ProcessBuilder(System.getProperty("java.home") + "/bin/java", "-cp", System.getProperty("java.class.path"),
                Sleeper.class.getName()).start();
        Path folder = directory.resolve("runs/" + runId);
        Files.createDirectories(folder);
        long started = process.toHandle().info().startInstant().map(java.time.Instant::toEpochMilli).orElseThrow();
        Files.writeString(folder.resolve(RunService.PID_FILE), Json.write(Json.obj("pid", process.pid(), "start_epoch_ms", started)));
        return process;
    }

    @Test
    void orphanRunningRunWithoutALiveWorkerIsClosedAsStopped() {
        stubCancelLookup("RUNNING", null);
        assertThat(runs.cancelRun(1, 42, 7)).isEqualTo("STOPPING");
        verify(db, timeout(5000)).update(eq("UPDATE simulation_runs SET status = 'STOPPED', error_message = ?, ended_at = ? WHERE id = ? AND status = 'RUNNING'"),
                eq("Cancelled by user"), any(), eq(42L));
    }

    @Test
    void cancellingAnOrphanKillsItsStillLiveWorkerBeforeClosingTheRun() throws Exception {
        runs.orphanGraceS = 1;
        Process worker = startOrphanWorker(42);
        try {
            stubCancelLookup("RUNNING", null);
            assertThat(runs.cancelRun(1, 42, 7)).isEqualTo("STOPPING");
            verify(db, timeout(15000)).update(eq("UPDATE simulation_runs SET status = 'STOPPED', error_message = ?, ended_at = ? WHERE id = ? AND status = 'RUNNING'"),
                    any(), any(), eq(42L));
            assertThat(worker.isAlive()).isFalse(); // run chỉ bị đóng sau khi worker đã chết
            assertThat(directory.resolve("runs/42/" + RunService.STOP_FLAG)).exists(); // đã xin dừng mềm trước khi giết
        } finally {
            worker.destroyForcibly();
        }
    }

    /** Giả worker CARLA: canh file cờ dừng như run_xosc.py, thấy cờ thì "dọn" rồi tự thoát mã 0. */
    public static final class FlagWatcher {
        public static void main(String[] args) throws Exception {
            Path flag = Path.of(args[0]).resolve(RunService.STOP_FLAG);
            for (int i = 0; i < 1200 && !Files.exists(flag); i++) {
                Thread.sleep(50);
            }
            System.exit(Files.exists(flag) ? 0 : 7);
        }
    }

    @Test
    void shuttingDownMidRunAsksTheWorkerToCleanUpBeforeKillingIt() throws Exception {
        Path folder = Files.createDirectories(directory.resolve("runs/42"));
        Process worker = new ProcessBuilder(System.getProperty("java.home") + "/bin/java", "-cp", System.getProperty("java.class.path"),
                FlagWatcher.class.getName(), folder.toString()).start();
        try {
            Thread.currentThread().interrupt(); // như luồng chạy bị interrupt khi Spring tắt
            RunService.stopOnShutdown(worker, folder);

            assertThat(folder.resolve(RunService.STOP_FLAG)).exists();
            assertThat(worker.isAlive()).isFalse();
            assertThat(worker.exitValue()).as("worker tự thoát sau khi thấy cờ, không bị giết cứng").isZero();
            assertThat(Thread.interrupted()).as("giữ trạng thái interrupt cho Spring").isTrue();
        } finally {
            Thread.interrupted();
            worker.destroyForcibly();
        }
    }

    @Test
    void aPidThatNoLongerMatchesTheRecordedStartTimeIsNotTreatedAsOurWorker() throws Exception {
        Process other = new ProcessBuilder(System.getProperty("java.home") + "/bin/java", "-cp", System.getProperty("java.class.path"),
                Sleeper.class.getName()).start();
        try {
            Path folder = directory.resolve("runs/42");
            Files.createDirectories(folder);
            // PID đang sống nhưng thời điểm khởi động ghi nhận khác: PID đã bị tiến trình khác dùng lại.
            Files.writeString(folder.resolve(RunService.PID_FILE), Json.write(Json.obj("pid", other.pid(), "start_epoch_ms", 1L)));
            assertThat(runs.stopOrphanWorker(42)).isFalse();
            assertThat(other.isAlive()).isTrue(); // không giết nhầm tiến trình lạ
        } finally {
            other.destroyForcibly();
        }
    }

    @Test
    void startupRecoveryRequeuesOrphansAndStopsTheirLiveWorkersFirst() throws Exception {
        runs.orphanGraceS = 1;
        Process worker = startOrphanWorker(42);
        try {
            doReturn(List.of(new Row(Json.obj("id", 42L)))).when(db).list(startsWith("SELECT id FROM simulation_runs WHERE status = 'RUNNING'"));
            doReturn(List.of(new Row(Json.obj("id", 42L)))).when(db).list(startsWith("SELECT id FROM simulation_runs WHERE status = 'PENDING'"));
            when(db.update(anyString(), any(Object[].class))).thenReturn(1);

            assertThat(runs.recoverUnfinished()).isEqualTo(1);

            assertThat(worker.isAlive()).isFalse();
            var order = inOrder(db, executor);
            order.verify(db).update(eq("UPDATE simulation_runs SET status = 'PENDING', started_at = NULL WHERE id = ? AND status = 'RUNNING'"), eq(42L));
            order.verify(executor).execute(any());
        } finally {
            worker.destroyForcibly();
        }
    }

    @Test
    void startupRecoveryNoLongerWaitsForTheTimeoutAgeOfAnOrphan() {
        doReturn(List.of(new Row(Json.obj("id", 7L)))).when(db).list(startsWith("SELECT id FROM simulation_runs WHERE status = 'RUNNING'"));
        doReturn(List.of()).when(db).list(startsWith("SELECT id FROM simulation_runs WHERE status = 'PENDING'"));
        runs.recoverUnfinished();
        verify(db).update(eq("UPDATE simulation_runs SET status = 'PENDING', started_at = NULL WHERE id = ? AND status = 'RUNNING'"), eq(7L));
    }

    @Test
    void finishedRunHasNothingToCancel() {
        for (String status : List.of("COMPLETED", "FAILED", "STOPPED")) {
            stubCancelLookup(status, null);
            assertThatThrownBy(() -> runs.cancelRun(1, 42, 7)).isInstanceOf(Vs.InvalidRequestException.class)
                    .hasMessageContaining(status);
        }
    }

    @Test
    void regressionRunsCannotBeCancelledOneByOne() {
        stubCancelLookup("PENDING", 9L);
        assertThatThrownBy(() -> runs.cancelRun(1, 42, 7)).isInstanceOf(Vs.InvalidRequestException.class)
                .hasMessageContaining("regression test");
        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void cancellingAFamilyStopsEachActiveBaselineRunThroughTheSingleRunRules() {
        stubCancelLookup("PENDING", null);
        when(db.update(anyString(), any(Object[].class))).thenReturn(1);
        when(db.list(anyString(), any(Object[].class))).thenReturn(List.of(new Row(Json.obj("id", 41L)), new Row(Json.obj("id", 42L))));

        Map<String, Object> reply = runs.cancelFamilyRuns(1, 3, 7);

        assertThat(reply).containsEntry("stopped", 2).containsEntry("stopping", 0).containsEntry("scenario_id", 3L);
        // Chỉ run của chính họ, đang chờ/chạy, không thuộc regression/tối ưu; run chờ được hủy trước run đang chạy.
        verify(db).list(argThat((String sql) -> sql.contains("scenario_id = ?") && sql.contains("status IN ('PENDING','RUNNING')")
                && sql.contains("regression_test_id IS NULL") && sql.contains("optimization_trial_id IS NULL")
                && sql.contains("ORDER BY (status = 'RUNNING')")), eq(1L), eq(3L));
        verify(db, times(2)).update(startsWith("UPDATE simulation_runs SET status = 'STOPPED'"), any(Object[].class));
    }

    @Test
    void cancellingAFamilyOfAnotherProjectIsNotFoundAndTouchesNothing() {
        when(db.first(startsWith("SELECT id FROM scenarios"), any(Object[].class))).thenReturn(null);
        assertThatThrownBy(() -> runs.cancelFamilyRuns(2, 3, 7)).isInstanceOf(Vs.NotFoundException.class);
        verify(db, never()).list(anyString(), any(Object[].class));
        verify(db, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void cancelOnlyFindsRunsOfTheCallersProject() {
        when(db.first(anyString(), any(Object[].class))).thenReturn(null);
        assertThatThrownBy(() -> runs.cancelRun(2, 42, 7)).isInstanceOf(Vs.NotFoundException.class);
    }

    @Test
    void duplicateDispatchDoesNotEraseTheLiveThreadsOwnership() throws Exception {
        // Luồng A giữ run 42 (đang chạy); luồng B dispatch trùng cùng id rồi trả về ngay mà không động tới dấu của A.
        var started = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        doAnswer(call -> {
            started.countDown();
            release.await(5, java.util.concurrent.TimeUnit.SECONDS);
            return false; // không nhận được run: luồng A kết thúc sau khi được thả
        }).when(tx).execute(any());
        var holder = new Thread(() -> runs.executeRun(42L));
        holder.start();
        assertThat(started.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();

        runs.executeRun(42L); // luồng trùng: phải thoát sớm
        verify(tx, times(1)).execute(any());

        stubRunning42();
        assertThat(runs.cancelRun(1, 42, 7)).isEqualTo("STOPPING"); // A vẫn là chủ run => hủy được
        release.countDown();
        holder.join(5000);
    }

    private void stubRunning42() {
        var row = new java.util.HashMap<String, Object>(Json.obj("id", 42L, "status", "RUNNING"));
        row.put("regression_test_id", null);
        row.put("optimization_trial_id", null);
        when(db.first(eq("SELECT id, status, regression_test_id, optimization_trial_id FROM simulation_runs WHERE id = ? AND project_id = ?"),
                any(Object[].class))).thenReturn(new Row(row));
    }
}
