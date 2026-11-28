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

/**
 * Xoá kết quả baseline: chỉ run baseline lỗi / đã hủy, do chính người xoá tạo (ADMIN xoá được của người khác), không còn là mốc của regression;
 * xoá cả dòng DB lẫn thư mục file. Run COMPLETED luôn được giữ.
 */
class RunResultDeleteTest {
    private static final long OWNER = 7L;
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
        runs = new RunService(db, mock(Queries.class), props, mock(TaskExecutor.class), mock(ApplicationEventPublisher.class), tx, mock(FamilyService.class), mock(com.vsos.backend.service.analysis.FailureAnalysisService.class));
    }

    private Row run(long id, String status, String purpose, Object regressionTestId) {
        Map<String, Object> m = new HashMap<>(Json.obj("id", id, "status", status, "purpose", purpose));
        m.put("regression_test_id", regressionTestId);
        m.put("optimization_trial_id", null);
        m.put("created_by_user_id", OWNER);
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
    void aFailedBaselineRunIsDeletedFromTheDatabaseAndFromDisk() throws Exception {
        Path folder = runFolder(42);
        stubRun(run(42, "FAILED", "BASELINE", null));

        assertThat(runs.deleteBaselineRun(1, 42, 7, false)).containsEntry("deleted", true);

        verify(db).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).doesNotExist();
    }

    @Test
    void archivedProjectOrWorkspacePreservesResultAndFiles() throws Exception {
        Path folder = runFolder(42);
        stubRun(run(42, "FAILED", "BASELINE", null));
        for (String[] states : List.of(new String[]{"ARCHIVED", "ACTIVE"}, new String[]{"ACTIVE", "ARCHIVED"})) {
            when(db.first(startsWith("SELECT p.status"), any(Object[].class))).thenReturn(
                    new Row(Json.obj("status", states[0], "workspace_id", 3L, "workspace_status", states[1],
                            "user_role", "ENGINEER", "member_id", 7L)));
            assertThatThrownBy(() -> runs.deleteBaselineRun(1, 42, 7, false)).isInstanceOf(ResponseStatusException.class);
        }
        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).exists();
    }

    @Test
    void filesAreDeletedOnlyAfterOuterTransactionCommits() throws Exception {
        Path folder = runFolder(42);
        stubRun(run(42, "FAILED", "BASELINE", null));
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        org.springframework.transaction.support.TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            runs.deleteBaselineRun(1, 42, 7, false);
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
        stubRun(run(42, "FAILED", "BASELINE", null));
        when(db.first(startsWith("SELECT p.status"), any(Object[].class))).thenReturn(
                new Row(Json.obj("status", "ACTIVE", "workspace_id", null, "created_by_user_id", 7L, "user_role", "EXPERIENCER")));
        assertThat(runs.deleteBaselineRun(1, 42, 7, false)).containsEntry("deleted", true);
        when(db.first(startsWith("SELECT p.status"), any(Object[].class))).thenReturn(
                new Row(Json.obj("status", "ACTIVE", "workspace_id", 3L, "workspace_status", "ACTIVE", "user_role", "ENGINEER")));
        assertThatThrownBy(() -> runs.deleteBaselineRun(1, 42, 7, false)).isInstanceOf(Vs.NotFoundException.class);
    }

    @Test
    void adminCannotWriteInAnArchivedWorkspace() throws Exception {
        Path folder = runFolder(42);
        stubRun(run(42, "FAILED", "BASELINE", null));
        when(db.first(startsWith("SELECT p.status"), any(Object[].class))).thenReturn(
                new Row(Json.obj("status", "ACTIVE", "workspace_id", 3L, "workspace_status", "ARCHIVED", "user_role", "ADMIN")));
        assertThatThrownBy(() -> runs.deleteBaselineRun(1, 42, 7, false)).isInstanceOf(ResponseStatusException.class);
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
            assertThat(runs.deleteBaselineRun(1, 43, 7, false)).containsEntry("deleted", true);
        }
    }

    @Test
    void runsThatAreNotPlainBaselineResultsAreRefused() throws Exception {
        Path folder = runFolder(44);
        stubRun(run(44, "COMPLETED", "REGRESSION", 9L));
        assertThatThrownBy(() -> runs.deleteBaselineRun(1, 44, 7, false)).isInstanceOf(Vs.InvalidRequestException.class);
        stubRun(run(44, "COMPLETED", "BASELINE", 9L)); // chạy trong một regression test
        assertThatThrownBy(() -> runs.deleteBaselineRun(1, 44, 7, false)).isInstanceOf(Vs.InvalidRequestException.class);

        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).exists();
    }

    @Test
    void aWaitingOrRunningRunMustBeCancelledFirst() throws Exception {
        Path folder = runFolder(45);
        for (String status : List.of("PENDING", "RUNNING", "PAUSED")) {
            stubRun(run(45, status, "BASELINE", null));
            assertThatThrownBy(() -> runs.deleteBaselineRun(1, 45, 7, false)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("cancel it before");
        }
        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).exists();
    }

    @Test
    void aRunThatARegressionTestReplaysIsKeptAsItsReference() throws Exception {
        Path folder = runFolder(46);
        stubRun(run(46, "STOPPED", "BASELINE", null));
        when(db.scalar(startsWith("SELECT (SELECT COUNT(*)"), any(Object[].class))).thenReturn(2L);

        assertThatThrownBy(() -> runs.deleteBaselineRun(1, 46, 7, false)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("referenced or no longer eligible");

        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).exists(); // thư mục chỉ bị xoá khi dòng DB đã xoá
    }

    @Test
    void aRunReferencedByAnalysisIsKeptInsteadOfClearingWorstCase() throws Exception {
        Path folder = runFolder(50);
        stubRun(run(50, "FAILED", "BASELINE", null));
        when(db.scalar(org.mockito.ArgumentMatchers.contains("analysis_results WHERE worst_case_run_id = ?"),
                org.mockito.ArgumentMatchers.eq(50L), org.mockito.ArgumentMatchers.eq(50L), org.mockito.ArgumentMatchers.eq(50L)))
                .thenReturn(1L);

        assertThatThrownBy(() -> runs.deleteBaselineRun(1, 50, 7, false))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("referenced or no longer eligible");
        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).exists();
    }

    @Test
    void aRunOfAnotherProjectIsNotFound() {
        stubRun(null);
        assertThatThrownBy(() -> runs.deleteBaselineRun(2, 42, 7, false)).isInstanceOf(Vs.NotFoundException.class);
    }

    @Test
    void aCompletedRunIsKeptBecauseItIsRealData() throws Exception {
        Path folder = runFolder(47);
        stubRun(run(47, "COMPLETED", "BASELINE", null));
        for (boolean admin : List.of(false, true)) {
            assertThatThrownBy(() -> runs.deleteBaselineRun(1, 47, 7, admin)).isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("Completed run results are kept");
        }
        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).exists();
    }

    @Test
    void onlyTheCreatorOrAnAdminMayDeleteARun() throws Exception {
        Path folder = runFolder(48);
        stubRun(run(48, "FAILED", "BASELINE", null));

        assertThatThrownBy(() -> runs.deleteBaselineRun(1, 48, 8, false)).isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Only the user who started this run");
        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(folder).exists();

        assertThat(runs.deleteBaselineRun(1, 48, 8, true)).containsEntry("deleted", true);
        assertThat(folder).doesNotExist();
    }

    @Test
    void theDeleteStatementRechecksStatusAndOwner() {
        stubRun(run(49, "FAILED", "BASELINE", null));
        runs.deleteBaselineRun(1, 49, 7, false);
        verify(db).update(org.mockito.ArgumentMatchers.contains("status IN ('FAILED','STOPPED')"),
                org.mockito.ArgumentMatchers.eq(49L), org.mockito.ArgumentMatchers.eq(1L),
                org.mockito.ArgumentMatchers.eq(false), org.mockito.ArgumentMatchers.eq(7L));
        verify(db).update(org.mockito.ArgumentMatchers.contains("NOT EXISTS (SELECT 1 FROM analysis_results WHERE worst_case_run_id = simulation_runs.id)"),
                org.mockito.ArgumentMatchers.eq(49L), org.mockito.ArgumentMatchers.eq(1L),
                org.mockito.ArgumentMatchers.eq(false), org.mockito.ArgumentMatchers.eq(7L));
    }

    private static Row familyRow(long id, String status, long createdBy) {
        return new Row(Json.obj("id", id, "status", status, "created_by_user_id", createdBy, "purpose", "BASELINE"));
    }

    @Test
    void deletingAFamilyKeepsActiveCompletedForeignAndReferencedRunsAndCountsThem() throws Exception {
        Path gone = runFolder(1);
        Path active = runFolder(2);
        Path referenced = runFolder(3);
        Path completed = runFolder(4);
        Path foreign = runFolder(5);
        when(db.list(startsWith("SELECT id, status, created_by_user_id, purpose"), any(Object[].class))).thenReturn(List.of(
                familyRow(1, "FAILED", OWNER), familyRow(2, "RUNNING", OWNER), familyRow(3, "STOPPED", OWNER),
                familyRow(4, "COMPLETED", OWNER), familyRow(5, "FAILED", 8L)));
        when(db.scalar(startsWith("SELECT (SELECT COUNT(*)"), any(Object[].class))).thenAnswer(call -> (long) (Long) call.getArgument(1) == 3L ? 1L : 0L);

        Map<String, Object> result = runs.deleteFamilyBaselineRuns(1, 3, 7, false, null);

        assertThat(result).containsEntry("deleted", 1).containsEntry("skipped_active", 1).containsEntry("skipped_in_use", 1)
                .containsEntry("skipped_completed", 1).containsEntry("skipped_not_owner", 1);
        assertThat(gone).doesNotExist();
        assertThat(active).exists();
        assertThat(referenced).exists();
        assertThat(completed).exists();
        assertThat(foreign).exists();
    }

    @Test
    void anAdminDeletesFailedRunsOfEveryoneInAFamilyButKeepsCompletedOnes() throws Exception {
        Path foreign = runFolder(5);
        Path completed = runFolder(6);
        when(db.list(startsWith("SELECT id, status, created_by_user_id, purpose"), any(Object[].class))).thenReturn(List.of(
                familyRow(5, "FAILED", 8L), familyRow(6, "COMPLETED", 8L)));

        Map<String, Object> result = runs.deleteFamilyBaselineRuns(1, 3, 7, true, null);

        assertThat(result).containsEntry("deleted", 1).containsEntry("skipped_completed", 1).containsEntry("skipped_not_owner", 0);
        assertThat(foreign).doesNotExist();
        assertThat(completed).exists();
    }

    @Test
    void deletingAFamilyBySimulatorTypeFiltersOnlyThatType() throws Exception {
        Path carlaRun = runFolder(10);
        when(db.list(org.mockito.ArgumentMatchers.contains("AND simulator_type = ?"),
                org.mockito.ArgumentMatchers.eq(1L), org.mockito.ArgumentMatchers.eq(3L), org.mockito.ArgumentMatchers.eq("CARLA")))
                .thenReturn(List.of(familyRow(10, "FAILED", OWNER)));

        Map<String, Object> result = runs.deleteFamilyBaselineRuns(1, 3, 7, false, "carla");

        assertThat(result).containsEntry("deleted", 1);
        assertThat(carlaRun).doesNotExist();
        assertThatThrownBy(() -> runs.deleteFamilyBaselineRuns(1, 3, 7, false, "INVALID"))
                .isInstanceOf(Vs.InvalidRequestException.class);
    }

    @Test
    void failedCampaignAndRegressionRunsAreCountedButNeverDeleted() throws Exception {
        Path optimization = runFolder(11);
        Path regression = runFolder(12);
        when(db.list(startsWith("SELECT id, status, created_by_user_id, purpose"), any(Object[].class))).thenReturn(List.of(
                new Row(Json.obj("id", 11, "status", "STOPPED", "created_by_user_id", OWNER,
                        "purpose", "OPTIMIZATION", "optimization_trial_id", 20)),
                new Row(Json.obj("id", 12, "status", "FAILED", "created_by_user_id", OWNER,
                        "purpose", "REGRESSION", "regression_test_id", 21)),
                new Row(Json.obj("id", 13, "status", "COMPLETED", "created_by_user_id", OWNER,
                        "purpose", "OPTIMIZATION", "optimization_trial_id", 20))));

        Map<String, Object> result = runs.deleteFamilyBaselineRuns(1, 3, 7, false, "CARLA");

        assertThat(result).containsEntry("deleted", 0).containsEntry("skipped_optimization", 1)
                .containsEntry("skipped_regression", 1);
        verify(db, never()).update(startsWith("DELETE FROM simulation_runs"), any(Object[].class));
        assertThat(optimization).exists();
        assertThat(regression).exists();
    }
}
