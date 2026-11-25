package com.vsos.backend.service.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.vsos.backend.common.Json;
import com.vsos.backend.common.Vs;
import com.vsos.backend.config.VehicSimProperties;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Queries;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.service.scenario.FamilyService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.TaskExecutor;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Xoá kết quả baseline: chỉ run baseline đã kết thúc và không còn là mốc của regression; xoá cả dòng DB lẫn thư mục file. */
class RunResultDeleteTest {
    private Db db;
    private RunService runs;
    @TempDir Path directory;

    @BeforeEach
    void setUp() {
        db = mock(Db.class);
        VehicSimProperties props = mock(VehicSimProperties.class);
        when(props.dataRoot()).thenReturn(directory.toString());
        TransactionTemplate tx = mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(call -> ((TransactionCallback<?>) call.getArgument(0)).doInTransaction(null));
        when(db.scalar(anyString(), any(Object[].class))).thenReturn(0L); // chưa regression nào tham chiếu
        when(db.update(startsWith("DELETE FROM simulation_runs"), any(Object[].class))).thenReturn(1);
        when(db.first(startsWith("SELECT id FROM scenarios"), any(Object[].class))).thenReturn(new Row(Json.obj("id", 3L)));
        when(db.first(startsWith("SELECT p.status"), any(Object[].class))).thenReturn(
                new Row(Json.obj("status", "ACTIVE", "workspace_id", 3L, "workspace_status", "ACTIVE", "user_role", "ENGINEER", "member_id", 7L)));
        runs = new RunService(db, mock(Queries.class), props, mock(TaskExecutor.class), mock(ApplicationEventPublisher.class), tx, mock(FamilyService.class));
    }

    private Row run(long id, String status, String purpose, Object regressionTestId) {
        Map<String, Object> m = new HashMap<>(Json.obj("id", id, "status", status, "purpose", purpose));
        m.put("regression_test_id", regressionTestId);
        m.put("optimization_trial_id", null);
        return new Row(m);
    }

    private Path runFolder(long id) throws Exception {
        Path folder = directory.resolve("runs/" + id);
        Files.createDirectories(folder.resolve("sensors"));
        Files.writeString(folder.resolve("video.mp4"), "x");
        return folder;
    }

    private void stubRun(Row row) {
        when(db.first(startsWith("SELECT id, status, purpose"), any(Object[].class))).thenReturn(row);
    }

    @Test
    void aFinishedBaselineRunIsDeletedFromTheDatabaseAndFromDisk() throws Exception {
        Path folder = runFolder(42);
        stubRun(run(42, "COMPLETED", "BASELINE", null));

        assertThat(runs.deleteBaselineRun(1, 42, 7)).containsEntry("deleted", true);

        verify(db).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).doesNotExist();
    }

    @Test
    void archivedProjectOrWorkspacePreservesResultAndFiles() throws Exception {
        Path folder = runFolder(42);
        stubRun(run(42, "COMPLETED", "BASELINE", null));
        for (String[] states : List.of(new String[]{"ARCHIVED", "ACTIVE"}, new String[]{"ACTIVE", "ARCHIVED"})) {
            when(db.first(startsWith("SELECT p.status"), any(Object[].class))).thenReturn(
                    new Row(Json.obj("status", states[0], "workspace_id", 3L, "workspace_status", states[1],
                            "user_role", "ENGINEER", "member_id", 7L)));
            assertThatThrownBy(() -> runs.deleteBaselineRun(1, 42, 7)).isInstanceOf(ResponseStatusException.class);
        }
        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).exists();
    }

    @Test
    void filesAreDeletedOnlyAfterOuterTransactionCommits() throws Exception {
        Path folder = runFolder(42);
        stubRun(run(42, "COMPLETED", "BASELINE", null));
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            runs.deleteBaselineRun(1, 42, 7);
            assertThat(folder).exists();
            org.springframework.transaction.support.TransactionSynchronizationManager.getSynchronizations().forEach(
                    org.springframework.transaction.support.TransactionSynchronization::afterCommit);
            assertThat(folder).doesNotExist();
        } finally {
            org.springframework.transaction.support.TransactionSynchronizationManager.clear();
        }
    }

    @Test
    void personalOwnerMayDeleteButNonMemberEngineerMayNot() {
        stubRun(run(42, "COMPLETED", "BASELINE", null));
        when(db.first(startsWith("SELECT p.status"), any(Object[].class))).thenReturn(
                new Row(Json.obj("status", "ACTIVE", "workspace_id", null, "created_by_user_id", 7L, "user_role", "EXPERIENCER")));
        assertThat(runs.deleteBaselineRun(1, 42, 7)).containsEntry("deleted", true);
        when(db.first(startsWith("SELECT p.status"), any(Object[].class))).thenReturn(
                new Row(Json.obj("status", "ACTIVE", "workspace_id", 3L, "workspace_status", "ACTIVE", "user_role", "ENGINEER")));
        assertThatThrownBy(() -> runs.deleteBaselineRun(1, 42, 7)).isInstanceOf(Vs.NotFoundException.class);
    }

    @Test
    void adminCannotWriteInAnArchivedWorkspace() throws Exception {
        Path folder = runFolder(42);
        stubRun(run(42, "COMPLETED", "BASELINE", null));
        when(db.first(startsWith("SELECT p.status"), any(Object[].class))).thenReturn(
                new Row(Json.obj("status", "ACTIVE", "workspace_id", 3L, "workspace_status", "ARCHIVED", "user_role", "ADMIN")));
        assertThatThrownBy(() -> runs.deleteBaselineRun(1, 42, 7)).isInstanceOf(ResponseStatusException.class);
        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).exists();
    }

    @Test
    void archivedProjectCannotQueueBaselineOrCarlaRuns() {
        when(db.first(startsWith("SELECT p.status"), any(Object[].class))).thenReturn(
                new Row(Json.obj("status", "ARCHIVED", "workspace_id", 3L, "workspace_status", "ACTIVE", "user_role", "ENGINEER", "member_id", 7L)));
        assertThatThrownBy(() -> runs.runFamilyFromUi(1, 3, 7, null, false)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> runs.runOnCarlaFromUi(1, 42, 7)).isInstanceOf(ResponseStatusException.class);
        verify(db, never()).insert(anyString(), any(Object[].class));
    }

    @Test
    void failedAndStoppedBaselineRunsCanBeDeletedToo() throws Exception {
        for (String status : List.of("FAILED", "STOPPED")) {
            stubRun(run(43, status, "BASELINE", null));
            assertThat(runs.deleteBaselineRun(1, 43, 7)).containsEntry("deleted", true);
        }
    }

    @Test
    void runsThatAreNotPlainBaselineResultsAreRefused() throws Exception {
        Path folder = runFolder(44);
        stubRun(run(44, "COMPLETED", "REGRESSION", 9L));
        assertThatThrownBy(() -> runs.deleteBaselineRun(1, 44, 7)).isInstanceOf(Vs.InvalidRequestException.class);
        stubRun(run(44, "COMPLETED", "BASELINE", 9L)); // chạy trong một regression test
        assertThatThrownBy(() -> runs.deleteBaselineRun(1, 44, 7)).isInstanceOf(Vs.InvalidRequestException.class);

        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).exists();
    }

    @Test
    void aWaitingOrRunningRunMustBeCancelledFirst() throws Exception {
        Path folder = runFolder(45);
        for (String status : List.of("PENDING", "RUNNING", "PAUSED")) {
            stubRun(run(45, status, "BASELINE", null));
            assertThatThrownBy(() -> runs.deleteBaselineRun(1, 45, 7)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("cancel it before");
        }
        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).exists();
    }

    @Test
    void aRunThatARegressionTestReplaysIsKeptAsItsReference() throws Exception {
        Path folder = runFolder(46);
        stubRun(run(46, "COMPLETED", "BASELINE", null));
        when(db.scalar(startsWith("SELECT (SELECT COUNT(*)"), any(Object[].class))).thenReturn(2L);

        assertThatThrownBy(() -> runs.deleteBaselineRun(1, 46, 7)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("reference of a regression");

        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).exists(); // thư mục chỉ bị xoá khi dòng DB đã xoá
    }

    @Test
    void aRunOfAnotherProjectIsNotFound() {
        stubRun(null);
        assertThatThrownBy(() -> runs.deleteBaselineRun(2, 42, 7)).isInstanceOf(Vs.NotFoundException.class);
    }

    @Test
    void deletingAFamilyKeepsActiveAndReferencedRunsAndCountsThem() throws Exception {
        Path gone = runFolder(1);
        Path active = runFolder(2);
        Path referenced = runFolder(3);
        when(db.list(startsWith("SELECT id, status FROM simulation_runs"), any(Object[].class))).thenReturn(List.of(
                new Row(Json.obj("id", 1L, "status", "COMPLETED")), new Row(Json.obj("id", 2L, "status", "RUNNING")),
                new Row(Json.obj("id", 3L, "status", "COMPLETED"))));
        when(db.scalar(startsWith("SELECT (SELECT COUNT(*)"), any(Object[].class))).thenAnswer(call -> (long) (Long) call.getArgument(1) == 3L ? 1L : 0L);

        Map<String, Object> result = runs.deleteFamilyBaselineRuns(1, 3, 7);

        assertThat(result).containsEntry("deleted", 1).containsEntry("skipped_active", 1).containsEntry("skipped_in_use", 1);
        assertThat(gone).doesNotExist();
        assertThat(active).exists();
        assertThat(referenced).exists();
    }

    @Test
    void deletingAFamilyBySimulatorTypeFiltersOnlyThatType() throws Exception {
        Path carlaRun = runFolder(10);
        when(db.list(org.mockito.ArgumentMatchers.contains("AND simulator_type = ?"),
                org.mockito.ArgumentMatchers.eq(1L), org.mockito.ArgumentMatchers.eq(3L), org.mockito.ArgumentMatchers.eq("CARLA")))
                .thenReturn(List.of(new Row(Json.obj("id", 10L, "status", "COMPLETED"))));

        Map<String, Object> result = runs.deleteFamilyBaselineRuns(1, 3, 7, "carla");

        assertThat(result).containsEntry("deleted", 1);
        assertThat(carlaRun).doesNotExist();
        assertThatThrownBy(() -> runs.deleteFamilyBaselineRuns(1, 3, 7, "INVALID"))
                .isInstanceOf(Vs.InvalidRequestException.class);
    }
}
