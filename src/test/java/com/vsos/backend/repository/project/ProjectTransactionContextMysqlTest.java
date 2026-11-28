package com.vsos.backend.repository.project;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.nio.file.Path;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Real application context, restricted to a disposable loopback database. */
@EnabledIfEnvironmentVariable(named = "VSOS_DELETE_TEST_URL", matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/vsos_delete_test[?].*")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "vehicsim.recover-on-startup=false", "vehicsim.video-storage.bucket=", "spring.jpa.hibernate.ddl-auto=none"
})
@Import(ProjectTransactionContextMysqlTest.FaultConfig.class)
class ProjectTransactionContextMysqlTest {
    private static final String DATA_ROOT = Path.of(System.getProperty("java.io.tmpdir"), "vsos-delete-test-" + UUID.randomUUID()).toString();
    static final AtomicInteger fault = new AtomicInteger();
    static final AtomicInteger intercepted = new AtomicInteger();
    @TestConfiguration
    static class FaultConfig {
        @Bean static BeanPostProcessor faultInjection() {
            return new BeanPostProcessor() {
                @Override public Object postProcessAfterInitialization(Object bean, String name) {
                    if (!(bean instanceof DataSource source) || !name.equals("dataSource")) return bean;
                    return new DelegatingDataSource(source) {
                        @Override public Connection getConnection() throws SQLException {
                            Connection connection = super.getConnection();
                            return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[]{Connection.class}, (proxy, method, args) -> {
                                if (method.getName().equals("commit") && fault.get() != 0) {
                                    intercepted.incrementAndGet();
                                    if (fault.get() == 2) connection.close();
                                    if (fault.get() == 3) connection.commit();
                                    throw new SQLException("fixture commit response failure");
                                }
                                try { return method.invoke(connection, args); }
                                catch (InvocationTargetException e) { throw e.getCause(); }
                            });
                        }
                    };
                }
            };
        }
    }
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("VSOS_DELETE_TEST_URL"));
        registry.add("spring.datasource.username", () -> "root");
        registry.add("spring.datasource.password", () -> "vsos-demo-only");
        registry.add("vehicsim.data-root", () -> DATA_ROOT);
    }

    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;
    @Autowired ProjectRepository repository;

    @Test
    void actualApplicationUsesJpaTransactionManager() {
        assertThat(transactions).isInstanceOf(JpaTransactionManager.class);
        assertThat(((JpaTransactionManager) transactions).isRollbackOnCommitFailure()).isFalse();
    }

    @Test
    void measureActualManagerWhenCommitFailsBeforeServerReceivesIt() {
        List<String> tables = List.of("fa_json_handoffs", "fa_json_reports", "fa_json_executions", "fa_json_sources",
                "engineering_recommendations", "regression_test_items", "simulation_runs", "analysis_results", "regression_tests",
                "optimization_runs", "scenario_versions", "scenarios", "aeb_versions", "projects");
        for (String table : tables) jdbc.execute("CREATE TABLE " + table + " (id BIGINT PRIMARY KEY, project_id BIGINT, regression_test_id BIGINT, scenario_id BIGINT, name VARCHAR(150), workspace_id BIGINT, created_by_user_id BIGINT, status VARCHAR(20), execution_status VARCHAR(20))");
        jdbc.execute("CREATE TABLE project_local_cleanup (run_id BIGINT PRIMARY KEY, storage_id CHAR(36) NOT NULL)");
        jdbc.execute("CREATE TABLE project_local_storage (id INT PRIMARY KEY, storage_id CHAR(36) NOT NULL)");
        jdbc.update("INSERT INTO project_local_storage VALUES (1,'00000000-0000-0000-0000-000000000001')");
        try {
            for (String table : tables) jdbc.update("INSERT INTO " + table + " VALUES (1,1,1,1,'Demo A',NULL,10,'COMPLETED','COMPLETED'),(2,2,2,2,'Demo B',NULL,10,'COMPLETED','COMPLETED')");
            for (int mode : List.of(1, 2)) {
                fault.set(mode); intercepted.set(0);
                assertThatThrownBy(() -> repository.delete(1L, 10L, "Demo A", "00000000-0000-0000-0000-000000000001")).isInstanceOf(RuntimeException.class);
                fault.set(0);
                assertThat(intercepted.get()).isGreaterThan(0);
                for (String table : tables) {
                    int count = jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
                    assertThat(count).as("mode %s table %s", mode, table).isEqualTo(2);
                }
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isZero();
            }
            // A lost response after server commit is indistinguishable from a failed commit.
            fault.set(3); intercepted.set(0);
            assertThatThrownBy(() -> repository.delete(1L, 10L, "Demo A", "00000000-0000-0000-0000-000000000001")).isInstanceOf(RuntimeException.class);
            fault.set(0);
            assertThat(intercepted.get()).isGreaterThan(0);
            for (String table : tables) {
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class))
                        .as("after successful commit with lost response: %s", table).isEqualTo(1);
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE id = 2", Integer.class))
                        .as("other project remains: %s", table).isEqualTo(1);
            }
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup WHERE run_id=1", Integer.class)).isEqualTo(1);
        } finally {
            fault.set(0);
            jdbc.execute("DROP TABLE project_local_cleanup");
            jdbc.execute("DROP TABLE project_local_storage");
            for (String table : tables) jdbc.execute("DROP TABLE " + table);
        }
    }
}
