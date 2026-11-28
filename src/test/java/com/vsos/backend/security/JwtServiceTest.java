package com.vsos.backend.security;

import com.vsos.backend.config.AuthProperties;
import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.entity.enums.RoleCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private static final String SECRET = "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";

    private JwtService jwt;

    @BeforeEach
    void setUp() {
        jwt = new JwtService(new AuthProperties(60, 600, 5, 60, 5, 10, 20, 10, 900, "auto", ""), org.mockito.Mockito.mock(TokenRevocationStore.class));
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
    void tokensIssuedInTheSameMomentHaveDifferentIdentities() {
        assertNotEquals(jwt.generateToken(user("hash-1", true)), jwt.generateToken(user("hash-1", true)));
    }

    @Test
    void legacyTokenWithoutIdCanStillBeRevoked() {
        var store = org.mockito.Mockito.mock(TokenRevocationStore.class);
        var service = new JwtService(new AuthProperties(60, 600, 5, 60, 5, 10, 20, 10, 900, "auto", ""), store);
        ReflectionTestUtils.setField(service, "secretKey", SECRET);
        long now = System.currentTimeMillis();
        String old = io.jsonwebtoken.Jwts.builder().subject("a@b.c").claim("type", "access")
                .claim("pwv", service.keyedDigest("pwv:hash-1", 16))
                .issuedAt(new java.util.Date(now)).expiration(new java.util.Date(now + 60_000))
                .signWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(io.jsonwebtoken.io.Decoders.BASE64.decode(SECRET))).compact();
        assertTrue(service.isTokenValid(old, user("hash-1", true)));
        org.mockito.Mockito.when(store.isRevoked(old)).thenReturn(true);
        assertFalse(service.isTokenValid(old, user("hash-1", true)));
    }

    @Test
    void revokedTokenIsRejectedAndStorageFailureFailsClosed() {
        var store = org.mockito.Mockito.mock(TokenRevocationStore.class);
        var service = new JwtService(new AuthProperties(60, 600, 5, 60, 5, 10, 20, 10, 900, "auto", ""), store);
        ReflectionTestUtils.setField(service, "secretKey", SECRET);
        String token = service.generateToken(user("hash-1", true));
        org.mockito.Mockito.when(store.isRevoked(token)).thenReturn(true).thenThrow(new IllegalStateException("DB unavailable"));
        assertFalse(service.isTokenValid(token, user("hash-1", true)));
        assertThrows(IllegalStateException.class, () -> service.isTokenValid(token, user("hash-1", true)));
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
    void authVersionChangeInvalidatesTokensEvenAfterAccountIsUnlocked() {
        var principal = user("hash-1", true);
        String old = jwt.generateToken(principal);
        principal.getUser().setAuthVersion(2L);
        assertFalse(jwt.isTokenValid(old, principal));
        assertTrue(jwt.isTokenValid(jwt.generateToken(principal), principal));
    }

    @Test
    void expiredTokensAreRejected() {
        var expired = new JwtService(new AuthProperties(-1, 600, 5, 60, 5, 10, 20, 10, 900, "auto", ""), org.mockito.Mockito.mock(TokenRevocationStore.class));
        ReflectionTestUtils.setField(expired, "secretKey", SECRET);
        String token = expired.generateToken(user("hash-1", true));
        assertThrows(io.jsonwebtoken.ExpiredJwtException.class, () -> jwt.isTokenValid(token, user("hash-1", true)));
    }

    @Test
    void productionRefusesTheBuiltInSecret() {
        ReflectionTestUtils.setField(jwt, "appEnv", "production");
        assertThrows(IllegalStateException.class, () -> ReflectionTestUtils.invokeMethod(jwt, "refuseDefaultSecretInProduction"));
    }
}
