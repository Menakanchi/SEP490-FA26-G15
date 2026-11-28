package com.vsos.backend.repository.project;

import com.vsos.backend.repository.common.Db;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Isolated MySQL only: inject failures before the server receives COMMIT. */
@EnabledIfEnvironmentVariable(named = "VSOS_DELETE_TEST_URL", matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/vsos_delete_test[?].*")
class ProjectDeleteCommitMysqlTest {
    @Test
    void refusedCommitAndConnectionLossBeforeCommitHaveDifferentOutcomes() {
        var real = new DriverManagerDataSource(System.getenv("VSOS_DELETE_TEST_URL"), "root", "vsos-demo-only");
        var jdbc = new JdbcTemplate(real);
        List<String> tables = List.of("fa_json_handoffs", "fa_json_reports", "fa_json_executions", "fa_json_sources",
                "engineering_recommendations", "regression_test_items", "simulation_runs", "analysis_results", "regression_tests",
                "optimization_runs", "scenario_versions", "scenarios", "aeb_versions", "projects");
        for (String table : tables) jdbc.execute("CREATE TABLE " + table + " (id BIGINT PRIMARY KEY, project_id BIGINT, regression_test_id BIGINT, scenario_id BIGINT, name VARCHAR(150), workspace_id BIGINT, created_by_user_id BIGINT, status VARCHAR(20), execution_status VARCHAR(20))");
        jdbc.execute("CREATE TABLE project_local_cleanup (run_id BIGINT PRIMARY KEY, storage_id CHAR(36) NOT NULL)");
        jdbc.execute("CREATE TABLE project_local_storage (id INT PRIMARY KEY, storage_id CHAR(36) NOT NULL)");
        jdbc.update("INSERT INTO project_local_storage VALUES (1,'00000000-0000-0000-0000-000000000001')");
        try {
            for (String table : tables) {
                jdbc.update("INSERT INTO " + table + " VALUES (1,1,1,1,'Demo A',NULL,10,'COMPLETED','COMPLETED'),(2,2,2,2,'Demo B',NULL,10,'COMPLETED','COMPLETED')");
            }
            for (int scenario : List.of(0, 1, 2)) {
                boolean disconnect = scenario == 2;
                var failing = new DelegatingDataSource(real) {
                    @Override public Connection getConnection() throws SQLException {
                        Connection connection = super.getConnection();
                        return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[]{Connection.class}, (proxy, method, args) -> {
                            if (method.getName().equals("commit")) {
                                if (disconnect) connection.close();
                                throw new SQLException(disconnect ? "fixture connection lost before commit" : "fixture commit refused");
                            }
                            try { return method.invoke(connection, args); }
                            catch (InvocationTargetException e) { throw e.getCause(); }
                        });
                    }
                };
                var manager = new DataSourceTransactionManager(failing);
                manager.setRollbackOnCommitFailure(scenario == 1);
                var template = new TransactionTemplate(manager);
                var repository = new ProjectRepository(new Db(new JdbcTemplate(failing)));
                assertThatThrownBy(() -> template.executeWithoutResult(status -> repository.delete(1L, 10L, "Demo A", "00000000-0000-0000-0000-000000000001"))).isInstanceOf(RuntimeException.class);
                for (String table : tables) {
                    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class)).as(table).isEqualTo(scenario == 0 ? 1 : 2);
                    if (scenario == 0) jdbc.update("INSERT INTO " + table + " VALUES (1,1,1,1,'Demo A',NULL,10,'COMPLETED','COMPLETED')");
                }
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup", Integer.class)).isEqualTo(scenario == 0 ? 1 : 0);
                if (scenario == 0) jdbc.update("DELETE FROM project_local_cleanup WHERE run_id=1");
            }
        } finally {
            jdbc.execute("DROP TABLE project_local_cleanup");
            jdbc.execute("DROP TABLE project_local_storage");
            for (String table : tables) jdbc.execute("DROP TABLE " + table);
        }
    }
}
