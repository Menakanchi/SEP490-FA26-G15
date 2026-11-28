package com.vsos.backend.service.project;

import com.vsos.backend.common.Json;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.util.FileSystemUtils;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Actual HTTP, MySQL, Redis and a disposable Windows data root. */
@EnabledOnOs(OS.WINDOWS)
@EnabledIfEnvironmentVariable(named = "VSOS_DELETE_HTTP_URL", matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/vsos_delete_http_test[?].*")
@EnabledIfEnvironmentVariable(named = "VSOS_DELETE_HTTP_REDIS_PORT", matches = "[0-9]+")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.config.import=optional:file:./target/delete-http-no-env.properties",
        "vehicsim.recover-on-startup=false", "vehicsim.video-storage.bucket=", "app.env=development"
})
class ProjectDeleteHttpMysqlTest {
    private static final String STORAGE = "bf9d11f0-21a3-46cf-88b8-1a15dc3b8a8f";
    private static final Path ROOT = createRoot();

    private static Path createRoot() {
        try { return Files.createTempDirectory("vsos-delete-http-"); }
        catch (Exception e) { throw new ExceptionInInitializerError(e); }
    }

    @DynamicPropertySource static void isolatedDatabase(DynamicPropertyRegistry properties) throws Exception {
        String url = System.getenv("VSOS_DELETE_HTTP_URL");
        var data = new DriverManagerDataSource(url, "root", "vsos-demo-only");
        var jdbc = new JdbcTemplate(data);
        assertThat(jdbc.queryForObject("SELECT DATABASE()", String.class)).isEqualTo("vsos_delete_http_test");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()", Integer.class)).isZero();
        String ddl = Files.readString(Path.of("database/mysql/01_schema.sql"), StandardCharsets.UTF_8)
                .replace("CREATE DATABASE IF NOT EXISTS vehicsim ", "CREATE DATABASE IF NOT EXISTS vsos_delete_http_test ")
                .replace("USE vehicsim;", "USE vsos_delete_http_test;");
        try (var connection = data.getConnection()) {
            ScriptUtils.executeSqlScript(connection, new ByteArrayResource(ddl.getBytes(StandardCharsets.UTF_8)));
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.username", () -> "root");
        properties.add("spring.datasource.password", () -> "vsos-demo-only");
        properties.add("spring.data.redis.host", () -> "127.0.0.1");
        properties.add("spring.data.redis.port", () -> System.getenv("VSOS_DELETE_HTTP_REDIS_PORT"));
        properties.add("vehicsim.data-root", ROOT::toString);
    }

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @AfterAll static void cleanRoot() throws Exception { FileSystemUtils.deleteRecursively(ROOT); }

    @Test void missingMarkerAndLockedFileAreReportedAndRetriedWithoutTouchingOtherProject() throws Exception {
        String password = "Demo-only-2026!";
        jdbc.update("INSERT INTO users(id,email,password_hash,role_id,last_name,first_name) SELECT 71,'delete-http@example.invalid',?,id,'Demo','Owner' FROM roles WHERE code='EXPERIENCER'", encoder.encode(password));
        jdbc.update("INSERT INTO project_local_storage(id,storage_id) VALUES (1,?)", STORAGE);
        for (int n : new int[]{1, 2}) {
            jdbc.update("INSERT INTO projects(id,name,created_by_user_id,carla_vehicle_model_id) VALUES (?,?,71,(SELECT MIN(id) FROM carla_vehicle_models))", 10 + n, "Demo " + n);
            jdbc.update("INSERT INTO aeb_versions(id,project_id,version_no,source,status,created_by_user_id) VALUES (?,?,1,'MANUAL','BASELINE',71)", 40 + n, 10 + n);
            jdbc.update("INSERT INTO scenarios(id,project_id,code,name,created_by_user_id) VALUES (?,?,?, ?,71)", 20 + n, 10 + n, "CP-" + n, "Scenario " + n);
            jdbc.update("INSERT INTO scenario_versions(id,scenario_id,version_no,source,scenario_ir_json,created_by_user_id) VALUES (?,?,1,'MANUAL','{}',71)", 30 + n, 20 + n);
            jdbc.update("INSERT INTO simulation_runs(id,project_id,scenario_id,scenario_version_id,carla_vehicle_model_id,aeb_version_id,simulator_type,simulator_version,purpose,status,verdict,collision_occurred,random_seed,created_by_user_id) VALUES (?,?,?,?,(SELECT MIN(id) FROM carla_vehicle_models),?,'CARLA','carla-demo-only','BASELINE','COMPLETED','PASS',FALSE,1,71)", 100 + n, 10 + n, 20 + n, 30 + n, 40 + n);
            jdbc.update("INSERT INTO fa_json_sources(id,project_id,dedupe_key,payload_bytes,payload_sha256,metadata_bytes,metadata_sha256) VALUES (?,?,?, ?,?, ?,?)", String.format("00000000-0000-0000-0000-%012d", n), 10 + n, "fixture-" + n, "{}".getBytes(StandardCharsets.UTF_8), "0".repeat(64), "{}".getBytes(StandardCharsets.UTF_8), "0".repeat(64));
            Files.createDirectories(ROOT.resolve("runs/" + (100 + n)));
            Files.writeString(ROOT.resolve("runs/" + (100 + n) + "/result.txt"), "demo-" + n);
        }
        Files.writeString(ROOT.resolve(".vsos-storage-id"), STORAGE);
        Path marker = ROOT.resolve("runs/.vsos-storage-id");
        Files.writeString(marker, STORAGE);
        var login = request("POST", "/api/v1/auth/login", null, Json.obj("email", "delete-http@example.invalid", "password", password));
        assertThat(login.statusCode()).isEqualTo(200);
        String token = Json.parseMap(login.body()).get("access_token").toString();

        Files.delete(marker);
        assertThat(request("DELETE", "/api/v1/vehicsim/projects/11", token, Json.obj("confirm_name", "Demo 1")).statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM projects WHERE id=11", Integer.class)).isEqualTo(1);
        assertThat(ROOT.resolve("runs/101/result.txt")).hasContent("demo-1");
        Files.writeString(marker, STORAGE);

        try (var handle = FileChannel.open(ROOT.resolve("runs/101/result.txt"), StandardOpenOption.WRITE, com.sun.nio.file.ExtendedOpenOption.NOSHARE_DELETE)) {
            var deleted = request("DELETE", "/api/v1/vehicsim/projects/11", token, Json.obj("confirm_name", "Demo 1"));
            assertThat(deleted.statusCode()).isEqualTo(200);
            assertThat(Json.parseMap(deleted.body())).containsEntry("deleted", true);
            assertThat(Json.parseMap(deleted.body()).get("cleanup_failed_run_ids").toString()).contains("101");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM projects WHERE id=11", Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup WHERE run_id=101", Integer.class)).isEqualTo(1);
            assertOtherProject();
        }
        long end = System.nanoTime() + Duration.ofSeconds(40).toNanos();
        while (System.nanoTime() < end && jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup WHERE run_id=101", Integer.class) != 0) Thread.sleep(250);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM project_local_cleanup WHERE run_id=101", Integer.class)).isZero();
        assertThat(ROOT.resolve("runs/101")).doesNotExist();
        assertOtherProject();
    }

    private void assertOtherProject() throws Exception {
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM projects WHERE id=12", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM simulation_runs WHERE id=102 AND project_id=12", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM fa_json_sources WHERE project_id=12", Integer.class)).isEqualTo(1);
        assertThat(ROOT.resolve("runs/102/result.txt")).hasContent("demo-2");
    }

    private HttpResponse<String> request(String method, String path, String token, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json");
        if (token != null) builder.header("Authorization", "Bearer " + token);
        return http.send(builder.method(method, HttpRequest.BodyPublishers.ofString(Json.write(body))).build(), HttpResponse.BodyHandlers.ofString());
    }
}
