package com.vsos.backend.repository.project;

import com.vsos.backend.exception.project.ProjectError;
import com.vsos.backend.exception.project.ProjectException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Two independent connections on a disposable loopback MySQL database. */
@EnabledIfEnvironmentVariable(named = "VSOS_DELETE_TEST_URL", matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/vsos_delete_test[?].*")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "vehicsim.recover-on-startup=false", "vehicsim.video-storage.bucket=", "spring.jpa.hibernate.ddl-auto=none"
})
class ProjectDeleteConcurrencyMysqlTest {
    private static final String STORAGE = "00000000-0000-0000-0000-000000000001";
    private static final String DATA_ROOT = Path.of(System.getProperty("java.io.tmpdir"), "vsos-delete-test-" + UUID.randomUUID()).toString();
    private static final List<String> CHILDREN = List.of("fa_json_handoffs", "fa_json_reports", "fa_json_executions",
            "fa_json_sources", "engineering_recommendations", "regression_test_items", "simulation_runs", "analysis_results",
            "regression_tests", "optimization_runs", "scenario_versions", "scenarios", "aeb_versions");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("VSOS_DELETE_TEST_URL"));
        registry.add("spring.datasource.username", () -> "root");
        registry.add("spring.datasource.password", () -> "vsos-demo-only");
        registry.add("vehicsim.data-root", () -> DATA_ROOT);
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired ProjectRepository projects;
    @Autowired PlatformTransactionManager manager;

    private void fixture() {
        jdbc.execute("CREATE TABLE projects (id BIGINT PRIMARY KEY, name VARCHAR(150), workspace_id BIGINT, created_by_user_id BIGINT)");
        for (String table : CHILDREN) {
            jdbc.execute("CREATE TABLE " + table + " (id BIGINT PRIMARY KEY, project_id BIGINT, regression_test_id BIGINT, "
                    + "scenario_id BIGINT, status VARCHAR(20), execution_status VARCHAR(20), INDEX(project_id), "
                    + (table.equals("simulation_runs") ? "FOREIGN KEY(project_id) REFERENCES projects(id)" : "CHECK(id > 0)") + ") ENGINE=InnoDB");
        }
        jdbc.execute("CREATE TABLE project_local_cleanup (run_id BIGINT PRIMARY KEY, storage_id CHAR(36) NOT NULL)");
        jdbc.execute("CREATE TABLE project_local_storage (id INT PRIMARY KEY, storage_id CHAR(36) NOT NULL)");
        jdbc.update("INSERT INTO project_local_storage VALUES (1,?)", STORAGE);
        jdbc.update("INSERT INTO projects VALUES (1,'Demo A',NULL,10),(2,'Demo B',NULL,10)");
        jdbc.update("INSERT INTO simulation_runs (id,project_id,status) VALUES (201,2,'COMPLETED')");
    }

    private void clean() {
        jdbc.execute("DROP TABLE project_local_cleanup");
        jdbc.execute("DROP TABLE project_local_storage");
        for (String table : CHILDREN) jdbc.execute("DROP TABLE " + table);
        jdbc.execute("DROP TABLE projects");
    }

    private static Connection writerConnection() throws SQLException {
        Connection connection = DriverManager.getConnection(System.getenv("VSOS_DELETE_TEST_URL"), "root", "vsos-demo-only");
        connection.setAutoCommit(false);
        return connection;
    }

    @Test
    void pendingRunCommittedWhileDeleteWaitsIsNotDeleted() throws Exception {
        fixture();
        var executor = Executors.newSingleThreadExecutor();
        try (Connection writer = writerConnection()) {
            writer.createStatement().execute("INSERT INTO simulation_runs (id,project_id,status) VALUES (101,1,'PENDING')");
            CountDownLatch started = new CountDownLatch(1);
            Future<?> deletion = executor.submit(() -> {
                started.countDown();
                projects.delete(1, 10, "Demo A", STORAGE);
            });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> deletion.get(300, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            writer.commit();
            assertThatThrownBy(() -> deletion.get(10, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(ProjectException.class)
                    .satisfies(e -> assertThat(((ProjectException) e.getCause()).getError()).isEqualTo(ProjectError.PROJECT_BUSY));
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM projects", Integer.class)).isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM simulation_runs", Integer.class)).isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isZero();
        } finally {
            executor.shutdownNow();
            clean();
        }
    }

    @Test
    void activeStatusUpdatesAreSeenAfterWaitingForTheirRows() throws Exception {
        fixture();
        var executor = Executors.newSingleThreadExecutor();
        try {
            for (String table : List.of("simulation_runs", "optimization_runs", "regression_tests")) {
                String column = table.equals("regression_tests") ? "execution_status" : "status";
                jdbc.update("INSERT INTO " + table + " (id,project_id," + column + ") VALUES (101,1,'COMPLETED')");
                try (Connection writer = writerConnection()) {
                    writer.createStatement().execute("UPDATE " + table + " SET " + column + "='RUNNING' WHERE id=101");
                    CountDownLatch started = new CountDownLatch(1);
                    Future<?> deletion = executor.submit(() -> {
                        started.countDown();
                        projects.delete(1, 10, "Demo A", STORAGE);
                    });
                    assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                    assertThatThrownBy(() -> deletion.get(300, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                    writer.commit();
                    assertThatThrownBy(() -> deletion.get(10, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
                            .hasCauseInstanceOf(ProjectException.class)
                            .satisfies(e -> assertThat(((ProjectException) e.getCause()).getError()).isEqualTo(ProjectError.PROJECT_BUSY));
                    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM projects WHERE id IN (1,2)", Integer.class)).isEqualTo(2);
                    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM simulation_runs WHERE id=201", Integer.class)).isEqualTo(1);
                }
                jdbc.update("DELETE FROM " + table + " WHERE id=101");
            }
        } finally {
            executor.shutdownNow();
            clean();
        }
    }

    @Test
    void nameAndOwnershipAreRecheckedAfterProjectLock() throws Exception {
        fixture();
        var executor = Executors.newSingleThreadExecutor();
        try {
            for (String change : List.of("name='Renamed'", "created_by_user_id=11")) {
                try (Connection writer = writerConnection()) {
                    writer.createStatement().execute("UPDATE projects SET " + change + " WHERE id=1");
                    CountDownLatch started = new CountDownLatch(1);
                    Future<?> deletion = executor.submit(() -> {
                        started.countDown();
                        projects.delete(1, 10, "Demo A", STORAGE);
                    });
                    assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                    assertThatThrownBy(() -> deletion.get(300, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                    writer.commit();
                    ProjectError expected = change.startsWith("name") ? ProjectError.CONFIRM_NAME_MISMATCH : ProjectError.PROJECT_NOT_YOURS;
                    assertThatThrownBy(() -> deletion.get(10, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
                            .hasCauseInstanceOf(ProjectException.class)
                            .satisfies(e -> assertThat(((ProjectException) e.getCause()).getError()).isEqualTo(expected));
                    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM projects", Integer.class)).isEqualTo(2);
                }
                jdbc.update("UPDATE projects SET name='Demo A',created_by_user_id=10 WHERE id=1");
            }
        } finally {
            executor.shutdownNow();
            clean();
        }
    }

    @Test
    void newRunCannotAppearAfterDeleteHasCollectedRuns() throws Exception {
        fixture();
        jdbc.update("INSERT INTO simulation_runs (id,project_id,status) VALUES (101,1,'COMPLETED')");
        var executor = Executors.newFixedThreadPool(3);
        CountDownLatch deleteReady = new CountDownLatch(1);
        CountDownLatch allowCommit = new CountDownLatch(1);
        try {
            Future<?> deletion = executor.submit(() -> new TransactionTemplate(manager).executeWithoutResult(status -> {
                projects.delete(1, 10, "Demo A", STORAGE);
                deleteReady.countDown();
                try {
                    if (!allowCommit.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out waiting to commit");
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(e);
                }
            }));
            assertThat(deleteReady.await(10, TimeUnit.SECONDS)).isTrue();
            CountDownLatch writerStarted = new CountDownLatch(1);
            Future<?> writer = executor.submit(() -> {
                try (Connection connection = writerConnection()) {
                    writerStarted.countDown();
                    connection.createStatement().execute("INSERT INTO simulation_runs (id,project_id,status) VALUES (102,1,'PENDING')");
                    connection.commit();
                } catch (SQLException e) {
                    throw new IllegalStateException(e);
                }
            });
            assertThat(writerStarted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> writer.get(300, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            CountDownLatch updateStarted = new CountDownLatch(1);
            Future<Integer> updater = executor.submit(() -> {
                try (Connection connection = writerConnection()) {
                    updateStarted.countDown();
                    int changed = connection.createStatement().executeUpdate("UPDATE simulation_runs SET status='RUNNING' WHERE id=101");
                    connection.commit();
                    return changed;
                }
            });
            assertThat(updateStarted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> updater.get(300, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            allowCommit.countDown();
            deletion.get(10, TimeUnit.SECONDS);
            assertThatThrownBy(() -> writer.get(10, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class);
            assertThat(updater.get(10, TimeUnit.SECONDS)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM projects WHERE id=1", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM simulation_runs WHERE id=201", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup WHERE run_id=101", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup WHERE run_id=201", Integer.class)).isZero();
        } finally {
            allowCommit.countDown();
            executor.shutdownNow();
            executor.awaitTermination(10, TimeUnit.SECONDS);
            clean();
        }
    }
}
