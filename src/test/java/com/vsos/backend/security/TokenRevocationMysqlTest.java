package com.vsos.backend.security;

import com.vsos.backend.config.AuthProperties;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.user.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

/** Only runs against an explicitly supplied disposable MySQL schema. */
@EnabledIfEnvironmentVariable(named = "VSOS_AUTH_DEMO_JDBC_URL", matches = ".+")
class TokenRevocationMysqlTest {
    @Test void revokedTokenRemainsRejectedAcrossServiceInstancesWithoutStoringTheToken() {
        var datasource = new DriverManagerDataSource(System.getenv("VSOS_AUTH_DEMO_JDBC_URL"),
                System.getenv("VSOS_AUTH_DEMO_DB_USER"), System.getenv("VSOS_AUTH_DEMO_DB_PASSWORD"));
        var jdbc = new JdbcTemplate(datasource);
        var store = new TokenRevocationStore(jdbc);
        var service = new JwtService(new AuthProperties(60, 600, 5, 60, 5, 10, 20, 10, 900, "auto", ""), store);
        ReflectionTestUtils.setField(service, "secretKey", "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970");
        var user = new CustomUserDetails(User.builder().email("demo@example.invalid").passwordHash("hash")
                .isActive(true).role(Role.builder().code(RoleCode.EXPERIENCER).name("x").build()).build());
        String token = service.generateToken(user);
        String other = service.generateToken(user);
        assertTrue(service.isTokenValid(token, user));
        service.revoke(token);
        assertFalse(new TokenRevocationStore(jdbc).isRevoked(other));
        assertTrue(new TokenRevocationStore(jdbc).isRevoked(token));
        assertFalse(service.isTokenValid(token, user));
        assertTrue(service.isTokenValid(other, user));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM auth_revoked_tokens WHERE token_hash = ?", Integer.class, token));
    }
}
