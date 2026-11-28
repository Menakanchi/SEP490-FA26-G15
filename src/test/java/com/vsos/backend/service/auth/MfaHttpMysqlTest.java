package com.vsos.backend.service.auth;

import com.vsos.backend.common.Json;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import com.vsos.backend.repository.user.UserRepository;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Opt-in HTTP test: creates fixtures only in the named, initially empty demo schema. */
@EnabledIfEnvironmentVariable(named = "VSOS_MFA_DEMO_JDBC_URL", matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/vsos_mfa_demo[?].*")
@EnabledIfEnvironmentVariable(named = "VSOS_SECURITY_REDIS_PORT", matches = "[0-9]+")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.config.import=optional:file:./target/mfa-no-env.properties",
        "vehicsim.recover-on-startup=false", "vehicsim.data-root=./target/mfa-demo-data",
        "app.auth.login-attempts-per-ip=100", "app.auth.mfa-encryption-key=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class MfaHttpMysqlTest {
    private final long firstId = java.util.concurrent.ThreadLocalRandom.current().nextLong(1_000_000_000_000L, 8_000_000_000_000L);
    private final long secondId = firstId + 1;
    @DynamicPropertySource static void demo(DynamicPropertyRegistry properties) throws Exception {
        String url = System.getenv("VSOS_MFA_DEMO_JDBC_URL");
        var data = new DriverManagerDataSource(url, "root", "vsos-demo-only");
        var jdbc = new JdbcTemplate(data);
        assertThat(jdbc.queryForObject("SELECT DATABASE()", String.class)).isEqualTo("vsos_mfa_demo");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()", Integer.class)).isZero();
        String schema = Files.readString(Path.of("database/mysql/01_schema.sql"), StandardCharsets.UTF_8)
                .replace("CREATE DATABASE IF NOT EXISTS vehicsim ", "CREATE DATABASE IF NOT EXISTS vsos_mfa_demo ")
                .replace("USE vehicsim;", "USE vsos_mfa_demo;");
        try (var connection = data.getConnection()) {
            ScriptUtils.executeSqlScript(connection, new ByteArrayResource(schema.getBytes(StandardCharsets.UTF_8)));
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.username", () -> "root");
        properties.add("spring.datasource.password", () -> "vsos-demo-only");
        properties.add("spring.data.redis.host", () -> "127.0.0.1");
        properties.add("spring.data.redis.port", () -> System.getenv("VSOS_SECURITY_REDIS_PORT"));
    }

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    @Autowired UserRepository users;
    @Autowired PlatformTransactionManager transactions;
    @Autowired MfaService mfaService;
    @Autowired StringRedisTemplate redis;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @AfterEach void cleanupRedisFixtures() {
        for (long id : new long[]{firstId, secondId}) {
            redis.delete("ratelimit:login_acct:user" + id + "@example.invalid");
            redis.delete("ratelimit:mfa_manage:" + id);
            redis.delete("mfa:pending:" + id);
        }
    }

    @Test void totpRecoveryLogoutAndUnrelatedAccount() throws Exception {
        assertThat(MfaService.totp("12345678901234567890".getBytes(StandardCharsets.US_ASCII), 1)).isEqualTo("287082");
        String password = "Demo-only-2026!";
        for (long id : new long[]{firstId, secondId}) jdbc.update("INSERT INTO users(id,email,password_hash,role_id,last_name,first_name) SELECT ?,?,?,id,'Demo','User' FROM roles WHERE code='EXPERIENCER'", id, "user" + id + "@example.invalid", encoder.encode(password));
        String email = "user" + firstId + "@example.invalid";
        String token = login(firstId, password, null);
        String other = login(secondId, password, null);
        assertThat(request("POST", "/api/v1/auth/mfa/setup", null, Map.of("password", password)).statusCode()).isEqualTo(401);
        var setup = request("POST", "/api/v1/auth/mfa/setup", token, Map.of("password", password));
        assertThat(setup.statusCode()).isEqualTo(200);
        assertThat(setup.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        String secret = Json.parseMap(setup.body()).get("secret").toString();
        String currentCode = MfaService.totp(decodeBase32(secret), System.currentTimeMillis() / 30_000);
        var enabled = request("POST", "/api/v1/auth/mfa/enable", token, Map.of("password", password, "code", currentCode));
        assertThat(enabled.statusCode()).isEqualTo(200);
        Map<?, ?> body = Json.parseMap(enabled.body());
        @SuppressWarnings("unchecked") List<String> recovery = (List<String>) body.get("recoveryCodes");
        assertThat(recovery).hasSize(10).doesNotHaveDuplicates();
        assertThat(jdbc.queryForObject("SELECT encrypted_secret FROM auth_mfa WHERE user_id=?", String.class, firstId)).doesNotContain(secret);
        assertThat(request("GET", "/api/v1/auth/me", token, null).statusCode()).isEqualTo(401);
        assertThat(request("POST", "/api/v1/auth/login", null, Map.of("email", email, "password", password, "mfa_code", currentCode)).statusCode()).isEqualTo(401);
        ReflectionTestUtils.setField(mfaService, "encryptionKey", "");
        assertThat(request("POST", "/api/v1/auth/login", null, Map.of("email", email, "password", password, "mfa_code", currentCode)).statusCode()).isEqualTo(503);
        String loginBody = Json.write(Map.of("email", email, "password", password, "mfa_code", recovery.get(0)));
        var concurrentRequest = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/auth/login"))
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(loginBody)).build();
        var first = http.sendAsync(concurrentRequest, HttpResponse.BodyHandlers.ofString());
        var second = http.sendAsync(concurrentRequest, HttpResponse.BodyHandlers.ofString());
        var responses = List.of(first.get(), second.get());
        assertThat(responses.stream().map(HttpResponse::statusCode).sorted().toList()).containsExactly(200, 401);
        ReflectionTestUtils.setField(mfaService, "encryptionKey", "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=");
        String recovered = Json.parseMap(responses.stream().filter(r -> r.statusCode() == 200).findFirst().orElseThrow().body()).get("access_token").toString();
        assertThat(request("POST", "/api/v1/auth/login", null, Map.of("email", email, "password", password, "mfa_code", recovery.get(0))).statusCode()).isEqualTo(401);
        assertThat(request("POST", "/api/v1/auth/logout", recovered, null).statusCode()).isEqualTo(204);
        assertThat(request("GET", "/api/v1/auth/me", recovered, null).statusCode()).isEqualTo(401);
        assertThat(request("GET", "/api/v1/auth/me", other, null).statusCode()).isEqualTo(200);
        String stillLoggedIn = ((Map<?, ?>) body.get("session")).get("access_token").toString();
        var rotated = request("POST", "/api/v1/auth/mfa/recovery", stillLoggedIn, Map.of("password", password, "code", recovery.get(1)));
        assertThat(rotated.statusCode()).isEqualTo(200);
        @SuppressWarnings("unchecked") List<String> newRecovery = (List<String>) Json.parseMap(rotated.body()).get("codes");
        assertThat(newRecovery).hasSize(10).doesNotHaveDuplicates();
        assertThat(request("POST", "/api/v1/auth/mfa/disable", stillLoggedIn, Map.of("password", password, "code", recovery.get(2))).statusCode()).isEqualTo(400);
        assertThat(request("POST", "/api/v1/auth/mfa/disable", stillLoggedIn, Map.of("password", password, "code", newRecovery.get(0))).statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM auth_mfa_recovery_codes WHERE user_id=?", Integer.class, firstId)).isZero();
        assertThat(login(firstId, password, null)).isNotBlank();
        assertThat(request("GET", "/api/v1/auth/me", other, null).statusCode()).isEqualTo(200);

        // A stale JPA profile edit must not overwrite a concurrent auth-version change.
        var separate = new JdbcTemplate(new DriverManagerDataSource(System.getenv("VSOS_MFA_DEMO_JDBC_URL"), "root", "vsos-demo-only"));
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            var stale = users.findByEmail("user" + secondId + "@example.invalid").orElseThrow();
            separate.update("UPDATE users SET auth_version = auth_version + 1 WHERE id=?", secondId);
            stale.setFirstName("Updated");
            users.saveAndFlush(stale);
        });
        assertThat(jdbc.queryForObject("SELECT auth_version FROM users WHERE id=?", Long.class, secondId)).isEqualTo(1L);
        assertThat(request("GET", "/api/v1/auth/me", other, null).statusCode()).isEqualTo(401);
    }

    private String login(long id, String password, String code) throws Exception {
        var payload = new java.util.HashMap<String, String>();
        payload.put("email", "user" + id + "@example.invalid"); payload.put("password", password);
        if (code != null) payload.put("mfa_code", code);
        var response = request("POST", "/api/v1/auth/login", null, payload);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return Json.parseMap(response.body()).get("access_token").toString();
    }

    private HttpResponse<String> request(String method, String path, String token, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).timeout(Duration.ofSeconds(15)).header("Content-Type", "application/json");
        if (token != null) builder.header("Authorization", "Bearer " + token);
        String payload = body == null ? "" : Json.write(body);
        return http.send(builder.method(method, HttpRequest.BodyPublishers.ofString(payload)).build(), HttpResponse.BodyHandlers.ofString());
    }

    private static byte[] decodeBase32(String input) {
        var result = new java.io.ByteArrayOutputStream();
        int buffer = 0, bits = 0;
        for (char c : input.toCharArray()) {
            buffer = (buffer << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c); bits += 5;
            if (bits >= 8) { bits -= 8; result.write((buffer >> bits) & 255); }
        }
        return result.toByteArray();
    }
}
