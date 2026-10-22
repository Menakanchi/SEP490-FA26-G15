package com.vehicsim.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class LegacyAwarePasswordEncoderTest {

    /** Sinh bằng đúng thuật toán của backend Python: pbkdf2_hmac('sha256', 'secret123', salt=bytes(range(16)), 100000). */
    private static final String PYTHON_HASH =
            "000102030405060708090a0b0c0d0e0f:8ff257035f200f94a796c0cdf17d9a5eb7e149f4207b3561cd4b3ec3fdda8467";

    private final LegacyAwarePasswordEncoder encoder = new LegacyAwarePasswordEncoder();

    @Test
    void verifiesHashCreatedByPythonBackend() {
        assertTrue(encoder.matches("secret123", PYTHON_HASH));
        assertFalse(encoder.matches("secret124", PYTHON_HASH));
    }

    @Test
    void legacyHashIsFlaggedForUpgradeButBcryptIsNot() {
        assertTrue(encoder.upgradeEncoding(PYTHON_HASH));
        assertFalse(encoder.upgradeEncoding(encoder.encode("x")));
    }

    @Test
    void newHashesAreBcryptAndRoundTrip() {
        String hash = encoder.encode("matkhau123");
        assertTrue(hash.startsWith("$2"));
        assertTrue(encoder.matches("matkhau123", hash));
        assertFalse(encoder.matches("matkhau124", hash));
    }

    @Test
    void garbageHashesNeverMatchAndNeverThrow() {
        assertFalse(encoder.matches("x", null));
        assertFalse(encoder.matches("x", ""));
        assertFalse(encoder.matches("x", "not-a-hash"));
        assertFalse(encoder.matches("x", "zz:zz"));
    }
}
