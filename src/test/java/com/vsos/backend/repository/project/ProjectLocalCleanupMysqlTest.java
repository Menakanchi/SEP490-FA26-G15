package com.vsos.backend.repository.project;

import com.vsos.backend.repository.common.Db;
import com.vsos.backend.service.project.ProjectLocalCleanup;
import com.vsos.backend.service.simulation.RunService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.util.FileSystemUtils;

import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** MySQL loopback fixture and a private temporary data root; never uses the application's existing data. */
@EnabledIfEnvironmentVariable(named = "VSOS_DELETE_TEST_URL", matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/vsos_delete_test[?].*")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "vehicsim.recover-on-startup=false", "vehicsim.video-storage.bucket=", "spring.jpa.hibernate.ddl-auto=none"
})
@Import(ProjectTransactionContextMysqlTest.FaultConfig.class)
class ProjectLocalCleanupMysqlTest {
    static final Path ROOT;
    static {
        try { ROOT = Files.createTempDirectory("vsos-project-cleanup-"); }
        catch (Exception e) { throw new ExceptionInInitializerError(e); }
    }
    static final List<String> TABLES = List.of("fa_json_handoffs", "fa_json_reports", "fa_json_executions", "fa_json_sources",
            "engineering_recommendations", "regression_test_items", "simulation_runs", "analysis_results", "regression_tests",
            "optimization_runs", "scenario_versions", "scenarios", "aeb_versions", "projects");

    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("VSOS_DELETE_TEST_URL"));
        registry.add("spring.datasource.username", () -> "root");
        registry.add("spring.datasource.password", () -> "vsos-demo-only");
        registry.add("vehicsim.data-root", ROOT::toString);
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired ProjectRepository projects;
    @Autowired Db db;
    @Autowired RunService runs;
    @Autowired PlatformTransactionManager transactions;
    @MockBean ProjectLocalCleanup scheduledCleanup;
    ProjectLocalCleanup cleanup;

    @BeforeEach void setup() throws Exception {
        for (String table : TABLES) {
            jdbc.execute("CREATE TABLE " + table + " (id BIGINT PRIMARY KEY, project_id BIGINT, regression_test_id BIGINT, scenario_id BIGINT, name VARCHAR(50), workspace_id BIGINT, created_by_user_id BIGINT, status VARCHAR(20), execution_status VARCHAR(20)) ENGINE=InnoDB");
            jdbc.update("INSERT INTO " + table + " VALUES (1,1,1,1,'Demo',NULL,7,'COMPLETED','COMPLETED'),(2,2,2,2,'Other',NULL,8,'COMPLETED','COMPLETED')");
        }
        jdbc.execute("CREATE TABLE project_local_cleanup (run_id BIGINT PRIMARY KEY, storage_id CHAR(36) NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
        jdbc.execute("CREATE TABLE project_local_storage (id TINYINT PRIMARY KEY, storage_id CHAR(36) NOT NULL) ENGINE=InnoDB");
        jdbc.update("INSERT INTO project_local_storage VALUES (1, ?)", "ae06c7f6-45f1-4835-a56e-cb0fb44a727a");
        Files.writeString(ROOT.resolve(".vsos-storage-id"), "ae06c7f6-45f1-4835-a56e-cb0fb44a727a");
        Files.createDirectories(ROOT.resolve("runs/1"));
        Files.createDirectories(ROOT.resolve("runs/2"));
        Files.writeString(ROOT.resolve("runs/.vsos-storage-id"), "ae06c7f6-45f1-4835-a56e-cb0fb44a727a");
        Files.writeString(ROOT.resolve("runs/1/demo.txt"), "project one");
        Files.writeString(ROOT.resolve("runs/2/demo.txt"), "project two");
        cleanup = new ProjectLocalCleanup(db, runs, transactions);
    }

    @AfterEach void teardown() {
        ProjectTransactionContextMysqlTest.fault.set(0);
        cleanup.stop();
        jdbc.execute("DROP TABLE project_local_cleanup");
        jdbc.execute("DROP TABLE project_local_storage");
        for (String table : TABLES) jdbc.execute("DROP TABLE " + table);
    }

    @AfterAll static void deleteDemoRoot() throws Exception { FileSystemUtils.deleteRecursively(ROOT); }

    @Test void rollbackKeepsJobsAbsentAndLostCommitResponseStillGetsRetriedAfterRestart() throws Exception {
        String storage = cleanup.storageIdForWrite();
        ProjectTransactionContextMysqlTest.fault.set(1);
        assertThatThrownBy(() -> projects.delete(1, 7, "Demo", storage)).isInstanceOf(RuntimeException.class);
        ProjectTransactionContextMysqlTest.fault.set(0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isZero();
        assertThat(ROOT.resolve("runs/1/demo.txt")).hasContent("project one");
        ProjectTransactionContextMysqlTest.fault.set(3);
        assertThatThrownBy(() -> projects.delete(1, 7, "Demo", storage)).isInstanceOf(RuntimeException.class);
        ProjectTransactionContextMysqlTest.fault.set(0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup WHERE run_id = 1", Integer.class)).isEqualTo(1);
        assertThat(ROOT.resolve("runs/1/demo.txt")).hasContent("project one");
        var restarted = new ProjectLocalCleanup(db, runs, transactions);
        try {
            restarted.start();
            for (int i = 0; i < 100 && jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class) != 0; i++) {
                Thread.sleep(50);
            }
        } finally { restarted.stop(); }
        assertThat(ROOT.resolve("runs/1")).doesNotExist();
        assertThat(ROOT.resolve("runs/2/demo.txt")).hasContent("project two");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isZero();
        for (String table : TABLES) assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE id = 2", Integer.class)).as(table).isEqualTo(1);
    }

    @Test @EnabledOnOs(OS.WINDOWS)
    void lockedFileIsRetriedAndMissingFileIsIdempotent() throws Exception {
        String storage = cleanup.storageIdForWrite();
        projects.delete(1, 7, "Demo", storage);
        Path file = ROOT.resolve("runs/1/demo.txt");
        try (var handle = FileChannel.open(file, StandardOpenOption.WRITE, com.sun.nio.file.ExtendedOpenOption.NOSHARE_DELETE)) {
            cleanup.retryPending();
            assertThat(file).exists();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isEqualTo(1);
        }
        cleanup.retryPending();
        assertThat(file).doesNotExist();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isZero();
        jdbc.update("INSERT INTO project_local_cleanup (run_id, storage_id) VALUES (1, ?)", storage);
        cleanup.retryPending();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isZero();
        assertThat(ROOT.resolve("runs/2/demo.txt")).hasContent("project two");
    }

    @Test void missingOrWrongMarkerCannotDeleteProjectOrAcknowledgeWork() throws Exception {
        String storage = cleanup.storageIdForWrite();
        Files.delete(ROOT.resolve(".vsos-storage-id"));
        assertThat(cleanup.storageIdForWrite()).isNull();
        assertThatThrownBy(() -> projects.delete(1, 7, "Demo", null)).isInstanceOf(com.vsos.backend.exception.project.ProjectException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM projects WHERE id = 1", Integer.class)).isEqualTo(1);
        Files.writeString(ROOT.resolve(".vsos-storage-id"), "09570bc3-47e1-4b78-a718-166d1dc74867");
        assertThatThrownBy(() -> projects.delete(1, 7, "Demo", cleanup.storageIdForWrite())).isInstanceOf(com.vsos.backend.exception.project.ProjectException.class);
        Files.writeString(ROOT.resolve(".vsos-storage-id"), storage);
        projects.delete(1, 7, "Demo", storage);
        Files.delete(ROOT.resolve(".vsos-storage-id"));
        cleanup.retryPending();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isEqualTo(1);
        assertThat(ROOT.resolve("runs/1/demo.txt")).hasContent("project one");
        Files.writeString(ROOT.resolve(".vsos-storage-id"), storage);
        cleanup.retryPending();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isZero();
        assertThat(ROOT.resolve("runs/2/demo.txt")).hasContent("project two");
    }

    @Test void markerLostDuringDeletionLeavesJobForRetry() throws Exception {
        String storage = cleanup.storageIdForWrite();
        projects.delete(1, 7, "Demo", storage);
        Path own = ROOT.resolve("runs/1");
        try (var files = org.mockito.Mockito.mockStatic(FileSystemUtils.class, org.mockito.Mockito.CALLS_REAL_METHODS)) {
            files.when(() -> FileSystemUtils.deleteRecursively(own)).thenAnswer(call -> {
                Object result = call.callRealMethod();
                Files.delete(ROOT.resolve(".vsos-storage-id"));
                return result;
            });
            assertThat(cleanup.clean(1, storage)).isFalse();
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isEqualTo(1);
        Files.writeString(ROOT.resolve(".vsos-storage-id"), storage);
        cleanup.retryPending();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isZero();
        assertThat(ROOT.resolve("runs/2/demo.txt")).hasContent("project two");
    }

    @Test void missingOrWrongRunsMarkerKeepsProjectAndPendingJobUntilRestored() throws Exception {
        String storage = cleanup.storageIdForWrite();
        Path marker = ROOT.resolve("runs/.vsos-storage-id");
        Files.delete(marker);
        assertThat(cleanup.storageIdForWrite()).isNull();
        assertThatThrownBy(() -> projects.delete(1, 7, "Demo", null))
                .isInstanceOf(com.vsos.backend.exception.project.ProjectException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM projects WHERE id = 1", Integer.class)).isEqualTo(1);
        Files.writeString(marker, storage);
        projects.delete(1, 7, "Demo", storage);
        Files.writeString(marker, "09570bc3-47e1-4b78-a718-166d1dc74867");
        cleanup.retryPending();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isEqualTo(1);
        assertThat(ROOT.resolve("runs/1/demo.txt")).hasContent("project one");
        Files.writeString(marker, storage);
        cleanup.retryPending();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isZero();
        assertThat(ROOT.resolve("runs/2/demo.txt")).hasContent("project two");
    }

    @Test void reintroducedRunIsNeverCleaned() {
        String storage = cleanup.storageIdForWrite();
        projects.delete(1, 7, "Demo", storage);
        jdbc.update("INSERT INTO simulation_runs (id, project_id, status) VALUES (1, 2, 'COMPLETED')");
        cleanup.retryPending();
        assertThat(ROOT.resolve("runs/1/demo.txt")).hasContent("project one");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isEqualTo(1);
    }

    @Test void workerCommitFailureAfterDeletingFileLeavesJobForIdempotentRetry() {
        String storage = cleanup.storageIdForWrite();
        projects.delete(1, 7, "Demo", storage);
        ProjectTransactionContextMysqlTest.fault.set(1);
        assertThat(cleanup.clean(1, storage)).isFalse();
        ProjectTransactionContextMysqlTest.fault.set(0);
        assertThat(ROOT.resolve("runs/1")).doesNotExist();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isEqualTo(1);
        cleanup.retryPending();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isZero();
        assertThat(ROOT.resolve("runs/2/demo.txt")).hasContent("project two");
    }

    @Test void twoWorkersCanRetryTheSameJobWithoutTouchingOtherFiles() throws Exception {
        String storage = cleanup.storageIdForWrite();
        projects.delete(1, 7, "Demo", storage);
        var workers = java.util.concurrent.Executors.newFixedThreadPool(2);
        var start = new java.util.concurrent.CountDownLatch(1);
        try {
            var first = workers.submit(() -> { start.await(); return cleanup.clean(1, storage); });
            var second = workers.submit(() -> { start.await(); return cleanup.clean(1, storage); });
            start.countDown();
            assertThat(first.get(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            assertThat(second.get(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        } finally { workers.shutdownNow(); }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isZero();
        assertThat(ROOT.resolve("runs/2/demo.txt")).hasContent("project two");
    }
}
