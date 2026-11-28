package com.vsos.backend.repository.project;

import com.vsos.backend.repository.common.Db;
import com.vsos.backend.service.project.ProjectLocalCleanup;
import com.vsos.backend.service.simulation.RunService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.util.FileSystemUtils;

import java.io.DataInputStream;
import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mockStatic;

/** Opt-in only: disposable MySQL network, database and filesystem; never an existing deployment. */
@EnabledIfEnvironmentVariable(named = "VSOS_NETWORK_DEMO_URL", matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/vsos_delete_test[?].*")
@EnabledIfEnvironmentVariable(named = "VSOS_NETWORK_DEMO_CONTAINER", matches = "vsos-net-mysql-[a-z0-9]+")
@EnabledIfEnvironmentVariable(named = "VSOS_NETWORK_DEMO_NETWORK", matches = "vsos-net-demo-[a-z0-9]+")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "vehicsim.recover-on-startup=false", "vehicsim.video-storage.bucket=", "spring.jpa.hibernate.ddl-auto=none",
        "spring.datasource.hikari.connection-timeout=3000"
})
class ProjectCleanupNetworkMysqlTest {
    static final String STORAGE = "9d3b5e57-8cdc-4922-aed1-37e503ee7c6e";
    static final List<String> TABLES = List.of("fa_json_handoffs", "fa_json_reports", "fa_json_executions", "fa_json_sources",
            "engineering_recommendations", "regression_test_items", "simulation_runs", "analysis_results", "regression_tests",
            "optimization_runs", "scenario_versions", "scenarios", "aeb_versions", "projects");
    static final Path ROOT;
    static WireProxy proxy;
    static {
        try { ROOT = Files.createTempDirectory("vsos-network-cleanup-"); }
        catch (IOException e) { throw new ExceptionInInitializerError(e); }
    }

    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) throws IOException {
        String direct = System.getenv("VSOS_NETWORK_DEMO_URL");
        int end = direct.indexOf('/', "jdbc:mysql://".length());
        int port = Integer.parseInt(direct.substring(direct.lastIndexOf(':', end), end).substring(1));
        proxy = new WireProxy(port);
        String viaProxy = direct.substring(0, direct.lastIndexOf(':', end) + 1) + proxy.port() + direct.substring(end);
        registry.add("spring.datasource.url", () -> viaProxy);
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
        jdbc.update("INSERT INTO project_local_storage VALUES (1, ?)", STORAGE);
        Files.writeString(ROOT.resolve(".vsos-storage-id"), STORAGE);
        Files.createDirectories(ROOT.resolve("runs/1"));
        Files.createDirectories(ROOT.resolve("runs/2"));
        Files.writeString(ROOT.resolve("runs/.vsos-storage-id"), STORAGE);
        Files.writeString(ROOT.resolve("runs/1/demo.txt"), "project one");
        Files.writeString(ROOT.resolve("runs/2/demo.txt"), "project two");
        cleanup = new ProjectLocalCleanup(db, runs, transactions);
    }

    @AfterEach void teardown() throws Exception {
        cleanup.stop();
        jdbc.execute("DROP TABLE project_local_cleanup");
        jdbc.execute("DROP TABLE project_local_storage");
        for (String table : TABLES) jdbc.execute("DROP TABLE " + table);
    }
    @AfterAll static void deleteRoot() throws Exception {
        if (proxy != null) proxy.close();
        FileSystemUtils.deleteRecursively(ROOT);
    }

    @Test void lostCommitAcknowledgmentIsRetriedAfterRestart() throws Exception {
        proxy.dropNextCommitResponse();
        assertThatThrownBy(() -> projects.delete(1, 7, "Demo", STORAGE)).isInstanceOf(RuntimeException.class);
        assertThat(proxy.lostCommit.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(directCount("SELECT COUNT(*) FROM projects WHERE id=1")).isZero();
        assertThat(directCount("SELECT COUNT(*) FROM project_local_cleanup WHERE run_id=1")).isEqualTo(1);
        assertThat(ROOT.resolve("runs/1/demo.txt")).hasContent("project one");
        cleanup.start();
        for (int i = 0; i < 100 && directCount("SELECT COUNT(*) FROM project_local_cleanup") != 0; i++) Thread.sleep(50);
        assertThat(directCount("SELECT COUNT(*) FROM project_local_cleanup")).isZero();
        assertThat(ROOT.resolve("runs/1")).doesNotExist();
        assertOtherProjectIntact();
    }

    @Test void realDockerDisconnectAfterFileDeletionLeavesJobForRetry() throws Exception {
        projects.delete(1, 7, "Demo", STORAGE);
        Path own = ROOT.resolve("runs/1");
        boolean[] disconnected = {false};
        try (var files = mockStatic(FileSystemUtils.class, CALLS_REAL_METHODS)) {
            files.when(() -> FileSystemUtils.deleteRecursively(own)).thenAnswer(call -> {
                Object result = call.callRealMethod();
                docker("disconnect", "--force");
                disconnected[0] = true;
                return result;
            });
            assertThat(cleanup.clean(1, STORAGE)).isFalse();
        } finally {
            if (disconnected[0]) docker("connect");
        }
        assertThat(directCount("SELECT COUNT(*) FROM project_local_cleanup WHERE run_id=1")).isEqualTo(1);
        assertThat(own).doesNotExist();
        cleanup.retryPending();
        assertThat(directCount("SELECT COUNT(*) FROM project_local_cleanup WHERE run_id=1")).isZero();
        assertOtherProjectIntact();
    }

    @Test void lostCleanupCommitAcknowledgmentLeavesDeletedFileAndNoDuplicateWork() throws Exception {
        projects.delete(1, 7, "Demo", STORAGE);
        proxy.dropNextCommitResponse();
        assertThat(cleanup.clean(1, STORAGE)).isFalse();
        assertThat(proxy.lostCommit.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(directCount("SELECT COUNT(*) FROM project_local_cleanup WHERE run_id=1")).isZero();
        assertThat(ROOT.resolve("runs/1")).doesNotExist();
        cleanup.retryPending();
        assertOtherProjectIntact();
    }

    private void assertOtherProjectIntact() throws Exception {
        assertThat(ROOT.resolve("runs/2/demo.txt")).hasContent("project two");
        for (String table : TABLES) assertThat(directCount("SELECT COUNT(*) FROM " + table + " WHERE id=2")).as(table).isEqualTo(1);
    }

    private static int directCount(String sql) throws Exception {
        try (var conn = DriverManager.getConnection(System.getenv("VSOS_NETWORK_DEMO_URL"), "root", "vsos-demo-only");
             var statement = conn.createStatement(); var result = statement.executeQuery(sql)) {
            result.next();
            return result.getInt(1);
        }
    }

    private static void docker(String command, String... options) throws Exception {
        var args = new java.util.ArrayList<>(List.of("docker", "network", command));
        args.addAll(List.of(options));
        args.add(System.getenv("VSOS_NETWORK_DEMO_NETWORK"));
        args.add(System.getenv("VSOS_NETWORK_DEMO_CONTAINER"));
        Process process = new ProcessBuilder(args).redirectErrorStream(true).start();
        assertThat(process.waitFor(15, TimeUnit.SECONDS)).isTrue();
        assertThat(process.exitValue()).as(new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8)).isZero();
    }

    /** Relay actual MySQL packets; on request, deliver COMMIT, consume its OK response, then reset the client socket. */
    static final class WireProxy implements AutoCloseable {
        final ServerSocket listener = new ServerSocket(0, 50, java.net.InetAddress.getLoopbackAddress());
        final AtomicBoolean drop = new AtomicBoolean();
        volatile CountDownLatch lostCommit = new CountDownLatch(1);
        final int upstreamPort;
        WireProxy(int upstreamPort) throws IOException {
            this.upstreamPort = upstreamPort;
            Thread accept = new Thread(() -> {
                while (!listener.isClosed()) {
                    try { attach(listener.accept()); }
                    catch (IOException e) { if (!listener.isClosed()) throw new RuntimeException(e); }
                }
            }, "vsos-mysql-demo-proxy");
            accept.setDaemon(true);
            accept.start();
        }
        int port() { return listener.getLocalPort(); }
        void dropNextCommitResponse() { lostCommit = new CountDownLatch(1); drop.set(true); }
        void attach(Socket client) throws IOException {
            Socket upstream = new Socket("127.0.0.1", upstreamPort);
            AtomicBoolean discardResponse = new AtomicBoolean();
            Thread c2s = new Thread(() -> relay(client, upstream, true, discardResponse), "vsos-demo-client-to-db");
            Thread s2c = new Thread(() -> relay(upstream, client, false, discardResponse), "vsos-demo-db-to-client");
            c2s.setDaemon(true); s2c.setDaemon(true); c2s.start(); s2c.start();
        }
        void relay(Socket from, Socket to, boolean clientToServer, AtomicBoolean discardResponse) {
            try {
                DataInputStream in = new DataInputStream(from.getInputStream());
                var out = to.getOutputStream();
                while (true) {
                    byte[] header = in.readNBytes(4);
                    if (header.length != 4) return;
                    int size = (header[0] & 255) | ((header[1] & 255) << 8) | ((header[2] & 255) << 16);
                    byte[] payload = in.readNBytes(size);
                    if (payload.length != size) return;
                    if (clientToServer && size > 1 && payload[0] == 3 &&
                            new String(payload, 1, size - 1, StandardCharsets.UTF_8).replaceFirst("^[\\x00-\\x1f]*", "").strip().equalsIgnoreCase("commit") && drop.compareAndSet(true, false)) {
                        discardResponse.set(true);
                    }
                    if (!clientToServer && discardResponse.compareAndSet(true, false)) {
                        if (size == 0 || payload[0] != 0) throw new IOException("COMMIT did not return OK");
                        to.setSoLinger(true, 0);
                        to.close();
                        lostCommit.countDown();
                        return;
                    }
                    out.write(header); out.write(payload); out.flush();
                }
            } catch (IOException ignored) {
                // Closing the client intentionally or disconnecting the Docker network ends the relay.
            } finally {
                try { from.close(); } catch (IOException ignored) { }
                try { to.close(); } catch (IOException ignored) { }
            }
        }
        @Override public void close() throws IOException { listener.close(); }
    }
}
