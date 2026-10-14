package com.vehicsim.security;

import com.vehicsim.config.AuthProperties;
import com.vehicsim.entity.Role;
import com.vehicsim.entity.User;
import com.vehicsim.entity.enums.RoleCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private static final String SECRET = "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";

    private JwtService jwt;

    @BeforeEach
    void setUp() {
        jwt = new JwtService(new AuthProperties(60, 600, 5, 60, 5, 10, 900, ""));
        ReflectionTestUtils.setField(jwt, "secretKey", SECRET);
        ReflectionTestUtils.setField(jwt, "appEnv", "development");
    }

    private static CustomUserDetails user(String passwordHash, boolean active) {
        return new CustomUserDetails(User.builder()
                .email("a@b.c").passwordHash(passwordHash).isActive(active)
                .role(Role.builder().code(RoleCode.EXPERIENCER).name("x").build())
                .lastName("A").firstName("B").build());
    }

    @Test
    void tokenIsValidForTheSameUser() {
        String token = jwt.generateToken(user("hash-1", true));
        assertTrue(jwt.isTokenValid(token, user("hash-1", true)));
        assertEquals(3600, jwt.expiresInSeconds());
    }

    @Test
    void changingThePasswordHashInvalidatesOldTokens() {
        String token = jwt.generateToken(user("hash-1", true));
        assertFalse(jwt.isTokenValid(token, user("hash-2", true)));
    }

    @Test
    void disabledAccountsAreRejected() {
        String token = jwt.generateToken(user("hash-1", true));
        assertFalse(jwt.isTokenValid(token, user("hash-1", false)));
    }

    @Test
    void productionRefusesTheBuiltInSecret() {
        ReflectionTestUtils.setField(jwt, "appEnv", "production");
        assertThrows(IllegalStateException.class, () -> ReflectionTestUtils.invokeMethod(jwt, "refuseDefaultSecretInProduction"));
    }
}
