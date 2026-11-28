package com.vsos.backend.security;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;

/** Stores only token digests, and keeps revocations across Redis or application restarts. */
@Repository
@RequiredArgsConstructor
public class TokenRevocationStore {
    private final JdbcTemplate jdbc;

    public boolean isRevoked(String token) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM auth_revoked_tokens WHERE token_hash = ?", Integer.class, hash(token));
        if (count == null) throw new IllegalStateException("Revocation lookup unavailable");
        return count > 0;
    }

    @Transactional
    public void revoke(String token, Instant expiresAt) {
        // Keep a grace period for small differences between application and database clocks.
        jdbc.update("DELETE FROM auth_revoked_tokens WHERE expires_at_epoch < ?", Instant.now().minusSeconds(86_400).getEpochSecond());
        jdbc.update("INSERT INTO auth_revoked_tokens (token_hash, expires_at_epoch) VALUES (?, ?) "
                + "ON DUPLICATE KEY UPDATE expires_at_epoch = VALUES(expires_at_epoch)", hash(token), expiresAt.getEpochSecond());
    }

    private static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
